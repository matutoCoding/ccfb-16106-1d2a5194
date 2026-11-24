// SDF 图集生成 Worker：主线程传轮廓数据，Worker 生成图集像素回传
import { buildAtlas, type AtlasBuildResult } from './msdf'
import type { GlyphOutline } from './outline'

export interface AtlasRequest {
  requestId: string
  fontId: string
  outlines: GlyphOutline[]
  glyphSize: number
  pxRange: number
}

export interface AtlasResponse {
  requestId: string
  fontId: string
  result: Omit<AtlasBuildResult, 'placements'> & {
    placements: [
      number,
      {
        x: number
        y: number
        glyph: { width: number; height: number; padX: number; padY: number }
        outline: {
          unicode: number
          unitsPerEm: number
          advance: number
          xMin: number
          yMin: number
          xMax: number
          yMax: number
        }
      },
    ][]
  }
}

self.onmessage = (ev: MessageEvent<AtlasRequest>) => {
  const { requestId, fontId, outlines, glyphSize, pxRange } = ev.data
  const built = buildAtlas(outlines, glyphSize, pxRange)
  const response: AtlasResponse = {
    requestId,
    fontId,
    result: {
      atlas: built.atlas,
      width: built.width,
      height: built.height,
      placements: [...built.placements.entries()].map(([unicode, p]) => [
        unicode,
        {
          x: p.x,
          y: p.y,
          glyph: { width: p.glyph.width, height: p.glyph.height, padX: p.glyph.padX, padY: p.glyph.padY },
          outline: {
            unicode: p.outline.unicode,
            unitsPerEm: p.outline.unitsPerEm,
            advance: p.outline.advance,
            xMin: p.outline.xMin,
            yMin: p.outline.yMin,
            xMax: p.outline.xMax,
            yMax: p.outline.yMax,
          },
        },
      ]),
    },
  }
  ;(self as unknown as Worker).postMessage(response)
}
