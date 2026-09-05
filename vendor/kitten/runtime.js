/*! Kitten TTS WebGPU; source and license details: NOTICE.md */
var Me={symbols:Array.from("$;:,.!?\xA1\xBF\u2014\u2026\u201C\xAB\xBB\u201D\u201E ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz\u0251\u0250\u0252\xE6\u0253\u0299\u03B2\u0254\u0255\xE7\u0257\u0256\xF0\u02A4\u0259\u0258\u025A\u025B\u025C\u025D\u025E\u025F\u0284\u0261\u0260\u0262\u029B\u0266\u0267\u0127\u0265\u029C\u0268\u026A\u029D\u026D\u026C\u026B\u026E\u029F\u0271\u026F\u0270\u014B\u0273\u0272\u0274\xF8\u0275\u0278\u03B8\u0153\u0276\u0298\u0279\u027A\u027E\u027B\u0280\u0281\u027D\u0282\u0283\u0288\u02A7\u0289\u028A\u028B\u2C71\u028C\u0263\u0264\u028D\u03C7\u028E\u028F\u0291\u0290\u0292\u0294\u02A1\u0295\u02A2\u01C0\u01C1\u01C2\u01C3\u02C8\u02CC\u02D0\u02D1\u02BC\u02B4\u02B0\u02B1\u02B2\u02B7\u02E0\u02E4\u02DE\u2193\u2191\u2192\u2197\u2198'\u0329'\u1D7B"),voiceAliases:{Bella:"expr-voice-2-f",Jasper:"expr-voice-2-m",Luna:"expr-voice-3-f",Bruno:"expr-voice-3-m",Rosie:"expr-voice-4-f",Hugo:"expr-voice-4-m",Kiki:"expr-voice-5-f",Leo:"expr-voice-5-m"},sampleRate:24e3};var Ce=class{buffer;view;constructor(i){this.buffer=new Uint8Array(i),this.view=new DataView(i)}parseInitializers(){let i=new Map,s=this.findField(this.buffer,0,this.buffer.length,7);if(!s)throw new Error("Could not find graph in ONNX model");let e=s.start;for(;e<s.end;){let t=this.readTag(e);if(!t)break;if(t.fieldNumber===5&&t.wireType===2){let r=this.readVarint(t.dataStart),u=r.end,n=u+r.value,f=this.parseTensorProto(u,n);f&&f.name&&i.set(f.name,f),e=n}else e=this.skipField(t)}return i}parseTensorProto(i,s){let e="",t=[],r=0,u=null,n=null,f=null,o=null,a=i;for(;a<s;){let c=this.readTag(a);if(!c)break;switch(c.fieldNumber){case 1:if(c.wireType===0){let d=this.readVarint(c.dataStart);t.push(d.value),a=d.end}else if(c.wireType===2){let d=this.readVarint(c.dataStart),p=d.end,m=p+d.value;for(;p<m;){let g=this.readVarint(p);t.push(g.value),p=g.end}a=m}else a=this.skipField(c);break;case 2:{let d=this.readVarint(c.dataStart);r=d.value,a=d.end}break;case 4:if(c.wireType===2){let d=this.readVarint(c.dataStart),p=d.end,m=this.buffer.slice(p,p+d.value);n=new Float32Array(m.buffer,0,d.value/4),a=p+d.value}else a=this.skipField(c);break;case 5:if(c.wireType===2){let d=this.readVarint(c.dataStart),p=d.end,m=p+d.value,g=[],w=p;for(;w<m;){let _=this.readVarint(w);g.push(_.value|0),w=_.end}f=new Int32Array(g),a=m}else if(c.wireType===0){let d=this.readVarint(c.dataStart);f=new Int32Array([d.value]),a=d.end}else a=this.skipField(c);break;case 7:if(c.wireType===2){let d=this.readVarint(c.dataStart),p=d.end,m=this.buffer.slice(p,p+d.value);o=new BigInt64Array(m.buffer,0,d.value/8),a=p+d.value}else a=this.skipField(c);break;case 8:{let d=this.readVarint(c.dataStart),p=this.buffer.subarray(d.end,d.end+d.value);e=new TextDecoder().decode(p),a=d.end+d.value}break;case 9:{let d=this.readVarint(c.dataStart);u=this.buffer.subarray(d.end,d.end+d.value),a=d.end+d.value}break;default:a=this.skipField(c)}}if(!e)return null;let l;return u?l=u:n?l=new Uint8Array(n.buffer,n.byteOffset,n.byteLength):f?l=new Uint8Array(f.buffer,f.byteOffset,f.byteLength):o?l=new Uint8Array(o.buffer,o.byteOffset,o.byteLength):l=new Uint8Array(0),{name:e,dims:t,dataType:r,rawData:l}}readTag(i){if(i>=this.buffer.length)return null;let s=this.readVarint(i),e=s.value;return{fieldNumber:e>>>3,wireType:e&7,dataStart:s.end}}readVarint(i){let s=0,e=0,t=i;for(;t<this.buffer.length;){let r=this.buffer[t];if(s|=(r&127)<<e,t++,(r&128)===0||(e+=7,e>35))break}return{value:s,end:t}}skipField(i){switch(i.wireType){case 0:return this.readVarint(i.dataStart).end;case 1:return i.dataStart+8;case 2:{let s=this.readVarint(i.dataStart);return s.end+s.value}case 5:return i.dataStart+4;default:throw new Error(`Unknown wire type: ${i.wireType}`)}}findField(i,s,e,t){let r=s;for(;r<e;){let u=this.readTag(r);if(!u)break;if(u.fieldNumber===t&&u.wireType===2){let n=this.readVarint(u.dataStart);return{start:n.end,end:n.end+n.value}}r=this.skipField(u)}return null}};function ot(h){let i=new Float32Array(h.length);for(let s=0;s<h.length;s++){let e=h[s],t=e>>15&1,r=e>>10&31,u=e&1023;r===0?i[s]=(t?-1:1)*Math.pow(2,-14)*(u/1024):r===31?i[s]=u===0?t?-1/0:1/0:NaN:i[s]=(t?-1:1)*Math.pow(2,r-15)*(1+u/1024)}return i}async function At(h){let i=new Uint8Array(h),s=new Map,e=0;for(;e<i.length-4&&!(i[e]!==80||i[e+1]!==75||i[e+2]!==3||i[e+3]!==4);){let t=new DataView(h,e),r=t.getUint16(8,!0),u=t.getUint32(18,!0),n=t.getUint16(26,!0),f=t.getUint16(28,!0),o=new TextDecoder().decode(i.subarray(e+30,e+30+n));if(u===4294967295){let l=e+30+n,c=l+f;for(;l+4<=c;){let d=new DataView(h,l),p=d.getUint16(0,!0),m=d.getUint16(2,!0);if(p===1&&m>=16){let g=d.getUint32(12,!0),w=d.getUint32(16,!0);u=g+w*4294967296;break}l+=4+m}}let a=e+30+n+f;if(o.endsWith(".npy")&&r===0){let l=i.subarray(a,a+u),c=Jr(l.buffer,l.byteOffset),d=o.replace(".npy","");s.set(d,c)}e=a+u}return s}function Jr(h,i){let s=ei(h,i);return{shape:s.shape,data:s.data}}function ei(h,i=0){let s=new Uint8Array(h,i);if(s[0]!==147||s[1]!==78)throw new Error("Invalid .npy magic number");let e=s[6],t,r;e===1?(t=new DataView(h,i+8).getUint16(0,!0),r=10):(t=new DataView(h,i+8).getUint32(0,!0),r=12);let u=new TextDecoder().decode(s.subarray(r,r+t)),n=r+t,f=u.match(/shape['"]\s*:\s*\(([^)]*)\)/),o=f?f[1].split(",").map(p=>p.trim()).filter(p=>p).map(Number):[],a=u.match(/descr['"]\s*:\s*'([^']*)'/),l=a?a[1]:"<f4",c=o.length===0?1:o.reduce((p,m)=>p*m,1),d;if(l==="<f4"||l==="=f4"||l==="float32"){let p=new Uint8Array(h,i+n,c*4),m=new Uint8Array(c*4);m.set(p),d=new Float32Array(m.buffer)}else if(l==="<f2"||l==="=f2"||l==="float16"){let p=new Uint8Array(h,i+n,c*2),m=new Uint8Array(c*2);m.set(p);let g=new Uint16Array(m.buffer);d=ot(g)}else if(l==="<i8"||l==="=i8"||l==="int64"){let p=new Uint8Array(h,i+n,c*8),m=new Uint8Array(c*8);m.set(p);let g=new DataView(m.buffer);d=new Float32Array(c);for(let w=0;w<c;w++)d[w]=g.getInt32(w*8,!0)}else throw new Error(`Unsupported .npy dtype: ${l}`);return{shape:o,data:d,dtype:l}}var zt=`
@group(0) @binding(0) var<storage, read> embeddings: array<f32>;
@group(0) @binding(1) var<storage, read> input_ids: array<i32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

struct Params {
  seq_len: u32,
  embed_dim: u32,
  vocab_size: u32,
}
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let seq_idx = idx / params.embed_dim;
  let dim_idx = idx % params.embed_dim;

  if (seq_idx >= params.seq_len) { return; }

  let token_id = input_ids[seq_idx];
  let embed_offset = u32(token_id) * params.embed_dim + dim_idx;
  output[idx] = embeddings[embed_offset];
}
`,Dt=`
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read> gamma: array<f32>;
@group(0) @binding(2) var<storage, read> beta: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;

struct Params {
  batch_size: u32,
  hidden_size: u32,
  eps: f32,
}
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let batch_idx = gid.x;
  if (batch_idx >= params.batch_size) { return; }

  let offset = batch_idx * params.hidden_size;

  // Compute mean
  var sum = 0.0;
  for (var i = 0u; i < params.hidden_size; i++) {
    sum += input[offset + i];
  }
  let mean = sum / f32(params.hidden_size);

  // Compute variance
  var var_sum = 0.0;
  for (var i = 0u; i < params.hidden_size; i++) {
    let diff = input[offset + i] - mean;
    var_sum += diff * diff;
  }
  let variance = var_sum / f32(params.hidden_size);
  let inv_std = 1.0 / sqrt(variance + params.eps);

  // Normalize
  for (var i = 0u; i < params.hidden_size; i++) {
    output[offset + i] = (input[offset + i] - mean) * inv_std * gamma[i] + beta[i];
  }
}
`,Mt=`
// Tiled matmul with shared memory. TILE=16, each workgroup computes a 16\xD716 output tile.
// Reduces global memory reads by factor of TILE compared to naive approach.

const TILE: u32 = 16u;

@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read> bias: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;

struct Params {
  M: u32,  // rows of A / output
  K: u32,  // cols of A / rows of B
  N: u32,  // cols of B / output
  use_bias: u32,
}
@group(0) @binding(4) var<uniform> params: Params;

var<workgroup> tileA: array<f32, 256>;  // 16\xD716
var<workgroup> tileB: array<f32, 256>;  // 16\xD716

@compute @workgroup_size(16, 16)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let row = gid.x;
  let col = gid.y;
  let lr = lid.x;
  let lc = lid.y;

  var sum = 0.0;
  let numTiles = (params.K + TILE - 1u) / TILE;

  for (var t = 0u; t < numTiles; t++) {
    // Load tile of A: rows [row_base..+16], cols [t*16..+16]
    let aCol = t * TILE + lc;
    if (row < params.M && aCol < params.K) {
      tileA[lr * TILE + lc] = A[row * params.K + aCol];
    } else {
      tileA[lr * TILE + lc] = 0.0;
    }

    // Load tile of B: rows [t*16..+16], cols [col_base..+16]
    let bRow = t * TILE + lr;
    if (bRow < params.K && col < params.N) {
      tileB[lr * TILE + lc] = B[bRow * params.N + col];
    } else {
      tileB[lr * TILE + lc] = 0.0;
    }

    workgroupBarrier();

    // Accumulate dot product from shared memory
    for (var k = 0u; k < TILE; k++) {
      sum += tileA[lr * TILE + k] * tileB[k * TILE + lc];
    }

    workgroupBarrier();
  }

  if (row < params.M && col < params.N) {
    if (params.use_bias != 0u) {
      sum += bias[col];
    }
    output[row * params.N + col] = sum;
  }
}
`,Ct=`
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
`,Wt=`
@group(0) @binding(0) var<storage, read> input: array<f32>;     // [C, L]
@group(0) @binding(1) var<storage, read_write> output: array<f32>; // [C, L]

struct Params {
  channels: u32,
  length: u32,
  eps: f32,
}
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let ch = gid.x;
  if (ch >= params.channels) { return; }

  let offset = ch * params.length;

  // Compute mean
  var sum = 0.0;
  for (var i = 0u; i < params.length; i++) {
    sum += input[offset + i];
  }
  let mean = sum / f32(params.length);

  // Compute variance
  var var_sum = 0.0;
  for (var i = 0u; i < params.length; i++) {
    let diff = input[offset + i] - mean;
    var_sum += diff * diff;
  }
  let variance = var_sum / f32(params.length);
  let inv_std = 1.0 / sqrt(variance + params.eps);

  // Normalize (no scale/bias for instance norm in this model - AdaIN handles that)
  for (var i = 0u; i < params.length; i++) {
    output[offset + i] = (input[offset + i] - mean) * inv_std;
  }
}
`,Lt=`
@group(0) @binding(0) var<storage, read> normed: array<f32>;    // [C, L] - instance-normed input
@group(0) @binding(1) var<storage, read> style_fc: array<f32>;  // [2*C] - first C = scale, second C = bias
@group(0) @binding(2) var<storage, read_write> output: array<f32>; // [C, L]

struct Params {
  channels: u32,
  length: u32,
}
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let ch = idx / params.length;
  let pos = idx % params.length;

  if (ch >= params.channels) { return; }

  // AdaIN: (1 + gamma) * normed + beta \u2014 the +1 offset is universal across all AdaIN blocks
  // style_fc layout: [scale_0..scale_{C-1}, bias_0..bias_{C-1}]
  let scale = style_fc[ch];
  let bias = style_fc[params.channels + ch];
  output[idx] = normed[idx] * (scale + 1.0) + bias;
}
`,$t=`
@group(0) @binding(0) var<storage, read> normed: array<f32>;    // [rows, C]
@group(0) @binding(1) var<storage, read> style_fc: array<f32>;  // [2*C]
@group(0) @binding(2) var<storage, read_write> output: array<f32>; // [rows, C]

struct Params {
  channels: u32,
  total: u32,
}
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.total) { return; }

  // Row-major: channel = idx % channels
  let ch = idx % params.channels;
  let scale = style_fc[ch];
  let bias = style_fc[params.channels + ch];
  output[idx] = normed[idx] * (scale + 1.0) + bias;
}
`,Ot=`
@group(0) @binding(0) var<storage, read> input: array<f32>;     // [C, L]
@group(0) @binding(1) var<storage, read> alpha: array<f32>;     // [C] (flattened from [1, C, 1])
@group(0) @binding(2) var<storage, read_write> output: array<f32>; // [C, L]

struct Params {
  channels: u32,
  length: u32,
}
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let ch = idx / params.length;
  let pos = idx % params.length;

  if (ch >= params.channels) { return; }

  let x = input[idx];
  let a = alpha[ch];
  let sin_ax = sin(a * x);
  // Snake: x + (1/a) * sin\xB2(a * x)
  output[idx] = x + sin_ax * sin_ax / a;
}
`,Nt=`
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

struct Params {
  size: u32,
  alpha: f32,
}
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.size) { return; }
  let x = input[idx];
  output[idx] = select(params.alpha * x, x, x >= 0.0);
}
`,It=`
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

struct Params {
  size: u32,
}
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.size) { return; }
  let x = input[idx];
  // GELU approximation: 0.5 * x * (1 + tanh(sqrt(2/pi) * (x + 0.044715 * x^3)))
  // Clamp tanh arg to prevent exp(2x) overflow in f32 (exp overflows at ~88.72)
  let c = 0.7978845608; // sqrt(2/pi)
  let inner = clamp(c * (x + 0.044715 * x * x * x), -44.0, 44.0);
  output[idx] = 0.5 * x * (1.0 + tanh(inner));
}
`,qt=`
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

struct Params { size: u32 }
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.size) { return; }
  output[idx] = tanh(input[idx]);
}
`,Rt=`
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

struct Params { size: u32 }
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.size) { return; }
  output[idx] = 1.0 / (1.0 + exp(-input[idx]));
}
`,Ft=`
@group(0) @binding(0) var<storage, read> input: array<f32>;     // [C_in, L_in]
@group(0) @binding(1) var<storage, read> weight: array<f32>;    // [C_in, C_out, K]
@group(0) @binding(2) var<storage, read> bias: array<f32>;      // [C_out]
@group(0) @binding(3) var<storage, read_write> output: array<f32>; // [C_out, L_out]

