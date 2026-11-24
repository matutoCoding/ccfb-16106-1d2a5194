// 字形提供者：真实 TTF/OTF（opentype.js）与内置合成字体统一实现同一接口
import type { GlyphOutline, PathCommand } from './outline'
import { commandsToContours, contoursToSegments } from './outline'

export interface GlyphProvider {
  fontId: string
  family: string
  unitsPerEm: number
  hasGlyph: (unicode: number) => boolean
  getOutline: (unicode: number) => GlyphOutline | null
  getAdvance: (unicode: number) => number
}

// opentype.js 最小类型声明（只用到的部分）
interface OtPath {
  commands: {
    type: 'M' | 'L' | 'Q' | 'C' | 'Z'
    x?: number
    y?: number
    x1?: number
    y1?: number
    x2?: number
    y2?: number
  }[]
}
interface OtGlyph {
  index: number
  unicode: number | undefined
  advanceWidth?: number
  xMin?: number
  yMin?: number
  xMax?: number
  yMax?: number
  getPath: (x?: number, y?: number, fontSize?: number) => OtPath
}
interface OtFont {
  unitsPerEm: number
  charToGlyph: (ch: string) => OtGlyph | undefined
  glyphs: { get: (i: number) => OtGlyph | undefined }
  stringToGlyphs?: (s: string) => OtGlyph[]
}

export class OpenTypeProvider implements GlyphProvider {
  readonly fontId: string
  readonly family: string
  readonly unitsPerEm: number
  private font: OtFont
  private cache = new Map<number, GlyphOutline | null>()

  constructor(fontId: string, family: string, font: OtFont) {
    this.fontId = fontId
    this.family = family
    this.unitsPerEm = font.unitsPerEm
    this.font = font
  }

  hasGlyph(unicode: number): boolean {
    const g = this.font.charToGlyph(String.fromCodePoint(unicode))
    return Boolean(g && g.index !== 0 && g.unicode !== undefined)
  }

  getAdvance(unicode: number): number {
    return this.font.charToGlyph(String.fromCodePoint(unicode))?.advanceWidth ?? this.unitsPerEm
  }

  getOutline(unicode: number): GlyphOutline | null {
    if (this.cache.has(unicode)) return this.cache.get(unicode) ?? null
    const glyph = this.font.charToGlyph(String.fromCodePoint(unicode))
    if (!glyph || glyph.index === 0) {
      this.cache.set(unicode, null)
      return null
    }
    const path = glyph.getPath(0, 0, 1)
    const commands: PathCommand[] = path.commands.map((c) => {
      if (c.type === 'M' || c.type === 'L') return { type: c.type, x: c.x ?? 0, y: c.y ?? 0 }
      if (c.type === 'Q')
        return { type: 'Q', x1: c.x1 ?? 0, y1: c.y1 ?? 0, x: c.x ?? 0, y: c.y ?? 0 }
      if (c.type === 'C')
        return {
          type: 'C',
          x1: c.x1 ?? 0,
          y1: c.y1 ?? 0,
          x2: c.x2 ?? 0,
          y2: c.y2 ?? 0,
          x: c.x ?? 0,
          y: c.y ?? 0,
        }
      return { type: 'Z' }
    })
    const outline = this.buildOutline(unicode, commands, glyph)
    this.cache.set(unicode, outline)
    return outline
  }

  private buildOutline(
    unicode: number,
    commands: PathCommand[],
    glyph: OtGlyph,
  ): GlyphOutline {
    const contours = commandsToContours(commands, 0.5)
    const { segments, edgeCount, edgeColors } = contoursToSegments(contours)
    let xMin = Infinity
    let yMin = Infinity
    let xMax = -Infinity
    let yMax = -Infinity
    segments.forEach((s) => {
      xMin = Math.min(xMin, s.x1, s.x2)
      yMin = Math.min(yMin, s.y1, s.y2)
      xMax = Math.max(xMax, s.x1, s.x2)
      yMax = Math.max(yMax, s.y1, s.y2)
    })
    if (!segments.length) {
      xMin = yMin = xMax = yMax = 0
    }
    return {
      unicode,
      unitsPerEm: this.unitsPerEm,
      advance: glyph.advanceWidth ?? this.unitsPerEm,
      xMin: glyph.xMin ?? xMin,
      yMin: glyph.yMin ?? yMin,
      xMax: glyph.xMax ?? xMax,
      yMax: glyph.yMax ?? yMax,
      commands,
      segments,
      edgeCount,
      edgeColors,
    }
  }
}

export type { OtFont }
