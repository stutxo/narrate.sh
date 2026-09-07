import { init, defaultDevice, numpy as np, random, tree, safetensors, tokenizers,
  fromSafetensors, createFlowLMState, createMimiDecodeState, runFlowLMStep,
  runMimiDecode } from '../vendor/pocket/runtime.js?v=2';

async function bytes(url, expectedSize) {
  let cache;
  try {
    cache = await globalThis.caches?.open('narrate-pocket-v1');
    const saved = await cache?.match(url);
    if (saved) {
      const data = await saved.arrayBuffer();
      if (data.byteLength === expectedSize) return data;
      await cache.delete(url);
    }
  } catch {} // Private browsing, eviction, or storage restrictions must not prevent speech.
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Pocket model download failed: HTTP ${response.status}.`);
  const data = await response.arrayBuffer();
  if (data.byteLength !== expectedSize) throw new Error('Pocket model download has the wrong size. Try again.');
  try { await cache?.put(url, new Response(data)); } catch {}
  return data;
}

// The pinned demo's prompt preparation, EOS tail and deterministic sampling.
function prepare(text) {
  text = text.trim().replace(/\s+/g, ' ');
  if (!text) throw new Error('Add some text first.');
  const words = text.split(' ').length;
  text = text.replace(/^(\p{Ll})/u, letter => letter.toLocaleUpperCase());
  if (/[\p{L}\p{N}]$/u.test(text)) text += '.';
  return { text: words < 5 ? ' '.repeat(8) + text : text, framesAfterEos: words <= 4 ? 5 : 3 };
}

export async function createModel({ config, status, check }) {
  status('Starting Pocket TTS on the CPU…');
  if (config.backend !== 'wasm' || config.dtype !== 'float32') throw new Error('Pocket requires the CPU model configuration.');
  if (typeof WebAssembly === 'undefined' || typeof Float16Array === 'undefined') {
    throw new Error('Pocket requires WebAssembly and Float16Array. Update your browser to use it.');
  }
  if (!(await init('wasm')).includes('wasm')) throw new Error('Pocket could not start WebAssembly.');
  defaultDevice('wasm');
  check();
  status(`Loading Pocket TTS (${config.downloadMB} MB, cached after download)…`);
  const base = `https://huggingface.co/${config.repository}/resolve/${config.revision}/`;
  const voiceBase = `https://huggingface.co/${config.voiceRepository}/resolve/${config.voiceRevision}/`;
  const model = fromSafetensors(safetensors.parse(await bytes(base + config.weightsFile, config.weightsBytes)), np.float32);
  check();
  const tokenizer = tokenizers.SentencePiece.fromBinary(new Uint8Array(await bytes(voiceBase + config.tokenizerFile, 59339)));
  const prompt = safetensors.parse(await bytes(voiceBase + config.voicesFile, 512088)).tensors.audio_prompt;
  const voice = np.array(prompt.data, { shape: prompt.shape, dtype: np.float32 }).slice(0);
  check();

  async function generatePassage(input) {
    check();
    const { text, framesAfterEos } = prepare(input);
    // Avoid asking the language model to invent speech for a punctuation-only fragment.
    if (!/[\p{L}\p{N}]/u.test(text)) return new Float32Array(2400);
    const tokens = tokenizer.encode(text);
    if (tokens.length > config.tokenLimit) {
      // Token density differs from word count. Split oversized passages without dropping text.
      const characters = Array.from(input.trim()), middle = Math.floor(characters.length / 2);
      if (!middle) throw new Error('Pocket could not tokenize this text.');
      const prefix = characters.slice(0, middle).join('');
      const split = prefix.lastIndexOf(' ') > 0 ? prefix.lastIndexOf(' ') : prefix.length;
      const left = await generatePassage(input.trim().slice(0, split));
      const right = await generatePassage(input.trim().slice(split));
      const samples = new Float32Array(left.length + right.length);
      samples.set(left); samples.set(right, left.length);
      return samples;
    }
    if (!tokens.length) throw new Error('Pocket could not tokenize this text.');
    const textEmbeds = model.flowLM.conditionerEmbed.ref.slice(np.array(tokens, { dtype: np.uint32 }));
    const embeds = np.concatenate([voice.ref, textEmbeds]);
    let lastLatent = model.flowLM.bosEmb.ref.reshape([1, -1]);
    let flowState = createFlowLMState(model.flowLM), mimiState = createMimiDecodeState(model.mimi);
    let key = random.key(config.seed), eosStep = null, ended = false;
    const chunks = [];
    try {
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
      if (!ended) throw new Error('Pocket did not finish this passage. Try a shorter passage.');
      const samples = new Float32Array(chunks.length * 1920);
      chunks.forEach((chunk, index) => samples.set(chunk, index * 1920));
      return samples;
    } finally {
      // Array operations consume their inputs; only current decoder states survive each frame.
      try { tree.dispose([lastLatent, flowState, mimiState, key, embeds]); } catch {}
    }
  }
  return { async generate(text, rate = 1) {
    if (rate !== 1) throw new Error('Pocket supports natural 1× synthesis only.');
    return { samples: await generatePassage(text), sampleRate: 24000, channels: 1 };
  } };
}
