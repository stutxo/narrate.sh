import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { after, before, test } from 'node:test';
import { MODEL } from '../model-config.js';
import { startBrowser, openApp, session, waitSession, reply, audioState, PASSAGE, begin, waitStopped, cleanErrors } from './app-fixtures.mjs';

let environment, configSource;
before(async () => {
  configSource = await readFile(new URL('../model-config.js', import.meta.url), 'utf8');
  environment = await startBrowser();
});
after(async () => { await environment?.close(); });

const previousModelId = 'previous-recording-generation';
const replacementRevision = '1111111111111111111111111111111111111111';
const text = ['The first reader', 'The second reader', 'The final reader']
  .map(opening => PASSAGE.replace('The reader', opening)).join(' ');

// Change real metadata, including its derived identity; never replace the app's
// compatibility decision or fetch another physical model in a browser test.
async function changeConfig(page, { revision, name = 'Another local voice', expectAudio = true } = {}) {
  let source = configSource.replace(/name: '[^']*'/, `name: ${JSON.stringify(name)}`);
  if (revision) source = source.replace(/revision: '[^']*'/, `revision: ${JSON.stringify(revision)}`);
  await page.route('**/model-config.js*', route => route.fulfill({ contentType: 'application/javascript', body: source }));
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#text').disabled);
  if (expectAudio) {
    await page.waitForFunction(() => document.querySelector('#audio').readyState >= 2);
    await page.waitForFunction(() => !document.querySelector('#audio').seeking);
  }
}

async function recording(page, count = 2) {
  await begin(page, text);
  await page.locator('#audio').evaluate(audio => audio.pause());
  for (let i = 0; i < count; i++) await reply(page);
  await waitSession(page, saved => saved.generated === count);
  if (count < 3) await page.locator('#speak').click();
  await waitStopped(page);
  await page.waitForFunction(() => document.querySelector('#audio').readyState >= 2);
  await page.locator('#audio').evaluate(audio => {
    audio.pause(); audio.playbackRate = 1.25; audio.currentTime = 1.1;
  });
  return waitSession(page, saved => saved.rate === 1.25 && Math.abs(saved.position - 1.1) < .01);
}

async function assertPreserved(page, saved) {
  const restored = await session(page), audio = await audioState(page);
  for (const field of ['text', 'parts', 'generated', 'model', 'audioKeys']) assert.deepEqual(restored[field], saved[field], field);
  assert.equal(restored.rate, saved.rate); assert(Math.abs(restored.position - saved.position) < .01);
  assert.equal(audio.rate, saved.rate); assert(Math.abs(audio.time - saved.position) < .01);
  assert.equal(await page.locator('#text').inputValue(), saved.text);
  assert.equal(await page.locator('#text').evaluate(element => element.readOnly), true);
  assert.equal(await page.evaluate(() => window.__speech.requests.length), 0, 'Restoring or renaming a model cannot start synthesis');
  await page.locator('button[data-plyr="play"]').click();
  await page.waitForFunction(time => document.querySelector('#audio').currentTime > time + .05, saved.position);
  await page.locator('#audio').evaluate(element => element.pause());
  assert.equal((await audioState(page)).src, audio.src, 'Playing saved speech preserves its native source');
}

async function replaceFirstPassage(page, old) {
  await page.evaluate(() => { window.__speech.seconds = 2; });
  await page.locator('#speak').click();
  await page.waitForFunction(() => window.__speech.requests.length > 0);
  const empty = await session(page);
  assert.equal(empty.generated, 0); assert.deepEqual(empty.audioKeys, [], 'Old audio is removed together with the replacement checkpoint');
  assert.equal(empty.position, 0, 'Replacement speech starts a new timeline');
  assert.notEqual(empty.model, old.model);
  assert.equal(await page.evaluate(() => window.__speech.requests[0].modelId), empty.model,
    'The worker must confirm the same generation identity before loading weights');
  assert.equal(await page.evaluate(() => window.__speech.requests[0].text), old.parts[0], 'Regeneration begins at the first passage');
  await reply(page); await waitSession(page, saved => saved.generated === 1);
  await page.locator('#speak').click(); await waitStopped(page);
  await page.waitForFunction(() => document.querySelector('#audio').readyState >= 2);
  const replacement = await session(page);
  assert.deepEqual(replacement.audioKeys, [0]); assert.equal(replacement.generated, 1);
  assert.equal(replacement.text, old.text); assert.equal(replacement.rate, old.rate);
  assert.equal((await audioState(page)).duration, 2, 'The native recording contains the replacement passage only');
  return replacement;
}

