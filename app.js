import { getStreamConfig, StreamingPlayer } from "./streaming-player.js?v=5";

const $ = (id) => document.getElementById(id);
const text = $("text"), button = $("speak"), status = $("status"), audio = $("audio");
const MAX_WORDS = 10000;
const freshSession = () => ({ text: "", parts: [], generated: 0, position: 0, rate: 1 });
let session = freshSession(), database, gpuReady = false, running = false, cancelled = false;
let worker, pending, jobId = 0, audioUrl, playbackRequest = 0, loadingAudio = false;
let writes = Promise.resolve(), saveTimer, lastPositionSave = 0, wakeLock;
let savedText, savedParts, savedPosition, savedRate;
let streamConfig, streaming, playbackError, playAfterStop = false;

const result = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});
const read = (key) => result(database.transaction("current").objectStore("current").get(key));

// One store, one session. Audio and its checkpoint are committed together.
function save(blob, index, clear = false) {
  const current = session;
  writes = writes.catch(() => {}).then(() => {
    if (current !== session) return;
    return new Promise((resolve, reject) => {
      const transaction = database.transaction("current", "readwrite");
      const store = transaction.objectStore("current");
      const { text, parts, ...progress } = current;
      if (clear) store.clear();
      if (clear || text !== savedText || parts !== savedParts) store.put({ text, parts }, "input");
      if (blob) store.put(blob, index);
      store.put({ ...progress, generated: blob ? index + 1 : current.generated }, "session");
      transaction.oncomplete = () => {
        if (blob) current.generated = index + 1;
        savedText = text; savedParts = parts; savedPosition = progress.position; savedRate = progress.rate;
        resolve();
      };
      transaction.onabort = transaction.onerror = () => reject(transaction.error || new Error("Could not save this session."));
    });
  });
  return writes;
}

function report(error) {
  console.error(error);
  status.textContent = error.message || String(error);
}
function words() { return text.value.trim().split(/\s+/u).filter(Boolean).length; }
function render() {
  const count = words(), complete = session.parts.length > 0 && session.generated === session.parts.length;
  $("word-count").textContent = `${count.toLocaleString()} / 10,000 words`;
  text.disabled = !database || running || session.generated > 0;
  button.disabled = !database || !gpuReady || cancelled && running || !running && (!count || count > MAX_WORDS || complete);
  button.textContent = running ? "Stop generation" : complete ? "Ready to play" : session.generated ? "Resume generation" : "Read aloud";
  $("new-session").disabled = !database || running || !session.text;
}

function splitText(value) {
  const parts = [];
  const append = (part) => {
    const last = parts.length - 1;
    if (last >= 0 && parts[last].length + part.length < 180) parts[last] += " " + part;
    else parts.push(part);
  };
  for (const { segment } of new Intl.Segmenter("en", { granularity: "sentence" }).segment(value)) {
    let remaining = segment.trim();
    while (remaining.length > 180) {
      const boundary = remaining.lastIndexOf(" ", 180);
      const end = boundary > 0 ? boundary : 180;
      append(remaining.slice(0, end));
      remaining = remaining.slice(end).trim();
    }
    if (remaining) append(remaining);
  }
  return parts;
}

