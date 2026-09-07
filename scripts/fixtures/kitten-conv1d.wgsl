
@group(0) @binding(0) var<storage, read> input: array<f32>;     // [C_in, L]
@group(0) @binding(1) var<storage, read> weight: array<f32>;    // [C_out, C_in, K]
@group(0) @binding(2) var<storage, read> bias: array<f32>;      // [C_out]
@group(0) @binding(3) var<storage, read_write> output: array<f32>; // [C_out, L_out]

struct Params {
  in_channels: u32,
  out_channels: u32,
  kernel_size: u32,
  input_length: u32,
  output_length: u32,
  padding: u32,
  stride: u32,
  dilation: u32,
  use_bias: u32,
}
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let out_ch = idx / params.output_length;
  let out_pos = idx % params.output_length;

  if (out_ch >= params.out_channels) { return; }

  var sum = 0.0;
  for (var ic = 0u; ic < params.in_channels; ic++) {
    for (var k = 0u; k < params.kernel_size; k++) {
      let in_pos_raw = i32(out_pos * params.stride) + i32(k * params.dilation) - i32(params.padding);
      if (in_pos_raw >= 0 && u32(in_pos_raw) < params.input_length) {
        let w_idx = out_ch * params.in_channels * params.kernel_size + ic * params.kernel_size + k;
        let in_idx = ic * params.input_length + u32(in_pos_raw);
        sum += input[in_idx] * weight[w_idx];
      }
    }
  }

  if (params.use_bias != 0u) {
    sum += bias[out_ch];
  }

  output[out_ch * params.output_length + out_pos] = sum;
}
