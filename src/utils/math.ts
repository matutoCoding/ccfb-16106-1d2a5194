// 轻量 id 与数学工具，不引第三方

export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`

export const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, v))

export const degToRad = (d: number): number => (d * Math.PI) / 180

export const radToDeg = (r: number): number => (r * 180) / Math.PI

// 两点距离 mm
export const dist2d = (ax: number, ay: number, bx: number, by: number): number =>
  Math.hypot(bx - ax, by - ay)

// 点到线段最近点
export const closestPointOnSegment = (
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): [number, number] => {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  if (lenSq === 0) return [ax, ay]
  const t = clamp(((px - ax) * dx + (py - ay) * dy) / lenSq, 0, 1)
  return [ax + t * dx, ay + t * dy]
}

// sRGB 相对亮度
export const srgbLuminance = (hex: string): number => {
  const n = parseInt(hex.replace('#', ''), 16)
  const channels = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  })
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2]
}

// WCAG 对比度
export const contrastRatio = (hexA: string, hexB: string): number => {
  const la = srgbLuminance(hexA)
  const lb = srgbLuminance(hexB)
  const light = Math.max(la, lb)
  const dark = Math.min(la, lb)
  return (light + 0.05) / (dark + 0.05)
}
