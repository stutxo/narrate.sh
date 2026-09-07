import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startBrowser } from './app-fixtures.mjs';
import { CANDIDATES } from './compare-config.js';

let environment;
before(async () => { environment = await startBrowser(); });
after(async () => { await environment?.close(); });

// Only model responses and device policy are controlled. WAVs and playback stay native.
function installSpeech() {
  const state = window.__comparisonTest = { workers: [], requests: [], events: [], urls: new Set(),
    maximumLive: 0, failedKey: null, failAfter: 0, holdKey: null, holdAfter: 0, visibility: 'visible', locks: [] };
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state.visibility });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async () => {
    const lock = new EventTarget(); lock.released = false;
    lock.release = async () => { lock.released = true; lock.dispatchEvent(new Event('release')); };
    state.locks.push(lock);
    if (state.lateWake) await new Promise(resolve => { state.releaseWake = resolve; });
    return lock;
  } } });
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = blob => { const url = create(blob); state.urls.add(url); return url; };
  URL.revokeObjectURL = url => { state.urls.delete(url); revoke(url); };
  window.Worker = class {
    constructor(url) {
      this.key = new URL(url).searchParams.get('model'); this.calls = 0; this.dead = false;
      state.workers.push(this); state.maximumLive = Math.max(state.maximumLive, state.workers.filter(worker => !worker.dead).length);
      state.events.push(`start:${this.key}`);
    }
    postMessage(message) {
      this.calls++; state.requests.push({ ...message, key: this.key });
      if (state.holdKey === this.key && this.calls > state.holdAfter) return;
      queueMicrotask(() => {
        if (this.dead) return;
        this.onmessage?.({ data: { type: 'status', id: message.id, message: `SECRET MODEL NAME ${this.key}` } });
        if (state.failedKey === this.key && this.calls > state.failAfter) {
          this.onmessage?.({ data: { type: 'error', id: message.id, message: `Injected ${this.key} failure.` } }); return;
        }
        const pcm = new Uint8Array(48000), view = new DataView(pcm.buffer);
        const amplitude = { kitten: 1000, inflect: 2000, pocket: 3000, 'pocket-cpu': 4000 }[this.key];
        for (let i = 0; i < 24000; i++) view.setInt16(i * 2, Math.round(Math.sin(i * 2 * Math.PI * 220 / 24000) * amplitude), true);
        const initMs = this.calls === 1 ? 200 : 0;
        this.onmessage?.({ data: { type: 'audio', id: message.id, modelId: message.modelId, pcm, sampleRate: 24000,
          metrics: { initMs, generationMs: 100, totalMs: initMs + 110, audioSeconds: 1, synthesisRate: 1 } } });
      });
    }
    terminate() { this.dead = true; state.events.push(`stop:${this.key}`); }
  };
}

async function openComparison(t) {
  const context = await environment.browser.newContext(); t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installSpeech);
  await page.goto(environment.url + '/scripts/compare-models.html');
  await page.waitForFunction(() => window.comparison);
  return { page, errors };
}
const quick = { models: ['kitten', 'inflect', 'pocket'], corpus: 'smoke', repeats: 1, seed: 42 };

