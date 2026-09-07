import { auditionPlan, pcmStats, wavBytes } from './audition-utils.js?v=14';
import { MODEL } from '../model-config.js?v=14';

const $ = id => document.getElementById(id);
document.title = `${MODEL.name} audition`;
$('title').textContent = document.title;
$('description').textContent = `Runs locally on ${MODEL.backend === 'wasm' ? 'the CPU with WebAssembly' : 'WebGPU'}. The model downloads about ${MODEL.downloadMB} MB on first use. Each candidate gets a short warmup excluded from comparisons. Repeats rotate the order; a single repeat is exploratory. Signal checks are not speech-quality scores.`;
let worker, pending, wake, serial = 0, running = false, revealed = false;
const artifacts = [], urls = [];
function status(text) { $('status').textContent = text; }
async function holdScreen() {
  const session = wake;
  if (!session?.active || session.lock || session.pending || document.visibilityState !== 'visible' || !navigator.wakeLock) return;
  session.pending = true;
  try {
    const lock = await navigator.wakeLock.request('screen');
    if (!session.active || document.visibilityState !== 'visible') { await lock.release(); return; }
    session.lock = lock;
    lock.addEventListener('release', () => { if (session.lock === lock) session.lock = undefined; });
  } catch {} // Unsupported or denied wake locks must not prevent an audition.
  finally { session.pending = false; }
}
document.addEventListener('visibilitychange', () => {
  if (!wake?.active) return;
  if (document.visibilityState === 'visible') holdScreen();
  else wake.report.backgrounded = true;
});
function stop() {
  worker?.terminate(); worker = undefined;
  pending?.reject(new Error('Audition stopped.')); pending = undefined;
  if (wake) {
    wake.active = false;
    wake.lock?.release().catch(() => {}); wake.lock = undefined;
  }
}
function generate(text, synthesisRate, label) {
  status(label);
  return new Promise((resolve, reject) => {
    pending = { resolve, reject, label, id: ++serial };
    worker.postMessage({ type: 'generate', id: serial, text, synthesisRate, modelId: MODEL.id });
  });
}
function download(bytes, filename, type) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), link = document.createElement('a');
  link.href = url; link.download = filename; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function addResult(row, text, wav) {
  const card = document.createElement('article'), heading = document.createElement('h2');
  heading.textContent = `${row.label} · ${row.passage} · repeat ${row.repeat}`;
  const passage = document.createElement('p'); passage.textContent = text;
  const audio = document.createElement('audio'); audio.controls = false; audio.inert = true; audio.preload = 'none';
  const url = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' })); urls.push(url); audio.src = url;
  // WAV has no playback-rate metadata; these controls supply the matched pace.
  audio.playbackRate = row.playbackRate; audio.defaultPlaybackRate = row.playbackRate; audio.preservesPitch = true;
  audio.addEventListener('play', () => document.querySelectorAll('audio').forEach(other => { if (other !== audio) other.pause(); }));
  const detail = document.createElement('pre'); detail.className = 'detail'; detail.hidden = !revealed;
  detail.textContent = JSON.stringify(row, null, 2);
  const save = document.createElement('button'); save.textContent = 'Save raw WAV'; save.className = 'detail'; save.hidden = !revealed;
  save.onclick = () => download(wav, row.file, 'audio/wav');
  const note = document.createElement('p'); note.className = 'detail muted'; note.hidden = !revealed;
  note.textContent = `Raw WAV needs ${row.playbackRate.toFixed(3)}× playback to match this listening pace. At-limit samples may indicate clipping. Quiet edges estimate waveform pauses, not playback stalls; no audio is trimmed.`;
  card.append(heading, passage, audio, detail, note, save); $('results').append(card);
}

