import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { auditionPlan, pcmStats, wavBytes } from './audition-utils.js';
import { startBrowser } from './app-fixtures.mjs';
import { MODEL } from '../model-config.js';

test('audition plans keep blinded labels stable and balance comparison order', () => {
  const plan = auditionPlan({ seed: 7 });
  assert.deepEqual(plan, auditionPlan({ seed: 7 }));
  assert.equal(plan.targetRate, 1, 'Comparisons default to normal listening pace.');
  assert.equal(plan.jobs.length, 9 * MODEL.synthesisRates.length);
  assert.deepEqual(plan.candidates.map(candidate => candidate.synthesisRate).sort(), [...MODEL.synthesisRates].sort());
  if (MODEL.synthesisRates.length > 1) assert(new Set(Array.from({ length: 12 }, (_, seed) => JSON.stringify(auditionPlan({ seed }).candidates))).size > 1);
  for (const passage of plan.corpus) for (const candidate of plan.candidates) {
    const positions = [];
    for (let repeat = 1; repeat <= 3; repeat++) {
      const jobs = plan.jobs.filter(job => job.id === passage.id && job.repeat === repeat);
      positions.push(jobs.findIndex(job => job.label === candidate.label));
      assert.equal(jobs.find(job => job.label === candidate.label).synthesisRate, candidate.synthesisRate);
    }
    assert.equal(new Set(positions).size, MODEL.synthesisRates.length, 'Candidates rotate through all available timing positions.');
    assert(Math.abs(candidate.synthesisRate * (plan.targetRate / candidate.synthesisRate) - 1) < 1e-12);
  }
  for (const options of [{ rates: [] }, { rates: [1, 1] }, { rates: [1, 2] }, { rates: ['1'] },
    { repeats: 0 }, { repeats: 7 }, { targetRate: NaN }, { seed: -1 }, { seed: 2 ** 32 },
    { corpus: 'missing' }, { text: '' }, { text: 'x'.repeat(501) }]) assert.throws(() => auditionPlan(options));
});

test('signal checks and WAV export preserve PCM subarrays without claiming speech quality', () => {
  const bytes = new Uint8Array(12), view = new DataView(bytes.buffer);
  view.setInt16(4, -32768, true); view.setInt16(6, 0, true); view.setInt16(8, 32767, true);
  const pcm = bytes.subarray(4, 10), signal = pcmStats(pcm);
  assert.equal(signal.samples, 3); assert.equal(signal.peak, 1);
  assert.equal(signal.atLimitFraction, 2 / 3); assert.equal(signal.nearZeroFraction, 1 / 3);
  assert(signal.warnings.some(warning => /possible clipping/i.test(warning)));
  assert(signal.rms > .8 && signal.rms < .82);
  assert.equal(pcmStats(new Uint8Array(8)).rms, 0, 'Valid all-zero PCM is silence, not evidence of successful speech.');
  assert.equal(pcmStats(new Uint8Array(8)).nearZeroFraction, 1);
  assert(pcmStats(new Uint8Array(8)).warnings.some(warning => /no audible speech/i.test(warning)));
  assert.throws(() => pcmStats(new Uint8Array()));
  assert.throws(() => pcmStats(new Uint8Array(3)));
  const wav = wavBytes(pcm), header = new DataView(wav.buffer);
  assert.equal(new TextDecoder().decode(wav.subarray(0, 4)), 'RIFF');
  assert.equal(wav.length, 50); assert.equal(header.getUint32(4, true), 42);
  assert.equal(header.getUint16(22, true), 1); assert.equal(header.getUint32(24, true), 24000);
  assert.equal(header.getUint16(34, true), 16); assert.equal(header.getUint32(40, true), 6);
  assert.equal(header.getInt16(44, true), -32768); assert.equal(header.getInt16(48, true), 32767);
});

