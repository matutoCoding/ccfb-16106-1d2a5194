// 字形轮廓统一抽象：SVG 矢量导出与 SDF 光栅化共用同一份轮廓数据
// 这是"1:1 刻字轮廓与屏幕距离场渲染偏差 < 0.1mm"验收的单一数据源

export type PathCommand =
  | { type: 'M'; x: number; y: number }
  | { type: 'L'; x: number; y: number }
  | { type: 'Q'; x1: number; y1: number; x: number; y: number }
  | { type: 'C'; x1: number; y1: number; x2: number; y2: number; x: number; y: number }
  | { type: 'Z' }

export interface Segment {
  x1: number
  y1: number
  x2: number
  y2: number
  edgeId: number // 所属边（角点之间为一条边），用于 MSDF 边着色
}

export interface GlyphOutline {
  unicode: number
  unitsPerEm: number
  advance: number
  xMin: number
  yMin: number
  xMax: number
  yMax: number
  commands: PathCommand[] // 原始曲线命令，SVG 导出用
  segments: Segment[] // 扁平化线段，距离场用
  edgeCount: number
  // 每条边的颜色编号 0/1/2，下标为 edgeId
  edgeColors: number[]
}

// 贝塞尔扁平化：递归中点细分，直到弦高足够小
const flattenQuadratic = (
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  tolerance: number,
  out: [number, number][],
): void => {
  const chord = Math.hypot(p2[0] - p0[0], p2[1] - p0[1])
  if (chord < tolerance * 4) {
    out.push(p2)
    return
  }
  const midChord: [number, number] = [(p0[0] + p2[0]) / 2, (p0[1] + p2[1]) / 2]
  const ctrlMid: [number, number] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
  const ctrlMid2: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
  const mid1: [number, number] = [(ctrlMid[0] + ctrlMid2[0]) / 2, (ctrlMid[1] + ctrlMid2[1]) / 2]
  const deviation = Math.hypot(mid1[0] - midChord[0], mid1[1] - midChord[1])
  if (deviation < tolerance) {
    out.push(p2)
    return
  }
  flattenQuadratic(p0, ctrlMid, mid1, tolerance, out)
  flattenQuadratic(mid1, ctrlMid2, p2, tolerance, out)
}

const flattenCubic = (
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  tolerance: number,
  out: [number, number][],
): void => {
  const chord = Math.hypot(p3[0] - p0[0], p3[1] - p0[1])
  if (chord < tolerance * 4) {
    out.push(p3)
    return
  }
  const midChord: [number, number] = [(p0[0] + p3[0]) / 2, (p0[1] + p3[1]) / 2]
  const p01: [number, number] = [(p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2]
  const p12: [number, number] = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2]
  const p23: [number, number] = [(p2[0] + p3[0]) / 2, (p2[1] + p3[1]) / 2]
  const p012: [number, number] = [(p01[0] + p12[0]) / 2, (p01[1] + p12[1]) / 2]
  const p123: [number, number] = [(p12[0] + p23[0]) / 2, (p12[1] + p23[1]) / 2]
  const mid: [number, number] = [(p012[0] + p123[0]) / 2, (p012[1] + p123[1]) / 2]
  const deviation = Math.hypot(mid[0] - midChord[0], mid[1] - midChord[1])
  if (deviation < tolerance) {
    out.push(p3)
    return
  }
  flattenCubic(p0, p01, p012, mid, tolerance, out)
  flattenCubic(mid, p123, p23, p3, tolerance, out)
}

// 把路径命令转为轮廓环（每环一组点），em 坐标
export const commandsToContours = (
  commands: PathCommand[],
  tolerance = 0.5,
): [number, number][][] => {
  const contours: [number, number][][] = []
  let current: [number, number][] = []
  let start: [number, number] | null = null
  let cursor: [number, number] = [0, 0]
  for (const cmd of commands) {
    if (cmd.type === 'M') {
      if (current.length) contours.push(current)
      cursor = [cmd.x, cmd.y]
      start = cursor
      current = [cursor]
    } else if (cmd.type === 'L') {
      cursor = [cmd.x, cmd.y]
      current.push(cursor)
    } else if (cmd.type === 'Q') {
      const pts: [number, number][] = []
      flattenQuadratic(cursor, [cmd.x1, cmd.y1], [cmd.x, cmd.y], tolerance, pts)
      pts.forEach((p) => current.push(p))
      cursor = [cmd.x, cmd.y]
    } else if (cmd.type === 'C') {
      const pts: [number, number][] = []
      flattenCubic(
        cursor,
        [cmd.x1, cmd.y1],
        [cmd.x2, cmd.y2],
        [cmd.x, cmd.y],
        tolerance,
        pts,
      )
      pts.forEach((p) => current.push(p))
      cursor = [cmd.x, cmd.y]
    } else if (cmd.type === 'Z') {
      if (start) current.push(start)
      if (current.length) contours.push(current)
      current = []
      start = null
    }
  }
  if (current.length) contours.push(current)
  return contours
}

