// Small real-GPU kernel checks, explicitly using SwiftShader; no model download.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { startBrowser } from './app-fixtures.mjs';
import { optimizeConvolutionShader } from './kitten-convolution.mjs';

const original = await readFile(new URL('./fixtures/kitten-conv1d.wgsl', import.meta.url), 'utf8');

test('the convolution patch rejects incompatible source and the bundled artifact contains it', async () => {
  assert.throws(() => optimizeConvolutionShader(original.replace('idx % params.output_length', 'differentIndex')), /no longer matches/);
  const runtime = await readFile(new URL('../vendor/kitten/runtime.js', import.meta.url), 'utf8');
  assert(runtime.includes(optimizeConvolutionShader(original)), 'The checked-in runtime includes the tested shader patch.');
});

test('bundled Conv1d matches the original shader and a CPU oracle across vector boundaries', { timeout: 60000 }, async t => {
  const environment = await startBrowser({ args: ['--enable-unsafe-webgpu', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  t.after(() => environment.close());
  const page = await environment.browser.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(environment.url);
  const report = await page.evaluate(async originalShader => {
    const { KittenTTSEngine } = await import('/vendor/kitten/runtime.js?convolution-test');
    const engine = new KittenTTSEngine();
    await engine.init();
    const device = engine.device, layout = engine.pipelines.get('conv1d').bindGroupLayout;
    const reference = await device.createComputePipelineAsync({
      layout: device.createPipelineLayout({ bindGroupLayouts: [layout] }),
      compute: { module: device.createShaderModule({ code: originalShader }), entryPoint: 'main' },
    });
    const cases = [
      ...[1, 2, 3, 4, 5, 7, 16, 17, 255, 257, 1025].map((length, i) => ({
        ic: 3, oc: 5, kernel: 3, length, padding: 1, stride: 1, dilation: 1, bias: i % 2 === 0,
      })),
      { ic: 1, oc: 1, kernel: 3, length: 17, padding: 1, stride: 2, dilation: 1, bias: true },
      { ic: 22, oc: 17, kernel: 12, length: 101, padding: 3, stride: 6, dilation: 1, bias: true },
      { ic: 22, oc: 64, kernel: 1, length: 61, padding: 0, stride: 1, dilation: 1, bias: true },
      { ic: 64, oc: 64, kernel: 11, length: 53, padding: 25, stride: 1, dilation: 5, bias: true },
      { ic: 512, oc: 5, kernel: 1, length: 17, padding: 0, stride: 1, dilation: 1, bias: false },
      { ic: 5, oc: 7, kernel: 3, length: 31, padding: 0, stride: 2, dilation: 3, bias: false },
    ];
    const rows = [];
    for (const shape of cases) {
      const { ic, oc, kernel, length, padding, stride, dilation, bias } = shape;
      const outputLength = Math.floor((length + 2 * padding - dilation * (kernel - 1) - 1) / stride) + 1;
      let state = 42;
      const values = count => Float32Array.from({ length: count }, () => {
        state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
        return (state / 4294967296 - .5) * .25;
      });
      const input = values(ic * length), weights = values(oc * ic * kernel), biases = values(oc);
      const count = oc * outputLength, oracle = new Float32Array(count);
      // Independent direct convolution. Round products/sums as Float32, while
      // allowing a small tolerance for a device's permitted fused operations.
      for (let channel = 0; channel < oc; channel++) for (let position = 0; position < outputLength; position++) {
        let sum = 0;
        for (let source = 0; source < ic; source++) for (let tap = 0; tap < kernel; tap++) {
          const at = position * stride + tap * dilation - padding;
          if (at >= 0 && at < length) {
            const product = Math.fround(input[source * length + at] * weights[(channel * ic + source) * kernel + tap]);
            sum = Math.fround(sum + product);
          }
        }
        oracle[channel * outputLength + position] = bias ? Math.fround(sum + biases[channel]) : sum;
      }
      const buffers = [];
      const upload = (data, usage) => {
        const buffer = device.createBuffer({ size: data.byteLength, usage: usage | GPUBufferUsage.COPY_DST });
        device.queue.writeBuffer(buffer, 0, data); buffers.push(buffer); return buffer;
      };
      try {
        const x = upload(input, GPUBufferUsage.STORAGE), w = upload(weights, GPUBufferUsage.STORAGE), b = upload(biases, GPUBufferUsage.STORAGE);
        const outputs = [0, 1].map(() => upload(new Float32Array(count + 4).fill(NaN), GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC));
        // Invoke the actual bundled dispatcher, so an incorrect dispatch count
        // or shader artifact cannot pass by merely testing the patch helper.
        engine.dispatchConv1d(x, w, b, outputs[0], ic, oc, kernel, length, outputLength, padding, stride, dilation, bias);
        engine.endBatch();
        const params = upload(new Uint32Array([ic, oc, kernel, length, outputLength, padding, stride, dilation, bias ? 1 : 0, 0, 0, 0]), GPUBufferUsage.UNIFORM);
        const group = device.createBindGroup({ layout, entries: [x, w, b, outputs[1], params].map((buffer, binding) => ({ binding, resource: { buffer } })) });
        const encoder = device.createCommandEncoder(), pass = encoder.beginComputePass();
        pass.setPipeline(reference); pass.setBindGroup(0, group);
        pass.dispatchWorkgroups(Math.ceil(count / 256)); pass.end(); device.queue.submit([encoder.finish()]);
        const actual = await engine.readBuffer(outputs[0], count + 4), expected = await engine.readBuffer(outputs[1], count + 4);
        let maxError = 0;
        for (let i = 0; i < count; i++) {
          if (!Number.isFinite(actual[i]) || !Object.is(actual[i], expected[i])) throw new Error(`GPU reference mismatch at ${i}: ${JSON.stringify(shape)}`);
          maxError = Math.max(maxError, Math.abs(actual[i] - oracle[i]));
        }
        if (maxError > 5e-6) throw new Error(`CPU convolution mismatch (${maxError}): ${JSON.stringify(shape)}`);
        if (!actual.slice(count).every(Number.isNaN)) throw new Error('A partial vector wrote beyond its output tensor.');
        rows.push({ ...shape, outputLength, samples: count, maxError });
      } finally { buffers.forEach(buffer => buffer.destroy()); }
    }
    engine.destroy();
    return rows;
  }, original);
  assert.equal(report.length, 17);
  assert(report.every(row => row.maxError <= 5e-6));
  assert.deepEqual(errors, []);
  t.diagnostic(`Checked ${report.length} convolution shapes against the original GPU shader and CPU oracle; explicit software WebGPU, no model download.`);
});