test('changing only the model label loads metadata and preserves Resume compatibility', { timeout: 15000 }, async t => {
  const app = await openApp(environment, { seconds: 4 }); t.after(app.close);
  const { page, errors } = app;
  const saved = await recording(page), requests = [];
  page.on('request', request => requests.push(request.url()));
  await changeConfig(page, { name: 'Renamed Micro' });
  assert.equal(await page.locator('#model-name').textContent(), 'Renamed Micro · WebGPU');
  assert.match(await page.locator('.lede').textContent(), /Renamed Micro/);
  assert.equal(await page.locator('#speak').textContent(), 'Resume generation');
  await assertPreserved(page, saved);
  assert.deepEqual(requests.filter(url => /\/models\/|\/vendor\/kitten\/|huggingface\.co|speech-worker\.js/.test(url)), [],
    'Opening the app reads model metadata without importing its adapter, inference runtime, or weights');
  await page.locator('#speak').click();
  await page.waitForFunction(() => window.__speech.requests.length > 0);
  assert.equal(await page.evaluate(() => window.__speech.requests[0].text), saved.parts[2]);
  await page.locator('#speak').click(); await waitStopped(page);
  assert.equal((await session(page)).model, saved.model);
  cleanErrors(errors);
});

test('saved audio from another model stays playable until the user regenerates it', { timeout: 15000 }, async t => {
  const app = await openApp(environment, { seconds: 4 }); t.after(app.close);
  const { page, errors } = app;
  const saved = { ...await recording(page), model: previousModelId };
  await page.evaluate(model => new Promise((resolve, reject) => {
    const open = indexedDB.open('narrate.sh');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction('current', 'readwrite'), store = transaction.objectStore('current');
      const request = store.get('session');
      request.onsuccess = () => store.put({ ...request.result, model }, 'session');
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }), previousModelId);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('#audio').readyState >= 2 && !document.querySelector('#audio').seeking);
  assert.equal(await page.locator('#model-name').textContent(), 'Kitten Micro · WebGPU');
  assert.equal(await page.locator('#speak').textContent(), 'Read aloud again');
  await assertPreserved(page, saved);
  const replacement = await replaceFirstPassage(page, saved);
  assert.equal(replacement.model, MODEL.id);
  cleanErrors(errors);
});

for (const count of [2, 3]) {
  test(`a model revision preserves ${count === 3 ? 'complete' : 'unfinished'} saved audio until explicit regeneration`, { timeout: 15000 }, async t => {
    const app = await openApp(environment, { seconds: 4 }); t.after(app.close);
    const { page, errors } = app;
    const saved = await recording(page, count);
    await changeConfig(page, { revision: replacementRevision });
    assert.equal(await page.locator('#speak').textContent(), 'Read aloud again');
    assert.equal(await page.locator('#speak').isEnabled(), true);
    await assertPreserved(page, saved);
    const replacement = await replaceFirstPassage(page, saved);
    assert(replacement.model.includes(replacementRevision));
    assert.equal(await page.locator('#speak').textContent(), 'Resume generation');
    cleanErrors(errors);
  });
}

