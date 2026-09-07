import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startBrowser, openApp, begin, reply, PASSAGE, waitStopped, waitSession, audioState, cleanErrors } from "./app-fixtures.mjs";

let environment;
before(async () => { environment = await startBrowser(); });
after(async () => { await environment?.close(); });

async function openPlayer(options = {}) {
  const external = [];
  const isolated = { ...environment, browser: { newContext: async settings => {
    const context = await environment.browser.newContext(settings);
    await context.route("**/*", route => {
      const url = new URL(route.request().url());
      if (url.protocol === "http:" && url.origin === environment.url || url.protocol === "blob:") return route.continue();
      external.push(url.href);
      return route.abort();
    });
    await context.addInitScript(({ unsupported }) => {
      if (unsupported) { Object.defineProperty(navigator, "mediaSession", { value: undefined }); return; }
      const media = navigator.mediaSession;
      window.__system = { actions: {}, positions: [] };
      const register = media.setActionHandler.bind(media), position = media.setPositionState.bind(media);
      media.setActionHandler = (name, handler) => { window.__system.actions[name] = handler; register(name, handler); };
      media.setPositionState = state => { window.__system.positions.push(state ?? null); position(state); };
    }, { unsupported: options.unsupported });
    return context;
  } } };
  const app = await openApp(isolated, options);
  app.page.setDefaultTimeout(5000);
  await app.page.waitForSelector(".plyr", { state: "attached" });
  return { ...app, external };
}

test("local player stays readable and usable at 320px with enlarged text", { timeout: 20000 }, async t => {
  const app = await openPlayer({ seconds: 20 }); t.after(app.close);
  const { page, errors, external } = app;
  await page.setViewportSize({ width: 320, height: 640 });
  await begin(page); await reply(page); await reply(page); await reply(page); await reply(page); await waitStopped(page);
  await page.locator("#audio").evaluate(audio => audio.pause());
  const text = await page.locator("#text").inputValue();
  await page.locator("#text").evaluate(element => { element.focus(); element.setSelectionRange(0, 30); element.scrollTop = element.scrollHeight; });
  assert.deepEqual(await page.locator("#text").evaluate(element => ({ disabled: element.disabled, readOnly: element.readOnly, selection: element.selectionEnd - element.selectionStart, color: getComputedStyle(element).color, scroll: element.scrollTop > 0 })), { disabled: false, readOnly: true, selection: 30, color: "rgb(0, 0, 0)", scroll: true });
  for (const size of [16, 32]) {
    await page.locator("html").evaluate((element, value) => { element.style.fontSize = `${value}px`; }, size);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(100);
    const layout = await page.evaluate(() => {
      const output = document.querySelector("#output").getBoundingClientRect();
      const title = document.querySelector("h1").getBoundingClientRect();
      const range = document.createRange(); range.selectNodeContents(document.querySelector("h1"));
      const titleText = range.getBoundingClientRect();
      return { width: document.documentElement.scrollWidth, viewport: { width: innerWidth, height: innerHeight, scale: visualViewport?.scale }, scroll: { x: scrollX, y: scrollY }, output: { top: output.top, bottom: output.bottom }, title: { left: title.left, right: title.right, textRight: titleText.right }, controls: Array.from(document.querySelectorAll('.plyr__controls button')).filter(button => button.getBoundingClientRect().width).map(button => { const rect = button.getBoundingClientRect(); return { width: rect.width, height: rect.height, left: rect.left, right: rect.right }; }) };
    });
    const measurements = `at ${size}px root text: ${JSON.stringify(layout)}`;
    assert(layout.width <= 320, `No horizontal overflow ${measurements}`);
    assert(layout.title.left >= 0 && layout.title.right <= 320 && layout.title.textRight <= 320, `Title text stays inside the screen ${measurements}`);
    assert(layout.output.top >= 0 && layout.output.bottom <= 640, `Sticky playback controls stay visible while reading the top of the page ${measurements}`);
    assert(layout.controls.every(rect => rect.width >= 44 && rect.height >= 44 && rect.left >= 0 && rect.right <= 320));
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await page.locator('[data-plyr="settings"][aria-expanded="true"]').waitFor();
    await page.getByRole("menuitem", { name: /Speed/ }).click();
    const option = page.getByRole("menuitemradio", { name: "1.25×", exact: true });
    await option.scrollIntoViewIfNeeded();
    const box = await option.boundingBox();
    assert(box && box.x >= 0 && box.x + box.width <= 320 && box.y >= 0 && box.y + box.height <= 640, "Speed options fit the visible viewport");
    await option.click();
    await page.waitForFunction(() => document.querySelector("#audio").playbackRate === 1.25);
    if (await page.getByRole("button", { name: "Settings", exact: true }).getAttribute("aria-expanded") === "true") await page.getByRole("button", { name: "Settings", exact: true }).click();
  }
  assert.equal(await page.locator("#text").inputValue(), text);
  assert(await page.locator('svg use').count() > 0);
  assert(await page.locator('[data-plyr="rewind"] svg use').evaluate(use => use.getBBox().width > 0), "The self-hosted icon sprite loaded under the actual CSP");
  assert.deepEqual(external, [], "The player needs no CDN requests");
  cleanErrors(errors);
});

