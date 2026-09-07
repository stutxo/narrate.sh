// Offline CPU equivalence checks; no model download, browser, or GPU required.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import original from './fixtures/kitten-source-excitation.mjs';
import { optimizeSourceExcitation } from './kitten-excitation.mjs';
import { KittenTTSEngine } from '../vendor/kitten/runtime.js';

// Compile the checked-in engine method too: this catches a stale or incorrect
// generated artifact, rather than testing only the patch helper against itself.
const method = KittenTTSEngine.prototype.generateSourceExcitation.toString()
  .replace(/^async generateSourceExcitation\(/, 'async function(');
const compile = source => new Function('Math', 'Float32Array', 'Float64Array', 'GPUBufferUsage', `return (${source});`);
const variants = {
  original: compile(`async function(f0ProjBuf, f0Length, stftLen) {${original}}`),
  patched: compile(`async function(f0ProjBuf, f0Length, stftLen) {${optimizeSourceExcitation(original)}}`),
  bundled: compile(method),
};
function random(seed) {
  let state = seed >>> 0, calls = 0;
  const math = Object.create(Math);
  math.random = () => { calls++; state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  return { math, state: () => [state, calls] };
}
function weightsFor(seed) {
  const rng = random(seed).math;
  return {
    linearWeight: Float32Array.from({ length: 9 }, () => (rng.random() - .5) * 5),
    linearBias: Float32Array.of((rng.random() - .5) * .5),
    fwdReal: Float32Array.from({ length: 220 }, (_, i) => Math.cos(2 * Math.PI * Math.floor(i / 20) * (i % 20) / 20)),
    fwdImag: Float32Array.from({ length: 220 }, (_, i) => Math.sin(2 * Math.PI * Math.floor(i / 20) * (i % 20) / 20)),
  };
}
function fixture(seconds, pattern, irregular = false) {
  const waveLen = Math.round(seconds * 24000 / 5) * 5;
  const f0Length = Math.max(1, Math.round(waveLen / 150) + (irregular ? 7 : 0));
  return { waveLen, stftLen: waveLen / 5 + 1,
    f0: Float32Array.from({ length: f0Length }, (_, i) => {
      if (pattern === 'voiced') return 210 + 40 * Math.sin(i / 13);
      if (pattern === 'unvoiced') return 0;
      if (pattern === 'threshold') return [-10, -0, 0, 9.999999, 10, 10.000001, 440, 20000][i % 8];
      return i % 29 < 7 ? 0 : 100 + (i % 53) * 3;
    }) };
}
async function run(name, input, weights, cold = false) {
  const rng = random(42), reads = [], allocations = [];
  const context = {
    sinGenWeights: cold ? null : weights,
    async readBuffer(buffer) { reads.push(buffer); return buffer; },
    requireWeight(key) {
      return { buffer: key === 'onnx::MatMul_6388' ? weights.linearWeight
        : key.endsWith('l_linear.bias') ? weights.linearBias
          : key.endsWith('weight_forward_real') ? weights.fwdReal : weights.fwdImag };
    },
    createBuffer(value) { return value; },
  };
  const tracked = Type => function (size) {
    const array = new Type(size); allocations.push(array.byteLength); return array;
  };
  const execute = variants[name](rng.math, tracked(Float32Array), tracked(Float64Array), { STORAGE: 1, COPY_SRC: 2 });
  const output = await execute.call(context, input.f0, input.f0.length, input.stftLen);
  return { output, reads, random: rng.state(), allocatedBytes: allocations.reduce((a, b) => a + b, 0) };
}
const bits = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);

test('patched and bundled source excitation match the pinned original bit for bit', async () => {
  for (const seconds of [.00021, .0125, .1, .5, 2]) for (const pattern of ['voiced', 'unvoiced', 'mixed', 'threshold']) {
    for (const seed of [1, 91]) for (const cold of [false, true]) {
      const input = fixture(seconds, pattern, cold), weights = weightsFor(seed);
      const reference = await run('original', input, weights, cold);
      for (const name of ['patched', 'bundled']) {
        const actual = await run(name, input, weights, cold);
        assert.deepEqual(bits(actual.output), bits(reference.output), `${name}: ${seconds}s ${pattern}, seed ${seed}, cold ${cold}`);
        assert.deepEqual(actual.random, reference.random, 'Random values are consumed in the original order.');
        assert.deepEqual(actual.reads, reference.reads, 'Cold and cached GPU reads retain their order.');
      }
    }
  }
  for (const bias of [-0, 0, -1e-30, 1e-30]) {
    const weights = weightsFor(3); weights.linearBias[0] = bias;
    weights.linearWeight.set([0, -0, 1, -1, 2 ** -24, -(2 ** -24), 1e-20, -1e-20, 0]);
    const input = fixture(.1, 'threshold', true), reference = await run('original', input, weights);
    for (const name of ['patched', 'bundled']) assert.deepEqual(bits((await run(name, input, weights)).output), bits(reference.output));
  }
});

test('scratch allocations fall by exactly 28 bytes per waveform sample', async () => {
  for (const seconds of [2, 8, 16]) {
    const input = fixture(seconds, 'mixed'), weights = weightsFor(1), reference = await run('original', input, weights);
    for (const name of ['patched', 'bundled']) {
      const actual = await run(name, input, weights);
      assert.deepEqual(bits(actual.output), bits(reference.output));
      assert.equal(reference.allocatedBytes - actual.allocatedBytes, 28 * input.waveLen);
    }
  }
  assert.throws(() => optimizeSourceExcitation(original.replace('waveLen * NUM_HARMONICS', 'waveLen * 10')),
    /no longer matches/, 'An upstream source mismatch must fail instead of silently skipping the patch.');
});
