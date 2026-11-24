// 内置合成字体：无真实字库文件时跑通全管线的演示字形
// 拉丁/数字用几何笔画构造，CJK 按码点确定性生成方块笔画结构（真实字体导入后自动替换）
import type { GlyphOutline, PathCommand } from './outline'
import { commandsToContours, contoursToSegments } from './outline'
import type { GlyphProvider } from './opentype_provider'

const UPM = 1000
const LATIN_ADVANCE = 520
const CJK_ADVANCE = 1000

// 矩形轮廓（顺时针四条边）
const rect = (x: number, y: number, w: number, h: number): [number, number][] => [
  [x, y],
  [x + w, y],
  [x + w, y + h],
  [x, y + h],
  [x, y],
]

// 确定性伪随机
const seeded = (seed: number): (() => number) => {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => {
    s = (s * 16807) % 2147483647
    return (s - 1) / 2147483646
  }
}

const contoursToOutline = (
  unicode: number,
  advance: number,
  contours: [number, number][][],
): GlyphOutline => {
  const commands: PathCommand[] = []
  contours.forEach((ring) => {
    ring.forEach((p, i) => {
      commands.push({ type: i === 0 ? 'M' : 'L', x: p[0], y: p[1] })
    })
    commands.push({ type: 'Z' })
  })
  const flat = commandsToContours(commands, 0.5)
  const seg = contoursToSegments(flat)
  let xMin = Infinity
  let yMin = Infinity
  let xMax = -Infinity
  let yMax = -Infinity
  seg.segments.forEach((s) => {
    xMin = Math.min(xMin, s.x1, s.x2)
    yMin = Math.min(yMin, s.y1, s.y2)
    xMax = Math.max(xMax, s.x1, s.x2)
    yMax = Math.max(yMax, s.y1, s.y2)
  })
  if (!seg.segments.length) {
    xMin = yMin = 0
    xMax = advance
    yMax = 700
  }
  return {
    unicode,
    unitsPerEm: UPM,
    advance,
    xMin,
    yMin,
    xMax,
    yMax,
    commands,
    ...seg,
  }
}

// 简单七段式拉丁/数字骨架（笔画用矩形条表达）
const buildLatin = (unicode: number): GlyphOutline => {
  const ch = String.fromCodePoint(unicode)
  const contours: [number, number][][] = []
  const t = 70 // 笔画粗细
  const x0 = 40
  const w = LATIN_ADVANCE - 80
  const top = 720
  const bot = 0
  const midY = (top + bot) / 2
  const hbar = (y: number) => rect(x0, y - t / 2, w, t)
  const vbar = (x: number) => rect(x - t / 2, bot, t, top - bot)
  const digitMap: Record<string, (() => void)[]> = {
    '0': [() => contours.push(hbar(top)), () => contours.push(hbar(bot)), () => contours.push(vbar(x0)), () => contours.push(vbar(x0 + w))],
    '1': [() => contours.push(vbar(x0 + w / 2))],
    '2': [() => contours.push(hbar(top)), () => contours.push(vbar(x0 + w)), () => contours.push(hbar(midY)), () => contours.push(vbar(x0)), () => contours.push(hbar(bot))],
    '3': [() => contours.push(hbar(top)), () => contours.push(vbar(x0 + w)), () => contours.push(hbar(midY)), () => contours.push(hbar(bot))],
    '4': [() => contours.push(vbar(x0)), () => contours.push(vbar(x0 + w)), () => contours.push(hbar(midY))],
    '5': [() => contours.push(hbar(top)), () => contours.push(vbar(x0)), () => contours.push(hbar(midY)), () => contours.push(vbar(x0 + w)), () => contours.push(hbar(bot))],
    '6': [() => contours.push(hbar(top)), () => contours.push(vbar(x0)), () => contours.push(hbar(midY)), () => contours.push(vbar(x0 + w)), () => contours.push(hbar(bot))],
    '7': [() => contours.push(hbar(top)), () => contours.push(vbar(x0 + w))],
    '8': [() => contours.push(hbar(top)), () => contours.push(vbar(x0)), () => contours.push(vbar(x0 + w)), () => contours.push(hbar(midY)), () => contours.push(hbar(bot))],
    '9': [() => contours.push(hbar(top)), () => contours.push(vbar(x0)), () => contours.push(vbar(x0 + w)), () => contours.push(hbar(midY)), () => contours.push(hbar(bot))],
  }
  if (digitMap[ch]) {
    digitMap[ch].forEach((f) => f())
  } else if (/[A-Z]/.test(ch)) {
    contours.push(hbar(top), vbar(x0), vbar(x0 + w))
    if (!/[CEFGHIJKLMNSTUVWXYZ]/.test(ch)) contours.push(hbar(bot))
    if (!/[CEFGHIJKLMNOPQRSTUVWXYZ]/.test(ch) || /[AHPR]/.test(ch)) contours.push(hbar(midY))
    if (/[EGHILMNQR]/.test(ch)) contours.push(rect(x0, midY - t / 2, w, t))
  } else if (/[a-z]/.test(ch)) {
    contours.push(rect(x0, bot, t, midY - bot), rect(x0 + w - t, bot, t, midY - bot), rect(x0, midY - t / 2, w, t), rect(x0, bot, w, t))
  } else if (ch === ' ') {
    // 空格无轮廓
  } else {
    // 标点：小方块/圆点条
    contours.push(rect(x0 + w * 0.3, bot, t * 1.2, t * 1.2))
  }
  return contoursToOutline(unicode, LATIN_ADVANCE, contours)
}

