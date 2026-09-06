import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { startBrowser, openApp, session, waitSession, reply, audioState, PASSAGE, begin, waitStopped, cleanErrors } from "./app-fixtures.mjs";

let environment;
before(async () => { environment = await startBrowser(); });
after(async () => { await environment?.close(); });

test("speech builds a head start, refills after starvation, and respects Pause", { timeout: 25000 }, async t => {
  const app = await openApp(environment, { seconds: 8 });
  t.after(app.close);
  const { page, errors } = app;
  page.setDefaultTimeout(6000);
  await begin(page, Array(6).fill(PASSAGE).join(" "));
  assert.equal(await page.locator("#status").textContent(), "Preparing first speech… 0%");
  await reply(page); await waitSession(page, saved => saved.generated === 1);
  await page.waitForFunction(() => document.querySelector("#audio").duration >= 8);
  await page.waitForTimeout(150);
  assert((await audioState(page)).time < .01, "Eight seconds of audio is not a ten-second listening lead at 1.5×");
  assert.match(await page.locator("#status").textContent(), /Building audio buffer… 17%/);
  await reply(page);
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  assert.equal(await page.locator("#status").textContent(), "Generating speech… 33%");
  const first = await audioState(page);
  assert.equal(first.rate, 1.5);
  assert.equal((await session(page)).generated, 2, "Playback starts while four passages still await generation");
  const starve = async () => {
    const target = await page.locator("#audio").evaluate(audio => {
      audio.currentTime = audio.buffered.end(audio.buffered.length - 1) - 2;
      return audio.currentTime;
    });
    await page.waitForFunction(time => document.querySelector("#audio").currentTime > time + .1, target);
    await page.waitForFunction(() => document.querySelector("#audio").readyState < 3 && !document.querySelector("#audio").seeking);
    return audioState(page);
  };
  const waiting = await starve();
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Building audio buffer… 33%");
  await reply(page); await waitSession(page, saved => saved.generated === 3);
  await page.waitForFunction(() => document.querySelector("#audio").duration >= 24);
  await page.waitForTimeout(150);
  assert(Math.abs((await audioState(page)).time - waiting.time) < .1, "A small refill must not produce another short burst of playback");
  assert.match(await page.locator("#status").textContent(), /Building audio buffer… 50%/);
  await reply(page);
  await page.waitForFunction(time => document.querySelector("#audio").currentTime > time + .15, waiting.time);
  assert.equal(await page.locator("#status").textContent(), "Generating speech… 67%");
  assert.equal((await audioState(page)).src, first.src, "Refilling preserves the continuous native track");
  await starve();
  await page.locator('button[data-plyr="play"]').first().click();
  await page.waitForFunction(() => document.querySelector("#audio").paused);
  const paused = await audioState(page);
  await reply(page); await reply(page); await waitStopped(page);
  assert.equal((await audioState(page)).paused, true, "Completion and buffer recovery cannot override a user pause");
  assert(Math.abs((await audioState(page)).time - paused.time) < .1);
  await page.locator("#audio").evaluate(async audio => { audio.currentTime = audio.duration - .4; audio.playbackRate = 2; await audio.play(); });
  await page.waitForFunction(() => document.querySelector("#audio").ended);
  await page.locator("#audio").evaluate(audio => { audio.currentTime = 0; return audio.play(); });
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .15 && !document.querySelector("#audio").paused);
  assert.equal(await page.locator(".plyr").count(), 1);
  assert.equal(await page.locator("audio").count(), 1);
  cleanErrors(errors);
});

