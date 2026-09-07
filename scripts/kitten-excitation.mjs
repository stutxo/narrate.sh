// Keep the original harmonic rounding, summation order and RNG sequence while
// reducing scratch space from nine Float32 harmonics to one Float64 sum/sample.
export function optimizeSourceExcitation(original) {
  function replace(text, before, after) {
    if (text.split(before).length !== 2) throw new Error('Source excitation patch no longer matches its pinned source.');
    return text.replace(before, after);
  }
  const start = original.indexOf('    // Cache weights on first call');
  const end = original.indexOf('    const waveSignal =', start);
  if (start < 0 || end < start) throw new Error('Missing source excitation weights.');
  const weights = original.slice(start, end);
  let result = replace(original, weights, '');
  result = replace(result, '    const harmonics = new Float32Array(waveLen * NUM_HARMONICS);',
    weights + '    // Float64 retains the original JS sum; fround retains each original Float32 harmonic.\n'
    + '    const sums = new Float64Array(waveLen).fill(biasData[0]);');
  result = replace(result, '      const harmIdx = k + 1;', '      const weight = weightData[k];\n      const harmIdx = k + 1;');
  for (const expression of ['Math.sin(2 * Math.PI * phase) * VOICED_SCALE',
    'Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2) * UNVOICED_SCALE']) {
    result = replace(result, `harmonics[t * NUM_HARMONICS + k] = ${expression};`,
      `sums[t] += Math.fround(${expression}) * weight;`);
  }
  return replace(result, `      let sum = biasData[0];
      for (let k = 0; k < NUM_HARMONICS; k++) {
        sum += harmonics[t * NUM_HARMONICS + k] * weightData[k];
      }
      waveSignal[t] = Math.tanh(sum);`, '      waveSignal[t] = Math.tanh(sums[t]);');
}
