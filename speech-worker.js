import { MODEL, AUDIO } from './model-config.js?v=14';

let model, activeId, failure;

function fail(message) {
  if (failure) return;
  failure = message;
  postMessage({ type: 'error', id: activeId, message });
}
function check() { if (failure) throw new Error(failure); }

onmessage = async ({ data: { type, id, text, modelId, synthesisRate = MODEL.defaultRate } }) => {
  if (type !== 'generate') return;
  if (failure) return postMessage({ type: 'error', id, message: failure });
  if (activeId !== undefined) return fail('Speech generation is already running. Resume to continue.');
  activeId = id;
  const started = performance.now();
  let initMs = 0;
  const status = message => postMessage({ type: 'status', id, message });
  try {
    if (modelId !== MODEL.id) throw new Error('The speech model has changed. Reload this page to continue.');
    if (!text?.trim()) throw new Error('Add some text first.');
    if (!MODEL.synthesisRates.includes(synthesisRate)) throw new Error(`Choose a synthesis rate from ${MODEL.synthesisRates.join(', ')}.`);
    if (!model) {
      const initStarted = performance.now();
      const { createModel } = await import(new URL(MODEL.adapter, import.meta.url));
      check();
      model = await createModel({ config: MODEL, status, fail, check });
      check();
      initMs = performance.now() - initStarted;
    }
    status('Generating speech…');
    const generationStarted = performance.now();
    const { samples, sampleRate, channels } = await model.generate(text, synthesisRate);
    const generationMs = performance.now() - generationStarted;
    if (sampleRate !== AUDIO.sampleRate || channels !== AUDIO.channels) throw new Error('The speech model returned an unsupported audio format.');
    if (!(samples instanceof Float32Array) || !samples.length) throw new Error('The speech model returned no audio. Resume to try again.');
    const pcm = new Uint8Array(samples.length * 2), view = new DataView(pcm.buffer);
    for (let i = 0; i < samples.length; i++) {
      if (!Number.isFinite(samples[i])) throw new Error('The speech model returned invalid audio. Resume to try again.');
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    if (failure) return;
    const metrics = { initMs, generationMs, totalMs: performance.now() - started,
      audioSeconds: samples.length / sampleRate, synthesisRate };
    postMessage({ type: 'audio', id, modelId: MODEL.id, pcm, sampleRate, metrics }, [pcm.buffer]);
  } catch (error) {
    console.error(error);
    fail(error.message || 'Speech generation failed. Resume to try again.');
  } finally {
    activeId = undefined;
  }
};
