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
| Gradually increase passage sizes | [Junco's chunker](https://github.com/ahh1539/junco-reader/blob/main/src/lib/chunkText.js) uses 48 → 90 → 180 → 350 characters to avoid a short opening being exhausted while a much larger second passage generates. | Compare with our fixed 180-character passages. Measure first playback, total waits, overhead, word completeness and natural sentence joins. Smaller chunks alone do not shorten our ten-second buffer requirement. |
| Predict the next generation time | [Inflect's browser scheduler](https://github.com/robertbak/webtts-inflect/blob/main/src/main.ts#L122) estimates generation time from observed synthesis and applies a safety margin. | Replay the same arrival traces at 1× and 1.5×, including slow first inference and later slowdowns. Use listening seconds and conservative bounds. Its [worker uses WASM](https://github.com/robertbak/webtts-inflect/blob/main/src/worker.ts); its speed results are not evidence for our WebGPU runtime. |
| Measure padding before changing joins | [Junco's playback pipeline](https://github.com/ahh1539/junco-reader/blob/main/src/lib/playbackPipeline.js) measures RMS padding and distinguishes sentence pacing from technical cuts. | Our new quiet-edge reports provide measurements. Listen to quiet consonants and sentence pauses before considering any trimming; Kokoro thresholds are not transferable to Micro without validation. |
| Let a fast phone rest between synthesis bursts | The same Junco pipeline caps generated audio ahead of playback. | Check battery, temperature and later-run throughput on a phone. This helps only if production can get ahead, and delays availability of the complete recording. Our existing decoder-window bound serves a different purpose. |

Junco's [worker](https://github.com/ahh1539/junco-reader/blob/main/src/lib/kokoroWorker.js) really selects WebGPU and FP32, but these code references provide no verified iPhone timing results.

## Architecture decisions

[Chrome's AudioWorklet design article](https://developer.chrome.com/blog/audio-worklet-design-pattern) explains worker/ring-buffer approaches and their timing constraints. A ring buffer does not create compute capacity. Our native audio pipeline already keeps model inference away from audio rendering; a worklet rewrite adds responsibilities without demonstrated benefit here.

[Apple's WebGPU guidance](https://developer.apple.com/videos/play/wwdc2025/236/) recommends reducing memory traffic and discusses half precision. A full f16 conversion would affect many kernels and numerical behavior, so it needs separate validation. The current memory change preserves the original intermediate rounding.

Use the existing [phone timings](https://narrate.sh/?diagnostics=1) and [blinded audition](https://narrate.sh/scripts/audition.html) for the next scheduling experiment. Compare a cold start, warm narration and several minutes of 1.5× listening on the same device with the page visible. Report initial wait, later native waits, generation headroom, interruptions and listening preference separately.
