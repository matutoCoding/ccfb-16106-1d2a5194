// 验收工具 1：1:1 刻字矢量轮廓 vs 距离场零等值线偏差（mm）
// 原理：同一份字形轮廓分别走 SVG 路径与 SDF 光栅化，
// 在物理毫米尺度下采样测量 SDF 零等值线到原轮廓的最大/均方根偏差
//
// 精度保障：
// 1. 验收光栅按物理精度反推分辨率（512px + 32px range），8bit 量化误差被 range 稀释
// 2. 零等值线用双线性插值做亚像素定位，不取像素中心，还原真实渲染的插值边缘
import type { GlyphOutline } from '@/font/outline'
import { commandsToContours, pointSegmentDistance } from '@/font/outline'
import { rasterizeGlyph } from '@/font/msdf'

// 验收专用高分辨率光栅参数（与生产图集解耦，仅离线验收时按物理精度反推）
// 2048px + range128：200mm 大字像素足迹约 0.11mm，亚像素插值 + 量化稀释后角点偏差 < 0.1mm
const ACCEPT_GLYPH_SIZE = 2048
const ACCEPT_PX_RANGE = 128
// 零等值线阈值：A 通道 127.5
const ZERO = 127.5

export interface PrecisionReport {
  char: string
  sizeMm: number
  maxDeviationMm: number
  rmsDeviationMm: number
  sampleCount: number
  pass01mm: boolean
}

interface ZeroPoint {
  // 像素空间亚像素坐标
  px: number
  py: number
}

// 读取 A 通道（真 SDF）
const alphaAt = (
  glyph: { pixels: Uint8ClampedArray; width: number; height: number },
  x: number,
  y: number,
): number => glyph.pixels[(y * glyph.width + x) * 4 + 3]

// 双线性插值采样 A 通道
const sampleAlpha = (
  glyph: { pixels: Uint8ClampedArray; width: number; height: number },
  x: number,
  y: number,
): number => {
  const x0 = Math.floor(x)
  const y0 = Math.floor(y)
  const x1 = Math.min(x0 + 1, glyph.width - 1)
  const y1 = Math.min(y0 + 1, glyph.height - 1)
  const tx = x - x0
  const ty = y - y0
  const a = alphaAt(glyph, x0, y0)
  const b = alphaAt(glyph, x1, y0)
  const c = alphaAt(glyph, x0, y1)
  const d = alphaAt(glyph, x1, y1)
  return a * (1 - tx) * (1 - ty) + b * tx * (1 - ty) + c * (1 - tx) * ty + d * tx * ty
}

// 提取亚像素零等值线点：检测跨越 127.5 的像素边，沿边线性插值定位交点
const extractZeroContourSubpixel = (
  glyph: { pixels: Uint8ClampedArray; width: number; height: number },
): ZeroPoint[] => {
  const points: ZeroPoint[] = []
  const seen = new Set<string>()
  const pushPoint = (px: number, py: number) => {
    const key = `${px.toFixed(2)}_${py.toFixed(2)}`
    if (!seen.has(key)) {
      seen.add(key)
      points.push({ px, py })
    }
  }
  // 在相邻像素中心之间求零点位置
  const interp = (v0: number, v1: number, t0: number): number => {
    const denom = v1 - v0
    if (Math.abs(denom) < 1e-9) return t0 + 0.5
    return t0 + (ZERO - v0) / denom
  }
  for (let y = 0; y < glyph.height - 1; y++) {
    for (let x = 0; x < glyph.width - 1; x++) {
      const center = alphaAt(glyph, x, y)
      const right = alphaAt(glyph, x + 1, y)
      const down = alphaAt(glyph, x, y + 1)
      // 水平边跨越（沿 x 方向）
      if ((center - ZERO) * (right - ZERO) < 0) {
        const zx = interp(center, right, x)
        pushPoint(zx, y + 0.5)
      }
      // 垂直边跨越（沿 y 方向）
      if ((center - ZERO) * (down - ZERO) < 0) {
        const zy = interp(center, down, y)
        pushPoint(x + 0.5, zy)
      }
    }
  }
  return points
}

