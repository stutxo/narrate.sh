import { CANDIDATES } from './compare-config.js?v=15';

const config = CANDIDATES.find(model => model.key === new URL(import.meta.url).searchParams.get('model'));
let model, activeId, failure;
function fail(message) {
  if (failure) return;
  failure = message;
  postMessage({ type: 'error', id: activeId, message });
}
function check() { if (failure) throw new Error(failure); }

onmessage = async ({ data: { type, id, text, modelId, synthesisRate = 1 } }) => {
  if (type !== 'generate') return;
  if (failure) return postMessage({ type: 'error', id, message: failure });
  if (activeId !== undefined) return fail('Speech generation is already running.');
  activeId = id;
  const started = performance.now();
  let initMs = 0;
  const status = message => postMessage({ type: 'status', id, message });
  try {
    if (!config || modelId !== config.id) throw new Error('The comparison model has changed. Reload this page.');
    if (typeof text !== 'string' || !text.trim()) throw new Error('Add some text first.');
    if (synthesisRate !== 1) throw new Error('Compare models at their natural 1× rate.');
    if (!model) {
      const initStarted = performance.now();
      const { createModel } = await import(new URL(config.adapter, new URL('../', import.meta.url)));
      check();
      model = await createModel({ config, status, fail, check });
      check();
      initMs = performance.now() - initStarted;
    }
    const generationStarted = performance.now();
    const { samples, sampleRate, channels } = await model.generate(text, synthesisRate);
    const generationMs = performance.now() - generationStarted;
    if (sampleRate !== 24000 || channels !== 1) throw new Error('Unsupported comparison audio format.');
    if (!(samples instanceof Float32Array) || !samples.length) throw new Error('The model returned no audio.');
    const pcm = new Uint8Array(samples.length * 2), view = new DataView(pcm.buffer);
    for (let i = 0; i < samples.length; i++) {
      if (!Number.isFinite(samples[i])) throw new Error('The model returned invalid audio.');
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    check();
    const metrics = { initMs, generationMs, totalMs: performance.now() - started,
      audioSeconds: samples.length / sampleRate, synthesisRate };
    postMessage({ type: 'audio', id, modelId: config.id, pcm, sampleRate, metrics }, [pcm.buffer]);
  } catch (error) {
    fail(error.message || 'Comparison generation failed.');
  } finally { activeId = undefined; }
};
