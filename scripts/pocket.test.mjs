import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { MODEL, MODEL_FP32 } from './models/pocket-config.js';

const source = (await readFile(new URL('./models/pocket.js', import.meta.url), 'utf8'))
  .replace(/^import[\s\S]+?;\n/, '').replace('export async function createModel', 'async function createModel');

function fixture({ gpu = true, initialized = true, f16 = true, eos = 2, invalidFrame = false, gpuError = false } = {}) {
  const events = [], disposed = [], listeners = {};
  let frame = 0, failure, tokenCount = 3;
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
      if (gpuError) listeners.uncapturederror({ error: { message: 'Device evaluation failed' } });
      return samples;
    }
  }
  const model = { flowLM: { conditionerEmbed: new Tensor(), bosEmb: new Tensor(), embStd: new Tensor(), embMean: new Tensor() }, mimi: {} };
  const context = vm.createContext({ Float32Array, Float16Array: Float32Array, Uint8Array, Math,
    navigator: { gpu: gpu ? {} : undefined },
    async init(...devices) { events.push({ type: 'init', devices }); return initialized ? ['wasm', 'webgpu'] : ['wasm']; },
    defaultDevice(device) { events.push({ type: 'device', device }); },
    getWebGPUDevice() { return { features: new Set(f16 ? ['shader-f16'] : []), lost: new Promise(() => {}),
      addEventListener(name, listener) { listeners[name] = listener; } }; },
    async fetch(url) {
      events.push({ type: 'download', url });
      const byteLength = url.endsWith(MODEL.weightsFile) ? MODEL.weightsBytes : url.endsWith(MODEL.voicesFile) ? 512088 : 59339;
      return { ok: true, arrayBuffer: async () => ({ byteLength }) };
    },
    safetensors: { parse: () => ({ tensors: { audio_prompt: { data: Float32Array.of(.1), shape: [1, 1, 1] } } }) },
    tokenizers: { SentencePiece: { fromBinary: bytes => {
      assert(bytes instanceof Uint8Array, 'SentencePiece accepts a byte view, not an ArrayBuffer');
      return { encode(text) { events.push({ type: 'prompt', text }); return new Array(tokenCount).fill(1); } };
    } } },
    fromSafetensors: (weights, dtype) => { events.push({ type: 'weights', dtype }); return model; },
    np: { float16: 'f16', float32: 'f32', uint32: 'u32', array: () => new Tensor(),
      concatenate: () => new Tensor('embeds'), clip: audio => audio },
    random: { key(seed) { frame = 0; events.push({ type: 'seed', seed }); return new Tensor('key'); }, split: () => [new Tensor('key'), new Tensor('step-key')] },
    tree: { ref: value => value, dispose: values => { disposed.push(...values); } },
    createFlowLMState: () => ({ kind: 'flow-state', kvCacheLen: 0 }),
    createMimiDecodeState: () => ({ kind: 'mimi-state' }),
    runFlowLMStep() { events.push({ type: 'flow' }); return { latent: new Tensor('latent'),
      isEos: new Tensor('eos'), state: { kind: 'flow-state', kvCacheLen: frame } }; },
    runMimiDecode() { events.push({ type: 'decode' }); return [new Tensor('pcm'), { kind: 'mimi-state' }]; },
  });
  vm.runInContext(source, context);
  return { events, disposed, setTokenCount(value) { tokenCount = value; },
    create: (config = MODEL) => context.createModel({ config, status() {}, fail(message) { failure = message; },
      check() { if (failure) throw new Error(failure); } }) };
}

test('Pocket fails before downloads when WebGPU or FP16 is unavailable, without selecting a CPU backend', async () => {
  for (const options of [{ gpu: false }, { initialized: false }, { f16: false }]) {
    const f = fixture(options);
    await assert.rejects(f.create(), /WebGPU|shader-f16/);
    assert.equal(f.events.filter(event => event.type === 'download').length, 0);
    assert(f.events.filter(event => event.type === 'device').every(event => event.device === 'webgpu'));
    assert(f.events.filter(event => event.type === 'init').every(event => JSON.stringify(event.devices) === '["webgpu"]'));
  }
  const explicit = fixture({ f16: false });
  await explicit.create(MODEL_FP32);
  assert.equal(explicit.events.find(event => event.type === 'weights').dtype, 'f32');
  assert.equal(explicit.events.find(event => event.type === 'device').device, 'webgpu');
  assert.notEqual(MODEL.id, MODEL_FP32.id);
  assert(MODEL.id.includes('float16') && MODEL_FP32.id.includes('float32'));
});

test('Pocket keeps EOS tail audio, reuses pinned assets and rejects unsupported comparison requests', async () => {
  const f = fixture(), model = await f.create();
  for (let run = 0; run < 2; run++) {
    const audio = await model.generate('Hello world.', 1);
    assert.equal(audio.sampleRate, 24000); assert.equal(audio.channels, 1);
    assert(audio.samples instanceof Float32Array);
    assert.equal(audio.samples.length, (2 + 5) * 1920, 'short prompts retain five frames after EOS');
    assert(audio.samples.every(sample => sample === Math.fround(.2)));
  }
  const downloads = f.events.filter(event => event.type === 'download');
  assert.equal(downloads.length, 3, 'weights, voice and tokenizer load once');
  assert(downloads.every(event => event.url.includes(MODEL.revision) || event.url.includes(MODEL.voiceRevision)));
  assert.deepEqual(f.events.filter(event => event.type === 'seed').map(event => event.seed), [42, 42]);
  assert.equal(f.disposed.filter(value => value.kind === 'flow-state').length, 2);
  assert.equal(f.disposed.filter(value => value.kind === 'mimi-state').length, 2);
  const before = f.events.filter(event => event.type === 'flow').length;
  await assert.rejects(model.generate('Wrong rate', 1.5), /natural 1×/);
  f.setTokenCount(257);
  await assert.rejects(model.generate('Too many tokens'), /shorter comparison/);
  assert.equal(f.events.filter(event => event.type === 'flow').length, before);
});

test('Pocket never returns partial success after invalid PCM, GPU failure or a missing EOS', async () => {
  for (const [options, error] of [[{ invalidFrame: true }, /invalid audio/],
    [{ gpuError: true }, /Device evaluation failed/], [{ eos: Infinity }, /did not finish/]]) {
    const f = fixture(options), model = await f.create();
    await assert.rejects(model.generate('Read this.'), error);
    assert.equal(f.events.filter(event => event.type === 'init').length, 1, 'no backend fallback or retry');
    assert(f.disposed.some(value => value.kind === 'flow-state'));
    assert(f.disposed.some(value => value.kind === 'mimi-state'));
  }
});
