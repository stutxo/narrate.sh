// Metadata only: safe for the main UI to import without loading the model.
const model = {
  name: 'Kitten Micro',
  adapter: './models/kitten.js?v=1',
  repository: 'KittenML/kitten-tts-micro-0.8',
  revision: '1ccf72b2c2048fd17efac7de2fab32d10e225084',
  weightsFile: 'kitten_tts_micro_v0_8.onnx',
  voicesFile: 'voices.npz',
  voice: 'Bella',
  tokenLimit: 510,
  downloadMB: 45,
  synthesisRates: Object.freeze([1]),
  defaultRate: 1,
  backend: 'webgpu',
};
export const MODEL = Object.freeze({ ...model,
  // Adapter compatibility version changes with runtime/frontend behavior,
  // independently of ordinary UI deployment/cache versions.
  id: [model.adapter, model.repository, model.revision, model.weightsFile, model.voicesFile,
    model.voice, model.tokenLimit, model.defaultRate].join('|'),
});

// Fixed player/worker contract. A different native model format needs conversion
// inside its adapter; changing these values does not reconfigure the player.
export const AUDIO = Object.freeze({ sampleRate: 24000, channels: 1 });