struct Params {
  in_channels: u32,
  out_channels: u32,
  kernel_size: u32,
  input_length: u32,
  output_length: u32,
  stride: u32,
  padding: u32,
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
      // ConvTranspose: output[out_pos] += input[in_pos] * weight[ic, out_ch, k]
      // where out_pos = in_pos * stride + k - padding
      // so in_pos = (out_pos + padding - k) / stride
      let numerator = i32(out_pos) + i32(params.padding) - i32(k);
      if (numerator >= 0 && u32(numerator) % params.stride == 0u) {
        let in_pos = u32(numerator) / params.stride;
        if (in_pos < params.input_length) {
          let w_idx = ic * params.out_channels * params.kernel_size + out_ch * params.kernel_size + k;
          let in_idx = ic * params.input_length + in_pos;
          sum += input[in_idx] * weight[w_idx];
        }
      }
    }
  }

  if (params.use_bias != 0u) {
    sum += bias[out_ch];
  }

  output[out_ch * params.output_length + out_pos] = sum;
}
`,Ht=`
@group(0) @binding(0) var<storage, read> input: array<f32>;     // [channels, L_in]
@group(0) @binding(1) var<storage, read> weight: array<f32>;    // [channels, 1, K] = [channels * K]
@group(0) @binding(2) var<storage, read_write> output: array<f32>; // [channels, L_out]

struct Params {
  channels: u32,
  kernel_size: u32,
  input_length: u32,
  output_length: u32,
  stride: u32,
  padding: u32,
}
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let ch = idx / params.output_length;
  let out_pos = idx % params.output_length;

  if (ch >= params.channels) { return; }

  var sum = 0.0;
  for (var k = 0u; k < params.kernel_size; k++) {
    let numerator = i32(out_pos) + i32(params.padding) - i32(k);
    if (numerator >= 0 && u32(numerator) % params.stride == 0u) {
      let in_pos = u32(numerator) / params.stride;
      if (in_pos < params.input_length) {
        let w_idx = ch * params.kernel_size + k;
        let in_idx = ch * params.input_length + in_pos;
        sum += input[in_idx] * weight[w_idx];
      }
    }
  }

  output[ch * params.output_length + out_pos] = sum;
}
`,jt=`
@group(0) @binding(0) var<storage, read> input: array<f32>;      // [channels, L_in]
@group(0) @binding(1) var<storage, read_write> output: array<f32>; // [channels, L_out]

struct Params {
  channels: u32,
  input_length: u32,
  output_length: u32,
}
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let ch = idx / params.output_length;
  let out_pos = idx % params.output_length;

  if (ch >= params.channels) { return; }

  // Nearest neighbor: map output position to input position
  let in_pos = out_pos * params.input_length / params.output_length;
  output[ch * params.output_length + out_pos] = input[ch * params.input_length + in_pos];
}
`,Kt=`
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

struct Params {
  batch_size: u32,
  dim_size: u32,
}
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let batch_idx = gid.x;
  if (batch_idx >= params.batch_size) { return; }

  let offset = batch_idx * params.dim_size;

  // Find max for numerical stability
  var max_val = input[offset];
  for (var i = 1u; i < params.dim_size; i++) {
    max_val = max(max_val, input[offset + i]);
  }

  // Compute exp and sum
  var exp_sum = 0.0;
  for (var i = 0u; i < params.dim_size; i++) {
    let e = exp(input[offset + i] - max_val);
    output[offset + i] = e;
    exp_sum += e;
  }

  // Normalize
  for (var i = 0u; i < params.dim_size; i++) {
    output[offset + i] /= exp_sum;
  }
}
`,Vt=`
@group(0) @binding(0) var<storage, read> Q: array<f32>;  // [seq_len, num_heads, head_dim]
@group(0) @binding(1) var<storage, read> K: array<f32>;  // [seq_len, num_heads, head_dim]
@group(0) @binding(2) var<storage, read> V: array<f32>;  // [seq_len, num_heads, head_dim]
@group(0) @binding(3) var<storage, read_write> output: array<f32>; // [seq_len, num_heads, head_dim]

struct Params {
  seq_len: u32,
  num_heads: u32,
  head_dim: u32,
  scale: f32,  // 1/sqrt(head_dim)
}
@group(0) @binding(4) var<uniform> params: Params;

// Workgroup: one per (head, query_pos). Threads iterate over key positions.
// We use a simple approach: each thread computes one output element (head_dim index).

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  // gid.x = dim_idx within head, gid.y = head_idx * seq_len + query_pos
  let dim_idx = gid.x;
  let head_query = gid.y;
  let head_idx = head_query / params.seq_len;
  let q_pos = head_query % params.seq_len;

  if (dim_idx >= params.head_dim || head_idx >= params.num_heads) { return; }

  let hd = params.head_dim;
  let nh = params.num_heads;
  let sl = params.seq_len;

  // Q vector for this (q_pos, head): Q[q_pos * nh * hd + head_idx * hd + ...]
  let q_base = q_pos * nh * hd + head_idx * hd;

  // Compute attention scores: dot(Q[q_pos, head], K[k_pos, head]) for all k_pos
  // Then softmax and weighted sum of V
  // Since we can't do cross-thread softmax easily, each thread computes full attention
  // for one output dimension. This is O(seq_len * head_dim) per thread but simple.

  // Step 1: Compute all attention scores (each thread does this redundantly)
  // For short sequences (< 512) this is fine
  var max_score = -1e10;
  for (var k = 0u; k < sl; k++) {
    let k_base = k * nh * hd + head_idx * hd;
    var score = 0.0;
    for (var d = 0u; d < hd; d++) {
      score += Q[q_base + d] * K[k_base + d];
    }
    score *= params.scale;
    max_score = max(max_score, score);
  }

  // Step 2: Softmax
  var exp_sum = 0.0;
  var weighted_val = 0.0;
  for (var k = 0u; k < sl; k++) {
    let k_base = k * nh * hd + head_idx * hd;
    var score = 0.0;
    for (var d = 0u; d < hd; d++) {
      score += Q[q_base + d] * K[k_base + d];
    }
    score *= params.scale;
    let w = exp(score - max_score);
    exp_sum += w;

    // Accumulate V[k_pos, head, dim_idx] weighted by attention
    let v_base = k * nh * hd + head_idx * hd;
    weighted_val += w * V[v_base + dim_idx];
  }

  let out_idx = q_pos * nh * hd + head_idx * hd + dim_idx;
  output[out_idx] = weighted_val / exp_sum;
}
`,Qt=`
// Tiled matmul + GELU with shared memory.

const TILE: u32 = 16u;

@group(0) @binding(0) var<storage, read> A: array<f32>;
@group(0) @binding(1) var<storage, read> B: array<f32>;
@group(0) @binding(2) var<storage, read> bias: array<f32>;
@group(0) @binding(3) var<storage, read_write> output: array<f32>;

struct Params {
  M: u32,
  K: u32,
  N: u32,
}
@group(0) @binding(4) var<uniform> params: Params;

var<workgroup> tileA: array<f32, 256>;
var<workgroup> tileB: array<f32, 256>;

@compute @workgroup_size(16, 16)
fn main(
  @builtin(global_invocation_id) gid: vec3<u32>,
  @builtin(local_invocation_id) lid: vec3<u32>,
) {
  let row = gid.x;
  let col = gid.y;
  let lr = lid.x;
  let lc = lid.y;

  var sum = 0.0;
  let numTiles = (params.K + TILE - 1u) / TILE;

  for (var t = 0u; t < numTiles; t++) {
    let aCol = t * TILE + lc;
    if (row < params.M && aCol < params.K) {
      tileA[lr * TILE + lc] = A[row * params.K + aCol];
    } else {
      tileA[lr * TILE + lc] = 0.0;
    }

    let bRow = t * TILE + lr;
    if (bRow < params.K && col < params.N) {
      tileB[lr * TILE + lc] = B[bRow * params.N + col];
    } else {
      tileB[lr * TILE + lc] = 0.0;
    }

    workgroupBarrier();

    for (var k = 0u; k < TILE; k++) {
      sum += tileA[lr * TILE + k] * tileB[k * TILE + lc];
    }

    workgroupBarrier();
  }

  if (row < params.M && col < params.N) {
    sum += bias[col];
    // GELU activation (clamp tanh arg to prevent f32 exp overflow)
    let c = 0.7978845608;
    let x = sum;
    let inner = clamp(c * (x + 0.044715 * x * x * x), -44.0, 44.0);
    output[row * params.N + col] = 0.5 * x * (1.0 + tanh(inner));
  }
}
`,Xt=`
@group(0) @binding(0) var<storage, read> a: array<f32>;
@group(0) @binding(1) var<storage, read> b: array<f32>;
@group(0) @binding(2) var<storage, read_write> output: array<f32>;

struct Params { size: u32 }
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.size) { return; }
  output[idx] = a[idx] + b[idx];
}
`,Yt=`
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

struct Params {
  size: u32,
  _pad1: u32,
  scale: f32,
}
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  if (idx >= params.size) { return; }
  output[idx] = input[idx] * params.scale;
}
`,Zt=`
@group(0) @binding(0) var<storage, read> a: array<f32>;      // [C_a, L]
@group(0) @binding(1) var<storage, read> b: array<f32>;      // [C_b, L]
@group(0) @binding(2) var<storage, read_write> output: array<f32>; // [C_a + C_b, L]

struct Params {
  channels_a: u32,
  channels_b: u32,
  length: u32,
}
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = (params.channels_a + params.channels_b) * params.length;
  if (idx >= total) { return; }

  let ch = idx / params.length;
  let pos = idx % params.length;

  if (ch < params.channels_a) {
    output[idx] = a[ch * params.length + pos];
  } else {
    output[idx] = b[(ch - params.channels_a) * params.length + pos];
  }
}
`,Jt=`
@group(0) @binding(0) var<storage, read> a: array<f32>;      // [rows, cols_a]
@group(0) @binding(1) var<storage, read> b: array<f32>;      // [cols_b] \u2014 broadcast to every row
@group(0) @binding(2) var<storage, read_write> output: array<f32>; // [rows, cols_a + cols_b]

struct Params {
  rows: u32,
  cols_a: u32,
  cols_b: u32,
}
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total_cols = params.cols_a + params.cols_b;
  let total = params.rows * total_cols;
  if (idx >= total) { return; }

  let row = idx / total_cols;
  let col = idx % total_cols;

  if (col < params.cols_a) {
    output[idx] = a[row * params.cols_a + col];
  } else {
    output[idx] = b[col - params.cols_a];
  }
}
`,er=`
@group(0) @binding(0) var<storage, read> input: array<f32>;      // [channels, L_in]
@group(0) @binding(1) var<storage, read_write> output: array<f32>; // [channels, L_out]

struct Params {
  channels: u32,
  input_length: u32,
  pad_left: u32,
  pad_right: u32,
}
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let out_length = params.input_length + params.pad_left + params.pad_right;
  let ch = idx / out_length;
  let out_pos = idx % out_length;

  if (ch >= params.channels) { return; }

  var in_pos: u32;
  if (out_pos < params.pad_left) {
    // Reflected left: position 0 -> pad_left, position 1 -> pad_left-1, etc.
    in_pos = params.pad_left - out_pos;
  } else if (out_pos >= params.pad_left + params.input_length) {
    // Reflected right
    let overshoot = out_pos - params.pad_left - params.input_length;
    in_pos = params.input_length - 2u - overshoot;
  } else {
    in_pos = out_pos - params.pad_left;
  }

  output[ch * out_length + out_pos] = input[ch * params.input_length + in_pos];
}
`,tr=`
@group(0) @binding(0) var<storage, read> current: array<f32>;    // conv2 output
@group(0) @binding(1) var<storage, read> residual: array<f32>;   // residual from previous iteration
@group(0) @binding(2) var<storage, read> alpha: array<f32>;      // [1, channels, 1] per-channel alpha
@group(0) @binding(3) var<storage, read_write> output: array<f32>;

struct Params {
  channels: u32,
  length: u32,
}
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let ch = idx / params.length;
  if (ch >= params.channels) { return; }

  // output = current + alpha[ch] * residual
  output[idx] = current[idx] + alpha[ch] * residual[idx];
}
`,rr=`
@group(0) @binding(0) var<storage, read> input: array<f32>;
@group(0) @binding(1) var<storage, read_write> output: array<f32>;

struct Params { rows: u32, cols: u32 }
@group(0) @binding(2) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.rows * params.cols;
  if (idx >= total) { return; }

  let row = idx / params.cols;
  let col = idx % params.cols;
  output[col * params.rows + row] = input[idx];
}
`,ir=`
@group(0) @binding(0) var<storage, read> input: array<f32>;   // [seq_len, input_size]
@group(0) @binding(1) var<storage, read> W: array<f32>;       // [num_dir, input_size, 4*hidden]
@group(0) @binding(2) var<storage, read> R: array<f32>;       // [num_dir, hidden, 4*hidden]
@group(0) @binding(3) var<storage, read> bias: array<f32>;    // [num_dir, 8*hidden]
@group(0) @binding(4) var<storage, read_write> output: array<f32>; // [seq_len, num_dir, hidden]

struct Params {
  seq_len: u32,
  input_size: u32,
  hidden_size: u32,
  num_directions: u32,
}
@group(0) @binding(5) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let h_idx = gid.x; // which hidden unit
  let dir = gid.y; // 0=forward, 1=backward
  // NOTE: no early return \u2014 all threads in workgroup must reach storageBarrier()
  let is_valid = h_idx < params.hidden_size && dir < params.num_directions;

  let H = params.hidden_size;
  let H4 = H * 4u;
  let IS = params.input_size;
  let SL = params.seq_len;

  // Use safe indices for inactive threads (they won't write)
  let safe_h = select(0u, h_idx, is_valid);
  let safe_dir = select(0u, dir, is_valid);

  // Gate offsets within 4*hidden: i=0, o=1, f=2, c=3 (ONNX order)
  let gate_i = safe_h;
  let gate_o = H + safe_h;
  let gate_f = 2u * H + safe_h;
  let gate_c = 3u * H + safe_h;

  // Bias offsets: [Wb_i, Wb_o, Wb_f, Wb_c, Rb_i, Rb_o, Rb_f, Rb_c]
  let bias_base = safe_dir * 8u * H;
  var b_wi = 0.0; var b_wo = 0.0; var b_wf = 0.0; var b_wc = 0.0;
  var b_ri = 0.0; var b_ro = 0.0; var b_rf = 0.0; var b_rc = 0.0;
  if (is_valid) {
    b_wi = bias[bias_base + safe_h];
    b_wo = bias[bias_base + H + safe_h];
    b_wf = bias[bias_base + 2u * H + safe_h];
    b_wc = bias[bias_base + 3u * H + safe_h];
    b_ri = bias[bias_base + 4u * H + safe_h];
    b_ro = bias[bias_base + 5u * H + safe_h];
    b_rf = bias[bias_base + 6u * H + safe_h];
    b_rc = bias[bias_base + 7u * H + safe_h];
  }

  var h_val = 0.0; // hidden state for this unit
  var c_val = 0.0; // cell state for this unit

  // Weight base offsets for this direction
  // W: [num_dir, IS, 4H] \u2014 flat stride: dir * IS * H4
  // R: [num_dir, H, 4H]  \u2014 flat stride: dir * H * H4
  let w_base = safe_dir * IS * H4;
  let r_base = safe_dir * H * H4;

  for (var step = 0u; step < SL; step++) {
    if (is_valid) {
      // Forward: t=step, Backward: t=SL-1-step
      let t = select(SL - 1u - step, step, safe_dir == 0u);

      // Compute gates from input: sum over input_size
      var gi = b_wi + b_ri;
      var go = b_wo + b_ro;
      var gf = b_wf + b_rf;
      var gc = b_wc + b_rc;

      // Input contribution: W[dir, j, gate*H+h_idx] \u2014 layout [IS, 4H]
      // x[j] * W[w_base + j * H4 + gate_offset]
      for (var j = 0u; j < IS; j++) {
        let x_val = input[t * IS + j];
        let w_off = w_base + j * H4;
        gi += x_val * W[w_off + gate_i];
        go += x_val * W[w_off + gate_o];
        gf += x_val * W[w_off + gate_f];
        gc += x_val * W[w_off + gate_c];
      }

      // Recurrence contribution: R[dir, j, gate*H+h_idx] \u2014 layout [H, 4H]
      // h_prev[j] * R[r_base + j * H4 + gate_offset]
      if (step > 0u) {
        let prev_t = select(SL - step, step - 1u, safe_dir == 0u);
        let prev_base = prev_t * params.num_directions * H + safe_dir * H;
        for (var j = 0u; j < H; j++) {
          let h_prev = output[prev_base + j];
          let r_off = r_base + j * H4;
          gi += h_prev * R[r_off + gate_i];
          go += h_prev * R[r_off + gate_o];
          gf += h_prev * R[r_off + gate_f];
          gc += h_prev * R[r_off + gate_c];
        }
      }

      // Apply activations
      // Clamp sigmoid inputs to avoid exp overflow (exp(88.72) > f32 max)
      let i_gate = 1.0 / (1.0 + exp(-clamp(gi, -44.0, 44.0))); // sigmoid
      let o_gate = 1.0 / (1.0 + exp(-clamp(go, -44.0, 44.0)));
      let f_gate = 1.0 / (1.0 + exp(-clamp(gf, -44.0, 44.0)));
      // Clamp tanh inputs: tanh uses exp(2x), so |x| > 44 \u2192 exp(88) \u2192 Inf \u2192 NaN
      let c_gate = tanh(clamp(gc, -44.0, 44.0));

      c_val = f_gate * c_val + i_gate * c_gate;
      h_val = o_gate * tanh(clamp(c_val, -44.0, 44.0));

      // Write output: [t, dir, h_idx] \u2192 flat: t * num_dir * H + dir * H + h_idx
      output[t * params.num_directions * H + safe_dir * H + safe_h] = h_val;
    }

    // Barrier: all threads (active and inactive) must reach this point
    // storageBarrier() ensures visibility of storage buffer writes across threads in the workgroup
    storageBarrier();
  }
}
`,sr=`
@group(0) @binding(0) var<storage, read> input: array<f32>;      // [seq_len, dim]
@group(0) @binding(1) var<storage, read> cumsum: array<u32>;     // [seq_len] prefix sum of durations
@group(0) @binding(2) var<storage, read_write> output: array<f32>; // [total_frames, dim]

