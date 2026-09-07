// Unpublished developer tool. Uses the production worker; never uploads text or audio.
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { startBrowser } from './app-fixtures.mjs';
import { MODEL, AUDIO } from '../model-config.js';

const help = `Usage: npm run benchmark:model -- [options]
  --text "The morning sun warmed the quiet garden." (up to 500 characters)
  --repeats 2       Warm repeats after the first call, from 1 to 5.
  --timeout 180     Seconds for setup and generation after browser launch.
  --out report.json Optional local JSON file; JSON is also written to stdout.
  --software-gpu    Explicit SwiftShader opt-in, for correctness checks only.
Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to your Chromium executable if needed.
Downloads about ${MODEL.downloadMB} MB on first use. One worker handles all calls.
First-call startup is measured, but an empty download cache is not assumed.
RTF = generation milliseconds / (audio seconds × 1000); below 1 is faster than playback.
This machine's timings do not establish iPhone performance or speech quality.`;

export function parseArgs(args) {
  const config = { text: 'The morning sun warmed the quiet garden.', repeats: 2, timeout: 180000, software: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--software-gpu') { config.software = true; continue; }
    if (!['--text', '--repeats', '--timeout', '--out'].includes(flag) || args[i + 1] === undefined
      || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete option: ${flag}`);
    const value = args[++i];
    if (flag === '--text') config.text = value.trim();
    if (flag === '--repeats') config.repeats = Number(value);
    if (flag === '--timeout') config.timeout = Number(value) * 1000;
    if (flag === '--out') config.out = resolve(value);
  }
  if (!config.text.trim() || config.text.length > 500) throw new Error('Use text of 1–500 characters.');
  if (!Number.isInteger(config.repeats) || config.repeats < 1 || config.repeats > 5) throw new Error('Choose 1–5 warm repeats.');
  if (!Number.isFinite(config.timeout) || config.timeout <= 0 || config.timeout > 1800000) throw new Error('Timeout must be positive and at most 1800 seconds.');
  return config;
}
async function bounded(operation, milliseconds, message) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

export async function benchmark(args = [], openBrowser = startBrowser) {
  const config = parseArgs(args), started = performance.now();
  const report = { model: { id: MODEL.id, name: MODEL.name, voice: MODEL.voice },
    runtimeSha256: createHash('sha256').update(await readFile(new URL('../vendor/kitten/runtime.js', import.meta.url))).digest('hex'),
    characters: config.text.length, words: config.text.trim().split(/\s+/).length,
    textSha256: createHash('sha256').update(config.text).digest('hex'),
    createdAt: new Date().toISOString(), results: [], browserErrors: [],
    notes: ['One worker: the first call includes initialization; warm repeats use the same text and worker.',
      'Fresh browser context; download, operating-system and network cache state is not controlled.',
      'startupWallMs includes browser launch, setup and the first complete audio result; initMs is worker initialization only.',
      'rtf = generationMs / (audioSeconds * 1000). workerRtf additionally includes warm worker overhead and PCM conversion.',
      'Signal checks detect malformed or silent audio; they do not score speech quality. No text or audio is stored in this report.',
      'Software GPU timing is for correctness checks. Any timing applies only to this machine and test.'] };
  const environment = await openBrowser({ args: config.software
    ? ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  report.environment = { browser: environment.browser.version(), softwareGpu: config.software, gpu: null };
  let failure;
  try {
    await bounded((async () => {
      const page = await environment.browser.newPage();
      page.on('pageerror', error => report.browserErrors.push(error.message));
      page.on('console', message => { if (message.type() === 'error') report.browserErrors.push(message.text()); });
      await page.route('**/__benchmark', route => route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Worker benchmark</title>' }));
      await page.goto(environment.url + '/__benchmark');
      Object.assign(report.environment, await page.evaluate(async () => {
        const adapter = await navigator.gpu?.requestAdapter({ powerPreference: 'high-performance' });
        if (!adapter) throw new Error('WebGPU is unavailable. Use a supported browser, or explicitly opt in to --software-gpu.');
        return { userAgent: navigator.userAgent, isolated: crossOriginIsolated,
          gpu: { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture, description: adapter.info?.description,
            fallback: Boolean(adapter.isFallbackAdapter), features: [...adapter.features] } };
      }));
      if (failure) throw failure; // A late probe cannot start inference after the deadline.
      if (!config.software && (report.environment.gpu.fallback || /swiftshader|software|lavapipe|llvmpipe/i.test(JSON.stringify(report.environment.gpu)))) {
        throw new Error('Software adapter detected; pass --software-gpu to acknowledge correctness-only timing.');
      }
      await page.evaluate(() => { window.__benchmarkWorker = new Worker('/speech-worker.js', { type: 'module' }); });
      report.setupMs = performance.now() - started;
      for (let index = 0; index <= config.repeats; index++) {
        if (failure) throw failure;
        const callStarted = performance.now();
        const row = await page.evaluate(({ request, format }) => new Promise((resolve, reject) => {
          const worker = window.__benchmarkWorker;
          worker.onerror = event => reject(new Error(event.message || 'Speech worker failed.'));
          worker.onmessage = ({ data }) => {
            if (data.type === 'status') return;
            try {
              if (data.type === 'error') throw new Error(data.message || 'Speech generation failed.');
              const { pcm, metrics } = data;
              if (data.type !== 'audio' || data.id !== request.id || data.modelId !== request.modelId || data.sampleRate !== format.sampleRate
                || !(pcm instanceof Uint8Array) || !pcm.length || pcm.length % 2) throw new Error('Invalid worker identity or PCM16 audio.');
              const audioSeconds = pcm.length / (format.sampleRate * 2);
              if (!metrics || ![metrics.initMs, metrics.generationMs, metrics.totalMs, metrics.audioSeconds].every(Number.isFinite)
                || metrics.initMs < 0 || metrics.generationMs <= 0 || metrics.totalMs < metrics.initMs + metrics.generationMs
                || Math.abs(metrics.audioSeconds - audioSeconds) > 1e-9 || metrics.synthesisRate !== 1) throw new Error('Invalid worker timing metrics.');
              const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength);
              let squared = 0, peak = 0, atLimit = 0;
              for (let i = 0; i < pcm.length; i += 2) {
                const sample = view.getInt16(i, true), magnitude = Math.abs(sample / 32768);
                squared += magnitude * magnitude; peak = Math.max(peak, magnitude);
                if (sample === -32768 || sample === 32767) atLimit++;
              }
              const rms = Math.sqrt(squared / (pcm.length / 2));
              if (rms < .00001) throw new Error('The worker returned silent or inaudible PCM.');
              resolve({ ...metrics, audioSeconds, rtf: metrics.generationMs / (audioSeconds * 1000),
                workerRtf: (metrics.totalMs - metrics.initMs) / (audioSeconds * 1000),
                signal: { rms, peak, atLimitFraction: atLimit / (pcm.length / 2) } });
            } catch (error) { reject(error); }
          };
          worker.postMessage(request);
        }), { request: { type: 'generate', id: index + 1, text: config.text, modelId: MODEL.id }, format: AUDIO });
        report.results.push({ phase: index === 0 ? 'first' : 'warm', repeat: index, callWallMs: performance.now() - callStarted, ...row });
        if (index === 0) report.startupWallMs = performance.now() - started;
      }
      if (report.browserErrors.length) throw new Error(`Unexpected browser errors: ${report.browserErrors.join('; ')}`);
    })(), config.timeout, `Benchmark timed out after ${config.timeout / 1000} seconds.`);
  } catch (error) { failure = error; report.error = error.message; }
  finally {
    report.elapsedMs = performance.now() - started;
    try { await bounded(environment.close(), 2000, 'Browser cleanup timed out.'); }
    catch (error) { failure ||= error; report.error ||= error.message; }
    if (config.out) await writeFile(config.out, JSON.stringify(report, null, 2) + '\n');
  }
  if (failure) { failure.report = report; throw failure; }
  return report;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--help') || process.argv.includes('-h')) console.log(help);
  else benchmark(process.argv.slice(2)).then(report => console.log(JSON.stringify(report, null, 2))).catch(error => {
    if (error.report) console.log(JSON.stringify(error.report, null, 2));
    console.error(error.message); process.exitCode = 1;
    setTimeout(() => process.exit(1), 1000).unref(); // Release a browser even if its cleanup stalled.
  });
}
