// Regenerate the experimental browser runtime; never downloads model weights.
// Requires Node 22+ and network access. Does not modify the site's dependencies.
import { mkdtemp, mkdir, readFile, writeFile, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const revision = '970fa22d934ce2e617cd3a993c6ecc8b736496f2';
const dependencies = { '@jax-js/jax': '0.1.24', '@jax-js/loaders': '0.1.3',
  '@bufbuild/protobuf': '2.10.2', 'sentencepiece-buf': '0.2.1-0', esbuild: '0.25.11' };
const output = fileURLToPath(new URL('../vendor/pocket/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'narrate-pocket-'));
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status}: ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
try {
  await mkdir(output, { recursive: true });
  const source = await download(`https://raw.githubusercontent.com/ekzhang/jax-js/${revision}/website/src/routes/tts/pocket-tts.ts`);
  await writeFile(join(temporary, 'pocket-tts.ts'), source);
  await writeFile(join(temporary, 'package.json'), JSON.stringify({ private: true, type: 'module',
    dependencies, overrides: { '@bufbuild/protobuf': dependencies['@bufbuild/protobuf'],
      'sentencepiece-buf': dependencies['sentencepiece-buf'] } }));
  execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund'], {
    cwd: temporary, stdio: 'inherit', env: { ...process.env, npm_config_cache: join(tmpdir(), 'narrate-npm-cache') },
  });
  await writeFile(join(temporary, 'entry.ts'), `export { init, defaultDevice, getWebGPUDevice, numpy, random, tree } from '@jax-js/jax';
export { safetensors, tokenizers } from '@jax-js/loaders';
export { fromSafetensors, createFlowLMState, createMimiDecodeState, runFlowLMStep, runMimiDecode } from './pocket-tts';
`);
  execFileSync(join(temporary, 'node_modules/.bin/esbuild'), ['entry.ts', '--bundle', '--format=esm',
    '--target=es2022', '--minify', '--log-level=warning', '--legal-comments=inline',
    '--banner:js=/*! Experimental Pocket TTS WebGPU; source and licenses: NOTICE.md */',
    `--outfile=${join(output, 'runtime.js')}`], { cwd: temporary, stdio: 'inherit' });
  await copyFile(join(temporary, 'node_modules/@jax-js/jax/LICENSE'), join(output, 'LICENSE-JAX-MIT'));
  // The published protobuf/tokenizer packages omit standalone license files.
  const protobufSource = 'https://raw.githubusercontent.com/bufbuild/protobuf-es/1b444c256d426b4cfc74b02f296e4909f39e2182/';
  await writeFile(join(output, 'LICENSE-APACHE-2.0'), await download(protobufSource + 'LICENSE'));
  const varintSource = new TextDecoder().decode(await download(protobufSource + 'packages/protobuf/src/wire/varint.ts'));
  const bsd = varintSource.match(/^(?:\/\/[^\n]*\n)+/u)?.[0];
  if (!bsd?.includes('Redistribution and use')) throw new Error('Missing protobuf BSD notice');
  await writeFile(join(output, 'LICENSE-PROTOBUF-BSD'), bsd.replace(/^\/\/ ?/gm, ''));
  await writeFile(join(output, 'NOTICE.md'), `# Experimental Pocket TTS browser runtime

This bundle contains the unmodified Pocket forward pass from [jax-js](https://github.com/ekzhang/jax-js/blob/${revision}/website/src/routes/tts/pocket-tts.ts), revision \`${revision}\`, by Eric Zhang (MIT). The local adapter follows its demo's prompt preparation and sampling defaults, requires WebGPU with explicitly selected FP16 or FP32 precision, collects PCM instead of playing it, bounds generation, and releases decoder states between passages. The adapter does not enable automatic WASM fallback.

Bundled dependencies are pinned: ${Object.entries(dependencies).filter(([name]) => name !== 'esbuild').map(([name, version]) => `\`${name}@${version}\``).join(', ')}. Jax-js, its loaders and Eric Zhang's sentencepiece-buf package use MIT. Protobuf-ES is Copyright 2021-2025 Buf Technologies, Inc., under Apache-2.0, with Google varint code under BSD-3-Clause. See the adjacent license files. Build tool: esbuild ${dependencies.esbuild} (MIT); it is not part of the runtime. Reproduce with \`node scripts/vendor-pocket.mjs\`.

The forward-pass source SHA-256 is \`${createHash('sha256').update(source).digest('hex')}\`.

Model downloads are separate and are not checked into this repository. The adapter pins [Eric Zhang's FP16 conversion](https://huggingface.co/ekzhang/jax-js-models/blob/2b0fc51b4f76ff56611741ab9267593decde7639/kyutai-pocket-tts_b6369a24-fp16.safetensors), plus [Kyutai's original Alba embedding and tokenizer](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning/tree/fbf82802feb1f92664f3bcf6a0f01295a678853c). Kyutai's Pocket TTS weights, tokenizer and voice assets are licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/); model attribution belongs to Kyutai. The Alba reference voice is [Alba MacKenna's Casual recording](https://huggingface.co/kyutai/tts-voices/blob/main/alba-mackenna/casual.wav), also [CC BY 4.0](https://huggingface.co/kyutai/tts-voices#alba-mackenna). Its audio was converted into a voice embedding by Kyutai. The conversion changes weight precision to FP16. This is the browser port's older English checkpoint, not the latest Pocket model. Upstream native inference code: [kyutai-labs/pocket-tts](https://github.com/kyutai-labs/pocket-tts).

The FP16 weights are 235,738,516 bytes (SHA-256 \`792e653ea1604197bf6bd2a76ac355f5ec41ef88961bf1dbf729d027d6e20f6c\`); Alba is 512,088 bytes; the tokenizer is 59,339 bytes. These are download sizes, not runtime memory measurements. No iPhone throughput or quality claim follows from this bundle.
`);
  // Keep package integrity values for auditing without adding a second installable project.
  const lock = JSON.parse(await readFile(join(temporary, 'package-lock.json'), 'utf8'));
  const packages = Object.fromEntries(Object.entries(lock.packages).filter(([path]) => path && !path.includes('@esbuild/'))
    .map(([path, data]) => [path.replace('node_modules/', ''), { version: data.version, integrity: data.integrity }]));
  await writeFile(join(output, 'versions.json'), JSON.stringify({ sourceRevision: revision, packages }, null, 2) + '\n');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
