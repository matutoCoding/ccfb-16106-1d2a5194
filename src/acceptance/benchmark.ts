// 验收工具 2：字体变更后全展可读性重算计时（验收线 3 秒）
import type { Hall, Panel, SpotLight, ViewPoint, Wall } from '@/types/domain'
import { evaluateExhibition, type ReadabilityInput } from '@/readability/engine'

export interface BenchmarkReport {
  panelCount: number
  viewpointCount: number
  elapsedMs: number
  passUnder3s: boolean
  passCount: number
  failCount: number
  // 多轮统计，排除首轮冷启动
  runsMs: number[]
}

// 按字高拆分主内容与展品卡小字
const splitGlyphHeights = (panel: Panel): { primary: number; caption: number } => {
  const primarySizes = panel.blocks.filter((b) => b.style.sizeMm >= 12).map((b) => b.style.sizeMm)
  const captionSizes = panel.blocks.filter((b) => b.style.sizeMm < 12).map((b) => b.style.sizeMm)
  const allSizes = panel.blocks.map((b) => b.style.sizeMm)
  return {
    primary: primarySizes.length ? Math.min(...primarySizes) : Math.min(...allSizes),
    caption: captionSizes.length ? Math.min(...captionSizes) : Math.min(...allSizes),
  }
}

export const benchmarkReadability = (
  panels: Panel[],
  walls: Wall[],
  halls: Hall[],
  viewpoints: ViewPoint[],
  lights: SpotLight[],
  rounds = 5,
): BenchmarkReport => {
  const wallMap = new Map(walls.map((w) => [w.id, w]))
  const hallMap = new Map(halls.map((h) => [h.id, h]))
  const inputs: ReadabilityInput[] = panels
    .map((panel) => {
      const wall = wallMap.get(panel.wallId)
      const hall = hallMap.get(panel.hallId)
      if (!wall || !hall) return null
      const { primary, caption } = splitGlyphHeights(panel)
      return {
        panel,
        wall,
        hall,
        viewpoints,
        lights: lights.filter((l) => l.hallId === panel.hallId),
        primaryGlyphHeightMm: primary,
        captionGlyphHeightMm: caption,
      }
    })
    .filter((x): x is ReadabilityInput => x !== null)

  const runsMs: number[] = []
  let last = evaluateExhibition(inputs)
  for (let i = 0; i < rounds; i++) {
    const summary = evaluateExhibition(inputs)
    runsMs.push(Math.round(summary.elapsedMs * 100) / 100)
    last = summary
  }
  const median = runsMs.sort((a, b) => a - b)[Math.floor(runsMs.length / 2)]
  return {
    panelCount: panels.length,
    viewpointCount: viewpoints.length,
    elapsedMs: median,
    passUnder3s: median < 3000,
    passCount: last.passCount,
    failCount: last.failCount,
    runsMs,
  }
}
