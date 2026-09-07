import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import { MODEL } from './models/inflect-config.js';

const source = (await readFile(new URL('./models/inflect.js', import.meta.url), 'utf8'))
  .replace(/^import .+;\n/gm, '').replace('export async function createModel', 'async function createModel')
  .replaceAll('import.meta.url', JSON.stringify(new URL('./models/inflect.js', import.meta.url).href));

function fixture({ gpu = true, rejectSession = 0, cancelAfterDownload = false } = {}) {
  const events = [], tensors = [];
  let created = 0, cancelled = false;
  class Tensor {
    constructor(type, data, dims) { Object.assign(this, { type, data, dims }); tensors.push(this); }
    dispose() { this.disposed = true; }
  }
  const ort = { env: { wasm: {}, webgpu: {} }, Tensor, InferenceSession: {
    async create(bytes, options) {
      const index = ++created;
      events.push({ type: 'session', options });
      if (index === rejectSession) throw new Error('Unsupported GPU operation');
      return { async release() { events.push({ type: 'release', index }); }, async run(inputs) {
        events.push({ type: 'run', index, inputs });
        return index === 1 ? {
          m_p_exp: new Tensor('float32', Float32Array.of(.1, .2), [1, 1, 2]),
          logs_p_exp: new Tensor('float32', Float32Array.of(-1, -1), [1, 1, 2]),
          y_mask: new Tensor('float32', Float32Array.of(1, 1), [1, 1, 2]),
        } : { waveform: new Tensor('float32', Float32Array.of(0, .25, -.25, 0), [1, 1, 4]) };
      } };
    },
  } };
  const context = vm.createContext({ ort, URL, Float32Array, BigInt64Array,
    navigator: { gpu: gpu ? { requestAdapter: async () => ({}) } : null },
    async fetch(url) { events.push({ type: 'download', url }); cancelled = cancelAfterDownload; return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; },
    async textToPhonemes(text) { events.push({ type: 'text', text }); return text; },
    cleanedTextToSequence: () => [12, 23], randnFloat32Array: (seed, length) => { events.push({ type: 'seed', seed }); return new Float32Array(length); },
    splitText: text => text ? text.split('|') : [], boundaryPauseSeconds: () => .1, edgeFade: samples => samples,
  });
  vm.runInContext(source, context);
  return { events, tensors, ort, create: () => context.createModel({ config: MODEL, status() {}, fail() {}, check() { if (cancelled) throw new Error('cancelled'); } }) };
}

test('Inflect requires WebGPU before fetching weights and never retries a GPU failure on CPU', async () => {
  const unsupported = fixture({ gpu: false });
  await assert.rejects(unsupported.create(), /working WebGPU/);
  assert.equal(unsupported.events.length, 0);
  const rejected = fixture({ rejectSession: 2 });
  await assert.rejects(rejected.create(), /WebGPU.*Unsupported GPU operation/);
  const sessions = rejected.events.filter(event => event.type === 'session');
  assert.equal(sessions.length, 2);
  for (const { options } of sessions) {
    assert.equal(JSON.stringify(options.executionProviders), '["webgpu"]');
  }
  assert.equal(rejected.events.filter(event => event.type === 'release').length, 1);
});

test('Inflect uses pinned graph feeds, canonical output, speed and per-chunk seeded noise; disposes tensors', async () => {
  const f = fixture(), model = await f.create();
  assert.equal(f.ort.env.logLevel, 'error');
  const audio = await model.generate('First.|Second.', 1.2);
  assert.equal(audio.sampleRate, 24000);
  assert.equal(audio.channels, 1);
  assert(audio.samples instanceof Float32Array);
  assert.equal(audio.samples.length, 8 + 2400);
  const runs = f.events.filter(event => event.type === 'run');
  assert.deepEqual(runs.map(event => event.index), [1, 2, 1, 2]);
  assert.deepEqual([...runs[0].inputs.tokens.data], [0n, 12n, 0n, 23n, 0n]);
  assert.equal(runs[0].inputs.length_scale.data[0], Math.fround(1 / 1.2));
  assert.deepEqual(Object.keys(runs[1].inputs).sort(), ['logs_p_exp', 'm_p_exp', 'noise_scale', 'y_mask', 'zp_noise']);
  assert.deepEqual(f.events.filter(event => event.type === 'seed').map(event => event.seed), [7, 8]);
  assert(f.tensors.every(tensor => tensor.disposed));
  assert(f.events.filter(event => event.type === 'download').every(event => event.url.includes(MODEL.revision)));
  assert(MODEL.id.includes(MODEL.runtime) && MODEL.id.includes(MODEL.frontend));
  await assert.rejects(model.generate('Unsupported', 2), /Unsupported Inflect/);
  await model.generate('Default');
  assert.equal(f.events.filter(event => event.type === 'run').at(-2).inputs.length_scale.data[0], 1);
  assert.equal(f.events.filter(event => event.type === 'session').length, 2, 'sessions are reused');
});

test('Inflect honors cancellation after download before allocating a GPU session', async () => {
  const f = fixture({ cancelAfterDownload: true });
  await assert.rejects(f.create(), /cancelled/);
  assert.equal(f.events.filter(event => event.type === 'session').length, 0);
});

test('the shipped eSpeak frontend preserves every clause and expands money/ordinals', async () => {
  const { textToPhonemes, cleanedTextToSequence } = await import('../vendor/inflect/frontend.js');
  const phones = await textToPhonemes('We paid $12.50 on June 3rd. Is that right?');
  assert.equal((phones.match(/\./g) || []).length, 1);
  assert(phones.endsWith('?'));
  assert(!/[\d$]/.test(phones));
  assert(phones.includes('twˈɛlv') && phones.includes('θˈɜːd'));
  assert(cleanedTextToSequence(phones).length > 60, 'the second clause must be retained');
});
