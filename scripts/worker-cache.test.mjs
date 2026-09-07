import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';
import { MODEL } from '../model-config.js';

test('a new worker deployment refreshes its adapter while preserving model identity and normal cache reuse', { timeout: 15000 }, async () => {
  const workerSource = await readFile(new URL('../speech-worker.js', import.meta.url), 'utf8');
  const configSource = await readFile(new URL('../model-config.js', import.meta.url), 'utf8');
  let sample = -.5;
  const requests = [];
  // Real HTTP caching is essential: Playwright routing disables the cache and
  // would conceal a fresh worker importing an older, still-fresh adapter URL.
  const server = createServer((request, response) => {
    requests.push(request.url);
    const path = new URL(request.url, 'http://localhost').pathname;
    let source;
    if (path === '/speech-worker.js') source = workerSource;
    else if (path === '/model-config.js') source = configSource;
    else if (path === '/models/kitten.js') source = `export async function createModel() {
      return { async generate() { return { samples: new Float32Array([${sample}]), sampleRate: 24000, channels: 1 }; } };
    }`;
    else if (path === '/legacy-worker.js') source = `const { createModel } = await import(${JSON.stringify(MODEL.adapter)});
      const model = await createModel(); postMessage((await model.generate()).samples[0]);`;
    if (source !== undefined) response.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'public, max-age=600' }).end(source);
    else if (path === '/') response.writeHead(200, { 'Content-Type': 'text/html' }).end('<!doctype html><title>Worker cache regression</title>');
    else response.writeHead(204).end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  let browser;
  try {
    browser = await chromium.launch({ headless: true,
      executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const run = (url, generation = false) => page.evaluate(({ url, generation, modelId }) => new Promise((resolve, reject) => {
      const worker = new Worker(url, { type: 'module' });
      const timer = setTimeout(() => { worker.terminate(); reject(new Error('The cache-test worker did not reply.')); }, 5000);
      worker.onmessage = ({ data }) => {
        if (data.type === 'status') return;
        clearTimeout(timer);
        worker.terminate();
        if (data.type === 'error') reject(new Error(data.message));
        else resolve(generation ? { modelId: data.modelId, sample: new DataView(data.pcm.buffer).getInt16(0, true) } : data);
      };
      worker.onerror = error => { clearTimeout(timer); worker.terminate(); reject(new Error(error.message)); };
      if (generation) worker.postMessage({ type: 'generate', id: 1, text: 'Cache check.', modelId });
    }), { url, generation, modelId: MODEL.id });

    assert.equal(await run('/legacy-worker.js?v=1'), -.5);
    sample = .5;
    assert.equal(await run('/legacy-worker.js?v=2'), -.5, 'The browser really retains the previously cached adapter body.');
    assert.deepEqual(await run('/speech-worker.js?v=17', true), { modelId: MODEL.id, sample: 16384 },
      'A new production worker uses the updated adapter even while its compatibility URL is cached.');
    sample = .25;
    assert.deepEqual(await run('/speech-worker.js?v=17', true), { modelId: MODEL.id, sample: 16384 },
      'Another worker in the same deployment reuses the cached adapter.');
    assert.deepEqual(await run('/speech-worker.js?v=18', true), { modelId: MODEL.id, sample: 8192 },
      'The next deployment refreshes the adapter without invalidating saved recordings.');
    assert.deepEqual(requests.filter(url => url.startsWith('/models/')), [
      '/models/kitten.js?v=1', '/models/kitten.js?v=1&release=17', '/models/kitten.js?v=1&release=18',
    ]);
  } finally {
    await browser?.close();
    await new Promise(resolve => server.close(resolve));
  }
});
