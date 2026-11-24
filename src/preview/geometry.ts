// 三维几何工具：盒子网格、平面网格、字形拉伸（亚克力立体字）
import earcut from 'earcut'

export interface MeshData {
  positions: Float32Array
  normals: Float32Array
  indices: Uint32Array
  // 材质分组 [起始 index, 数量, 材质键]
  groups: [number, number, string][]
}

// 轴对齐盒子，中心 (cx, cy, cz)，尺寸 (w, h, d)
export const boxMesh = (
  cx: number,
  cy: number,
  cz: number,
  w: number,
  h: number,
  d: number,
  material = 'default',
): MeshData => {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const y0 = cy - h / 2
  const y1 = cy + h / 2
  const z0 = cz - d / 2
  const z1 = cz + d / 2
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const face = (verts: number[][], normal: number[]) => {
    const base = positions.length / 3
    verts.forEach((v) => positions.push(...v))
    for (let i = 0; i < 4; i++) normals.push(...normal)
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
  }
  face([[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1])
  face([[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1])
  face([[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0])
  face([[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0])
  face([[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0])
  face([[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1]], [0, -1, 0])
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    groups: [[0, indices.length, material]],
  }
}

// 竖直平面（展板底板），中心定位，法线朝 +Z
export const planeMesh = (
  cx: number,
  cy: number,
  z: number,
  w: number,
  h: number,
  material = 'panel',
): MeshData => {
  const x0 = cx - w / 2
  const x1 = cx + w / 2
  const y0 = cy - h / 2
  const y1 = cy + h / 2
  const positions = new Float32Array([
    x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z,
  ])
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1])
  const indices = new Uint32Array([0, 1, 2, 0, 2, 3])
  return { positions, normals, indices, groups: [[0, 6, material]] }
}

// 字形拉伸：把字形轮廓环沿 Z 挤出厚度（亚克力立体字）
// 轮廓坐标为 em，外部负责缩放到毫米并平移
export const extrudeContours = (
  contours: [number, number][][],
  thickness: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  material = 'acrylic',
): MeshData => {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const groupStart: [number, number, string][] = []

  const tx = (x: number) => x * scale + offsetX
  const ty = (y: number) => y * scale + offsetY

  for (const ring of contours) {
    const pts = ring.slice(0, -1)
    const flat: number[] = []
    pts.forEach(([x, y]) => flat.push(tx(x), ty(y)))
    const triIndices = earcut(flat)
    const frontBase = positions.length / 3
    // 前面
    pts.forEach(([x, y]) => {
      positions.push(tx(x), ty(y), thickness / 2)
      normals.push(0, 0, 1)
    })
    for (let i = 0; i < triIndices.length; i += 3) {
      indices.push(
        frontBase + triIndices[i],
        frontBase + triIndices[i + 1],
        frontBase + triIndices[i + 2],
      )
    }
    // 后面（反向）
    const backBase = positions.length / 3
    pts.forEach(([x, y]) => {
      positions.push(tx(x), ty(y), -thickness / 2)
      normals.push(0, 0, -1)
    })
    for (let i = 0; i < triIndices.length; i += 3) {
      indices.push(
        backBase + triIndices[i + 2],
        backBase + triIndices[i + 1],
        backBase + triIndices[i],
      )
    }
    // 侧面：每条轮廓边一个四边形
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i]
      const b = pts[(i + 1) % pts.length]
      const ax = tx(a[0])
      const ay = ty(a[1])
      const bx = tx(b[0])
      const by = ty(b[1])
      const dx = bx - ax
      const dy = by - ay
      const len = Math.hypot(dx, dy) || 1
      const nx = dy / len
      const ny = -dx / len
      const base = positions.length / 3
      positions.push(
        ax, ay, thickness / 2,
        bx, by, thickness / 2,
        bx, by, -thickness / 2,
        ax, ay, -thickness / 2,
      )
      for (let k = 0; k < 4; k++) normals.push(nx, ny, 0)
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3)
    }
  }
  groupStart.push([0, indices.length, material])
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    groups: groupStart,
  }
}

// 合并多个网格
export const mergeMeshes = (meshes: MeshData[]): MeshData => {
  const positions: number[] = []
  const normals: number[] = []
  const indices: number[] = []
  const groups: [number, number, string][] = []
  for (const mesh of meshes) {
    const vertexOffset = positions.length / 3
    const indexOffset = indices.length
    positions.push(...mesh.positions)
    normals.push(...mesh.normals)
    mesh.indices.forEach((i) => indices.push(i + vertexOffset))
    mesh.groups.forEach(([start, count, mat]) => groups.push([indexOffset + start, count, mat]))
  }
  return {
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices: new Uint32Array(indices),
    groups,
  }
}
