// 排版引擎：横竖混排、避头尾、标点挤压、中英基线对齐
// 纯函数，输入文本块与字体解析器，输出物理毫米坐标的行与字形 run
import type { LayoutLine, LayoutResult, LayoutRun, TextBlock } from '@/types/domain'
import type { FontRegistry } from '@/font/font_registry'
import {
  LINE_END_FORBIDDEN,
  LINE_START_FORBIDDEN,
  isCjkChar,
  squeezeFactor,
} from './kinsoku'

interface ResolvedChar {
  char: string
  unicode: number
  fontId: string
  isFallback: boolean
  missing: boolean
  // em 空间度量
  advanceEm: number
  // 物理毫米宽度
  widthMm: number
  cjk: boolean
}

export interface LayoutContext {
  registry: FontRegistry
  fontChainIds: string[]
}

const resolveChars = (text: string, ctx: LayoutContext, sizeMm: number, upm: number): ResolvedChar[] => {
  const resolved = ctx.registry.getOutlines(text, ctx.fontChainIds)
  return resolved.map((r) => ({
    char: r.char,
    unicode: r.unicode,
    fontId: r.fontId,
    isFallback: r.isFallback,
    missing: r.missing,
    advanceEm: r.outline.advance,
    widthMm: (r.outline.advance / upm) * sizeMm,
    cjk: isCjkChar(r.char),
  }))
}

// 避头尾换行：在允许的断点处折行
const wrapHorizontal = (
  chars: ResolvedChar[],
  maxWidth: number,
  letterSpacing: number,
): ResolvedChar[][] => {
  if (maxWidth <= 0) return [chars]
  const lines: ResolvedChar[][] = []
  let current: ResolvedChar[] = []
  let currentWidth = 0
  const widthOf = (c: ResolvedChar, isLineEnd: boolean) => {
    const squeeze = isLineEnd ? squeezeFactor(c.char, 'line-end') : 1
    return c.widthMm * squeeze + letterSpacing
  }
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]
    if (ch.char === '\n') {
      lines.push(current)
      current = []
      currentWidth = 0
      continue
    }
    const w = widthOf(ch, false)
    if (currentWidth + w > maxWidth && current.length) {
      // 行首禁则：下一个字符不能在行首 -> 把上一个字符也带下来
      let breakAt = current.length
      if (LINE_START_FORBIDDEN.has(ch.char)) {
        breakAt = Math.max(1, current.length - 1)
      }
      // 行尾禁则：当前行末字符不允许在行尾 -> 同样带下来
      while (breakAt > 1 && LINE_END_FORBIDDEN.has(current[breakAt - 1].char)) {
        breakAt--
      }
      const moved = current.slice(breakAt)
      lines.push(current.slice(0, breakAt))
      current = moved
      currentWidth = moved.reduce((sum, c) => sum + widthOf(c, false), 0)
    }
    current.push(ch)
    currentWidth += w
  }
  if (current.length) lines.push(current)
  return lines
}

const verticalWrap = (
  chars: ResolvedChar[],
  maxHeight: number,
  letterSpacing: number,
): ResolvedChar[][] => {
  if (maxHeight <= 0) return [chars]
  const columns: ResolvedChar[][] = []
  let current: ResolvedChar[] = []
  let used = 0
  for (const ch of chars) {
    if (ch.char === '\n') {
      columns.push(current)
      current = []
      used = 0
      continue
    }
    const w = ch.widthMm + letterSpacing
    if (used + w > maxHeight && current.length) {
      columns.push(current)
      current = []
      used = 0
    }
    current.push(ch)
    used += w
  }
  if (current.length) columns.push(current)
  return columns
}

// 把同字体的连续字符合并成 run，回退/缺字单独成 run 以便高亮
const buildRuns = (chars: ResolvedChar[], x: number, y: number): { runs: LayoutRun[]; width: number } => {
  const runs: LayoutRun[] = []
  let cursor = x
  let buffer: ResolvedChar[] = []
  const flush = (endX: number) => {
    if (!buffer.length) return
    const first = buffer[0]
    runs.push({
      text: buffer.map((c) => c.char).join(''),
      fontId: first.fontId,
      isFallback: first.isFallback,
      missing: first.missing,
      x: endX - buffer.reduce((s, c) => s + c.widthMm, 0),
      y,
      widthMm: buffer.reduce((s, c) => s + c.widthMm, 0),
    })
    buffer = []
  }
  for (const ch of chars) {
    const sameGroup =
      !buffer.length ||
      (buffer[buffer.length - 1].fontId === ch.fontId &&
        buffer[buffer.length - 1].isFallback === ch.isFallback &&
        buffer[buffer.length - 1].missing === ch.missing)
    if (!sameGroup) flush(cursor)
    buffer.push(ch)
    cursor += ch.widthMm
  }
  flush(cursor)
  return { runs, width: cursor - x }
}

