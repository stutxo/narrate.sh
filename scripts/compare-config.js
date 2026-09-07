import { MODEL as current } from '../model-config.js?v=14';
import { MODEL as kitten } from './models/kitten-config.js?v=1';
import { MODEL as inflect } from './models/inflect-config.js?v=1';
import { MODEL as pocket, MODEL_FP32 as pocket32 } from './models/pocket-config.js?v=1';

// Metadata only. The comparison worker loads one engine at a time.
export const CANDIDATES = Object.freeze([
  { key: 'kitten', optional: true, backend: 'webgpu', ...kitten },
  { key: 'inflect', optional: true, backend: 'webgpu', ...inflect },
  { key: 'pocket', optional: true, backend: 'webgpu', ...pocket },
  { key: 'pocket-f32', optional: true, backend: 'webgpu', ...pocket32 },
  { key: 'pocket-cpu', ...current,
    caution: 'Current production CPU/WebAssembly model, about 237 MB on first use. Uses the pinned browser checkpoint and Alba voice; WebGPU is not required. Test generation on your device.',
  },
].map(Object.freeze));
