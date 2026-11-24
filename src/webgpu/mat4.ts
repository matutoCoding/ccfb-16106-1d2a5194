// 列主序 4x4 矩阵工具（WebGPU 兼容）
export type Mat4 = Float32Array
export type Vec3 = [number, number, number]

export const mat4Identity = (): Mat4 =>
  new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1])

export const mat4Multiply = (a: Mat4, b: Mat4): Mat4 => {
  const out = new Float32Array(16)
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[col * 4 + k]
      out[col * 4 + row] = sum
    }
  }
  return out
}

export const mat4Perspective = (fovyRad: number, aspect: number, near: number, far: number): Mat4 => {
  const f = 1 / Math.tan(fovyRad / 2)
  const nf = 1 / (near - far)
  return new Float32Array([
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, near * far * nf, 0,
  ])
}

export const mat4Ortho = (left: number, right: number, bottom: number, top: number, near: number, far: number): Mat4 =>
  new Float32Array([
    2 / (right - left), 0, 0, 0,
    0, 2 / (top - bottom), 0, 0,
    0, 0, 1 / (near - far), 0,
    -(right + left) / (right - left),
    -(top + bottom) / (top - bottom),
    near / (near - far),
    1,
  ])

const normalize3 = (v: Vec3): Vec3 => {
  const len = Math.hypot(v[0], v[1], v[2]) || 1
  return [v[0] / len, v[1] / len, v[2] / len]
}

const cross3 = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
]

const dot3 = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

const sub3 = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]

export const mat4LookAt = (eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Mat4 => {
  const z = normalize3(sub3(eye, target))
  const x = normalize3(cross3(up, z))
  const y = cross3(z, x)
  return new Float32Array([
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot3(x, eye), -dot3(y, eye), -dot3(z, eye), 1,
  ])
}

export const mat4Translate = (tx: number, ty: number, tz: number): Mat4 => {
  const m = mat4Identity()
  m[12] = tx
  m[13] = ty
  m[14] = tz
  return m
}
