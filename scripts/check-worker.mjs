// Worker regression: node scripts/check-worker.mjs (no GPU or dependencies).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../speech-worker.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/, '');
function worker(waveform, tokenize = () => [0, 1, 0]) {
  const replies = [], loads = [], events = {}, calls = [], stats = { initialized: 0, generated: 0 };
  let now = 0;
  const context = {
    Float32Array, Uint8Array, DataView, Number, onmessage: null,
    performance: { now: () => now },
    console: { error() {} }, // Expected rejection cases should stay quiet.
    addEventListener(type, callback) { events[type] = callback; },
    postMessage(message, transfer = []) { replies.push({ message, transfer }); },
    textToInputIds: async text => { now += 5; return { ids: tokenize(text) }; },
    KittenTTSEngine: class {
      async init() { stats.initialized++; now += 20; }
      async loadModel(...urls) { loads.push(urls); now += 30; }
      async generate(...args) { calls.push(args); stats.generated++; now += 100; return { waveform }; }
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { replies, loads, events, stats, calls,
    send: (id, options = {}) => context.onmessage({ data: { type: 'generate', id, text: 'Hello world.', ...options } }),
  };
}

const good = worker(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]));
await good.send(7);
await good.send(8);
assert.deepEqual(good.stats, { initialized: 1, generated: 2 });
assert.deepEqual(good.loads, [[
  'https://huggingface.co/KittenML/kitten-tts-micro-0.8/resolve/1ccf72b2c2048fd17efac7de2fab32d10e225084/kitten_tts_micro_v0_8.onnx',
  'https://huggingface.co/KittenML/kitten-tts-micro-0.8/resolve/1ccf72b2c2048fd17efac7de2fab32d10e225084/voices.npz',
]]);
const audio = good.replies.filter(reply => reply.message.type === 'audio');
assert.deepEqual(audio.map(reply => reply.message.id), [7, 8]);
assert.deepEqual(good.calls.map(args => args[2]), [1, 1], 'Production requests retain normal synthesis.');
assert.deepEqual(audio.map(({ message: { metrics } }) => ({ ...metrics })), [
  { initMs: 50, generationMs: 105, totalMs: 155, audioSeconds: 7 / 24000, synthesisRate: 1 },
  { initMs: 0, generationMs: 105, totalMs: 105, audioSeconds: 7 / 24000, synthesisRate: 1 },
], 'Initialization is measured once; warm generation includes frontend work and contains no text.');
for (const { message, transfer } of audio) {
  assert.equal(message.sampleRate, 24000);
  assert(message.pcm instanceof Uint8Array);
  assert.equal(message.pcm.byteLength, 14);
  assert.equal(message.samples, undefined);
  const view = new DataView(message.pcm.buffer);
  assert.deepEqual(Array.from({ length: 7 }, (_, i) => view.getInt16(i * 2, true)),
    [-32768, -32768, -16384, 0, 16384, 32767, 32767]);
  assert.deepEqual([...message.pcm.slice(0, 2)], [0, 128]);
  assert.equal(transfer.length, 1);
  assert.equal(transfer[0], message.pcm.buffer);
}
for (const synthesisRate of [1, 1.2, 1.5]) {
  const split = worker(new Float32Array([0, 0.5]), text => new Array(text.length > 8 ? 511 : 3).fill(0));
  await split.send(9, { text: 'One two three four.', synthesisRate });
  assert(split.calls.length > 1, 'Exercise actual recursive context splitting.');
  assert(split.calls.every(args => args[2] === synthesisRate), 'Every half retains the selected rate.');
  const result = split.replies.find(reply => reply.message.type === 'audio').message;
  assert.equal(result.pcm.byteLength, split.calls.length * 4, 'All synthesized halves are retained.');
  assert.equal(result.metrics.synthesisRate, synthesisRate);
  assert.equal(result.metrics.audioSeconds, split.calls.length * 2 / 24000);
  assert(result.metrics.generationMs > split.calls.length * 100);
}
for (const synthesisRate of [0, 2, 1.1, '1.2', null, NaN, Infinity]) {
  const bad = worker(new Float32Array([0, 0.5]));
  await bad.send(10, { synthesisRate });
  assert.equal(bad.stats.initialized, 0, 'Invalid rates must not load the model.');
  assert.equal(bad.replies.at(-1).message.type, 'error');
  assert.equal(bad.replies.at(-1).message.id, 10);
}
for (const waveform of [undefined, new Float32Array(), new Float32Array([NaN]), new Float32Array([Infinity])]) {
  const bad = worker(waveform);
  await bad.send(7);
  assert(!bad.replies.some(reply => reply.message.type === 'audio'));
  const errors = bad.replies.filter(reply => reply.message.type === 'error');
  assert.equal(errors.length, 1);
  assert.equal(errors[0].message.id, 7);
  assert(errors[0].message.message);
}
for (const event of ['webgpu-device-lost', 'webgpu-error']) {
  const lost = worker(new Float32Array([0, 0.5]));
  await lost.send(7);
  lost.events[event]({ detail: 'Device interrupted.' });
  await lost.send(8);
  assert.equal(lost.replies.at(-1).message.type, 'error');
  assert.equal(lost.replies.at(-1).message.id, 8);
  assert.equal(lost.stats.generated, 1);
}
console.log('Worker passed: Micro reuse, synthesis rate validation/recursive propagation, phase timings, PCM16 and GPU failures.');