struct Params {
  seq_len: u32,
  dim: u32,
  total_frames: u32,
}
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.total_frames * params.dim;
  if (idx >= total) { return; }

  let frame = idx / params.dim;
  let d = idx % params.dim;

  // Binary search: find token i where cumsum[i-1] <= frame < cumsum[i]
  var lo: u32 = 0u;
  var hi: u32 = params.seq_len;
  while (lo < hi) {
    let mid = (lo + hi) / 2u;
    if (cumsum[mid] <= frame) {
      lo = mid + 1u;
    } else {
      hi = mid;
    }
  }
  let token = lo;

  output[idx] = input[token * params.dim + d];
}
`,ar=`
@group(0) @binding(0) var<storage, read> input: array<f32>;      // [seq_len, dim] row-major
@group(0) @binding(1) var<storage, read> cumsum: array<u32>;     // [seq_len] prefix sum of durations
@group(0) @binding(2) var<storage, read_write> output: array<f32>; // [dim, total_frames] channel-first

struct Params {
  seq_len: u32,
  dim: u32,
  total_frames: u32,
}
@group(0) @binding(3) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.total_frames * params.dim;
  if (idx >= total) { return; }

  // Output layout: [dim, total_frames] \u2014 idx = channel * total_frames + frame
  let channel = idx / params.total_frames;
  let frame = idx % params.total_frames;

  // Binary search: find token i where cumsum[i-1] <= frame < cumsum[i]
  var lo: u32 = 0u;
  var hi: u32 = params.seq_len;
  while (lo < hi) {
    let mid = (lo + hi) / 2u;
    if (cumsum[mid] <= frame) {
      lo = mid + 1u;
    } else {
      hi = mid;
    }
  }
  let token = lo;

  output[idx] = input[token * params.dim + channel];
}
`,nr=`
// iSTFT synthesis: conv_post [22, genLength] \u2192 waveform [waveformLength]
// Gather-based ConvTranspose: each thread computes one output sample
// Fuses: magnitude/phase split, exp, sin(sin(ph)), cos(sin(ph)), ConvTranspose scatter

@group(0) @binding(0) var<storage, read> conv_post: array<f32>;    // [22, gen_length]
@group(0) @binding(1) var<storage, read> weight_real: array<f32>;  // [11, 20]
@group(0) @binding(2) var<storage, read> weight_imag: array<f32>;  // [11, 20]
@group(0) @binding(3) var<storage, read_write> output: array<f32>; // [waveform_length]

