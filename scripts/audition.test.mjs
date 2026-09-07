import assert from 'node:assert/strict';
import { test } from 'node:test';
import { auditionPlan, pcmStats, wavBytes } from './audition-utils.js';
import { startBrowser } from './app-fixtures.mjs';

test('audition plans keep blinded labels stable and balance comparison order', () => {
  const plan = auditionPlan({ seed: 7 });
  assert.deepEqual(plan, auditionPlan({ seed: 7 }));
  assert.equal(plan.jobs.length, 27);
  assert.deepEqual(plan.candidates.map(candidate => candidate.synthesisRate).sort(), [1, 1.2, 1.5]);
  assert(new Set(Array.from({ length: 12 }, (_, seed) => JSON.stringify(auditionPlan({ seed }).candidates))).size > 1);
  for (const passage of plan.corpus) for (const candidate of plan.candidates) {
    const positions = [];
    for (let repeat = 1; repeat <= 3; repeat++) {
      const jobs = plan.jobs.filter(job => job.id === passage.id && job.repeat === repeat);
      positions.push(jobs.findIndex(job => job.label === candidate.label));
      assert.equal(jobs.find(job => job.label === candidate.label).synthesisRate, candidate.synthesisRate);
    }
    assert.equal(new Set(positions).size, 3, 'Every candidate occupies each timing position for each passage.');
    assert(Math.abs(candidate.synthesisRate * (plan.targetRate / candidate.synthesisRate) - 1.5) < 1e-12);
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

// Replace only speech arrival. WAV parsing, media controls, and object URLs stay native.
function installSpeech() {
  const controls = window.__auditionTest = { requests: [], workers: [], liveUrls: new Set(), mode: 'auto', holdAfter: Infinity };
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: {} });
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
          metrics: { initMs, generationMs: 100, totalMs: initMs + 120,
            audioSeconds: samples / 24000, synthesisRate: message.synthesisRate } } });
      });
    }
    terminate() { this.dead = true; }
  };
}

async function openAudition(t) {
  const environment = await startBrowser();
  t.after(() => environment.close());
  const page = await environment.browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(installSpeech);
  await page.goto(environment.url + '/scripts/audition.html');
  await page.waitForFunction(() => window.audition);
  return { page, errors };
}

const quickPlan = { corpus: 'smoke', repeats: 1, seed: 7 };

test('the browser audition excludes warmups and plays native WAVs at matched nominal pace', { timeout: 20000 }, async t => {
  const { page, errors } = await openAudition(t);
  const report = await page.evaluate(options => window.audition.run(options), quickPlan);
  assert.equal(report.warmups.length, 3); assert.equal(report.results.length, 3);
  assert.equal(await page.evaluate(() => window.__auditionTest.requests.length), 6);
  assert.equal(report.results.reduce((sum, row) => sum + row.initMs, 0), 0);
  assert.equal(report.warmups.reduce((sum, row) => sum + row.initMs, 0), 2000);
  for (const row of report.results) {
    assert(Math.abs(row.synthesisRate * row.playbackRate - 1.5) < 1e-12);
    assert(Math.abs(row.listeningSeconds - 2 / 3) < .0001);
    assert(Math.abs(row.headroom - row.listeningSeconds / .12) < 1e-9,
      'Worker headroom includes PCM conversion after the generation phase.');
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
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), 3);
  assert(await page.evaluate(() => window.__auditionTest.workers.every(worker => worker.dead)));
  assert.deepEqual(errors, []);
});

test('Stop and worker failures remain failures, and rerunning releases prior audio', { timeout: 20000 }, async t => {
  const { page, errors } = await openAudition(t);
  await page.evaluate(options => window.audition.run(options), quickPlan);
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), 3);
  await page.evaluate(options => {
    window.__auditionTest.holdAfter = 4;
    window.__run = null;
    window.audition.run(options).then(() => { window.__run = 'success'; }, error => { window.__run = error.message; });
  }, quickPlan);
  await page.waitForFunction(() => window.audition.report.results.length === 1);
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), 1, 'Old comparison URLs are revoked on rerun.');
  assert.deepEqual(await page.locator('audio').evaluate(audio => ({ controls: audio.controls, inert: audio.inert, paused: audio.paused })),
    { controls: false, inert: true, paused: true }, 'Listening is held until timing completes to avoid biasing later samples.');
  await page.locator('#stop').click();
  await page.waitForFunction(() => window.__run !== null);
  assert.match(await page.evaluate(() => window.__run), /stopped/i);
  assert.match(await page.locator('#status').textContent(), /stopped/i);
  assert.equal(await page.locator('#fields').isDisabled(), false);
  assert.equal(await page.locator('#stop').isVisible(), false);
  assert(await page.evaluate(() => window.__auditionTest.workers.every(worker => worker.dead)));
  const failed = await page.evaluate(async options => {
    window.__auditionTest.mode = 'error'; window.__auditionTest.holdAfter = Infinity;
    try { await window.audition.run(options); return 'success'; } catch (error) { return error.message; }
  }, quickPlan);
  assert.equal(failed, 'Injected speech failure.');
  assert.equal(await page.locator('#status').textContent(), failed);
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), 0);
  const silence = await page.evaluate(async options => {
    window.__auditionTest.mode = 'silence';
    try { await window.audition.run(options); return 'success'; } catch (error) { return error.message; }
  }, quickPlan);
  assert.match(silence, /silent audio/i, 'Structurally valid silent PCM cannot finish as a successful audition.');
  assert.equal(await page.evaluate(() => window.audition.report.results.length), 0);
  const recovered = await page.evaluate(options => {
    window.__auditionTest.mode = 'auto';
    return window.audition.run(options);
  }, quickPlan);
  assert.equal(recovered.results.length, 3); assert.equal(recovered.error, undefined);
  assert.equal(await page.evaluate(() => window.__auditionTest.liveUrls.size), 3);
  assert.deepEqual(errors, []);
});
