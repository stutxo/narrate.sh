// Real model audition, using the same page and worker as the browser tool.
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { startBrowser } from './app-fixtures.mjs';
import { auditionPlan } from './audition-utils.js';
import { MODEL } from '../model-config.js';

const help = `Usage: node scripts/audition.mjs [options]
  --corpus standard|smoke|prose,numbers,question (default: standard)
  --text "A custom passage, up to 500 characters."
  --rates ${MODEL.synthesisRates.join(',')}  --repeats 3  --pace 1  --seed 42
  --out DIRECTORY   --timeout SECONDS (default: 1800)
  --software-gpu    Explicit SwiftShader opt-in: correctness only, not a phone benchmark.
Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH if Chromium is not installed by Playwright.
Downloads about ${MODEL.downloadMB} MB for ${MODEL.name}, warms each rate, then writes report.json, raw WAVs, and review.html.
Open review.html to listen at matched pace; raw WAV files alone play at their natural rate.`;

function parse(args) {
  const config = { options: {}, out: resolve(tmpdir(), `narrate-audition-${Date.now()}`), timeout: 1800000, software: false };
  for (let i = 0; i < args.length; i++) {
    const flag = args[i];
    if (flag === '--software-gpu') { config.software = true; continue; }
    if (!['--corpus', '--text', '--rates', '--repeats', '--pace', '--seed', '--out', '--timeout'].includes(flag)
      || args[i + 1] === undefined || args[i + 1].startsWith('--')) throw new Error(`Unknown or incomplete option: ${flag}`);
    const value = args[++i];
    if (flag === '--out') config.out = resolve(value);
    else if (flag === '--timeout') config.timeout = Number(value) * 1000;
    else if (flag === '--rates') config.options.rates = value.split(',').map(Number);
    else config.options[({ '--pace': 'targetRate' })[flag] || flag.slice(2)] = ['--repeats', '--pace', '--seed'].includes(flag) ? Number(value) : value;
  }
  if (!Number.isFinite(config.timeout) || config.timeout <= 0) throw new Error('Timeout must be positive.');
  auditionPlan(config.options); // Fail before opening a browser or downloading weights.
  return config;
}

function reviewHtml(report) {
  const data = JSON.stringify(report).replaceAll('<', '\\u003c');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Speech listening review</title><style>body{font:16px/1.5 system-ui;max-width:760px;margin:2rem auto;padding:0 1rem}audio{width:100%}article{border-top:1px solid #ccc;margin-top:1rem}pre{white-space:pre-wrap;overflow-wrap:anywhere}[hidden]{display:none}</style>
<h1>Speech listening review</h1><p>Listen to the candidates at the same nominal pace. Check words, numbers, pronunciation, pauses and fatigue. Signal checks are not quality scores. Raw WAV files opened separately need the recorded playback rate.</p>
<p id="environment"></p><button id="reveal">Reveal rates and timings</button><main></main><script>
const report=${data};
document.title=report.model.name+' listening review';
document.querySelector('h1').textContent=document.title;
document.querySelector('#environment').textContent=report.environment.softwareGpu?'Software GPU run: correctness only, not phone performance.':'Browser GPU run: results apply only to this machine and test.';
for(const row of report.results){
 const card=document.createElement('article'),heading=document.createElement('h2'),text=document.createElement('p'),audio=document.createElement('audio'),detail=document.createElement('pre');
 heading.textContent=row.label+' · '+row.passage+' · repeat '+row.repeat;
 text.textContent=report.corpus.find(item=>item.id===row.passage).text;
 audio.controls=true;audio.preload='metadata';audio.src=row.file;audio.defaultPlaybackRate=row.playbackRate;audio.playbackRate=row.playbackRate;audio.preservesPitch=true;
 audio.onplay=()=>document.querySelectorAll('audio').forEach(other=>{if(other!==audio)other.pause()});
 detail.hidden=true;detail.textContent=JSON.stringify(row,null,2);card.append(heading,text,audio,detail);document.querySelector('main').append(card);
}
document.querySelector('#reveal').onclick=()=>document.querySelectorAll('pre').forEach(item=>item.hidden=false);
</script></html>`;
}

async function main() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) { console.log(help); return; }
  const config = parse(process.argv.slice(2));
  const environment = await startBrowser({ args: config.software
    ? ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [] });
  let timer;
  try {
    const page = await environment.browser.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.exposeFunction('auditionProgress', row => console.log(`${row.label} ${row.passage} repeat${row.repeat}: ${row.audioSeconds.toFixed(3)}s audio, ${(row.generationMs / 1000).toFixed(2)}s generation, headroom ${row.headroom.toFixed(2)}.`));
    await page.goto(`${environment.url}/scripts/audition.html`);
    await page.waitForFunction(() => window.audition);
    const gpu = await page.evaluate(async () => {
      const adapter = await navigator.gpu?.requestAdapter();
      if (!adapter) throw new Error('No WebGPU adapter. Use a supported browser or explicitly opt in to --software-gpu.');
      return { vendor: adapter.info?.vendor, architecture: adapter.info?.architecture,
        description: adapter.info?.description, features: [...adapter.features] };
    });
    if (!config.software && /swiftshader|software/i.test(JSON.stringify(gpu))) throw new Error('Software adapter detected; pass --software-gpu to acknowledge correctness-only timing.');
    console.log(config.software ? 'Explicit software WebGPU: correctness only, not a phone benchmark.' : 'Real browser WebGPU: this machine only, not an iPhone benchmark.');
    console.log(`Loading and warming each rate; writing artifacts to ${config.out}`);
    await page.evaluate(() => window.addEventListener('audition-result', event => window.auditionProgress(event.detail)));
    const report = await Promise.race([
      page.evaluate(options => window.audition.run(options), config.options),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Audition timed out. Increase --timeout for a slow adapter.')), config.timeout); }),
    ]);
    clearTimeout(timer);
    report.environment = { softwareGpu: config.software, gpu, browser: environment.browser.version() };
    report.browserErrors = errors;
    await mkdir(config.out, { recursive: true });
    for (const [index, row] of report.results.entries()) {
      const bytes = await page.evaluate(index => window.audition.wavBase64(index), index);
      await writeFile(resolve(config.out, row.file), Buffer.from(bytes, 'base64'));
    }
    await writeFile(resolve(config.out, 'report.json'), JSON.stringify(report, null, 2) + '\n');
    await writeFile(resolve(config.out, 'review.html'), reviewHtml(report));
    if (errors.length) throw new Error(`Unexpected browser errors: ${errors.join('; ')}`);
    console.log(`Saved ${report.results.length} WAVs, report.json and review.html in ${config.out}`);
  } finally { clearTimeout(timer); await environment.close(); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