test('model comparison blinds stable identities, releases sequential workers and plays native WAVs at 1×', { timeout: 15000 }, async t => {
  const { page, errors } = await openComparison(t);
  assert.match(await page.locator('#warning').textContent(), /iPhone.*crash/);
  assert.match(await page.locator('#cautions').textContent(), /237 MB.*shader-f16.*Float16Array/);
  assert.match(await page.locator('#cautions').textContent(), /older browser checkpoint/);
  assert.equal(await page.locator('#models input:checked').count(), 1);
  const report = await page.evaluate(options => {
    window.__seenCards = [];
    window.addEventListener('comparison-result', () => window.__seenCards.push(document.querySelectorAll('#results article').length));
    return window.comparison.run(options);
  }, { ...quick, repeats: 2 });
  assert.equal(report.results.length, 6); assert.equal(report.warmups.length, 3); assert.deepEqual(report.failures, []);
  assert.equal(report.targetRate, 1); assert.equal(report.backgrounded, false);
  assert.deepEqual(report.models.map(model => model.label).sort(), ['A', 'B', 'C']);
  for (const model of report.models) {
    assert.equal(model.id, CANDIDATES.find(candidate => candidate.key === model.key).id);
    assert(report.results.filter(row => row.label === model.label).every(row => row.modelId === model.id));
  }
  const observed = await page.evaluate(() => ({ cards: window.__seenCards, events: window.__comparisonTest.events,
    maximum: window.__comparisonTest.maximumLive, requests: window.__comparisonTest.requests,
    released: window.__comparisonTest.locks.every(lock => lock.released) }));
  assert(observed.cards.every(count => count === 0), 'Generation never exposes playable cards or their model order.');
  assert.equal(observed.maximum, 1); assert.equal(observed.requests.length, 9); assert(observed.released);
  assert.deepEqual(observed.events, report.models.flatMap(model => [`start:${model.key}`, `stop:${model.key}`]));
  assert(observed.requests.every(request => request.synthesisRate === 1));
  assert.equal(report.results.reduce((sum, row) => sum + row.initMs, 0), 0);
  assert.equal(report.warmups.reduce((sum, row) => sum + row.initMs, 0), 600);
  assert.equal(await page.locator('#details').isVisible(), false);
  assert.equal((await page.locator('#status').textContent()).includes('SECRET'), false);
  for (const model of report.models) assert.equal((await page.locator('#results').textContent()).includes(model.name), false);
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(audio => audio.readyState >= 2));
  const media = await page.locator('audio').evaluateAll(elements => elements.map(audio => ({ rate: audio.playbackRate,
    defaultRate: audio.defaultPlaybackRate, duration: audio.duration, controls: audio.controls, pitch: audio.preservesPitch })));
  assert(media.every(audio => audio.rate === 1 && audio.defaultRate === 1 && audio.duration === 1 && audio.controls && audio.pitch));
  for (const [index, row] of report.results.entries()) {
    const wav = Buffer.from(await page.evaluate(index => window.comparison.wavBase64(index), index), 'base64');
    assert.equal(wav.toString('ascii', 0, 4), 'RIFF'); assert.equal(wav.readUInt32LE(24), 24000); assert.equal(wav.length, 48044);
    const model = report.models.find(model => model.id === row.modelId);
    const amplitude = { kitten: 1000, inflect: 2000, pocket: 3000 }[model.key];
    assert.equal(Math.abs(wav.readInt16LE(44 + 300 * 2)), amplitude, 'Reordered exports preserve the actual audio behind each blinded label.');
  }
  await page.locator('audio').first().evaluate(audio => audio.play());
  await page.waitForFunction(() => document.querySelector('audio').currentTime > .1);
  await page.locator('#reveal').click(); assert.equal(await page.locator('#details').isVisible(), true);
  const again = await page.evaluate(options => window.comparison.run(options), quick);
  assert.deepEqual(again.models, report.models, 'The same seed keeps label identities stable.');
  assert.equal(await page.evaluate(() => window.__comparisonTest.urls.size), 3, 'Rerunning releases all previous audio URLs.');
  assert.equal(await page.locator('#details').isVisible(), false, 'Each comparison starts blinded.');
  assert.deepEqual(errors, []);
});

test('one failed model records its error and releases its worker while other models finish', { timeout: 10000 }, async t => {
  const { page, errors } = await openComparison(t);
  await page.evaluate(() => { window.__comparisonTest.failedKey = 'inflect'; });
  const report = await page.evaluate(options => window.comparison.run(options), quick);
  assert.deepEqual(report.failures, [{ modelKey: 'inflect', message: 'Injected inflect failure.' }]);
  assert.equal(report.results.length, 2); assert.equal(report.warmups.length, 2);
  assert(report.results.every(row => row.modelId !== report.models.find(model => model.key === 'inflect').id));
  assert(await page.evaluate(() => window.__comparisonTest.workers.every(worker => worker.dead)));
  assert.equal(await page.evaluate(() => window.__comparisonTest.maximumLive), 1);
  assert.equal(await page.locator('#fields').isDisabled(), false); assert.equal(await page.locator('#stop').isVisible(), false);
  assert.deepEqual(errors, []);
});