test("the playback head start follows listening speed, not just stored audio duration", { timeout: 15000 }, async t => {
  const app = await openApp(environment, { seconds: 12 });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, Array(3).fill(PASSAGE).join(" "));
  await reply(page); await waitSession(page, saved => saved.generated === 1);
  await page.waitForFunction(() => document.querySelector("#audio").duration >= 12);
  await page.waitForTimeout(150);
  assert((await audioState(page)).time < .01, "Twelve stored seconds is still less than ten listening seconds at 1.5×");
  await page.locator("#audio").evaluate(audio => { audio.playbackRate = 1.25; });
  await page.waitForTimeout(100);
  assert((await audioState(page)).time < .01);
  await page.locator("#speak").click(); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  assert.equal((await audioState(page)).rate, 1.25, "Stop preserves a speed selected while the initial audio buffer was held");
  await page.locator("#new-session").click();
  await waitSession(page, saved => saved.text === "" && saved.audioKeys.length === 0);
  await begin(page, Array(3).fill(PASSAGE).join(" "));
  await reply(page); await waitSession(page, saved => saved.generated === 1);
  await page.waitForFunction(() => document.querySelector("#audio").duration >= 12);
  assert.equal((await audioState(page)).rate, 1.5);
  await page.locator("#audio").evaluate(audio => { audio.playbackRate = 1; });
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  assert.equal((await session(page)).generated, 1, "Slowing playback releases the available lead without another generated passage");
  assert.equal((await audioState(page)).rate, 1);
  await page.locator("#audio").evaluate(audio => { audio.playbackRate = 1.5; });
  await page.locator("#speak").click(); await waitStopped(page);
  assert.equal((await audioState(page)).rate, 1.5);
  cleanErrors(errors);
});

test("short speech and Stop release the head start, and paused Resume keeps 1.5×", { timeout: 20000 }, async t => {
  const app = await openApp(environment, { seconds: 1.2 });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, PASSAGE);
  await page.locator("#audio").evaluate(audio => { audio.playbackRate = 1.25; });
  await reply(page); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  assert.equal((await audioState(page)).rate, 1.25, "Short completion preserves a speed chosen before any speech was buffered");
  await page.locator("#new-session").click();
  await waitSession(page, saved => saved.text === "" && saved.audioKeys.length === 0);
  await begin(page, [PASSAGE, PASSAGE].join(" "));
  await reply(page); await waitSession(page, saved => saved.generated === 1);
  await page.waitForFunction(() => document.querySelector("#audio").duration >= 1.2);
  assert((await audioState(page)).time < .01);
  await page.locator("#speak").click(); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  assert.equal((await audioState(page)).duration, 1.2, "Stop immediately makes the saved partial track playable");
  await page.locator("#audio").evaluate(audio => audio.pause());
  const stopped = await audioState(page);
  await waitSession(page, saved => Math.abs(saved.position - stopped.time) < .05);
  await page.locator("#speak").click(); await reply(page); await waitStopped(page);
  const resumed = await audioState(page);
  assert.equal(resumed.paused, true);
  assert.equal(resumed.rate, 1.5);
  assert(Math.abs(resumed.time - stopped.time) < .05);
  assert(resumed.duration >= 2.4 && resumed.duration < 2.5, "The native codec retains the complete resumed track, including final frame padding");
  assert.equal((await session(page)).generated, 2);
  cleanErrors(errors);
});

test("seeking into generated speech bypasses an initial head-start wait", { timeout: 15000 }, async t => {
  const app = await openApp(environment, { seconds: 4 });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, [PASSAGE, PASSAGE].join(" "));
  await reply(page); await waitSession(page, saved => saved.generated === 1);
  await page.waitForFunction(() => document.querySelector("#audio").duration >= 4);
  assert((await audioState(page)).time < .01);
  await page.locator("#audio").evaluate(audio => { audio.currentTime = 1; });
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > 1.1);
  assert.equal((await session(page)).generated, 1, "An explicit seek can play saved audio while more speech is still being generated");
  assert.equal((await audioState(page)).rate, 1.5);
  await page.locator("#speak").click(); await waitStopped(page);
  cleanErrors(errors);
});

test("one next inference overlaps PCM processing and Stop discards uncommitted lookahead", { timeout: 20000 }, async t => {
  const app = await openApp(environment);
  t.after(async () => { await app.page.evaluate(() => window.__speech.releaseRead?.()); await app.close(); });
  const { page, errors } = app;
  await page.evaluate(() => { window.__speech.holdPCMReads = true; });
  await begin(page); await reply(page);
  await page.waitForFunction(() => window.__speech.readBlocked);
  assert.equal(await page.evaluate(() => window.__speech.requests.length), 2, "The next inference starts while the current PCM is still being processed");
  assert.equal(await page.evaluate(() => window.__speech.pending.length), 1);
  await reply(page);
  await page.waitForTimeout(100);
  assert.equal(await page.evaluate(() => window.__speech.requests.length), 2, "A blocked append cannot start an unbounded queue of inference results");
  assert.deepEqual((await session(page)).audioKeys, [0]);
  await page.locator("#speak").click(); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  const stopped = await audioState(page);
  assert.equal(stopped.duration, 1.2);
  assert.equal((await session(page)).generated, 1, "Only committed speech survives Stop");
  assert.equal(await page.evaluate(() => window.__speech.pending.length), 0);
  assert.equal(await page.evaluate(() => window.__speech.terminated), 1);
  await page.evaluate(() => { window.__speech.holdPCMReads = false; window.__speech.releaseRead(); });
  await page.waitForTimeout(100);
  assert.equal((await audioState(page)).src, stopped.src);
  assert.deepEqual((await session(page)).audioKeys, [0], "Late processing cannot save the discarded next result");
  cleanErrors(errors);
});

