import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { benchmark, parseArgs } from './benchmark-model.mjs';
import { startBrowser } from './app-fixtures.mjs';

function controlledWorker(mode) {
  Object.defineProperty(navigator, 'gpu', { configurable: true, value: mode === 'no-gpu' ? undefined : {
    requestAdapter: async () => {
      if (mode === 'frozen-probe') { console.log('PROBE_STARTED'); while (true) {} }
      return { info: { description: mode === 'software' ? 'SwiftShader' : 'Controlled test adapter' }, features: new Set() };
    },
  } });
  window.Worker = class {
    constructor(url) { this.calls = 0; window.benchmarkEvent({ type: 'worker', url: String(url) }); }
    async postMessage(request) {
      await window.benchmarkEvent({ type: 'request', ...request });
      this.calls++;
      if (mode === 'timeout' && this.calls > 1) return;
      if (mode === 'worker-error' && this.calls > 1) {
        this.onmessage({ data: { type: 'error', id: request.id, message: 'Injected worker failure.' } }); return;
      }
      const pcm = new Uint8Array(48000), view = new DataView(pcm.buffer);
      if (mode !== 'silent') for (let i = 0; i < pcm.length; i += 2) view.setInt16(i, 1000, true);
      const initMs = this.calls === 1 ? 20 : 0;
      this.onmessage({ data: { type: 'audio', id: request.id, modelId: mode === 'identity' ? 'other-worker' : request.modelId,
        pcm: mode === 'pcm' ? new Float32Array([NaN]) : pcm, sampleRate: 24000,
        metrics: { initMs, generationMs: mode === 'metrics' ? NaN : 10, totalMs: initMs + 12, audioSeconds: 1, synthesisRate: 1 } } });
    }
  };
}
function fixture(t, mode = 'good') {
  const observed = { events: [], launches: [], probing: false };
  const openBrowser = async options => {
    observed.launches.push(options);
    const environment = await startBrowser(); observed.browser = environment.browser;
    t.after(() => environment.close());
    return { ...environment, browser: { version: () => environment.browser.version(), newPage: async () => {
      const page = await environment.browser.newPage();
      page.on('console', message => { if (message.text() === 'PROBE_STARTED') observed.probing = true; });
      await page.exposeFunction('benchmarkEvent', event => observed.events.push(event));
      await page.addInitScript(controlledWorker, mode); return page;
    } } };
  };
  return { observed, openBrowser };
}

test('benchmark validates bounded inputs before launching a browser', async () => {
  assert.equal(parseArgs([]).repeats, 2); assert.equal(parseArgs([]).timeout, 180000);
  let opened = false;
  for (const args of [['--text', ''], ['--text', 'x'.repeat(501)], ['--repeats', '0'], ['--repeats', '6'],
    ['--repeats', '1.5'], ['--timeout', 'NaN'], ['--timeout', '0'], ['--timeout', '1801'], ['--unknown'], ['--out']]) {
    await assert.rejects(benchmark(args, async () => { opened = true; throw new Error('Unexpected browser launch'); }));
  }
  assert.equal(opened, false);
});

test('benchmark keeps one worker, separates startup and warm RTF, and excludes text/audio from JSON', { timeout: 10000 }, async t => {
  const { observed, openBrowser } = fixture(t);
  const report = await benchmark(['--text', 'A private custom test phrase.'], openBrowser);
  assert.equal(report.results.length, 3); assert.deepEqual(report.results.map(row => row.phase), ['first', 'warm', 'warm']);
  assert.deepEqual(report.results.map(row => row.initMs), [20, 0, 0]);
  assert(report.results.every(row => row.audioSeconds === 1 && row.rtf === .01 && row.workerRtf === .012 && row.signal.rms > 0));
  assert(report.startupWallMs >= report.setupMs); assert(report.elapsedMs >= report.startupWallMs);
  assert.equal(observed.events.filter(event => event.type === 'worker').length, 1);
  const requests = observed.events.filter(event => event.text);
  assert.equal(requests.length, 3); assert(requests.every(request => request.text === 'A private custom test phrase.'));
  assert.equal(report.words, 5); assert.deepEqual(report.browserErrors, []);
  assert(!JSON.stringify(report).includes('A private custom test phrase.')); assert(!JSON.stringify(report).includes('"pcm"'));
  assert.equal(observed.browser.isConnected(), false);
});

for (const [mode, error] of [['no-gpu', /WebGPU is unavailable/], ['software', /Software adapter detected/],
  ['pcm', /Invalid worker identity or PCM16/], ['identity', /Invalid worker identity or PCM16/],
  ['metrics', /Invalid worker timing/], ['silent', /silent or inaudible/]]) {
  test(`benchmark rejects ${mode} without a successful result and closes its browser`, { timeout: 10000 }, async t => {
    const { observed, openBrowser } = fixture(t, mode);
    await assert.rejects(benchmark([], openBrowser), failure => {
      assert.match(failure.message, error); assert.deepEqual(failure.report.results, []);
      assert.equal(typeof failure.report.environment.browser, 'string'); return true;
    });
    assert.equal(observed.browser.isConnected(), false);
    if (['no-gpu', 'software'].includes(mode)) assert.equal(observed.events.length, 0);
  });
}

test('software GPU requires explicit opt-in and remains labelled in the report', { timeout: 10000 }, async t => {
  const { observed, openBrowser } = fixture(t, 'software');
  const report = await benchmark(['--software-gpu', '--repeats', '1'], openBrowser);
  assert.equal(report.environment.softwareGpu, true); assert.equal(report.results.length, 2);
  assert(observed.launches[0].args.includes('--use-angle=swiftshader'));
});

for (const mode of ['timeout', 'worker-error']) {
  test(`${mode} preserves completed results in the JSON file and releases its worker with the browser`, { timeout: 10000 }, async t => {
    const { observed, openBrowser } = fixture(t, mode), directory = await mkdtemp(join(tmpdir(), 'narrate-benchmark-'));
    t.after(() => rm(directory, { recursive: true, force: true }));
    const out = join(directory, 'report.json');
    await assert.rejects(benchmark(['--timeout', '1', '--out', out], openBrowser), mode === 'timeout' ? /timed out/ : /Injected worker failure/);
    const report = JSON.parse(await readFile(out, 'utf8'));
    assert.equal(report.results.length, 1); assert(report.error); assert(report.startupWallMs > 0);
    assert.equal(observed.browser.isConnected(), false); assert.equal(observed.events.filter(event => event.text).length, 2);
  });
}

test('the deadline terminates a renderer frozen in the GPU probe', { timeout: 10000 }, async t => {
  const { observed, openBrowser } = fixture(t, 'frozen-probe');
  await assert.rejects(benchmark(['--timeout', '1'], openBrowser), /timed out/);
  assert.equal(observed.probing, true); assert.equal(observed.browser.isConnected(), false);
  assert.deepEqual(observed.events, []);
});
