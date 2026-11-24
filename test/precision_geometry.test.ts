import { describe, expect, it } from 'vitest'
import { SyntheticProvider } from '@/font/synthetic_provider'
import { measureGlyphPrecision, measureTextPrecision, bidirectionalCheck } from '@/acceptance/precision'
import { boxMesh, extrudeContours, mergeMeshes, planeMesh } from '@/preview/geometry'
import { commandsToContours } from '@/font/outline'

describe('0.1mm 轮廓精度验收', () => {
  const provider = new SyntheticProvider()

  it('30mm 小字 SDF 零等值线偏差小于 0.1mm', () => {
    const outline = provider.getOutline('文'.codePointAt(0)!)!
    const report = measureGlyphPrecision(outline, '文', 30)
    expect(report.maxDeviationMm).toBeLessThan(0.1)
    expect(report.pass01mm).toBe(true)
  })

  it('200mm 前言大字号同样达标', () => {
    const outline = provider.getOutline('明'.codePointAt(0)!)!
    const report = measureGlyphPrecision(outline, '明', 200)
    expect(report.maxDeviationMm).toBeLessThan(0.1)
  })

  it('批量测量全部字形通过', () => {
    const outlines = ['文', '明', '曙', '光', 'A', '0'].map((char) => ({
      char,
      outline: provider.getOutline(char.codePointAt(0)!)!,
    }))
    const reports = measureTextPrecision(outlines, 48)
    expect(reports.every((r) => r.pass01mm)).toBe(true)
  })

  it('双向偏差均可测且为有限值', () => {
    const outline = provider.getOutline('青'.codePointAt(0)!)!
    const check = bidirectionalCheck(outline, 60)
    expect(Number.isFinite(check.vectorToSdf)).toBe(true)
    expect(Number.isFinite(check.sdfToVector)).toBe(true)
    expect(check.sdfToVector).toBeLessThan(0.2)
  })
})

describe('三维几何', () => {
  it('盒子网格 12 三角形 24 顶点', () => {
    const mesh = boxMesh(0, 0, 0, 100, 200, 50)
    expect(mesh.positions.length / 3).toBe(24)
    expect(mesh.indices.length).toBe(36)
    expect(mesh.groups[0][2]).toBe('default')
  })

  it('平面网格法线朝 +Z', () => {
    const mesh = planeMesh(0, 0, 0, 100, 100)
    expect(mesh.normals[2]).toBe(1)
    expect(mesh.indices.length).toBe(6)
  })

  it('字形拉伸产生前后表面与侧面', () => {
    const outline = providerOutline()
    const contours = commandsToContours(outline.commands, 0.3)
    const mesh = extrudeContours(contours, 8, 0.05, 0, 0)
    expect(mesh.positions.length / 3).toBeGreaterThan(6)
    expect(mesh.indices.length).toBeGreaterThan(0)
    // 法线包含朝 ±Z 的前后表面
    const hasFront = mesh.normals.some((_, i) => (i + 1) % 3 === 0 && mesh.normals[i - 1] === 0 && mesh.normals[i] === 1)
    expect(hasFront).toBe(true)
  })

  it('网格合并索引偏移正确', () => {
    const a = boxMesh(0, 0, 0, 10, 10, 10)
    const b = boxMesh(50, 0, 0, 10, 10, 10)
    const merged = mergeMeshes([a, b])
    expect(merged.indices.length).toBe(a.indices.length + b.indices.length)
    expect(merged.groups.length).toBe(2)
  })
})

const providerOutline = () => new SyntheticProvider().getOutline('口'.codePointAt(0)!)!
