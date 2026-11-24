// 图集服务：按"用到的字"在 Worker 生成图集，元数据与像素缓存进 IndexedDB
// 换字体时只重建受影响字体的图集，未变化字体命中缓存
import AtlasWorker from './atlas_worker?worker'
import type { AtlasRequest, AtlasResponse } from './atlas_worker'
import type { GlyphOutline } from './outline'
import type { SdfAtlasMeta, SdfGlyphRecord } from '@/types/domain'
import { SDF_CONFIG } from '@/config/standards'
import { atlasRepo, loadAtlasPixels, saveAtlasPixels } from '@/db/repos'
import { uid } from '@/utils/math'

interface PendingRequest {
  resolve: (meta: SdfAtlasMeta) => void
  reject: (err: Error) => void
}

class AtlasService {
  private worker: Worker | null = null
  private pending = new Map<string, PendingRequest>()
  private cachedMeta = new Map<string, SdfAtlasMeta>()
  private cachedPixels = new Map<string, Uint8Array>()

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new AtlasWorker()
      this.worker.onmessage = (ev: MessageEvent<AtlasResponse>) => {
        const { requestId, result } = ev.data
        const waiter = this.pending.get(requestId)
        if (!waiter) return
        this.pending.delete(requestId)
        try {
          const meta = this.toMeta(ev.data.fontId, result)
          const atlasPixels = new Uint8Array(result.atlas)
          this.cachedMeta.set(ev.data.fontId, meta)
          this.cachedPixels.set(meta.id, atlasPixels)
          void atlasRepo.save(meta)
          void saveAtlasPixels(meta.id, atlasPixels)
          waiter.resolve(meta)
        } catch (err) {
          waiter.reject(err as Error)
        }
      }
      this.worker.onerror = (ev) => {
        this.pending.forEach((w) => w.reject(new Error(ev.message)))
        this.pending.clear()
      }
    }
    return this.worker
  }

  private toMeta(fontId: string, result: AtlasResponse['result']): SdfAtlasMeta {
    const id = uid('atlas')
    const glyphs: Record<string, SdfGlyphRecord> = {}
    for (const [unicode, placement] of result.placements) {
      const key = `${fontId}:${unicode}`
      glyphs[key] = {
        glyphKey: key,
        unicode,
        atlasX: placement.x,
        atlasY: placement.y,
        advance: placement.outline.advance,
        xMin: placement.outline.xMin,
        yMin: placement.outline.yMin,
        xMax: placement.outline.xMax,
        yMax: placement.outline.yMax,
        bearingX: placement.glyph.padX,
        bearingY: placement.glyph.padY,
      }
    }
    return {
      id,
      fontId,
      version: 1,
      pxRange: SDF_CONFIG.pxRange,
      glyphSize: SDF_CONFIG.glyphSize,
      width: result.width,
      height: result.height,
      glyphs,
      missing: result.placements.filter(([, p]) => p.outline.advance === 0).map(([u]) => u),
    }
  }

  // 取字体图集：缓存命中直接返回，否则把用到的字形轮廓发 Worker 生成
  async ensureAtlas(fontId: string, outlines: GlyphOutline[]): Promise<{
    meta: SdfAtlasMeta
    pixels: Uint8Array
  }> {
    const cached = this.cachedMeta.get(fontId)
    if (cached) {
      const pixels = this.cachedPixels.get(cached.id)
      if (pixels) return { meta: cached, pixels }
    }
    const storedList = await atlasRepo.list()
    const stored = storedList.find((m) => m.fontId === fontId)
    if (stored) {
      const pixels = await loadAtlasPixels(stored.id)
      if (pixels) {
        this.cachedMeta.set(fontId, stored)
        this.cachedPixels.set(stored.id, pixels)
        return { meta: stored, pixels }
      }
    }
    const requestId = uid('req')
    const request: AtlasRequest = {
      requestId,
      fontId,
      outlines,
      glyphSize: SDF_CONFIG.glyphSize,
      pxRange: SDF_CONFIG.pxRange,
    }
    return new Promise((resolve, reject) => {
      this.pending.set(requestId, {
        resolve: (meta) =>
          resolve({ meta, pixels: this.cachedPixels.get(meta.id) ?? new Uint8Array() }),
        reject,
      })
      this.ensureWorker().postMessage(request)
    })
  }

  // 字体变更：清除该字体缓存，触发下一次 ensure 重建
  invalidate(fontId: string): void {
    const meta = this.cachedMeta.get(fontId)
    this.cachedMeta.delete(fontId)
    if (meta) {
      this.cachedPixels.delete(meta.id)
      void atlasRepo.remove(meta.id)
    }
  }
}

export const atlasService = new AtlasService()
