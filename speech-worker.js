import { KittenTTSEngine, textToInputIds } from './vendor/kitten/runtime.js?v=5';

const model = 'https://huggingface.co/KittenML/kitten-tts-micro-0.8/resolve/1ccf72b2c2048fd17efac7de2fab32d10e225084/';
let engine, activeId, failure;

// The dictionary frontend has no numeric tokens. Expand numbers before it sees
// them, so ordinary narration ("10,000 words", "26.5 percent") keeps its numbers.
const small = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
const tens = 'zero ten twenty thirty forty fifty sixty seventy eighty ninety'.split(' ');
function numberWords(value) {
  if (value < 20) return small[value];
  if (value < 100) return tens[Math.floor(value / 10)] + (value % 10 ? ' ' + small[value % 10] : '');
  for (const [size, name] of [[1e12, 'trillion'], [1e9, 'billion'], [1e6, 'million'], [1e3, 'thousand'], [100, 'hundred']]) {
    if (value >= size) return numberWords(Math.floor(value / size)) + ' ' + name + (value % size ? ' ' + numberWords(value % size) : '');
  }
}
function spokenText(text) {
  return text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/&/g, ' and ').replace(/%/g, ' percent ')
    .replace(/(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?/g, value => {
      const [whole, fraction] = value.replaceAll(',', '').split('.');
      const integer = whole.length > 15 || (whole.length > 1 && whole[0] === '0')
        ? [...whole].map(digit => small[Number(digit)]).join(' ') : numberWords(Number(whole));
      return ` ${integer}${fraction ? ' point ' + [...fraction].map(digit => small[Number(digit)]).join(' ') : ''} `;
    });
}

function fail(message) {
  if (failure) return;
  failure = message;
  postMessage({ type: 'error', id: activeId, message });
}
addEventListener('webgpu-device-lost', () => fail('The GPU connection was interrupted. Resume to continue.'));
addEventListener('webgpu-error', event => fail(`The GPU could not generate speech. ${event.detail}`));

onmessage = async ({ data: { type, id, text } }) => {
  if (type !== 'generate') return;
  if (failure) return postMessage({ type: 'error', id, message: failure });
  if (activeId !== undefined) return fail('Speech generation is already running. Resume to continue.');
  activeId = id;
  const status = message => postMessage({ type: 'status', id, message });
  try {
    if (!text?.trim()) throw new Error('Add some text first.');
    if (!engine) {
      status('Starting WebGPU…');
      engine = new KittenTTSEngine();
      await engine.init();
      status('Loading Kitten Micro (45 MB)…');
      await engine.loadModel(model + 'kitten_tts_micro_v0_8.onnx', model + 'voices.npz');
    }
    status('Generating speech…');
    const input = spokenText(text);
    const samples = await generatePassage(input);
    if (!(samples instanceof Float32Array) || !samples.length) throw new Error('The GPU returned no audio. Resume to try again.');
    const pcm = new Uint8Array(samples.length * 2), view = new DataView(pcm.buffer);
    for (let i = 0; i < samples.length; i++) {
      if (!Number.isFinite(samples[i])) throw new Error('The GPU returned invalid audio. Resume to try again.');
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(i * 2, Math.round(sample * (sample < 0 ? 32768 : 32767)), true);
    }
    if (failure) return;
    postMessage({ type: 'audio', id, pcm, sampleRate: 24000 }, [pcm.buffer]);
  } catch (error) {
    console.error(error);
    fail(error.message || 'Speech generation failed. Resume to try again.');
  } finally {
    activeId = undefined;
  }
};

async function generatePassage(text) {
  if (failure) throw new Error(failure);
  const { ids } = await textToInputIds(text);
  // Number expansion can make a short passage exceed the model's context.
  // Generate both halves serially, preserving every part of the saved passage.
  if (ids.length > 510) {
    const middle = Math.floor(text.length / 2);
    const split = text.lastIndexOf(' ', middle) > 0 ? text.lastIndexOf(' ', middle) : middle;
    const left = await generatePassage(text.slice(0, split));
    const right = await generatePassage(text.slice(split));
    const audio = new Float32Array(left.length + right.length);
    audio.set(left);
    audio.set(right, left.length);
    return audio;
  }
  if (ids.length < 3) return new Float32Array(2400); // A punctuation-only pause.
  return (await engine.generate(ids, 'Bella', 1, text.length)).waveform;
}
