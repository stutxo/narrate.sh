import { MODEL as kitten } from '../model-config.js?v=13';
import { MODEL as inflect } from './models/inflect-config.js?v=1';
import { MODEL as pocket, MODEL_FP32 as pocket32 } from './models/pocket-config.js?v=1';

// Metadata only. The comparison worker loads one engine at a time.
export const CANDIDATES = Object.freeze([
  { key: 'kitten', ...kitten },
  { key: 'inflect', ...inflect },
  { key: 'pocket', ...pocket },
  { key: 'pocket-f32', optional: true, ...pocket32 },
].map(Object.freeze));
