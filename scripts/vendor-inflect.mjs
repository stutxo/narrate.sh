// Rebuild the experimental Inflect frontend and WebGPU runtime; no model weights.
// Node 22+, tar and network access required. Dependencies stay in a temporary folder.
import { mkdtemp, mkdir, writeFile, readFile, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const revision = 'aa51b786f947635cfa1ebdea3ea160e4bca7136f';
const packages = [
  ['onnxruntime-web', '1.27.0', 'ogDLsqIozHZwifPuN37OproAo0byX6t43/bP8GzeZWBWD6MOGExswFAx3up4NS/vvWBOg2u2PXomDt3rMmdQSg=='],
  ['phonemizer', '1.2.1', 'v0KJ4mi2T4Q7eJQ0W15Xd4G9k4kICSXE8bpDeJ8jisL4RyJhNWsweKTOi88QXFc4r4LZlz5jVL5lCHhkpdT71A=='],
  ['n2words', '5.1.2', 'tU8LNPzxnoXZxijegTMMM9Wf3VZE/Us3Tcux/wWmfc74xiWL6UwPyd0de0Hl+H/5xfkuisCcyi9KtARcMTDpFg=='],
];
const output = fileURLToPath(new URL('../vendor/inflect/', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'narrate-inflect-build-'));
async function download(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}: ${url}`);
  return new Uint8Array(await response.arrayBuffer());
}
try {
  await mkdir(output, { recursive: true });
  for (const [name, version, integrity] of packages) {
    const bytes = await download(`https://registry.npmjs.org/${name}/-/${name}-${version}.tgz`);
    if (createHash('sha512').update(bytes).digest('base64') !== integrity) throw new Error(`${name} integrity mismatch`);
    const directory = join(temporary, 'node_modules', name);
    await mkdir(directory, { recursive: true });
    await writeFile(join(temporary, 'package.tgz'), bytes);
    execFileSync('tar', ['xzf', join(temporary, 'package.tgz'), '-C', directory, '--strip-components=1']);
  }
  const source = `https://raw.githubusercontent.com/geronimi73/inflect-tts/${revision}/`;
  for (const file of ['inflect.text.js', 'inflect.utils.js', 'inflect.polyfills.js']) {
    await writeFile(join(temporary, file), await download(source + 'frontend/src/' + file));
  }
  await writeFile(join(temporary, 'frontend.js'), `export { textToPhonemes, cleanedTextToSequence } from './inflect.text.js';
export { randnFloat32Array, splitText, boundaryPauseSeconds, edgeFade } from './inflect.utils.js';\n`);
  execFileSync('npx', ['--yes', '--package=esbuild@0.25.11', 'esbuild', join(temporary, 'frontend.js'),
    '--bundle', '--format=esm', '--target=es2022', '--minify', '--log-level=warning',
    '--banner:js=/*! Inflect frontend: pinned upstream sources and licenses in NOTICE.md */',
    `--outfile=${join(output, 'frontend.js')}`], {
    stdio: 'inherit', env: { ...process.env, npm_config_cache: join(tmpdir(), 'narrate-npm-cache') },
  });
  const ort = join(temporary, 'node_modules', 'onnxruntime-web');
  for (const file of ['ort.webgpu.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm']) {
    await copyFile(join(ort, 'dist', file), join(output, file));
  }
  await writeFile(join(output, 'LICENSE-ORT'), await download('https://raw.githubusercontent.com/microsoft/onnxruntime/v1.27.0/LICENSE'));
  await writeFile(join(output, 'ORT-ThirdPartyNotices.txt'), await download('https://raw.githubusercontent.com/microsoft/onnxruntime/v1.27.0/ThirdPartyNotices.txt'));
  await copyFile(join(temporary, 'node_modules/phonemizer/LICENSE'), join(output, 'LICENSE-PHONEMIZER'));
  await copyFile(join(temporary, 'node_modules/n2words/LICENSE'), join(output, 'LICENSE-N2WORDS'));
  await writeFile(join(output, 'LICENSE-INFLECT'), await download(source + 'LICENSE'));
  const official = 'https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/raw/91b1ab6432323064ec0e8e9704d92fcecd24855f/';
  for (const [file, target] of [['LICENSE', 'LICENSE-MODEL'], ['THIRD_PARTY_NOTICES.md', 'MODEL-THIRD-PARTY-NOTICES.md'], ['runtime/text/LICENSE', 'LICENSE-TEXT'], ['onnx/SOURCE.json', 'MODEL-SOURCE.json']]) {
    await writeFile(join(output, target), await download(official + file));
  }
  await copyFile(fileURLToPath(new URL('../vendor/kitten/LICENSE-GPL-3.0', import.meta.url)), join(output, 'LICENSE-ESPEAK-GPL-3.0'));
  await writeFile(join(output, 'NOTICE.md'), `# Experimental Inflect dependencies

Reproduce with \`node scripts/vendor-inflect.mjs\`. The generator checks npm tarball SHA-512 integrity; it runs no package install scripts. Model weights are fetched separately by the adapter and are not included here.

- Inflect browser frontend and DSP helpers: [geronimi73/inflect-tts](https://github.com/geronimi73/inflect-tts/tree/${revision}), revision \`${revision}\`, Apache-2.0 (LICENSE-INFLECT). The bundle includes normalization, complete phoneme segments with punctuation, seeded noise, chunking and edge fades. It does not include the upstream worker or its CPU fallback.
- ONNX Runtime Web 1.27.0: native WebGPU build, MIT (LICENSE-ORT; ORT-ThirdPartyNotices.txt). Its WASM binary hosts the native GPU execution provider. The adapter requests only WebGPU and never retries a failed session using the WASM execution provider. ORT still schedules shape/mask bookkeeping on CPU; this is distinct from the CPU eSpeak text frontend.
- phonemizer 1.2.1: [xenova/phonemizer.js](https://github.com/xenova/phonemizer.js), Apache-2.0 wrapper (LICENSE-PHONEMIZER); bundled eSpeak-ng code/data are GPL-3.0 (LICENSE-ESPEAK-GPL-3.0). Source/build instructions: https://github.com/xenova/phonemizer.js and https://github.com/espeak-ng/espeak-ng.
- n2words 5.1.2: [forzagreen/n2words](https://github.com/forzagreen/n2words), MIT (LICENSE-N2WORDS), English-only imports.
- Build tool: esbuild 0.25.11, MIT; not shipped to browsers.

The official [owensong/Inflect-Micro-v2-ONNX](https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/tree/91b1ab6432323064ec0e8e9704d92fcecd24855f) graphs are pinned at \`91b1ab6432323064ec0e8e9704d92fcecd24855f\`, Apache-2.0. They are FP32 duration/decode exports, 24 kHz mono, with a single trained male voice. Conversion credit: Robert Bak / webtts-inflect; see the model's THIRD_PARTY_NOTICES.md and onnx/SOURCE.json. The adapter follows those graph inputs; browser noise uses the pinned frontend's deterministic seed, not NumPy's RNG, so cross-runtime waveform parity is not claimed.

Placement audit on 7 September 2026: pinned official graphs with ORT 1.27.0, Chromium 152 SwiftShader, no isolation headers. Duration: 232 WebGPU nodes including all 22 Conv, 14 MatMul, 3 Softmax and 8 LayerNormalization; 248 CPU nodes for shape/index/mask arithmetic. Decode: 484 WebGPU nodes including all 114 Conv, 4 ConvTranspose and all Tanh/Sigmoid/LeakyRelu; 48 CPU nodes exclusively ConstantOfShape and Gather. Both sessions initialized. Globally disabling CPU assignment rejects the duration graph's required bookkeeping. These are graph-placement checks, not speech quality or phone performance results.

Known upstream limitation: the geronimi browser worker disables native WebGPU by default on Apple mobile because repeated inference can terminate the WebContent process. This experiment must not be presented as a validated iPhone replacement.
`);
  const sizes = await Promise.all(['frontend.js', 'ort.webgpu.min.mjs', 'ort-wasm-simd-threaded.asyncify.mjs', 'ort-wasm-simd-threaded.asyncify.wasm'].map(async file => [file, (await readFile(join(output, file))).length]));
  console.log(JSON.stringify(Object.fromEntries(sizes), null, 2));
} finally {
  await rm(temporary, { recursive: true, force: true });
}