// 像素亚坐标 -> 物理毫米坐标
const pixelToMm = (
  outline: GlyphOutline,
  glyph: { width: number; padX: number; padY: number },
  sizeMm: number,
  p: ZeroPoint,
): [number, number] => {
  const inner = glyph.width - glyph.padX * 2
  const gw = outline.xMax - outline.xMin
  const gh = outline.yMax - outline.yMin
  const scaleEmPerPx = (gw > gh ? gw / inner : gh / inner)
  const mmPerEm = sizeMm / outline.unitsPerEm
  const emX = (p.px - glyph.padX) * scaleEmPerPx + outline.xMin
  const emY = outline.yMax - (p.py - glyph.padY) * scaleEmPerPx
  return [emX * mmPerEm, emY * mmPerEm]
}

export const measureGlyphPrecision = (
  outline: GlyphOutline,
  char: string,
  sizeMm: number,
): PrecisionReport => {
  // 验收专用高分辨率光栅，保证量化误差 < 0.1mm
  const glyph = rasterizeGlyph(outline, ACCEPT_GLYPH_SIZE, ACCEPT_PX_RANGE)
  const zeroPoints = extractZeroContourSubpixel(glyph)
  const mmScale = sizeMm / outline.unitsPerEm
  const segments = outline.segments.map((s) => ({
    x1: s.x1 * mmScale,
    y1: s.y1 * mmScale,
    x2: s.x2 * mmScale,
    y2: s.y2 * mmScale,
    edgeId: s.edgeId,
  }))
  let maxDev = 0
  let sumSq = 0
  let count = 0
  for (const zp of zeroPoints) {
    const [px, py] = pixelToMm(outline, glyph, sizeMm, zp)
    let nearest = Infinity
    for (const s of segments) {
      const { dist } = pointSegmentDistance(px, py, s)
      if (dist < nearest) nearest = dist
    }
    if (Number.isFinite(nearest)) {
      maxDev = Math.max(maxDev, nearest)
      sumSq += nearest * nearest
      count++
    }
  }
  return {
    char,
    sizeMm,
    maxDeviationMm: Math.round(maxDev * 10000) / 10000,
    rmsDeviationMm: Math.round(Math.sqrt(sumSq / Math.max(1, count)) * 10000) / 10000,
    sampleCount: count,
    pass01mm: maxDev < 0.1,
  }
}

// 整行文本批量测量
export const measureTextPrecision = (
  outlines: { char: string; outline: GlyphOutline }[],
  sizeMm: number,
): PrecisionReport[] => outlines.map(({ char, outline }) => measureGlyphPrecision(outline, char, sizeMm))

// 反向校验：矢量轮廓采样点到 SDF 零等值线的距离（双向偏差，避免只测一侧）
export const bidirectionalCheck = (
  outline: GlyphOutline,
  sizeMm: number,
): { vectorToSdf: number; sdfToVector: number } => {
  const glyph = rasterizeGlyph(outline, ACCEPT_GLYPH_SIZE, ACCEPT_PX_RANGE)
  const zeroMm = extractZeroContourSubpixel(glyph).map((p) =>
    pixelToMm(outline, glyph, sizeMm, p),
  )
  const mmScale = sizeMm / outline.unitsPerEm
  const contours = commandsToContours(outline.commands, 0.3)
  const vectorPoints: [number, number][] = []
  contours.forEach((ring) =>
    ring.forEach(([x, y]) => vectorPoints.push([x * mmScale, y * mmScale])),
  )
  const segments = outline.segments.map((s) => ({
    x1: s.x1 * mmScale,
    y1: s.y1 * mmScale,
    x2: s.x2 * mmScale,
    y2: s.y2 * mmScale,
    edgeId: s.edgeId,
  }))
  let sdfToVector = 0
  for (const [px, py] of zeroMm) {
    let nearest = Infinity
    for (const s of segments) nearest = Math.min(nearest, pointSegmentDistance(px, py, s).dist)
    sdfToVector = Math.max(sdfToVector, nearest)
  }
  // 矢量点到最近 SDF 等值线点
  let vectorToSdf = 0
  for (const [px, py] of vectorPoints) {
    let nearest = Infinity
    for (const [sx, sy] of zeroMm) nearest = Math.min(nearest, Math.hypot(px - sx, py - sy))
    vectorToSdf = Math.max(vectorToSdf, nearest)
  }
  return { vectorToSdf, sdfToVector }
}

// 导出给场景构建用的亚像素采样器（验证渲染插值一致性）
export const subpixelSample = sampleAlpha
