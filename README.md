# narrate.sh

Use it at [narrate.sh](https://narrate.sh/).

A small, static text reader: Kitten Micro on WebGPU, a Plyr audio player, and one saved session. English only. Text is generated in short passages without a fixed word cap; longer narrations take more time and browser storage. There is no WASM inference fallback, history list, or download/export feature.

Serve this directory over HTTPS (or localhost). No build step is required. Keep the JavaScript files, `models/`, and `vendor/` beside `index.html`. GitHub Pages hosts the app; no custom isolation headers or shared-memory support are required. Bump the matching application import queries when releasing changed modules; model downloads keep their separate persistent cache. The adapter compatibility query is separate and changes only with generation behavior.

- `app.js` splits text into short passages and stores each completed PCM16 audio chunk with its checkpoint in IndexedDB. It starts the next inference while saving and encoding the current passage, keeping at most one passage ahead. Resume also starts its first unfinished inference while saved audio is reloaded; the result stays uncommitted until preload completes. One native audio element and Plyr provide play/pause, speed, and a growing seekable timeline.
- `model-config.js` selects the pinned model, voice and adapter, and supplies the UI labels. Compatible weights need a configuration update. Different architectures need a small adapter implementing the same mono 24 kHz output contract; see [Updating the speech model](MODEL_UPGRADES.md).
- `speech-worker.js` lazily loads the configured adapter, validates its waveform, and transfers PCM16 off the main thread. `models/kitten.js` owns Micro's loading, frontend and context splitting. Model and voice downloads total approximately 45 MB and are cached when browser storage permits. Worker timings report initialization, generation, and total elapsed durations. Production synthesis remains at speed 1; the audition tool takes supported comparison rates from the same configuration.
- `player-controls.js` connects the same native audio element to locally hosted Plyr controls and Media Session play/pause/seek actions. The mobile player stays visible near the bottom while scrolling, with a 10-second rewind and large touch controls. Narration text becomes read-only and remains selectable.
- `streaming-player.js` uses native audio encoding and fragmented MP4 to feed ManagedMediaSource on Safari or MediaSource elsewhere. It prefers AAC-LC, with Opus where supported. The encoder uses the exact codec profile checked for support and advertised to the player. A continuous encoder preserves chunk boundaries without repeatedly restarting audio playback. The media buffer covers a limited window around the playhead; compressed fragments allow seeking back through generated audio.
- `vendor/kitten/` contains the adapted WebGPU runtime, pronunciation data, and notices. `vendor/media/` contains only the Mediabunny components needed for audio encoding and MP4 packaging. Rebuild them with `node scripts/vendor-kitten.mjs` and `node scripts/vendor-media.mjs` (Node 22+, tar, and network access required).

New sessions default to 1.5× playback speed; the player can change it at any time. Playback builds roughly ten seconds of listening time in reserve before starting, adjusted for the selected speed, and rebuilds that reserve if it runs out. Generation and encoding continue during this wait. Completion, Stop, and explicit seeking release the wait so short or partial tracks remain playable. This reduces interruptions but cannot prevent them if the phone consistently generates speech more slowly than it plays. Status distinguishes preparing speech and building the audio buffer while preserving generation progress. An interrupted initial Play is retried when speech becomes available; an explicit Pause is respected. Pausing playback does not stop generation; Stop generation keeps all completed audio available. If the browser blocks automatic playback, a Play prompt remains visible alongside generation status. Browsers without the required native encoding/streaming support can still play the saved track after generation finishes or stops.

Text and audio stay in the browser. The pinned Plyr player, styles, and icons are served locally from `vendor/plyr/`; reproduce these files with `node scripts/vendor-plyr.mjs`. Each saved chunk is committed with its checkpoint, so Resume continues after the last completed passage. Playback speed and position survive Stop, Resume, and reload. Reloading or stopping composes the saved PCM blobs into one track without decoding the entire narration into a JavaScript sample array. Safari's ManagedMediaSource also hands off to this saved track when generation finishes, preserving playback intent, speed, and position without a refresh. Resuming generation rebuilds its temporary streaming representation from the saved chunks.

Saved audio includes its generation identity. If a later release selects different weights, voice or adapter behavior, the recording remains playable and the primary action becomes **Read aloud again**. That action regenerates the existing text from the beginning, preserving playback speed, instead of appending a different model's audio. Recordings with unknown identity also require regeneration to continue. Requests and replies verify this identity too, protecting tabs left open across a deployment. Replacement clears audio and updates its checkpoint atomically; a failed clear restores the previous playable session. A label-only release does not invalidate continuation.

One tab owns the saved session through a Web Lock. Other tabs wait without writing to it, then open the latest saved data when the owning tab closes or navigates away. Before any audio has been saved, stopping or encountering an error leaves the text editable for another attempt.

Keep the page visible while generating; a screen wake lock is requested when available. Mobile browsers can suspend background work. Playback position is saved every five seconds and on pause, seek, or leaving the page. Model caches can be unavailable or evicted, and do not make the whole website available offline.

Storage format changes start a fresh session. There are no legacy session imports, model pickers, or alternative worker message formats.

The app has no build step or runtime npm dependencies. The optional development dependencies run reproducible checks:

```sh
npm ci
npx playwright-core install chromium
npm test
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium installation. The browser suite starts its own local server; `NARRATE_TEST_ISOLATION=0` omits isolation headers to match GitHub Pages. It controls speech arrival and injects failures while using real IndexedDB, Plyr, audio encoding, and MediaSource playback. It checks slow generation and buffering recovery, replay, speed/position through Stop and Resume, reloads, competing tabs, interrupted writes, GPU/worker errors, late player loading, 10,000-word completion, and bounded native buffering. The native player checks also encode over an hour of audio and exercise rapid seeking, short final frames, cancellation, and decoder failure. These regressions use local player assets and need no CDN or model download.

Mobile regressions cover interrupted and denied Play requests, an explicit Pause before speech arrives, and the completed managed-stream handoff. A codec-selection regression runs the vendored encoder with an AAC-LC-only capability stub to catch its default choice of HE-AAC at 24 kHz. Native boundary tests inject timestamp offsets into real SourceBuffers to check small leading gaps, backward seeks, final audio frames, and buffering when the managed streaming hint is inactive. These use Chromium's native codecs and simulated managed lifecycle flags; they do not substitute for physical Safari testing.

The same regression suite runs on GitHub for pushes and pull requests without isolation headers. Successful runs on `main` publish the static app and vendored license notices to GitHub Pages. The custom domain is configured in the repository's Pages settings. Browser sessions and model caches belong to the domain; moving from the former `narrate-sh.pages.dev` address starts a separate local session.

`npm run test:model` separately downloads the pinned Micro model and exercises the real worker and WebGPU pipeline. It can take several minutes and reports a skipped test if WebGPU or native streaming is unavailable. Set `NARRATE_SOFTWARE_WEBGPU=1` to explicitly use Chromium's software GPU for correctness checks; this is not a phone performance benchmark. `node scripts/check-worker.mjs` runs the worker protocol and PCM validation checks without browser dependencies.

Open `scripts/check-playback.html` on a local server or HTTPS host for the same native player checks on a physical device. Each button provides the playback gesture needed on iPhone; no model download is required for these generated-tone checks.

Validation includes actual Micro inference and playback through Chromium software WebGPU, plus a 10,000-word flow with simulated speech and real audio encoding/streaming. Physical iPhone testing of Safari's AAC/ManagedMediaSource path and sustained generation is still needed. Voice quality also depends on the dictionary/rules pronunciation frontend, which does not resolve every contextual pronunciation.

To measure the actual phone, open [narrate.sh with timings](https://narrate.sh/?diagnostics=1), start a narration, and use **Playback timings → Save timings**. This opt-in module records the model identity, worker durations, source character counts, first observed playback progress, native waits, rate changes, and visibility changes. Its JSON contains neither narration text nor audio. Initialization includes adapter/runtime imports and model loading; generation timings exclude initialization but can still include first-use compilation. Returned passages can include one lookahead result discarded by Stop. Native wait time can include background interruptions and source changes; it is not automatically GPU starvation. Playback clock progress cannot prove that sound reached the speaker. New session clears the measurements, and Resume begins a separate run.

Compare buffering methods using synthetic cases or an exported timing report:

```sh
npm run benchmark:buffer
npm run --silent benchmark:buffer -- --trace /path/to/narrate-timings.json --json
```

This developer CLI simulates playback from PCM arrival times; it does not change the site or measure a phone itself. It states its encoding/fragment assumptions and rejects incomplete, resumed, backgrounded or actively interrupted traces it cannot model. The experiment found earlier starts but worse interruptions after unexpected slow inference, so production retains its ten-second reserve. See [the mobile review](MOBILE_REVIEW.md) for results and sources.

For voice comparisons, open the [model audition tool](https://narrate.sh/scripts/audition.html) on the target device, or run the same real worker from the CLI:

```sh
npm run audition -- --corpus standard --repeats 3 --pace 1.5 --seed 42 --out /tmp/narrate-audition
```

The tool warms each synthesis rate, rotates the comparison order, and saves a JSON report, raw WAV samples, and `review.html`. It requests a screen wake lock while generating and flags reports when the page was backgrounded, which may affect timings. Use `--corpus smoke --repeats 1` for a short correctness check, `--text "A custom passage."` for a specific pronunciation, and `--help` for options. `--software-gpu` explicitly opts into SwiftShader when no hardware adapter is available; those timings are not mobile performance evidence. The tool uses the existing Playwright development dependency and starts its own server. Match production hosting with `NARRATE_TEST_ISOLATION=0`.

Listen using the audition page or generated review page: these apply `targetRate / synthesisRate` to compare at the same nominal pace. Raw WAV files played separately have no playback-rate metadata. A/B/C labels hide the synthesis rates until revealed. The report includes the model/voice identity and audition corpus and is saved locally; nothing is uploaded. Empty or suspect signal checks do not rate pronunciation, naturalness, or fatigue.

`signal.quietEdges` estimates leading and trailing waveform quiet time using 10 ms RMS windows below -60 dBFS. These raw-audio durations must be divided by the recorded playback rate for listening time. Internal pauses are excluded; an entirely quiet recording reports its full duration at both edges. This helps distinguish generated pauses from the native player waits recorded by diagnostics. It does not identify words or justify trimming quiet consonants, and never changes the audio.

Evaluate whether words and numbers are complete, pronunciations are correct in context, pauses and sentence joins are natural, and the voice remains comfortable over several minutes. Compare the same passages before revealing rates. Automated tests establish signal and player correctness; choosing a better voice still needs listening. Accept a speed change only after that comparison and a sustained test on the physical iPhone, including first Play, 1.5× playback, underflow recovery, screen lock, Stop/Resume, and the final saved-track handoff.

See [the mobile review](MOBILE_REVIEW.md) for measured changes and source-linked experiments to evaluate next.