test("interrupted initial Play recovers when speech is ready without a refresh", { timeout: 20000 }, async t => {
  const app = await openApp(environment, { initialPlayError: "AbortError", seconds: 20 });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, [PASSAGE, PASSAGE].join(" ")); await reply(page);
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1, undefined, { timeout: 6000 });
  assert.equal((await session(page)).generated, 1);
  assert.equal(await page.locator("#speak").textContent(), "Stop generation", "Interrupted playback recovers before all speech is generated");
  assert.equal((await audioState(page)).rate, 1.5);
  await reply(page); await waitStopped(page);
  cleanErrors(errors);
});

test("denied autoplay keeps a Play prompt and works on a player click without refresh", { timeout: 20000 }, async t => {
  const app = await openApp(environment, { requirePlayerGesture: true });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, PASSAGE); await reply(page); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  await page.waitForFunction(() => /(press|tap).{0,30}play/i.test(document.querySelector("#status").textContent), undefined, { timeout: 6000 });
  assert.equal((await audioState(page)).paused, true);
  assert.equal((await session(page)).generated, 1);
  await page.locator('button[data-plyr="play"]').first().click();
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  cleanErrors(errors);
});

test("pausing before the first speech arrives prevents an automatic playback retry", { timeout: 20000 }, async t => {
  const app = await openApp(environment);
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, [PASSAGE, PASSAGE].join(" "));
  assert.equal((await audioState(page)).paused, false, "The initial native Play is waiting for speech");
  assert.equal(await page.locator("#status").textContent(), "Preparing first speech… 0%");
  await page.locator('button[data-plyr="play"]').first().click();
  await page.waitForFunction(() => document.querySelector("#audio").paused);
  await page.waitForFunction(() => document.querySelector("#status").textContent === "Generating speech… 0%");
  await reply(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 1);
  assert.equal(await page.locator("#status").textContent(), "Generating speech… 50%", "Paused playback does not claim to be waiting for more speech");
  assert.equal((await audioState(page)).paused, true);
  assert((await audioState(page)).time < .01, "Buffered speech does not override a user's pause");
  await reply(page); await waitStopped(page);
  assert.equal((await audioState(page)).paused, true);
  assert((await audioState(page)).time < .01);
  await page.locator('button[data-plyr="play"]').first().click();
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  cleanErrors(errors);
});

test("completed managed streaming becomes playable saved audio without losing playback preferences", { timeout: 20000 }, async t => {
  const app = await openApp(environment, { managedMedia: true, seconds: 20 });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, [PASSAGE, PASSAGE].join(" ")); await reply(page);
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  const streamingSource = (await audioState(page)).src;
  await page.locator('button[data-plyr="play"]').first().click();
  await page.locator("#audio").evaluate(audio => { audio.currentTime = .6; audio.playbackRate = 1.25; });
  await waitSession(page, saved => Math.abs(saved.position - .6) < .05 && saved.rate === 1.25);
  await reply(page); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  const completed = await audioState(page);
  assert.notEqual(completed.src, streamingSource, "The completed managed stream is replaced with saved audio");
  assert.equal(completed.duration, 40); assert.equal(completed.rate, 1.25); assert.equal(completed.paused, true);
  assert(Math.abs(completed.time - .6) < .05);
  assert.equal(await page.evaluate(() => window.__speech.liveUrls.size), 1, "The managed source is released after handoff");
  assert.deepEqual((await session(page)).audioKeys, [0, 1]);
  await page.locator('button[data-plyr="play"]').first().click();
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .8);
  cleanErrors(errors);
});

