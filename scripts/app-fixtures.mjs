import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright-core";

const root = resolve(fileURLToPath(new URL("../", import.meta.url)));
const mime = { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".svg": "image/svg+xml" };

export async function startBrowser({ args = [] } = {}) {
  const server = createServer(async (request, response) => {
    if (request.url === "/favicon.ico") { response.writeHead(204).end(); return; }
    const path = resolve(root, "." + new URL(request.url, "http://localhost").pathname);
    if (!path.startsWith(root.endsWith(sep) ? root : root + sep) && path !== root) { response.writeHead(403).end(); return; }
    try {
      const file = path === root ? resolve(root, "index.html") : path;
      const bytes = await readFile(file);
      response.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        ...(process.env.NARRATE_TEST_ISOLATION === "0" ? {} : {
          "Cross-Origin-Opener-Policy": "same-origin",
          "Cross-Origin-Embedder-Policy": "require-corp",
          "Cross-Origin-Resource-Policy": "same-origin",
        }),
      }).end(bytes);
    } catch { response.writeHead(404).end(); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const browser = await chromium.launch({
      headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
      args: ["--no-sandbox", ...args],
    });
    return { browser, url: `http://127.0.0.1:${server.address().port}`, close: async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); } };
  } catch (error) { server.close(); throw error; }
}

// Control speech arrival, without replacing the native encoder, MediaSource, player,
// IndexedDB, or audio element. Failure injection uses real aborted transactions.
function installControls(options) {
  const controls = window.__speech = {
    requests: [], completed: [], pending: [], workers: [], terminated: 0,
    delay: options.delay ?? null, seconds: options.seconds ?? 1.2,
    fault: options.fault || null, events: [], liveUrls: new Map(), peakReadBytes: 0,
  };
  Object.defineProperty(navigator, "gpu", { configurable: true, value: options.gpu === false ? undefined : {
    requestAdapter: async () => { if (options.gpu === "reject" || sessionStorage.getItem("test-gpu") === "reject") throw new Error("Adapter unavailable"); return {}; },
  } });
  if (options.noEncoder) window.AudioEncoder = undefined;
  if (options.managedMedia) {
    // Keep native MediaSource decoding; expose only the managed lifecycle flag.
    window.ManagedMediaSource = class extends MediaSource { get streaming() { return true; } };
  }
  if (options.autoplayDenied) HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException("Playback needs a user gesture.", "NotAllowedError"));
  if (options.initialPlayError || options.requirePlayerGesture) {
    const play = HTMLMediaElement.prototype.play;
    let interrupted = false;
    document.addEventListener("click", event => {
      if (event.isTrusted && event.target.closest('button[data-plyr="play"]')) controls.playerGesture = true;
    }, true);
    HTMLMediaElement.prototype.play = function () {
      if (this.id === "audio") {
        if (options.requirePlayerGesture && !controls.playerGesture) return Promise.reject(new DOMException("Playback needs a user gesture.", "NotAllowedError"));
        if (options.initialPlayError && !interrupted && controls.liveUrls.get(this.src) === "MediaSource") {
          interrupted = true;
          return Promise.reject(new DOMException("Initial streaming playback was interrupted.", options.initialPlayError));
        }
      }
      return play.call(this);
    };
  }
  if (options.holdFinish && window.AudioEncoder) {
    const flush = AudioEncoder.prototype.flush;
    AudioEncoder.prototype.flush = function () {
      const flushed = flush.call(this);
      controls.flushing = true;
      const gate = new Promise(resolve => { controls.releaseFlush = resolve; });
      return flushed.then(() => gate);
    };
  }
  const nativeOpen = indexedDB.open.bind(indexedDB);
  indexedDB.open = (...args) => {
    if (controls.fault === "open") throw new DOMException("Session storage is unavailable.", "SecurityError");
    return nativeOpen(...args);
  };
  const put = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (value, key) {
    if (controls.fault === "quota" && key === 1) throw new DOMException("Storage quota reached.", "QuotaExceededError");
    const request = put.call(this, value, key);
    if (controls.fault === "save-audio" && value instanceof Blob) {
      controls.fault = null;
      queueMicrotask(() => this.transaction.abort());
    }
    return request;
  };
  const arrayBuffer = Blob.prototype.arrayBuffer;
  Blob.prototype.arrayBuffer = function () {
    controls.peakReadBytes = Math.max(controls.peakReadBytes, this.size);
    if (controls.holdPCMReads && this.size >= 48000) {
      controls.readBlocked = true;
      const gate = new Promise(resolve => { controls.releaseRead = resolve; });
      return arrayBuffer.call(this).then(async bytes => { await gate; return bytes; });
    }
    return arrayBuffer.call(this);
  };
  const create = URL.createObjectURL.bind(URL), revoke = URL.revokeObjectURL.bind(URL);
  URL.createObjectURL = value => { const url = create(value); controls.liveUrls.set(url, value instanceof Blob ? value.size : "MediaSource"); return url; };
  URL.revokeObjectURL = url => { controls.liveUrls.delete(url); revoke(url); };
  const NativeWorker = Worker;
  window.Worker = class {
    constructor(url, config) {
      if (!String(url).includes("speech-worker.js")) return new NativeWorker(url, config);
      this.dead = false; controls.workers.push(this);
    }
    postMessage(message) {
      controls.requests.push(message);
      const job = { worker: this, message };
      controls.pending.push(job);
      this.onmessage?.({ data: { type: "status", id: message.id, message: "Generating speech…" } });
      if (controls.delay !== null) setTimeout(() => controls.reply(job), controls.delay);
    }
    terminate() { this.dead = true; controls.terminated++; controls.pending = controls.pending.filter(job => job.worker !== this); }
  };
  controls.reply = (job = controls.pending[0], error) => {
    if (!job || job.worker.dead) return false;
    controls.pending = controls.pending.filter(value => value !== job);
    if (error) job.worker.onmessage?.({ data: { type: "error", id: job.message.id, message: error } });
    else {
      const pcm = new Uint8Array(Math.round(controls.seconds * 24000) * 2), view = new DataView(pcm.buffer);
      for (let i = 0; i < pcm.byteLength / 2; i++) view.setInt16(i * 2, Math.round(Math.sin(i * 2 * Math.PI * 220 / 24000) * 3000), true);
      controls.completed.push(job.message.text);
      job.worker.onmessage?.({ data: { type: "audio", id: job.message.id, pcm, sampleRate: 24000, modelId: job.message.modelId } });
    }
    return true;
  };
  for (const event of ["playing", "waiting", "ended", "pause", "seeking", "seeked"]) {
    document.addEventListener(event, target => {
      const audio = target.target;
      if (audio.id === "audio") controls.events.push({ event, time: audio.currentTime,
        seeking: audio.seeking, ready: audio.readyState,
        bufferedEnd: audio.buffered.length ? audio.buffered.end(audio.buffered.length - 1) : 0,
      });
    }, true);
  }
}

