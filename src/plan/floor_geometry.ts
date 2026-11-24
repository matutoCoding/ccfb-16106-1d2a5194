// 展厅平面几何：墙面坐标系、展板挂载、站位投影
import type { Panel, ViewPoint, Wall } from '@/types/domain'
import { clamp, closestPointOnSegment, dist2d } from '@/utils/math'

export interface WallFrame {
  // 墙面起点/终点（地面投影 mm）
  ax: number
  az: number
  bx: number
  bz: number
  length: number
  // 沿墙方向单位向量与法线（指向展厅一侧）
  dirX: number
  dirZ: number
  normalX: number
  normalZ: number
}

export const buildWallFrame = (wall: Wall): WallFrame => {
  const dx = wall.to[0] - wall.from[0]
  const dz = wall.to[1] - wall.from[1]
  const length = Math.hypot(dx, dz) || 1
  const dirX = dx / length
  const dirZ = dz / length
  return {
    ax: wall.from[0],
    az: wall.from[1],
    bx: wall.to[0],
    bz: wall.to[1],
    length,
    dirX,
    dirZ,
    normalX: -dirZ,
    normalZ: dirX,
  }
}

// 展板中心在世界坐标的位置（默认挂在墙面中线，沿墙偏移可由 panel 扩展字段表达）
export const panelWorldPosition = (
  panel: Panel,
  frame: WallFrame,
  offsetAlongWall = 0,
): { x: number; y: number; z: number } => ({
  x: (frame.ax + frame.bx) / 2 + frame.dirX * offsetAlongWall + frame.normalX * 4,
  y: panel.elevation + panel.height / 2,
  z: (frame.az + frame.bz) / 2 + frame.dirZ * offsetAlongWall + frame.normalZ * 4,
})

// 站位到墙面的最近点：视距与入射角
export const viewpointToWall = (
  vp: ViewPoint,
  frame: WallFrame,
): { distanceMm: number; incidenceDeg: number; pointX: number; pointZ: number } => {
  const [px, pz] = closestPointOnSegment(vp.x, vp.z, frame.ax, frame.az, frame.bx, frame.bz)
  const distanceMm = dist2d(vp.x, vp.z, px, pz)
  // 入射角 = 视线方向与墙面法线夹角
  const viewX = px - vp.x
  const viewZ = pz - vp.z
  const viewLen = Math.hypot(viewX, viewZ) || 1
  const dot = (viewX * frame.normalX + viewZ * frame.normalZ) / viewLen
  const incidenceDeg = (Math.acos(clamp(Math.abs(dot), 0, 1)) * 180) / Math.PI
  return { distanceMm, incidenceDeg, pointX: px, pointZ: pz }
}

// 站位到展板中心的三维视距（含眼高与标高差）
export const viewpointToPanel = (
  vp: ViewPoint,
  eyeHeight: number,
  panelCenter: { x: number; y: number; z: number },
): { distanceMm: number; incidenceDeg: number } => {
  const dx = panelCenter.x - vp.x
  const dz = panelCenter.z - vp.z
  const dy = panelCenter.y - eyeHeight
  const horizontal = Math.hypot(dx, dz) || 1
  const distanceMm = Math.hypot(horizontal, dy)
  const incidenceDeg = (Math.atan2(Math.abs(dy), horizontal) * 180) / Math.PI
  return { distanceMm, incidenceDeg }
}

// 动线折线长度（mm）
export const routeLength = (points: ViewPoint[]): number => {
  let total = 0
  for (let i = 1; i < points.length; i++) {
    total += dist2d(points[i - 1].x, points[i - 1].z, points[i].x, points[i].z)
  }
  return total
}
