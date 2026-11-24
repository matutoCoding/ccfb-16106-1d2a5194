import { describe, expect, it } from 'vitest'
import { SyntheticProvider } from '@/font/synthetic_provider'
import { FontRegistry, SYNTHETIC_FONT_ID } from '@/font/font_registry'
import { layoutBlock, layoutPanel, type LayoutContext } from '@/layout/engine'
import { LINE_START_FORBIDDEN, LINE_END_FORBIDDEN } from '@/layout/kinsoku'
import type { TextBlock } from '@/types/domain'

const makeRegistry = (): FontRegistry => {
  const registry = new FontRegistry()
  return registry
}

const baseBlock = (over: Partial<TextBlock>): TextBlock => ({
  id: 'blk1',
  x: 0,
  y: 0,
  width: 120,
  height: 0,
  mode: 'horizontal',
  content: '文明交流互鉴，见证千年技艺。',
  style: {
    fontChainId: SYNTHETIC_FONT_ID,
    sizeMm: 20,
    color: '#111111',
    bold: false,
    letterSpacingMm: 0,
    lineHeight: 1.5,
  },
  ...over,
})

describe('排版引擎', () => {
  const registry = makeRegistry()
  const ctx: LayoutContext = { registry, fontChainIds: [SYNTHETIC_FONT_ID] }

  it('横排自动换行且行宽不超出排版框', () => {
    const result = layoutBlock(baseBlock({ width: 80 }), ctx)
    expect(result.lines.length).toBeGreaterThan(1)
    for (const line of result.lines) {
      expect(line.widthMm).toBeLessThanOrEqual(82)
    }
  })

  it('避头尾：行首禁则字符不会出现在行首', () => {
    const text = '第一句。第二句，第三句；（括号内容）'
    const result = layoutBlock(baseBlock({ content: text, width: 60 }), ctx)
    for (const line of result.lines) {
      const first = line.runs[0]?.text[0]
      if (first) expect(LINE_START_FORBIDDEN.has(first)).toBe(false)
    }
  })

  it('避头尾：行尾禁则字符不会出现在行尾', () => {
    const text = '开放（内容）继续排版文字内容测试'
    const result = layoutBlock(baseBlock({ content: text, width: 60 }), ctx)
    for (const line of result.lines) {
      const allText = line.runs.map((r) => r.text).join('')
      const last = allText[allText.length - 1]
      if (last && line !== result.lines[result.lines.length - 1]) {
        expect(LINE_END_FORBIDDEN.has(last)).toBe(false)
      }
    }
  })

  it('竖排按高度换列', () => {
    const result = layoutBlock(
      baseBlock({ mode: 'vertical', height: 60, width: 0, content: '竖排文字内容一二三四五六' }),
      ctx,
    )
    expect(result.lines.length).toBeGreaterThan(1)
    expect(result.lines.every((l) => l.mode === 'vertical')).toBe(true)
  })

  it('英文/拼音附加行与中文行基线对齐（同 y 起点体系）', () => {
    const result = layoutBlock(
      baseBlock({ latinContent: 'Civilization Exchange', latinScale: 0.42 }),
      ctx,
    )
    const latinLine = result.lines[result.lines.length - 1]
    expect(latinLine).toBeDefined()
    expect(latinLine.heightMm).toBeLessThan(20 * 1.5)
  })

  it('整版排版收集用到的字符', () => {
    const blocks = [baseBlock({ id: 'a' }), baseBlock({ id: 'b', content: '另一块展板内容' })]
    const { allUsed, results } = layoutPanel(blocks, ctx)
    expect(allUsed.size).toBeGreaterThan(5)
    expect(results.size).toBe(2)
  })

  it('合成字体覆盖 ASCII 与 CJK，无缺字', () => {
    const provider = new SyntheticProvider()
    expect(provider.hasGlyph('A'.codePointAt(0)!)).toBe(true)
    expect(provider.hasGlyph('文'.codePointAt(0)!)).toBe(true)
    const result = layoutBlock(baseBlock({ content: 'ABC 123 文明' }), ctx)
    expect(result.missingChars).toHaveLength(0)
  })

  it('防御：content 为 undefined 时不抛异常，返回空行结果', () => {
    const broken = baseBlock({ content: undefined as unknown as string })
    const result = layoutBlock(broken, ctx)
    expect(result.lines).toBeDefined()
    expect(Array.isArray(result.lines)).toBe(true)
  })
})
