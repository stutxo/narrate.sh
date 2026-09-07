// Experimental metadata only. Adapter paths are relative to the site root.
const model = {
  name: 'Inflect Micro v2',
  adapter: './scripts/models/inflect.js?v=1',
  repository: 'owensong/Inflect-Micro-v2-ONNX',
  revision: '91b1ab6432323064ec0e8e9704d92fcecd24855f',
  weightsFiles: Object.freeze(['onnx/duration.onnx', 'onnx/decode.onnx']),
  runtime: 'onnxruntime-web@1.27.0/native-webgpu',
  frontend: 'geronimi73/inflect-tts@aa51b786f947635cfa1ebdea3ea160e4bca7136f/phonemizer@1.2.1/n2words@5.1.2',
  voice: 'Default male',
  defaultRate: 1,
  synthesisRates: Object.freeze([1, 1.2, 1.5]),
  downloadMB: 38,
  seed: 7,
  variation: 0.667,
  caution: 'Experimental WebGPU neural inference with CPU shape/mask bookkeeping. Upstream reports Safari on iPhone can crash during repeated inference. About 38 MB of weights plus 26 MB of runtime/frontend assets.',
};
export const MODEL = Object.freeze({ ...model,
  id: [model.adapter, model.repository, model.revision, ...model.weightsFiles, model.runtime,
    model.frontend, model.voice, model.defaultRate, model.seed, model.variation].join('|'),
});