test("active managed playback continues through completion and still honors Pause", { timeout: 20000 }, async t => {
  const app = await openApp(environment, { managedMedia: true, seconds: 20 });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, [PASSAGE, PASSAGE].join(" ")); await reply(page);
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  const streaming = await audioState(page);
  await reply(page); await waitStopped(page);
  await page.waitForFunction(time => document.querySelector("#audio").currentTime > time + .15, streaming.time);
  const completed = await audioState(page);
  assert.notEqual(completed.src, streaming.src);
  assert.equal(completed.duration, 40); assert.equal(completed.paused, false); assert.equal(completed.rate, 1.5);
  await page.locator('button[data-plyr="play"]').first().click();
  await page.waitForFunction(() => document.querySelector("#audio").paused);
  const paused = await audioState(page);
  await waitSession(page, saved => Math.abs(saved.position - paused.time) < .05);
  await page.waitForTimeout(150);
  assert.equal((await audioState(page)).paused, true, "A user pause after handoff is not mistaken for an internal source-change pause");
  assert(Math.abs((await audioState(page)).time - paused.time) < .05);
  await page.locator('button[data-plyr="play"]').first().click();
  await page.waitForFunction(time => document.querySelector("#audio").currentTime > time + .1, paused.time);
  await page.locator("#new-session").click();
  await waitSession(page, saved => saved.text === "" && saved.audioKeys.length === 0);
  await begin(page, [PASSAGE, PASSAGE].join(" "));
  await page.locator('button[data-plyr="play"]').first().click();
  await page.waitForFunction(() => document.querySelector("#audio").paused);
  await reply(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 1);
  await page.waitForTimeout(100);
  assert.equal((await audioState(page)).paused, true, "An old source change cannot swallow a new session's Pause");
  assert((await audioState(page)).time < .01);
  await reply(page); await waitStopped(page);
  assert.equal((await audioState(page)).paused, true);
  cleanErrors(errors);
});

test("late external player initialization preserves ongoing playback", { timeout: 25000 }, async t => {
  const app = await openApp(environment, { delayPlyr: true, seconds: 20 });
  t.after(() => { app.releasePlyr(); return app.close(); });
  const { page, errors } = app;
  await begin(page);
  await reply(page);
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .15);
  assert.equal(await page.locator(".plyr").count(), 0);
  const before = await audioState(page);
  await page.locator("#audio").evaluate(audio => { audio.playbackRate = 1.5; });
  app.releasePlyr();
  await page.waitForSelector(".plyr");
  await page.waitForFunction(time => document.querySelector("#audio").currentTime > time + .15, before.time, { timeout: 5000 });
  const after = await audioState(page);
  assert.equal(after.paused, false, "Loading player controls does not pause narration");
  assert.equal(after.src, before.src);
  assert.equal(after.rate, 1.5, "Late controls preserve the selected speed");
  assert.deepEqual(app.failedRequests, []);
  cleanErrors(errors);
});

test("pause, seek, stop, reload and resume preserve one saved narration", { timeout: 35000 }, async t => {
  const app = await openApp(environment);
  t.after(app.close);
  const { page, errors } = app;
  await begin(page);
  await reply(page); await reply(page);
  await waitSession(page, saved => saved.generated === 2);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 1);
  await page.locator("#audio").evaluate(audio => { audio.pause(); audio.playbackRate = 1.5; });
  await page.locator("#speak").click();
  await waitStopped(page);
  await page.waitForFunction(() => Math.abs(document.querySelector("#audio").duration - 2.4) < .01);
  await page.locator("#audio").evaluate(audio => { audio.currentTime = 1.35; });
  await waitSession(page, saved => Math.abs(saved.position - 1.35) < .05);
  assert.equal((await audioState(page)).paused, true);
  assert.equal((await audioState(page)).rate, 1.5);
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  assert(Math.abs((await audioState(page)).time - 1.35) < .05, "Reload restores the global seek position");
  assert.equal((await audioState(page)).duration, 2.4);
  assert.equal((await audioState(page)).rate, 1.5, "Reload preserves playback speed");
  assert.equal(await page.locator("#text").isDisabled(), true);
  await page.locator("#speak").click();
  await reply(page); await reply(page);
  await waitStopped(page);
  const saved = await session(page);
  assert.equal(saved.generated, saved.parts.length);
  assert.deepEqual(saved.audioKeys, [0, 1, 2, 3]);
  assert.equal((await audioState(page)).paused, true, "Resume generation respects paused playback");
  assert.equal((await audioState(page)).rate, 1.5, "Resume preserves playback speed");
  assert(Math.abs((await audioState(page)).time - 1.35) < .05);
  const resumedRequests = await page.evaluate(() => window.__speech.requests.map(value => value.text));
  assert.deepEqual(resumedRequests, saved.parts.slice(2), "Resume requests only the unfinished text");
  await page.locator("#new-session").click();
  await waitSession(page, saved => saved.text === "" && saved.audioKeys.length === 0);
  assert.equal(await page.locator("#output").isVisible(), false);
  assert.equal(await page.locator("#text").isEditable(), true);
  assert.equal(await page.evaluate(() => window.__speech.liveUrls.size), 0);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector("#text").disabled);
  assert.equal(await page.locator("#text").inputValue(), "");
  assert.equal(await page.locator("audio").count(), 1);
  assert.equal(await page.locator("#previous,#next,[download]").count(), 0);
  cleanErrors(errors);
});

