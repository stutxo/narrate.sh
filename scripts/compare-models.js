import { CANDIDATES } from './compare-config.js?v=14';
import { passages, pcmStats, wavBytes } from './audition-utils.js?v=14';

const $ = id => document.getElementById(id);
const artifacts = new Map(), urls = [];
let worker, pending, serial = 0, running = false, cancelled = false, wake;
const status = message => { $('status').textContent = message; };
for (const model of CANDIDATES) {
  const label = document.createElement('label'), input = document.createElement('input');
  input.type = 'checkbox'; input.value = model.key; input.checked = !model.optional;
  label.append(input, ` ${model.name}`); $('models').append(label);
  if (model.caution) {
    const item = document.createElement('li'); item.textContent = `${model.name}: ${model.caution}`; $('cautions').append(item);
  }
}

function plan(options) {
  const keys = options.models ?? CANDIDATES.filter(model => !model.optional).map(model => model.key), repeats = options.repeats ?? 1;
  const seed = options.seed ?? Date.now() >>> 0;
  if (!Array.isArray(keys) || !keys.length || new Set(keys).size !== keys.length
    || keys.some(key => !CANDIDATES.some(model => model.key === key))) throw new Error('Select one or more supported models.');
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error('Choose 1–3 repeats.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer.');
  if (options.corpus && !['standard', 'smoke'].includes(options.corpus)) throw new Error('Choose standard or smoke passages.');
  const corpus = options.text !== undefined ? [{ id: 'custom', text: options.text }]
    : (options.corpus === 'smoke' ? ['smoke'] : ['prose', 'numbers', 'question']).map(id => ({ id, text: passages[id] }));
  if (corpus.some(item => typeof item.text !== 'string' || !item.text.trim() || item.text.length > 500)) throw new Error('Use text of 1–500 characters.');
  const models = CANDIDATES.filter(model => keys.includes(model.key));
  let state = seed;
  for (let i = models.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const other = Math.floor(state / 0x100000000 * (i + 1));
    [models[i], models[other]] = [models[other], models[i]];
  }
  return { corpus, repeats, seed, models: models.map((model, i) => ({ ...model, label: String.fromCharCode(65 + i) })) };
}

async function holdScreen() {
  const session = wake;
  if (!session?.active || session.lock || session.pending || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
  session.pending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!session.active || document.visibilityState !== 'visible') { await lock.release(); return; }
    session.lock = lock;
    lock.addEventListener('release', () => { if (session.lock === lock) session.lock = undefined; });
  } catch {} // A denied wake lock does not prevent a comparison.
  finally { session.pending = false; }
}
function releaseScreen() {
  if (!wake) return;
  wake.active = false; wake.lock?.release().catch(() => {}); wake.lock = undefined;
}
function closeWorker() {
  if (worker) { worker.onmessage = worker.onerror = null; worker.terminate(); worker = undefined; }
  pending?.reject(new Error('Comparison stopped.')); pending = undefined;
}
function stop() { if (running) { cancelled = true; closeWorker(); releaseScreen(); } }
document.addEventListener('visibilitychange', () => {
  if (!wake?.active) return;
  if (document.visibilityState === 'visible') holdScreen();
  else wake.report.backgrounded = true;
});
window.addEventListener('pagehide', stop);

function startWorker(model) {
  worker = new Worker(new URL(`./compare-worker.js?v=14&model=${model.key}`, import.meta.url), { type: 'module' });
  worker.onerror = event => { pending?.reject(new Error(event.message || 'The speech worker failed.')); pending = undefined; };
  worker.onmessage = ({ data }) => {
    if (!pending || data.id !== pending.id || data.type === 'status') return;
    const job = pending; pending = undefined;
    if (data.type === 'error') job.reject(new Error(data.message || 'Speech generation failed.'));
    else if (data.type !== 'audio' || data.modelId !== model.id) job.reject(new Error('Unexpected speech model response. Reload to try again.'));
    else job.resolve(data);
  };
}
async function generate(model, text) {
  if (cancelled) throw new Error('Comparison stopped.');
  const data = await new Promise((resolve, reject) => {
    pending = { id: ++serial, resolve, reject };
    worker.postMessage({ type: 'generate', id: serial, text, modelId: model.id, synthesisRate: 1 });
  });
  const metrics = data.metrics;
  if (data.sampleRate !== 24000 || !metrics || metrics.synthesisRate !== 1
    || ![metrics.initMs, metrics.generationMs, metrics.totalMs].every(Number.isFinite)
    || metrics.initMs < 0 || metrics.generationMs <= 0 || metrics.totalMs < metrics.initMs + metrics.generationMs) throw new Error('Unexpected speech worker timings or audio format.');
  const signal = pcmStats(data.pcm, data.sampleRate);
  if (!signal.peak) throw new Error('The model returned silent audio.');
  return { data, signal };
}

