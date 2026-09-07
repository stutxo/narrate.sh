// Unmodified generateSourceExcitation body from svenflow/kitten-tts-webgpu.
// Source: https://github.com/svenflow/kitten-tts-webgpu/blob/35f31049363ea39464dc05d42c1135b5c9e3235f/src/engine.ts#L3322
// Revision: 35f31049363ea39464dc05d42c1135b5c9e3235f. Apache-2.0;
// see ../../vendor/kitten/LICENSE-APACHE-2.0. Kept for offline equivalence tests.
// The vendor build checks this exact body against the downloaded pinned source.
export default String.raw`
    const SAMPLE_RATE = 24000;
    const NUM_HARMONICS = 9;

    // 1. Read F0_proj from GPU
    const f0Data = await this.readBuffer(f0ProjBuf, f0Length);

    // 2. Upsample F0 to waveform rate (nearest-neighbor)
    // Waveform length from STFT: (stftLen - 1) * 5 + 20 = raw, then edge-pad adds 20
    // So: padded = waveLen + 20, stftLen = (padded - 20) / 5 + 1 = waveLen / 5 + 1
    // => waveLen = (stftLen - 1) * 5
    const waveLen = (stftLen - 1) * 5;
    const f0Upsampled = new Float32Array(waveLen);
    const upsampleRatio = waveLen / f0Length;
    for (let i = 0; i < waveLen; i++) {
      const srcIdx = Math.min(Math.floor(i / upsampleRatio), f0Length - 1);
      f0Upsampled[i] = f0Data[srcIdx];
    }

    // 3. Generate 9 harmonics via cumulative phase
    const harmonics = new Float32Array(waveLen * NUM_HARMONICS);
    const VOICED_SCALE = 0.1;
    const UNVOICED_SCALE = 0.003; // sqrt(0.003) ≈ 0.055
    for (let k = 0; k < NUM_HARMONICS; k++) {
      const harmIdx = k + 1; // harmonics 1-9
      let phase = 0;
      for (let t = 0; t < waveLen; t++) {
        const f0 = f0Upsampled[t];
        const voiced = f0 > 10; // 10 Hz threshold
        if (voiced) {
          phase += f0 * harmIdx / SAMPLE_RATE;
          // Wrap phase to prevent precision loss
          phase -= Math.floor(phase);
          harmonics[t * NUM_HARMONICS + k] = Math.sin(2 * Math.PI * phase) * VOICED_SCALE;
        } else {
          // Gaussian noise for unvoiced regions
          const u1 = Math.random();
          const u2 = Math.random();
          harmonics[t * NUM_HARMONICS + k] = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2) * UNVOICED_SCALE;
          phase = 0; // Reset phase for unvoiced
        }
      }
    }

    // 4. Linear layer: [waveLen, 9] × [9, 1] + bias → tanh → [waveLen]
    // Cache weights on first call to avoid GPU readBuffer round-trips
    if (!this.sinGenWeights) {
      const linearWeight = this.requireWeight('onnx::MatMul_6388');
      const linearBias = this.requireWeight('kmodel.decoder.generator.m_source.l_linear.bias');
      const fwdReal = this.requireWeight('kmodel.decoder.generator.stft.weight_forward_real');
      const fwdImag = this.requireWeight('kmodel.decoder.generator.stft.weight_forward_imag');
      this.sinGenWeights = {
        linearWeight: await this.readBuffer(linearWeight.buffer, 9),
        linearBias: await this.readBuffer(linearBias.buffer, 1),
        fwdReal: await this.readBuffer(fwdReal.buffer, 11 * 20),
        fwdImag: await this.readBuffer(fwdImag.buffer, 11 * 20),
      };
    }
    const { linearWeight: weightData, linearBias: biasData } = this.sinGenWeights;
    const waveSignal = new Float32Array(waveLen);
    for (let t = 0; t < waveLen; t++) {
      let sum = biasData[0];
      for (let k = 0; k < NUM_HARMONICS; k++) {
        sum += harmonics[t * NUM_HARMONICS + k] * weightData[k];
      }
      waveSignal[t] = Math.tanh(sum);
    }

    // 5. Edge-pad 10 on each side → [waveLen + 20]
    const padded = new Float32Array(waveLen + 20);
    for (let i = 0; i < 10; i++) {
      padded[i] = waveSignal[0]; // edge pad left
    }
    for (let i = 0; i < waveLen; i++) {
      padded[i + 10] = waveSignal[i];
    }
    for (let i = 0; i < 10; i++) {
      padded[waveLen + 10 + i] = waveSignal[waveLen - 1]; // edge pad right
    }

    // 6. Forward STFT: two Conv1d(1→11, k=20, stride=5)
    const { fwdReal: fwdRealData, fwdImag: fwdImagData } = this.sinGenWeights;

    const realOut = new Float32Array(11 * stftLen);
    const imagOut = new Float32Array(11 * stftLen);
    const STRIDE = 5;
    const KERNEL = 20;
    for (let bin = 0; bin < 11; bin++) {
      for (let t = 0; t < stftLen; t++) {
        let sumR = 0, sumI = 0;
        const offset = t * STRIDE;
        for (let k = 0; k < KERNEL; k++) {
          const val = padded[offset + k];
          sumR += val * fwdRealData[bin * KERNEL + k];
          sumI += val * fwdImagData[bin * KERNEL + k];
        }
        realOut[bin * stftLen + t] = sumR;
        imagOut[bin * stftLen + t] = sumI;
      }
    }

    // 7. Magnitude + Phase → [22, stftLen]
    const noiseData = new Float32Array(22 * stftLen);
    const EPS = 1e-14;
    for (let bin = 0; bin < 11; bin++) {
      for (let t = 0; t < stftLen; t++) {
        const r = realOut[bin * stftLen + t];
        const im = imagOut[bin * stftLen + t];
        // Magnitude: sqrt(r² + i² + eps)
        noiseData[bin * stftLen + t] = Math.sqrt(r * r + im * im + EPS);
        // Phase: atan2(imag, real)
        noiseData[(11 + bin) * stftLen + t] = Math.atan2(im, r);
      }
    }

    // 8. Upload to GPU
    return this.createBuffer(noiseData, 'noise_source',
      GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
`;