test('Stop rejects with partial recordings and releases late wake locks; backgrounding is recorded', { timeout: 10000 }, async t => {
  const { page, errors } = await openComparison(t);
  await page.evaluate(options => {
    const state = window.__comparisonTest; state.holdKey = 'kitten'; state.holdAfter = 2; state.lateWake = true;
    window.__outcome = null;
    window.comparison.run(options).then(() => { window.__outcome = 'success'; }, error => { window.__outcome = error.message; });
  }, { models: ['kitten'], corpus: 'smoke', repeats: 2, seed: 42 });
  await page.waitForFunction(() => window.__comparisonTest.requests.length === 3);
  assert.equal(await page.locator('#results audio').count(), 0, 'Partial results stay hidden while generation is active.');
  await page.evaluate(() => { window.__comparisonTest.visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
  await page.locator('#stop').click();
  await page.waitForFunction(() => window.__outcome !== null);
  assert.match(await page.evaluate(() => window.__outcome), /stopped/i);
  const partial = await page.evaluate(() => window.comparison.report);
  assert.equal(partial.results.length, 1); assert.match(partial.error, /stopped/i); assert.equal(partial.backgrounded, true);
  assert.equal(await page.locator('#results audio').count(), 1);
  await page.evaluate(() => window.__comparisonTest.releaseWake());
  await page.waitForFunction(() => window.__comparisonTest.locks.every(lock => lock.released));
  assert(await page.evaluate(() => window.__comparisonTest.workers.every(worker => worker.dead)));
  const recovered = await page.evaluate(options => {
    const state = window.__comparisonTest; state.holdKey = null; state.lateWake = false; state.visibility = 'visible';
    return window.comparison.run(options);
  }, { models: ['kitten'], corpus: 'smoke', seed: 42 });
  assert.equal(recovered.backgrounded, false); assert.equal(recovered.results.length, 1); assert.equal(recovered.error, undefined);
  assert.equal(await page.evaluate(() => window.__comparisonTest.urls.size), 1);
  assert.deepEqual(errors, []);
});

test('the actual comparison worker validates identity, rate and finite PCM through a lightweight adapter', { timeout: 10000 }, async t => {
  const context = await environment.browser.newContext(); t.after(() => context.close());
  await context.route('**/__comparison-worker', route => route.fulfill({ contentType: 'text/html', body: '<p>Worker boundary fixture</p>' }));
  await context.route('**/compare-config.js*', route => route.fulfill({ contentType: 'application/javascript',
    body: "export const CANDIDATES = [{key:'kitten',id:'fixture',adapter:'scripts/__comparison-adapter.js'}];" }));
  let adapterLoads = 0;
  await context.route('**/__comparison-adapter.js', route => {
    adapterLoads++;
    return route.fulfill({ contentType: 'application/javascript', body: `export async function createModel() {
      return { async generate(text) { await new Promise(resolve => setTimeout(resolve, 2));
        return { samples: text === 'nonfinite' ? new Float32Array([NaN]) : text === 'infinite' ? new Float32Array([Infinity]) : new Float32Array([-2,-.5,0,.5,2]), sampleRate:24000, channels:1 }; } };
    }` });
  });
  const page = await context.newPage(); await page.goto(environment.url + '/__comparison-worker');
  const request = options => page.evaluate(options => new Promise((resolve, reject) => {
    const worker = new Worker('/scripts/compare-worker.js?model=kitten', { type: 'module' });
    worker.onerror = event => { worker.terminate(); reject(new Error(event.message)); };
    worker.onmessage = ({ data }) => { if (data.type === 'status') return; worker.terminate();
      const view = data.pcm && new DataView(data.pcm.buffer, data.pcm.byteOffset, data.pcm.byteLength);
      resolve({ ...data, pcm: view ? Array.from({ length: view.byteLength / 2 }, (_, index) => view.getInt16(index * 2, true)) : undefined }); };
    worker.postMessage({ type: 'generate', id: 1, modelId: 'fixture', synthesisRate: 1, text: 'valid', ...options });
  }), options);
  assert.match((await request({ modelId: 'wrong' })).message, /model has changed/);
  assert.match((await request({ synthesisRate: 1.5 })).message, /natural 1×/);
  assert.equal(adapterLoads, 0, 'Invalid requests fail before loading any model adapter.');
  assert.match((await request({ text: 'nonfinite' })).message, /invalid audio/);
  assert.match((await request({ text: 'infinite' })).message, /invalid audio/);
  const result = await request({});
  assert.equal(result.type, 'audio'); assert.equal(result.modelId, 'fixture'); assert.equal(result.sampleRate, 24000);
  assert.deepEqual(result.pcm, [-32768, -16384, 0, 16384, 32767]);
  assert.equal(result.metrics.audioSeconds, 5 / 24000); assert.equal(result.metrics.synthesisRate, 1);
  assert(Number.isFinite(result.metrics.generationMs));
});


test('Kitten is the default and optional CPU comparison works without WebGPU', { timeout: 10000 }, async t => {
  const { page, errors } = await openComparison(t);
  await page.evaluate(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
  assert.equal(await page.locator('#models input:checked').inputValue(), 'kitten');
  const report = await page.evaluate(() => window.comparison.run({ models: ['pocket-cpu'], corpus: 'smoke', repeats: 1, seed: 42 }));
  assert.deepEqual(report.failures, []); assert.equal(report.results.length, 1);
  assert.equal(report.models[0].key, 'pocket-cpu'); assert.equal(report.models[0].backend, 'wasm');
  assert.equal(report.results[0].playbackRate, 1); assert(report.results[0].signal.rms > 0);
  const historical = CANDIDATES.find(model => model.key === 'kitten');
  assert.equal(historical.repository, 'KittenML/kitten-tts-micro-0.8'); assert.equal(historical.voice, 'Bella');
  assert.notEqual(historical.id, report.models[0].id);
  const mixed = await page.evaluate(() => window.comparison.run({ models: ['kitten', 'pocket-cpu'], corpus: 'smoke', seed: 42 }));
  assert.equal(mixed.results.length, 1); assert.deepEqual(mixed.failures, [{ modelKey: 'kitten', message: 'This model requires WebGPU.' }]);
  assert.deepEqual(errors, []);
});
