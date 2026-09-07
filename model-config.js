// Metadata only. The CPU runtime loads lazily inside the speech worker.
export { MODEL } from './models/pocket-config.js?v=1';

// Fixed player/worker contract. A different native model format needs conversion
// inside its adapter; changing these values does not reconfigure the player.
export const AUDIO = Object.freeze({ sampleRate: 24000, channels: 1 });