test("stopping while the model is loading leaves a usable empty checkpoint", { timeout: 15000 }, async t => {
  const app = await openApp(environment);
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, PASSAGE);
  await page.locator("#speak").click();
  await waitStopped(page);
  const saved = await session(page);
  assert.equal(saved.generated, 0); assert.deepEqual(saved.audioKeys, []);
  assert.equal(await page.locator("#output").isVisible(), false);
  assert.equal(await page.evaluate(() => window.__speech.pending.length), 0);
  assert.equal(await page.evaluate(() => window.__speech.liveUrls.size), 0);
  await page.locator("#speak").click(); await reply(page); await waitStopped(page);
  assert.equal((await session(page)).generated, 1);
  cleanErrors(errors);
});

test("worker failure keeps completed audio and resumes at the checkpoint", { timeout: 20000 }, async t => {
  const app = await openApp(environment);
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, [PASSAGE, PASSAGE].join(" "));
  await reply(page); await reply(page, "Speech device was lost. Resume to try again.");
  await waitStopped(page);
  assert.match(await page.locator("#status").textContent(), /Speech device was lost/);
  assert.equal((await session(page)).generated, 1);
  assert.deepEqual((await session(page)).audioKeys, [0]);
  await page.locator("#speak").click(); await reply(page); await waitStopped(page);
  assert.equal((await session(page)).generated, 2);
  assert.deepEqual((await session(page)).audioKeys, [0, 1]);
  const requests = await page.evaluate(() => window.__speech.requests.map(value => value.text));
  assert.equal(requests.length, 3);
  assert.equal(requests[1], requests[2], "Retry begins with the failed passage");
  cleanErrors(errors, [/Speech device was lost/]);
});

test("a failed audio save does not advance or partially commit its checkpoint", { timeout: 20000 }, async t => {
  const app = await openApp(environment, { fault: "save-audio" });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, PASSAGE); await reply(page); await waitStopped(page);
  const failed = await session(page);
  assert.equal(failed.text, PASSAGE);
  assert.equal(failed.generated, 0); assert.deepEqual(failed.audioKeys, []);
  assert.match(await page.locator("#status").textContent(), /save|abort/i);
  await page.locator("#speak").click(); await reply(page); await waitStopped(page);
  const retried = await session(page);
  assert.equal(retried.generated, 1); assert.deepEqual(retried.audioKeys, [0]);
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 1);
  assert.equal((await audioState(page)).duration, 1.2);
  cleanErrors(errors, [/Could not save this session|AbortError/i]);
});

test("editing after a zero-audio stop replaces the queued text", { timeout: 15000 }, async t => {
  const app = await openApp(environment);
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, PASSAGE); await page.locator("#speak").click(); await waitStopped(page);
  assert.equal(await page.locator("#text").isEditable(), true);
  await begin(page, "This replacement is what should be read.");
  await reply(page); await waitStopped(page);
  assert.deepEqual(await page.evaluate(() => window.__speech.completed), ["This replacement is what should be read."]);
  assert.equal((await session(page)).text, "This replacement is what should be read.");
  cleanErrors(errors);
});

test("startup storage failure stays explicit and does not offer generation", { timeout: 10000 }, async t => {
  const app = await openApp(environment, { fault: "open" });
  t.after(app.close);
  assert.match(await app.page.locator("#status").textContent(), /storage is unavailable/);
  assert.equal(await app.page.locator("#speak").isDisabled(), true);
  assert.equal(await app.page.locator("#text").isDisabled(), true);
  cleanErrors(app.errors, [/Session storage is unavailable/]);
});