struct Params {
  gen_length: u32,
  waveform_length: u32,
  bins: u32,       // 11
  kernel_size: u32, // 20
  stride: u32,     // 5
}
@group(0) @binding(4) var<uniform> params: Params;

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let out_pos = gid.x;
  if (out_pos >= params.waveform_length) { return; }

  var sum: f32 = 0.0;

  // For each kernel tap, check if this output position has a contribution
  for (var k: u32 = 0u; k < params.kernel_size; k = k + 1u) {
    if (out_pos < k) { continue; }
    let rem = out_pos - k;
    if (rem % params.stride != 0u) { continue; }
    let t = rem / params.stride;
    if (t >= params.gen_length) { continue; }

    // For each frequency bin, compute magnitude/phase and accumulate
    for (var b: u32 = 0u; b < params.bins; b = b + 1u) {
      let mag_val = conv_post[b * params.gen_length + t];
      let ph_val = conv_post[(b + params.bins) * params.gen_length + t];

      let mag = exp(mag_val);
      let sin_ph = sin(ph_val);
      let real_comp = mag * cos(sin_ph);
      let imag_comp = mag * sin(sin_ph);

      sum += real_comp * weight_real[b * params.kernel_size + k]
           - imag_comp * weight_imag[b * params.kernel_size + k];
    }
  }

  output[out_pos] = sum;
}
`;async function or(h){let i;try{i=await globalThis.caches?.open("narrate-kitten-models-v1");let t=await i?.match(h);if(t)return await t.arrayBuffer()}catch{}let s=await fetch(h);if(!s.ok)throw new Error("Model download failed: HTTP "+s.status);let e=await s.arrayBuffer();try{await i?.put(h,new Response(e,{headers:{"Content-Type":"application/octet-stream"}}))}catch{}return e}var ut=class{device;weights=new Map;weightAliases=new Map;pipelines=new Map;voices=new Map;lstmHidden=256;lstmBidir=512;textEncChannels=512;styleDim=256;styleHalf=128;lstmInputSize=640;bertEmbedDim=128;bertHiddenSize=768;bertNumHeads=12;bertHeadDim=64;bertFfnDim=2048;bertNumLayers=12;numPredLstmPairs=3;bertProjDim=512;numTextEncCnnBlocks=3;decEncodeOutCh=1024;decDecodeOutCh=1024;decDecode3OutCh=512;hifiUps0OutCh=256;hifiUps1OutCh=128;predBlock0OutCh=512;predBlock1OutCh=256;config;pendingUniformBuffers=[];weightCache=new Map;pendingCommandBuffers=[];sharedEncoder=null;deferredDestroys=[];bufferPool=new Map;deferredPoolReturns=[];sinGenWeights=null;debugCapture=!1;debugActivations=new Map;debugBertBuffers=null;profile=!1;timings=new Map;_stageStart=0;constructor(i=Me){this.config=i}startStage(){this.profile&&(this._stageStart=performance.now())}async endStage(i){if(this.flushBatchEncoder(),this.profile){await this.device.queue.onSubmittedWorkDone();let s=performance.now()-this._stageStart;this.timings.set(i,s)}}lastTimings=[];printTimings(){if(!this.profile)return;this.lastTimings=[];let i=0,s=[];for(let[e,t]of this.timings)i+=t,this.lastTimings.push({name:e,ms:t}),s.push(`  ${e.padEnd(35)} ${t.toFixed(1).padStart(8)} ms`);console.log(`
[KittenTTS] \u2500\u2500 Timing Report \u2500\u2500`);for(let e of s)console.log(e);console.log(`  ${"\u2500".repeat(45)}`),console.log(`  ${"TOTAL".padEnd(35)} ${i.toFixed(1).padStart(8)} ms`),this.timings.clear()}async captureDebug(i,s,e){if(!this.debugCapture)return;this.endBatch();let t=e.reduce((o,a)=>o*a,1),r=await this.readBuffer(s,t);this.debugActivations.set(i,{data:r,shape:e});let u=1/0,n=-1/0,f=0;for(let o=0;o<r.length;o++){if(isNaN(r[o])){f++;continue}r[o]<u&&(u=r[o]),r[o]>n&&(n=r[o])}console.log(`[DEBUG] Captured ${i}: shape=[${e}], range=[${u}, ${n}], NaN=${f}/${r.length}`)}async init(){let i=await navigator.gpu?.requestAdapter();if(!i)throw new Error("WebGPU not available");let s=i.limits,e=Math.min(256*1024*1024,s.maxStorageBufferBindingSize),t=Math.min(256*1024*1024,s.maxBufferSize);console.log(`[KittenTTS] Adapter limits: maxStorageBuffer=${e}, maxBuffer=${t}`),this.device=await i.requestDevice({requiredLimits:{maxStorageBufferBindingSize:e,maxBufferSize:t}}),this.device.lost.then(r=>{console.error(`[KittenTTS] Device lost: ${r.reason} \u2014 ${r.message}`),globalThis.dispatchEvent(new CustomEvent("webgpu-device-lost",{detail:r}))}),this.device.addEventListener("uncapturederror",r=>{let u=r;console.error(`[KittenTTS] GPU error: ${u.error.message}`),globalThis.dispatchEvent(new CustomEvent("webgpu-error",{detail:u.error.message}))}),this.compileShaders(),console.log("[KittenTTS] WebGPU device initialized")}async loadModel(i,s){console.log("[KittenTTS] Loading model...");let e=await or(i),r=new Ce(e).parseInitializers();console.log(`[KittenTTS] Parsed ${r.size} weight tensors`);let u=o=>{let a;o.endsWith("_quantized")?a=o.slice(0,-10):a=o;let l=r.get(`${a}_scale`),c=r.get(`${a}_zero_point`),d=new Float32Array([1]),p=new Int32Array([0]);if(l&&l.rawData.length>=4){let m=l.rawData.length/4,g=new Uint8Array(m*4);g.set(l.rawData.subarray(0,m*4)),d=new Float32Array(g.buffer)}if(c&&c.rawData.length>=1){let m=c.dims.length===0?1:c.dims.reduce((_,B)=>_*B,1),g=c.rawData.length;if(g===m*4&&g!==m){let _=new Uint8Array(g);_.set(c.rawData.subarray(0,g));let B=new Int32Array(_.buffer);p=new Int32Array(m);for(let T=0;T<m;T++)p[T]=B[T]}else{let _=g;if(p=new Int32Array(_),c.dataType===3){let B=new Int8Array(c.rawData.buffer,c.rawData.byteOffset,_);for(let T=0;T<_;T++)p[T]=B[T]}else for(let B=0;B<_;B++)p[B]=c.rawData[B]}}return{scales:d,zeroPoints:p}};for(let[o,a]of r){if(o.endsWith("_scale")||o.endsWith("_zero_point"))continue;let l,c=a.dims.reduce((d,p)=>d*p,1);if(c!==0){if(a.rawData.length===0){console.warn(`[KittenTTS] Skipping ${o}: no raw data (dims=${a.dims}, dtype=${a.dataType})`);continue}try{switch(a.dataType){case 1:{let p=new Uint8Array(c*4);p.set(a.rawData.subarray(0,c*4)),l=new Float32Array(p.buffer);break}case 10:{let p=new Uint8Array(c*2);p.set(a.rawData.subarray(0,c*2)),l=ot(new Uint16Array(p.buffer));break}case 3:{let{scales:p,zeroPoints:m}=u(o);l=new Float32Array(c);let g=new Int8Array(a.rawData.buffer,a.rawData.byteOffset,c);if(p.length===1){let w=p[0],_=m[0];for(let B=0;B<c;B++)l[B]=(g[B]-_)*w}else{let w=c/p.length;for(let _=0;_<p.length;_++){let B=p[_],T=m[_],z=_*w;for(let D=0;D<w;D++)l[z+D]=(g[z+D]-T)*B}}p[0]!==1&&console.log(`[KittenTTS] Dequantized INT8 ${o}: scales=[${Array.from(p).map(w=>w.toFixed(6)).join(",")}]`);break}case 2:{let{scales:p,zeroPoints:m}=u(o);if(l=new Float32Array(c),p.length===1){let g=p[0],w=m[0];for(let _=0;_<c;_++)l[_]=(a.rawData[_]-w)*g}else{let g=c/p.length;for(let w=0;w<p.length;w++){let _=p[w],B=m[w],T=w*g;for(let z=0;z<g;z++)l[T+z]=(a.rawData[T+z]-B)*_}}console.log(`[KittenTTS] Dequantized UINT8 ${o}: scales=[${Array.from(p).map(g=>g.toFixed(6)).join(",")}], zp=[${Array.from(m).join(",")}], f32[0..5]=[${Array.from(l.subarray(0,5)).map(g=>g.toFixed(6)).join(",")}]`);break}case 7:continue;default:console.warn(`[KittenTTS] Skipping ${o}: unsupported dtype ${a.dataType}`);continue}let d=this.device.createBuffer({size:l.byteLength,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_DST|GPUBufferUsage.COPY_SRC,label:o});this.device.queue.writeBuffer(d,0,l),this.weights.set(o,{buffer:d,shape:a.dims,size:c})}catch(d){throw console.error(`[KittenTTS] Error processing tensor ${o} (dims=${a.dims}, dtype=${a.dataType}, rawLen=${a.rawData.length}, totalEl=${c}):`,d),d}}}console.log(`[KittenTTS] Uploaded ${this.weights.size} weight buffers to GPU`),this.weightCache.clear(),this.buildOnnxAliases(),this.detectDimensions();let n=await or(s),f=await At(n);for(let[o,{shape:a,data:l}]of f)this.voices.set(o,l),console.log(`[KittenTTS] Loaded voice: ${o} (${a})`);for(let[,o]of this.voices){this.styleDim=o.length/400,this.styleHalf=Math.floor(this.styleDim/2),this.lstmInputSize=this.lstmBidir+this.styleHalf,console.log(`[KittenTTS] Detected styleDim = ${this.styleDim}, styleHalf = ${this.styleHalf}, lstmInputSize = ${this.lstmInputSize}`);break}}buildOnnxAliases(){let i=[5883,5884,5887,5890,5894,5895,5896,6040,6245,6388],s=[5873,5874,5875,6093,6094,6095,6143,6144,6145,6193,6194,6195,6242,6243,6244,6291,6292,6293],e=[],t=[];for(let d of this.weights.keys()){let p=d.endsWith("_quantized")?d.slice(0,-10):d,m=p.match(/^onnx::MatMul_(\d+)$/);if(m){e.push({id:parseInt(m[1]),baseName:p});continue}let g=p.match(/^onnx::LSTM_(\d+)$/);if(g){t.push({id:parseInt(g[1]),baseName:p});continue}}e.sort((d,p)=>d.id-p.id),t.sort((d,p)=>d.id-p.id);let r=[...new Map(e.map(d=>[d.baseName,d])).values()],u=[...new Map(t.map(d=>[d.baseName,d])).values()];console.log(`[KittenTTS] Found ${r.length} MatMul weights, ${u.length} LSTM weights`);let n=(d,p)=>{if(d!==p){for(let m of["","_quantized"]){let g=d+m,w=p+m;this.weights.has(w)?this.weightAliases.set(g,w):this.weights.has(p)&&this.weightAliases.set(g,p)}console.log(`[KittenTTS] Alias: ${d} \u2192 ${p}`)}},f=Math.min(i.length,r.length);for(let d=0;d<f;d++)n(`onnx::MatMul_${i[d]}`,r[d].baseName);let o=u.length/3,a=s.length/3,l=o-3,c=a-3;for(let d=0;d<a;d++){let p;if(d===0)p=0;else if(d<=c)if(d<=l)p=d;else continue;else d===c+1?p=l+1:p=l+2;for(let m=0;m<3;m++){let g=d*3+m,w=p*3+m;g<s.length&&w<u.length&&n(`onnx::LSTM_${s[g]}`,u[w].baseName)}}}detectDimensions(){let i=this.weights.get("kmodel.text_encoder.embedding.weight");i&&(this.textEncChannels=i.shape[1],console.log(`[KittenTTS] Detected textEncChannels = ${this.textEncChannels}`));let s=this.tryGetWeight("onnx::LSTM_5875_quantized")||this.tryGetWeight("onnx::LSTM_5875");if(s&&s.shape.length===3){if(this.lstmHidden=s.shape[1],this.lstmBidir=2*this.lstmHidden,this.lstmHidden>256)throw new Error(`[KittenTTS] LSTM hidden size ${this.lstmHidden} exceeds shader workgroup limit of 256. Model not supported.`);console.log(`[KittenTTS] Detected lstmHidden = ${this.lstmHidden}, lstmBidir = ${this.lstmBidir}`)}let e=this.weights.get("kmodel.bert.embeddings.word_embeddings.weight");e&&(this.bertEmbedDim=e.shape[1],console.log(`[KittenTTS] Detected bertEmbedDim = ${this.bertEmbedDim}`));let t=this.weights.get("kmodel.bert.encoder.embedding_hidden_mapping_in.bias");t&&(this.bertHiddenSize=t.size,console.log(`[KittenTTS] Detected bertHiddenSize = ${this.bertHiddenSize}`));let r=this.weights.get("kmodel.bert.encoder.albert_layer_groups.0.albert_layers.0.attention.LayerNorm.weight");r&&(this.bertHiddenSize=r.size),this.bertHeadDim=64,this.bertNumHeads=Math.floor(this.bertHiddenSize/this.bertHeadDim),this.bertNumHeads<1&&(this.bertNumHeads=1),console.log(`[KittenTTS] Detected bertNumHeads = ${this.bertNumHeads}, bertHeadDim = ${this.bertHeadDim}`);let u=this.weights.get("kmodel.bert.encoder.albert_layer_groups.0.albert_layers.0.ffn.bias");u&&(this.bertFfnDim=u.size,console.log(`[KittenTTS] Detected bertFfnDim = ${this.bertFfnDim}`));let n=this.weights.get("kmodel.bert_encoder.bias");n&&(this.bertProjDim=n.size,console.log(`[KittenTTS] Detected bertProjDim = ${this.bertProjDim}`));for(let[,m]of this.voices){this.styleDim=m.length/400,this.styleHalf=Math.floor(this.styleDim/2),console.log(`[KittenTTS] Detected styleDim = ${this.styleDim}, styleHalf = ${this.styleHalf}`);break}this.lstmInputSize=this.lstmBidir+this.styleHalf,console.log(`[KittenTTS] Computed lstmInputSize = ${this.lstmInputSize}`),this.numPredLstmPairs=0;for(let m=0;m<10;m++){let g=`kmodel.predictor.text_encoder.lstms.${2*m+1}.fc.weight_quantized`;if(this.tryGetWeight(g))this.numPredLstmPairs=m+1;else break}console.log(`[KittenTTS] Detected numPredLstmPairs = ${this.numPredLstmPairs}`),this.numTextEncCnnBlocks=0;for(let m=0;m<10&&(this.tryGetWeight(`kmodel.text_encoder.cnn.${m}.0.weight_quantized`)||this.tryGetWeight(`kmodel.text_encoder.cnn.${m}.0.bias`));m++)this.numTextEncCnnBlocks=m+1;console.log(`[KittenTTS] Detected numTextEncCnnBlocks = ${this.numTextEncCnnBlocks}`);let f=this.weights.get("kmodel.decoder.encode.conv2.bias");f&&(this.decEncodeOutCh=f.size,console.log(`[KittenTTS] Detected decEncodeOutCh = ${this.decEncodeOutCh}`));let o=this.weights.get("kmodel.decoder.decode.0.conv2.bias");o&&(this.decDecodeOutCh=o.size,console.log(`[KittenTTS] Detected decDecodeOutCh = ${this.decDecodeOutCh}`));let a=this.weights.get("kmodel.decoder.decode.3.conv2.bias");a&&(this.decDecode3OutCh=a.size,console.log(`[KittenTTS] Detected decDecode3OutCh = ${this.decDecode3OutCh}`));let l=this.weights.get("kmodel.decoder.generator.ups.0.bias");l&&(this.hifiUps0OutCh=l.size,console.log(`[KittenTTS] Detected hifiUps0OutCh = ${this.hifiUps0OutCh}`));let c=this.weights.get("kmodel.decoder.generator.ups.1.bias");c&&(this.hifiUps1OutCh=c.size,console.log(`[KittenTTS] Detected hifiUps1OutCh = ${this.hifiUps1OutCh}`));let d=this.weights.get("kmodel.predictor.N.0.conv1.bias");d&&(this.predBlock0OutCh=d.size,console.log(`[KittenTTS] Detected predBlock0OutCh = ${this.predBlock0OutCh}`));let p=this.weights.get("kmodel.predictor.N.1.conv1.bias");p&&(this.predBlock1OutCh=p.size,console.log(`[KittenTTS] Detected predBlock1OutCh = ${this.predBlock1OutCh}`))}tryGetWeight(i){let s=this.weights.get(i);if(s)return s;let e=this.weightAliases.get(i);if(e&&(s=this.weights.get(e),s))return s;if(i.endsWith("_quantized")){let t=i.slice(0,-10);if(s=this.weights.get(t),s)return s;let r=this.weightAliases.get(t);if(r)return this.weights.get(r)||null}else{if(s=this.weights.get(i+"_quantized"),s)return s;let t=this.weightAliases.get(i+"_quantized");if(t)return this.weights.get(t)||null}return null}async generate(i,s="Bella",e=1,t,r){await this.device.queue.onSubmittedWorkDone();let u=this.config.voiceAliases[s]||s,n=this.voices.get(u);if(!n)throw new Error(`Voice not found: ${s} (${u})`);let f=Math.min(t??i.length,399),o=n.subarray(f*this.styleDim,(f+1)*this.styleDim),a=this.createBuffer(new Int32Array(i),"input_ids",GPUBufferUsage.STORAGE),l=this.createBuffer(o,"style",GPUBufferUsage.STORAGE),c=this.createBuffer(new Float32Array([e]),"speed",GPUBufferUsage.STORAGE),d=i.length;this.startStage(),r?.("1/8 BERT embedding"),console.log("[KittenTTS] Running BERT embedding...");let p=this.requireWeight("kmodel.bert.embeddings.word_embeddings.weight"),m=this.requireWeight("kmodel.bert.embeddings.position_embeddings.weight"),g=this.requireWeight("kmodel.bert.embeddings.token_type_embeddings.weight"),w=this.bertEmbedDim,_=this.createEmptyBuffer(d*w,"bert_embedding");this.dispatchEmbedding(p.buffer,a,_,d,w,178),await this.captureDebug("/bert/embeddings/word_embeddings/Gather_output_0",_,[1,d,w]);let B=this.createBuffer(new Int32Array(d),"token_type_ids",GPUBufferUsage.STORAGE),T=this.createEmptyBuffer(d*w,"token_type_embedding");this.dispatchEmbedding(g.buffer,B,T,d,w,2);let z=this.createEmptyBuffer(d*w,"bert_emb_wtt");this.dispatchAdd(_,T,z,d*w);let D=this.createBuffer(new Int32Array(Array.from({length:d},(y,q)=>Math.min(q,511))),"pos_ids",GPUBufferUsage.STORAGE),W=this.createEmptyBuffer(d*w,"pos_embedding");this.dispatchEmbedding(m.buffer,D,W,d,w,512);let M=this.createEmptyBuffer(d*w,"bert_emb_sum");this.dispatchAdd(z,W,M,d*w),await this.captureDebug("bert/emb_sum",M,[1,d,w]),await this.endStage("BERT embedding"),this.startStage(),r?.("2/8 ALBERT encoder"),console.log("[KittenTTS] Running ALBERT encoder..."),this.flushBatchEncoder();let v=this.runBertEncoder(a,M,d);if(console.log(`[KittenTTS] BERT encoder output: [1, ${d}, ${this.bertHiddenSize}]`),this.debugBertBuffers){let y=this.debugBertBuffers;await this.captureDebug("bert/emb_ln",y.normedEmb,[1,y.seqLen,y.embedDim]),y.projected&&await this.captureDebug("bert/proj_128_768",y.projected,[1,y.seqLen,y.hiddenSize]);for(let[q,F]of y.layerBuffers)q==="attn_ln_0"?await this.captureDebug("bert/attn_ln_0",F,[1,y.seqLen,y.hiddenSize]):q==="hidden_1"?await this.captureDebug("bert/full_ln_0",F,[1,y.seqLen,y.hiddenSize]):q==="hidden_2"&&await this.captureDebug("bert/full_ln_1",F,[1,y.seqLen,y.hiddenSize]);await this.captureDebug("bert/final",y.hidden,[1,y.seqLen,y.hiddenSize])}await this.endStage("ALBERT encoder (12 iters)"),this.startStage(),r?.("3/8 Text encoder"),console.log("[KittenTTS] Running text encoder...");let S=await this.runTextEncoder(a,d);console.log(`[KittenTTS] Text encoder output: [${d}, 2, ${this.lstmHidden}]`),await this.endStage("Text encoder (CNN+LSTM)"),this.startStage(),r?.("4/8 Predictor encoder"),console.log("[KittenTTS] Running predictor text encoder...");let b=this.requireWeight("onnx::MatMul_6040_quantized"),P=this.requireWeight("kmodel.bert_encoder.bias"),A=this.createEmptyBuffer(d*this.bertProjDim,"bert_proj");this.dispatchMatmul(v,b.buffer,P.buffer,A,d,this.bertHiddenSize,this.bertProjDim,!0),await this.captureDebug("bert/encoder_proj",A,[1,d,this.bertProjDim]);let x=[{W:"onnx::LSTM_6094_quantized",R:"onnx::LSTM_6095_quantized",B:"onnx::LSTM_6093"},{W:"onnx::LSTM_6144_quantized",R:"onnx::LSTM_6145_quantized",B:"onnx::LSTM_6143"},{W:"onnx::LSTM_6194_quantized",R:"onnx::LSTM_6195_quantized",B:"onnx::LSTM_6193"}],O=[{weight:"kmodel.predictor.text_encoder.lstms.1.fc.weight_quantized",bias:"kmodel.predictor.text_encoder.lstms.1.fc.bias"},{weight:"kmodel.predictor.text_encoder.lstms.3.fc.weight_quantized",bias:"kmodel.predictor.text_encoder.lstms.3.fc.bias"},{weight:"kmodel.predictor.text_encoder.lstms.5.fc.weight_quantized",bias:"kmodel.predictor.text_encoder.lstms.5.fc.bias"}],j=o.subarray(this.styleHalf,this.styleDim),$=this.createBuffer(j,"style_pred",GPUBufferUsage.STORAGE),C=this.createBuffer(o.subarray(0,this.styleHalf),"style_dec",GPUBufferUsage.STORAGE),U=[A],R=A;for(let y=0;y<this.numPredLstmPairs;y++){let q=x[y],F=O[y],V=this.lstmInputSize,tt=this.lstmHidden,jr=this.requireWeight(q.W),Kr=this.requireWeight(q.R),Vr=this.requireWeight(q.B),rt=this.createEmptyBuffer(d*V,`pred_lstm${y}_in`);this.dispatchConcatBroadcast(R,$,rt,d,this.lstmBidir,this.styleHalf);let xe=this.createEmptyBuffer(d*2*tt,`pred_lstm${y}_out`);this.dispatchLSTM(rt,jr.buffer,Kr.buffer,Vr.buffer,xe,d,V,tt,2),U.push(rt);let Qr=2*y;await this.captureDebug(`/text_encoder/lstms.${Qr}/LSTM_output_0`,xe,[d,2,1,tt]);let Xr=this.requireWeight(F.weight),Gt=this.requireWeight(F.bias),it=Gt.size,ze=this.createEmptyBuffer(it,`pred_fc${y}_out`);this.dispatchMatmul($,Xr.buffer,Gt.buffer,ze,1,this.styleHalf,it,!0),await this.captureDebug(`/text_encoder/lstms.${2*y+1}/fc/Gemm_output_0`,ze,[1,it]);let De=2*y+1,st=`kmodel.predictor.text_encoder.lstms.${De}.norm.weight`,Et=`kmodel.predictor.text_encoder.lstms.${De}.norm.bias`;this.weights.has(st)||(st=`/text_encoder/lstms.${De}/Constant_7_output_0`,Et=`/text_encoder/lstms.${De}/Constant_8_output_0`);let Yr=this.requireWeight(st),Zr=this.requireWeight(Et),at=this.createEmptyBuffer(d*this.lstmBidir,`pred_ln${y}_out`);this.dispatchLayerNorm(xe,Yr.buffer,Zr.buffer,at,d,this.lstmBidir,1e-5),U.push(xe);let nt=this.createEmptyBuffer(d*this.lstmBidir,`pred_adain${y}_out`);this.dispatchAdaINRowMajor(at,ze,nt,this.lstmBidir,d),U.push(at,ze),await this.captureDebug(`/text_encoder/lstms.${2*y+1}/Add_2_output_0`,nt,[1,d,this.lstmBidir]),U.push(R),R=nt,U.push(xe)}console.log(`[KittenTTS] Predictor text encoder output: [${d}, ${this.lstmBidir}]`),await this.endStage("Predictor text encoder"),this.startStage(),r?.("5/8 Duration predictor"),console.log("[KittenTTS] Running duration predictor...");let N=this.createEmptyBuffer(d*this.lstmInputSize,"duration_lstm_in");this.dispatchConcatBroadcast(R,$,N,d,this.lstmBidir,this.styleHalf);let K=this.requireWeight("onnx::LSTM_6243_quantized"),Oe=this.requireWeight("onnx::LSTM_6244_quantized"),L=this.requireWeight("onnx::LSTM_6242"),J=this.createEmptyBuffer(d*2*this.lstmHidden,"duration_lstm_out");this.dispatchLSTM(N,K.buffer,Oe.buffer,L.buffer,J,d,this.lstmInputSize,this.lstmHidden,2),U.push(N),await this.captureDebug("/lstm/LSTM_output_0",J,[d,2,1,this.lstmHidden]),await this.captureDebug("/lstm/Transpose_output_0",N,[d,1,this.lstmInputSize]);let le=this.requireWeight("onnx::MatMul_6245"),pe=this.requireWeight("kmodel.predictor.duration_proj.linear_layer.bias"),ee=this.createEmptyBuffer(d*50,"dur_proj");this.dispatchMatmul(J,le.buffer,pe.buffer,ee,d,this.lstmBidir,50,!0),U.push(J),await this.captureDebug("/duration_proj/linear_layer/Add_output_0",ee,[1,d,50]);let re=this.createEmptyBuffer(d*50,"dur_sigmoid");this.dispatchSigmoid(ee,re,d*50),U.push(ee),await this.captureDebug("/Sigmoid_output_0",re,[1,d,50]),U.push(re);let me=await this.readBuffer(re,d*50),Q=new Int32Array(d),se=new Uint32Array(d),I=0;for(let y=0;y<d;y++){let q=0;for(let F=0;F<50;F++)q+=me[y*50+F];Q[y]=Math.max(0,Math.round(q/e)),I+=Q[y],se[y]=I}console.log(`[KittenTTS] Duration prediction: durations=[${Array.from(Q).join(",")}] totalFrames=${I}`),this.debugCapture&&this.debugActivations.set("duration",{data:new Float32Array(Q),shape:[d]});let ae=this.createBuffer(se,"duration_cumsum",GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC),ne=this.createEmptyBuffer(I*this.lstmInputSize,"shared_lstm_in");this.dispatchExpandRowMajor(N,ae,ne,d,this.lstmInputSize,I);let ke=this.createEmptyBuffer(this.lstmBidir*I,"expanded_text_features");this.dispatchExpandChannelFirst(S,ae,ke,d,this.lstmBidir,I),this.deferDestroy(S),U.push(ae),console.log(`[KittenTTS] Expanded features: [${this.lstmInputSize}, ${I}] for shared LSTM, [${this.lstmBidir}, ${I}] for decoder`);let br=this.requireWeight("onnx::LSTM_6292_quantized"),_r=this.requireWeight("onnx::LSTM_6293_quantized"),yr=this.requireWeight("onnx::LSTM_6291"),Pe=this.createEmptyBuffer(I*2*this.lstmHidden,"shared_lstm_out");this.dispatchLSTM(ne,br.buffer,_r.buffer,yr.buffer,Pe,I,this.lstmInputSize,this.lstmHidden,2),U.push(ne),await this.captureDebug("/shared/LSTM_output_0",Pe,[I,2,1,this.lstmHidden]);let Te=this.createEmptyBuffer(this.lstmBidir*I,"shared_transposed");this.dispatchTranspose(Pe,Te,I,this.lstmBidir),U.push(Pe),this.beginBatch();let H=I,ue=Te,ge=this.lstmBidir,ie=H;for(let y=0;y<3;y++){let q=`kmodel.predictor.N.${y}`,F=y===1?{weightName:"kmodel.predictor.N.1.pool.weight",channels:this.predBlock0OutCh}:void 0,V=await this.runAdaINResNetBlock(ue,$,ge,ie,q,y===1,y===0?this.predBlock0OutCh:this.predBlock1OutCh,F);U.push(ue),ue=V.output,ge=V.outChannels,ie=V.outLength,await this.captureDebug(`/N.${y}/block_output`,ue,[1,ge,ie])}console.log(`[KittenTTS] N predictor output: [${ge}, ${ie}]`);let vr=this.requireWeight("kmodel.predictor.N_proj.weight_quantized"),wr=this.requireWeight("kmodel.predictor.N_proj.bias"),Ne=this.createEmptyBuffer(ie,"n_proj");this.dispatchConv1d(ue,vr.buffer,wr.buffer,Ne,ge,1,1,ie,ie,0,1,1,!0),U.push(ue),this.endBatch(),await this.endStage("Duration + N predictor"),this.startStage(),this.beginBatch(),r?.("6/8 F0 predictor"),console.log("[KittenTTS] Running F0 predictor...");let de=Te,be=this.lstmBidir,te=H,Ie=[];for(let y=0;y<3;y++){let q=`kmodel.predictor.F0.${y}`,F=y===1?{weightName:"kmodel.predictor.F0.1.pool.weight",channels:this.predBlock0OutCh}:void 0,V=await this.runAdaINResNetBlock(de,$,be,te,q,y===1,y===0?this.predBlock0OutCh:this.predBlock1OutCh,F);y>0&&Ie.push(de),de=V.output,be=V.outChannels,te=V.outLength,await this.captureDebug(`/F0.${y}/block_output`,de,[1,be,te])}console.log(`[KittenTTS] F0 predictor output: [${be}, ${te}]`);let Br=this.requireWeight("kmodel.predictor.F0_proj.weight_quantized"),xr=this.requireWeight("kmodel.predictor.F0_proj.bias"),Ue=this.createEmptyBuffer(te,"f0_proj");this.dispatchConv1d(de,Br.buffer,xr.buffer,Ue,be,1,1,te,te,0,1,1,!0),Ie.push(de),this.endBatch(),await this.endStage("F0 predictor"),this.startStage(),this.beginBatch(),r?.("7/8 Decoder"),console.log("[KittenTTS] Running decoder...");let Sr=this.requireWeight("kmodel.decoder.F0_conv.weight"),kr=this.requireWeight("kmodel.decoder.F0_conv.bias"),_e=this.createEmptyBuffer(H,"f0_conv");this.dispatchConv1d(Ue,Sr.buffer,kr.buffer,_e,1,1,3,te,H,1,2,1,!0);let Pr=this.requireWeight("kmodel.decoder.N_conv.weight"),Tr=this.requireWeight("kmodel.decoder.N_conv.bias"),ye=this.createEmptyBuffer(H,"n_conv");this.dispatchConv1d(Ne,Pr.buffer,Tr.buffer,ye,1,1,3,ie,H,1,2,1,!0);let qe=this.lstmBidir+2,Re=this.createEmptyBuffer((this.lstmBidir+1)*H,"dec_concat_mid");this.dispatchConcatChannels(ke,_e,Re,this.lstmBidir,1,H);let Ge=this.createEmptyBuffer(qe*H,"decoder_input");this.dispatchConcatChannels(Re,ye,Ge,this.lstmBidir+1,1,H),this.deferDestroy(Re),await this.captureDebug("/decoder/Concat_output_0",Ge,[1,qe,H]);for(let y of U)this.deferDestroy(y);for(let y of Ie)this.deferDestroy(y);this.deferDestroy(Ne),this.deferDestroy(v);let Y=H,Fe=await this.runDecoderBlock(Ge,C,qe,this.decEncodeOutCh,Y,"kmodel.decoder.encode",!0);await this.captureDebug("/decoder/encode/Div_output_0",Fe,[1,this.decEncodeOutCh,Y]),this.deferDestroy(Ge);let Ur=this.requireWeight("kmodel.decoder.asr_res.0.weight_quantized"),ht=this.requireWeight("kmodel.decoder.asr_res.0.bias"),ve=ht.size,we=this.createEmptyBuffer(ve*H,"asr_res");this.dispatchConv1d(ke,Ur.buffer,ht.buffer,we,this.lstmBidir,ve,1,H,H,0,1,1,!0),this.deferDestroy(ke);let ce=this.buildDecodeInput(Fe,_e,ye,we,this.decEncodeOutCh,Y,ve);this.deferDestroy(Fe);let fe=ce,Gr=this.decEncodeOutCh+ve+2;for(let y=0;y<4;y++){let q=`kmodel.decoder.decode.${y}`,F=y<3?this.decDecodeOutCh:this.decDecode3OutCh,V=Gr;y===3?(fe=await this.runDecoderBlock(ce,C,V,F,Y,q,!0,{weightName:"kmodel.decoder.decode.3.pool.weight",channels:V}),this.deferDestroy(ce),Y=Y*2):(fe=await this.runDecoderBlock(ce,C,V,F,Y,q,!0),this.deferDestroy(ce)),await this.captureDebug(`/decoder/decode.${y}/Div_output_0`,fe,[1,F,Y]),this.flushBatchEncoder(),y<3&&(ce=this.buildDecodeInput(fe,_e,ye,we??null,F,Y,ve),this.deferDestroy(fe))}this.deferDestroy(_e),this.deferDestroy(ye),I=Y,console.log(`[KittenTTS] Decoder output: [${this.decDecode3OutCh}, ${I}]`),await this.endStage("Decoder (5 blocks)"),this.startStage(),r?.("8/8 HiFi-GAN"),console.log("[KittenTTS] Running HiFi-GAN..."),this.beginBatch();let E=fe,G=this.decDecode3OutCh,k=I,lt=this.createEmptyBuffer(G*k,"pre_ups0_leaky");this.dispatchLeakyRelu(E,lt,G*k,.1),this.deferDestroy(E),E=lt;let Er=this.requireWeight("kmodel.decoder.generator.ups.0.weight"),Ar=this.requireWeight("kmodel.decoder.generator.ups.0.bias"),He=k*10,pt=this.createEmptyBuffer(this.hifiUps0OutCh*He,"ups0");this.dispatchConvTranspose1d(E,Er.buffer,Ar.buffer,pt,G,this.hifiUps0OutCh,20,k,He,10,5,!0),this.deferDestroy(E),E=pt,G=this.hifiUps0OutCh,k=He,console.log(`[KittenTTS] ups.0 output: [${G}, ${k}]`),this.endBatch(),await this.captureDebug("/decoder/generator/ups.0/ConvTranspose_output_0",E,[1,G,k]);let oe=k*6+1,je=await this.generateSourceExcitation(Ue,te,oe);this.deferDestroy(Ue),this.beginBatch();let zr=this.requireWeight("kmodel.decoder.generator.noise_convs.0.weight_quantized"),Dr=this.requireWeight("kmodel.decoder.generator.noise_convs.0.bias"),Ke=Math.floor((oe+6-12)/6)+1,Ve=this.createEmptyBuffer(this.hifiUps0OutCh*Ke,"noise_convs0");this.dispatchConv1d(je,zr.buffer,Dr.buffer,Ve,22,this.hifiUps0OutCh,12,oe,Ke,3,6,1,!0);let mt=await this.runHiFiGANResBlock(Ve,C,this.hifiUps0OutCh,Ke,"kmodel.decoder.generator.noise_res.0");this.deferDestroy(Ve);let gt=this.createEmptyBuffer(G*k,"noisy_ups0");this.dispatchAdd(E,mt,gt,G*k),this.deferDestroy(E),this.deferDestroy(mt),E=gt,this.flushBatchEncoder();let bt=await this.runHiFiGANResBlock(E,C,G,k,"kmodel.decoder.generator.resblocks.0"),_t=await this.runHiFiGANResBlock(E,C,G,k,"kmodel.decoder.generator.resblocks.1"),Qe=this.createEmptyBuffer(G*k,"res_sum0");this.dispatchAdd(bt,_t,Qe,G*k),this.deferDestroy(bt),this.deferDestroy(_t);let yt=this.createEmptyBuffer(G*k,"res_avg0");this.dispatchScale(Qe,yt,G*k,.5),this.deferDestroy(Qe),this.deferDestroy(E),E=yt,this.flushBatchEncoder();let vt=this.createEmptyBuffer(G*k,"pre_ups1_leaky");this.dispatchLeakyRelu(E,vt,G*k,.1),this.deferDestroy(E),E=vt;let Mr=this.requireWeight("kmodel.decoder.generator.ups.1.weight"),Cr=this.requireWeight("kmodel.decoder.generator.ups.1.bias"),Xe=k*6,wt=this.createEmptyBuffer(this.hifiUps1OutCh*Xe,"ups1");this.dispatchConvTranspose1d(E,Mr.buffer,Cr.buffer,wt,G,this.hifiUps1OutCh,12,k,Xe,6,3,!0),this.deferDestroy(E),E=wt,G=this.hifiUps1OutCh,k=Xe,console.log(`[KittenTTS] ups.1 output: [${G}, ${k}]`),this.flushBatchEncoder(),await this.captureDebug("/decoder/generator/ups.1/ConvTranspose_output_0",E,[1,G,k]);{let y=k+1,q=this.createEmptyBuffer(G*y,"gen_reflected");this.dispatchReflectionPad1d(E,q,G,k,1,0),this.deferDestroy(E),E=q,k=y}console.log(`[KittenTTS] After reflection pad: [${G}, ${k}]`);let Wr=this.requireWeight("kmodel.decoder.generator.noise_convs.1.weight_quantized"),Lr=this.requireWeight("kmodel.decoder.generator.noise_convs.1.bias"),Ye=this.createEmptyBuffer(this.hifiUps1OutCh*oe,"noise_convs1");this.dispatchConv1d(je,Wr.buffer,Lr.buffer,Ye,22,this.hifiUps1OutCh,1,oe,oe,0,1,1,!0),this.deferDestroy(je);let Bt=await this.runHiFiGANResBlock(Ye,C,this.hifiUps1OutCh,oe,"kmodel.decoder.generator.noise_res.1");this.deferDestroy(Ye);let xt=this.createEmptyBuffer(G*k,"noisy_pad");this.dispatchAdd(E,Bt,xt,G*k),this.deferDestroy(E),this.deferDestroy(Bt),E=xt,this.flushBatchEncoder();let St=await this.runHiFiGANResBlock(E,C,G,k,"kmodel.decoder.generator.resblocks.2"),kt=await this.runHiFiGANResBlock(E,C,G,k,"kmodel.decoder.generator.resblocks.3"),Ze=this.createEmptyBuffer(G*k,"res_sum1");this.dispatchAdd(St,kt,Ze,G*k),this.deferDestroy(St),this.deferDestroy(kt);let Pt=this.createEmptyBuffer(G*k,"res_avg1");this.dispatchScale(Ze,Pt,G*k,.5),this.deferDestroy(Ze),this.deferDestroy(E),E=Pt,this.flushBatchEncoder();let Je=this.createEmptyBuffer(G*k,"post_leaky");this.dispatchLeakyRelu(E,Je,G*k,.01),this.deferDestroy(E);let $r=this.requireWeight("kmodel.decoder.generator.conv_post.weight_quantized"),Or=this.requireWeight("kmodel.decoder.generator.conv_post.bias"),Ee=this.createEmptyBuffer(22*k,"conv_post");this.dispatchConv1d(Je,$r.buffer,Or.buffer,Ee,G,22,7,k,k,3,1,1,!0),this.deferDestroy(Je),this.endBatch(),await this.captureDebug("/decoder/generator/conv_post/Conv_output_0",Ee,[1,22,k]),await this.endStage("HiFi-GAN generator"),this.startStage();let Nr=11,Tt=20,Ut=5,Ae=(k-1)*Ut+Tt,Ir=this.requireWeight("kmodel.decoder.generator.stft.weight_backward_real"),qr=this.requireWeight("kmodel.decoder.generator.stft.weight_backward_imag"),et=this.createEmptyBuffer(Ae,"waveform_gpu");this.dispatchISTFT(Ee,Ir.buffer,qr.buffer,et,k,Ae,Nr,Tt,Ut),this.deferDestroy(Ee);let Rr=await this.readBuffer(et,Ae);this.deferDestroy(et);let Fr=10,Hr=Ae-10,Be=Rr.slice(Fr,Hr);return await this.endStage("iSTFT synthesis (GPU)"),this.printTimings(),console.log(`[KittenTTS] Waveform: ${Be.length} samples (${(Be.length/24e3).toFixed(2)}s)`),this.debugCapture&&this.debugActivations.set("waveform",{data:Be,shape:[Be.length]}),this.deferDestroy(a),this.deferDestroy(l),this.deferDestroy(c),this.deferDestroy(B),this.deferDestroy(T),this.deferDestroy(z),this.deferDestroy(D),this.deferDestroy(W),this.deferDestroy(_),this.deferDestroy(M),this.deferDestroy($),this.deferDestroy(C),we&&this.deferDestroy(we),this.deferDestroy(Te),this.flushBatchEncoder(),this.destroyPool(),{waveform:Be,duration:Q}}cpuLSTM(i,s,e,t,r,u,n,f){let o=n,a=o*4,l=u,c=new Float32Array(r*f*o);for(let d=0;d<f;d++){let p=new Float32Array(o),m=new Float32Array(o),g=d*8*o,w=d*l*a,_=d*o*a;for(let B=0;B<r;B++){let T=d===0?B:r-1-B,z=new Float32Array(p),D=new Float32Array(o),W=new Float32Array(o),M=new Float32Array(o),v=new Float32Array(o);for(let b=0;b<o;b++)D[b]=t[g+b]+t[g+4*o+b],W[b]=t[g+o+b]+t[g+5*o+b],M[b]=t[g+2*o+b]+t[g+6*o+b],v[b]=t[g+3*o+b]+t[g+7*o+b];for(let b=0;b<l;b++){let P=i[T*l+b],A=w+b*a;for(let x=0;x<o;x++)D[x]+=P*s[A+x],W[x]+=P*s[A+o+x],M[x]+=P*s[A+2*o+x],v[x]+=P*s[A+3*o+x]}for(let b=0;b<o;b++){let P=z[b],A=_+b*a;for(let x=0;x<o;x++)D[x]+=P*e[A+x],W[x]+=P*e[A+o+x],M[x]+=P*e[A+2*o+x],v[x]+=P*e[A+3*o+x]}for(let b=0;b<o;b++){let P=1/(1+Math.exp(-D[b])),A=1/(1+Math.exp(-W[b])),x=1/(1+Math.exp(-M[b])),O=Math.tanh(v[b]);m[b]=x*m[b]+P*O,p[b]=A*Math.tanh(m[b])}B===0&&d===0&&this.debugCapture&&(console.log(`[cpuLSTM] t=0,d=0: gates_i[0:3]=[${D.subarray(0,3).join(",")}]`),console.log(`[cpuLSTM] t=0,d=0: gates_o[0:3]=[${W.subarray(0,3).join(",")}]`),console.log(`[cpuLSTM] t=0,d=0: gates_f[0:3]=[${M.subarray(0,3).join(",")}]`),console.log(`[cpuLSTM] t=0,d=0: gates_c[0:3]=[${v.subarray(0,3).join(",")}]`),console.log(`[cpuLSTM] t=0,d=0: h[0:5]=[${p.subarray(0,5).join(",")}]`),console.log(`[cpuLSTM] t=0,d=0: c[0:5]=[${m.subarray(0,5).join(",")}]`),console.log(`[cpuLSTM] t=0,d=0: input[0:5]=[${i.subarray(0,5).join(",")}]`));let S=T*f*o+d*o;for(let b=0;b<o;b++)c[S+b]=p[b]}}return c}createBuffer(i,s,e){let t=this.device.createBuffer({size:i.byteLength,usage:e|GPUBufferUsage.COPY_DST,label:s});return this.device.queue.writeBuffer(t,0,i),t}createEmptyBuffer(i,s){return this.device.createBuffer({size:i*4,usage:GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC,label:s})}createUniformBuffer(i,s){let e=Math.ceil(i.byteLength/16)*16,t=new Uint8Array(Math.max(e,16));t.set(new Uint8Array(i.buffer,i.byteOffset,i.byteLength));let r=this.device.createBuffer({size:t.byteLength,usage:GPUBufferUsage.UNIFORM,label:s,mappedAtCreation:!0});return new Uint8Array(r.getMappedRange()).set(t),r.unmap(),this.pendingUniformBuffers.push(r),r}flushUniformBuffers(){for(let i of this.pendingUniformBuffers)i.destroy();this.pendingUniformBuffers=[]}requireWeight(i){let s=this.tryGetWeight(i);if(!s)throw new Error(`[KittenTTS] Missing weight: ${i}`);return s}beginBatch(){this.flushBatchEncoder()}endBatch(){this.flushBatchEncoder()}flushBatch(){this.flushBatchEncoder()}submitBatch(){this.flushBatchEncoder()}dispatchSingle(i,s,e,t=1,r=1){let{pipeline:u}=this.pipelines.get(i);this.sharedEncoder||(this.sharedEncoder=this.device.createCommandEncoder({label:"shared_batch"}));let n=this.sharedEncoder.beginComputePass({label:i});n.setPipeline(u),n.setBindGroup(0,s),n.dispatchWorkgroups(e,t,r),n.end()}deferDestroy(i){this.deferredDestroys.push(i)}flushSharedEncoder(){this.sharedEncoder&&(this.device.queue.submit([this.sharedEncoder.finish()]),this.sharedEncoder=null);for(let i of this.deferredDestroys)i.destroy();this.deferredDestroys.length=0;for(let i of this.deferredPoolReturns){let s=i.size,e=this.bufferPool.get(s);e||(e=[],this.bufferPool.set(s,e)),e.push(i)}this.deferredPoolReturns.length=0,this.flushUniformBuffers()}flushBatchEncoder(){this.flushSharedEncoder()}poolGet(i,s){let e=i*4,t=this.bufferPool.get(e);return t&&t.length>0?t.pop():this.createEmptyBuffer(i,s)}poolReturn(i){this.deferredPoolReturns.push(i)}destroyPool(){for(let[,i]of this.bufferPool)for(let s of i)s.destroy();this.bufferPool.clear()}async readBuffer(i,s){this.flushBatchEncoder();let e=this.device.createBuffer({size:s*4,usage:GPUBufferUsage.MAP_READ|GPUBufferUsage.COPY_DST}),t=this.device.createCommandEncoder();t.copyBufferToBuffer(i,0,e,0,s*4),this.device.queue.submit([t.finish()]),await this.device.queue.onSubmittedWorkDone(),await e.mapAsync(GPUMapMode.READ);let r=new Float32Array(e.getMappedRange().slice(0));return e.unmap(),e.destroy(),r}dispatchEmbedding(i,s,e,t,r,u){let{bindGroupLayout:n}=this.pipelines.get("embedding"),f=this.createUniformBuffer(new Uint32Array([t,r,u]),"embedding_params"),o=this.device.createBindGroup({layout:n,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:f}}]});this.dispatchSingle("embedding",o,Math.ceil(t*r/256))}dispatchAdd(i,s,e,t){let{bindGroupLayout:r}=this.pipelines.get("add"),u=this.createUniformBuffer(new Uint32Array([t]),"add_params"),n=this.device.createBindGroup({layout:r,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:u}}]});this.dispatchSingle("add",n,Math.ceil(t/256))}runBertEncoder(i,s,e){let t=this.bertEmbedDim,r=this.bertHiddenSize,u=this.bertNumHeads,n=this.bertHeadDim,f=this.bertFfnDim,o=this.bertNumLayers,a=1e-12,l=this.device.createCommandEncoder({label:"bert_encoder"}),c=l.beginComputePass({label:"bert_pass"}),d=this.requireWeight("kmodel.bert.embeddings.LayerNorm.weight"),p=this.requireWeight("kmodel.bert.embeddings.LayerNorm.bias"),m=this.createEmptyBuffer(e*t,"bert_emb_ln");this.dispatchLayerNorm(s,d.buffer,p.buffer,m,e,t,a,c);let g=this.requireWeight("onnx::MatMul_5883_quantized"),w=this.requireWeight("kmodel.bert.encoder.embedding_hidden_mapping_in.bias"),_=this.createEmptyBuffer(e*r,"bert_projected");this.dispatchMatmul(m,g.buffer,w.buffer,_,e,t,r,!0,c);let B="kmodel.bert.encoder.albert_layer_groups.0.albert_layers.0",T=this.requireWeight("onnx::MatMul_5884_quantized"),z=this.requireWeight("onnx::MatMul_5887_quantized"),D=this.requireWeight("onnx::MatMul_5890_quantized"),W=this.requireWeight(`${B}.attention.query.bias`),M=this.requireWeight(`${B}.attention.key.bias`),v=this.requireWeight(`${B}.attention.value.bias`),S=this.requireWeight("onnx::MatMul_5894_quantized"),b=this.requireWeight(`${B}.attention.dense.bias`),P=this.requireWeight(`${B}.attention.LayerNorm.weight`),A=this.requireWeight(`${B}.attention.LayerNorm.bias`),x=this.requireWeight("onnx::MatMul_5895_quantized"),O=this.requireWeight(`${B}.ffn.bias`),j=this.requireWeight("onnx::MatMul_5896_quantized"),$=this.requireWeight(`${B}.ffn_output.bias`),C=this.requireWeight(`${B}.full_layer_layer_norm.weight`),U=this.requireWeight(`${B}.full_layer_layer_norm.bias`),R=1/Math.sqrt(n),N=[m],K=new Map;for(let L=0;L<o;L++){let J=this.createEmptyBuffer(e*r,`Q_${L}`),le=this.createEmptyBuffer(e*r,`K_${L}`),pe=this.createEmptyBuffer(e*r,`V_${L}`);this.dispatchMatmul(_,T.buffer,W.buffer,J,e,r,r,!0,c),this.dispatchMatmul(_,z.buffer,M.buffer,le,e,r,r,!0,c),this.dispatchMatmul(_,D.buffer,v.buffer,pe,e,r,r,!0,c);let ee=this.createEmptyBuffer(e*r,`attn_out_${L}`);this.dispatchMHA(J,le,pe,ee,e,u,n,R,c),this.debugCapture&&L===0&&(K.set("Q_0",J),K.set("attn_out_0",ee),K.set("ffn_up_weight",x.buffer),K.set("ffn_up_bias",O.buffer)),N.push(J,le,pe);let re=this.createEmptyBuffer(e*r,`attn_proj_${L}`);this.dispatchMatmul(ee,S.buffer,b.buffer,re,e,r,r,!0,c),N.push(ee);let me=this.createEmptyBuffer(e*r,`attn_res_${L}`);this.dispatchAddPass(_,re,me,e*r,c),N.push(re);let Q=this.createEmptyBuffer(e*r,`attn_ln_${L}`);this.dispatchLayerNorm(me,P.buffer,A.buffer,Q,e,r,a,c),this.debugCapture&&L===0&&K.set("attn_ln_0",Q),N.push(me);let se=this.createEmptyBuffer(e*f,`ffn_up_${L}`);this.dispatchMatmulGelu(Q,x.buffer,O.buffer,se,e,r,f,c);let I=this.createEmptyBuffer(e*r,`ffn_down_${L}`);this.dispatchMatmul(se,j.buffer,$.buffer,I,e,f,r,!0,c),this.debugCapture&&L===0&&(K.set("ffn_up_0",se),K.set("ffn_down_0",I),K.set("ffn_down_weight",j.buffer),K.set("ffn_down_bias",$.buffer)),N.push(se);let ae=this.createEmptyBuffer(e*r,`ffn_res_${L}`);this.dispatchAddPass(Q,I,ae,e*r,c),N.push(Q,I);let ne=this.createEmptyBuffer(e*r,`hidden_${L+1}`);this.dispatchLayerNorm(ae,C.buffer,U.buffer,ne,e,r,a,c),N.push(ae),this.debugCapture&&L<=1&&K.set(`hidden_${L+1}`,ne),N.push(_),_=ne}c.end(),this.device.queue.submit([l.finish()]),this.debugCapture&&(this.debugBertBuffers={normedEmb:m,projected:N.find(L=>L.label==="bert_projected")||null,hidden:_,seqLen:e,embedDim:t,hiddenSize:r,layerBuffers:K});let Oe=this.debugCapture?new Set([...K.keys(),"bert_projected","bert_emb_ln"]):null;for(let L of N)Oe?.has(L.label)||this.deferDestroy(L);return _}async runTextEncoder(i,s){let e=this.textEncChannels,t=5,r=2,u=this.lstmHidden,n=2,f=[],o=this.requireWeight("kmodel.text_encoder.embedding.weight"),a=this.createEmptyBuffer(s*e,"te_embedding");this.dispatchEmbedding(o.buffer,i,a,s,e,178),await this.captureDebug("/text_encoder/embedding/Gather_output_0",a,[1,s,e]);let l=this.createEmptyBuffer(s*e,"te_transposed");this.dispatchTranspose(a,l,s,e),f.push(a),await this.captureDebug("/text_encoder/Transpose_output_0",l,[1,e,s]);let c=l;for(let _=0;_<this.numTextEncCnnBlocks;_++){let B=this.requireWeight(`kmodel.text_encoder.cnn.${_}.0.weight_quantized`),T=this.requireWeight(`kmodel.text_encoder.cnn.${_}.0.bias`);_===0&&(await this.captureDebug("debug/cnn0_weight",B.buffer,[512,512,5]),await this.captureDebug("debug/cnn0_bias",T.buffer,[512]));let z=this.requireWeight(`kmodel.text_encoder.cnn.${_}.1.gamma`),D=this.requireWeight(`kmodel.text_encoder.cnn.${_}.1.beta`),W=this.createEmptyBuffer(e*s,`te_conv${_}`);this.dispatchConv1d(c,B.buffer,T.buffer,W,e,e,t,s,s,r,1,1,!0),f.push(c),await this.captureDebug(`/text_encoder/cnn.${_}/cnn.${_}.0/Conv_output_0quant_scaled_output`,W,[1,e,s]);let M=this.createEmptyBuffer(s*e,`te_prenorm${_}`);this.dispatchTranspose(W,M,e,s),f.push(W);let v=this.createEmptyBuffer(s*e,`te_ln${_}`);this.dispatchLayerNorm(M,z.buffer,D.buffer,v,s,e,1e-5),f.push(M);let S=this.createEmptyBuffer(e*s,`te_postnorm${_}`);this.dispatchTranspose(v,S,s,e),f.push(v);let b=this.createEmptyBuffer(e*s,`te_act${_}`);this.dispatchLeakyRelu(S,b,e*s,.2),f.push(S),c=b}let d=this.createEmptyBuffer(s*e,"te_lstm_in");this.dispatchTranspose(c,d,e,s),f.push(c);let p=this.requireWeight("onnx::LSTM_5874_quantized"),m=this.requireWeight("onnx::LSTM_5875_quantized"),g=this.requireWeight("onnx::LSTM_5873"),w=this.createEmptyBuffer(s*n*u,"te_lstm_out");this.dispatchLSTM(d,p.buffer,m.buffer,g.buffer,w,s,e,u,n),f.push(d),await this.captureDebug("/text_encoder/lstm/LSTM_output_0",w,[s,2,1,u]);for(let _ of f)this.deferDestroy(_);return w}dispatchLayerNorm(i,s,e,t,r,u,n,f){let o=this.pipelines.get("layerNorm"),a=new ArrayBuffer(12);new Uint32Array(a,0,2).set([r,u]),new Float32Array(a,8,1).set([n]);let l=this.createUniformBuffer(new Uint8Array(a),"ln_params"),c=this.device.createBindGroup({layout:o.bindGroupLayout,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:t}},{binding:4,resource:{buffer:l}}]});f?(f.setPipeline(o.pipeline),f.setBindGroup(0,c),f.dispatchWorkgroups(Math.ceil(r/256))):this.dispatchSingle("layerNorm",c,Math.ceil(r/256))}dispatchMatmul(i,s,e,t,r,u,n,f,o){let a=this.pipelines.get("matmul"),l=this.createUniformBuffer(new Uint32Array([r,u,n,f?1:0]),"matmul_params"),c=this.device.createBindGroup({layout:a.bindGroupLayout,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:t}},{binding:4,resource:{buffer:l}}]});o?(o.setPipeline(a.pipeline),o.setBindGroup(0,c),o.dispatchWorkgroups(Math.ceil(r/16),Math.ceil(n/16))):this.dispatchSingle("matmul",c,Math.ceil(r/16),Math.ceil(n/16))}dispatchGelu(i,s,e){let t=this.pipelines.get("gelu"),r=this.createUniformBuffer(new Uint32Array([e]),"gelu_params"),u=this.device.createBindGroup({layout:t.bindGroupLayout,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:r}}]});this.dispatchSingle("gelu",u,Math.ceil(e/256))}dispatchMatmulGelu(i,s,e,t,r,u,n,f){let o=this.pipelines.get("matmulGelu"),a=this.createUniformBuffer(new Uint32Array([r,u,n]),"matmul_gelu_params"),l=this.device.createBindGroup({layout:o.bindGroupLayout,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:t}},{binding:4,resource:{buffer:a}}]});f?(f.setPipeline(o.pipeline),f.setBindGroup(0,l),f.dispatchWorkgroups(Math.ceil(r/16),Math.ceil(n/16))):this.dispatchSingle("matmulGelu",l,Math.ceil(r/16),Math.ceil(n/16))}dispatchMHA(i,s,e,t,r,u,n,f,o){let a=this.pipelines.get("mha"),l=new ArrayBuffer(16),c=new Uint32Array(l),d=new Float32Array(l);c[0]=r,c[1]=u,c[2]=n,d[3]=f;let p=this.createUniformBuffer(new Uint32Array(l),"mha_params"),m=this.device.createBindGroup({layout:a.bindGroupLayout,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:t}},{binding:4,resource:{buffer:p}}]});o?(o.setPipeline(a.pipeline),o.setBindGroup(0,m),o.dispatchWorkgroups(Math.ceil(n/64),u*r)):this.dispatchSingle("mha",m,Math.ceil(n/64),u*r)}dispatchAddPass(i,s,e,t,r){let u=this.pipelines.get("add"),n=this.createUniformBuffer(new Uint32Array([t]),"add_params"),f=this.device.createBindGroup({layout:u.bindGroupLayout,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:n}}]});r?(r.setPipeline(u.pipeline),r.setBindGroup(0,f),r.dispatchWorkgroups(Math.ceil(t/256))):this.dispatchSingle("add",f,Math.ceil(t/256))}dispatchConv1d(i,s,e,t,r,u,n,f,o,a,l,c,d){let{bindGroupLayout:p}=this.pipelines.get("conv1d"),m=this.createUniformBuffer(new Uint32Array([r,u,n,f,o,a,l,c,d?1:0]),"conv1d_params"),g=this.device.createBindGroup({layout:p,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:t}},{binding:4,resource:{buffer:m}}]});this.dispatchSingle("conv1d",g,Math.ceil(u*o/256))}dispatchTranspose(i,s,e,t){let{bindGroupLayout:r}=this.pipelines.get("transpose"),u=this.createUniformBuffer(new Uint32Array([e,t]),"transpose_params"),n=this.device.createBindGroup({layout:r,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:u}}]});this.dispatchSingle("transpose",n,Math.ceil(e*t/256))}dispatchLeakyRelu(i,s,e,t){let{bindGroupLayout:r}=this.pipelines.get("leakyRelu"),u=new ArrayBuffer(8);new Uint32Array(u,0,1).set([e]),new Float32Array(u,4,1).set([t]);let n=this.createUniformBuffer(new Uint8Array(u),"leaky_relu_params"),f=this.device.createBindGroup({layout:r,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:n}}]});this.dispatchSingle("leakyRelu",f,Math.ceil(e/256))}dispatchSigmoid(i,s,e){let{bindGroupLayout:t}=this.pipelines.get("sigmoid"),r=new ArrayBuffer(4);new Uint32Array(r,0,1).set([e]);let u=this.createUniformBuffer(new Uint8Array(r),"sigmoid_params"),n=this.device.createBindGroup({layout:t,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:u}}]});this.dispatchSingle("sigmoid",n,Math.ceil(e/256))}dispatchLSTM(i,s,e,t,r,u,n,f,o){let a=this.pipelines.get("lstm"),l=this.createUniformBuffer(new Uint32Array([u,n,f,o]),"lstm_params"),c=this.device.createBindGroup({layout:a.bindGroupLayout,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:t}},{binding:4,resource:{buffer:r}},{binding:5,resource:{buffer:l}}]});this.dispatchSingle("lstm",c,1,o)}async runAdaINResNetBlock(i,s,e,t,r,u,n,f){let o=[],a=t,l=this.createEmptyBuffer(e*a,"adain_norm1");this.dispatchInstanceNorm(i,l,e,a,1e-5);let c=this.requireWeight(`${r}.norm1.fc.weight_quantized`),d=this.requireWeight(`${r}.norm1.fc.bias`),p=this.createEmptyBuffer(d.size,"norm1_style");this.dispatchMatmul(s,c.buffer,d.buffer,p,1,this.styleHalf,d.size,!0);let m=this.createEmptyBuffer(e*a,"adain1_out");this.dispatchAdaIN(l,p,m,e,a),o.push(l,p);let g=this.createEmptyBuffer(e*a,"adain_act1");this.dispatchLeakyRelu(m,g,e*a,.2),o.push(m);let w=g;if(f){let C=this.requireWeight(f.weightName),U=a*2,R=this.createEmptyBuffer(f.channels*U,"pool_out");this.dispatchDepthwiseConvTranspose1d(g,C.buffer,R,f.channels,3,a,U,2,1),o.push(g),w=R,a=U}let _=this.requireWeight(`${r}.conv1.weight_quantized`),B=this.requireWeight(`${r}.conv1.bias`),T=this.createEmptyBuffer(n*a,"adain_conv1");this.dispatchConv1d(w,_.buffer,B.buffer,T,e,n,3,a,a,1,1,1,!0),o.push(w);let z=this.createEmptyBuffer(n*a,"adain_norm2");this.dispatchInstanceNorm(T,z,n,a,1e-5);let D=this.requireWeight(`${r}.norm2.fc.weight_quantized`),W=this.requireWeight(`${r}.norm2.fc.bias`),M=this.createEmptyBuffer(W.size,"norm2_style");this.dispatchMatmul(s,D.buffer,W.buffer,M,1,this.styleHalf,W.size,!0);let v=this.createEmptyBuffer(n*a,"adain2_out");this.dispatchAdaIN(z,M,v,n,a),o.push(T,z,M);let S=this.createEmptyBuffer(n*a,"adain_act2");this.dispatchLeakyRelu(v,S,n*a,.2),o.push(v);let b=this.requireWeight(`${r}.conv2.weight_quantized`),P=this.requireWeight(`${r}.conv2.bias`),A=this.createEmptyBuffer(n*a,"adain_conv2");this.dispatchConv1d(S,b.buffer,P.buffer,A,n,n,3,a,a,1,1,1,!0),o.push(S);let x;if(f){let C=this.createEmptyBuffer(e*a,"adain_resized");this.dispatchResize1d(i,C,e,t,a);let U=this.requireWeight(`${r}.conv1x1.weight_quantized`);x=this.createEmptyBuffer(n*a,"adain_res_proj"),this.dispatchConv1d(C,U.buffer,U.buffer,x,e,n,1,a,a,0,1,1,!1),o.push(C)}else if(u&&e!==n){let C=this.requireWeight(`${r}.conv1x1.weight_quantized`);x=this.createEmptyBuffer(n*a,"adain_res_proj"),this.dispatchConv1d(i,C.buffer,C.buffer,x,e,n,1,a,a,0,1,1,!1)}else x=i;let O=1/Math.SQRT2,j=this.createEmptyBuffer(n*a,"adain_raw_sum");this.dispatchAdd(A,x,j,n*a);let $=this.createEmptyBuffer(n*a,"adain_block_out");this.dispatchScale(j,$,n*a,O),o.push(A,j),(f||u&&e!==n)&&o.push(x);for(let C of o)this.deferDestroy(C);return{output:$,outChannels:n,outLength:a}}async runDecoderBlock(i,s,e,t,r,u,n,f){let o=[],a=r,l=this.createEmptyBuffer(e*a,"dec_norm1");this.dispatchInstanceNorm(i,l,e,a,1e-5);let c=this.requireWeight(`${u}.norm1.fc.weight_quantized`),d=this.requireWeight(`${u}.norm1.fc.bias`),p=d.size,m=this.createEmptyBuffer(p,"dec_norm1_style");this.dispatchMatmul(s,c.buffer,d.buffer,m,1,this.styleHalf,p,!0);let g=this.createEmptyBuffer(e*a,"dec_adain1");this.dispatchAdaIN(l,m,g,e,a),o.push(l,m);let w=this.createEmptyBuffer(e*a,"dec_act1");this.dispatchLeakyRelu(g,w,e*a,.2),o.push(g);let _=w;if(f){let U=this.requireWeight(f.weightName),R=a*2,N=this.createEmptyBuffer(f.channels*R,"dec_pool_out");this.dispatchDepthwiseConvTranspose1d(w,U.buffer,N,f.channels,3,a,R,2,1),o.push(w),_=N,a=R}let B=this.requireWeight(`${u}.conv1.weight_quantized`),T=this.requireWeight(`${u}.conv1.bias`),z=this.createEmptyBuffer(t*a,"dec_conv1");this.dispatchConv1d(_,B.buffer,T.buffer,z,e,t,3,a,a,1,1,1,!0),o.push(_);let D=this.createEmptyBuffer(t*a,"dec_norm2");this.dispatchInstanceNorm(z,D,t,a,1e-5);let W=this.requireWeight(`${u}.norm2.fc.weight_quantized`),M=this.requireWeight(`${u}.norm2.fc.bias`),v=M.size,S=this.createEmptyBuffer(v,"dec_norm2_style");this.dispatchMatmul(s,W.buffer,M.buffer,S,1,this.styleHalf,v,!0);let b=this.createEmptyBuffer(t*a,"dec_adain2");this.dispatchAdaIN(D,S,b,t,a),o.push(z,D,S);let P=this.createEmptyBuffer(t*a,"dec_act2");this.dispatchLeakyRelu(b,P,t*a,.2),o.push(b);let A=this.requireWeight(`${u}.conv2.weight_quantized`),x=this.requireWeight(`${u}.conv2.bias`),O=this.createEmptyBuffer(t*a,"dec_conv2");this.dispatchConv1d(P,A.buffer,x.buffer,O,t,t,3,a,a,1,1,1,!0),o.push(P);let j=1/Math.SQRT2,$;if(f){let U=this.createEmptyBuffer(e*a,"dec_resized");this.dispatchResize1d(i,U,e,r,a);let R=this.requireWeight(`${u}.conv1x1.weight_quantized`),N=this.createEmptyBuffer(t*a,"dec_res_proj");this.dispatchConv1d(U,R.buffer,R.buffer,N,e,t,1,a,a,0,1,1,!1),$=this.createEmptyBuffer(t*a,"dec_raw_sum"),this.dispatchAdd(O,N,$,t*a),o.push(O,U,N)}else if(n){let U=this.requireWeight(`${u}.conv1x1.weight_quantized`),R=this.createEmptyBuffer(t*a,"dec_res_proj");this.dispatchConv1d(i,U.buffer,U.buffer,R,e,t,1,a,a,0,1,1,!1),$=this.createEmptyBuffer(t*a,"dec_raw_sum"),this.dispatchAdd(O,R,$,t*a),o.push(O,R)}else $=O;let C=this.createEmptyBuffer(t*a,"dec_block_out");this.dispatchScale($,C,t*a,j),o.push($);for(let U of o)this.deferDestroy(U);return C}buildDecodeInput(i,s,e,t,r,u,n=64){let f=t??this.createEmptyBuffer(n*u,"asr_zero"),o=this.createEmptyBuffer((r+n)*u,"dec_concat1");this.dispatchConcatChannels(i,f,o,r,n,u);let a=this.createEmptyBuffer((r+n+1)*u,"dec_concat2");this.dispatchConcatChannels(o,s,a,r+n,1,u);let l=this.createEmptyBuffer((r+n+2)*u,"dec_concat3");return this.dispatchConcatChannels(a,e,l,r+n+1,1,u),this.deferDestroy(o),this.deferDestroy(a),t||this.deferDestroy(f),l}async runHiFiGANResBlock(i,s,e,t,r){let u=i;for(let n=0;n<3;n++){let f=[],o=this.poolGet(e*t,`hifi_norm1_${n}`);this.dispatchInstanceNorm(u,o,e,t,1e-5);let a=this.requireWeight(`${r}.adain1.${n}.fc.weight_quantized`),l=this.requireWeight(`${r}.adain1.${n}.fc.bias`),c=this.poolGet(l.size,`hifi_adain1_style_${n}`);this.dispatchMatmul(s,a.buffer,l.buffer,c,1,this.styleHalf,l.size,!0);let d=this.poolGet(e*t,`hifi_adain1_${n}`);this.dispatchAdaIN(o,c,d,e,t),f.push(o,c);let p=this.requireWeight(`${r}.alpha1.${n}`),m=this.poolGet(e*t,`hifi_snake1_${n}`);this.dispatchSnake(d,p.buffer,m,e,t),f.push(d);let g=this.requireWeight(`${r}.convs1.${n}.weight_quantized`),w=this.requireWeight(`${r}.convs1.${n}.bias`),_=g.shape[2],B=[1,3,5][n],T=Math.floor((_*B-B)/2),z=this.poolGet(e*t,`hifi_conv1_${n}`);this.dispatchConv1d(m,g.buffer,w.buffer,z,e,e,_,t,t,T,1,B,!0),f.push(m);let D=this.poolGet(e*t,`hifi_norm2_${n}`);this.dispatchInstanceNorm(z,D,e,t,1e-5);let W=this.requireWeight(`${r}.adain2.${n}.fc.weight_quantized`),M=this.requireWeight(`${r}.adain2.${n}.fc.bias`),v=this.poolGet(M.size,`hifi_adain2_style_${n}`);this.dispatchMatmul(s,W.buffer,M.buffer,v,1,this.styleHalf,M.size,!0);let S=this.poolGet(e*t,`hifi_adain2_${n}`);this.dispatchAdaIN(D,v,S,e,t),f.push(z,D,v);let b=this.requireWeight(`${r}.alpha2.${n}`),P=this.poolGet(e*t,`hifi_snake2_${n}`);this.dispatchSnake(S,b.buffer,P,e,t),f.push(S);let A=this.requireWeight(`${r}.convs2.${n}.weight_quantized`),x=this.requireWeight(`${r}.convs2.${n}.bias`),O=A.shape[2],j=Math.floor((O-1)/2),$=this.poolGet(e*t,`hifi_conv2_${n}`);this.dispatchConv1d(P,A.buffer,x.buffer,$,e,e,O,t,t,j,1,1,!0),f.push(P);let C=this.poolGet(e*t,`hifi_res_${n}`);this.dispatchAdd($,u,C,e*t),f.push($),u!==i&&f.push(u),u=C;for(let U of f)this.poolReturn(U);this.flushBatchEncoder()}return u}dispatchSnake(i,s,e,t,r){let{bindGroupLayout:u}=this.pipelines.get("snake"),n=this.createUniformBuffer(new Uint32Array([t,r]),"snake_params"),f=this.device.createBindGroup({layout:u,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:n}}]});this.dispatchSingle("snake",f,Math.ceil(t*r/256))}dispatchInstanceNorm(i,s,e,t,r){let{bindGroupLayout:u}=this.pipelines.get("instanceNorm"),n=new ArrayBuffer(12);new Uint32Array(n,0,2).set([e,t]),new Float32Array(n,8,1).set([r]);let f=this.createUniformBuffer(new Uint8Array(n),"instnorm_params"),o=this.device.createBindGroup({layout:u,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:f}}]});this.dispatchSingle("instanceNorm",o,Math.ceil(e/256))}dispatchAdaIN(i,s,e,t,r){let{bindGroupLayout:u}=this.pipelines.get("adain"),n=this.createUniformBuffer(new Uint32Array([t,r]),"adain_params"),f=this.device.createBindGroup({layout:u,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:n}}]});this.dispatchSingle("adain",f,Math.ceil(t*r/256))}dispatchConvTranspose1d(i,s,e,t,r,u,n,f,o,a,l,c){let{bindGroupLayout:d}=this.pipelines.get("convTranspose1d"),p=this.createUniformBuffer(new Uint32Array([r,u,n,f,o,a,l,c?1:0]),"conv_transpose_params"),m=this.device.createBindGroup({layout:d,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:t}},{binding:4,resource:{buffer:p}}]});this.dispatchSingle("convTranspose1d",m,Math.ceil(u*o/256))}dispatchDepthwiseConvTranspose1d(i,s,e,t,r,u,n,f,o){let{bindGroupLayout:a}=this.pipelines.get("depthwiseConvTranspose1d"),l=this.createUniformBuffer(new Uint32Array([t,r,u,n,f,o]),"dw_conv_transpose_params"),c=this.device.createBindGroup({layout:a,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:l}}]});this.dispatchSingle("depthwiseConvTranspose1d",c,Math.ceil(t*n/256))}dispatchResize1d(i,s,e,t,r){let{bindGroupLayout:u}=this.pipelines.get("resize1d"),n=this.createUniformBuffer(new Uint32Array([e,t,r]),"resize1d_params"),f=this.device.createBindGroup({layout:u,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:n}}]});this.dispatchSingle("resize1d",f,Math.ceil(e*r/256))}dispatchScale(i,s,e,t){let{bindGroupLayout:r}=this.pipelines.get("scale"),u=new ArrayBuffer(16);new Uint32Array(u,0,2).set([e,0]),new Float32Array(u,8,1).set([t]);let n=this.createUniformBuffer(new Uint8Array(u),"scale_params"),f=this.device.createBindGroup({layout:r,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:n}}]});this.dispatchSingle("scale",f,Math.ceil(e/256))}dispatchConcatChannels(i,s,e,t,r,u){let{bindGroupLayout:n}=this.pipelines.get("concatChannels"),f=this.createUniformBuffer(new Uint32Array([t,r,u]),"concat_params"),o=this.device.createBindGroup({layout:n,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:f}}]});this.dispatchSingle("concatChannels",o,Math.ceil((t+r)*u/256))}dispatchAdaINRowMajor(i,s,e,t,r){let{bindGroupLayout:u}=this.pipelines.get("adainRowMajor"),n=t*r,f=this.createUniformBuffer(new Uint32Array([t,n]),"adain_rm_params"),o=this.device.createBindGroup({layout:u,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:f}}]});this.dispatchSingle("adainRowMajor",o,Math.ceil(n/256))}dispatchConcatBroadcast(i,s,e,t,r,u){let{bindGroupLayout:n}=this.pipelines.get("concatBroadcast"),f=this.createUniformBuffer(new Uint32Array([t,r,u]),"concat_bc_params"),o=this.device.createBindGroup({layout:n,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:f}}]});this.dispatchSingle("concatBroadcast",o,Math.ceil(t*(r+u)/256))}dispatchExpandRowMajor(i,s,e,t,r,u){let{bindGroupLayout:n}=this.pipelines.get("expandRowMajor"),f=this.createUniformBuffer(new Uint32Array([t,r,u]),"expand_rm_params"),o=this.device.createBindGroup({layout:n,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:f}}]});this.dispatchSingle("expandRowMajor",o,Math.ceil(u*r/256))}dispatchExpandChannelFirst(i,s,e,t,r,u){let{bindGroupLayout:n}=this.pipelines.get("expandChannelFirst"),f=this.createUniformBuffer(new Uint32Array([t,r,u]),"expand_cf_params"),o=this.device.createBindGroup({layout:n,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:f}}]});this.dispatchSingle("expandChannelFirst",o,Math.ceil(u*r/256))}dispatchISTFT(i,s,e,t,r,u,n,f,o){let{bindGroupLayout:a}=this.pipelines.get("istft"),l=this.createUniformBuffer(new Uint32Array([r,u,n,f,o]),"istft_params"),c=this.device.createBindGroup({layout:a,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:t}},{binding:4,resource:{buffer:l}}]});this.dispatchSingle("istft",c,Math.ceil(u/256))}dispatchReflectionPad1d(i,s,e,t,r,u){let{bindGroupLayout:n}=this.pipelines.get("reflectionPad1d"),f=this.createUniformBuffer(new Uint32Array([e,t,r,u]),"reflection_pad_params"),o=t+r+u,a=this.device.createBindGroup({layout:n,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:f}}]});this.dispatchSingle("reflectionPad1d",a,Math.ceil(e*o/256))}dispatchAlphaResidual(i,s,e,t,r,u){let n=this.pipelines.get("alphaResidual"),f=this.createUniformBuffer(new Uint32Array([r,u]),"alpha_res_params"),o=this.device.createBindGroup({layout:n.bindGroupLayout,entries:[{binding:0,resource:{buffer:i}},{binding:1,resource:{buffer:s}},{binding:2,resource:{buffer:e}},{binding:3,resource:{buffer:t}},{binding:4,resource:{buffer:f}}]});this.dispatchSingle("alphaResidual",o,Math.ceil(r*u/256))}compileShaders(){let i={embedding:zt,layerNorm:Dt,matmul:Mt,conv1d:Ct,instanceNorm:Wt,adain:Lt,adainRowMajor:$t,convTranspose1d:Ft,depthwiseConvTranspose1d:Ht,resize1d:jt,scale:Yt,concatChannels:Zt,concatBroadcast:Jt,reflectionPad1d:er,alphaResidual:tr,snake:Ot,leakyRelu:Nt,gelu:It,tanh:qt,sigmoid:Rt,softmax:Kt,add:Xt,mha:Vt,matmulGelu:Qt,transpose:rr,lstm:ir,istft:nr,expandRowMajor:sr,expandChannelFirst:ar};for(let[s,e]of Object.entries(i)){let t=this.device.createShaderModule({code:e,label:s}),r=this.device.createBindGroupLayout({entries:this.inferBindGroupLayout(e),label:`${s}_layout`}),u=this.device.createComputePipeline({layout:this.device.createPipelineLayout({bindGroupLayouts:[r]}),compute:{module:t,entryPoint:"main"},label:s});this.pipelines.set(s,{pipeline:u,bindGroupLayout:r})}console.log(`[KittenTTS] Compiled ${this.pipelines.size} shader pipelines`)}inferBindGroupLayout(i){let s=[],e=/@group\(0\)\s+@binding\((\d+)\)\s+var<(\w+)(?:,\s*(\w+))?>/g,t;for(;(t=e.exec(i))!==null;){let r=parseInt(t[1]),u=t[2],n=t[3];u==="uniform"?s.push({binding:r,visibility:GPUShaderStage.COMPUTE,buffer:{type:"uniform"}}):u==="storage"&&s.push({binding:r,visibility:GPUShaderStage.COMPUTE,buffer:{type:n==="read_write"?"storage":"read-only-storage"}})}return s}async generateSourceExcitation(i,s,e){let u=await this.readBuffer(i,s),n=(e-1)*5,f=new Float32Array(n),o=n/s;for(let v=0;v<n;v++){let S=Math.min(Math.floor(v/o),s-1);f[v]=u[S]}let a=new Float32Array(n*9),l=.1,c=.003;for(let v=0;v<9;v++){let S=v+1,b=0;for(let P=0;P<n;P++){let A=f[P];if(A>10)b+=A*S/24e3,b-=Math.floor(b),a[P*9+v]=Math.sin(2*Math.PI*b)*l;else{let O=Math.random(),j=Math.random();a[P*9+v]=Math.sqrt(-2*Math.log(O+1e-10))*Math.cos(2*Math.PI*j)*c,b=0}}}if(!this.sinGenWeights){let v=this.requireWeight("onnx::MatMul_6388"),S=this.requireWeight("kmodel.decoder.generator.m_source.l_linear.bias"),b=this.requireWeight("kmodel.decoder.generator.stft.weight_forward_real"),P=this.requireWeight("kmodel.decoder.generator.stft.weight_forward_imag");this.sinGenWeights={linearWeight:await this.readBuffer(v.buffer,9),linearBias:await this.readBuffer(S.buffer,1),fwdReal:await this.readBuffer(b.buffer,220),fwdImag:await this.readBuffer(P.buffer,220)}}let{linearWeight:d,linearBias:p}=this.sinGenWeights,m=new Float32Array(n);for(let v=0;v<n;v++){let S=p[0];for(let b=0;b<9;b++)S+=a[v*9+b]*d[b];m[v]=Math.tanh(S)}let g=new Float32Array(n+20);for(let v=0;v<10;v++)g[v]=m[0];for(let v=0;v<n;v++)g[v+10]=m[v];for(let v=0;v<10;v++)g[n+10+v]=m[n-1];let{fwdReal:w,fwdImag:_}=this.sinGenWeights,B=new Float32Array(11*e),T=new Float32Array(11*e),z=5,D=20;for(let v=0;v<11;v++)for(let S=0;S<e;S++){let b=0,P=0,A=S*z;for(let x=0;x<D;x++){let O=g[A+x];b+=O*w[v*D+x],P+=O*_[v*D+x]}B[v*e+S]=b,T[v*e+S]=P}let W=new Float32Array(22*e),M=1e-14;for(let v=0;v<11;v++)for(let S=0;S<e;S++){let b=B[v*e+S],P=T[v*e+S];W[v*e+S]=Math.sqrt(b*b+P*P+M),W[(11+v)*e+S]=Math.atan2(P,b)}return this.createBuffer(W,"noise_source",GPUBufferUsage.STORAGE|GPUBufferUsage.COPY_SRC)}get weightsLoaded(){return this.weights.size>0}get hasCachedWeights(){return this.weightCache.size>0}destroy(){for(let i of this.weights.values())i.buffer.destroy();this.weights.clear(),this.weightCache.clear(),this.voices.clear()}};var cr={a:"\xE6","a#":"\u0250","A:":"\u0251\u02D0","A@":"\u0251\u02D0\u0279",aa:"\u0251\u02D0","a:":"\u0251\u02D0",ai:"a\u026A",aI:"a\u026A",aU:"a\u028A",au:"a\u028A",e:"\u025B",E:"\u025B",E2:"\u025B","e#":"\u025B",eI:"e\u026A","e@":"\u025B\u0279",i:"\u026A","i:":"i\u02D0",I:"\u026A",I2:"\u026A","I#":"\u026A",0:"\u0252","0#":"\u0252",oU:"o\u028A","O:":"\u0254\u02D0","O@":"\u0254\u02D0\u0279",O2:"\u0252",OI:"\u0254\u026A","u:":"u\u02D0",U:"\u028A",V:"\u028C",VR:"\u025C\u02D0\u0279","3:":"\u025C\u02D0",3:"\u025C","@":"\u0259","@2":"\u0259","@5":"\u0259","@L":"\u0259l","@-":"\u0259",b:"b",d:"d",f:"f",g:"\u0261",h:"h",j:"j",k:"k",l:"l",L:"l",m:"m",n:"n",N:"\u014B",p:"p",r:"\u0279",R:"\u0279",s:"s",S:"\u0283",t:"t",t2:"t",T:"\u03B8",D:"\xF0",v:"v",w:"w",x:"x",z:"z",Z:"\u0292",dZ:"d\u0292",tS:"t\u0283","?":"\u0294","'":"\u02C8",",":"\u02CC","%":"",":":"\u02D0","=":"","#":"","-":"","|":"",_:" ",IR:"\u026A\u0279",th:"t\u03B8","n-":"n","z#":"z","z/2":"z"},ti=Object.keys(cr).sort((h,i)=>i.length-h.length);function ri(h){let i="",s=0;for(;s<h.length;){let e=!1;for(let t of ti)if(h.startsWith(t,s)){i+=cr[t],s+=t.length,e=!0;break}e||s++}return i}var Se={},X=new Map,ii=new Set("aeiouy\xE0\xE1\xE2\xE3\xE4\xE5\xE6\xE8\xE9\xEA\xEB\xEC\xED\xEE\xEF\xF2\xF3\xF4\xF5\xF6\xF9\xFA\xFB\xFC\xFD".split("")),si=new Set("bcdfghjklmnpqrstvwxz".split(""));function he(h){return ii.has(h.toLowerCase())}function dt(h){return si.has(h.toLowerCase())}function Z(h){return/[a-zA-Zàáâãäåæèéêëìíîïòóôõöùúûüýÿ]/u.test(h)}var fr=new Set("bdgjlmnrvwz".split(""));function ur(h,i,s){let e=0,t=s;for(;e<h.length;){let r=h[e];if(r==="?"||r==="@"||r==="$")return t-s;if(r==="+"){if(t<i.length&&Z(i[t])){e++,t++;continue}return-1}if(r==="_"){if(t>=i.length||!Z(i[t])){e++;continue}return-1}if(r==="#"){if(t>=i.length||!Z(i[t])||he(i[t])){e++;continue}return-1}if(r==="A"){if(t<i.length&&he(i[t])){e++,t++;continue}return-1}if(r==="B"){if(t<i.length&&fr.has(i[t].toLowerCase())){e++,t++;continue}return-1}if(r==="C"){if(t<i.length&&dt(i[t])){e++,t++;continue}return-1}if(r==="D"){if(t<i.length&&/\d/.test(i[t])){e++,t++;continue}return-1}if(r==="K"){if(t>=i.length||!he(i[t])){e++,t<i.length&&Z(i[t])&&t++;continue}return-1}if(r==="N"){if(t<i.length&&"mn".includes(i[t].toLowerCase())){e++,t++;continue}if(t+1<i.length&&i[t].toLowerCase()==="n"&&i[t+1].toLowerCase()==="g"){e++,t+=2;continue}return-1}if(r==="X"){if(t<i.length&&Z(i[t])){e++,t++;continue}return-1}if(r==="Y"){if(t<i.length&&dt(i[t])){e++,t++;continue}if(t>=i.length){e++;continue}return-1}if(r==="L"&&e+2<h.length&&/\d/.test(h[e+1])&&/\d/.test(h[e+2])){let u=h[e+1]+h[e+2],n=Se[u];if(e+=3,n){let f=!1;for(let o of n)if(i.substring(t,t+o.length).toLowerCase()===o){t+=o.length,f=!0;break}if(!f)return-1}continue}if(t<i.length&&i[t].toLowerCase()===r.toLowerCase()){e++,t++;continue}return-1}return t-s}function dr(h,i,s){let e=h.length-1,t=s-1;for(;e>=0;){let r=h[e];if(r==="?"||r==="@"||r==="$")return s-t-1;if(r==="_"){if(t<0||!Z(i[t])){e--;continue}return-1}if(r==="#"){if(t<0||!Z(i[t])||he(i[t])){e--;continue}return-1}if(r==="&"||r==="@"){if(t>=0&&Z(i[t])){e--,t--;continue}return-1}if(r==="A"){if(t>=0&&he(i[t])){e--,t--;continue}return-1}if(r==="B"){if(t>=0&&fr.has(i[t].toLowerCase())){e--,t--;continue}return-1}if(r==="C"){if(t>=0&&dt(i[t])){e--,t--;continue}return-1}if(r==="D"){if(t>=0&&/\d/.test(i[t])){e--,t--;continue}return-1}if(r==="K"){if(t<0||!he(i[t])){e--,t>=0&&Z(i[t])&&t--;continue}return-1}if(r==="X"){if(t>=0&&Z(i[t])){e--,t--;continue}return-1}if(/\d/.test(r)&&e>=2&&/\d/.test(h[e-1])&&h[e-2]==="L"){let u=h[e-1]+r,n=Se[u];if(e-=3,n){let f=!1;for(let o of n){let a=t-o.length+1;if(a>=0&&i.substring(a,t+1).toLowerCase()===o){t=a-1,f=!0;break}}if(!f)return-1}continue}if(t>=0&&i[t].toLowerCase()===r.toLowerCase()){e--,t--;continue}return-1}return s-t-1}function ai(h){X.clear();for(let t of Object.keys(Se))delete Se[t];let i=h.split(`
`),s="",e=!1;for(let t=0;t<i.length;t++){let r=i[t],u=r.indexOf("//");if(u>=0&&(r=r.substring(0,u)),r=r.trimEnd(),!r.trim())continue;let n=r.match(/^\.L(\d+)\s+(.*)/);if(n){let o=n[1],a=n[2].trim().split(/\s+/);Se[o]=new Set(a.map(l=>l.toLowerCase()));continue}if(r.trim()===".replace"){e=!0;continue}if(r.trim().startsWith(".group")){e=!1,s=r.trim().substring(7).trim(),X.has(s)||X.set(s,[]);continue}if(e||!s&&!X.has(""))continue;let f=ni(r.trim());if(f){let o=s;X.has(o)||X.set(o,[]),X.get(o).push(f)}}}function ni(h){if(!h)return null;let i=0,s=!1,e=0;for(;e<h.length&&(h[e]===" "||h[e]==="	");)e++;if(h[e]==="?"||h[e]==="!"){h[e]==="!"&&h[e+1]==="?"||h[e]==="?"&&h[e+1]==="!"?(s=!0,e+=2):h[e]==="?"&&e++;let c="";for(;e<h.length&&/\d/.test(h[e]);)c+=h[e],e++;i=parseInt(c,10)||0}for(;e<h.length&&(h[e]===" "||h[e]==="	");)e++;let t=h.substring(e);if(!t)return null;let r="",u="",n="",f="",o=t.indexOf(")"),a=t.indexOf("("),l=0;for(o>=0&&(r=t.substring(0,o).trim(),l=o+1);l<t.length&&t[l]===" ";)l++;if(a>=0&&a>o){u=t.substring(l,a).trim();let c=a+1;for(;c<t.length&&t[c]!==" "&&t[c]!=="	";)c++;n=t.substring(a+1,c),f=t.substring(c).trim()}else{let c=l;for(;c<t.length&&t[c]!==" "&&t[c]!=="	";)c++;u=t.substring(l,c).trim(),f=t.substring(c).trim()}return u?{pattern:u,pre:r,post:n,phonemes:f,conditionNum:i,conditionNeg:s}:null}function oi(h){let i=h.toLowerCase(),s="",e=0;for(;e<i.length;){let t=null,r=0,u=-1,n=[];for(let a=Math.min(4,i.length-e);a>=1;a--){let l=i.substring(e,e+a);X.has(l)&&n.push(l)}let f=i[e];!n.includes(f)&&X.has(f)&&n.push(f);for(let a of n){let l=X.get(a);if(l)for(let c of l){if(c.conditionNum>0)continue;let d=c.pattern.toLowerCase();if(!i.startsWith(d,e))continue;let p=e+d.length;if(c.pre&&dr(c.pre,i,e)<0||c.post&&ur(c.post,i,p)<0)continue;let m=d.length*100+c.pre.length*10+c.post.length;m>u&&(u=m,t=c,r=d.length)}}let o=X.get("");if(o)for(let a of o){if(a.conditionNum>0)continue;let l=a.pattern.toLowerCase();if(!i.startsWith(l,e))continue;let c=e+l.length;if(a.pre&&dr(a.pre,i,e)<0||a.post&&ur(a.post,i,c)<0)continue;let d=l.length*100+a.pre.length*10+a.post.length;d>u&&(u=d,t=a,r=l.length)}t?(s+=t.phonemes,e+=r):e++}return s}function hr(h){let i=oi(h);return ri(i)}var lr=!1,ui=null;function pr(h){ui=h,ai(h),lr=!0}function ct(){return lr}var mr=new Map;Me.symbols.forEach((h,i)=>mr.set(h,i));function di(h){let s=(h.match(/[\p{L}\p{N}_]+|[^\p{L}\p{N}_\s]/gu)||[]).join(" "),e=[0];for(let t of s){let r=mr.get(t);r!==void 0&&e.push(r)}return e.push(0),e}var $e={a:"\u0250",an:"\u0250n",the:"\xF0\u0259",to:"t\u0259",of:"\u028Cv",in:"\u026An",on:"\u0254n",at:"\xE6t",by:"ba\u026A",for:"f\u0254\u02D0\u0279",or:"\u0254\u02D0\u0279",and:"\xE6nd",but:"b\u028Ct",that:"\xF0\xE6t",this:"\xF0\u026As",these:"\xF0i\u02D0z",those:"\xF0o\u028Az",i:"a\u026A",you:"ju\u02D0",he:"hi\u02D0",she:"\u0283i\u02D0",we:"wi\u02D0",it:"\u026At",is:"\u026Az",was:"w\u028Cz",are:"\u0251\u02D0\u0279",were:"w\u025C\u02D0",be:"bi\u02D0",been:"b\u026An",have:"h\xE6v",has:"h\xE6z",had:"h\xE6d",do:"du\u02D0",does:"d\u028Cz",did:"d\u026Ad",will:"w\u026Al",would:"w\u028Ad",could:"k\u028Ad",should:"\u0283\u028Ad",can:"k\xE6n",may:"me\u026A",might:"ma\u026At",must:"m\u028Cst",shall:"\u0283\xE6l",not:"n\u02CC\u0251\u02D0t",no:"n\u02C8o\u028A",if:"\u026Af",how:"h\u02CCa\u028A",with:"w\u026A\xF0",from:"f\u0279\u028Cm",your:"j\u028A\u0279",my:"ma\u026A",his:"h\u026Az",her:"h\u025C\u02D0",its:"\u026Ats",our:"a\u028A\u025A",their:"\xF0\u025B\u0279",some:"s\u02CC\u028Cm",new:"n\u02C8u\u02D0",all:"\u02C8\u0254\u02D0l"},ft=null,We=null;async function ci(){return ft||We||(We=(async()=>{let h=new Map;try{let i=await fetch(new URL("./espeak-en-dict.tsv",import.meta.url));if(!i.ok)throw new Error(`HTTP ${i.status}`);let e=(await i.text()).split(`
`);for(let t of e){if(!t)continue;let r=t.indexOf("	");if(r<0)continue;let u=t.substring(0,r),n=t.substring(r+1);h.set(u,n)}console.log(`Loaded espeak dictionary: ${h.size} entries`)}catch(i){throw i}return ft=h,h})(),We)}var Le=null;async function fi(){if(!ct())return Le||(Le=(async()=>{try{let h=await fetch(new URL("./en_rules",import.meta.url));if(!h.ok)throw new Error(`HTTP ${h.status}`);let i=await h.text();pr(i),console.log("Loaded espeak en_rules")}catch(h){throw h}})(),Le)}async function hi(h){let[i]=await Promise.all([ci(),fi()]),s=h.trim();if(!s)return"";let e=s.match(/\S+/g)||[],t=[],r=[],u=[];for(let o of e){let a=o,l="";for(;a.length>0&&/[;:,.!?¡¿—…""«»""]/.test(a[a.length-1]);)l=a[a.length-1]+l,a=a.slice(0,-1);let c="";for(;a.length>0&&/[;:,.!?¡¿—…""«»""]/.test(a[0]);)c+=a[0],a=a.slice(1);t.push(a),r.push(l),u.push(c)}let n=[],f=t.filter(o=>o.length>0).length;for(let o=0;o<t.length;o++){let a="";if(u[o]&&(a+=u[o]),t[o].length>0){let l=t[o].toLowerCase();f>1&&l in $e?a+=$e[l]:a+=gr(l,i,t[o])}r[o]&&(a+=r[o]),a&&n.push(a)}return n.join(" ")}function gr(h,i,s){if(i.has(h))return i.get(h);if(h.endsWith("'s")){let r=h.slice(0,-2);if(i.has(r))return i.get(r)+"z"}if(h.endsWith("s")&&h.length>2){let r=h.slice(0,-1);if(i.has(r)){let u=r[r.length-1],n="bdgjlmnrvwz".includes(u)||"aeiou".includes(u);return i.get(r)+(n?"z":"s")}if(h.endsWith("es")){let u=h.slice(0,-1);if(i.has(u))return i.get(u)+"z"}}if(h.endsWith("ed")&&h.length>3){let r=h.slice(0,-2);if(i.has(r))return i.get(r)+"d";let u=h.slice(0,-1);if(i.has(r+"e"))return i.get(r+"e").replace(/[ə]$/,"")+"d"}if(h.endsWith("ing")&&h.length>4){let r=h.slice(0,-3);if(i.has(r))return i.get(r)+"\u026A\u014B";if(i.has(r+"e"))return i.get(r+"e").replace(/[ə]$/,"")+"\u026A\u014B";if(r.length>1&&r[r.length-1]===r[r.length-2]){let u=r.slice(0,-1);if(i.has(u))return i.get(u)+"\u026A\u014B"}}if(h.endsWith("ly")&&h.length>3){let r=h.slice(0,-2);if(i.has(r))return i.get(r)+"li"}if(h.endsWith("er")&&h.length>3){let r=h.slice(0,-2);if(i.has(r))return i.get(r)+"\u025A";if(i.has(r+"e"))return i.get(r+"e").replace(/[ə]$/,"")+"\u025A"}if(h.endsWith("est")&&h.length>4){let r=h.slice(0,-3);if(i.has(r))return i.get(r)+"\u026Ast"}if(h.endsWith("ness")&&h.length>5){let r=h.slice(0,-4);if(i.has(r))return i.get(r)+"n\u0259s"}if(h.includes("-"))return h.split("-").map(n=>n in $e?$e[n]:gr(n,i)).join("");let e=s||h;if(e.length>=2&&e===e.toUpperCase()&&/^[A-Z]+$/.test(e)){let r=h.split("").map(u=>li[u]||u).join("");if(r!==h)return r}let t=pi(h,i);return t||(ct()?hr(h):gi(h))}var li={a:"\u02C8e\u026A",b:"b\u02C8i\u02D0",c:"s\u02C8i\u02D0",d:"d\u02C8i\u02D0",e:"\u02C8i\u02D0",f:"\u02C8\u025Bf",g:"d\u0292\u02C8i\u02D0",h:"\u02C8e\u026At\u0283",i:"\u02C8a\u026A",j:"d\u0292\u02C8e\u026A",k:"k\u02C8e\u026A",l:"\u02C8\u025Bl",m:"\u02C8\u025Bm",n:"\u02C8\u025Bn",o:"\u02C8o\u028A",p:"p\u02C8i\u02D0",q:"kj\u02C8u\u02D0",r:"\u02C8\u0251\u02D0\u0279",s:"\u02C8\u025Bs",t:"t\u02C8i\u02D0",u:"j\u02C8u\u02D0",v:"v\u02C8i\u02D0",w:"d\u02C8\u028Cb\u0259lj\u02CCu\u02D0",x:"\u02C8\u025Bks",y:"w\u02C8a\u026A",z:"z\u02C8i\u02D0"};function pi(h,i){for(let s=h.length-2;s>=2;s--){let e=h.slice(0,s),t=h.slice(s);if(i.has(e)&&i.has(t))return i.get(e)+i.get(t);if(t.endsWith("s")&&i.has(t.slice(0,-1))&&i.has(e)){let r=i.get(t.slice(0,-1));return i.get(e)+r+"z"}}return null}var mi={a:"\xE6",b:"b",c:"k",d:"d",e:"\u025B",f:"f",g:"\u0261",h:"h",i:"\u026A",j:"d\u0292",k:"k",l:"l",m:"m",n:"n",o:"\u0251\u02D0",p:"p",q:"k",r:"\u0279",s:"s",t:"t",u:"\u028C",v:"v",w:"w",x:"ks",y:"j",z:"z"};function gi(h){return h.split("").map(i=>mi[i]||i).join("")}async function bi(h){return{ids:di(await hi(h)),method:"dictionary"}}export{ut as KittenTTSEngine,bi as textToInputIds};
