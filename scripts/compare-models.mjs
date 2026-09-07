// Real, serial CPU/WebGPU model comparison. No generated audio or text is uploaded.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { startBrowser } from './app-fixtures.mjs';
import { CANDIDATES } from './compare-config.js';

const help = `Usage: npm run compare:models -- [options]
  --models kitten (default: current Kitten Micro WebGPU model)
  --models pocket-cpu  Optional Pocket Alba CPU/WebAssembly comparison.
  --models kitten,inflect,pocket  Optional historical WebGPU comparison.
  --models pocket-f32  Optional older Pocket checkpoint in explicit WebGPU FP32 mode.
  --corpus standard|smoke (default: standard)
  --text "A custom passage, up to 500 characters."
  --repeats 1  --seed 42  --out DIRECTORY
  --timeout SECONDS (default: 1800; setup/generation/export, after browser launch)
  --software-gpu  Explicit SwiftShader opt-in: correctness, not phone performance.
Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH to your Chromium executable if needed.
Models load one at a time. Each gets an excluded warmup, then the same passages.
Synthesis and playback are 1×. Writes WAVs, report.json, and a blinded review.html.
Inflect is experimental on iPhone. Pocket needs about 237 MB; its optional FP16 GPU mode also needs shader-f16.
Failed models are recorded in the report and cause a nonzero exit status.
Timeouts allow up to 1 second to stop, 3 seconds to save partial artifacts, and 3 seconds for browser cleanup.`;