test("rewind and system controls preserve native pause, seeking, rate and session clearing", { timeout: 20000 }, async t => {
  const app = await openPlayer({ seconds: 20 }); t.after(app.close);
  const { page, errors, external } = app;
  await begin(page, [PASSAGE, PASSAGE].join(" "));
  await page.evaluate(() => window.__system.actions.pause());
  await reply(page); await reply(page); await waitStopped(page);
  assert.equal((await audioState(page)).paused, true, "A system Pause before the first speech prevents later autoplay");
  assert((await audioState(page)).time < .01);
  assert.equal(await page.evaluate(() => navigator.mediaSession.metadata.title), "narrate.sh");
  await page.locator("#audio").evaluate(audio => { audio.currentTime = 25; audio.playbackRate = 1.25; });
  await page.waitForFunction(() => !document.querySelector("#audio").seeking);
  await page.locator('[data-plyr="rewind"]').click();
  assert(Math.abs((await audioState(page)).time - 15) < .1);
  assert.equal((await audioState(page)).paused, true);
  await page.evaluate(() => window.__system.actions.seekto({ seekTime: 3 }));
  await page.evaluate(() => window.__system.actions.seekbackward({}));
  assert.equal((await audioState(page)).time, 0);
  await page.evaluate(() => window.__system.actions.seekforward({ seekOffset: 12 }));
  assert.equal((await audioState(page)).time, 12);
  await page.evaluate(() => window.__system.actions.play());
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > 12.1);
  await page.locator('[data-plyr="rewind"]').click();
  assert((await audioState(page)).time < 4, "Rewind also works during playback");
  await page.evaluate(() => window.__system.actions.pause());
  await page.waitForFunction(() => navigator.mediaSession.playbackState === "paused");
  const reports = await page.evaluate(() => window.__system.positions.filter(Boolean));
  assert(reports.some(state => state.playbackRate === 1.25));
  assert(reports.every(state => Number.isFinite(state.duration) && state.duration > 0 && Number.isFinite(state.position) && state.position >= 0 && state.position <= state.duration && Number.isFinite(state.playbackRate) && state.playbackRate > 0));
  const count = await page.evaluate(() => { const count = window.__system.positions.length; for (let index = 0; index < 100; index++) document.querySelector("#audio").dispatchEvent(new Event("timeupdate")); return window.__system.positions.length - count; });
  assert(count <= 1, "Frequent native time events do not flood system position updates");
  await page.locator("#new-session").click();
  await waitSession(page, saved => saved.generated === 0 && saved.text === "");
  await page.waitForFunction(() => navigator.mediaSession.metadata === null && navigator.mediaSession.playbackState === "none");
  assert.equal(await page.evaluate(() => window.__system.positions.at(-1)), null);
  assert.deepEqual(external, []); cleanErrors(errors);
});