test("a device without WebGPU can save a draft but cannot start speech", { timeout: 10000 }, async t => {
  const app = await openApp(environment, { gpu: false });
  t.after(app.close);
  const { page, errors } = app;
  await page.locator("#text").fill("A draft on a device without WebGPU.");
  await waitSession(page, saved => saved.text === "A draft on a device without WebGPU.");
  assert.equal(await page.locator("#speak").isDisabled(), true);
  assert.match(await page.locator("#status").textContent(), /WebGPU is unavailable/);
  assert.equal(await page.evaluate(() => window.__speech.requests.length), 0);
  await page.reload();
  await page.waitForFunction(() => !document.querySelector("#text").disabled);
  assert.equal(await page.locator("#text").inputValue(), "A draft on a device without WebGPU.");
  cleanErrors(errors);
});

test("saved speech remains playable when the GPU later becomes unavailable", { timeout: 20000 }, async t => {
  const app = await openApp(environment);
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, PASSAGE); await reply(page); await waitStopped(page);
  await page.evaluate(() => sessionStorage.setItem("test-gpu", "reject"));
  await page.reload();
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  assert.match(await page.locator("#status").textContent(), /WebGPU is unavailable/);
  assert.equal(await page.locator("#speak").isDisabled(), true);
  await page.locator("#audio").evaluate(audio => audio.play());
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1);
  assert.equal((await audioState(page)).duration, 1.2);
  cleanErrors(errors);
});

test("a missing native encoder falls back to a saved whole track", { timeout: 15000 }, async t => {
  const app = await openApp(environment, { noEncoder: true });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, [PASSAGE, PASSAGE].join(" "));
  await reply(page); await waitSession(page, saved => saved.generated === 1);
  assert.equal(await page.locator("#output").isVisible(), false);
  await reply(page); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  assert.equal((await audioState(page)).duration, 2.4);
  assert.equal(await page.locator("#output").isVisible(), true);
  cleanErrors(errors);
});

test("a second tab waits for the session owner, then loads the saved draft", { timeout: 20000 }, async t => {
  const app = await openApp(environment);
  t.after(app.close);
  const { page, context, errors } = app;
  await page.locator("#text").fill("The first tab owns this draft.");
  await waitSession(page, saved => saved.text === "The first tab owns this draft.");
  const second = await context.newPage();
  await second.goto(environment.url, { waitUntil: "domcontentloaded" });
  await second.waitForFunction(() => /another|other.*tab/i.test(document.querySelector("#status").textContent));
  assert.equal(await second.locator("#text").isDisabled(), true);
  assert.equal(await second.locator("#speak").isDisabled(), true);
  await page.close();
  await second.waitForFunction(() => !document.querySelector("#text").disabled);
  assert.equal(await second.locator("#text").inputValue(), "The first tab owns this draft.");
  cleanErrors(errors);
});

