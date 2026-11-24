// 中日韩排版规则：避头尾字符集与标点挤压（JIS X 4051 简化版）

// 行首禁止出现（会被挤到上一行行尾）
export const LINE_START_FORBIDDEN = new Set(
  [
    '，', '。', '、', '；', '：', '？', '！', '）', '】', '》', '」', '』', '〕', '〉', '…', '—',
    '·', '’', '”', '％', '℃', '￠', '￡', '￦', '￥',
  ].flatMap((c) => [c, ...(c >= '！' && c <= '～' ? [String.fromCharCode(c.charCodeAt(0) - 0xfee0)] : [])]),
)

// 行尾禁止出现（会被挤到下一行行首）
export const LINE_END_FORBIDDEN = new Set([
  '（', '【', '《', '「', '『', '〔', '〈', '‘', '“',
])

// 可挤压标点：全角标点在行首/行尾/连续时压缩半角
export const SQUEEZABLE = new Set([
  '，', '。', '、', '；', '：', '？', '！', '）', '】', '》', '」', '』',
  '（', '【', '《', '「', '『', '…', '—',
])

export const isCjkChar = (ch: string): boolean => {
  const code = ch.codePointAt(0) ?? 0
  return (
    (code >= 0x2e80 && code <= 0x9fff) ||
    (code >= 0x3000 && code <= 0x303f) ||
    (code >= 0xff00 && code <= 0xffef) ||
    (code >= 0xf900 && code <= 0xfaff)
  )
}

export const isWhitespace = (ch: string): boolean => /\s/.test(ch)

// 标点挤压系数：行首开括号 0.5、行尾闭标点 0.5、连续标点各压 0.5
export const squeezeFactor = (
  ch: string,
  position: 'line-start' | 'line-end' | 'middle',
): number => {
  if (!SQUEEZABLE.has(ch)) return 1
  if (position === 'line-start' && LINE_END_FORBIDDEN.has(ch)) return 0.5
  if (position === 'line-end' && LINE_START_FORBIDDEN.has(ch)) return 0.5
  if (position === 'middle') return 0.75
  return 1
}
