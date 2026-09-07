// Worker regression: node scripts/check-worker.mjs (no GPU or dependencies).
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { MODEL as PRODUCTION, AUDIO } from '../model-config.js';
import { MODEL } from './models/kitten-config.js';
import { MODEL as CPU } from '../models/pocket-config.js';

const source = (await readFile(new URL('../speech-worker.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '')
  .replace('await import(new URL(MODEL.adapter, import.meta.url))', 'await loadAdapter()');
const adapterSource = (await readFile(new URL('../models/kitten.js', import.meta.url), 'utf8'))
  .replace(/^import .*;\n/gm, '').replace('export async function createModel', 'async function createModel');
function worker(waveform, tokenize = () => [0, 1, 0], options = {}) {
  const replies = [], loads = [], imports = [], inputs = [], events = {}, calls = [], stats = { initialized: 0, generated: 0 };
  let now = 0;
  const config = options.config || MODEL;
  const context = {
    MODEL: config, AUDIO, Float32Array, Uint8Array, DataView, Number, onmessage: null,
    performance: { now: () => now },
    console: { error() {} }, // Expected rejection cases should stay quiet.
    addEventListener(type, callback) { events[type] = callback; },
    postMessage(message, transfer = []) { replies.push({ message, transfer }); },
    textToInputIds: async text => { inputs.push(text); now += 5; return { ids: tokenize(text) }; },
    KittenTTSEngine: class {
      async init() { stats.initialized++; now += 20; }
      async loadModel(...urls) { loads.push(urls); now += 30; }
      async generate(...args) { calls.push(args); stats.generated++; now += 100; return { waveform }; }
    },
  };
  vm.createContext(context);
  vm.runInContext(adapterSource, context);
  context.loadAdapter = async () => {
    imports.push(config.adapter);
    if (options.importGate) await options.importGate;
    return { createModel: options.createModel || context.createModel };
  };
  vm.runInContext(source, context);
  return { replies, loads, imports, inputs, events, stats, calls,
    send: (id, options = {}) => context.onmessage({ data: { type: 'generate', id, text: 'Hello world.', modelId: config.id, ...options } }),
  };
}

const good = worker(new Float32Array([-2, -1, -0.5, 0, 0.5, 1, 2]));
for (const modelId of [undefined, 'a-model-from-an-older-open-tab']) {
  const stale = worker(new Float32Array([0, .5]));
  await stale.send(1, { modelId });
  assert.deepEqual(stale.imports, [], 'An old tab must not load different weights after a deployment.');
  assert.match(stale.replies.at(-1).message.message, /model has changed.*Reload/);
  assert(!stale.replies.some(reply => reply.message.type === 'audio'));
}
assert.equal(good.imports.length, 0, 'The runtime is not imported before a generation request.');
await good.send(7);
await good.send(8);
assert.deepEqual(good.stats, { initialized: 1, generated: 2 });
assert.deepEqual(good.imports, [MODEL.adapter], 'The selected adapter is loaded once per worker.');
const base = `https://huggingface.co/${MODEL.repository}/resolve/${MODEL.revision}/`;
assert.deepEqual(good.loads, [[
  base + MODEL.weightsFile, base + MODEL.voicesFile,
]]);
const audio = good.replies.filter(reply => reply.message.type === 'audio');
assert.deepEqual(audio.map(reply => reply.message.id), [7, 8]);
assert.deepEqual(good.calls.map(args => args[2]), [1, 1], 'Production requests retain normal synthesis.');
assert(good.calls.every(args => args[1] === MODEL.voice), 'The configured voice reaches the engine.');
assert(good.replies.some(reply => reply.message.message === `Loading ${MODEL.name} (${MODEL.downloadMB} MB)…`));
assert.deepEqual(audio.map(({ message: { metrics } }) => ({ ...metrics })), [
  { initMs: 50, generationMs: 105, totalMs: 155, audioSeconds: 7 / 24000, synthesisRate: 1 },
  { initMs: 0, generationMs: 105, totalMs: 105, audioSeconds: 7 / 24000, synthesisRate: 1 },
], 'Initialization is measured once; warm generation includes frontend work and contains no text.');
for (const { message, transfer } of audio) {
  assert.equal(message.modelId, MODEL.id, 'Returned PCM identifies the worker generation configuration.');
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
  assert.equal(bad.imports.length, 0);
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

const numbers = worker(new Float32Array([0, 0.5]));
await numbers.send(11, { text: 'We read 10,000 words & reached 26.5%.' });
assert.equal(numbers.inputs[0].replace(/\s+/g, ' ').trim(), 'We read ten thousand words and reached twenty six point five percent .');

// A different architecture can implement the boundary without invoking Kitten.
const replacements = [];
const replacement = worker(undefined, undefined, { createModel: async ({ config, status }) => {
  assert.equal(config, MODEL); status('Loading a replacement adapter…');
  return { async generate(text, rate) {
    replacements.push({ text, rate });
    return { samples: new Float32Array([-.5, .5]), ...AUDIO };
  } };
} });
await replacement.send(12, { text: 'Different architecture.', synthesisRate: 1.2 });
assert.deepEqual(replacements, [{ text: 'Different architecture.', rate: 1.2 }]);
assert.equal(replacement.stats.initialized, 0, 'Replacement adapters do not load Kitten.');
assert.equal(replacement.replies.at(-1).message.modelId, MODEL.id);
assert.equal(replacement.replies.at(-1).message.pcm.byteLength, 4);
for (const format of [{ sampleRate: 48000, channels: 1 }, { sampleRate: 24000, channels: 2 }]) {
  const invalid = worker(undefined, undefined, { createModel: async () => ({
    generate: async () => ({ samples: new Float32Array([0, .5]), ...format }),
  }) });
  await invalid.send(13);
  assert.equal(invalid.replies.at(-1).message.type, 'error');
  assert.match(invalid.replies.at(-1).message.message, /unsupported audio format/);
}

let releaseImport;
const delayed = worker(new Float32Array([0, .5]), undefined, {
  importGate: new Promise(resolve => { releaseImport = resolve; }),
});
const pending = delayed.send(14);
await delayed.send(15); // A competing request fails the worker during import.
releaseImport(); await pending;
assert.equal(delayed.stats.initialized, 0, 'A worker that failed during import must not start initialization.');
assert(!delayed.replies.some(reply => reply.message.type === 'audio'));
let generatedAfterFailure = 0;
const failedInit = worker(undefined, undefined, { createModel: async ({ fail }) => {
  fail('Initialization lost the GPU.');
  return { generate() { generatedAfterFailure++; throw new Error('Generation must not follow failed initialization.'); } };
} });
await failedInit.send(16);
assert.equal(generatedAfterFailure, 0);
assert.equal(failedInit.replies.filter(reply => reply.message.type === 'error').length, 1);
assert.equal(failedInit.replies.at(-1).message.message, 'Initialization lost the GPU.');
const failedFrontend = worker(new Float32Array([0, .5]), () => {
  failedFrontend.events['webgpu-device-lost']();
  return [0, 1, 0];
});
await failedFrontend.send(17);
assert.equal(failedFrontend.stats.generated, 0, 'GPU loss during asynchronous text preparation must not launch inference.');

// Optional CPU comparisons retain the same lazy, strict worker boundary.
const production = worker(undefined, undefined, { config: CPU, createModel: async ({ config, status }) => {
  assert.equal(config, CPU); status('Starting CPU…');
  return { generate: async (text, rate) => {
    assert.equal(text, 'Hello world.'); assert.equal(rate, 1);
    return { samples: new Float32Array([-.5, .5]), ...AUDIO };
  } };
} });
assert.equal(production.imports.length, 0);
await production.send(18);
assert.deepEqual(production.imports, [CPU.adapter]);
assert.equal(production.stats.initialized, 0, 'Optional CPU generation does not initialize the historical GPU engine.');
assert.equal(production.replies.at(-1).message.modelId, CPU.id);
assert.equal(production.replies.at(-1).message.pcm.byteLength, 4);
const invalidProductionRate = worker(undefined, undefined, { config: PRODUCTION });
await invalidProductionRate.send(19, { synthesisRate: 2 });
assert.equal(invalidProductionRate.imports.length, 0, 'Unsupported production rates cannot load any engine.');
assert.equal(invalidProductionRate.replies.at(-1).message.type, 'error');

const rootConfigSource = await readFile(new URL('../model-config.js', import.meta.url), 'utf8');
const configSource = rootConfigSource;
assert(!/^\s*import\b/m.test(rootConfigSource) && !/\bimport\s*\(/.test(rootConfigSource), 'UI metadata cannot load an inference runtime.');
assert(!/^\s*import\b/m.test(configSource) && !/\bimport\s*\(/.test(configSource), 'The reexported model configuration is metadata only.');
assert.deepEqual(AUDIO, { sampleRate: 24000, channels: 1 });
assert.equal(PRODUCTION.backend, 'webgpu');
assert.equal(PRODUCTION.voice, 'Bella');
assert.equal(PRODUCTION.id, MODEL.id, 'Restored production keeps the historical Kitten generation identity.');
assert.match(PRODUCTION.revision, /^[a-f0-9]{40}$/);
assert.deepEqual(PRODUCTION.synthesisRates, [1, 1.2, 1.5]);
for (const [from, to] of [[PRODUCTION.revision, '0'.repeat(40)], [PRODUCTION.voice, 'Another voice'],
  [PRODUCTION.adapter, PRODUCTION.adapter.replace('v=', 'v=next-')]]) {
  const changed = vm.runInNewContext(configSource.replaceAll('export const ', 'const ').replaceAll(from, to) + '\nMODEL;');
  assert.notEqual(changed.id, PRODUCTION.id, 'Weights, voice and adapter changes update generation identity.');
}
const relabelled = vm.runInNewContext(configSource.replaceAll('export const ', 'const ')
  .replace(`name: '${PRODUCTION.name}'`, "name: 'A clearer UI label'") + '\nMODEL;');
assert.equal(relabelled.id, PRODUCTION.id, 'UI-only labels do not invalidate saved generation.');
console.log('Worker passed: Kitten production and optional CPU adapters, configuration identity, canonical PCM, timings and failure races.');
