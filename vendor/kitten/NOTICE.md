# Kitten speech runtime

`runtime.js` is generated from [svenflow/kitten-tts-webgpu](https://github.com/svenflow/kitten-tts-webgpu/tree/35f31049363ea39464dc05d42c1135b5c9e3235f), revision `35f31049363ea39464dc05d42c1135b5c9e3235f` (package version 0.1.1), under Apache-2.0. See `LICENSE-APACHE-2.0` and the linked source for copyright notices.

`espeak-en-dict.tsv` and `en_rules` are upstream's unmodified eSpeak-ng pronunciation data, under GPL-3.0-or-later. See `LICENSE-GPL-3.0`; `en_rules` retains the original Jonathan Duddington and Reece H. Dunn copyright notices. Corresponding data sources: the pinned Kitten source above and [eSpeak-ng](https://github.com/espeak-ng/espeak-ng).

Local modifications use the JavaScript dictionary/rules frontend directly, remove WASM and its per-call Safari timeout, resolve pronunciation assets relative to the module, propagate asset download failures, and dispatch GPU errors in workers. Model and voice downloads are cached by their pinned URLs in the browser Cache API (`narrate-kitten-models-v1`); unavailable/full caches fall back to ordinary downloads, and browsers may evict cached assets. Loading stays sequential to limit peak mobile memory. Only the low-level engine and text tokenizer are exported. The model executes with custom WebGPU shaders; there is no CPU inference fallback.

Reproduce the bundle and assets with `node scripts/vendor-kitten.mjs` from the project root. The script downloads the pinned source and builds with esbuild 0.25.11; no npm dependencies or build step are needed to serve the app.

The CPU source-excitation stage accumulates weighted, Float32-rounded harmonics into Float64 sums instead of retaining all nine harmonics. This reduces temporary allocation by 28 bytes per waveform sample while preserving the original summation and random-number order. `scripts/kitten-excitation.mjs` applies this patch; its offline regression compares the rebuilt runtime against an unmodified Apache-2.0 source fixture. The STFT and GPU shaders are unchanged by this patch.

The app uses [KittenML/kitten-tts-micro-0.8](https://huggingface.co/KittenML/kitten-tts-micro-0.8/tree/1ccf72b2c2048fd17efac7de2fab32d10e225084), revision `1ccf72b2c2048fd17efac7de2fab32d10e225084` (approximately 44.7 MB for model and voices). The model and voices are Apache-2.0 and downloaded at runtime; model weights are not distributed in this repository.
