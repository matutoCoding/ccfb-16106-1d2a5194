// 场景构建：领域对象 -> WebGPU 渲染对象
import type { Hall, Panel, Wall, DisplayCase, LayoutResult, SdfAtlasMeta } from '@/types/domain'
import { boxMesh, extrudeContours, mergeMeshes, planeMesh, type MeshData } from './geometry'
import type { ShapeObject } from '@/webgpu/shape_renderer'
import { acrylicSideMaterial, type MaterialSpec } from '@/webgpu/materials'
import { buildWallFrame, panelWorldPosition } from '@/plan/floor_geometry'
import { commandsToContours } from '@/font/outline'
import type { TextInstance } from '@/webgpu/text_renderer'
import type { GlareInstance } from '@/webgpu/glare_renderer'
import type { GlareZone } from './glare'
import { fontRegistry } from '@/font/font_registry'

const hexToRgb01 = (hex: string): [number, number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1]
}

export const buildHallShapes = (hall: Hall, walls: Wall[], cases: DisplayCase[]): ShapeObject[] => {
  const objects: ShapeObject[] = []
  const floorMat: MaterialSpec = {
    key: 'floor',
    color: hexToRgb01(hall.floorColor).slice(0, 3) as [number, number, number],
    shininess: 8,
    specular: 0.05,
    roughnessLabel: '地面',
  }
  // 地面薄板
  objects.push({
    mesh: boxMesh(0, -10, 0, hall.width, 20, hall.depth, 'floor'),
    material: floorMat,
  })
  for (const wall of walls) {
    const frame = buildWallFrame(wall)
    const cx = (frame.ax + frame.bx) / 2
    const cz = (frame.az + frame.bz) / 2
    const wallMat: MaterialSpec = {
      key: 'wall',
      color: [0.93, 0.92, 0.89],
      shininess: 10,
      specular: 0.05,
      roughnessLabel: '墙面',
    }
    objects.push({
      mesh: boxMesh(cx, wall.height / 2, cz, frame.length, wall.height, wall.thickness, 'wall'),
      material: wallMat,
    })
  }
  for (const c of cases) {
    const caseMat: MaterialSpec = {
      key: 'case',
      color: c.type === 'plinth' ? [0.78, 0.76, 0.72] : [0.85, 0.87, 0.88],
      shininess: c.type === 'plinth' ? 30 : 80,
      specular: c.type === 'plinth' ? 0.2 : 0.5,
      roughnessLabel: c.type === 'plinth' ? '展台' : '玻璃',
    }
    objects.push({
      mesh: boxMesh(c.x, c.height / 2, c.y, c.width, c.height, c.depth, 'case'),
      material: caseMat,
    })
  }
  return objects
}

export interface PanelScene {
  substrate: ShapeObject
  textInstances: TextInstance[]
  acrylicMesh: ShapeObject | null
  glare: GlareInstance[]
}

// 构建单块展板：底板 + 文字实例；亚克力立体字额外生成拉伸网格
export const buildPanelScene = (
  panel: Panel,
  wall: Wall,
  layouts: Map<string, LayoutResult>,
  atlasMeta: SdfAtlasMeta,
  zones: GlareZone[],
): PanelScene => {
  const frame = buildWallFrame(wall)
  const center = panelWorldPosition(panel, frame)
  const substrateMat: MaterialSpec = {
    key: 'substrate',
    color: hexToRgb01(panel.substrateColor).slice(0, 3) as [number, number, number],
    shininess: 30,
    specular: 0.15,
    roughnessLabel: '底板',
  }
  const substrate: ShapeObject = {
    mesh: planeMesh(center.x, center.y, center.z - 4, panel.width, panel.height, 'substrate'),
    material: substrateMat,
  }

  const textInstances: TextInstance[] = []
  const acrylicMeshes: MeshData[] = []
  const panelOffsetX = center.x - panel.width / 2
  const panelOffsetY = panel.elevation
  const textZ = center.z + 1

  for (const block of panel.blocks) {
    const layout = layouts.get(block.id)
    if (!layout) continue
    const sizeMm = block.style.sizeMm
    const color = hexToRgb01(block.style.color)
    for (const line of layout.lines) {
      let cursorX = panelOffsetX + line.x
      const cursorY = panelOffsetY + panel.height - (line.y + sizeMm)
      for (const run of line.runs) {
        let charX = cursorX
        for (const char of run.text) {
          const unicode = char.codePointAt(0) ?? 0
          const glyphKey = `${run.fontId}:${unicode}`
          const glyph = atlasMeta.glyphs[glyphKey]
          if (glyph) {
            textInstances.push({
              x: charX + sizeMm / 2,
              y: cursorY + sizeMm / 2,
              z: textZ,
              w: sizeMm,
              h: sizeMm,
              r: color[0],
              g: color[1],
              b: color[2],
              a: color[3],
              u0: glyph.atlasX / atlasMeta.width,
              v0: glyph.atlasY / atlasMeta.height,
              u1: (glyph.atlasX + 96) / atlasMeta.width,
              v1: (glyph.atlasY + 96) / atlasMeta.height,
            })
          }
          // 亚克力立体字：同一份字形轮廓拉伸
          if (panel.technique === 'acrylic_3d') {
            const provider = fontRegistry.getProvider(run.fontId)
            const outline = provider.getOutline(unicode)
            if (outline) {
              const contours = commandsToContours(outline.commands, 0.3)
              const scale = sizeMm / outline.unitsPerEm
              acrylicMeshes.push(
                extrudeContours(
                  contours,
                  panel.thicknessMm ?? 8,
                  scale,
                  charX - outline.xMin * scale,
                  cursorY,
                  'acrylic',
                ),
              )
            }
          }
          const provider = fontRegistry.getProvider(run.fontId)
          const upm = provider.unitsPerEm
          charX += (provider.getAdvance(unicode) / upm) * sizeMm + block.style.letterSpacingMm
        }
        cursorX = charX
      }
    }
  }

  const acrylicMesh: ShapeObject | null = acrylicMeshes.length
    ? { mesh: mergeMeshes(acrylicMeshes), material: acrylicSideMaterial(panel.blocks[0]?.style.color ?? '#111111') }
    : null

  const glare: GlareInstance[] = zones.map((z) => ({
    cx: center.x + z.cx,
    cy: panelOffsetY + panel.height / 2 + z.cy,
    z: textZ + 2,
    radiusX: z.radiusX,
    radiusY: z.radiusY,
    intensity: z.intensity,
  }))

  return { substrate, textInstances, acrylicMesh, glare }
}