function parse(args) {
  const config = { options: { repeats: 1, seed: 42 }, out: resolve(tmpdir(), `narrate-models-${Date.now()}`), timeout: 1800000, software: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--software-gpu') { config.software = true; continue; }
    if (!['--models', '--corpus', '--text', '--repeats', '--seed', '--out', '--timeout'].includes(flag)
      || args[i + 1] === undefined || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete option: ${flag}`);
    const value = args[++i];
    if (flag === '--out') config.out = resolve(value);
    else if (flag === '--timeout') config.timeout = Number(value) * 1000;
    else if (flag === '--models') config.options.models = value.split(',');
    else config.options[flag.slice(2)] = ['--repeats', '--seed'].includes(flag) ? Number(value) : value;
  }
  const { models = CANDIDATES.filter(model => !model.optional).map(model => model.key), corpus = 'standard', repeats, seed, text } = config.options;
  if (!models.length || new Set(models).size !== models.length || models.some(key => !CANDIDATES.some(model => model.key === key))) throw new Error(`Choose unique model keys: ${CANDIDATES.map(model => model.key).join(', ')}.`);
  config.options.models = models;
  if (!['standard', 'smoke'].includes(corpus)) throw new Error('Choose standard or smoke corpus.');
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 3) throw new Error('Choose 1–3 repeats.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer.');
  if (text !== undefined && (!text.trim() || text.length > 500)) throw new Error('Use text of 1–500 characters.');
  if (!Number.isFinite(config.timeout) || config.timeout <= 0) throw new Error('Timeout must be positive.');
  return config;
}

export function reviewHtml(report) {
  const data = JSON.stringify(report).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Model listening comparison</title><style>body{font:16px/1.5 system-ui;max-width:760px;margin:2rem auto;padding:0 1rem}audio{width:100%}article{border-top:1px solid #ccc;margin-top:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}[hidden]{display:none}</style>
<h1>Model listening comparison</h1><p>All recordings play at their natural 1× speed. Compare the words, pronunciation, pauses and listening comfort before revealing the models. Signal checks do not score speech quality.</p>
<p id="environment"></p><button id="reveal">Reveal models and timings</button><main></main><pre id="details" hidden></pre><script>
const report=${data};
document.querySelector('#environment').textContent=(report.environment.backend==='wasm'?'Browser CPU/WebAssembly: results apply only to this machine and test.':report.environment.softwareGpu?'Software GPU: correctness only, not phone performance.':'Browser GPU: results apply only to this machine and test.')+' '+report.results.length+' recordings; '+report.failures.length+' failed models.';
for(const row of report.results){
 const card=document.createElement('article'),heading=document.createElement('h2'),text=document.createElement('p'),audio=document.createElement('audio');
 heading.textContent=row.label+' · '+row.passage+' · repeat '+row.repeat;
 text.textContent=report.corpus.find(item=>item.id===row.passage).text;
 audio.controls=true;audio.preload='metadata';audio.src=row.file;audio.defaultPlaybackRate=audio.playbackRate=1;
 audio.onplay=()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause()});
 card.append(heading,text,audio);document.querySelector('main').append(card);
}
document.querySelector('#details').textContent=JSON.stringify(report,null,2);
document.querySelector('#reveal').onclick=()=>document.querySelector('#details').hidden=false;
</script></html>`;
}

async function bounded(operation, milliseconds, error) {
  let timer;
  try { return await Promise.race([operation, new Promise((_, reject) => { timer = setTimeout(() => reject(error), milliseconds); })]); }
  finally { clearTimeout(timer); }
}

export async function main(args = process.argv.slice(2), openBrowser = startBrowser) {
  if (args.includes('--help') || args.includes('-h')) { console.log(help); return; }
  const config = parse(args);
  const needsGpu = config.options.models.some(key => CANDIDATES.find(model => model.key === key).backend !== 'wasm');
  const environment = await openBrowser({ args: needsGpu && config.software
    ? ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  const started = Date.now(), timeoutError = new Error(`Comparison timed out after ${config.timeout / 1000} seconds.`);
  let page, gpu, runResult, report, failure;
  const errors = [];
  try {
    try {
      report = await bounded((async () => {
        page = await environment.browser.newPage();
        page.on('pageerror', error => errors.push(error.message));
        page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
        await page.exposeFunction('comparisonProgress', row => console.log(`${row.label} ${row.passage} repeat${row.repeat}: ${row.audioSeconds.toFixed(3)}s audio, ${(row.generationMs / 1000).toFixed(2)}s generation.`));
        await page.goto(`${environment.url}/scripts/compare-models.html`);
        await page.waitForFunction(() => window.comparison);
        gpu = needsGpu ? await page.evaluate(async () => {
          const adapter = await navigator.gpu?.requestAdapter();
          if (!adapter) throw new Error('No WebGPU adapter. Use a supported browser or explicitly opt in to --software-gpu.');
          return { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture,
            description: adapter.info?.description, features: [...adapter.features] };
        }) : null;
        if (failure) throw failure; // A late adapter response cannot start work after the deadline.
        if (!config.software && /swiftshader|software/i.test(JSON.stringify(gpu))) throw new Error('Software adapter detected; pass --software-gpu to acknowledge correctness-only timing.');
        console.log(!needsGpu ? 'Browser CPU/WebAssembly: this machine only, not an iPhone benchmark.' : config.software ? 'Software WebGPU: correctness only, not a phone benchmark.' : 'Browser WebGPU: this machine only, not an iPhone benchmark.');
        console.log(`Serial model loading; output: ${config.out}`);
        await page.evaluate(() => window.addEventListener('comparison-result', event => window.comparisonProgress(event.detail)));
        runResult = page.evaluate(async options => {
          try { return await window.comparison.run(options); }
          catch (error) { if (window.comparison.report) return window.comparison.report; throw error; }
        }, config.options);
        return runResult;
      })(), config.timeout, timeoutError);
    } catch (error) {
      failure = error;
      // A renderer may not service Stop at all. Never await its response forever.
      report = await bounded((async () => {
        if (!page) return null;
        await page.evaluate(() => window.comparison?.stop());
        return runResult ? await runResult : await page.evaluate(() => window.comparison?.report);
      })(), 1000, timeoutError).catch(() => null);
      report ||= { version: 1, createdAt: new Date().toISOString(), corpus: [], models: [], warmups: [], results: [], failures: [] };
      report.error = error.message; report.partial = true; report.timedOut = error === timeoutError;
    }
    report.environment = { backend: needsGpu ? 'webgpu-or-mixed' : 'wasm', softwareGpu: needsGpu && config.software, gpu: gpu ?? null, browser: environment.browser.version(), cache: 'Fresh browser context; disk/OS cache state not controlled.' };
    report.browserErrors = errors;
    report.exportedFiles = []; report.exportComplete = false;
    const saveReport = () => writeFile(resolve(config.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    try {
      await bounded((async () => {
        await mkdir(config.out, { recursive: true }); await saveReport();
        for (const [index, row] of report.results.entries()) {
          const bytes = await page.evaluate(index => window.comparison.wavBase64(index), index);
          await writeFile(resolve(config.out, row.file), Buffer.from(bytes, 'base64')); report.exportedFiles.push(row.file);
        }
        await writeFile(resolve(config.out, 'review.html'), reviewHtml({ ...report, exportComplete: true }));
        report.exportComplete = true; await saveReport();
      })(), failure ? 3000 : Math.max(1, config.timeout - (Date.now() - started)), new Error('Comparison artifact export timed out.'));
    } catch (error) {
      failure ||= error; report.error ||= error.message; report.partial = true;
      await bounded(saveReport(), 500, error).catch(() => {});
    }
    console.log(`Saved ${report.exportedFiles.length} WAVs in ${config.out}; artifact export ${report.exportComplete ? 'complete' : 'incomplete'}.`);
    if (failure || report.failures.length || report.error || errors.length) throw failure || new Error(report.error || [...report.failures.map(item => `${item.modelKey}: ${item.message}`), ...errors].join('; '));
  } catch (error) { failure = error; throw error; }
  finally {
    try { await bounded(environment.close(), 2000, new Error('Browser cleanup timed out.')); }
    catch (error) { if (!failure) throw error; console.error(error.message); }
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch(error => {
  console.error(error.message); process.exitCode = 1;
  // If browser cleanup itself stalled, Node exit invokes Playwright's process
  // cleanup to kill its launched browser. Imports never terminate their caller.
  setTimeout(() => process.exit(1), 1000).unref();
});
