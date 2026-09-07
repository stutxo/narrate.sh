import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startBrowser, openApp, begin, reply, waitStopped, PASSAGE, cleanErrors } from './app-fixtures.mjs';

let environment;
before(async () => { environment = await startBrowser(); });
after(async () => { await environment?.close(); });

test('ordinary narration keeps selectable read-only text and does not load diagnostics', async t => {
  const app = await openApp(environment);
  t.after(app.close);
  await begin(app.page, PASSAGE);
  assert.deepEqual(await app.page.locator('#text').evaluate(text => ({ disabled: text.disabled, readOnly: text.readOnly })),
    { disabled: false, readOnly: true });
  assert.equal(await app.page.locator('#diagnostics').count(), 0);
  assert.equal(await app.page.evaluate(() => performance.getEntriesByType('resource').some(entry => entry.name.includes('/diagnostics.js'))), false);
  await reply(app.page); await waitStopped(app.page);
  assert.equal(await app.page.locator('#text').evaluate(text => text.readOnly), true);
  await app.page.locator('#new-session').click();
  assert.equal(await app.page.locator('#text').isEditable(), true);
  cleanErrors(app.errors);
});

test('timings distinguish clock progress, initial waits, seeks and user pauses; export excludes text', async t => {
  const context = await environment.browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage();
  await page.route('**/__diagnostics', route => route.fulfill({ contentType: 'text/html', body: '<main></main>' }));
  await page.goto(environment.url + '/__diagnostics');
  const result = await page.evaluate(async () => {
    const { setupDiagnostics } = await import('/diagnostics.js');
    const audio = Object.assign(new EventTarget(), { currentTime: 30, paused: false, seeking: false, playbackRate: 1.5, readyState: 2 });
    const metrics = setupDiagnostics(audio);
    const emit = name => audio.dispatchEvent(new Event(name));
    const sleep = () => new Promise(resolve => setTimeout(resolve, 30));
    metrics.start({ passages: 3, resumedPassages: 1, playbackRate: 1.5 });
    emit('waiting'); await sleep();
    const initial = metrics.snapshot();
    emit('playing'); emit('timeupdate');
    const unchanged = metrics.snapshot();
    audio.seeking = true; emit('seeking'); audio.currentTime = 100; emit('timeupdate');
    const seek = metrics.snapshot();
    emit('waiting'); audio.seeking = false; emit('seeked'); emit('playing');
    audio.currentTime += .1; emit('timeupdate');
    const advancing = metrics.snapshot();
    emit('waiting'); await sleep();
    audio.paused = true; emit('pause');
    const paused = metrics.snapshot();
    await sleep(); emit('waiting');
    const later = metrics.snapshot();
    audio.paused = false; emit('playing');
    metrics.chunk({ id: 2, pcm: new Uint8Array(48000), sampleRate: 24000, text: 'PRIVATE NARRATION',
      metrics: { initMs: 100, generationMs: 200, totalMs: 310, synthesisRate: 1, text: 'PRIVATE NARRATION' } }, 315);
    metrics.finish('ready');
    const finished = metrics.snapshot();
    metrics.clear();
    const cleared = metrics.snapshot();
    metrics.start({ passages: 3, resumedPassages: 2, playbackRate: 1.25 });
    const resumed = metrics.snapshot();
    return { initial, unchanged, seek, advancing, paused, later, finished, cleared, resumed };
  });
  assert.equal(result.initial.bufferWaitMs, 0, 'Initial preparation is measured by first playback latency, not stalls');
  assert.equal(result.unchanged.firstPlaybackMs, null, 'A playing event at a restored position does not establish clock progress');
  assert.equal(result.seek.firstPlaybackMs, null, 'Seeking cannot masquerade as playback');
  assert(result.advancing.firstPlaybackMs >= 0);
  assert(result.paused.bufferWaitMs >= 20);
  assert.equal(result.paused.waits.length, 1);
  assert.equal(result.later.bufferWaitMs, result.paused.bufferWaitMs, 'Time deliberately paused is excluded');
  assert.equal(result.finished.returnedPassages, 1);
  assert.equal(result.finished.initMs, 100);
  assert.equal(result.finished.generationMs, 200);
  assert.equal(result.finished.chunks[0].requestMs, 315, 'Worker and window durations are not added together');
  assert.equal(JSON.stringify(result).includes('PRIVATE NARRATION'), false);
  assert.equal(result.cleared.chunks, undefined);
  assert.equal(result.resumed.returnedPassages, 0);
  assert.equal(result.resumed.resumedPassages, 2);
  assert.equal(result.resumed.firstPlaybackMs, null);
});

test('opt-in app timings export a usable report without narration or audio', async t => {
  const app = await openApp(environment, { diagnostics: true });
  t.after(app.close);
  const privateText = 'Private narration for timing checks.';
  await begin(app.page, privateText);
  await reply(app.page); await waitStopped(app.page);
  await app.page.waitForFunction(() => document.querySelector('#audio').currentTime > .1);
  await app.page.locator('#diagnostics summary').click();
  await app.page.waitForFunction(() => !document.querySelector('#diagnostics pre').textContent.includes('First playback progress: waiting'));
  const downloadPromise = app.page.waitForEvent('download');
  await app.page.locator('#diagnostics button').click();
  const download = await downloadPromise;
  let text = '';
  for await (const chunk of await download.createReadStream()) text += chunk;
  const report = JSON.parse(text);
  assert.equal(download.suggestedFilename(), 'narrate-timings.json');
  assert.equal(report.returnedPassages, 1);
  assert.equal(report.hiddenAtStart, false);
  assert.equal(report.chunks[0].sourceCharacters, privateText.length);
  assert.equal(report.outcome, 'ready');
  assert(report.firstPlaybackMs > 0);
  assert.equal(report.bufferWaitMs, 0);
  assert.equal(report.environment.backend, 'webgpu');
  assert.equal(report.environment.webgpu, true);
  assert.equal(await app.page.evaluate(() => window.__speech.adapterRequests), 1);
  assert.equal(text.includes(privateText), false);
  assert.equal(text.includes('pcm'), false);
  cleanErrors(app.errors);
});
