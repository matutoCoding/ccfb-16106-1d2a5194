// 材质定义：刻字贴 / UV打印 / 丝印 / 亚克力立体字 分材质表现
import type { MountTechnique } from '@/types/domain'

export interface MaterialSpec {
  key: string
  color: [number, number, number]
  // 镜面反射指数：亚克力高光最强，丝印哑光
  shininess: number
  // 金属/粗糙感调节系数
  specular: number
  roughnessLabel: string
}

const hexToRgb01 = (hex: string): [number, number, number] => {
  const n = parseInt(hex.replace('#', ''), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

export const techniqueMaterial = (
  technique: MountTechnique,
  color: string,
): MaterialSpec => {
  const rgb = hexToRgb01(color)
  switch (technique) {
    case 'cut_vinyl':
      // 刻字贴：哑光薄膜，弱高光
      return { key: 'vinyl', color: rgb, shininess: 24, specular: 0.12, roughnessLabel: '哑光' }
    case 'uv_print':
      // UV 打印：油墨微亮
      return { key: 'uv', color: rgb, shininess: 40, specular: 0.2, roughnessLabel: '微亮' }
    case 'silk_screen':
      // 丝印：最哑光
      return { key: 'silk', color: rgb, shininess: 12, specular: 0.06, roughnessLabel: '深哑' }
    case 'acrylic_3d':
      // 亚克力：强镜面高光，立体字侧面独立材质
      return { key: 'acrylic', color: rgb, shininess: 96, specular: 0.55, roughnessLabel: '高光' }
  }
}

// 亚克力立体字侧面（略暗的同色）
export const acrylicSideMaterial = (color: string): MaterialSpec => {
  const [r, g, b] = hexToRgb01(color)
  return {
    key: 'acrylic-side',
    color: [r * 0.72, g * 0.72, b * 0.72],
    shininess: 64,
    specular: 0.4,
    roughnessLabel: '侧面',
  }
}
