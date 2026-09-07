# Updating the speech model

`model-config.js` selects one model. It contains lightweight identity and download metadata, the voice, token limit, and supported synthesis rates. The main UI can import `MODEL.name` and `MODEL.id` without importing a runtime. `speech-worker.js` dynamically imports the configured adapter only after a valid generation request. There is no model picker, registry, fallback, or server inference.

The current adapter is `models/kitten.js`, using the pinned [Kitten WebGPU engine](https://github.com/svenflow/kitten-tts-webgpu/tree/35f31049363ea39464dc05d42c1135b5c9e3235f). It owns model loading, GPU event handling, the dictionary/rules frontend, number expansion, voice selection, and splitting expanded text to the model's context limit. The model and Bella voice remain unchanged by this separation.

## Compatible weights

For weights supported by the existing Kitten engine, update `repository`, the full pinned `revision`, `weightsFile`, `voicesFile`, `voice`, and the relevant name/download/token metadata in `model-config.js`. Keep production `defaultRate: 1` unless a matched-pace audition supports changing it. Compatible means the graph, tensor names/shapes, voice archive, tokenizer and phoneme conventions fit this engine; an `.onnx` extension alone does not establish compatibility.

The worker passes the current configuration into the adapter. An adapter does not retain a separately imported weights pin. No worker, playback, or UI logic needs model-specific edits for compatible weights.

Use the normal release cache update when publishing a changed configuration: update the `model-config.js` query in its importers and the application script queries that load them. This makes previously visited browsers fetch the new configuration. Keep these deployment queries distinct from the adapter compatibility version below.

`MODEL.id` is derived from the pinned files, voice, default synthesis rate, token limit, and versioned adapter URL. The app uses it to prevent resuming an old recording with a different generation setup. Previously saved audio can still play; regenerating it uses the current model from the beginning.

Each request carries the UI's model identity. A worker served from a different deployment rejects a mismatch or missing identity before importing an adapter and asks for a reload. Every audio response also carries the worker's identity; the app and audition tool must reject a different or missing identity before accepting PCM. This covers both an older open page fetching a newer worker and a newer page receiving older worker code that lacks the request check. Query-stamped static URLs are cache controls, not immutable files.

The adapter query (`models/kitten.js?v=1`) is a **generation compatibility version**, separate from ordinary UI deployment/cache queries. Bump it when changing the runtime, frontend, normalization, or other generation behavior. Update the adapter's runtime import cache query when its vendored artifact changes. A UI-only cache or label change must not change the adapter compatibility version. Weight and voice pin changes already change `MODEL.id` automatically.

## A different architecture

Add a small adapter and point `MODEL.adapter` at it. Arbitrary architectures require their own runtime/frontend adapter; they cannot be installed by changing a Kitten weights URL. Keep heavyweight imports and GPU work inside the adapter so they load only in the worker.

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

Then run `npm run test:model` with real WebGPU to exercise the current worker through playback. For listening comparisons use `npm run audition` or `scripts/audition.html`: include prose, numbers and questions, warm each candidate, compare at matched nominal pace, and check the target phone. PCM sanity checks do not establish pronunciation quality. Software WebGPU is an explicit correctness option, not evidence of phone performance.

If the adapter or its runtime changes, preserve its license/source notices and reproducible vendor build, and include new adapter assets in the Pages artifact. Do not commit model weights or audition recordings.
