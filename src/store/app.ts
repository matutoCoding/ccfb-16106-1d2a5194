// 全局应用状态：项目数据、字体、图集、排版与可读性结果的响应式容器
import { reactive, computed } from 'vue'
import type {
  DisplayCase,
  Exhibition,
  FontAsset,
  Hall,
  LayoutResult,
  Panel,
  PanelReadability,
  SdfAtlasMeta,
  SpotLight,
  ViewPoint,
  Wall,
} from '@/types/domain'
import {
  caseRepo,
  exhibitionRepo,
  fontRepo,
  hallRepo,
  panelRepo,
  saveFontBuffer,
  spotlightRepo,
  viewpointRepo,
  wallRepo,
} from '@/db/repos'
import { fontRegistry, SYNTHETIC_FONT_ID } from '@/font/font_registry'
import { atlasService } from '@/font/atlas_service'
import { layoutPanel, type LayoutContext } from '@/layout/engine'
import { evaluateExhibition, type ReadabilityInput } from '@/readability/engine'
import { generateDemoExhibition } from '@/demo/generator'

interface AppState {
  ready: boolean
  exhibition: Exhibition | null
  halls: Hall[]
  walls: Wall[]
  cases: DisplayCase[]
  panels: Panel[]
  viewpoints: ViewPoint[]
  spotlights: SpotLight[]
  fonts: FontAsset[]
  layouts: Map<string, LayoutResult>
  readability: Map<string, PanelReadability>
  readabilityElapsedMs: number
  selectedPanelId: string | null
  selectedHallId: string | null
  missingChars: { char: string; blockId: string }[]
  activeFontChain: string[]
}

const state = reactive<AppState>({
  ready: false,
  exhibition: null,
  halls: [],
  walls: [],
  cases: [],
  panels: [],
  viewpoints: [],
  spotlights: [],
  fonts: [],
  layouts: new Map(),
  readability: new Map(),
  readabilityElapsedMs: 0,
  selectedPanelId: null,
  selectedHallId: null,
  missingChars: [],
  activeFontChain: [SYNTHETIC_FONT_ID],
}) as AppState

export const useStore = () => state

export const selectedPanel = computed(() =>
  state.panels.find((p) => p.id === state.selectedPanelId) ?? null,
)

export const initApp = async (): Promise<void> => {
  await fontRegistry.restore()
  state.fonts = fontRepo.list ? await fontRepo.list() : []
  const existing = await exhibitionRepo.list()
  if (existing.length) {
    await loadExhibition(existing[0])
  }
  state.ready = true
}

export const loadExhibition = async (exhibition: Exhibition): Promise<void> => {
  state.exhibition = exhibition
  state.halls = await hallRepo.list()
  state.walls = await wallRepo.list()
  state.cases = await caseRepo.list()
  state.panels = await panelRepo.list()
  state.viewpoints = await viewpointRepo.list()
  state.spotlights = await spotlightRepo.list()
  state.selectedHallId = state.halls[0]?.id ?? null
  state.selectedPanelId = state.panels[0]?.id ?? null
  relayoutAll()
  recomputeReadability()
}

export const createDemoProject = async (): Promise<void> => {
  const demo = generateDemoExhibition(200)
  state.exhibition = demo.exhibition
  state.halls = demo.halls
  state.walls = demo.walls
  state.cases = demo.cases
  state.panels = demo.panels
  state.viewpoints = demo.viewpoints
  state.spotlights = demo.spotlights
  await exhibitionRepo.save(demo.exhibition)
  await Promise.all(demo.halls.map((h) => hallRepo.save(h)))
  await Promise.all(demo.walls.map((w) => wallRepo.save(w)))
  await Promise.all(demo.cases.map((c) => caseRepo.save(c)))
  await Promise.all(demo.panels.map((p) => panelRepo.save(p)))
  await Promise.all(demo.viewpoints.map((v) => viewpointRepo.save(v)))
  await Promise.all(demo.spotlights.map((l) => spotlightRepo.save(l)))
  state.selectedHallId = demo.halls[0]?.id ?? null
  state.selectedPanelId = demo.panels[0]?.id ?? null
  relayoutAll()
  recomputeReadability()
}