test('quiet edges measure waveform padding without treating internal pauses as playback stalls', () => {
  const sampleRate = 24000, bytes = new Uint8Array(24000 * 2 + 8);
  const pcm = bytes.subarray(4, -4), view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
  // Quiet nonzero edges surround two sounds separated by a deliberate internal pause.
  for (let i = 0; i < sampleRate; i++) {
    const loud = (i >= 4800 && i < 7200) || (i >= 14400 && i < 16800);
    view.setInt16(i * 2, (i % 2 ? -1 : 1) * (loud ? 1000 : 30), true);
  }
  const before = pcm.slice(), signal = pcmStats(pcm, sampleRate);
  assert.deepEqual(signal.quietEdges, { thresholdDbfs: -60, windowMs: 10,
    leadingSeconds: .2, trailingSeconds: .3, allQuiet: false });
  assert.deepEqual(pcm, before, 'Measurement never trims or changes speech samples.');
  assert.equal(signal.nearZeroFraction, .8, 'Internal quiet samples are separate from edge padding.');
  assert.deepEqual(pcmStats(new Uint8Array(48000)).quietEdges, { thresholdDbfs: -60, windowMs: 10,
    leadingSeconds: 1, trailingSeconds: 1, allQuiet: true });
  const partial = new Uint8Array(482); new DataView(partial.buffer).setInt16(480, 33, true);
  assert.equal(pcmStats(partial).quietEdges.leadingSeconds, .01);
  assert.equal(pcmStats(partial).quietEdges.trailingSeconds, 0, 'A short final window uses its actual sample count.');
  assert.equal(pcmStats(pcm, 48000).quietEdges.leadingSeconds, .1);
  assert.equal(pcmStats(pcm, 48000).quietEdges.trailingSeconds, .15);
  for (const rate of [0, -1, NaN, 24000.5]) assert.throws(() => pcmStats(partial, rate));
});

// Replace only speech arrival. WAV parsing, media controls, and object URLs stay native.
function installSpeech() {
  const controls = window.__auditionTest = { requests: [], workers: [], liveUrls: new Set(), mode: 'auto', holdAfter: Infinity,
    wakeLocks: [], wakeRequests: 0, wakeMode: 'auto', visibility: 'visible' };
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} });
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => controls.visibility });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: async type => {
    if (type !== 'screen') throw new Error('Unexpected wake lock type.');
    controls.wakeRequests++;
    if (controls.wakeMode === 'denied') throw new DOMException('Wake lock denied.', 'NotAllowedError');
    const lock = new EventTarget(); lock.released = false;
    lock.release = async () => { lock.released = true; lock.dispatchEvent(new Event('release')); };
    controls.wakeLocks.push(lock);
    if (controls.wakeMode === 'late') await new Promise(resolve => { controls.resolveWake = resolve; });
    return lock;
  } } });
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = value => { const url = create(value); controls.liveUrls.add(url); return url; };
  URL.revokeObjectURL = url => { controls.liveUrls.delete(url); revoke(url); };
  window.Worker = class {
    constructor() { this.dead = false; this.calls = 0; controls.workers.push(this); }
    postMessage(message) {
      this.calls++; controls.requests.push(message);
      if (controls.mode === 'hold' || this.calls > controls.holdAfter) return;
      queueMicrotask(() => {
        if (this.dead) return;
        if (controls.mode === 'error') {
          this.onmessage?.({ data: { type: 'error', id: message.id, message: 'Injected speech failure.' } }); return;
        }
        const samples = Math.round(24000 / message.synthesisRate), pcm = new Uint8Array(samples * 2), view = new DataView(pcm.buffer);
        if (controls.mode !== 'silence') for (let i = 0; i < samples; i++) {
          view.setInt16(i * 2, Math.round(Math.sin(i * 2 * Math.PI * 220 / 24000) * 3000), true);
        }
        const initMs = this.calls === 1 ? 2000 : 0;
        this.onmessage?.({ data: { type: 'audio', id: message.id, pcm, sampleRate: 24000,
          modelId: controls.mode === 'old-worker' ? undefined : message.modelId,
          metrics: controls.mode === 'protocol' ? undefined : { initMs, generationMs: 100, totalMs: initMs + 120,
            audioSeconds: samples / 24000, synthesisRate: message.synthesisRate } } });
      });
    }
    terminate() { this.dead = true; }
  };
}

async function openAudition(t, configSource) {
  const environment = await startBrowser();
  t.after(() => environment.close());
  const page = await environment.browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installSpeech);
  if (configSource) await page.route('**/model-config.js*', route => route.fulfill({
    contentType: 'application/javascript', body: configSource,
  }));
  await page.goto(environment.url + '/scripts/audition.html');
  await page.waitForFunction(() => window.audition);
  return { page, errors };
}

const quickPlan = { corpus: 'smoke', repeats: 1, seed: 7 };

test('auditions follow an alternate CPU model without WebGPU', { timeout: 20000 }, async t => {
  const config = (await readFile(new URL('../models/pocket-config.js', import.meta.url), 'utf8'))
    .replace(/name: '[^']*'/, "name: 'Future voice'");
  const { page, errors } = await openAudition(t, config);
  await page.evaluate(() => Object.defineProperty(navigator, 'gpu', { configurable: true, get() { throw new Error('CPU audition must not access WebGPU'); } }));
  assert.equal(await page.locator('#pace').inputValue(), '1');
  const report = await page.evaluate(options => window.audition.run(options), quickPlan);
  assert.equal(report.targetRate, 1);
  assert.equal(await page.title(), 'Future voice audition');
  assert.equal(report.model.name, 'Future voice');
  assert.equal(report.warmups.length, 1); assert.equal(report.results.length, 1);
  assert.equal(report.results[0].synthesisRate, 1);
  assert.equal(await page.evaluate(() => window.__auditionTest.requests.length), 2);
  assert.deepEqual(errors, []);
});

