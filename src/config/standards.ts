// 展陈可读性行业参考阈值（可在设置页调整，这里给默认标准）

export const READABILITY_STANDARDS = {
  // 眼高 mm：成人平均 / 坐姿轮椅
  adultEyeHeight: 1600,
  wheelchairEyeHeight: 1200,
  // 最小字视角（角分）：常用展陈参考 18 角分（约 5.2/1000 视距比）
  minAngularMinute: 18,
  // 正文最小物理字高 mm（近距离展品卡参考）
  minBodyGlyphMm: 5,
  // 最大可接受入射角（度），斜看超过则视为视角劣化
  maxIncidenceDeg: 60,
  // WCAG 正文对比度 AA
  minContrast: 4.5,
  // 眩光允许覆盖文字比例（常规射灯照明约 30%~40%，超过 30% 视为影响阅读）
  maxGlareCoverage: 0.3,
  // 最大舒适阅读视距 mm
  maxViewDistanceMm: 6000,
} as const

export const SDF_CONFIG = {
  pxRange: 4,
  glyphSize: 96,
  atlasPadding: 2,
  maxAtlasSize: 4096,
} as const

export const TECHNIQUE_LABEL: Record<string, string> = {
  cut_vinyl: '刻字贴',
  uv_print: 'UV打印',
  silk_screen: '丝印',
  acrylic_3d: '亚克力立体字',
}
