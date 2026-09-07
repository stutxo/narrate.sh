# Updating the speech model

`model-config.js` selects one model by re-exporting the lightweight `models/pocket-config.js`. The latter contains identity and download metadata, voice, token limit, and supported synthesis rates. The main UI can import `MODEL.name` and `MODEL.id` without importing a runtime. `speech-worker.js` dynamically imports the configured adapter only after a valid generation request. There is no model picker, registry, fallback, or server inference.

The current adapter is `models/pocket.js`, using the pinned community [jax-js Pocket browser port](https://github.com/ekzhang/jax-js/blob/970fa22d934ce2e617cd3a993c6ecc8b736496f2/website/src/routes/tts/pocket-tts.ts). It selects only WASM/FP32, caches pinned assets when available, tokenizes text, splits oversized inputs without truncation, and releases decoder states between passages. This is Kyutai's model with Alba, using an older tested browser checkpoint; it is not Kyutai's official Python runtime. Upstream library or model releases do not update the site automatically.

## Compatible weights

For weights supported by the pinned Pocket forward pass, update the full repository/revision pins, weight file and expected byte size, voice/tokenizer pins, and related metadata in `models/pocket-config.js`. Asset size expectations in the adapter must match. Keep production `defaultRate: 1`; this adapter supports only natural 1× synthesis. Compatible means the tensor names/shapes, tokenizer, voice embeddings and forward pass agree; a safetensors file alone does not establish compatibility. Test a new upstream checkpoint before selecting it.

The worker passes the current configuration into the adapter. An adapter does not retain a separately imported weights pin. No worker, playback, or UI logic needs model-specific edits for compatible weights.

Use the normal release cache update when publishing a changed configuration: update the metadata leaf query in `model-config.js`, its importers, and the application script queries that load them. This makes previously visited browsers fetch the new configuration. Keep these deployment queries distinct from the adapter compatibility version below.

`MODEL.id` is derived from the pinned files, voice, source revision, backend, precision, seed, default synthesis rate, token limit, and versioned adapter URL. The app uses it to prevent resuming an old recording with a different generation setup. Previously saved audio can still play; regenerating it uses the current model from the beginning.

Each request carries the UI's model identity. A worker served from a different deployment rejects a mismatch or missing identity before importing an adapter and asks for a reload. Every audio response also carries the worker's identity; the app and audition tool must reject a different or missing identity before accepting PCM. This covers both an older open page fetching a newer worker and a newer page receiving older worker code that lacks the request check. Query-stamped static URLs are cache controls, not immutable files.

The adapter query (`models/pocket.js?v=1`) is a **generation compatibility version**, separate from ordinary UI deployment/cache queries. Bump it when changing the runtime, frontend, normalization, or other generation behavior. Update the adapter's runtime import cache query when its vendored artifact changes. A UI-only cache or label change must not change the adapter compatibility version. Weight and voice pin changes already change `MODEL.id` automatically.

## A different architecture

Add a small adapter and point `MODEL.adapter` at it. Arbitrary architectures require their own runtime/frontend adapter; they cannot be installed by changing a weights URL. Keep heavyweight imports and inference inside the adapter so they load only in the worker.

An adapter exports:

```js
export async function createModel({ config, status, fail, check }) {
  // Initialize the runtime and pinned assets. status(message) reports progress.
  // fail(message) reports fatal asynchronous device/runtime errors.
  // check() throws if the worker has already failed; use it after async setup
  // and between asynchronous generation stages.
  return {
    async generate(text, synthesisRate) {
      return { samples, sampleRate: 24000, channels: 1 };
    },
  };
}
```

`samples` must be a nonempty, finite `Float32Array` of mono waveform samples at **24,000 Hz**. This is the fixed player contract exported as `AUDIO`; changing that constant does not reconfigure the player. An adapter with another native sample rate or channel layout must resample/downmix internally and test that conversion. It must preserve the complete input, respect supported synthesis rates, and own its context splitting. Do not truncate text to fit a model.

The worker owns serialization, fatal state, elapsed timings, waveform validation and little-endian PCM16 conversion. Its external protocol is:

```js
// Request (rate optional; defaults to MODEL.defaultRate)
{ type: 'generate', id, text, modelId: MODEL.id, synthesisRate }
// Success (pcm.buffer transferred)
{ type: 'audio', id, modelId: MODEL.id, pcm, sampleRate: 24000, metrics }
// Progress or failure
{ type: 'status', id, message }
{ type: 'error', id, message }
```

`metrics` contains initialization, generation, and total milliseconds, audio seconds, and synthesis rate; no narration text. Initialization includes the first lazy adapter/runtime import and model load. Terminating the worker releases its adapter and model resources; there is no background model shared with the UI.

## Verification

Run `npm test` for the worker/adapter, configured URL/voice, lazy import, replacement-adapter, canonical-format, failure-race, storage and playback contracts. The Kitten source-excitation regression remains offline and checks the actual vendored bundle against the pinned original.

Then run `NARRATE_TEST_ISOLATION=0 npm run test:model` to exercise real CPU/WASM generation through native playback with WebGPU absent. For listening comparisons use `npm run audition` or `scripts/audition.html`: include prose, numbers and questions, warm each candidate, compare at matched nominal pace, and check the target phone. PCM sanity checks do not establish pronunciation quality. Desktop CPU timings are not evidence of phone performance. Historical GPU models remain optional comparison-tool candidates, with their identities preserved separately.

If the adapter or its runtime changes, preserve its license/source notices and reproducible vendor build, and include new adapter assets in the Pages artifact. Do not commit model weights or audition recordings.