test('the browser audition excludes warmups and plays native WAVs at matched nominal pace', { timeout: 20000 }, async t => {
  const { page, errors } = await openAudition(t);
  const report = await page.evaluate(options => window.audition.run(options), { ...quickPlan, targetRate: 1.5 });
  assert.equal(report.warmups.length, MODEL.synthesisRates.length); assert.equal(report.results.length, MODEL.synthesisRates.length);
  assert.deepEqual(report.model, { id: MODEL.id, name: MODEL.name, voice: MODEL.voice, backend: MODEL.backend });
  assert(await page.evaluate(id => window.__auditionTest.requests.every(request => request.modelId === id), report.model.id));
  assert.equal(await page.title(), `${MODEL.name} audition`);
  assert.equal(report.backgrounded, false);
  assert.equal(await page.evaluate(() => window.__auditionTest.wakeRequests), 1);
  assert(await page.evaluate(() => window.__auditionTest.wakeLocks.every(lock => lock.released)), 'Completion releases the screen.');
  assert.equal(await page.evaluate(() => window.__auditionTest.requests.length), MODEL.synthesisRates.length * 2);
  assert.equal(report.results.reduce((sum, row) => sum + row.initMs, 0), 0);
  assert.equal(report.warmups.reduce((sum, row) => sum + row.initMs, 0), 2000);
  for (const row of report.results) {
    assert(Math.abs(row.synthesisRate * row.playbackRate - 1.5) < 1e-12);
    assert(Math.abs(row.listeningSeconds - 2 / 3) < .0001);
    assert(Math.abs(row.headroom - row.listeningSeconds / .12) < 1e-9,
      'Worker headroom includes PCM conversion after the generation phase.');
    assert.deepEqual(row.signal.quietEdges, { thresholdDbfs: -60, windowMs: 10,
      leadingSeconds: 0, trailingSeconds: 0, allQuiet: false }, 'The browser report includes waveform measurements.');
  }
  await page.waitForFunction(() => [...document.querySelectorAll('audio')].every(audio => audio.readyState >= 1));
  const media = await page.locator('audio').evaluateAll(elements => elements.map(audio => ({
    rate: audio.playbackRate, defaultRate: audio.defaultPlaybackRate, pitch: audio.preservesPitch, duration: audio.duration,
  })));
  media.forEach((audio, index) => {
    const row = report.results[index];
    assert.equal(audio.rate, row.playbackRate); assert.equal(audio.defaultRate, row.playbackRate); assert.equal(audio.pitch, true);
    assert(Math.abs(audio.duration - row.audioSeconds) < .0001);
  });
  assert.equal(await page.locator('.detail:visible').count(), 0, 'Rates stay hidden until the listener requests them.');
  await page.locator('#reveal').click();
  assert((await page.locator('.detail:visible').count()) > 0);
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), MODEL.synthesisRates.length);
  assert(await page.evaluate(() => window.__auditionTest.workers.every(worker => worker.dead)));
  assert.deepEqual(errors, []);
});

