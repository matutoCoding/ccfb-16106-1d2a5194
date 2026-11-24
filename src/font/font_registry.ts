// 字体注册中心：管理 Provider 生命周期与缺字回退链
import { parse as parseFont } from 'opentype.js'
import type { GlyphOutline } from './outline'
import { OpenTypeProvider, type GlyphProvider, type OtFont } from './opentype_provider'
import { SyntheticProvider } from './synthetic_provider'
import { fontRepo, loadFontBuffer } from '@/db/repos'
import type { FontAsset } from '@/types/domain'
import { uid } from '@/utils/math'

export const SYNTHETIC_FONT_ID = 'synthetic-hei'

export class FontRegistry {
  private providers = new Map<string, GlyphProvider>()
  private assets = new Map<string, FontAsset>()
  private loading = new Map<string, Promise<GlyphProvider>>()

  constructor() {
    const synthetic = new SyntheticProvider()
    this.providers.set(SYNTHETIC_FONT_ID, synthetic)
  }

  // 启动时从 IndexedDB 恢复真实字体
  async restore(): Promise<void> {
    const assets = await fontRepo.list()
    for (const asset of assets) {
      this.assets.set(asset.id, asset)
      const buffer = await loadFontBuffer(asset.id)
      if (!buffer) continue
      try {
        const font = parseFont(buffer) as unknown as OtFont
        this.providers.set(asset.id, new OpenTypeProvider(asset.id, asset.family, font))
      } catch (err) {
        console.warn(`字体 ${asset.family} 解析失败，跳过`, err)
      }
    }
  }

  async importFont(file: File): Promise<FontAsset> {
    const buffer = await file.arrayBuffer()
    const font = parseFont(buffer.slice(0)) as unknown as OtFont
    const family = (file.name.replace(/\.(ttf|otf)$/i, '')) || '未命名字体'
    const id = uid('font')
    const asset: FontAsset = {
      id,
      family,
      style: 'normal',
      format: file.name.toLowerCase().endsWith('.otf') ? 'otf' : 'ttf',
      byteLength: buffer.byteLength,
      createdAt: Date.now(),
    }
    this.providers.set(id, new OpenTypeProvider(id, family, font))
    this.assets.set(id, asset)
    return asset
  }

  listAssets(): FontAsset[] {
    return [...this.assets.values()]
  }

  getProvider(fontId: string): GlyphProvider {
    return this.providers.get(fontId) ?? this.providers.get(SYNTHETIC_FONT_ID)!
  }

  // 按回退链解析单个字符：返回命中的 provider 与是否缺字回退
  resolveChar(
    unicode: number,
    chain: string[],
  ): { provider: GlyphProvider; fontId: string; isFallback: boolean; missing: boolean } {
    const effectiveChain = chain.length ? chain : [SYNTHETIC_FONT_ID]
    for (let i = 0; i < effectiveChain.length; i++) {
      const fontId = effectiveChain[i]
      const provider = this.providers.get(fontId)
      if (provider?.hasGlyph(unicode)) {
        return { provider, fontId, isFallback: i > 0, missing: false }
      }
    }
    return {
      provider: this.providers.get(SYNTHETIC_FONT_ID)!,
      fontId: SYNTHETIC_FONT_ID,
      isFallback: true,
      missing: true,
    }
  }

  // 批量取轮廓（排版与图集生成共用）
  getOutlines(
    chars: string,
    chain: string[],
  ): {
    char: string
    unicode: number
    outline: GlyphOutline
    fontId: string
    isFallback: boolean
    missing: boolean
  }[] {
    return [...chars].map((char) => {
      const unicode = char.codePointAt(0) ?? 0
      const hit = this.resolveChar(unicode, chain)
      const outline = hit.provider.getOutline(unicode)
      if (!outline) throw new Error(`字形提供者未返回轮廓: ${char}`)
      return { char, unicode, outline, fontId: hit.fontId, isFallback: hit.isFallback, missing: hit.missing }
    })
  }

  async ensureLoaded(asset: FontAsset): Promise<GlyphProvider> {
    const cached = this.providers.get(asset.id)
    if (cached) return cached
    const pending = this.loading.get(asset.id)
    if (pending) return pending
    const task = (async () => {
      const buffer = await loadFontBuffer(asset.id)
      if (!buffer) throw new Error(`字体二进制缺失: ${asset.family}`)
      const font = parseFont(buffer) as unknown as OtFont
      const provider = new OpenTypeProvider(asset.id, asset.family, font)
      this.providers.set(asset.id, provider)
      return provider
    })()
    this.loading.set(asset.id, task)
    return task
  }
}

export const fontRegistry = new FontRegistry()
