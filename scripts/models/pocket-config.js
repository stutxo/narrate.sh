// Experimental browser-port checkpoint; metadata only, no model download here.
const model = {
  name: 'Pocket TTS (FP16 browser checkpoint)',
  adapter: './scripts/models/pocket.js?v=1',
  repository: 'ekzhang/jax-js-models',
  revision: '2b0fc51b4f76ff56611741ab9267593decde7639',
  weightsFile: 'kyutai-pocket-tts_b6369a24-fp16.safetensors',
  weightsBytes: 235738516,
  weightsSha256: '792e653ea1604197bf6bd2a76ac355f5ec41ef88961bf1dbf729d027d6e20f6c',
  voiceRepository: 'kyutai/pocket-tts-without-voice-cloning',
  voiceRevision: 'fbf82802feb1f92664f3bcf6a0f01295a678853c',
  voicesFile: 'embeddings/alba.safetensors',
  tokenizerFile: 'tokenizer.model',
  voice: 'alba',
  sourceRevision: '970fa22d934ce2e617cd3a993c6ecc8b736496f2',
  tokenLimit: 256,
  downloadMB: 237,
  synthesisRates: Object.freeze([1]),
  defaultRate: 1,
  dtype: 'float16',
  seed: 42,
  caution: 'Experimental older browser checkpoint, about 237 MB. Requires WebGPU shader-f16 and Float16Array; no WASM fallback. Not the latest Pocket model or an iPhone benchmark.',
};
function configuration(model) { return Object.freeze({ ...model,
  id: [model.adapter, model.repository, model.revision, model.weightsFile,
    model.voiceRepository, model.voiceRevision, model.voicesFile, model.tokenizerFile,
    model.sourceRevision, model.voice, model.defaultRate, model.dtype, model.seed].join('|'),
}); }
export const MODEL = configuration(model);
export const MODEL_FP32 = configuration({ ...model, name: 'Pocket TTS (FP32 experiment)', dtype: 'float32',
  caution: 'Explicit WebGPU FP32 experiment using the same older browser checkpoint, about 237 MB to download. Uses more GPU memory and may be slower than FP16. Requires Float16Array to load its weights. No WASM fallback; not an iPhone benchmark.',
});
