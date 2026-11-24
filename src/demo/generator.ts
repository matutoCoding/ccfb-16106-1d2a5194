// 演示数据生成器：6 个展厅、200 块展板、完整墙面/展柜/动线/射灯
import type {
  DisplayCase,
  Exhibition,
  Hall,
  Panel,
  SpotLight,
  TextBlock,
  ViewPoint,
  Wall,
} from '@/types/domain'
import { uid } from '@/utils/math'
import { SYNTHETIC_FONT_ID } from '@/font/font_registry'

const HALL_THEMES = [
  { name: '第一展厅 · 文明曙光', en: 'Dawn of Civilization' },
  { name: '第二展厅 · 青铜时代', en: 'Bronze Age' },
  { name: '第三展厅 · 丝路华章', en: 'Silk Road Splendor' },
  { name: '第四展厅 · 营造之法', en: 'Architecture & Craft' },
  { name: '第五展厅 · 书画气韵', en: 'Painting & Calligraphy' },
  { name: '第六展厅 · 面向未来', en: 'Toward the Future' },
]

const TITLE_WORDS = ['千年', '遗珍', '匠心', '山河', '礼乐', '风华', '印记', '天工', '万象', '源流']
const BODY_TEMPLATES = [
  '本单元展示了这一时期重要的考古发现与工艺成就，观众可从中理解先民的生活方式与审美追求。',
  '文物背后承载着礼制秩序与技术演进，铭文与纹饰共同构成了完整的历史叙事。',
  '沿交流通道而来的器物与技艺在此融合，形成了兼具本土传统与外来元素的独特面貌。',
  '从原料采集到成品制作，分工细密的手工业体系体现了古代社会高度组织化的生产能力。',
  '笔墨之间可见时代精神，书风画法的转变与社会风尚的变迁互为表里。',
]
const LATIN_TITLES = [
  'Origins and Early Settlements',
  'Ritual Bronzes of the Period',
  'Exchange Along the Silk Road',
  'Traditional Building Techniques',
  'The Art of Brush and Ink',
  'Heritage in the Modern Era',
]

const pick = <T,>(arr: T[], i: number): T => arr[i % arr.length]

export interface DemoData {
  exhibition: Exhibition
  halls: Hall[]
  walls: Wall[]
  cases: DisplayCase[]
  panels: Panel[]
  viewpoints: ViewPoint[]
  spotlights: SpotLight[]
}

const makeBlock = (
  id: string,
  x: number,
  y: number,
  width: number,
  sizeMm: number,
  content: string,
  latin: string | undefined,
  color = '#1a1a1a',
  lineHeight = 1.5,
): TextBlock => ({
  id,
  x,
  y,
  width,
  height: 0,
  mode: 'horizontal',
  content,
  latinContent: latin,
  latinScale: 0.42,
  style: {
    fontChainId: SYNTHETIC_FONT_ID,
    sizeMm,
    color,
    bold: sizeMm >= 60,
    letterSpacingMm: sizeMm >= 60 ? 4 : 0.5,
    lineHeight,
  },
})

