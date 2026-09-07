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
