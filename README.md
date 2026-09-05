# narrate.sh

A small, static text reader: Kitten Micro on WebGPU, a Plyr audio player, and one saved session. English only, up to 10,000 words. There is no WASM inference fallback, history list, or download/export feature.

Serve this directory over HTTPS (or localhost). No build step is required. Keep the JavaScript files and `vendor/` beside `index.html`; `_headers` supplies headers for hosts that support that file. HTML and JavaScript revalidate on reload. Bump the matching `v` query in the application imports when changing interfaces; model downloads keep their separate persistent cache.

- `app.js` splits text into short passages and stores each completed PCM16 audio chunk with its checkpoint in IndexedDB. It starts playback while the remaining text is generated. One native audio element and Plyr provide play/pause, speed, and a growing seekable timeline.
- `speech-worker.js` loads the pinned Micro model and generates PCM16 speech off the main thread. Model and voice downloads total approximately 45 MB and are cached when browser storage permits.
- `streaming-player.js` uses native audio encoding and fragmented MP4 to feed ManagedMediaSource on Safari or MediaSource elsewhere. It prefers AAC, with Opus where supported. A continuous encoder preserves chunk boundaries without repeatedly restarting audio playback. The media buffer covers a limited window around the playhead; compressed fragments allow seeking back through generated audio.
- `vendor/kitten/` contains the adapted WebGPU runtime, pronunciation data, and notices. `vendor/media/` contains only the Mediabunny components needed for audio encoding and MP4 packaging. Rebuild them with `node scripts/vendor-kitten.mjs` and `node scripts/vendor-media.mjs` (Node 22+, tar, and network access required).

Playback starts once the first audio is buffered and waits automatically if generation falls behind. Pausing playback does not stop generation; Stop generation keeps all completed audio available. Safari may require pressing Play if automatic playback is blocked. Browsers without the required native encoding/streaming support can still play the saved track after generation finishes or stops.

Text and audio stay in the browser. The external Plyr player loads from jsDelivr. Each saved chunk is committed with its checkpoint, so Resume continues after the last completed passage. Reloading or stopping composes the saved PCM blobs into one track without decoding the entire narration into a JavaScript sample array. Resuming generation rebuilds its temporary streaming representation from the saved chunks.

Keep the page visible while generating; a screen wake lock is requested when available. Mobile browsers can suspend background work. Playback position is saved every five seconds and on pause, seek, or leaving the page. Model caches can be unavailable or evicted, and do not make the whole website available offline.

Storage format changes start a fresh session. There are no legacy session imports, model switching, or alternative worker message formats.

Check Micro loading and PCM16 output with `node scripts/check-worker.mjs`. Open `scripts/check-playback.html` on the local server for native playback, seeking, saved-position, and cancellation checks without downloading a model.

Validation includes actual Micro inference and playback through Chromium software WebGPU, plus a 10,000-word flow with simulated speech and real audio encoding/streaming. Physical iPhone testing of Safari's AAC/ManagedMediaSource path and sustained generation is still needed. Voice quality also depends on the dictionary/rules pronunciation frontend, which does not resolve every contextual pronunciation.