export const layoutBlock = (block: TextBlock, ctx: LayoutContext): LayoutResult => {
  // 防御：外部数据异常时回退为空串，避免单块非法 content 中断全展排版
  const content = typeof block.content === 'string' ? block.content : String(block.content ?? '')
  const latinContent =
    typeof block.latinContent === 'string' ? block.latinContent : undefined
  const safeBlock: TextBlock = { ...block, content, latinContent }
  const sizeMm = safeBlock.style.sizeMm
  const upm = ctx.registry.getProvider(ctx.fontChainIds[0] ?? '').unitsPerEm || 1000
  const chars = resolveChars(safeBlock.content, ctx, sizeMm, upm)
  const spacing = safeBlock.style.letterSpacingMm
  const lineHeightMm = sizeMm * safeBlock.style.lineHeight
  const lines: LayoutLine[] = []
  const usedChars = new Set<string>()
  const missingChars: { char: string; blockId: string }[] = []

  if (safeBlock.mode === 'horizontal') {
    const wrapped = wrapHorizontal(chars, safeBlock.width, spacing)
    let y = safeBlock.y
    for (const lineChars of wrapped) {
      const { runs, width } = buildRuns(lineChars, safeBlock.x, y)
      lines.push({ runs, x: safeBlock.x, y, widthMm: width, heightMm: lineHeightMm, mode: 'horizontal' })
      y += lineHeightMm
    }
  } else {
    const columns = verticalWrap(chars, safeBlock.height, spacing)
    let x = safeBlock.x
    for (const colChars of columns) {
      const { runs, width } = buildRuns(colChars, x, safeBlock.y)
      lines.push({ runs, x, y: safeBlock.y, widthMm: width, heightMm: colChars.reduce((s, c) => s + c.widthMm, 0), mode: 'vertical' })
      x += lineHeightMm
    }
  }

  chars.forEach((c) => {
    usedChars.add(c.char)
    if (c.missing) missingChars.push({ char: c.char, blockId: safeBlock.id })
  })

  // 英文/拼音行：按比例缩小，基线与中文行底对齐
  if (safeBlock.latinContent) {
    const latinScale = safeBlock.latinScale ?? 0.45
    const latinSize = sizeMm * latinScale
    const latinResolved = resolveChars(safeBlock.latinContent, ctx, latinSize, upm)
    const latinLineHeight = latinSize * safeBlock.style.lineHeight
    const baseY = safeBlock.y + (lines[0]?.heightMm ?? lineHeightMm) - latinLineHeight * 0.15
    const { runs, width } = buildRuns(latinResolved, safeBlock.x, baseY)
    lines.push({
      runs,
      x: safeBlock.x,
      y: baseY,
      widthMm: width,
      heightMm: latinLineHeight,
      mode: 'horizontal',
    })
    latinResolved.forEach((c) => usedChars.add(c.char))
  }

  const totalHeightMm = lines.reduce((sum, l) => sum + (l.mode === 'horizontal' ? l.heightMm : 0), 0)
  return { lines, usedChars, missingChars, totalHeightMm }
}

export const layoutPanel = (
  blocks: TextBlock[],
  ctx: LayoutContext,
): { results: Map<string, LayoutResult>; allUsed: Set<string>; allMissing: { char: string; blockId: string }[] } => {
  const results = new Map<string, LayoutResult>()
  const allUsed = new Set<string>()
  const allMissing: { char: string; blockId: string }[] = []
  for (const block of blocks) {
    // 单块排版失败不中断全展，记录空结果保证索引完整
    try {
      const result = layoutBlock(block, ctx)
      results.set(block.id, result)
      result.usedChars.forEach((c) => allUsed.add(c))
      allMissing.push(...result.missingChars)
    } catch (err) {
      console.warn(`文本块 ${block.id} 排版失败，已跳过`, err)
      results.set(block.id, {
        lines: [],
        usedChars: new Set<string>(),
        missingChars: [],
        totalHeightMm: 0,
      })
    }
  }
  return { results, allUsed, allMissing }
}
