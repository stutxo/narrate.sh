# Experimental Inflect dependencies

Reproduce with `node scripts/vendor-inflect.mjs`. The generator checks npm tarball SHA-512 integrity; it runs no package install scripts. Model weights are fetched separately by the adapter and are not included here.

- Inflect browser frontend and DSP helpers: [geronimi73/inflect-tts](https://github.com/geronimi73/inflect-tts/tree/aa51b786f947635cfa1ebdea3ea160e4bca7136f), revision `aa51b786f947635cfa1ebdea3ea160e4bca7136f`, Apache-2.0 (LICENSE-INFLECT). The bundle includes normalization, complete phoneme segments with punctuation, seeded noise, chunking and edge fades. It does not include the upstream worker or its CPU fallback.
- ONNX Runtime Web 1.27.0: native WebGPU build, MIT (LICENSE-ORT; ORT-ThirdPartyNotices.txt). Its WASM binary hosts the native GPU execution provider. The adapter requests only WebGPU and never retries a failed session using the WASM execution provider. ORT still schedules shape/mask bookkeeping on CPU; this is distinct from the CPU eSpeak text frontend.
- phonemizer 1.2.1: [xenova/phonemizer.js](https://github.com/xenova/phonemizer.js), Apache-2.0 wrapper (LICENSE-PHONEMIZER); bundled eSpeak-ng code/data are GPL-3.0 (LICENSE-ESPEAK-GPL-3.0). Source/build instructions: https://github.com/xenova/phonemizer.js and https://github.com/espeak-ng/espeak-ng.
- n2words 5.1.2: [forzagreen/n2words](https://github.com/forzagreen/n2words), MIT (LICENSE-N2WORDS), English-only imports.
- Build tool: esbuild 0.25.11, MIT; not shipped to browsers.

The official [owensong/Inflect-Micro-v2-ONNX](https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/tree/91b1ab6432323064ec0e8e9704d92fcecd24855f) graphs are pinned at `91b1ab6432323064ec0e8e9704d92fcecd24855f`, Apache-2.0. They are FP32 duration/decode exports, 24 kHz mono, with a single trained male voice. Conversion credit: Robert Bak / webtts-inflect; see the model's THIRD_PARTY_NOTICES.md and onnx/SOURCE.json. The adapter follows those graph inputs; browser noise uses the pinned frontend's deterministic seed, not NumPy's RNG, so cross-runtime waveform parity is not claimed.

Placement audit on 7 September 2026: pinned official graphs with ORT 1.27.0, Chromium 152 SwiftShader, no isolation headers. Duration: 232 WebGPU nodes including all 22 Conv, 14 MatMul, 3 Softmax and 8 LayerNormalization; 248 CPU nodes for shape/index/mask arithmetic. Decode: 484 WebGPU nodes including all 114 Conv, 4 ConvTranspose and all Tanh/Sigmoid/LeakyRelu; 48 CPU nodes exclusively ConstantOfShape and Gather. Both sessions initialized. Globally disabling CPU assignment rejects the duration graph's required bookkeeping. These are graph-placement checks, not speech quality or phone performance results.

Known upstream limitation: the geronimi browser worker disables native WebGPU by default on Apple mobile because repeated inference can terminate the WebContent process. This experiment must not be presented as a validated iPhone replacement.