export const generateDemoExhibition = (panelTotal = 200): DemoData => {
  const halls: Hall[] = []
  const walls: Wall[] = []
  const cases: DisplayCase[] = []
  const panels: Panel[] = []
  const viewpoints: ViewPoint[] = []
  const spotlights: SpotLight[] = []
  let hallOffsetX = 0

  const perHall = Math.ceil(panelTotal / HALL_THEMES.length)

  HALL_THEMES.forEach((theme, hallIdx) => {
    const hallId = uid('hall')
    const hallWidth = 9000
    const hallDepth = 7000
    halls.push({
      id: hallId,
      name: theme.name,
      width: hallWidth,
      depth: hallDepth,
      wallHeight: 3600,
      floorColor: '#f1efe9',
    })

    // 四面墙
    const wallDefs: [string, [number, number], [number, number]][] = [
      ['北墙', [hallOffsetX, 0], [hallOffsetX + hallWidth, 0]],
      ['南墙', [hallOffsetX, hallDepth], [hallOffsetX + hallWidth, hallDepth]],
      ['西墙', [hallOffsetX, 0], [hallOffsetX, hallDepth]],
      ['东墙', [hallOffsetX + hallWidth, 0], [hallOffsetX + hallWidth, hallDepth]],
    ]
    const hallWallIds: string[] = []
    wallDefs.forEach(([name, from, to]) => {
      const id = uid('wall')
      hallWallIds.push(id)
      walls.push({ id, hallId, name, from, to, height: 3600, thickness: 120 })
    })

    // 展柜与独立展台
    for (let c = 0; c < 3; c++) {
      cases.push({
        id: uid('case'),
        hallId,
        name: `${theme.name} 展柜 ${c + 1}`,
        x: hallOffsetX + 1800 + c * 2400,
        y: hallDepth / 2,
        width: 1400,
        depth: 900,
        height: c === 1 ? 900 : 1100,
        type: c === 1 ? 'plinth' : 'island_case',
      })
    }

    // 射灯
    for (let l = 0; l < 4; l++) {
      spotlights.push({
        id: uid('light'),
        hallId,
        x: hallOffsetX + 1500 + l * 2000,
        y: 3400,
        z: 1200,
        targetX: hallOffsetX + 1500 + l * 2000,
        targetY: 1600,
        targetZ: 200,
        beamAngle: 28,
        intensity: 0.9,
      })
    }

    // 观众动线站位：距南北墙约 2.8m 的展陈常用阅读距离，成人与轮椅两种眼高
    for (let v = 0; v < 4; v++) {
      const x = hallOffsetX + 1200 + v * 2200
      viewpoints.push(
        { id: uid('vp'), x, z: 2800, heading: 0, audience: 'adult' },
        { id: uid('vp'), x: x + 600, z: 2800, heading: 0, audience: 'wheelchair' },
      )
    }

    // 展板：在南北墙交替布置，含前言大墙与小字展品卡
    let built = 0
    let panelSeq = 1
    while (built < perHall && panels.length < panelTotal) {
      const wallId = hallWallIds[built % 2 === 0 ? 0 : 1]
      const isIntro = panelSeq === 1
      const width = isIntro ? 3200 : 1100
      const height = isIntro ? 1800 : 760
      const title = `${pick(TITLE_WORDS, hallIdx * 3 + built)}${pick(TITLE_WORDS, hallIdx + built + 5)}`
      const code = `${String.fromCharCode(65 + hallIdx)}${hallIdx + 1}-${String(panelSeq).padStart(3, '0')}`
      const panelId = uid('panel')
      // 字高梯度：前言 120mm、板标题 48mm 在 3.4m 外达标；正文 20mm 临界；展品卡 8mm 偏小（系统应报警）
      const blocks: TextBlock[] = isIntro
        ? [
            makeBlock(uid('blk'), 120, 140, width - 240, 120, theme.name, theme.en, '#102038', 1.3),
            makeBlock(uid('blk'), 120, 620, width - 240, 36, pick(BODY_TEMPLATES, hallIdx), undefined, '#334155'),
          ]
        : [
            makeBlock(uid('blk'), 80, 70, width - 160, 48, title, pick(LATIN_TITLES, hallIdx), '#1a1a1a', 1.3),
            makeBlock(uid('blk'), 80, 260, width - 160, 20, pick(BODY_TEMPLATES, built), undefined, '#3f3f46', 1.6),
            makeBlock(uid('blk'), 80, height - 130, width - 160, 8, `展品编号 ${code} · 年代标注 · 出土信息`, undefined, '#71717a', 1.4),
          ]
      panels.push({
        id: panelId,
        code,
        title,
        hallId,
        wallId,
        width,
        height,
        elevation: isIntro ? 600 : 900,
        technique: isIntro ? 'acrylic_3d' : pick(['cut_vinyl', 'uv_print', 'silk_screen', 'acrylic_3d'], built),
        thicknessMm: isIntro ? 12 : 8,
        substrateColor: isIntro ? '#e8e2d4' : '#f7f5f0',
        blocks,
        images: built % 2 === 0
          ? [{ id: uid('img'), x: 80, y: 420, width: width - 160, height: 240, imageCode: `IMG-${code}`, caption: title }]
          : [],
        updatedAt: Date.now(),
      })
      built++
      panelSeq++
    }
    hallOffsetX += hallWidth + 2000
  })

  const exhibition: Exhibition = {
    id: uid('exh'),
    name: '千年之路：文明互鉴文物特展',
    venue: '综合博物馆 一层临展厅',
    createdAt: Date.now(),
    hallIds: halls.map((h) => h.id),
    panelIds: panels.map((p) => p.id),
  }
  return { exhibition, halls, walls, cases, panels: panels.slice(0, panelTotal), viewpoints, spotlights }
}