test('Stop and worker failures remain failures, and rerunning releases prior audio', { timeout: 20000 }, async t => {
  const { page, errors } = await openAudition(t);
  await page.evaluate(options => window.audition.run(options), quickPlan);
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), MODEL.synthesisRates.length);
  await page.evaluate(options => {
    window.__auditionTest.holdAfter = options.rates.length + 1;
    window.__run = null;
    window.audition.run(options).then(() => { window.__run = 'success'; }, error => { window.__run = error.message; });
  }, { ...quickPlan, repeats: 2, rates: MODEL.synthesisRates });
  await page.waitForFunction(() => window.audition.report.results.length === 1);
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), 1, 'Old comparison URLs are revoked on rerun.');
  assert.deepEqual(await page.locator('audio').evaluate(audio => ({ controls: audio.controls, inert: audio.inert, paused: audio.paused })),
    { controls: false, inert: true, paused: true }, 'Listening is held until timing completes to avoid biasing later samples.');
  assert(await page.evaluate(() => window.__auditionTest.wakeLocks.some(lock => !lock.released)), 'Active generation holds the screen awake.');
  const wakeRequests = await page.evaluate(async () => {
    const controls = window.__auditionTest;
    controls.visibility = 'hidden';
    await controls.wakeLocks.at(-1).release(); // Browsers release screen locks when hidden.
    document.dispatchEvent(new Event('visibilitychange'));
    controls.visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
    return controls.wakeRequests;
  });
  assert.equal(wakeRequests, 3, 'Returning to the active audition reacquires the released lock.');
  assert.equal(await page.evaluate(() => window.audition.report.backgrounded), true);
  await page.locator('#stop').click();
  await page.waitForFunction(() => window.__run !== null);
  assert.match(await page.evaluate(() => window.__run), /stopped/i);
  assert.match(await page.locator('#status').textContent(), /stopped/i);
  assert.equal(await page.locator('#fields').isDisabled(), false);
  assert.equal(await page.locator('#stop').isVisible(), false);
  assert(await page.evaluate(() => window.__auditionTest.workers.every(worker => worker.dead)));
  assert(await page.evaluate(() => window.__auditionTest.wakeLocks.every(lock => lock.released)), 'Stop releases every acquired lock.');
  assert.equal(await page.evaluate(() => {
    const controls = window.__auditionTest;
    controls.visibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange'));
    controls.visibility = 'visible'; document.dispatchEvent(new Event('visibilitychange'));
    return controls.wakeRequests;
  }), wakeRequests, 'Visibility changes after Stop must not reacquire a lock.');
  const failed = await page.evaluate(async options => {
    window.__auditionTest.mode = 'error'; window.__auditionTest.holdAfter = Infinity;
    try { await window.audition.run(options); return 'success'; } catch (error) { return error.message; }
  }, quickPlan);
  assert.equal(failed, 'Injected speech failure.');
  assert.equal(await page.locator('#status').textContent(), failed);
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), 0);
  assert(await page.evaluate(() => window.__auditionTest.wakeLocks.every(lock => lock.released)), 'Worker failure releases the screen.');
  const protocolFailure = await page.evaluate(async options => {
    window.__auditionTest.mode = 'protocol';
    try { await window.audition.run(options); return 'success'; } catch (error) { return error.message; }
  }, quickPlan);
  assert.match(protocolFailure, /worker protocol/i);
  assert(await page.evaluate(() => window.__auditionTest.wakeLocks.every(lock => lock.released)), 'Malformed responses also release the screen.');
  const oldWorker = await page.evaluate(async options => {
    window.__auditionTest.mode = 'old-worker';
    try { await window.audition.run(options); return 'success'; } catch (error) { return error.message; }
  }, quickPlan);
  assert.match(oldWorker, /model has changed.*Reload/);
  const silence = await page.evaluate(async options => {
    window.__auditionTest.mode = 'silence';
    try { await window.audition.run(options); return 'success'; } catch (error) { return error.message; }
  }, quickPlan);
  assert.match(silence, /silent audio/i, 'Structurally valid silent PCM cannot finish as a successful audition.');
  assert.equal(await page.evaluate(() => window.audition.report.results.length), 0);
  const recovered = await page.evaluate(options => {
    window.__auditionTest.mode = 'auto'; window.__auditionTest.wakeMode = 'denied';
    return window.audition.run(options);
  }, quickPlan);
  assert.equal(recovered.results.length, MODEL.synthesisRates.length); assert.equal(recovered.error, undefined);
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), MODEL.synthesisRates.length);
  assert.equal(recovered.backgrounded, false, 'A fresh run resets the background warning; denied wake locks do not block speech.');
  await page.evaluate(options => {
    window.__auditionTest.mode = 'hold'; window.__auditionTest.wakeMode = 'late'; window.__run = null;
    window.audition.run(options).catch(error => { window.__run = error.message; });
  }, quickPlan);
  await page.waitForFunction(() => Boolean(window.__auditionTest.resolveWake));
  await page.locator('#stop').click();
  await page.waitForFunction(() => window.__run !== null);
  await page.evaluate(() => window.__auditionTest.resolveWake());
  await page.waitForFunction(() => window.__auditionTest.wakeLocks.every(lock => lock.released));
  assert.match(await page.evaluate(() => window.__run), /stopped/i, 'An acquisition completed after Stop is released immediately.');
  assert.deepEqual(errors, []);
});


test('the production audition requires WebGPU before loading a model', { timeout: 10000 }, async t => {
  const { page, errors } = await openAudition(t);
  await page.evaluate(() => Object.defineProperty(navigator, 'gpu', { configurable: true, value: undefined }));
  const result = await page.evaluate(async options => {
    try { await window.audition.run(options); return 'unexpected success'; } catch (error) { return error.message; }
  }, quickPlan);
  assert.equal(result, 'This model requires WebGPU.');
  assert.equal(await page.evaluate(() => window.__auditionTest.workers.length), 0);
  assert.deepEqual(errors, []);
});
