// Four adjacent output samples share each weight read and loop iteration.
// Keep FP32 and the original input-channel/kernel accumulation order per lane.
export function optimizeConvolutionShader(original) {
  const start = original.indexOf('@compute');
  if (start < 0 || !original.includes('let out_pos = idx % params.output_length;')) {
    throw new Error('Convolution patch no longer matches its pinned source.');
  }
  return original.slice(0, start) + `@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let blocks = (params.output_length + 3u) / 4u;
  let out_ch = gid.x / blocks;
  let out_pos = gid.x % blocks * 4u;
  if (out_ch >= params.out_channels) { return; }
  var sum = vec4<f32>(0.0);
  let positions = vec4<i32>(0, 1, 2, 3) * i32(params.stride);
  let position = i32(out_pos * params.stride) - i32(params.padding);
  for (var ic = 0u; ic < params.in_channels; ic++) {
    let input_base = ic * params.input_length;
    let weight_base = (out_ch * params.in_channels + ic) * params.kernel_size;
    for (var k = 0u; k < params.kernel_size; k++) {
      let raw = vec4<i32>(position + i32(k * params.dilation)) + positions;
      var values = vec4<f32>(0.0);
      if (raw.x >= 0 && raw.x < i32(params.input_length)) {
        values.x = input[input_base + u32(raw.x)];
      }
      if (raw.y >= 0 && raw.y < i32(params.input_length)) {
        values.y = input[input_base + u32(raw.y)];
      }
      if (raw.z >= 0 && raw.z < i32(params.input_length)) {
        values.z = input[input_base + u32(raw.z)];
      }
      if (raw.w >= 0 && raw.w < i32(params.input_length)) {
        values.w = input[input_base + u32(raw.w)];
      }
      sum += values * weight[weight_base + k];
    }
  }
  if (params.use_bias != 0u) {
    sum += vec4<f32>(bias[out_ch]);
  }
  let base = out_ch * params.output_length + out_pos;
  output[base] = sum.x;
  if (out_pos + 1u < params.output_length) {
    output[base + 1u] = sum.y;
  }
  if (out_pos + 2u < params.output_length) {
    output[base + 2u] = sum.z;
  }
  if (out_pos + 3u < params.output_length) {
    output[base + 3u] = sum.w;
  }
}
`;
}