export const importFontFile = async (file: File): Promise<void> => {
  const asset = await fontRegistry.importFont(file)
  const buffer = await file.arrayBuffer()
  await fontRepo.save(asset)
  await saveFontBuffer(asset.id, buffer)
  state.fonts = await fontRepo.list()
  state.activeFontChain = [asset.id, SYNTHETIC_FONT_ID]
  atlasService.invalidate(asset.id)
  relayoutAll()
  recomputeReadability()
}

export const updatePanel = async (panel: Panel): Promise<void> => {
  const idx = state.panels.findIndex((p) => p.id === panel.id)
  if (idx >= 0) state.panels[idx] = { ...panel, updatedAt: Date.now() }
  await panelRepo.save(state.panels[idx])
  relayoutAll()
  recomputeReadability()
}

export const relayoutAll = (): void => {
  const ctx: LayoutContext = { registry: fontRegistry, fontChainIds: state.activeFontChain }
  const layouts = new Map<string, LayoutResult>()
  const missing: { char: string; blockId: string }[] = []
  for (const panel of state.panels) {
    const { results, allMissing } = layoutPanel(panel.blocks, ctx)
    results.forEach((r, id) => layouts.set(id, r))
    missing.push(...allMissing)
  }
  state.layouts = layouts
  state.missingChars = missing
}

export const recomputeReadability = (): void => {
  const wallMap = new Map(state.walls.map((w) => [w.id, w]))
  const hallMap = new Map(state.halls.map((h) => [h.id, h]))
  const inputs: ReadabilityInput[] = state.panels
    .map((panel) => {
      const wall = wallMap.get(panel.wallId)
      const hall = hallMap.get(panel.hallId)
      if (!wall || !hall) return null
      // 主内容字高 >= 12mm（标题/正文），展品卡小字 < 12mm
      const primarySizes = panel.blocks.filter((b) => b.style.sizeMm >= 12).map((b) => b.style.sizeMm)
      const captionSizes = panel.blocks.filter((b) => b.style.sizeMm < 12).map((b) => b.style.sizeMm)
      return {
        panel,
        wall,
        hall,
        viewpoints: state.viewpoints,
        lights: state.spotlights.filter((l) => l.hallId === panel.hallId),
        primaryGlyphHeightMm: primarySizes.length ? Math.min(...primarySizes) : Math.min(...panel.blocks.map((b) => b.style.sizeMm)),
        captionGlyphHeightMm: captionSizes.length ? Math.min(...captionSizes) : primarySizes.length ? Math.min(...primarySizes) : 5,
      }
    })
    .filter((x): x is ReadabilityInput => x !== null)
  const summary = evaluateExhibition(inputs)
  state.readability = summary.worstByPanel
  state.readabilityElapsedMs = summary.elapsedMs
}

export const selectPanel = (panelId: string): void => {
  state.selectedPanelId = panelId
  const panel = state.panels.find((p) => p.id === panelId)
  if (panel) state.selectedHallId = panel.hallId
}

export const ensureAtlasForPanel = async (panel: Panel) => {
  const chars = new Set<string>()
  panel.blocks.forEach((b) => {
    ;[...b.content].forEach((c) => c.trim() && chars.add(c))
    b.latinContent && [...b.latinContent].forEach((c) => c.trim() && chars.add(c))
  })
  const byFont = new Map<string, number[]>()
  chars.forEach((c) => {
    const unicode = c.codePointAt(0) ?? 0
    const hit = fontRegistry.resolveChar(unicode, state.activeFontChain)
    const list = byFont.get(hit.fontId) ?? []
    list.push(unicode)
    byFont.set(hit.fontId, list)
  })
  const results: { meta: SdfAtlasMeta; pixels: Uint8Array }[] = []
  for (const [fontId, unicodes] of byFont) {
    const provider = fontRegistry.getProvider(fontId)
    const outlines = unicodes
      .map((u) => provider.getOutline(u))
      .filter((o): o is NonNullable<typeof o> => o !== null)
    results.push(await atlasService.ensureAtlas(fontId, outlines))
  }
  return results
}