test("back navigation reacquires ownership and loads the other tab's latest text", { timeout: 20000 }, async t => {
  const app = await openApp(environment);
  t.after(app.close);
  const { page, context, errors } = app;
  await page.locator("#text").fill("The original draft.");
  await waitSession(page, saved => saved.text === "The original draft.");
  const second = await context.newPage();
  await second.goto(environment.url, { waitUntil: "domcontentloaded" });
  assert.equal(await second.locator("#text").isDisabled(), true);
  await page.goto(environment.url + "/scripts/check-playback.html");
  await second.waitForFunction(() => !document.querySelector("#text").disabled);
  await second.locator("#text").fill("The newer draft from the other tab.");
  await waitSession(second, saved => saved.text === "The newer draft from the other tab.");
  await second.close();
  await page.goBack({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !document.querySelector("#text").disabled);
  assert.equal(await page.locator("#text").inputValue(), "The newer draft from the other tab.");
  cleanErrors(errors);
});

test("more than 10,000 words can start and retain the full text after Stop", { timeout: 20000 }, async t => {
  const app = await openApp(environment);
  t.after(app.close);
  const { page, errors } = app, text = Array(10001).fill("word").join(" ");
  await page.locator("#text").fill(text);
  assert.equal(await page.locator("#speak").isEnabled(), true);
  assert.equal(await page.locator("#word-count").textContent(), "10,001 words");
  await page.locator("#speak").click(); await reply(page);
  await waitSession(page, saved => saved.generated === 1);
  await page.locator("#speak").click(); await waitStopped(page);
  const saved = await session(page);
  assert.equal(saved.text, text);
  assert.equal(saved.parts.join(" "), text, "All pasted text remains planned for generation");
  assert.equal(saved.generated, 1); assert.deepEqual(saved.audioKeys, [0]);
  assert.equal(await page.locator("#speak").textContent(), "Resume generation");
  cleanErrors(errors);
});

test("10,000 words complete with bounded native buffering and one persistent track", { timeout: 120000 }, async t => {
  const app = await openApp(environment, { delay: 1, seconds: 1 });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, Array(10000).fill("word").join(" "));
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .05);
  await page.locator("#audio").evaluate(audio => audio.pause());
  const source = (await audioState(page)).src;
  const saved = await waitSession(page, saved => saved.generated > 0 && saved.generated === saved.parts.length, 90000);
  await waitStopped(page);
  const audio = await audioState(page);
  const metrics = await page.evaluate(() => ({
    liveUrls: [...window.__speech.liveUrls.values()], peakReadBytes: window.__speech.peakReadBytes,
    completedText: window.__speech.completed.join(" "), requests: window.__speech.requests.length,
  }));
  assert.equal(metrics.completedText, Array(10000).fill("word").join(" "), "Every word is synthesized once and in order");
  assert.equal(metrics.requests, saved.generated);
  assert.equal(saved.audioKeys.length, saved.generated);
  assert(saved.generated > 100, "Long narration contains enough audio to exercise buffer eviction");
  assert(Math.abs(audio.duration - saved.generated) < .1);
  assert.equal(audio.src, source); assert.equal(audio.paused, true);
  assert.deepEqual(metrics.liveUrls, ["MediaSource"], "Generation does not build a second whole-track PCM object URL");
  assert(metrics.peakReadBytes <= 48044, "Streaming reads saved PCM in individual chunks");
  assert(audio.buffered.reduce((sum, [start, end]) => sum + end - start, 0) < 100, "Native decoder buffer stays bounded on a long narration");
  await page.locator("#audio").evaluate(audio => { audio.currentTime = audio.duration - 3; });
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  assert((await audioState(page)).buffered.some(([start, end]) => start <= audio.duration - 3 && end >= audio.duration - 3), "Seeking outside the retained window restores that audio");
  await page.locator("#audio").evaluate(audio => { audio.currentTime = 1; });
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  assert((await audioState(page)).buffered.some(([start, end]) => start <= 1 && end >= 1));
  t.diagnostic(JSON.stringify({ words: 10000, chunks: saved.generated, seconds: audio.duration, buffered: audio.buffered, largestPCMRead: metrics.peakReadBytes }));
  cleanErrors(errors);
});

test("Stop during native encoder finalization is a normal cancellation", { timeout: 20000 }, async t => {
  const app = await openApp(environment, { holdFinish: true });
  t.after(async () => { await app.page.evaluate(() => window.__speech.releaseFlush?.()); await app.close(); });
  const { page, errors } = app;
  await begin(page, PASSAGE); await reply(page);
  await page.waitForFunction(() => window.__speech.flushing);
  await page.locator("#speak").click(); await waitStopped(page);
  assert.match(await page.locator("#status").textContent(), /Stopped.*saved/i);
  assert.equal((await session(page)).generated, 1);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  assert.equal((await audioState(page)).duration, 1.2);
  await page.evaluate(() => window.__speech.releaseFlush?.());
  cleanErrors(errors);
});

test("storage failure remains visible when fallback autoplay is also denied", { timeout: 20000 }, async t => {
  const app = await openApp(environment, { fault: "quota", noEncoder: true, autoplayDenied: true });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page, [PASSAGE, PASSAGE].join(" "));
  await reply(page); await reply(page); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  assert.match(await page.locator("#status").textContent(), /Storage quota reached/);
  assert.equal((await session(page)).generated, 1);
  assert.deepEqual((await session(page)).audioKeys, [0]);
  cleanErrors(errors, [/Storage quota reached/]);
});