test("playback remains usable without MediaSession support", { timeout: 10000 }, async t => {
  const app = await openPlayer({ unsupported: true }); t.after(app.close);
  await begin(app.page, PASSAGE); await reply(app.page); await waitStopped(app.page);
  await app.page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  await app.page.locator('[data-plyr="play"]').click();
  assert.equal((await audioState(app.page)).paused, true);
  assert.deepEqual(app.external, []); cleanErrors(app.errors);
});

for (const position of [35, 40]) {
  test(`Resume keeps the ${position}s saved cursor for rewind and system controls while buffering`, { timeout: 20000 }, async t => {
    const app = await openPlayer({ seconds: 20 }); t.after(app.close);
    const { page, errors } = app;
    await begin(page); await reply(page); await reply(page);
    await waitSession(page, saved => saved.generated === 2);
    await page.locator("#audio").evaluate(audio => audio.pause());
    await page.locator("#speak").click(); await waitStopped(page);
    await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
    await page.locator("#audio").evaluate((audio, time) => { audio.currentTime = time; }, position);
    await waitSession(page, saved => Math.abs(saved.position - position) < .01);
    const requests = await page.evaluate(() => window.__speech.requests.length);
    await page.locator("#speak").click();
    await page.waitForFunction(previous => window.__speech.requests.length > previous, requests);
    await page.waitForFunction(() => document.querySelector("#audio").duration >= 40);
    const held = await audioState(page);
    assert.equal(held.time, position, "The native timeline keeps the saved position before new speech arrives");
    assert.equal(held.paused, true);
    assert.equal(held.buffered.length, 0, "Restoring the cursor must not bypass the listening lead");
    await page.waitForFunction(time => window.__system.positions.some(state => state?.position === time && state.duration >= 40), position);
    assert.match(await page.locator('.plyr__time--current').textContent(), new RegExp(`00:${position}`));

    await page.locator('[data-plyr="play"]').click();
    await page.waitForTimeout(100);
    assert.equal((await audioState(page)).time, position, "Play waits at the saved cursor until enough speech is buffered");
    assert.equal((await audioState(page)).buffered.length, 0);
    await page.evaluate(() => window.__system.actions.pause());
    await page.locator('[data-plyr="rewind"]').click();
    await page.waitForFunction(time => {
      const audio = document.querySelector("#audio");
      return audio.readyState >= 2 && !audio.seeking && Math.abs(audio.currentTime - time) < .01;
    }, position - 10);
    assert.equal((await audioState(page)).paused, true, "Rewind during a paused Resume cannot autoplay");
    await page.evaluate(() => window.__system.actions.seekto({ seekTime: 30 }));
    await page.waitForFunction(() => !document.querySelector("#audio").seeking);
    await page.evaluate(() => window.__system.actions.seekbackward({}));
    await page.waitForFunction(() => !document.querySelector("#audio").seeking);
    assert.equal((await audioState(page)).time, 20);
    await page.locator('[data-plyr="play"]').click();
    await page.waitForFunction(() => document.querySelector("#audio").currentTime > 20.1);
    await page.evaluate(() => window.__system.actions.pause());
    const paused = await audioState(page);
    await page.locator("#speak").click(); await waitStopped(page);
    await waitSession(page, saved => Math.abs(saved.position - paused.time) < .05 && saved.rate === 1.5);
    assert.equal((await audioState(page)).paused, true);
    cleanErrors(errors);
  });
}

