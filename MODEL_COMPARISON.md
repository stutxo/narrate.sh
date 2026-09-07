# Mobile voice comparison — 7 September 2026

This document records the original GPU comparison; its saved A/B/C samples and metadata remain unchanged. The main app uses Kitten Micro / Bella on WebGPU at 1×. After trying Pocket CPU, the smaller approximately 45 MB Micro download was preferred to Pocket's approximately 237 MB download, with Micro's voice judged acceptable. This is a download-size and listening decision, not evidence that Micro is the fastest model on every phone. The comparison tool defaults to `kitten`; all alternatives remain optional.

## Candidates

| Candidate | Model download | Browser path | Important limitation |
| --- | --- | --- | --- |
| Kitten Micro 0.8 / Bella | About 45 MB including voices | Existing WebGPU adapter | Original production baseline; dictionary/rules pronunciation frontend |
| Inflect Micro v2 / default male | About 38 MB, plus 26 MB runtime/frontend | ONNX Runtime Web 1.27 native WebGPU; eSpeak frontend | Upstream disables Apple mobile GPU because repeated inference can crash the page |
| Pocket TTS / Alba, browser checkpoint | About 237 MB including voice/tokenizer | jax-js WebGPU FP16 | Requires shader-f16 and Float16Array; uses the browser port's older checkpoint |

Download sizes are not peak memory measurements. Pocket's native CPU performance claims and the newest Pocket release are not measurements of this browser adapter.

An unchecked **Pocket FP32 WebGPU** variant is also available under `pocket-f32`. It uses the same FP16 weight download but computes in FP32, with greater memory use and potentially lower throughput. It is an explicit experiment for adapters without shader-f16; neither Pocket variant silently falls back to another backend or precision. Our available Chromium 152 SwiftShader adapter exposes WebGPU but lacks shader-f16, so the FP16 Pocket variant correctly rejected it before downloading weights.

Pins and source attribution:

- Kitten: [official Micro weights](https://huggingface.co/KittenML/kitten-tts-micro-0.8/tree/1ccf72b2c2048fd17efac7de2fab32d10e225084); historical configuration in `scripts/models/kitten-config.js`.
- Inflect: [official ONNX graphs](https://huggingface.co/owensong/Inflect-Micro-v2-ONNX/tree/91b1ab6432323064ec0e8e9704d92fcecd24855f), [browser frontend and Apple mobile caveat](https://github.com/geronimi73/inflect-tts/tree/aa51b786f947635cfa1ebdea3ea160e4bca7136f); metadata in `scripts/models/inflect-config.js`.
- Pocket: [pinned browser forward pass](https://github.com/ekzhang/jax-js/blob/970fa22d934ce2e617cd3a993c6ecc8b736496f2/website/src/routes/tts/pocket-tts.ts), [FP16 b6369a24 conversion](https://huggingface.co/ekzhang/jax-js-models/blob/2b0fc51b4f76ff56611741ab9267593decde7639/kyutai-pocket-tts_b6369a24-fp16.safetensors), [Alba and tokenizer](https://huggingface.co/kyutai/pocket-tts-without-voice-cloning/tree/fbf82802feb1f92664f3bcf6a0f01295a678853c); metadata in `scripts/models/pocket-config.js`.

## Reproduce and listen

[Listen to the saved three-model samples](https://narrate.sh/experiments/model-comparison-2026-09-07/review.html) without downloading any models. These are actual WebGPU recordings of the same prose, numbers and question passages at 1×, with Micro, Inflect and the explicit Pocket FP32 variant. The page starts with blinded labels; Reveal shows the pinned identities and measurements. The adjacent JSON report and source reports preserve the raw evidence.

Open [the experimental comparison page](https://narrate.sh/scripts/compare-models.html) on the target device, or run:

```sh
NARRATE_TEST_ISOLATION=0 npm run compare:models -- --corpus standard --repeats 1 --seed 42 --out /tmp/narrate-models
```

Use `--models kitten,inflect` to select candidates, `--corpus smoke` for “Hello world”, or `--text "Your passage."` for up to 500 characters. Explicit `--software-gpu` enables Chromium SwiftShader for correctness checks only.

The page uses one worker per model, sequentially, and releases it before loading another engine. Each model gets an excluded “Hello world” warmup, then the same prose, numbers and question passages. New input shapes can still trigger compilation during measured calls. Results include initialization, generation and total worker time, signal checks, model identity, visibility changes, and failures. Models run in separate groups to bound memory; thermal changes and execution order can bias timings. Repeat with another seed and test sustained narration on the phone before choosing a production model.

Synthesis and listening both use 1×. A/B/C labels remain hidden until Reveal; WAV files also play naturally at 1×. The CLI saves a report and listening page even when a candidate fails. Stop releases the worker and retains completed recordings. No test text or audio is uploaded by either tool.

Listen for complete words and numbers, contextual pronunciation, plausible pauses, distortion, and comfort over several minutes. Finite nonzero PCM, waveform statistics and native playback checks cannot establish naturalness or prove that speech reached an iPhone speaker. These experiments do not replace listening or physical Safari testing.

## Inflect execution placement

Strictly disabling every CPU execution-provider operation prevented the official graphs from initializing. An initialization-only ORT placement inspection with Chromium 152 / SwiftShader showed:

- Duration graph: 232 WebGPU nodes, including all 22 Conv, 14 MatMul, 3 Softmax and 8 LayerNormalization nodes; 248 CPU nodes for shape, indexing and mask operations.
- Decoder graph: 484 WebGPU nodes, including all 114 Conv and 4 ConvTranspose nodes; 48 CPU nodes, comprising 24 ConstantOfShape and 24 Gather operations.

The experimental adapter therefore requests the WebGPU execution provider with ordinary CPU bookkeeping, and never retries failed GPU inference using a WASM-only provider. This is separate from the eSpeak frontend's CPU/WASM phonemization. Placement evidence applies to the pinned graphs and runtime on this test adapter; it does not establish iPhone stability.

## Completed recordings

All three models completed the same three passages through the real comparison worker at natural 1× synthesis. The nine untrimmed WAVs have finite, nonzero 24 kHz mono PCM and no samples at the PCM limits. Native playback and signal checks do not establish which voice sounds best.

| Recorded duration at 1× | Prose | Numbers | Questions |
| --- | ---: | ---: | ---: |
| Kitten Micro / Bella | 8.30 s | 12.30 s | 8.43 s |
| Inflect Micro v2 | 4.00 s | 7.70 s | 3.91 s |
| Pocket browser checkpoint / Alba, FP32 | 4.88 s | 6.48 s | 3.28 s |

The model/voice pairs produce different speaking rates and pauses at their default settings. Compare the recordings before deciding which is comfortable at 1×. Full generation timings and warmup records are in the downloadable reports, explicitly marked as Chromium 152 **software WebGPU** results. They are not iPhone performance evidence. Pocket FP16 was not tested successfully on this adapter; the FP32 variant was selected explicitly.

To generate the same candidate/precision choices in one CLI run:

```sh
NARRATE_TEST_ISOLATION=0 npm run compare:models -- --models kitten,inflect,pocket-f32 --corpus standard --repeats 1 --seed 42 --software-gpu --out /tmp/narrate-models
```

The published samples were collected in three separate, sequential browser runs and assembled without changing their PCM. Each source report is retained beside the combined report. A fresh run can have different initialization or compilation costs; exact cross-runtime waveform parity is not claimed.

Pocket CPU remains available as an optional comparison candidate. Its real CPU smoke test passed with WebGPU inaccessible and without cross-origin isolation: the first “Hello world” generated 0.96 seconds of nonzero audio in 3.85 seconds after cold initialization, and a cached fresh worker initialized in 0.65 seconds. These desktop measurements do not promise realtime performance on iPhone. Test sustained narration, initial Play, buffer recovery, Stop/Resume and completed-track playback on the physical phone. The approximately 237 MB initial download and greater FP32 memory use remain relevant.