async function run(options = {}) {
  if (running) throw new Error('An audition is already running.');
  const plan = auditionPlan(options);
  running = true; revealed = false;
  $('fields').disabled = true; $('stop').hidden = false; $('reveal').disabled = true; $('json').disabled = true;
  document.querySelectorAll('audio').forEach(audio => audio.pause());
  urls.splice(0).forEach(url => URL.revokeObjectURL(url)); artifacts.length = 0; $('results').replaceChildren();
  const report = window.audition.report = {
    version: 1, createdAt: new Date().toISOString(), userAgent: navigator.userAgent,
    model: { id: MODEL.id, name: MODEL.name, voice: MODEL.voice, backend: MODEL.backend },
    isolated: crossOriginIsolated, backgrounded: document.visibilityState !== 'visible',
    seed: plan.seed, targetRate: plan.targetRate, repeats: plan.repeats,
    corpus: plan.corpus, warmups: [], results: [],
    notes: ['Timings use the real worker. Warmups are excluded from results.',
      'Words count the source passage, before number expansion.',
      'Signal checks detect malformed or suspect audio, not pronunciation or listening quality.',
      'Quiet edges use 10 ms RMS windows below -60 dBFS in raw audio; divide by playbackRate for listening time. All-quiet audio reports its full duration at both edges.',
      'Raw WAV files require the recorded playbackRate for matched nominal listening pace.',
      'If backgrounded is true, browser throttling may have affected these timings.',
      'Timings apply only to this browser and device; a single repeat cannot establish phone performance.'],
  };
  wake = { active: true, report };
  holdScreen();
  try {
    if (MODEL.backend !== 'wasm' && !navigator.gpu) throw new Error('This model requires WebGPU.');
    worker = new Worker(new URL('../speech-worker.js?v=14', import.meta.url), { type: 'module' });
    worker.onerror = event => pending?.reject(new Error(event.message || 'The speech worker failed.'));
    worker.onmessage = ({ data }) => {
      if (!pending || data.id !== pending.id) return;
      if (data.type === 'status') status(`${pending.label} ${data.message}`);
      if (data.type === 'audio' || data.type === 'error') {
        const job = pending; pending = undefined;
        if (data.type === 'error') job.reject(new Error(data.message));
        else if (data.modelId !== MODEL.id) job.reject(new Error('The speech model has changed. Reload this page to continue.'));
        else job.resolve(data);
      }
    };
    for (const candidate of plan.candidates) {
      const data = await generate('Hello world.', candidate.synthesisRate, `Warming ${candidate.label}…`);
      if (!pcmStats(data.pcm).peak) throw new Error(`Warmup ${candidate.label} returned silent audio.`);
      report.warmups.push({ label: candidate.label, ...data.metrics });
    }
    for (const [index, job] of plan.jobs.entries()) {
      const data = await generate(job.text, job.synthesisRate, `Comparison ${index + 1}/${plan.jobs.length}: ${job.label}…`);
      if (data.sampleRate !== 24000 || !data.metrics || !(data.metrics.generationMs > 0)) throw new Error('Unexpected speech worker protocol.');
      const signal = pcmStats(data.pcm, data.sampleRate), words = job.text.trim().split(/\s+/).length;
      if (!signal.peak) throw new Error(`Comparison ${job.label} returned silent audio; audition is unusable.`);
      const playbackRate = plan.targetRate / job.synthesisRate;
      const audioSeconds = signal.samples / data.sampleRate, listeningSeconds = audioSeconds / playbackRate;
      const warmWorkerMs = data.metrics.totalMs - data.metrics.initMs;
      const row = { label: job.label, passage: job.id, repeat: job.repeat, synthesisRate: job.synthesisRate,
        playbackRate, words, ...data.metrics, audioSeconds, listeningSeconds,
        warmWorkerMs, wordsPerSecond: words * 1000 / warmWorkerMs,
        headroom: listeningSeconds * 1000 / warmWorkerMs, signal,
        file: `${String(index + 1).padStart(2, '0')}-${job.id}-${job.label}-r${job.repeat}-raw.wav` };
      report.results.push(row);
      const wav = wavBytes(data.pcm, data.sampleRate); artifacts.push(wav); addResult(row, job.text, wav);
      window.dispatchEvent(new CustomEvent('audition-result', { detail: row }));
    }
    status('Ready to compare. Listen before revealing the rates. Worker headroom compares warm generation and PCM conversion with listening time; it excludes player overhead.');
    return report;
  } catch (error) {
    report.error = error.message; status(error.message); throw error;
  } finally {
    stop(); running = false; $('fields').disabled = false; $('stop').hidden = true;
    document.querySelectorAll('audio').forEach(audio => { audio.controls = true; audio.inert = false; });
    $('reveal').disabled = !report.results.length;
    $('json').disabled = false;
  }
}
window.audition = { run, stop, report: null, wavBase64(index) {
  let binary = '';
  const wav = artifacts[index];
  for (let i = 0; i < wav.length; i += 32768) binary += String.fromCharCode(...wav.subarray(i, i + 32768));
  return btoa(binary);
} };
$('settings').onsubmit = event => {
  event.preventDefault();
  run({ corpus: $('corpus').value, repeats: Number($('repeats').value), targetRate: Number($('pace').value) }).catch(() => {});
};
$('stop').onclick = stop;
$('reveal').onclick = () => { revealed = true; document.querySelectorAll('.detail').forEach(item => { item.hidden = false; }); };
$('json').onclick = () => download(JSON.stringify(window.audition.report, null, 2), 'audition.json', 'application/json');
