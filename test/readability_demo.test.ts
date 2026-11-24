import { describe, expect, it } from 'vitest'
import { generateDemoExhibition } from '@/demo/generator'
import { evaluateExhibition, evaluatePanel } from '@/readability/engine'
import { benchmarkReadability } from '@/acceptance/benchmark'
import { buildWallFrame, viewpointToPanel, viewpointToWall } from '@/plan/floor_geometry'
import { computeGlareZones, glareCoverageOnBox } from '@/preview/glare'
import { READABILITY_STANDARDS } from '@/config/standards'
import { contrastRatio } from '@/utils/math'

describe('演示数据与可读性', () => {
  const demo = generateDemoExhibition(200)

  it('生成 200 块展板与 6 个展厅', () => {
    expect(demo.panels).toHaveLength(200)
    expect(demo.halls).toHaveLength(6)
    expect(demo.walls.length).toBeGreaterThanOrEqual(24)
    expect(demo.viewpoints.length).toBeGreaterThan(0)
  })

  it('每块展板都挂载到存在的墙面', () => {
    const wallIds = new Set(demo.walls.map((w) => w.id))
    for (const panel of demo.panels) {
      expect(wallIds.has(panel.wallId)).toBe(true)
      expect(panel.blocks.length).toBeGreaterThan(0)
    }
  })

  it('四种上墙工艺都被使用', () => {
    const techniques = new Set(demo.panels.map((p) => p.technique))
    expect(techniques.size).toBe(4)
  })

  it('所有文本块 content 均为合法字符串（回归：数组越界 undefined）', () => {
    let blockCount = 0
    for (const panel of demo.panels) {
      for (const block of panel.blocks) {
        blockCount++
        expect(typeof block.content).toBe('string')
        expect(block.content.length).toBeGreaterThan(0)
      }
    }
    expect(blockCount).toBeGreaterThan(200)
  })

  it('墙面坐标系：站位入射角在 0~90 度', () => {
    const wall = demo.walls[0]
    const frame = buildWallFrame(wall)
    const vp = demo.viewpoints[0]
    const hit = viewpointToWall(vp, frame)
    expect(hit.incidenceDeg).toBeGreaterThanOrEqual(0)
    expect(hit.incidenceDeg).toBeLessThanOrEqual(90)
    expect(hit.distanceMm).toBeGreaterThan(0)
  })

  it('三维视距随眼高不同而变化（成人 vs 轮椅）', () => {
    const panel = demo.panels[0]
    const wall = demo.walls.find((w) => w.id === panel.wallId)!
    const frame = buildWallFrame(wall)
    const center = { x: (frame.ax + frame.bx) / 2, y: panel.elevation + panel.height / 2, z: (frame.az + frame.bz) / 2 }
    const vp = demo.viewpoints.find((v) => v.audience === 'adult')!
    const adult = viewpointToPanel(vp, READABILITY_STANDARDS.adultEyeHeight, center)
    const wheelchair = viewpointToPanel(vp, READABILITY_STANDARDS.wheelchairEyeHeight, center)
    expect(adult.distanceMm).not.toBe(wheelchair.distanceMm)
  })

  it('对比度计算符合 WCAG 量级', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0)
    expect(contrastRatio('#777777', '#777777')).toBeCloseTo(1, 1)
  })

  it('眩光覆盖率在 0~1 之间', () => {
    const panel = demo.panels[0]
    const wall = demo.walls.find((w) => w.id === panel.wallId)!
    const zones = computeGlareZones(panel, wall, demo.spotlights)
    const coverage = glareCoverageOnBox({ x: 0, y: 0, w: panel.width, h: panel.height }, zones)
    expect(coverage).toBeGreaterThanOrEqual(0)
    expect(coverage).toBeLessThanOrEqual(1)
  })

  it('全展可读性评估产出每板结果', () => {
    const wallMap = new Map(demo.walls.map((w) => [w.id, w]))
    const inputs = demo.panels.map((panel) => {
      const primarySizes = panel.blocks.filter((b) => b.style.sizeMm >= 12).map((b) => b.style.sizeMm)
      const captionSizes = panel.blocks.filter((b) => b.style.sizeMm < 12).map((b) => b.style.sizeMm)
      const allSizes = panel.blocks.map((b) => b.style.sizeMm)
      return {
        panel,
        wall: wallMap.get(panel.wallId)!,
        hall: demo.halls.find((h) => h.id === panel.hallId)!,
        viewpoints: demo.viewpoints,
        lights: demo.spotlights.filter((l) => l.hallId === panel.hallId),
        primaryGlyphHeightMm: primarySizes.length ? Math.min(...primarySizes) : Math.min(...allSizes),
        captionGlyphHeightMm: captionSizes.length ? Math.min(...captionSizes) : Math.min(...allSizes),
      }
    })
    const summary = evaluateExhibition(inputs)
    expect(summary.worstByPanel.size).toBe(200)
    expect(summary.passCount + summary.failCount).toBe(200)
    for (const row of summary.worstByPanel.values()) {
      expect(row.angularMinute).toBeGreaterThan(0)
      expect(row.failures.length >= 0).toBe(true)
    }
    // 报告必须有区分度：存在合格板也存在不合格板，不能 100% 同一结论
    expect(summary.passCount).toBeGreaterThan(0)
    expect(summary.failCount).toBeGreaterThan(0)
    // 主内容字视角在合理阅读距离下达到标准量级（角分 > 10）
    const anyRow = [...summary.worstByPanel.values()][0]
    expect(anyRow.angularMinute).toBeGreaterThan(10)
    expect(anyRow.distanceMm).toBeLessThan(6000)
  })

  it('单板评估只包含本厅站位（坐标归一化后按厅过滤）', () => {
    const panel = demo.panels[0]
    const wall = demo.walls.find((w) => w.id === panel.wallId)!
    const rows = evaluatePanel({
      panel,
      wall,
      hall: demo.halls.find((h) => h.id === panel.hallId)!,
      viewpoints: demo.viewpoints,
      lights: demo.spotlights,
      primaryGlyphHeightMm: 48,
      captionGlyphHeightMm: 8,
    })
    // 每厅 4 组站位 × 成人/轮椅 = 8
    expect(rows).toHaveLength(8)
  })

  it('归一化后视距落在合理展厅尺度（< 12m），入射角为锐角', () => {
    const panel = demo.panels[0]
    const wall = demo.walls.find((w) => w.id === panel.wallId)!
    const rows = evaluatePanel({
      panel,
      wall,
      hall: demo.halls.find((h) => h.id === panel.hallId)!,
      viewpoints: demo.viewpoints,
      lights: demo.spotlights,
      primaryGlyphHeightMm: 48,
      captionGlyphHeightMm: 8,
    })
    for (const row of rows) {
      expect(row.distanceMm).toBeLessThan(12000)
      expect(row.incidenceDeg).toBeLessThan(90)
    }
  })

  it('3 秒验收基准：200 板重算中位数低于 3000ms', () => {
    const report = benchmarkReadability(demo.panels, demo.walls, demo.halls, demo.viewpoints, demo.spotlights, 3)
    expect(report.panelCount).toBe(200)
    expect(report.passUnder3s).toBe(true)
  })
})