test("Resume retains a late saved cursor while only the audio prefix has been encoded", { timeout: 20000 }, async t => {
  const app = await openPlayer({ seconds: 20 });
  t.after(async () => { await app.page.evaluate(() => window.__releasePreload?.()); await app.close(); });
  const { page, errors } = app;
  await begin(page); await reply(page); await reply(page); await reply(page);
  await waitSession(page, saved => saved.generated === 3);
  await page.locator("#audio").evaluate(audio => audio.pause());
  await page.locator("#speak").click(); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  await page.locator("#audio").evaluate(audio => { audio.currentTime = 55; });
  await waitSession(page, saved => saved.position === 55);
  await page.evaluate(() => {
    const read = Blob.prototype.arrayBuffer;
    let count = 0;
    Blob.prototype.arrayBuffer = async function () {
      if (this.size === 20 * 48000 && ++count === 2) {
        window.__preloadBlocked = true;
        await new Promise(resolve => { window.__releasePreload = resolve; });
      }
      return read.call(this);
    };
  });
  await page.locator("#speak").click();
  await page.waitForFunction(() => window.__preloadBlocked && document.querySelector("#audio").readyState >= 1);
  await page.waitForTimeout(100);
  const prefix = await audioState(page);
  assert.equal(prefix.duration, 60, "Metadata exposes the full saved timeline before its prefix is re-encoded");
  assert.equal(prefix.time, 55, "The browser cannot clamp a late saved cursor to the first encoded chunk");
  assert.equal(prefix.buffered.length, 0, "The saved cursor is restored without making the beginning playable");
  assert.equal(prefix.paused, true);
  await page.locator("#speak").click(); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  const stopped = await audioState(page);
  assert.equal(stopped.time, 55); assert.equal(stopped.duration, 60); assert.equal(stopped.paused, true);
  await waitSession(page, saved => saved.position === 55 && saved.generated === 3);
  await page.evaluate(() => window.__releasePreload());
  await page.waitForTimeout(50);
  assert.equal((await audioState(page)).src, stopped.src, "Late preload completion cannot replace the saved recording");
  cleanErrors(errors);
});

test("Resume uses the saved recording duration while native WAV metadata is pending", { timeout: 15000 }, async t => {
  const app = await openPlayer({ seconds: 20 }); t.after(app.close);
  const { page, errors } = app;
  await begin(page); await reply(page); await reply(page);
  await waitSession(page, saved => saved.generated === 2);
  // The checkpoint commits before encoding. Establish a playable 35 s cursor
  // before delaying WAV metadata; otherwise the browser clamps it to 20 s.
  await page.waitForFunction(() => {
    const audio = document.querySelector("#audio");
    return audio.duration >= 40 && Array.from({ length: audio.buffered.length }, (_, index) =>
      audio.buffered.start(index) <= 35 && audio.buffered.end(index) > 35).some(Boolean);
  });
  await page.locator("#audio").evaluate(audio => { audio.pause(); audio.currentTime = 35; });
  await waitSession(page, saved => saved.position === 35);
  await page.evaluate(() => {
    const load = HTMLMediaElement.prototype.load;
    let deferred = false;
    HTMLMediaElement.prototype.load = function () {
      if (!deferred && this.id === "audio" && typeof window.__speech.liveUrls.get(this.src) === "number") {
        deferred = true;
        // Delay this recording's metadata using a real native unloaded source,
        // keeping the app's loading lifecycle and saved WAV intact.
        window.__deferredMetadataURL = URL.createObjectURL(new MediaSource());
        this.src = window.__deferredMetadataURL;
      }
      return load.call(this);
    };
  });
  await page.locator("#speak").click(); await waitStopped(page);
  const pending = await audioState(page);
  assert.equal(pending.ready, 0); assert.equal(pending.duration, NaN);
  assert.equal(await page.locator("#speak").isEnabled(), true);
  const requests = await page.evaluate(() => window.__speech.requests.length);
  await page.locator("#speak").click();
  await page.waitForFunction(previous => window.__speech.requests.length > previous && document.querySelector("#audio").readyState >= 1, requests);
  const resumed = await audioState(page);
  assert.equal(resumed.time, 35); assert.equal(resumed.duration, 40);
  assert.equal(resumed.buffered.length, 0); assert.equal(resumed.paused, true);
  await page.locator('[data-plyr="rewind"]').click();
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2 && !document.querySelector("#audio").seeking);
  assert.equal((await audioState(page)).time, 25);
  await page.locator("#speak").click(); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  assert.equal((await audioState(page)).time, 25);
  await page.evaluate(() => URL.revokeObjectURL(window.__deferredMetadataURL));
  cleanErrors(errors);
});
