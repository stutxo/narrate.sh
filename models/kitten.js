import { AUDIO } from '../model-config.js?v=12';
import { KittenTTSEngine, textToInputIds } from '../vendor/kitten/runtime.js?v=11';

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

export async function createModel({ config: MODEL, status, fail, check }) {
  addEventListener('webgpu-device-lost', () => fail('The GPU connection was interrupted. Resume to continue.'));
  addEventListener('webgpu-error', event => fail(`The GPU could not generate speech. ${event.detail}`));
  status('Starting WebGPU…');
  const engine = new KittenTTSEngine();
  await engine.init();
  check();
  status(`Loading ${MODEL.name} (${MODEL.downloadMB} MB)…`);
  const base = `https://huggingface.co/${MODEL.repository}/resolve/${MODEL.revision}/`;
  await engine.loadModel(base + MODEL.weightsFile, base + MODEL.voicesFile);
  check();

  async function generatePassage(text, synthesisRate) {
    check();
    const { ids } = await textToInputIds(text);
    check();
    // Number expansion can make a short passage exceed the model's context.
    // Generate both halves serially, preserving the complete passage.
    if (ids.length > MODEL.tokenLimit) {
      const middle = Math.floor(text.length / 2);
      const split = text.lastIndexOf(' ', middle) > 0 ? text.lastIndexOf(' ', middle) : middle;
      const left = await generatePassage(text.slice(0, split), synthesisRate);
      const right = await generatePassage(text.slice(split), synthesisRate);
      const audio = new Float32Array(left.length + right.length);
      audio.set(left);
      audio.set(right, left.length);
      return audio;
    }
    if (ids.length < 3) return new Float32Array(AUDIO.sampleRate / 10); // A punctuation-only pause.
    return (await engine.generate(ids, MODEL.voice, synthesisRate, text.length)).waveform;
  }
  return { async generate(text, synthesisRate) {
    return { samples: await generatePassage(spokenText(text), synthesisRate), ...AUDIO };
  } };
}
