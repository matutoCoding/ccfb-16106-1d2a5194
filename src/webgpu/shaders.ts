// 距离场文字 WGSL 着色器
// median(rgb) 保留尖角；alpha 通道真 SDF 保证轮廓零等值线精度
// 抗锯齿宽度按屏幕像素导数自适应；远距小字按物理模糊模型糊成灰块

export const TEXT_WGSL = /* wgsl */ `
struct Uniforms {
  viewProj: mat4x4<f32>,
  cameraPos: vec3<f32>,
  fogNear: f32,
  fogFar: f32,
  screenHeightPx: f32,
  blurStartDistance: f32,
  _pad: vec3<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var atlas: texture_2d<f32>;
@group(0) @binding(2) var atlasSampler: sampler;

struct VertexOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) color: vec4<f32>,
  @location(2) worldPos: vec3<f32>,
  @location(3) blur: f32,
};

@vertex
fn vs_main(
  @location(0) position: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) color: vec4<f32>,
  @location(3) worldPos: vec3<f32>,
) -> VertexOut {
  var out: VertexOut;
  out.clip = uniforms.viewProj * vec4<f32>(position, 1.0);
  out.uv = uv;
  out.color = color;
  out.worldPos = worldPos;
  let dist = distance(uniforms.cameraPos, worldPos);
  // 超过清晰距离后线性增加模糊，模拟人眼对远距小字的解析极限
  out.blur = clamp((dist - uniforms.blurStartDistance) /
    max(uniforms.fogFar - uniforms.blurStartDistance, 1.0), 0.0, 1.0);
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let sample = textureSample(atlas, atlasSampler, in.uv);
  // MSDF：三通道中位数决定边缘，A 通道为真 SDF 轮廓距离
  let median = max(min(sample.r, sample.g), min(max(sample.r, sample.g), sample.b));
  let sdx = fwidth(median);
  let sda = fwidth(sample.a);
  // 自适应抗锯齿：屏幕像素导数决定过渡带宽，斜看透视压缩时同样平滑
  let aaEdge = clamp(0.5 + (median - 0.5) / max(sdx, 1e-5) * 0.5, 0.0, 1.0);
  let aaContour = clamp(0.5 + (sample.a - 0.5) / max(sda, 1e-5) * 0.5, 0.0, 1.0);
  // 以 median 边缘为主，A 通道约束轮廓，避免尖角处通道偏差产生毛边
  var alpha = mix(aaContour, aaEdge, 0.85);

  // 远距物理模糊：把硬边缘按 blur 量向灰块收敛，而非强行保持锐利
  if (in.blur > 0.0) {
    let soft = clamp(0.5 + (median - 0.5) / max(sdx * (1.0 + in.blur * 6.0), 1e-5) * 0.5, 0.0, 1.0);
    alpha = mix(alpha, soft, in.blur * 0.9);
  }
  if (alpha < 0.02) {
    discard;
  }
  return vec4<f32>(in.color.rgb, in.color.a * alpha);
}
`

export const SHAPE_WGSL = /* wgsl */ `
struct CameraUniforms {
  viewProj: mat4x4<f32>,
  cameraPos: vec3<f32>,
  lightDir: vec3<f32>,
  lightColor: vec3<f32>,
  ambient: f32,
  _pad: vec3<f32>,
};

@group(0) @binding(0) var<uniform> uniforms: CameraUniforms;

struct VertexOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) worldPos: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) shininess: f32,
};

@vertex
fn vs_main(
  @location(0) position: vec3<f32>,
  @location(1) normal: vec3<f32>,
  @location(2) color: vec4<f32>,
  @location(3) shininess: f32,
) -> VertexOut {
  var out: VertexOut;
  out.clip = uniforms.viewProj * vec4<f32>(position, 1.0);
  out.normal = normalize(normal);
  out.worldPos = position;
  out.color = color;
  out.shininess = shininess;
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let n = normalize(in.normal);
  let l = normalize(uniforms.lightDir);
  let diffuse = max(dot(n, l), 0.0);
  let view = normalize(uniforms.cameraPos - in.worldPos);
  let halfv = normalize(l + view);
  let spec = pow(max(dot(n, halfv), 0.0), in.shininess) * 0.35;
  let lit = uniforms.ambient + diffuse * (1.0 - uniforms.ambient);
  return vec4<f32>(in.color.rgb * lit * uniforms.lightColor + vec3<f32>(spec), in.color.a);
}
`

export const GLARE_WGSL = /* wgsl */ `
struct Uniforms {
  viewProj: mat4x4<f32>,
};
@group(0) @binding(0) var<uniform> uniforms: Uniforms;

struct VertexOut {
  @builtin(position) clip: vec4<f32>,
  @location(0) local: vec2<f32>,
  @location(1) params: vec4<f32>,
};

@vertex
fn vs_main(
  @location(0) position: vec3<f32>,
  @location(1) local: vec2<f32>,
  @location(2) params: vec4<f32>,
) -> VertexOut {
  var out: VertexOut;
  out.clip = uniforms.viewProj * vec4<f32>(position, 1.0);
  out.local = local;
  out.params = params;
  return out;
}

@fragment
fn fs_main(in: VertexOut) -> @location(0) vec4<f32> {
  let rx = max(in.params.z, 1.0);
  let ry = max(in.params.w, 1.0);
  let q = (in.local.x * in.local.x) / (rx * rx) + (in.local.y * in.local.y) / (ry * ry);
  if (q > 1.0) {
    discard;
  }
  let intensity = in.params.x * in.params.y * (1.0 - q);
  return vec4<f32>(1.0, 0.96, 0.85, intensity * 0.42);
}
`
