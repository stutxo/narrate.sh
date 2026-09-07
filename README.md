# narrate.sh

[Paste text and listen at narrate.sh](https://narrate.sh/).

A static, English text reader using **Kitten Micro / Bella on WebGPU**. The model and voices download about **45 MB** on first use and are cached when browser storage permits. Text and audio stay in your browser.

Listen while speech is generated, seek through the audio that is ready, or stop and resume later. One current session saves your text, audio, playback speed, and position. New sessions start at **1×**. There is no fixed word limit; long narrations need more time and storage.

Generation requires WebGPU, including Safari 26+ on supported iPhones. Keep the page visible while generating because mobile browsers can suspend background work. The player builds about ten seconds of listening time in reserve to reduce interruptions. Browsers without native streaming support play the completed or stopped track. Browser caches can be evicted; the site is not an offline app.

## Run locally

Serve this directory over HTTP on localhost, or HTTPS elsewhere. There is no application build step or runtime npm installation. All browser code and player assets are included; model weights load from pinned Hugging Face URLs when you first generate speech.

## Code map

| File | Responsibility |
| --- | --- |
| `app.js` | Text splitting, generation queue, current-session storage, and playback lifecycle |
| `model-config.js` | Pinned model, voice, generation identity, and audio format |
| `speech-worker.js` | Lazy model loading, request validation, timing, and PCM16 transfer |
| `models/kitten.js` | Kitten loading, number expansion, and model context splitting |
| `streaming-player.js` | Native encoding, growing audio stream, buffering, and seeking |
| `player-controls.js` | Plyr controls and system media controls |
| `vendor/` | Pinned Kitten, Mediabunny, and Plyr assets with license notices |

Generation runs in a worker and prepares at most one passage ahead of saving and encoding. Each audio chunk and its checkpoint commit together in IndexedDB. A Web Lock gives one tab ownership of the session. These boundaries keep Stop, Resume, reload, and competing tabs from corrupting a recording.

One native audio element handles playback. Safari uses ManagedMediaSource and hands off to the saved track when generation completes, preserving playback intent, speed, and position. Saved audio stays playable after a model change; **Read aloud again** regenerates the text instead of mixing models. Requests and responses check model identity to handle tabs left open across releases.

## Test

Requires Node 22+:

```sh
npm ci
npx playwright-core install chromium
NARRATE_TEST_ISOLATION=0 npm test
```

`npm test` checks worker failures, finite PCM, number expansion, context limits, session ownership, atomic storage, model changes, playback controls, buffering recovery, and long narrations. Browser tests control speech arrival while using real IndexedDB, Plyr, audio encoders, and media buffers. They run without model downloads. A numeric regression also verifies the Kitten runtime's memory optimization against its original source.

Run the actual model and native playback separately:

```sh
NARRATE_TEST_ISOLATION=0 npm run test:model
```

This downloads the model and can take several minutes. It checks playback before generation finishes and validates the saved audio. Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` for an existing Chromium installation. `NARRATE_SOFTWARE_WEBGPU=1` explicitly permits software WebGPU for correctness testing; those timings do not measure phone performance.

`scripts/check-playback.html` is a local test fixture for native playback and Safari-style stream completion. Automated checks cannot judge pronunciation or prove sound reached a phone's speaker. Before release, listen on a physical iPhone and check initial Play, Pause, seeking, Stop/Resume, reload, and completed-track playback.

## Maintain and publish

Model and runtime revisions are pinned, with natural 1× synthesis. They do not update automatically. Keep the generation identity consistent with the selected weights, voice, and adapter behavior; a changed identity safely requires regeneration of existing audio. Deployment import queries control browser caching separately from model compatibility.

The scripts below rebuild only the bundled dependencies from pinned upstream sources (Node 22+, network access, and `tar` required):

```sh
node scripts/vendor-kitten.mjs
node scripts/vendor-media.mjs
node scripts/vendor-plyr.mjs
```

Preserve the license and source notices beside those assets. The Kitten pronunciation data, runtime, model, audio packaging library, and player retain their respective upstream licenses.

GitHub Actions runs the tests on pushes and pull requests. Passing `main` builds publish the application files and required vendor assets to GitHub Pages at [narrate.sh](https://narrate.sh/). Test fixtures and development scripts are excluded from the published site.
