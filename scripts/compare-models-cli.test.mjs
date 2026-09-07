import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { test } from 'node:test';
import { main } from './compare-models.mjs';
import { startBrowser } from './app-fixtures.mjs';
import { CANDIDATES } from './compare-config.js';
import { wavBytes } from './audition-utils.js';

async function fixture(t, script) {
  const environment = await startBrowser(); t.after(() => environment.close());
  const out = await mkdtemp(join(tmpdir(), 'narrate-cli-test-')); t.after(() => rm(out, { recursive: true, force: true }));
  const page = await environment.browser.newPage();
  await page.route('**/scripts/compare-models.html', route => route.fulfill({ contentType: 'text/html', body: `<script>${script}</script>` }));
  const launches = [];
  const openBrowser = async options => { launches.push(options); return ({ ...environment, browser: {
    newPage: async () => page, version: () => environment.browser.version(),
  } }); };
  return { environment, page, out, openBrowser, launches };
}

test('CLI timeout saves responsive partial audio and identifies the deadline', { timeout: 10000 }, async t => {
  const wav = wavBytes(new Uint8Array([0, 0, 1, 0]));
  const report = { corpus: [{ id: 'custom', text: '</script><script>globalThis.compromised=true</script>' }],
    models: [{ key: 'kitten', id: 'fixture-model', name: 'Hidden identity', label: 'A' }], warmups: [], failures: [],
    results: [{ label: 'A', passage: 'custom', repeat: 1, modelId: 'fixture-model', file: 'custom-A-r1.wav', audioSeconds: 2 / 24000, generationMs: 1 }] };
  const app = await fixture(t, `
    Object.defineProperty(navigator, 'gpu', {value:{requestAdapter:async()=>({info:{},features:[]})}});
    let rejectRun;
    window.comparison = { report:${JSON.stringify(report).replaceAll('<', '\\u003c')},
      run(options) { this.report.requestedModels=options.models; console.error('Fixture console diagnostic'); return new Promise((_,reject)=>rejectRun=reject); },
      stop() { rejectRun?.(new Error('Stopped')); }, wavBase64() { return '${Buffer.from(wav).toString('base64')}'; } };
  `);
  await assert.rejects(main(['--timeout', '1', '--out', app.out], app.openBrowser), /Comparison timed out after 1 seconds/);
  const saved = JSON.parse(await readFile(join(app.out, 'report.json'), 'utf8'));
  assert.equal(saved.partial, true); assert.equal(saved.timedOut, true); assert.equal(saved.exportComplete, true);
  assert.deepEqual(saved.corpus, report.corpus, 'Safe HTML embedding preserves the original narration text.');
  assert.match(saved.error, /timed out/); assert.equal(saved.results.length, 1);
  assert.deepEqual(saved.requestedModels, CANDIDATES.filter(model => !model.optional).map(model => model.key));
  assert.deepEqual(saved.browserErrors, ['Fixture console diagnostic']);
  assert.deepEqual(saved.exportedFiles, ['custom-A-r1.wav']);
  assert.deepEqual(await readFile(join(app.out, saved.results[0].file)), Buffer.from(wav));
  const html = await readFile(join(app.out, 'review.html'), 'utf8');
  assert.equal(html.match(/<\/script>/g).length, 1, 'Narration text cannot close the review page script.');
  assert.match(html, /id="details" hidden/);
  assert.equal(app.environment.browser.isConnected(), false);
});

test('CLI deadline also terminates a renderer frozen inside adapter probing', { timeout: 10000 }, async t => {
  const app = await fixture(t, `
    window.comparison={report:null,stop(){}};
    Object.defineProperty(navigator,'gpu',{value:{requestAdapter(){console.log('PROBE_STARTED');while(true){}}}});
  `);
  let probing = false;
  app.page.on('console', message => { if (message.text() === 'PROBE_STARTED') probing = true; });
  await assert.rejects(main(['--models', 'pocket-f32', '--timeout', '1', '--out', app.out], app.openBrowser), /Comparison timed out after 1 seconds/);
  assert.equal(probing, true, 'The deadline must interrupt the actual stalled adapter probe, not only page readiness.');
  const saved = JSON.parse(await readFile(join(app.out, 'report.json'), 'utf8'));
  assert.equal(saved.timedOut, true); assert.equal(saved.partial, true); assert.deepEqual(saved.results, []);
  assert.equal(saved.environment.gpu, null);
  assert.equal(app.environment.browser.isConnected(), false, 'Closing the owned browser does not require renderer JavaScript to respond.');
});

test('CLI defaults to CPU and exports a report without probing or enabling WebGPU', { timeout: 10000 }, async t => {
  const app = await fixture(t, `
    Object.defineProperty(navigator,'gpu',{get(){throw new Error('CPU CLI must not probe GPU');}});
    window.comparison={ report:null, stop(){}, run(options){
      return this.report={corpus:[],models:[],warmups:[],results:[],failures:[],requestedModels:options.models};
    }};
  `);
  await main(['--software-gpu', '--out', app.out], app.openBrowser);
  assert.deepEqual(app.launches, [{ args: [] }], 'A CPU run never enables the software GPU, even when the flag is supplied.');
  const saved = JSON.parse(await readFile(join(app.out, 'report.json'), 'utf8'));
  assert.deepEqual(saved.requestedModels, ['pocket-cpu']);
  assert.equal(saved.environment.backend, 'wasm'); assert.equal(saved.environment.gpu, null);
  assert.equal(saved.environment.softwareGpu, false); assert.equal(saved.exportComplete, true);
  assert.match(await readFile(join(app.out, 'review.html'), 'utf8'), /CPU\/WebAssembly/);
});

test('explicit GPU comparison still rejects unacknowledged software adapters', { timeout: 10000 }, async t => {
  const app = await fixture(t, `
    Object.defineProperty(navigator,'gpu',{value:{requestAdapter:async()=>({info:{description:'SwiftShader'},features:[]})}});
    window.comparison={report:null,stop(){},run(){throw new Error('Generation must not start');}};
  `);
  await assert.rejects(main(['--models', 'pocket-f32', '--out', app.out], app.openBrowser), /Software adapter detected/);
  const saved = JSON.parse(await readFile(join(app.out, 'report.json'), 'utf8'));
  assert.equal(saved.partial, true); assert.deepEqual(saved.results, []);
  assert.equal(saved.environment.backend, 'webgpu-or-mixed');
});
