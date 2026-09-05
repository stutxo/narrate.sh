// Worker regression: node scripts/check-worker.mjs (no GPU or dependencies).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../speech-worker.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/, '');
function worker(waveform) {
  const replies = [], loads = [], events = {}, stats = { initialized: 0, generated: 0 };
  const context = {
    Float32Array, Uint8Array, DataView, Number, onmessage: null,
    console: { error() {} }, // Expected rejection cases should stay quiet.
    addEventListener(type, callback) { events[type] = callback; },
    postMessage(message, transfer = []) { replies.push({ message, transfer }); },
    textToInputIds: async () => ({ ids: [0, 1, 0] }),
    KittenTTSEngine: class {
      async init() { stats.initialized++; }
      async loadModel(...urls) { loads.push(urls); }
      async generate() { stats.generated++; return { waveform }; }
    },
  };
  vm.createContext(context);
  vm.runInContext(source, context);
  return { replies, loads, events, stats,
    send: id => context.onmessage({ data: { type: 'generate', id, text: 'Hello world.' } }),
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
console.log('Worker passed: Micro loading/reuse, PCM16 bytes/transfers, invalid audio and GPU failure handling.');
