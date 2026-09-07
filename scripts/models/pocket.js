import { init, defaultDevice, getWebGPUDevice, numpy as np, random, tree,
  safetensors, tokenizers, fromSafetensors, createFlowLMState, createMimiDecodeState,
  runFlowLMStep, runMimiDecode } from '../../vendor/pocket/runtime.js?v=1';

async function bytes(url, expectedSize) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pocket model download failed: HTTP ${response.status}.`);
  const data = await response.arrayBuffer();
  if (expectedSize && data.byteLength !== expectedSize) throw new Error('Pocket model download has the wrong size.');
  return data;
}

// Same prompt preparation and sampling defaults as the pinned jax-js demo.
function prepare(text) {
  text = text.trim().replace(/\s+/g, ' ');
  if (!text) throw new Error('Add some text first.');
  const words = text.split(' ').length;
  text = text.replace(/^(\p{Ll})/u, letter => letter.toLocaleUpperCase());
  if (/[\p{L}\p{N}]$/u.test(text)) text += '.';
  return { text: words < 5 ? ' '.repeat(8) + text : text, framesAfterEos: words <= 4 ? 5 : 3 };
}

export async function createModel({ config, status, fail, check }) {
  status('Starting Pocket WebGPU…');
  if (!['float16', 'float32'].includes(config.dtype)) throw new Error('Choose an explicit Pocket precision.');
  if (!globalThis.navigator?.gpu || typeof Float16Array === 'undefined') {
    throw new Error('Pocket requires WebGPU and Float16Array support.');
  }
  if (!(await init('webgpu')).includes('webgpu')) throw new Error('Pocket could not start WebGPU.');
  defaultDevice('webgpu');
  const device = getWebGPUDevice();
  if (config.dtype === 'float16' && !device.features.has('shader-f16')) throw new Error('Pocket requires WebGPU shader-f16 support.');
  device.lost.then(() => fail('The Pocket GPU connection was interrupted.'));
  device.addEventListener('uncapturederror', event => fail(`Pocket WebGPU failed: ${event.error.message}`));
  check();
  status(`Loading Pocket TTS (${config.downloadMB} MB)…`);
  const base = `https://huggingface.co/${config.repository}/resolve/${config.revision}/`;
  const voiceBase = `https://huggingface.co/${config.voiceRepository}/resolve/${config.voiceRevision}/`;
  const dtype = config.dtype === 'float16' ? np.float16 : np.float32;
  const model = fromSafetensors(safetensors.parse(await bytes(base + config.weightsFile, config.weightsBytes)), dtype);
  check();
  const tokenizer = tokenizers.SentencePiece.fromBinary(new Uint8Array(await bytes(voiceBase + config.tokenizerFile, 59339)));
  const prompt = safetensors.parse(await bytes(voiceBase + config.voicesFile, 512088)).tensors.audio_prompt;
  const voice = np.array(prompt.data, { shape: prompt.shape, dtype: np.float32 }).slice(0).astype(dtype);
  check();

  return { async generate(input, rate = 1) {
    if (rate !== 1) throw new Error('The Pocket comparison supports natural 1× synthesis only.');
    check();
    const { text, framesAfterEos } = prepare(input);
    const tokens = tokenizer.encode(text);
    if (tokens.length > config.tokenLimit) throw new Error('Use a shorter comparison passage (Pocket limit: 256 tokens).');
    const textEmbeds = model.flowLM.conditionerEmbed.ref.slice(np.array(tokens, { dtype: np.uint32 }));
    const embeds = np.concatenate([voice.ref, textEmbeds]);
    let lastLatent = model.flowLM.bosEmb.ref.reshape([1, -1]);
    let flowState = createFlowLMState(model.flowLM), mimiState = createMimiDecodeState(model.mimi);
    let key = random.key(config.seed), eosStep = null, ended = false;
    const chunks = [];
    try {
      // 80 seconds is the upstream demo's limit. Never report a truncated run as successful.
      for (let step = 0; step < 1000; step++) {
        check();
        let stepKey;
        [key, stepKey] = random.split(key);
        const result = runFlowLMStep(tree.ref(model.flowLM), flowState, stepKey,
          lastLatent.ref, step === 0 ? embeds.ref : null, flowState.kvCacheLen, 1, 0.7, null);
        flowState = result.state;
        lastLatent.dispose();
        lastLatent = result.latent;
        if ((await result.isEos.data())[0] && eosStep === null) eosStep = step;
        check();
        if (eosStep !== null && step >= eosStep + framesAfterEos) { ended = true; break; }
        const latent = lastLatent.ref.mul(model.flowLM.embStd.ref).add(model.flowLM.embMean.ref);
        const [audio, nextState] = runMimiDecode(tree.ref(model.mimi), mimiState, latent);
        mimiState = nextState;
        const pcm = await np.clip(audio.slice(0), -1, 1).astype(np.float32).data();
        check();
        if (!(pcm instanceof Float32Array) || pcm.length !== 1920 || pcm.some(value => !Number.isFinite(value))) {
          throw new Error('Pocket returned invalid audio.');
        }
        chunks.push(pcm);
      }
      if (!ended) throw new Error('Pocket did not finish within 80 seconds of generated audio. Use a shorter passage.');
      const samples = new Float32Array(chunks.length * 1920);
      chunks.forEach((chunk, index) => samples.set(chunk, index * 1920));
      return { samples, sampleRate: 24000, channels: 1 };
    } finally {
      // Array operations consume their inputs. Keep only current decoder states between frames.
      // If GPU evaluation failed mid-operation, worker termination releases its remaining resources.
      try { tree.dispose([lastLatent, flowState, mimiState, key, embeds]); } catch {}
    }
  } };
}
