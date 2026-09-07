# Mobile review — 7 September 2026

Keep the current model, voice pace, native player, and simple interface. The next gains should come from measured startup scheduling and lower temporary memory use. Desktop Chromium checks establish regressions and signal correctness; they do not establish sustained iPhone Safari performance or listening quality.

## Changes from this review

- **Resume position:** the saved playhead must remain visible and authoritative while the streaming buffer is preparing. A paused recording at 35 of 40 seconds previously displayed zero during Resume; Rewind then started from zero instead of 25 seconds. The regression uses real native encoding, MediaSource and Plyr controls.
- **Model temporary memory:** accumulate rounded harmonic values directly into weighted sums instead of retaining a nine-channel Float32 matrix. This saves 28 bytes per waveform sample, or 10,752,000 bytes for 16 seconds at 24 kHz. Seeded tests compare final Float32 output bytes, random-call order and GPU weight reads with the pinned original, including the rebuilt production bundle. This measures typed-array allocation volume, not total or peak browser memory.
- **Audition quiet edges:** report leading/trailing low-level waveform duration without trimming anything. A player can advance through a generated pause while its buffer is healthy; playback timing alone cannot identify that. The prior three short “Hello world” samples had 0.24–0.37 seconds of leading quiet time at a -60 dBFS threshold. That small sample does not justify automatic trimming or generalize to long passages.

The isolated source-excitation experiment used Node 22 on a Ryzen 7950X, seeded synthetic F0, mocked GPU transfers, and nine rotated runs after warmup. At 16 seconds of mixed voiced/unvoiced output, median CPU time was 92.59 ms before and 92.23 ms after the harmonic change: no meaningful speed improvement. Typed-array allocation volume fell from 31.95 MB to 21.20 MB. A separate STFT fusion matched samples but was slightly slower here, so it was not adopted.

Validation passed: the full regression suite on Chromium 141 without isolation headers, plus a rebuilt-worker cold/warm smoke run on Chromium 152 with explicit software WebGPU. That smoke run returned 2.025 seconds of valid speech with no browser errors or PCM-limit samples. The model's numeric checks cover 84 seeded scenarios against both the patch and generated bundle, plus allocation comparisons at 2, 8 and 16 seconds. These checks do not replace listening or physical Safari measurements.

## What other implementations suggest

