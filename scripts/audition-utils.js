import { MODEL } from '../model-config.js?v=12';

export const passages = {
  prose: 'The quiet garden filled with birdsong as the morning sun warmed the trees.',
  numbers: 'We sold 24 tickets, raised 1,250 dollars, and reached 26.5 percent of our goal.',
  question: 'Where did you leave the keys? Are we still meeting at the station?',
  smoke: 'Hello world.',
};

export function auditionPlan(options = {}) {
  const rates = options.rates ?? MODEL.synthesisRates, repeats = options.repeats ?? 3;
  const targetRate = options.targetRate ?? 1.5, seed = options.seed ?? Date.now() >>> 0;
  if (!Array.isArray(rates) || !rates.length || new Set(rates).size !== rates.length
    || rates.some(rate => !Number.isFinite(rate) || rate <= 0 || !MODEL.synthesisRates.includes(rate))) {
    throw new Error(`Rates must be unique values from ${MODEL.synthesisRates.join(', ')}.`);
  }
  if (!Number.isInteger(repeats) || repeats < 1 || repeats > 6) throw new Error('Choose 1–6 repeats.');
  if (!Number.isFinite(targetRate) || targetRate < 0.5 || targetRate > 2) throw new Error('Target listening pace must be 0.5–2.');
  if (!Number.isInteger(seed) || seed < 0 || seed > 0xffffffff) throw new Error('Seed must be an unsigned 32-bit integer.');
  const corpus = options.text !== undefined ? [{ id: 'custom', text: options.text }]
    : (options.corpus === 'smoke' ? ['smoke'] : options.corpus && options.corpus !== 'standard'
      ? options.corpus.split(',') : ['prose', 'numbers', 'question']).map(id => ({ id, text: passages[id] }));
  if (!corpus.length || corpus.length > 3 || corpus.some(item => typeof item.text !== 'string'
    || !item.text.trim() || item.text.length > 500)) throw new Error('Use prose, numbers, question, smoke, or custom text of 1–500 characters.');
  const shuffled = [...rates];
  let state = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = Math.floor(state / 0x100000000 * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const candidates = shuffled.map((synthesisRate, i) => ({ label: String.fromCharCode(65 + i), synthesisRate }));
  const jobs = [];
  for (let repeat = 0; repeat < repeats; repeat++) for (let passage = 0; passage < corpus.length; passage++) {
    for (let i = 0; i < candidates.length; i++) jobs.push({ ...candidates[(i + repeat + passage) % candidates.length],
      ...corpus[passage], repeat: repeat + 1 });
  }
  return { candidates, corpus, repeats, targetRate, seed, jobs };
}

export function pcmStats(pcm, sampleRate = 24000) {
  if (!(pcm instanceof Uint8Array) || !pcm.length || pcm.length % 2) throw new Error('Invalid PCM16 audio.');
  if (!Number.isInteger(sampleRate) || sampleRate < 100) throw new Error('Invalid sample rate.');
  const view = new DataView(pcm.buffer, pcm.byteOffset, pcm.byteLength), samples = pcm.length / 2;
  // Diagnostic only: quiet consonants and deliberate pauses must not be trimmed automatically.
  const windowSamples = Math.round(sampleRate * .01);
  let windowSquared = 0, windowStart = 0, firstLoud = samples, lastLoud = 0;
  let squared = 0, peak = 0, nearZero = 0, atLimit = 0;
  for (let i = 0; i < pcm.length; i += 2) {
    const value = view.getInt16(i, true), magnitude = Math.abs(value / 32768);
    squared += magnitude * magnitude;
    peak = Math.max(peak, magnitude);
    if (magnitude < 0.001) nearZero++;
    if (value === -32768 || value === 32767) atLimit++;
    windowSquared += magnitude * magnitude;
    const end = i / 2 + 1;
    if (end - windowStart === windowSamples || end === samples) {
      if (windowSquared / (end - windowStart) >= .001 ** 2) {
        firstLoud = Math.min(firstLoud, windowStart); lastLoud = end;
      }
      windowStart = end; windowSquared = 0;
    }
  }
  const rms = Math.sqrt(squared / samples), warnings = [];
  if (peak === 0) warnings.push('All PCM samples are zero: no audible speech.');
  else if (rms < 0.00001) warnings.push('Extremely low signal level: check that speech is audible.');
  if (atLimit) warnings.push(`${atLimit} samples reach a PCM limit: possible clipping; listen for distortion.`);
  return { samples, rms, peak, nearZeroFraction: nearZero / samples, atLimitFraction: atLimit / samples,
    quietEdges: { thresholdDbfs: -60, windowMs: windowSamples / sampleRate * 1000,
      leadingSeconds: firstLoud / sampleRate, trailingSeconds: (samples - lastLoud) / sampleRate,
      allQuiet: lastLoud === 0 }, warnings };
}

export function wavBytes(pcm, sampleRate = 24000) {
  const bytes = new Uint8Array(44 + pcm.length), view = new DataView(bytes.buffer);
  for (const [offset, text] of [[0, 'RIFF'], [8, 'WAVEfmt '], [36, 'data']]) {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i);
  }
  view.setUint32(4, bytes.length - 8, true); view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); view.setUint32(40, pcm.length, true);
  bytes.set(pcm, 44);
  return bytes;
}