function render(report) {
  // Generation order and loading messages must not reveal the blinded labels.
  report.results.sort((a, b) => report.corpus.findIndex(p => p.id === a.passage) - report.corpus.findIndex(p => p.id === b.passage)
    || a.repeat - b.repeat || a.label.localeCompare(b.label));
  for (const row of report.results) {
    const card = document.createElement('article'), heading = document.createElement('h2'), text = document.createElement('p');
    heading.textContent = `${row.label} · ${row.passage} · repeat ${row.repeat}`;
    text.textContent = report.corpus.find(passage => passage.id === row.passage).text;
    const audio = document.createElement('audio'); audio.controls = true; audio.preload = 'metadata';
    const url = URL.createObjectURL(new Blob([artifacts.get(row.file)], { type: 'audio/wav' })); urls.push(url); audio.src = url;
    audio.defaultPlaybackRate = audio.playbackRate = 1; audio.preservesPitch = true;
    audio.addEventListener('play', () => document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); }));
    card.append(heading, text, audio); $('results').append(card);
  }
  $('details').textContent = JSON.stringify(report, null, 2);
}

async function run(options = {}) {
  if (running) throw new Error('A comparison is already running.');
  const selected = plan(options);
  running = true; cancelled = false;
  $('fields').disabled = true; $('stop').hidden = false; $('reveal').disabled = $('json').disabled = true; $('details').hidden = true;
  document.querySelectorAll('audio').forEach(audio => audio.pause());
  urls.splice(0).forEach(url => URL.revokeObjectURL(url)); artifacts.clear(); $('results').replaceChildren();
  const report = window.comparison.report = { version: 1, createdAt: new Date().toISOString(), userAgent: navigator.userAgent,
    isolated: crossOriginIsolated, backgrounded: document.visibilityState !== 'visible',
    seed: selected.seed, repeats: selected.repeats, targetRate: 1, corpus: selected.corpus,
    models: selected.models.map(({ key, id, name, voice, label, backend }) => ({ key, id, name, voice, label, backend })),
    warmups: [], results: [], failures: [],
    notes: ['Experimental comparison, not proof of phone performance or speech quality.',
      'Each model uses one sequential worker, one excluded warmup, and normal 1× synthesis/playback.',
      'Models run in separate groups to bound memory; device slowdown can still bias timing comparisons.',
      'New input shapes can trigger compilation during measured calls despite the excluded warmup.',
      'Signal checks never trim audio. Backgrounding may affect timings. Listen before revealing identities.'] };
  wake = { active: true, report }; holdScreen();
  try {
    for (const [index, model] of selected.models.entries()) {
      try {
        if (cancelled) throw new Error('Comparison stopped.');
        if (model.backend !== 'wasm' && !navigator.gpu) throw new Error('This model requires WebGPU.');
        status(`Preparing model ${index + 1}/${selected.models.length}…`); startWorker(model);
        const warm = await generate(model, 'Hello world.');
        report.warmups.push({ modelId: model.id, label: model.label, ...warm.data.metrics });
        for (let repeat = 1; repeat <= selected.repeats; repeat++) for (const passage of selected.corpus) {
          status(`Generating model ${index + 1}/${selected.models.length}, passage ${report.corpus.indexOf(passage) + 1}/${report.corpus.length}, repeat ${repeat}…`);
          const { data, signal } = await generate(model, passage.text);
          const words = passage.text.trim().split(/\s+/).length, audioSeconds = signal.samples / data.sampleRate;
          const warmWorkerMs = data.metrics.totalMs - data.metrics.initMs;
          const row = { label: model.label, passage: passage.id, repeat, modelId: model.id,
            ...data.metrics, audioSeconds, playbackRate: 1, listeningSeconds: audioSeconds, words, warmWorkerMs,
            wordsPerSecond: words * 1000 / warmWorkerMs, headroom: audioSeconds * 1000 / warmWorkerMs, signal,
            file: `${passage.id}-${model.label}-r${repeat}.wav` };
          artifacts.set(row.file, wavBytes(data.pcm, data.sampleRate)); report.results.push(row);
          window.dispatchEvent(new CustomEvent('comparison-result', { detail: row }));
        }
      } catch (error) {
        if (cancelled) throw error;
        report.failures.push({ modelKey: model.key, message: error.message });
      } finally { closeWorker(); }
    }
    status(`Ready: ${report.results.length} recordings, ${report.failures.length} model failures. Listen before revealing models and timings.`);
    return report;
  } catch (error) { report.error = error.message; status(error.message); throw error; }
  finally {
    closeWorker(); releaseScreen(); running = false; render(report);
    $('fields').disabled = false; $('stop').hidden = true; $('reveal').disabled = $('json').disabled = false;
  }
}

window.comparison = { run, stop, report: null, wavBase64(index) {
  const wav = artifacts.get(window.comparison.report?.results[index]?.file);
  if (!wav) throw new Error('No recording at that index.');
  let binary = ''; for (let i = 0; i < wav.length; i += 32768) binary += String.fromCharCode(...wav.subarray(i, i + 32768));
  return btoa(binary);
} };
$('settings').onsubmit = event => {
  event.preventDefault();
  run({ models: [...$('models').querySelectorAll('input:checked')].map(input => input.value), corpus: $('corpus').value,
    repeats: Number($('repeats').value) }).catch(error => status(error.message));
};
$('stop').onclick = stop;
$('reveal').onclick = () => { $('details').hidden = false; };
$('json').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(window.comparison.report, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a'); link.href = url; link.download = 'model-comparison.json'; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
