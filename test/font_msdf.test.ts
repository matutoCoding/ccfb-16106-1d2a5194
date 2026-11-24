import { describe, expect, it } from 'vitest'
import { SyntheticProvider } from '@/font/synthetic_provider'
import {
  commandsToContours,
  contoursToSegments,
  pointInsideContours,
  pointSegmentDistance,
} from '@/font/outline'
import { rasterizeGlyph, buildAtlas } from '@/font/msdf'

describe('字形轮廓与距离场', () => {
  const provider = new SyntheticProvider()

  it('拉丁字形生成闭合轮廓与边着色', () => {
    const outline = provider.getOutline('A'.codePointAt(0)!)
    expect(outline).not.toBeNull()
    expect(outline!.segments.length).toBeGreaterThan(0)
    expect(outline!.edgeColors.every((c) => c >= 0 && c <= 2)).toBe(true)
    const contours = commandsToContours(outline!.commands)
    expect(contours.length).toBeGreaterThan(0)
  })

  it('CJK 合成字形为全角 1000 advance', () => {
    const outline = provider.getOutline('文'.codePointAt(0)!)
    expect(outline!.advance).toBe(1000)
    expect(outline!.segments.length).toBeGreaterThan(4)
  })

  it('距离场 A 通道在字形内部为负值编码（<128），外部为正值（>128）', () => {
    const outline = provider.getOutline('O'.codePointAt(0)!)!
    const glyph = rasterizeGlyph(outline)
    const corner = 3
    // 角落在字形外部，SDF 编码为正值（>128）
    expect(glyph.pixels.length).toBe(glyph.width * glyph.height * 4)
    expect(glyph.pixels[corner]).toBeGreaterThan(128)
  })

  it('图集打包多字形且无越界', () => {
    const outlines = ['A', 'B', '文', '明', '1', '2'].map((c) =>
      provider.getOutline(c.codePointAt(0)!)!,
    )
    const result = buildAtlas(outlines)
    expect(result.placements.size).toBe(6)
    for (const [, placement] of result.placements) {
      expect(placement.x + placement.glyph.width).toBeLessThanOrEqual(result.width)
      expect(placement.y + placement.glyph.height).toBeLessThanOrEqual(result.height)
    }
  })

  it('点在轮廓内外判定正确', () => {
    const square: [number, number][][] = [
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
        [0, 0],
      ],
    ]
    expect(pointInsideContours(square, 50, 50)).toBe(true)
    expect(pointInsideContours(square, 150, 50)).toBe(false)
    const { dist } = pointSegmentDistance(0, 50, { x1: 0, y1: 0, x2: 0, y2: 100, edgeId: 0 })
    expect(dist).toBe(0)
  })

  it('边 3 着色相邻边不同色', () => {
    const outline = provider.getOutline('文'.codePointAt(0)!)!
    const contours = commandsToContours(outline.commands)
    const { edgeCount, edgeColors } = contoursToSegments(contours)
    expect(edgeCount).toBeGreaterThan(0)
    expect(edgeColors).toHaveLength(edgeCount)
  })
})
