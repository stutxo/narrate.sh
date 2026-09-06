// Optional: downloads ~45 MB and requires WebGPU plus native audio streaming.
// Set NARRATE_SOFTWARE_WEBGPU=1 to explicitly use Chromium's software adapter.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startBrowser, session, waitSession } from './app-fixtures.mjs';

test('real Micro speech plays before generation finishes and saves valid PCM', { timeout: 720000 }, async t => {
  const software = process.env.NARRATE_SOFTWARE_WEBGPU === '1';
  const environment = await startBrowser({ args: software
    ? ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  t.after(() => environment.close());
  const context = await environment.browser.newContext();
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.exposeFunction('modelDiagnostic', message => console.log(message));
  await page.addInitScript(() => {
    const trace = window.__modelTest = { requests: [], chunks: [], errors: [], firstPlayback: null };
    const NativeWorker = window.Worker;
    // Observe real messages; preserve the worker, GPU, encoder, and playback APIs.
    window.Worker = class extends NativeWorker {
      constructor(...args) {
        super(...args);
        this.addEventListener('error', event => trace.errors.push(event.message));
        this.addEventListener('message', ({ data }) => {
          if (data.type === 'error') trace.errors.push(data.message);
          if (data.type !== 'audio') return;
          if (!(data.pcm instanceof Uint8Array) || !data.pcm.byteLength || data.pcm.byteLength % 2 || data.sampleRate !== 24000) {
            trace.errors.push('Invalid PCM16 worker message.'); return;
          }
          const view = new DataView(data.pcm.buffer, data.pcm.byteOffset, data.pcm.byteLength);
          let squared = 0;
          for (let i = 0; i < view.byteLength; i += 2) {
            const sample = view.getInt16(i, true) / 32768;
            if (!Number.isFinite(sample)) trace.errors.push('Nonfinite speech sample.');
            squared += sample * sample;
          }
          const chunk = { id: data.id, bytes: view.byteLength, seconds: view.byteLength / 48000,
            rms: Math.sqrt(squared / (view.byteLength / 2)) };
          trace.chunks.push(chunk);
          window.modelDiagnostic(`Real GPU chunk ${data.id}: ${chunk.seconds.toFixed(3)} seconds of speech at ${((performance.now() - trace.started) / 1000).toFixed(2)}s.`);
        });
      }
      postMessage(message, ...args) {
        if (message.type === 'generate') {
          trace.started ??= performance.now();
          trace.requests.push({ id: message.id, text: message.text });
        }
        return super.postMessage(message, ...args);
      }
    };
    document.addEventListener('DOMContentLoaded', () => {
      const audio = document.querySelector('#audio');
      const observe = () => {
        if (trace.firstPlayback) return;
        if (audio.currentTime > .01) {
          trace.firstPlayback = { time: audio.currentTime, generated: trace.chunks.length,
            running: document.querySelector('#speak').textContent === 'Stop generation', src: audio.src };
          window.modelDiagnostic(`Native playback began after ${trace.chunks.length} generated chunk(s), at ${((performance.now() - trace.started) / 1000).toFixed(2)}s.`);
        } else if (!audio.paused) requestAnimationFrame(observe);
      };
      audio.addEventListener('playing', observe);
      audio.addEventListener('timeupdate', observe);
    });
  });
  await page.goto(environment.url);
  const support = await page.evaluate(async () => {
    const version = new URL(document.querySelector('script[type="module"]').src).search;
    const { getStreamConfig } = await import(new URL(`streaming-player.js${version}`, location.href).href);
    const adapter = await navigator.gpu?.requestAdapter();
    return { gpu: Boolean(adapter), codec: (await getStreamConfig())?.codec, isolated: crossOriginIsolated };
  });
  if (!support.gpu || !support.codec) {
    t.skip(`WebGPU/native streaming unavailable (${JSON.stringify(support)}). Configure a supported Chromium; software GPU requires NARRATE_SOFTWARE_WEBGPU=1.`);
    return;
  }
  t.diagnostic(`Using ${software ? 'explicit software WebGPU (not a phone benchmark)' : 'the browser WebGPU adapter'} and native ${support.codec}.`);
  if (process.env.NARRATE_TEST_ISOLATION === '0') assert.equal(support.isolated, false);
  // Leave enough speech after the startup buffer to prove playback overlaps inference.
  const passage = 'Extraordinary possibilities emerge when technology becomes accessible, allowing thoughtful experimentation with beautifully expressive narration across different environments.';
  const text = [
    'Hello world.',
    passage,
    passage,
    'Goodbye now.',
  ].join(' ');
  await page.locator('#text').fill(text);
  await page.locator('#speak').click();
  const planned = await waitSession(page, value => value.parts.length > 0);
  assert(planned.parts.length > 1, 'The fixture must exercise multiple real model calls.');
  await page.waitForFunction(() => window.__modelTest.firstPlayback || window.__modelTest.errors.length
    || document.querySelector('#speak').textContent !== 'Stop generation', null, { timeout: 600000 });
  const live = await page.evaluate(() => window.__modelTest);
  assert.deepEqual(live.errors, []);
  assert(live.firstPlayback, `No early playback: ${await page.locator('#status').textContent()}`);
  assert(live.firstPlayback.running && live.firstPlayback.generated < planned.parts.length,
    'Actual speech must begin playing before the final generation result.');
  await page.waitForFunction(() => window.__modelTest.errors.length
    || document.querySelector('#speak').textContent !== 'Stop generation', null, { timeout: 600000 });
  const completed = await session(page), trace = await page.evaluate(() => window.__modelTest);
  assert.deepEqual(trace.errors, []);
  assert.equal(await page.locator('#speak').textContent(), 'Ready to play', await page.locator('#status').textContent());
  assert.equal(completed.generated, planned.parts.length);
  assert.equal(completed.audioKeys.length, planned.parts.length);
  assert.equal(trace.chunks.length, planned.parts.length);
  assert(trace.chunks.every(chunk => chunk.rms > .00001), 'Every model result must contain audible, finite PCM.');
  await page.waitForFunction(time => document.querySelector('#audio').currentTime > time,
    trace.chunks[0].seconds + .05, { timeout: 15000 });
  assert.equal(await page.locator('#audio').getAttribute('src'), live.firstPlayback.src, 'Playback keeps one native source.');
  assert.equal(await page.locator('audio').count(), 1);
  const sizes = await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('narrate.sh');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, read = db.transaction('current').objectStore('current').getAll(IDBKeyRange.bound(0, 99999));
      read.onerror = () => { db.close(); reject(read.error); };
      read.onsuccess = async () => {
        db.close();
        try {
          resolve(await Promise.all(read.result.map(async blob => {
            const view = new DataView(await blob.slice(0, 44).arrayBuffer());
            if (view.getUint16(22, true) !== 1 || view.getUint32(24, true) !== 24000
              || view.getUint16(34, true) !== 16 || view.getUint32(40, true) !== blob.size - 44) throw new Error('Saved PCM header is invalid.');
            return blob.size;
          })));
        } catch (error) { reject(error); }
      };
    };
  }));
  assert.deepEqual(sizes, trace.chunks.map(chunk => chunk.bytes + 44));
  assert.deepEqual(errors, [], 'No unexpected browser or worker errors.');
});
