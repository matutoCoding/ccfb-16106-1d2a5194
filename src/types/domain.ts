// 展陈系统领域模型，单位统一为毫米（mm），角度为度

export type ID = string

export type WritingMode = 'horizontal' | 'vertical'

// 上墙工艺：刻字贴 / UV打印 / 丝印 / 亚克力立体字
export type MountTechnique = 'cut_vinyl' | 'uv_print' | 'silk_screen' | 'acrylic_3d'

export interface FontAsset {
  id: ID
  family: string
  style: string
  format: 'ttf' | 'otf'
  // ArrayBuffer 存 IndexedDB，这里只放元数据
  byteLength: number
  createdAt: number
  // 是否为系统内置演示字体（无真实字库，走合成轮廓）
  synthetic?: boolean
}

export interface FontChain {
  // 主字体 -> 备选字体，按顺序回退
  fontIds: ID[]
}

export interface SdfGlyphRecord {
  glyphKey: string // fontId + ':' + unicode
  unicode: number
  atlasX: number
  atlasY: number
  // 字形 em 空间下的度量
  advance: number
  xMin: number
  yMin: number
  xMax: number
  yMax: number
  bearingX: number
  bearingY: number
}

export interface SdfAtlasMeta {
  id: ID
  fontId: ID
  version: number
  pxRange: number // SDF 距离场范围（像素）
  glyphSize: number // 单字形格像素
  width: number
  height: number
  glyphs: Record<string, SdfGlyphRecord>
  missing: number[] // 该字体缺字的 unicode 列表
}

export interface TextStyle {
  fontChainId: ID
  sizeMm: number // 物理字高（mm）
  color: string // 十六进制
  bold: boolean
  letterSpacingMm: number
  lineHeight: number // 倍数
}

export interface TextBlock {
  id: ID
  x: number
  y: number
  width: number // 排版框宽 mm，0 表示不换行
  height: number
  mode: WritingMode
  content: string
  style: TextStyle
  // 英文/拼音行（小一号，与中文基线对齐）
  latinContent?: string
  latinScale?: number
}

export interface ImagePlaceholder {
  id: ID
  x: number
  y: number
  width: number
  height: number
  imageCode: string // 图片编号，出图清单用
  caption?: string
}

export interface Panel {
  id: ID
  code: string // 展板编号，如 A1-012
  title: string
  hallId: ID
  wallId: ID
  width: number
  height: number
  elevation: number // 展板底边标高 mm
  technique: MountTechnique
  // 亚克力立体字参数
  thicknessMm?: number
  substrateColor: string
  blocks: TextBlock[]
  images: ImagePlaceholder[]
  updatedAt: number
}

export interface Wall {
  id: ID
  hallId: ID
  name: string
  // 平面多边形（墙面在地面投影），毫米
  from: [number, number]
  to: [number, number]
  height: number
  thickness: number
}

export interface DisplayCase {
  id: ID
  hallId: ID
  name: string
  x: number
  y: number
  width: number
  depth: number
  height: number
  type: 'wall_case' | 'island_case' | 'plinth' // 展柜 / 独立展台
}

export interface ViewPoint {
  id: ID
  // 动线站位，毫米
  x: number
  z: number
  // 朝向（度，0 = 朝北 -Z）
  heading: number
  audience: 'adult' | 'wheelchair'
}

export interface Hall {
  id: ID
  name: string
  // 展厅平面矩形
  width: number
  depth: number
  wallHeight: number
  floorColor: string
}

export interface SpotLight {
  id: ID
  hallId: ID
  x: number
  y: number // 高度
  z: number
  targetX: number
  targetY: number
  targetZ: number
  beamAngle: number // 光束角（度）
  intensity: number
}

export interface Exhibition {
  id: ID
  name: string
  venue: string
  createdAt: number
  hallIds: ID[]
  panelIds: ID[]
}

// 可读性检查结果
export interface PanelReadability {
  panelId: ID
  viewpointId: ID
  audience: 'adult' | 'wheelchair'
  distanceMm: number
  incidenceDeg: number // 视线与板面法线夹角
  glyphHeightMm: number
  angularMinute: number // 字视角（角分）
  contrastRatio: number
  glareCoverage: number // 眩光遮挡文字比例 0~1
  pass: boolean
  failures: string[]
}

export interface LayoutRun {
  text: string
  fontId: ID
  isFallback: boolean
  missing: boolean
  x: number
  y: number
  widthMm: number
}

export interface LayoutLine {
  runs: LayoutRun[]
  x: number
  y: number
  widthMm: number
  heightMm: number
  mode: WritingMode
}

export interface LayoutResult {
  lines: LayoutLine[]
  usedChars: Set<string>
  missingChars: { char: string; blockId: ID }[]
  totalHeightMm: number
}
