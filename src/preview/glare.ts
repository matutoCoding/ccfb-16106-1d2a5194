// 射灯眩光几何：光束与亚克力面板的反射高光区域
import type { Panel, SpotLight, Wall } from '@/types/domain'
import { clamp, degToRad } from '@/utils/math'
import { buildWallFrame } from '@/plan/floor_geometry'

export interface GlareZone {
  // 展板局部坐标下的椭圆区域（mm，原点为展板中心）
  cx: number
  cy: number
  radiusX: number
  radiusY: number
  intensity: number
}

// 反射向量
const reflect = (ix: number, iy: number, iz: number, nx: number, ny: number, nz: number) => {
  const dot = ix * nx + iy * ny + iz * nz
  return [ix - 2 * dot * nx, iy - 2 * dot * ny, iz - 2 * dot * nz] as const
}

// 计算射灯在展板上产生的眩光椭圆（简化反射模型：镜面反射方向扫过板面的区域）
export const computeGlareZones = (
  panel: Panel,
  wall: Wall,
  lights: SpotLight[],
): GlareZone[] => {
  const frame = buildWallFrame(wall)
  const zones: GlareZone[] = []
  const panelCenterX = (wall.from[0] + wall.to[0]) / 2
  const panelCenterZ = (wall.from[1] + wall.to[1]) / 2
  const panelCenterY = panel.elevation + panel.height / 2

  for (const light of lights) {
    // 灯光到板中心的入射方向
    const ix = panelCenterX - light.x
    const iy = panelCenterY - light.y
    const iz = panelCenterZ - light.z
    const len = Math.hypot(ix, iy, iz) || 1
    const nx = frame.normalX
    const nz = frame.normalZ
    const reflected = reflect(ix / len, iy / len, iz / len, nx, 0, nz)
    const rx = reflected[0]
    const rz = reflected[2]
    // 反射方向越平行于板面（法向分量越小），眩光越强且区域越拉长
    const normalComponent = Math.abs(rx * nx + rz * nz)
    const grazing = 1 - clamp(normalComponent, 0, 1)
    // 仅掠射角足够大（反射光接近平行板面）才形成可见眩光
    if (grazing < 0.55) continue

    // 光束角决定光斑大小，按灯光到板面距离扩散
    const beamRadius = Math.tan(degToRad(light.beamAngle / 2)) * len
    const localX = 0 // 简化：光斑中心取板中心，沿墙偏移由灯光位置决定
    const localY = panelCenterY - (light.targetY || panelCenterY)
    // 眩光椭圆受展板物理尺寸约束，避免光斑计算值大于板面导致 100% 覆盖
    const maxRadiusX = panel.width * 0.45
    const maxRadiusY = panel.height * 0.45
    zones.push({
      cx: clamp(localX, -panel.width / 2, panel.width / 2),
      cy: clamp(localY, -panel.height / 2, panel.height / 2),
      radiusX: Math.min(beamRadius * (0.6 + grazing), maxRadiusX),
      radiusY: Math.min(beamRadius * 0.45, maxRadiusY),
      intensity: clamp(light.intensity * grazing, 0, 1),
    })
  }
  return zones
}

// 椭圆与文字包围盒的覆盖率（近似：在包围盒网格采样求椭圆内面积比例）
export const glareCoverageOnBox = (
  box: { x: number; y: number; w: number; h: number },
  zones: GlareZone[],
  samples = 12,
): number => {
  if (!zones.length) return 0
  let hit = 0
  let total = 0
  for (let i = 0; i < samples; i++) {
    for (let j = 0; j < samples; j++) {
      const x = box.x + ((i + 0.5) / samples) * box.w
      const y = box.y + ((j + 0.5) / samples) * box.h
      total++
      for (const z of zones) {
        const nx = (x - z.cx) / (z.radiusX || 1)
        const ny = (y - z.cy) / (z.radiusY || 1)
        if (nx * nx + ny * ny <= 1 && z.intensity > 0.35) {
          hit++
          break
        }
      }
    }
  }
  return hit / total
}