function audioHeader(bytes, sampleRate = 24000) {
  const buffer = new ArrayBuffer(44), view = new DataView(buffer);
  const ascii = (offset, value) => [...value].forEach((character, i) => view.setUint8(offset + i, character.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, bytes + 36, true); ascii(8, "WAVEfmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); ascii(36, "data");
  view.setUint32(40, bytes, true);
  return buffer;
}

// Compose saved blobs into one track without decoding or copying their PCM into JS.
async function showAudio(startPlayback = false, keepStatus = false) {
  const request = ++playbackRequest, current = session, count = session.generated;
  if (!count) return;
  try {
    const chunks = await result(database.transaction("current").objectStore("current")
      .getAll(IDBKeyRange.bound(0, count - 1)));
    if (request !== playbackRequest || current !== session) return;
    if (chunks.length !== count || chunks.some(blob => !(blob instanceof Blob) || blob.size < 44)) {
      throw new Error("Saved audio is missing. Start a new session to regenerate it.");
    }
    const bytes = chunks.reduce((total, blob) => total + blob.size - 44, 0);
    const track = new Blob([audioHeader(bytes), ...chunks.map(blob => blob.slice(44))], { type: "audio/wav" });
    const position = (audioUrl || streaming) && !loadingAudio ? audio.currentTime : current.position;
    const autoplay = audioUrl || streaming ? !audio.paused : startPlayback;
    const previousUrl = audioUrl, playbackRate = current.rate;
    loadingAudio = true;
    audio.pause();
    streaming?.dispose();
    streaming = null;
    session.position = position;
    audioUrl = URL.createObjectURL(track);
    audio.onloadedmetadata = async () => {
      if (request !== playbackRequest) return;
      audio.currentTime = Math.min(position, Number.isFinite(audio.duration) ? audio.duration : position);
      audio.playbackRate = playbackRate;
      loadingAudio = false;
      if (autoplay) await audio.play().catch(() => { if (!keepStatus) status.textContent = "Press play to listen."; });
    };
    audio.src = audioUrl;
    audio.load();
    if (previousUrl) URL.revokeObjectURL(previousUrl);
    $("output").hidden = false;
    await save();
  } catch (error) {
    if (request === playbackRequest) { loadingAudio = false; report(error); render(); }
  }
}

function startStreaming() {
  if (!streamConfig) return;
  const request = ++playbackRequest;
  audio.onloadedmetadata = null;
  const position = (audioUrl || streaming) && !loadingAudio ? audio.currentTime : session.position;
  const autoplay = !session.generated || !audio.paused, rate = session.rate;
  loadingAudio = true;
  audio.pause();
  streaming?.dispose();
  session.position = position;
  streaming = new StreamingPlayer(audio, streamConfig, {
    position,
    onready: () => { if (request === playbackRequest) loadingAudio = false; },
    onerror: (error) => {
      if (request !== playbackRequest) return;
      playbackError = error;
      if (running) closeWorker();
      else void showAudio(false, true).then(() => report(error));
    },
  });
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
  audio.playbackRate = rate;
  $("output").hidden = false;
  // Call play in the submit gesture; it waits for the first buffered speech.
  if (autoplay) void audio.play().catch((error) => {
    if (request === playbackRequest && error.name === "NotAllowedError") status.textContent = "Press play to listen while speech is generated.";
  });
}

function closeWorker() {
  worker?.terminate();
  worker = null;
  pending?.reject(new DOMException("Generation stopped.", "AbortError"));
  pending = null;
}
function synthesize(value) {
  if (!worker) {
    worker = new Worker("./speech-worker.js?v=5", { type: "module" });
    worker.onmessage = ({ data }) => {
      if (!pending || data.id !== pending.id) return;
      if (data.type === "status") {
        status.textContent = data.message === "Generating speech…" ? `Generating speech… ${Math.round(session.generated / session.parts.length * 100)}%` : data.message;
        return;
      }
      const job = pending;
      pending = null;
      if (data.type === "audio") {
        if (data.pcm instanceof Uint8Array && data.pcm.byteLength) job.resolve(data);
        else job.reject(new Error("The speech engine returned no audio. Resume to try again."));
      } else job.reject(new Error(data.message || "Speech generation failed."));
    };
    worker.onerror = (event) => {
      pending?.reject(new Error(event.message || "The speech engine could not start."));
      pending = null;
    };
  }
  return new Promise((resolve, reject) => {
    pending = { id: ++jobId, resolve, reject };
    worker.postMessage({ type: "generate", id: jobId, text: value });
  });
}

async function stayAwake() {
  if (!running || document.visibilityState !== "visible" || wakeLock) return;
  try {
    const lock = await navigator.wakeLock?.request("screen");
    if (!running) { await lock?.release(); return; }
    wakeLock = lock;
    lock?.addEventListener("release", () => { if (wakeLock === lock) wakeLock = null; });
  } catch { /* Generation also works when a screen wake lock is unavailable. */ }
}
async function generate() {
  const generatedBefore = session.generated;
  let generationError;
  clearTimeout(saveTimer);
  running = true;
  cancelled = false;
  playbackError = null;
  playAfterStop = false;
  if (!session.parts.length) {
    session.text = text.value.trim();
    session.parts = splitText(session.text);
  }
  render();
  void stayAwake();
  try {
    startStreaming();
    await save();
    if (streaming) {
      for (let index = 0; index < generatedBefore && !cancelled; index++) await streaming.append(await read(index));
    }
    for (let index = session.generated; index < session.parts.length && !cancelled; index++) {
      if (playbackError) throw playbackError;
      status.textContent = `Generating speech… ${Math.round(index / session.parts.length * 100)}%`;
      const { pcm, sampleRate } = await synthesize(session.parts[index]);
      if (cancelled) break;
      const blob = new Blob([audioHeader(pcm.byteLength, sampleRate), pcm], { type: "audio/wav" });
      await save(blob, index);
      if (streaming) await streaming.append(blob);
    }
    status.textContent = cancelled ? "Stopped. Your progress is saved." : "Ready. Your current session is saved.";
  } catch (error) {
    if (cancelled) status.textContent = "Stopped. Your progress is saved.";
    else { generationError = playbackError || error; report(generationError); }
  } finally {
    closeWorker();
    if (streaming && session.generated && !playbackError && !cancelled) {
      try { await streaming.finish(); }
      catch (error) { if (!cancelled) { playbackError = error; report(error); } }
    }
    if (!streaming || playbackError || cancelled) {
      if (!audioUrl || session.generated !== generatedBefore) {
        await showAudio(cancelled ? playAfterStop : !playbackError && !generationError, Boolean(playbackError || generationError));
      }
    }
    if (!session.generated) {
      streaming?.dispose(); streaming = null; loadingAudio = false;
      $("output").hidden = true;
    }
    running = false;
    if (cancelled) status.textContent = "Stopped. Your progress is saved.";
    await wakeLock?.release().catch(() => {});
    wakeLock = null;
    render();
  }
}

$("speech-form").addEventListener("submit", (event) => {
  event.preventDefault();
  if (running) {
    cancelled = true;
    closeWorker();
    if (streaming) {
      playAfterStop = !audio.paused;
      savePosition();
      loadingAudio = true;
      ++playbackRequest;
      streaming.dispose();
      streaming = null;
    }
    status.textContent = "Stopping…";
    render();
  } else if (database && gpuReady && words() > 0 && words() <= MAX_WORDS) void generate();
});
text.addEventListener("input", () => {
  session.text = text.value;
  session.parts = [];
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { if (database) void save().catch(report); }, 300);
  render();
});
$("new-session").addEventListener("click", async () => {
  clearTimeout(saveTimer);
  ++playbackRequest;
  audio.onloadedmetadata = null;
  audio.pause();
  streaming?.dispose();
  streaming = null;
  audio.removeAttribute("src");
  audio.load();
  if (audioUrl) URL.revokeObjectURL(audioUrl);
  audioUrl = null;
  loadingAudio = false;
  session = freshSession();
  text.value = "";
  $("output").hidden = true;
  render();
  try { await save(null, null, true); status.textContent = gpuReady ? "Ready for text." : "WebGPU is required to generate speech."; }
  catch (error) { report(error); }
  text.focus();
});
function savePosition() {
  if (!database) return;
  if ((audioUrl || streaming) && !loadingAudio) { session.position = audio.currentTime; session.rate = audio.playbackRate; }
  if (session.position === savedPosition && session.rate === savedRate && session.text === savedText && session.parts === savedParts) return;
  void save().catch(report);
}
audio.addEventListener("timeupdate", () => {
  if (Date.now() - lastPositionSave > 5000) { lastPositionSave = Date.now(); savePosition(); }
});
audio.addEventListener("pause", savePosition);
audio.addEventListener("seeked", savePosition);
audio.addEventListener("ratechange", savePosition);
audio.addEventListener("error", () => { loadingAudio = false; status.textContent = "The saved audio could not play."; render(); });
document.addEventListener("visibilitychange", () => { savePosition(); void stayAwake(); });
window.addEventListener("pagehide", savePosition);
window.addEventListener("pageshow", (event) => { if (event.persisted) location.reload(); });

// Plyr is presentation only; generation and saved playback also work if its CDN is unavailable.
void import("https://cdn.jsdelivr.net/npm/plyr@3.8.4/+esm").then(({ default: Plyr }) => {
  const player = new Plyr(audio, { iconUrl: "https://cdn.jsdelivr.net/npm/plyr@3.8.4/dist/plyr.svg", controls: ["play", "progress", "current-time", "duration", "settings"], settings: ["speed"], storage: { enabled: false }, speed: { selected: session.rate, options: [0.75, 1, 1.25, 1.5, 2] } });
  // Plyr retains a clone for destroy(); a MediaSource URL cannot feed two elements.
  player.elements.original.removeAttribute("src");
  player.elements.original.load();
}).catch(() => {});

try {
  // One tab owns the current session; other tabs wait without changing its data.
  // The browser releases this lock when the owning page closes or reloads.
  status.textContent = "If your session is open in another tab, close it to continue here.";
  await new Promise((resolve, reject) => {
    navigator.locks.request("narrate.sh-session", () => {
      resolve();
      return new Promise(() => {});
    }).catch(reject);
  });
  status.textContent = "Opening your session…";
  const open = indexedDB.open("narrate.sh", 6);
  open.onupgradeneeded = () => {
    for (const name of [...open.result.objectStoreNames]) open.result.deleteObjectStore(name);
    open.result.createObjectStore("current");
  };
  open.onblocked = () => { status.textContent = "Close other narrate.sh tabs to open your saved session."; };
  database = await result(open);
  database.onversionchange = () => database.close();
  const store = database.transaction("current").objectStore("current");
  const [saved, input] = await Promise.all([result(store.get("session")), result(store.get("input"))]);
  session = { ...freshSession(), ...saved, ...input };
  text.value = session.text;
  await save();
  status.textContent = "Checking WebGPU…";
  const [adapter, config] = await Promise.all([
    navigator.gpu?.requestAdapter({ powerPreference: "high-performance" }).catch(() => null),
    getStreamConfig().catch(() => null),
  ]);
  streamConfig = config;
  gpuReady = Boolean(adapter);
  status.textContent = gpuReady ? "Ready. Your current session is saved automatically." : "WebGPU is unavailable. Use Safari 26+ or another WebGPU-capable browser.";
  if (session.generated) await showAudio();
} catch (error) { report(error); }
render();