// CJK 合成字形：码点播种的笔画网格，模拟方块字结构
const buildCjk = (unicode: number): GlyphOutline => {
  const rand = seeded(unicode * 2654435761)
  const contours: [number, number][][] = []
  const box = 120
  const t = 64
  const strokeCount = 7 + Math.floor(rand() * 4)
  for (let i = 0; i < strokeCount; i++) {
    const horizontal = rand() > 0.45
    const col = Math.floor(rand() * 3)
    const row = Math.floor(rand() * 3)
    const cell = (UPM - box * 2) / 3
    const x = box + col * cell
    const y = box + row * cell
    if (horizontal) {
      contours.push(rect(x, y, cell * (0.7 + rand() * 0.3), t))
    } else {
      contours.push(rect(x, y, t, cell * (0.7 + rand() * 0.3)))
    }
  }
  // 外框弱化：部分字加外口
  if (rand() > 0.5) {
    const s = t * 0.7
    contours.push(rect(box, box, UPM - box * 2, s))
    contours.push(rect(box, UPM - box - s, UPM - box * 2, s))
    contours.push(rect(box, box, s, UPM - box * 2))
    contours.push(rect(UPM - box - s, box, s, UPM - box * 2))
  }
  return contoursToOutline(unicode, CJK_ADVANCE, contours)
}

const isCjk = (unicode: number): boolean =>
  unicode >= 0x2e80 && unicode <= 0x9fff ||
  unicode >= 0xff00 && unicode <= 0xffef ||
  unicode >= 0x3000 && unicode <= 0x303f

export class SyntheticProvider implements GlyphProvider {
  readonly fontId: string
  readonly family = '内置演示黑体（合成）'
  readonly unitsPerEm = UPM
  private cache = new Map<number, GlyphOutline>()

  constructor(fontId = 'synthetic-hei') {
    this.fontId = fontId
  }

  hasGlyph(unicode: number): boolean {
    return unicode > 31
  }

  getAdvance(unicode: number): number {
    return isCjk(unicode) ? CJK_ADVANCE : LATIN_ADVANCE
  }

  getOutline(unicode: number): GlyphOutline | null {
    const hit = this.cache.get(unicode)
    if (hit) return hit
    const outline = isCjk(unicode) ? buildCjk(unicode) : buildLatin(unicode)
    this.cache.set(unicode, outline)
    return outline
  }
}
