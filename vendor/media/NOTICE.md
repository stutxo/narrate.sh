# Native audio encoding and fragmented MP4

`runtime.js` is a minified, tree-shaken bundle of the unmodified [Mediabunny 1.55.7](https://www.npmjs.com/package/mediabunny/v/1.55.7) module sources, by Vanilagy, under the Mozilla Public License 2.0. The complete license is in `LICENSE`. Corresponding source is available in the [exact npm source archive](https://registry.npmjs.org/mediabunny/-/mediabunny-1.55.7.tgz) and the [upstream repository](https://github.com/Vanilagy/mediabunny).

Only the audio sample encoder, fragmented MP4 output, and their dependencies are exported. This uses the browser's native WebCodecs encoder; no software codec or WASM fallback is bundled.

Rebuild with `node scripts/vendor-media.mjs`. The script verifies the pinned archive's SHA-512 checksum and bundles with esbuild 0.25.11. The served app requires no build step.