test("Stop during saved audio preload preserves the whole track, position and speed", { timeout: 20000 }, async t => {
  const app = await openApp(environment);
  t.after(async () => { await app.page.evaluate(() => window.__speech.releaseRead?.()); await app.close(); });
  const { page, errors } = app;
  await begin(page); await reply(page); await reply(page);
  await waitSession(page, saved => saved.generated === 2);
  await page.locator("#audio").evaluate(audio => audio.pause());
  await page.locator("#speak").click(); await waitStopped(page);
  await page.waitForFunction(() => Math.abs(document.querySelector("#audio").duration - 2.4) < .01);
  await page.locator("#audio").evaluate(audio => { audio.currentTime = 1.35; audio.playbackRate = 1.5; });
  await waitSession(page, saved => Math.abs(saved.position - 1.35) < .05 && saved.rate === 1.5);
  const requests = await page.evaluate(() => window.__speech.requests.length);
  await page.evaluate(() => { window.__speech.holdPCMReads = true; });
  await page.locator("#speak").click();
  await page.waitForFunction(() => window.__speech.readBlocked);
  await page.locator("#speak").click(); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  const stopped = await audioState(page), saved = await session(page);
  assert.equal(stopped.duration, 2.4); assert.equal(stopped.paused, true); assert.equal(stopped.rate, 1.5);
  assert(Math.abs(stopped.time - 1.35) < .05);
  assert.equal(saved.generated, 2); assert.deepEqual(saved.audioKeys, [0, 1]);
  assert.equal(await page.evaluate(() => window.__speech.requests.length), requests, "Cancelling preload does not restart synthesis");
  await page.evaluate(() => { window.__speech.holdPCMReads = false; window.__speech.releaseRead(); });
  await page.waitForTimeout(50);
  assert.equal((await audioState(page)).src, stopped.src, "Late preload completion cannot replace the restored track");
  assert.match(await page.locator("#status").textContent(), /Stopped.*saved/i);
  cleanErrors(errors);
});

test("native decoder failure restores committed audio and generation can resume", { timeout: 20000 }, async t => {
  const app = await openApp(environment, { seconds: 20 });
  t.after(app.close);
  const { page, errors } = app;
  await begin(page); await reply(page); await reply(page);
  await waitSession(page, saved => saved.generated === 2);
  await page.waitForFunction(() => document.querySelector("#audio").currentTime > .1 && window.__speech.pending.length > 0);
  const playing = await audioState(page);
  await page.locator("#audio").evaluate(audio => {
    Object.defineProperty(audio, "error", { configurable: true, value: { code: 3, message: "Injected native decoder failure." } });
    try { audio.dispatchEvent(new Event("error")); }
    finally { delete audio.error; }
  });
  await waitStopped(page);
  await page.waitForFunction(() => document.querySelector("#audio").readyState >= 2);
  const recovered = await audioState(page), saved = await session(page);
  assert.match(await page.locator("#status").textContent(), /Injected native decoder failure/);
  assert.equal(saved.generated, 2); assert.deepEqual(saved.audioKeys, [0, 1]);
  assert.equal(recovered.duration, 40);
  assert.notEqual(recovered.src, playing.src, "A playable WAV replaces the failed MediaSource");
  assert(recovered.time >= playing.time - .1, "Recovery keeps the current place");
  assert.deepEqual(await page.evaluate(() => [...window.__speech.liveUrls.values()]), [40 * 48000 + 44]);
  await page.locator("#audio").evaluate(audio => audio.pause());
  await page.locator("#speak").click(); await reply(page); await reply(page); await waitStopped(page);
  assert.equal((await session(page)).generated, 4);
  assert.deepEqual((await session(page)).audioKeys, [0, 1, 2, 3]);
  cleanErrors(errors, [/Injected native decoder failure/]);
});

for (const name of ["stream", "buffering", "short", "position", "cancel", "failure", "long"]) {
  test(`native playback fixture: ${name}`, { timeout: 65000 }, async t => {
    const context = await environment.browser.newContext(), page = await context.newPage(), errors = [];
    t.after(() => context.close());
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(environment.url + "/scripts/check-playback.html");
    await page.locator(`button[data-test="${name}"]`).click();
    await page.waitForFunction(name => {
      const result = document.querySelector("#result");
      return result.dataset.test === name && ["passed", "failed"].includes(result.dataset.state);
    }, name, { timeout: 60000 });
    assert.equal(await page.locator("#result").getAttribute("data-state"), "passed", await page.locator("#result").textContent());
    assert.doesNotMatch(await page.locator("#result").textContent(), /UNHANDLED|Playback:/);
    cleanErrors(errors);
  });
}
