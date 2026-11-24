// 可读性引擎：沿观众动线逐板计算字视角、对比度、视距、眩光覆盖
// 纯计算模块，结果可缓存；字体变更只影响阈值相关字段时可增量重算
import type {
  Hall,
  Panel,
  PanelReadability,
  SpotLight,
  ViewPoint,
  Wall,
} from '@/types/domain'
import { READABILITY_STANDARDS } from '@/config/standards'
import { contrastRatio, radToDeg } from '@/utils/math'
import { buildWallFrame, viewpointToPanel, viewpointToWall } from '@/plan/floor_geometry'
import { computeGlareZones, glareCoverageOnBox } from '@/preview/glare'

export interface ReadabilityInput {
  panel: Panel
  wall: Wall
  hall: Hall
  viewpoints: ViewPoint[]
  lights: SpotLight[]
  // 主内容（标题+正文）最小字高 mm，决定整板合格
  primaryGlyphHeightMm: number
  // 展品卡等近观小字最小字高 mm，仅作提示
  captionGlyphHeightMm: number
}

// 展厅横向拼接时各厅带全局 x 偏移，几何计算前归一化到本厅本地坐标
const hallOriginX = (hall: Hall, walls: Wall[]): number => {
  const hallWalls = walls.filter((w) => w.hallId === hall.id)
  if (!hallWalls.length) return 0
  return Math.min(...hallWalls.flatMap((w) => [w.from[0], w.to[0]]))
}

// 仅保留落在本厅平面范围内的站位，并平移到本地坐标
const localViewpoints = (
  viewpoints: ViewPoint[],
  hall: Hall,
  originX: number,
): ViewPoint[] =>
  viewpoints
    .filter((vp) => {
      const lx = vp.x - originX
      return lx >= -500 && lx <= hall.width + 500 && vp.z >= -500 && vp.z <= hall.depth + 500
    })
    .map((vp) => ({ ...vp, x: vp.x - originX }))

const localWall = (wall: Wall, originX: number): Wall => ({
  ...wall,
  from: [wall.from[0] - originX, wall.from[1]],
  to: [wall.to[0] - originX, wall.to[1]],
})

const localLights = (lights: SpotLight[], originX: number): SpotLight[] =>
  lights.map((l) => ({ ...l, x: l.x - originX, targetX: l.targetX - originX }))

const evaluateOne = (
  input: ReadabilityInput,
  vp: ViewPoint,
  eyeHeight: number,
): PanelReadability => {
  const { panel, wall } = input
  const frame = buildWallFrame(wall)
  const wallHit = viewpointToWall(vp, frame)
  const center = {
    x: (frame.ax + frame.bx) / 2 + frame.normalX * 4,
    y: panel.elevation + panel.height / 2,
    z: (frame.az + frame.bz) / 2 + frame.normalZ * 4,
  }
  const { distanceMm } = viewpointToPanel(vp, eyeHeight, center)
  // 字视角（角分）：主内容字高在视距下的张角
  const angularMinute = radToDeg(Math.atan2(input.primaryGlyphHeightMm, distanceMm)) * 60
  const contrast = contrastRatio(
    panel.blocks[0]?.style.color ?? '#111111',
    panel.substrateColor,
  )
  const zones = computeGlareZones(panel, wall, input.lights)
  const textBox = {
    x: -panel.width / 2,
    y: -panel.height / 2,
    w: panel.width,
    h: panel.height,
  }
  const glare = glareCoverageOnBox(textBox, zones)

  const failures: string[] = []
  if (angularMinute < READABILITY_STANDARDS.minAngularMinute) failures.push('字视角不足')
  if (input.primaryGlyphHeightMm < READABILITY_STANDARDS.minBodyGlyphMm) failures.push('物理字高过小')
  if (wallHit.incidenceDeg > READABILITY_STANDARDS.maxIncidenceDeg) failures.push('入射角过大')
  if (contrast < READABILITY_STANDARDS.minContrast) failures.push('对比度不足')
  if (glare > READABILITY_STANDARDS.maxGlareCoverage) failures.push('眩光遮挡超标')
  if (distanceMm > READABILITY_STANDARDS.maxViewDistanceMm) failures.push('视距过远')
  // 展品卡小字（< 10mm）仅作近观提示，不作为整板硬失败
  const warnings: string[] = []
  if (input.captionGlyphHeightMm < READABILITY_STANDARDS.minBodyGlyphMm) {
    warnings.push('展品卡小字需近观')
  }

  return {
    panelId: panel.id,
    viewpointId: vp.id,
    audience: vp.audience,
    distanceMm: Math.round(distanceMm),
    incidenceDeg: Math.round(wallHit.incidenceDeg * 10) / 10,
    glyphHeightMm: input.primaryGlyphHeightMm,
    angularMinute: Math.round(angularMinute * 10) / 10,
    contrastRatio: Math.round(contrast * 100) / 100,
    glareCoverage: Math.round(glare * 1000) / 1000,
    pass: failures.length === 0,
    failures: failures.concat(warnings),
  }
}

export const evaluatePanel = (input: ReadabilityInput): PanelReadability[] => {
  const originX = hallOriginX(input.hall, [input.wall])
  const localInput: ReadabilityInput = {
    ...input,
    wall: localWall(input.wall, originX),
    viewpoints: localViewpoints(input.viewpoints, input.hall, originX),
    lights: localLights(input.lights, originX),
  }
  const results: PanelReadability[] = []
  for (const vp of localInput.viewpoints) {
    const eyeHeight =
      vp.audience === 'adult'
        ? READABILITY_STANDARDS.adultEyeHeight
        : READABILITY_STANDARDS.wheelchairEyeHeight
    results.push(evaluateOne(localInput, vp, eyeHeight))
  }
  return results
}

export interface ExhibitionReadabilitySummary {
  rows: PanelReadability[]
  // 每块板取最差站位
  worstByPanel: Map<string, PanelReadability>
  passCount: number
  failCount: number
  elapsedMs: number
}

// 全展评估，带计时（3 秒验收基准）
export const evaluateExhibition = (
  inputs: ReadabilityInput[],
): ExhibitionReadabilitySummary => {
  const start = performance.now()
  const rows: PanelReadability[] = []
  const worstByPanel = new Map<string, PanelReadability>()
  for (const input of inputs) {
    const panelRows = evaluatePanel(input)
    rows.push(...panelRows)
    const worst = panelRows.reduce((a, b) => (scoreWorse(a, b) ? a : b))
    worstByPanel.set(input.panel.id, worst)
  }
  const passCount = [...worstByPanel.values()].filter((r) => r.pass).length
  const elapsedMs = performance.now() - start
  return {
    rows,
    worstByPanel,
    passCount,
    failCount: worstByPanel.size - passCount,
    elapsedMs,
  }
}

const scoreWorse = (a: PanelReadability, b: PanelReadability): boolean => {
  if (a.pass !== b.pass) return !a.pass
  return a.angularMinute < b.angularMinute
}
