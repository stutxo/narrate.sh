import * as ort from '../../vendor/inflect/ort.webgpu.min.mjs';
import { textToPhonemes, cleanedTextToSequence, randnFloat32Array, splitText, boundaryPauseSeconds, edgeFade } from '../../vendor/inflect/frontend.js';

async function modelBytes(url) {
  let cache;
  try {
    cache = await globalThis.caches?.open('narrate-inflect-models-v1');
    const cached = await cache?.match(url);
    if (cached) return await cached.arrayBuffer();
  } catch {}
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Inflect download failed: HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  try { await cache?.put(url, new Response(bytes)); } catch {}
  return bytes;
}

export async function createModel({ config, status, fail, check }) {
  status('Checking experimental Inflect WebGPU support…');
  if (!globalThis.navigator?.gpu || !await navigator.gpu.requestAdapter()) {
    throw new Error('Inflect requires a working WebGPU adapter. CPU-only inference is disabled.');
  }
  check();
  // ORT's native GPU provider is hosted in WASM. The pinned graphs place neural
  // layers on WebGPU and shape/mask bookkeeping on CPU (see NOTICE.md).
  // One thread also works on static hosts without isolation headers.
  ort.env.logLevel = 'error'; // ORT otherwise emits the audited shape-placement warnings via console.error.
  ort.env.wasm.numThreads = 1;
  ort.env.wasm.proxy = false;
  ort.env.wasm.wasmPaths = new URL('../../vendor/inflect/', import.meta.url).href;
  const options = { executionProviders: ['webgpu'] };
  const base = `https://huggingface.co/${config.repository}/resolve/${config.revision}/`;
  const sessions = [];
  try {
    // The native provider requires sequential session creation.
    for (const [index, file] of config.weightsFiles.entries()) {
      status(`Loading ${config.name} ${index ? 'decoder' : 'duration model'} (${config.downloadMB} MB total)…`);
      const bytes = await modelBytes(base + file);
      check();
      sessions.push(await ort.InferenceSession.create(bytes, options));
      check();
    }
  } catch (error) {
    for (const session of sessions) await session.release().catch(() => {});
    // Never retry a failed WebGPU session with the WASM execution provider.
    throw new Error(`Inflect could not initialize WebGPU inference. ${error.message}`);
  }
  const device = ort.env.webgpu.device;
  device?.lost.then(() => fail('Inflect lost its GPU connection. Restart the comparison.'));
  device?.addEventListener('uncapturederror', event => fail(`Inflect WebGPU error: ${event.error.message}`));

  async function generateChunk(text, rate, seed) {
    const ids = cleanedTextToSequence(await textToPhonemes(text));
    check();
    if (!ids.length) throw new Error('Inflect found no speakable tokens.');
    const blanks = new BigInt64Array(ids.length * 2 + 1);
    ids.forEach((id, index) => { blanks[index * 2 + 1] = BigInt(id); });
    const inputs = {
      tokens: new ort.Tensor('int64', blanks, [1, blanks.length]),
      lengths: new ort.Tensor('int64', BigInt64Array.of(BigInt(blanks.length)), [1]),
      length_scale: new ort.Tensor('float32', Float32Array.of(1 / rate), []),
    };
    let duration, noise, variation, decoded;
    try {
      duration = await sessions[0].run(inputs);
      check();
      const { m_p_exp, logs_p_exp, y_mask } = duration;
      noise = new ort.Tensor('float32', randnFloat32Array(seed, m_p_exp.data.length), m_p_exp.dims);
      variation = new ort.Tensor('float32', Float32Array.of(config.variation), []);
      decoded = await sessions[1].run({ m_p_exp, logs_p_exp, y_mask, zp_noise: noise, noise_scale: variation });
      check();
      return edgeFade(Float32Array.from(decoded.waveform.data), 24000);
    } finally {
      for (const tensor of [...Object.values(inputs), ...Object.values(duration || {}), noise, variation, ...Object.values(decoded || {})]) tensor?.dispose();
    }
  }
  return { async generate(text, rate = config.defaultRate) {
    if (!config.synthesisRates.includes(rate)) throw new Error('Unsupported Inflect synthesis rate.');
    const chunks = splitText(text);
    if (!chunks.length) throw new Error('Enter some text for Inflect.');
    const pieces = [];
    for (const [index, chunk] of chunks.entries()) {
      check();
      if (index) pieces.push(new Float32Array(Math.round(24000 * boundaryPauseSeconds(chunks[index - 1]))));
      pieces.push(await generateChunk(chunk, rate, config.seed + index));
    }
    const samples = new Float32Array(pieces.reduce((length, piece) => length + piece.length, 0));
    let offset = 0;
    for (const piece of pieces) { samples.set(piece, offset); offset += piece.length; }
    return { samples, sampleRate: 24000, channels: 1 };
  } };
}
