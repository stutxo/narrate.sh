import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { startBrowser } from './app-fixtures.mjs';

let environment;
before(async () => { environment = await startBrowser(); });
after(async () => { await environment?.close(); });

// Exercise actual encoding, MP4 muxing, and SourceBuffer operations. Offsetting
// encoded timestamps reproduces the small leading gap exposed by Safari AAC.
async function open(t, { gap = 0, streaming = true, seconds = 2.025 } = {}) {
  const context = await environment.browser.newContext();
  t.after(() => context.close());
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.route('**/__stream-boundary', route => route.fulfill({ contentType: 'text/html',
    body: '<button>Start</button><audio controls preload="auto"></audio>' }));
  // Allows proving the regression against a saved module without changing source.
  if (process.env.NARRATE_STREAM_TEST_MODULE) {
    await page.route('**/streaming-player.js', route => route.fulfill({
      path: process.env.NARRATE_STREAM_TEST_MODULE, contentType: 'application/javascript',
    }));
  }
  await page.goto(`${environment.url}/__stream-boundary`);
  const supported = await page.evaluate(async ({ gap, streaming, seconds }) => {
    const { getStreamConfig, StreamingPlayer } = await import('/streaming-player.js');
    const config = await getStreamConfig();
    if (!config) return false;
    const trace = window.trace = { appends: 0, ready: 0, errors: [], codec: config.codec };
    class OffsetSource extends config.Source {
      constructor() { super(); Object.defineProperty(this, 'streaming', { value: streaming }); }
      addSourceBuffer(mime) {
        const buffer = super.addSourceBuffer(mime);
        buffer.timestampOffset = gap;
        const append = buffer.appendBuffer.bind(buffer);
        buffer.appendBuffer = data => {
          if (++trace.appends > 100) throw new Error('The player repeatedly appended already buffered audio.');
          return append(data);
        };
        return buffer;
      }
    }
    const audio = window.audio = document.querySelector('audio');
    const count = Math.round(seconds * 24000), bytes = new ArrayBuffer(44 + count * 2), view = new DataView(bytes);
    const ascii = (offset, value) => [...value].forEach((letter, i) => view.setUint8(offset + i, letter.charCodeAt(0)));
    ascii(0, 'RIFF'); view.setUint32(4, bytes.byteLength - 8, true); ascii(8, 'WAVEfmt ');
    view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
    view.setUint32(24, 24000, true); view.setUint32(28, 48000, true);
    view.setUint16(32, 2, true); view.setUint16(34, 16, true);
    ascii(36, 'data'); view.setUint32(40, count * 2, true);
    for (let i = 0; i < count; i++) view.setInt16(44 + i * 2, Math.round(Math.sin(i * 2 * Math.PI * 220 / 24000) * 3000), true);
    document.querySelector('button').onclick = () => {
      const player = window.player = new StreamingPlayer(audio, { ...config, Source: OffsetSource }, {
        onready: () => { trace.ready++; void audio.play().catch(error => trace.errors.push(error.message)); },
        onerror: error => trace.errors.push(error.message),
      });
      void player.append(new Blob([bytes])).then(() => player.finish()).catch(error => trace.errors.push(error.message));
    };
    return true;
  }, { gap, streaming, seconds });
  if (!supported) { t.skip('The browser has no native audio encoder/MP4 playback support.'); return; }
  await page.locator('button').click();
  return { page, errors };
}

test('a small native timestamp gap becomes playable once and seeks back to the beginning', { timeout: 20000 }, async t => {
  const app = await open(t, { gap: 1024 / 24000 });
  if (!app) return;
  const { page, errors } = app;
  await page.waitForFunction(() => trace.errors.length || (trace.ready && audio.currentTime > .15), null, { timeout: 8000 });
  let state = await page.evaluate(() => ({ ...trace, start: audio.buffered.start(0), fragments: player.fragments.length }));
  assert.deepEqual(state.errors, []);
  assert(state.start > .03 && state.start < .06, 'The real SourceBuffer must expose the injected leading gap.');
  assert.equal(state.ready, 1);
  assert(state.appends <= state.fragments + 1, 'Each fragment and the initialization header append only once.');
  await page.evaluate(() => { audio.pause(); audio.currentTime = 0; });
  await page.waitForFunction(() => audio.currentTime > .03 && !audio.seeking);
  await page.evaluate(() => audio.play());
  await page.waitForFunction(() => audio.currentTime > .15);
  state = await page.evaluate(() => ({ ...trace, time: audio.currentTime, fragments: player.fragments.length }));
  assert.equal(state.ready, 1);
  assert(state.appends <= state.fragments + 1, 'Seeking to zero does not repeatedly append the initial fragment.');
  assert.deepEqual(state.errors, []);
  assert.deepEqual(errors, []);
});

test('an inactive streaming hint still buffers and finishes locally generated audio', { timeout: 15000 }, async t => {
  const app = await open(t, { streaming: false, seconds: .501 });
  if (!app) return;
  const { page, errors } = app;
  await page.waitForFunction(() => trace.errors.length || (trace.ready && player.source.readyState === 'ended'), null, { timeout: 6000 });
  const state = await page.evaluate(() => ({ ...trace, duration: audio.duration, sourceState: player.source.readyState }));
  assert.deepEqual(state.errors, []);
  assert.equal(state.ready, 1);
  assert.equal(state.sourceState, 'ended');
  assert(state.duration + 1 / 24000 >= .501, 'The final partial codec frame remains playable.');
  assert.deepEqual(errors, []);
});

test('a large missing interval is not silently skipped', { timeout: 15000 }, async t => {
  const app = await open(t, { gap: .5 });
  if (!app) return;
  const { page, errors } = app;
  await page.waitForFunction(() => trace.errors.length, null, { timeout: 6000 });
  const state = await page.evaluate(() => ({ ...trace, time: audio.currentTime, start: player.buffer.buffered.start(0) }));
  assert(state.start > .4);
  assert.equal(state.time, 0, 'Only small codec-related leading gaps should be aligned.');
  assert.equal(state.ready, 0);
  assert(state.errors.every(message => message === 'The browser could not play the start of the audio stream.'));
  assert.equal(state.appends, 2, 'An unsupported start fails after the header and first fragment.');
  assert.deepEqual(errors, []);
});