| Experiment | Evidence | What to measure before adopting |
| --- | --- | --- |
| Gradually increase passage sizes | [Junco's chunker](https://github.com/ahh1539/junco-reader/blob/e9a5d5551a1430dab46c94513b126d0023743f83/src/lib/chunkText.js) uses 48 → 90 → 180 → 350 character packing targets to balance startup and later throughput. These are not strict passage caps: a long following sentence can exceed an intermediate target. | Compare with our fixed 180-character passages, enforcing candidate limits during splitting. Include a short opening followed by a long sentence. Measure first playback, waits, overhead and natural joins. Smaller chunks alone do not shorten our ten-second reserve. |
| Predict the next generation time | [Inflect's browser scheduler](https://github.com/robertbak/webtts-inflect/blob/main/src/main.ts#L122) estimates generation time from observed synthesis and applies a safety margin. | Replay the same arrival traces at 1× and 1.5×, including slow first inference and later slowdowns. Use listening seconds and conservative bounds. Its [worker uses WASM](https://github.com/robertbak/webtts-inflect/blob/main/src/worker.ts); its speed results are not evidence for our WebGPU runtime. |
| Measure padding before changing joins | [Junco's playback pipeline](https://github.com/ahh1539/junco-reader/blob/main/src/lib/playbackPipeline.js) measures RMS padding and distinguishes sentence pacing from technical cuts. | Our new quiet-edge reports provide measurements. Listen to quiet consonants and sentence pauses before considering any trimming; Kokoro thresholds are not transferable to Micro without validation. |
| Let a fast phone rest between synthesis bursts | The same Junco pipeline caps generated audio ahead of playback. | Check battery, temperature and later-run throughput on a phone. This helps only if production can get ahead, and delays availability of the complete recording. Our existing decoder-window bound serves a different purpose. |

Junco's [worker](https://github.com/ahh1539/junco-reader/blob/main/src/lib/kokoroWorker.js) really selects WebGPU and FP32, but these code references provide no verified iPhone timing results.

## Architecture decisions

[Chrome's AudioWorklet design article](https://developer.chrome.com/blog/audio-worklet-design-pattern) explains worker/ring-buffer approaches and their timing constraints. A ring buffer does not create compute capacity. Our native audio pipeline already keeps model inference away from audio rendering; a worklet rewrite adds responsibilities without demonstrated benefit here.

[Apple's WebGPU guidance](https://developer.apple.com/videos/play/wwdc2025/236/) recommends reducing memory traffic and discusses half precision. A full f16 conversion would affect many kernels and numerical behavior, so it needs separate validation. The current memory change preserves the original intermediate rounding.

Use the existing [phone timings](https://narrate.sh/?diagnostics=1) and [blinded audition](https://narrate.sh/scripts/audition.html) for the next scheduling experiment. Compare a cold start, warm narration and several minutes of 1.5× listening on the same device with the page visible. Report initial wait, later native waits, generation headroom, interruptions and listening preference separately.

## Follow-up experiments and decisions

We checked the actual streaming mode in [Inflect](https://github.com/robertbak/webtts-inflect/blob/60832b1978115e4ed7fdddce4d9b9fd9161f9fe7/src/main.ts#L165), separately from its whole-recording Generate mode. It predicts whether the next passage will be ready using recent synthesis speed. Its execution provider is WASM; this is scheduling evidence, not a WebGPU performance comparison.

Our candidate waited for two timing observations, required 30% throughput headroom, and selected 4–10 listening seconds from recent timings and the next two text lengths with a safety margin. Across the synthetic cases at 1×, 1.5× and 2×, it saved up to 2.8 seconds before playback on healthy traces. An unexpected slow third inference instead added 5.5–11.75 seconds of interruption that the fixed reserve avoided. Increasing the reserve after starvation reduced interruption counts in some traces but increased total silence. Production therefore keeps its fixed reserve. `npm run benchmark:buffer` reproduces the fixed/adaptive comparison; exported phone arrivals can replace synthetic inputs. Its outputs are simulated playback, not observed speaker behavior.

We also tried [Junco's resident-worker approach](https://github.com/ahh1539/junco-reader/blob/e9a5d5551a1430dab46c94513b126d0023743f83/src/lib/kokoroWorker.js#L14). One Chromium 152 software-WebGPU pair showed 0 ms initialization for reuse versus 665 ms for a fresh worker with cached files. End-to-end times were 15.512 versus 15.323 seconds respectively: inference variation outweighed the setup saving. This single pair does not establish an overall latency gain or justify keeping mobile GPU memory resident, so workers still release after completion. The cold request and both comparison requests produced valid current-model audio through the new adapter.

The adopted scheduling change overlaps the first unfinished inference with saved-audio preload on Resume. Native regressions hold the PCM read open and verify that synthesis has already started, only one result is prepared, and Stop discards that uncommitted result while preserving the saved recording. This removes an unnecessary serial dependency without changing speech boundaries, voice, or the reserve.

Model-specific batching is a future adapter concern. [Open TTS's Supertonic implementation](https://github.com/cyanxxy/Local-TTS-studio/blob/33838a0448c58d0ce0c0798aa15f8afe5484530f/src/workers/supertonic.worker.ts#L589) can send a first passage alone and batch later passages. Our current Kitten kernels assume one sequence, so that technique is not a configuration change for this engine. A new adapter can own its batching/frontend while keeping the site's playback and saved-session contract.

The new lightweight configuration and adapter boundary make compatible future weights a configuration update. [The upgrade guide](MODEL_UPGRADES.md) states compatibility requirements, canonical audio format, cache/identity rules and validation. New architectures require their own adapter; a smaller download or newer release alone does not prove better mobile speed or voice quality.
