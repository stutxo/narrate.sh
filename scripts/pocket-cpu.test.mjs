import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { MODEL } from '../models/pocket-config.js';

const source = (await readFile(new URL('../models/pocket.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]+?;\n/, '').replace('export async function createModel', 'async function createModel');

function fixture({ wasm = true, f16 = true, initialized = true, eos = 2,
  invalidFrame = false, cacheError, wrongSize = false, cancel = false, tokenCount } = {}) {
  const events = [], disposed = [], saved = new Map();
  let frame = 0, failure, prompt;
  class Tensor {
    constructor(kind = 'array') { this.kind = kind; }
    get ref() { return this; }
    reshape() { return new Tensor('latent'); }
    slice() { return new Tensor(this.kind); }
    astype() { return this; }
    mul() { return new Tensor('scaled'); }
    add() { return this; }
    dispose() { disposed.push(this); }
    async data() {
      if (this.kind === 'eos') return Uint8Array.of(frame++ === eos);
      const samples = new Float32Array(1920).fill(.2);
      if (invalidFrame) samples[0] = NaN;
      if (cancel) failure = 'Generation cancelled';
      return samples;
    }
  }
  class Response {
    constructor(data) { this.bytes = data; this.ok = true; }
    async arrayBuffer() { return this.bytes; }
  }
  const cache = {
    async match(url) { if (cacheError === 'read') throw new Error('Storage blocked'); return saved.get(url); },
    async put(url, response) {
      events.push({ type: 'cache-write', url });
      if (cacheError === 'write') throw new Error('Quota exceeded');
      saved.set(url, response);
    },
    async delete(url) { events.push({ type: 'cache-delete', url }); saved.delete(url); },
  };
  const model = { flowLM: { conditionerEmbed: new Tensor(), bosEmb: new Tensor(), embStd: new Tensor(), embMean: new Tensor() }, mimi: {} };
  const context = vm.createContext({ Float32Array, Float16Array: f16 ? Float32Array : undefined,
    WebAssembly: wasm ? {} : undefined, Uint8Array, Math, Response,
    navigator: { get gpu() { throw new Error('CPU adapter accessed navigator.gpu'); } },
    async init(...devices) { events.push({ type: 'init', devices }); return initialized ? ['cpu', 'wasm'] : ['cpu']; },
    defaultDevice(device) { events.push({ type: 'device', device }); },
    caches: { async open() { if (cacheError === 'open') throw new Error('Private mode'); return cache; } },
    async fetch(url) {
      events.push({ type: 'download', url });
      const byteLength = wrongSize ? 3 : url.endsWith(MODEL.weightsFile) ? MODEL.weightsBytes : url.endsWith(MODEL.voicesFile) ? 512088 : 59339;
      return new Response({ byteLength });
    },
    safetensors: { parse: () => ({ tensors: { audio_prompt: { data: [0], shape: [1, 1, 1] } } }) },
    tokenizers: { SentencePiece: { fromBinary: bytes => {
      assert(bytes instanceof Uint8Array);
      return { encode(text) {
        prompt = text; events.push({ type: 'prompt', text });
        return new Array(tokenCount?.(text) ?? 3).fill(1);
      } };
    } } },
    fromSafetensors: (weights, dtype) => { events.push({ type: 'weights', dtype }); return model; },
    np: { float32: 'f32', uint32: 'u32', array: () => new Tensor(), concatenate: () => new Tensor('embeds'), clip: audio => audio },
    random: { key(seed) { frame = 0; events.push({ type: 'seed', seed, prompt }); return new Tensor('key'); }, split: () => [new Tensor('key'), new Tensor('step-key')] },
    tree: { ref: value => value, dispose: values => { disposed.push(...values); } },
    createFlowLMState: () => ({ kind: 'flow-state', kvCacheLen: 0 }),
    createMimiDecodeState: () => ({ kind: 'mimi-state' }),
    runFlowLMStep() { events.push({ type: 'flow' }); return { latent: new Tensor('latent'),
      isEos: new Tensor('eos'), state: { kind: 'flow-state', kvCacheLen: frame } }; },
    runMimiDecode() { events.push({ type: 'decode' }); return [new Tensor('pcm'), { kind: 'mimi-state' }]; },
  });
  vm.runInContext(source, context);
  return { events, disposed, saved, Response,
    create: (config = MODEL) => context.createModel({ config, status() {}, check() { if (failure) throw new Error(failure); } }) };
}

test('Pocket CPU starts without WebGPU and requires only the explicit WASM configuration', async () => {
  const f = fixture();
  await f.create();
  assert.deepEqual(f.events.filter(event => event.type === 'init').map(event => [...event.devices]), [['wasm']]);
  assert.equal(f.events.find(event => event.type === 'device').device, 'wasm');
  assert.equal(f.events.find(event => event.type === 'weights').dtype, 'f32');
  assert(MODEL.id.includes('wasm') && MODEL.id.includes('float32'));
  for (const options of [{ wasm: false }, { f16: false }, { initialized: false }]) {
    const missing = fixture(options);
    await assert.rejects(missing.create(), /WebAssembly|Float16Array/);
    assert.equal(missing.events.filter(event => event.type === 'download').length, 0);
  }
  await assert.rejects(f.create({ ...MODEL, backend: 'webgpu' }), /CPU model configuration/);
});

test('Pocket CPU reuses model state, preserves EOS tails and caches immutable assets across workers', async () => {
  const f = fixture(), model = await f.create();
  for (let run = 0; run < 2; run++) {
    const audio = await model.generate('Hello world.', 1);
    assert.equal(audio.sampleRate, 24000); assert.equal(audio.channels, 1);
    assert(audio.samples instanceof Float32Array);
    assert.equal(audio.samples.length, (2 + 5) * 1920, 'short prompts retain five frames after EOS');
    assert(audio.samples.every(sample => sample === Math.fround(.2)));
  }
  await f.create();
  const downloads = f.events.filter(event => event.type === 'download');
  assert.equal(downloads.length, 3, 'a fresh adapter reloads all three assets from persistent cache');
  assert(downloads.every(event => event.url.includes(MODEL.revision) || event.url.includes(MODEL.voiceRevision)));
  assert(f.events.findIndex(event => event.type === 'cache-write') < f.events.findIndex(event => event.type === 'weights'), 'finish caching before FP32 allocations');
  assert.deepEqual(f.events.filter(event => event.type === 'seed').map(event => event.seed), [42, 42]);
  assert.equal(f.disposed.filter(value => value.kind === 'flow-state').length, 2);
  assert.equal(f.disposed.filter(value => value.kind === 'mimi-state').length, 2);
});

test('Pocket CPU continues after cache failures and repairs corrupt cached assets', async () => {
  for (const cacheError of ['open', 'read', 'write']) {
    const f = fixture({ cacheError }), model = await f.create();
    assert((await model.generate('Hello world.')).samples.length > 0);
  }
  const f = fixture();
  const url = `https://huggingface.co/${MODEL.repository}/resolve/${MODEL.revision}/${MODEL.weightsFile}`;
  f.saved.set(url, new f.Response({ byteLength: 1 }));
  await f.create();
  assert.equal(f.events.filter(event => event.type === 'cache-delete').length, 1);
  assert.equal((await f.saved.get(url).arrayBuffer()).byteLength, MODEL.weightsBytes);
  const invalid = fixture({ wrongSize: true });
  await assert.rejects(invalid.create(), /wrong size/);
  assert.equal(invalid.saved.size, 0, 'invalid downloads are never cached');
});

test('Pocket CPU splits token-heavy passages without dropping words and handles punctuation silently', async () => {
  const f = fixture({ tokenCount: text => text.trim().split(/\s+/).length });
  const model = await f.create({ ...MODEL, tokenLimit: 4 });
  const audio = await model.generate('one two three four five six seven eight');
  const spoken = f.events.filter(event => event.type === 'seed').map(event => event.prompt.trim().replaceAll('.', '').toLowerCase()).join(' ');
  assert.equal(spoken, 'one two three four five six seven eight');
  assert(audio.samples.length > 0);
  const before = f.events.filter(event => event.type === 'flow').length;
  assert.equal((await model.generate('...')).samples.length, 2400);
  await assert.rejects(model.generate('Wrong rate', 1.5), /natural 1×/);
  await assert.rejects(model.generate('   '), /Add some text/);
  assert.equal(f.events.filter(event => event.type === 'flow').length, before);
});

test('Pocket CPU never returns partial audio after invalid PCM, cancellation or missing EOS', async () => {
  for (const [options, error] of [[{ invalidFrame: true }, /invalid audio/],
    [{ cancel: true }, /Generation cancelled/], [{ eos: Infinity }, /did not finish/]]) {
    const f = fixture(options), model = await f.create();
    await assert.rejects(model.generate('Read this.'), error);
    assert.equal(f.events.filter(event => event.type === 'init').length, 1, 'no fallback or retry');
    assert(f.disposed.some(value => value.kind === 'flow-state'));
    assert(f.disposed.some(value => value.kind === 'mimi-state'));
  }
});
