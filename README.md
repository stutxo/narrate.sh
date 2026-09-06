# narrate.sh

A small, static text reader: Kitten Micro on WebGPU, a Plyr audio player, and one saved session. English only. Text is generated in short passages without a fixed word cap; longer narrations take more time and browser storage. There is no WASM inference fallback, history list, or download/export feature.

Serve this directory over HTTPS (or localhost). No build step is required. Keep the JavaScript files and `vendor/` beside `index.html`; `_headers` supplies headers for hosts that support that file. HTML and JavaScript revalidate on reload. Bump the matching `v` query in the application imports when changing interfaces; model downloads keep their separate persistent cache.

- `app.js` splits text into short passages and stores each completed PCM16 audio chunk with its checkpoint in IndexedDB. It starts playback while the remaining text is generated. One native audio element and Plyr provide play/pause, speed, and a growing seekable timeline.
- `speech-worker.js` loads the pinned Micro model and generates PCM16 speech off the main thread. Model and voice downloads total approximately 45 MB and are cached when browser storage permits.
- `streaming-player.js` uses native audio encoding and fragmented MP4 to feed ManagedMediaSource on Safari or MediaSource elsewhere. It prefers AAC, with Opus where supported. A continuous encoder preserves chunk boundaries without repeatedly restarting audio playback. The media buffer covers a limited window around the playhead; compressed fragments allow seeking back through generated audio.
- `vendor/kitten/` contains the adapted WebGPU runtime, pronunciation data, and notices. `vendor/media/` contains only the Mediabunny components needed for audio encoding and MP4 packaging. Rebuild them with `node scripts/vendor-kitten.mjs` and `node scripts/vendor-media.mjs` (Node 22+, tar, and network access required).

New sessions default to 1.5× playback speed; the player can change it at any time. Playback starts once the first audio is buffered and waits automatically if generation falls behind. An interrupted initial Play is retried when speech becomes available; an explicit Pause is respected. Pausing playback does not stop generation; Stop generation keeps all completed audio available. If the browser blocks automatic playback, a Play prompt remains visible alongside generation status. Browsers without the required native encoding/streaming support can still play the saved track after generation finishes or stops.

Text and audio stay in the browser. The external Plyr player loads from jsDelivr. Each saved chunk is committed with its checkpoint, so Resume continues after the last completed passage. Playback speed and position survive Stop, Resume, and reload. Reloading or stopping composes the saved PCM blobs into one track without decoding the entire narration into a JavaScript sample array. Safari's ManagedMediaSource also hands off to this saved track when generation finishes, preserving playback intent, speed, and position without a refresh. Resuming generation rebuilds its temporary streaming representation from the saved chunks.

One tab owns the saved session through a Web Lock. Other tabs wait without writing to it, then open the latest saved data when the owning tab closes or navigates away. Before any audio has been saved, stopping or encountering an error leaves the text editable for another attempt.

Keep the page visible while generating; a screen wake lock is requested when available. Mobile browsers can suspend background work. Playback position is saved every five seconds and on pause, seek, or leaving the page. Model caches can be unavailable or evicted, and do not make the whole website available offline.

Storage format changes start a fresh session. There are no legacy session imports, model switching, or alternative worker message formats.

The app has no build step or runtime npm dependencies. The optional development dependencies run reproducible checks:

```sh
npm ci
npx playwright-core install chromium
npm test
```

Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to use an existing Chromium installation. The browser suite starts its own local server with production isolation headers. It controls speech arrival and injects failures while using real IndexedDB, Plyr, audio encoding, and MediaSource playback. It checks slow generation and buffering recovery, replay, speed/position through Stop and Resume, reloads, competing tabs, interrupted writes, GPU/worker errors, late player loading, 10,000-word completion, and bounded native buffering. The native player checks also encode over an hour of audio and exercise rapid seeking, short final frames, cancellation, and decoder failure. Plyr checks require network access to jsDelivr.

Mobile regressions cover interrupted and denied Play requests, an explicit Pause before speech arrives, and the completed managed-stream handoff. Native boundary tests inject timestamp offsets into real SourceBuffers to check small leading gaps, backward seeks, final audio frames, and buffering when the managed streaming hint is inactive. These use Chromium's native codecs and simulated managed lifecycle flags; they do not substitute for physical Safari testing.

The same regression suite runs on GitHub for pushes and pull requests.

`npm run test:model` separately downloads the pinned Micro model and exercises the real worker and WebGPU pipeline. It can take several minutes and reports a skipped test if WebGPU or native streaming is unavailable. Set `NARRATE_SOFTWARE_WEBGPU=1` to explicitly use Chromium's software GPU for correctness checks; this is not a phone performance benchmark. `node scripts/check-worker.mjs` runs the worker protocol and PCM validation checks without browser dependencies.

Open `scripts/check-playback.html` on a local server or HTTPS host for the same native player checks on a physical device. Each button provides the playback gesture needed on iPhone; no model download is required for these generated-tone checks.

Validation includes actual Micro inference and playback through Chromium software WebGPU, plus a 10,000-word flow with simulated speech and real audio encoding/streaming. Physical iPhone testing of Safari's AAC/ManagedMediaSource path and sustained generation is still needed. Voice quality also depends on the dictionary/rules pronunciation frontend, which does not resolve every contextual pronunciation.