// 角点检测：相邻线段转角大于阈值即视为角点
const cornerAngles = (contour: [number, number][], thresholdDeg: number): boolean[] => {
  const n = contour.length
  const isCorner = new Array<boolean>(n).fill(false)
  const cosThreshold = Math.cos((thresholdDeg * Math.PI) / 180)
  for (let i = 1; i < n - 1; i++) {
    const a = contour[i - 1]
    const b = contour[i]
    const c = contour[i + 1]
    const v1x = b[0] - a[0]
    const v1y = b[1] - a[1]
    const v2x = c[0] - b[0]
    const v2y = c[1] - b[1]
    const l1 = Math.hypot(v1x, v1y)
    const l2 = Math.hypot(v2x, v2y)
    if (l1 === 0 || l2 === 0) continue
    const cos = (v1x * v2x + v1y * v2y) / (l1 * l2)
    if (cos < cosThreshold) isCorner[i] = true
  }
  return isCorner
}

// 由轮廓环构建线段并做边 3 着色（相邻边不同色），生成 MSDF 所需 edgeColors
export const contoursToSegments = (
  contours: [number, number][][],
): { segments: Segment[]; edgeCount: number; edgeColors: number[] } => {
  const segments: Segment[] = []
  // 先收集每条边（角点之间）包含的线段
  const edgeSegs: { x1: number; y1: number; x2: number; y2: number }[][] = []
  for (const contour of contours) {
    if (contour.length < 3) continue
    const closed =
      contour[0][0] === contour[contour.length - 1][0] &&
      contour[0][1] === contour[contour.length - 1][1]
    const ring = closed ? contour.slice(0, -1) : contour
    const corners = cornerAngles([...ring, ring[0]], 28)
    let active: { x1: number; y1: number; x2: number; y2: number }[] = []
    const flush = () => {
      if (active.length) {
        edgeSegs.push(active)
        active = []
      }
    }
    for (let i = 0; i < ring.length; i++) {
      const a = ring[i]
      const b = ring[(i + 1) % ring.length]
      if (i > 0 && corners[i]) flush()
      active.push({ x1: a[0], y1: a[1], x2: b[0], y2: b[1] })
    }
    flush()
  }
  // 贪心 3 着色：边按邻接（共享端点）冲突
  const adjacency: Set<number>[] = edgeSegs.map(() => new Set())
  const endpointEdges = new Map<string, number[]>()
  edgeSegs.forEach((segs, edgeId) => {
    const keys = [
      `${segs[0].x1.toFixed(2)},${segs[0].y1.toFixed(2)}`,
      `${segs[segs.length - 1].x2.toFixed(2)},${segs[segs.length - 1].y2.toFixed(2)}`,
    ]
    keys.forEach((k) => {
      const list = endpointEdges.get(k) ?? []
      list.forEach((other) => {
        adjacency[edgeId].add(other)
        adjacency[other].add(edgeId)
      })
      list.push(edgeId)
      endpointEdges.set(k, list)
    })
  })
  const colors = edgeSegs.map(() => -1)
  for (let i = 0; i < edgeSegs.length; i++) {
    const used = new Set<number>()
    adjacency[i].forEach((j) => {
      if (colors[j] >= 0) used.add(colors[j])
    })
    colors[i] = [0, 1, 2].find((c) => !used.has(c)) ?? 0
  }
  edgeSegs.forEach((segs, edgeId) => {
    segs.forEach((s) => segments.push({ ...s, edgeId }))
  })
  return { segments, edgeCount: edgeSegs.length, edgeColors: colors }
}

// 奇偶规则点在多边形内判定（多轮廓合并）
export const pointInsideContours = (
  contours: [number, number][][],
  x: number,
  y: number,
): boolean => {
  let inside = false
  for (const ring of contours) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0]
      const yi = ring[i][1]
      const xj = ring[j][0]
      const yj = ring[j][1]
      const intersect =
        yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi || 1e-12) + xi
      if (intersect) inside = !inside
    }
  }
  return inside
}

// 点到线段距离
export const pointSegmentDistance = (
  px: number,
  py: number,
  s: Segment,
): { dist: number; cx: number; cy: number } => {
  const dx = s.x2 - s.x1
  const dy = s.y2 - s.y1
  const lenSq = dx * dx + dy * dy
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - s.x1) * dx + (py - s.y1) * dy) / lenSq))
  const cx = s.x1 + t * dx
  const cy = s.y1 + t * dy
  return { dist: Math.hypot(px - cx, py - cy), cx, cy }
}
