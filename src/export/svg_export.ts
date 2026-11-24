// 1:1 出图：刻字矢量轮廓 SVG（mm 单位）+ 中英对照清单 + 图片编号清单
// SVG 路径直接取自字形轮廓命令，与 SDF 光栅化共用同一数据源
import type { Panel, TextBlock } from '@/types/domain'
import { fontRegistry } from '@/font/font_registry'
import type { PathCommand } from '@/font/outline'

const mm = (v: number): string => (Math.round(v * 1000) / 1000).toString()

const commandsToSvgPath = (commands: PathCommand[], scale: number, dx: number, dy: number): string =>
  commands
    .map((c) => {
      if (c.type === 'M') return `M${mm(c.x * scale + dx)},${mm(-c.y * scale + dy)}`
      if (c.type === 'L') return `L${mm(c.x * scale + dx)},${mm(-c.y * scale + dy)}`
      if (c.type === 'Q')
        return `Q${mm(c.x1 * scale + dx)},${mm(-c.y1 * scale + dy)} ${mm(c.x * scale + dx)},${mm(-c.y * scale + dy)}`
      if (c.type === 'C')
        return `C${mm(c.x1 * scale + dx)},${mm(-c.y1 * scale + dy)} ${mm(c.x2 * scale + dx)},${mm(-c.y2 * scale + dy)} ${mm(c.x * scale + dx)},${mm(-c.y * scale + dy)}`
      return 'Z'
    })
    .join(' ')

interface PlacedGlyph {
  char: string
  xMm: number
  yMm: number
  sizeMm: number
  fontId: string
  blockId: string
}

// 把文本块展开为逐字形定位（与场景构建同一套推进逻辑）
const placeBlock = (block: TextBlock): PlacedGlyph[] => {
  const out: PlacedGlyph[] = []
  const sizeMm = block.style.sizeMm
  let y = block.y + sizeMm
  for (const line of block.content.split('\n')) {
    let x = block.x
    for (const char of [...line]) {
      if (char === ' ') {
        x += sizeMm * 0.3
        continue
      }
      const unicode = char.codePointAt(0) ?? 0
      const resolved = fontRegistry.resolveChar(unicode, [block.style.fontChainId])
      const provider = resolved.provider
      const upm = provider.unitsPerEm
      out.push({ char, xMm: x, yMm: y, sizeMm, fontId: resolved.fontId, blockId: block.id })
      x += (provider.getAdvance(unicode) / upm) * sizeMm + block.style.letterSpacingMm
    }
    y += sizeMm * block.style.lineHeight
  }
  return out
}

export const panelToSvg = (panel: Panel): string => {
  const placed = panel.blocks.flatMap(placeBlock)
  const paths: string[] = []
  for (const g of placed) {
    const provider = fontRegistry.getProvider(g.fontId)
    const outline = provider.getOutline(g.char.codePointAt(0) ?? 0)
    if (!outline) continue
    const scale = g.sizeMm / outline.unitsPerEm
    paths.push(
      `<path d="${commandsToSvgPath(outline.commands, scale, g.xMm, g.yMm)}" fill="${panel.blocks.find((b) => b.id === g.blockId)?.style.color ?? '#111'}"/>`,
    )
  }
  const imageRects = panel.images
    .map(
      (img) =>
        `  <rect x="${mm(img.x)}" y="${mm(panel.height - img.y - img.height)}" width="${mm(img.width)}" height="${mm(img.height)}" fill="none" stroke="#94a3b8" stroke-width="0.5" stroke-dasharray="3 2"/><text x="${mm(img.x + 4)}" y="${mm(panel.height - img.y - 8)}" font-size="10" fill="#64748b">${img.imageCode}</text>`,
    )
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${mm(panel.width)}mm" height="${mm(panel.height)}mm" viewBox="0 0 ${mm(panel.width)} ${mm(panel.height)}">
  <rect width="100%" height="100%" fill="${panel.substrateColor}"/>
${imageRects}
  <g id="cut-paths">
${paths.map((p) => `    ${p}`).join('\n')}
  </g>
</svg>`
}

export interface ManifestRow {
  panelCode: string
  chinese: string
  english: string
  imageCodes: string
  technique: string
  widthMm: number
  heightMm: number
}

// 中英对照与图片编号清单（CSV，带 BOM 方便 Excel 打开）
export const panelsToManifestCsv = (panels: Panel[]): string => {
  const rows: ManifestRow[] = panels.map((p) => ({
    panelCode: p.code,
    chinese: p.blocks.map((b) => b.content).join(' / '),
    english: p.blocks.map((b) => b.latinContent ?? '').filter(Boolean).join(' / '),
    imageCodes: p.images.map((i) => i.imageCode).join(';'),
    technique: p.technique,
    widthMm: p.width,
    heightMm: p.height,
  }))
  const header = '展板编号,中文文本,英文/拼音,图片编号,工艺,宽mm,高mm'
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`
  const body = rows
    .map((r) => [r.panelCode, r.chinese, r.english, r.imageCodes, r.technique, r.widthMm, r.heightMm].map(escape).join(','))
    .join('\n')
  return `﻿${header}\n${body}`
}

export const downloadTextFile = (filename: string, content: string, mime = 'image/svg+xml'): void => {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
