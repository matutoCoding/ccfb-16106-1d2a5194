// 多通道距离场生成器（Worker 内运行）
// A 通道：真 SDF（所有边的最小有符号距离），保证轮廓零等值线精度
// RGB：按边 3 着色的各通道最近距离，shader 取 median 保留尖角
import type { GlyphOutline } from './outline'
import { pointInsideContours, pointSegmentDistance, commandsToContours } from './outline'
import { SDF_CONFIG } from '@/config/standards'

export interface RasterizedGlyph {
  pixels: Uint8ClampedArray
  width: number
  height: number
  // 字形在格内的偏移（像素，相对格子左上角）
  padX: number
  padY: number
}

interface Cell {
  ids: number[]
}

// 均匀网格空间索引，把"到所有线段"的 O(n) 压到局部邻域
class SegmentGrid {
  private cellSize: number
  private cols: number
  private rows: number
  private cells = new Map<number, Cell>()

  constructor(width: number, height: number, cellSize: number) {
    this.cellSize = Math.max(4, cellSize)
    this.cols = Math.ceil(width / this.cellSize) + 1
    this.rows = Math.ceil(height / this.cellSize) + 1
  }

  private key = (cx: number, cy: number): number => cy * this.cols + cx

  add(id: number, x1: number, y1: number, x2: number, y2: number): void {
    const minCx = Math.max(0, Math.floor(Math.min(x1, x2) / this.cellSize))
    const maxCx = Math.min(this.cols - 1, Math.floor(Math.max(x1, x2) / this.cellSize))
    const minCy = Math.max(0, Math.floor(Math.min(y1, y2) / this.cellSize))
    const maxCy = Math.min(this.rows - 1, Math.floor(Math.max(y1, y2) / this.cellSize))
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const k = this.key(cx, cy)
        let cell = this.cells.get(k)
        if (!cell) {
          cell = { ids: [] }
          this.cells.set(k, cell)
        }
        cell.ids.push(id)
      }
    }
  }

  // 收集 px 半径内可能相关的线段 id
  nearby(x: number, y: number, radius: number): number[] {
    const minCx = Math.max(0, Math.floor((x - radius) / this.cellSize))
    const maxCx = Math.min(this.cols - 1, Math.floor((x + radius) / this.cellSize))
    const minCy = Math.max(0, Math.floor((y - radius) / this.cellSize))
    const maxCy = Math.min(this.rows - 1, Math.floor((y + radius) / this.cellSize))
    const out: number[] = []
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        this.cells.get(this.key(cx, cy))?.ids.forEach((id) => out.push(id))
      }
    }
    return out
  }
}

// 单字形光栅化为 RGBA 距离场块
export const rasterizeGlyph = (
  outline: GlyphOutline,
  glyphSize: number = SDF_CONFIG.glyphSize,
  pxRange: number = SDF_CONFIG.pxRange,
): RasterizedGlyph => {
  const pad = pxRange + SDF_CONFIG.atlasPadding
  const gw = outline.xMax - outline.xMin
  const gh = outline.yMax - outline.yMin
  const inner = glyphSize - pad * 2
  const scale = gw > gh ? inner / (gw || 1) : inner / (gh || 1)
  const width = glyphSize
  const height = glyphSize
  const pixels = new Uint8ClampedArray(width * height * 4)

  // em -> 像素变换后的线段
  const segs = outline.segments.map((s) => ({
    x1: (s.x1 - outline.xMin) * scale + pad,
    y1: (outline.yMax - s.y1) * scale + pad, // y 翻转
    x2: (s.x2 - outline.xMin) * scale + pad,
    y2: (outline.yMax - s.y2) * scale + pad,
    edgeId: s.edgeId,
  }))
  const contours = commandsToContours(outline.commands, 0.5).map((ring) =>
    ring.map(
      ([x, y]) =>
        [(x - outline.xMin) * scale + pad, (outline.yMax - y) * scale + pad] as [number, number],
    ),
  )

  const grid = new SegmentGrid(width, height, pxRange * 2)
  segs.forEach((s, id) => grid.add(id, s.x1, s.y1, s.x2, s.y2))

  const encode = (distPx: number): number => Math.round(255 * (0.5 + distPx / (2 * pxRange)))

  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const x = px + 0.5
      const y = py + 0.5
      const candidateIds = grid.nearby(x, y, pxRange + 2)
      let minDist = Infinity
      const channelDist = [Infinity, Infinity, Infinity]
      for (const id of candidateIds) {
        const s = segs[id]
        const { dist } = pointSegmentDistance(x, y, s)
        if (dist < minDist) minDist = dist
        const color = outline.edgeColors[s.edgeId] ?? 0
        if (dist < channelDist[color]) channelDist[color] = dist
      }
      if (!candidateIds.length) minDist = pxRange * 2
      const inside = pointInsideContours(contours, x, y)
      const signed = inside ? -minDist : minDist
      const idx = (py * width + px) * 4
      // 颜色通道：各自最近边的有符号距离；未触达的通道用整体最近值补
      const fallback = channelDist.find((d) => Number.isFinite(d)) ?? minDist
      for (let c = 0; c < 3; c++) {
        const d = Number.isFinite(channelDist[c]) ? channelDist[c] : fallback
        pixels[idx + c] = encode(inside ? -d : d)
      }
      pixels[idx + 3] = encode(signed)
    }
  }
  return { pixels, width, height, padX: pad, padY: pad }
}

// 图集分配结果
export interface AtlasBuildResult {
  atlas: Uint8ClampedArray
  width: number
  height: number
  placements: Map<
    number,
    { x: number; y: number; glyph: RasterizedGlyph; outline: GlyphOutline }
  >
}

// 把一批字形打包进正方形图集
export const buildAtlas = (
  outlines: GlyphOutline[],
  glyphSize: number = SDF_CONFIG.glyphSize,
  pxRange: number = SDF_CONFIG.pxRange,
): AtlasBuildResult => {
  const cols = Math.ceil(Math.sqrt(outlines.length)) || 1
  const rows = Math.ceil(outlines.length / cols)
  const width = Math.min(SDF_CONFIG.maxAtlasSize, cols * glyphSize)
  const height = Math.min(SDF_CONFIG.maxAtlasSize, rows * glyphSize)
  const atlas = new Uint8ClampedArray(width * height * 4)
  const placements = new Map<
    number,
    { x: number; y: number; glyph: RasterizedGlyph; outline: GlyphOutline }
  >()
  outlines.forEach((outline, i) => {
    const glyph = rasterizeGlyph(outline, glyphSize, pxRange)
    const col = i % cols
    const row = Math.floor(i / cols)
    const x = col * glyphSize
    const y = row * glyphSize
    for (let gy = 0; gy < glyph.height; gy++) {
      const src = gy * glyph.width * 4
      const dst = ((y + gy) * width + x) * 4
      atlas.set(glyph.pixels.subarray(src, src + glyph.width * 4), dst)
    }
    placements.set(outline.unicode, { x, y, glyph, outline })
  })
  return { atlas, width, height, placements }
}