test('an aborted replacement clear preserves stored audio and retry removes every old chunk', { timeout: 15000 }, async t => {
  const app = await openApp(environment, { seconds: 4 }); t.after(app.close);
  const { page, errors } = app;
  const saved = await recording(page, 3);
  await changeConfig(page, { revision: replacementRevision });
  await page.evaluate(() => {
    const clear = IDBObjectStore.prototype.clear;
    IDBObjectStore.prototype.clear = function () {
      IDBObjectStore.prototype.clear = clear;
      const request = clear.call(this);
      queueMicrotask(() => this.transaction.abort());
      return request;
    };
  });
  await page.locator('#speak').click(); await waitStopped(page);
  const failed = await session(page);
  assert.deepEqual({ generated: failed.generated, model: failed.model, keys: failed.audioKeys },
    { generated: saved.generated, model: saved.model, keys: saved.audioKeys },
    'A failed clear rolls back audio and metadata together');
  assert.match(await page.locator('#status').textContent(), /save|abort/i);
  assert.equal(await page.evaluate(() => window.__speech.requests.length), 0);
  await page.waitForFunction(() => document.querySelector('#audio').readyState >= 2 && !document.querySelector('#audio').seeking);
  assert.equal(await page.locator('#speak').textContent(), 'Read aloud again');
  await assertPreserved(page, saved);
  await replaceFirstPassage(page, saved);
  cleanErrors(errors, [/Could not save this session|AbortError/i]);
});

test('a recording without a saved model identity is playable but must regenerate from its beginning', { timeout: 15000 }, async t => {
  const app = await openApp(environment, { seconds: 4 }); t.after(app.close);
  const { page, errors } = app;
  const saved = await recording(page);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('narrate.sh');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction('current', 'readwrite'), store = transaction.objectStore('current');
      const request = store.get('session');
      request.onsuccess = () => { const value = request.result; delete value.model; store.put(value, 'session'); };
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }));
  await page.reload();
  await page.waitForFunction(() => !document.querySelector('#text').disabled);
  await page.waitForFunction(() => document.querySelector('#audio').readyState >= 2 && !document.querySelector('#audio').seeking);
  assert.equal(await page.locator('#speak').textContent(), 'Read aloud again');
  await assertPreserved(page, { ...saved, model: undefined });
  await replaceFirstPassage(page, { ...saved, model: undefined });
  cleanErrors(errors);
});

test('missing older-model audio keeps its restoration error visible and can regenerate', { timeout: 15000 }, async t => {
  const app = await openApp(environment, { seconds: 4 }); t.after(app.close);
  const { page, errors } = app;
  const saved = await recording(page);
  await page.evaluate(() => new Promise((resolve, reject) => {
    const open = indexedDB.open('narrate.sh');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result, transaction = db.transaction('current', 'readwrite');
      transaction.objectStore('current').delete(1);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
  }));
  await changeConfig(page, { revision: replacementRevision, expectAudio: false });
  assert.match(await page.locator('#status').textContent(), /Saved audio is missing/);
  assert.equal(await page.locator('#output').isVisible(), false);
  assert.equal(await page.locator('#speak').textContent(), 'Read aloud again');
  assert.equal(await page.locator('#speak').isEnabled(), true);
  const restored = await session(page);
  for (const field of ['text', 'parts', 'generated', 'model', 'position', 'rate']) assert.deepEqual(restored[field], saved[field], field);
  assert.deepEqual(restored.audioKeys, [0], 'Opening the broken recording leaves its surviving audio and checkpoint intact');
  assert.equal(await page.evaluate(() => window.__speech.requests.length), 0);
  await replaceFirstPassage(page, saved);
  cleanErrors(errors, [/Saved audio is missing/]);
});

for (const modelId of [undefined, 'another-deployment']) {
  test(`Resume rejects ${modelId ? 'different' : 'missing'} worker identity without appending its audio`, { timeout: 15000 }, async t => {
    const app = await openApp(environment, { seconds: 4 }); t.after(app.close);
    const { page, errors } = app;
    const saved = await recording(page);
    await page.locator('#speak').click();
    await page.waitForFunction(() => window.__speech.pending.length > 0);
    await page.evaluate(modelId => {
      const job = window.__speech.pending[0];
      job.worker.onmessage({ data: { type: 'audio', id: job.message.id, modelId,
        pcm: new Uint8Array(96000), sampleRate: 24000 } });
    }, modelId);
    await waitStopped(page);
    assert.match(await page.locator('#status').textContent(), /model has changed.*Reload/);
    const restored = await session(page);
    for (const field of ['generated', 'model', 'audioKeys', 'text', 'parts']) assert.deepEqual(restored[field], saved[field], field);
    assert.equal(await page.locator('#speak').textContent(), 'Resume generation');
    cleanErrors(errors, [/model has changed.*Reload/]);
  });
}
