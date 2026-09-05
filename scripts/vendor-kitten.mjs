// Regenerate the checked-in runtime: node scripts/vendor-kitten.mjs
// Requires Node 22+, tar, and network access. The site itself needs no build step.
import { mkdtemp, readFile, writeFile, mkdir, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const revision = '35f31049363ea39464dc05d42c1135b5c9e3235f';
const output = fileURLToPath(new URL('../vendor/kitten/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'narrate-kitten-'));
const source = join(temporary, `kitten-tts-webgpu-${revision}`);
async function download(url, path) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  await writeFile(path, new Uint8Array(await response.arrayBuffer()));
}
function replace(text, before, after) {
  if (!text.includes(before)) throw new Error(`Upstream patch does not match: ${before}`);
  return text.replace(before, after);
}
try {
  await download(`https://codeload.github.com/svenflow/kitten-tts-webgpu/tar.gz/${revision}`, join(temporary, 'source.tgz'));
  execFileSync('tar', ['xzf', join(temporary, 'source.tgz'), '-C', temporary]);
  await mkdir(output, { recursive: true });

  let phonemizer = await readFile(join(source, 'src/phonemizer.ts'), 'utf8');
  // Use the dictionary/rules frontend directly; never start the Safari-hanging
  // WASM frontend (which also discarded all but its first returned segment).
  phonemizer = replace(phonemizer, "import { phonemize } from 'phonemizer';", '');
  const espeakStart = phonemizer.indexOf('export async function textToPhonemesEspeak(');
  const dictionaryStart = phonemizer.indexOf('// ── Large dictionary');
  if (espeakStart < 0 || dictionaryStart < espeakStart) throw new Error('Phonemizer source changed');
  phonemizer = phonemizer.slice(0, espeakStart) + phonemizer.slice(dictionaryStart);
  const entryStart = phonemizer.indexOf('export async function textToInputIds(');
  if (entryStart < 0) throw new Error('Missing phonemizer entry');
  phonemizer = phonemizer.slice(0, entryStart) + `export async function textToInputIds(text: string) {
  return { ids: phonemesToInputIds(await textToPhonemesDictRules(text)), method: 'dictionary' };
}\n`;
  for (const asset of ['espeak-en-dict.tsv', 'en_rules']) {
    phonemizer = replace(phonemizer, `fetch('./${asset}')`, `fetch(new URL('./${asset}', import.meta.url))`);
    phonemizer = replace(phonemizer, `console.warn('Failed to load ${asset}:', e);`, 'throw e;');
  }
  await writeFile(join(source, 'src/phonemizer.ts'), phonemizer);

  let engine = await readFile(join(source, 'src/engine.ts'), 'utf8');
  // Cache only pinned model/voice URLs. Caching is optional: private browsing,
  // quota exhaustion, and cache eviction must never prevent generation.
  const modelCache = `async function modelBytes(url: string): Promise<ArrayBuffer> {
  let cache: Cache | undefined;
  try {
    cache = await globalThis.caches?.open('narrate-kitten-models-v1');
    const cached = await cache?.match(url);
    if (cached) return await cached.arrayBuffer();
  } catch {}
  const response = await fetch(url);
  if (!response.ok) throw new Error('Model download failed: HTTP ' + response.status);
  const bytes = await response.arrayBuffer();
  try {
    await cache?.put(url, new Response(bytes, { headers: { 'Content-Type': 'application/octet-stream' } }));
  } catch {}
  return bytes;
}\n`;
  engine = engine.replaceAll('window.dispatchEvent(', 'globalThis.dispatchEvent(');
  for (const asset of ['onnxUrl', 'voicesUrl']) {
    engine = replace(engine, `fetch(${asset}).then(r => r.arrayBuffer())`, `modelBytes(${asset})`);
  }
  await writeFile(join(source, 'src/engine.ts'), modelCache + engine);
  await writeFile(join(source, 'src/narrate.ts'), `export { KittenTTSEngine } from './engine.js';
export { textToInputIds } from './phonemizer.js';\n`);
  execFileSync('npx', ['--yes', '--package=esbuild@0.25.11', 'esbuild', join(source, 'src/narrate.ts'),
    '--bundle', '--format=esm', '--target=es2022', '--minify', '--log-level=warning',
    '--banner:js=/*! Kitten TTS WebGPU; source and license details: NOTICE.md */',
    `--outfile=${join(output, 'runtime.js')}`], {
    stdio: 'inherit', env: { ...process.env, npm_config_cache: join(tmpdir(), 'narrate-npm-cache') },
  });
  for (const asset of ['espeak-en-dict.tsv', 'en_rules']) {
    await copyFile(join(source, 'public', asset), join(output, asset));
  }
  await copyFile(join(source, 'LICENSE'), join(output, 'LICENSE-APACHE-2.0'));
  await download('https://raw.githubusercontent.com/espeak-ng/espeak-ng/1.52.0/COPYING', join(output, 'LICENSE-GPL-3.0'));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