export async function openApp(environment, options = {}) {
  const context = await environment.browser.newContext({ viewport: { width: 393, height: 852 }, isMobile: true, hasTouch: true });
  const page = await context.newPage(), errors = [], failedRequests = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  page.on("requestfailed", request => failedRequests.push({ url: request.url(), error: request.failure()?.errorText }));
  await page.addInitScript(installControls, options);
  let releasePlyr;
  if (options.delayPlyr) {
    const gate = new Promise(resolve => { releasePlyr = resolve; });
    await page.route("**/vendor/plyr/plyr.js*", async route => { await gate; await route.continue(); });
  }
  await page.goto(environment.url + (options.diagnostics ? '/?diagnostics=1' : ''), { waitUntil: "domcontentloaded" });
  if (options.fault !== "open") await page.waitForFunction(() => !document.querySelector("#text").disabled);
  return { page, context, errors, failedRequests, releasePlyr, close: () => context.close() };
}

export async function session(page) {
  return page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open("narrate.sh");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction("current"), store = transaction.objectStore("current");
      const input = store.get("input"), progress = store.get("session"), keys = store.getAllKeys();
      transaction.oncomplete = () => { db.close(); resolve({ ...input.result, ...progress.result, audioKeys: keys.result.filter(key => typeof key === "number") }); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  }));
}

export async function waitSession(page, predicate, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await session(page); if (predicate(value)) return value; await new Promise(resolve => setTimeout(resolve, 30)); }
  throw new Error("Saved session did not reach expected state: " + JSON.stringify(await session(page)));
}
export async function reply(page, error) {
  await page.waitForFunction(() => window.__speech.pending.length > 0);
  assert.equal(await page.evaluate(error => window.__speech.reply(undefined, error), error), true);
}
export const audioState = page => page.locator("#audio").evaluate(audio => ({
  time: audio.currentTime, duration: audio.duration, paused: audio.paused, ended: audio.ended,
  ready: audio.readyState, src: audio.src, rate: audio.playbackRate,
  buffered: Array.from({ length: audio.buffered.length }, (_, i) => [audio.buffered.start(i), audio.buffered.end(i)]),
}));
export const PASSAGE = "The reader can listen to each sentence while the next passage is prepared, keeping a clear place in the text and returning whenever it is convenient.";
export async function begin(page, text = Array(4).fill(PASSAGE).join(" ")) {
  const requests = await page.evaluate(() => window.__speech.requests.length);
  await page.locator("#text").fill(text);
  await page.locator("#speak").click();
  await page.waitForFunction(previous => window.__speech.requests.length > previous, requests);
}
export async function waitStopped(page) {
  await page.waitForFunction(() => !document.querySelector("#speak").textContent.includes("Stop") && !document.querySelector("#new-session").disabled);
}
export function cleanErrors(errors, expected = []) {
  assert.deepEqual(errors.filter(error => !expected.some(pattern => pattern.test(error))), [], "No unexpected browser errors");
}
