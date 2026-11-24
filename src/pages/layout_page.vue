<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useStore, selectPanel, updatePanel, relayoutAll, ensureAtlasForPanel } from '@/store/app'
import type { Panel } from '@/types/domain'
import { TECHNIQUE_LABEL } from '@/config/standards'

const store = useStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const rendererReady = ref(false)
const renderError = ref('')
let renderer: import('@/webgpu/studio_renderer').StudioRenderer | null = null

const panel = computed<Panel | null>(
  () => store.panels.find((p) => p.id === store.selectedPanelId) ?? store.panels[0] ?? null,
)

const panelList = computed(() => store.panels.slice(0, 60))
const activeBlock = computed(() => panel.value?.blocks[0] ?? null)
const layoutResult = computed(() =>
  panel.value ? store.layouts.get(panel.value.blocks[0]?.id ?? '') : null,
)

const initRenderer = async () => {
  if (!canvasRef.value) return
  try {
    const { StudioRenderer } = await import('@/webgpu/studio_renderer')
    renderer = await StudioRenderer.create(canvasRef.value)
    rendererReady.value = true
    await drawPanel()
  } catch (err) {
    renderError.value = (err as Error).message
  }
}

const drawPanel = async () => {
  if (!renderer || !panel.value || !canvasRef.value) return
  const atlases = await ensureAtlasForPanel(panel.value)
  atlases.forEach(({ meta, pixels }) => renderer?.uploadAtlas(meta, pixels))
  const { buildPanelScene } = await import('@/preview/scene_builder')
  const wall = store.walls.find((w) => w.id === panel.value!.wallId)
  if (!wall) return
  const zones: never[] = []
  const scene = buildPanelScene(panel.value, wall, store.layouts, atlases[0].meta, zones)
  const canvas = canvasRef.value
  canvas.width = 900
  canvas.height = Math.max(420, Math.round(900 * (panel.value.height / panel.value.width)))
  renderer.setOrthoCamera(panel.value.height * 1.15)
  renderer.render({
    shapes: [scene.substrate],
    textInstances: scene.textInstances,
    glare: [],
  })
}

const onSelect = (id: string) => {
  selectPanel(id)
}

const patchStyle = async (patch: Partial<Panel['blocks'][number]['style']>) => {
  if (!panel.value || !activeBlock.value) return
  const next: Panel = {
    ...panel.value,
    blocks: panel.value.blocks.map((b, i) =>
      i === 0 ? { ...b, style: { ...b.style, ...patch } } : b,
    ),
  }
  await updatePanel(next)
}

const patchBlock = async (patch: Partial<Panel['blocks'][number]>) => {
  if (!panel.value) return
  const next: Panel = {
    ...panel.value,
    blocks: panel.value.blocks.map((b, i) => (i === 0 ? { ...b, ...patch } : b)),
  }
  await updatePanel(next)
}

const toggleMode = async () => {
  if (!activeBlock.value) return
  await patchBlock({ mode: activeBlock.value.mode === 'horizontal' ? 'vertical' : 'horizontal' })
  relayoutAll()
  await drawPanel()
}

watch(panel, async () => {
  await drawPanel()
})

onMounted(initRenderer)

const missingInPanel = computed(() => {
  if (!panel.value) return []
  const ids = new Set(panel.value.blocks.map((b) => b.id))
  return store.missingChars.filter((m) => ids.has(m.blockId))
})
</script>

<template>
  <section class="layout-page">
    <div v-if="!panel" class="empty-state">
      <div class="empty-icon"></div>
      <div><strong>暂无展板</strong><p class="muted">先到「展览项目」页生成演示展览</p></div>
    </div>
    <template v-else>
      <div class="layout-grid">
        <div class="card canvas-card">
          <div class="canvas-head">
            <strong>{{ panel.code }} · {{ panel.title }}</strong>
            <span class="tag tag-warn">{{ TECHNIQUE_LABEL[panel.technique] }}</span>
          </div>
          <div class="canvas-wrap">
            <canvas ref="canvasRef" class="sdf-canvas"></canvas>
            <p v-if="renderError" class="error-text">{{ renderError }}</p>
            <p v-else-if="!rendererReady" class="muted canvas-tip">正在初始化 WebGPU 距离场管线…</p>
          </div>
          <div v-if="layoutResult" class="layout-meta">
            <span class="muted">排版行数 {{ layoutResult.lines.length }}</span>
            <span class="muted">物理尺寸 {{ panel.width }} × {{ panel.height }} mm</span>
            <span class="muted">最小字高 {{ Math.min(...panel.blocks.map((b) => b.style.sizeMm)) }} mm</span>
          </div>
        </div>

        <div class="card editor-card">
          <h3 class="section-title">排版参数</h3>
          <label class="field">
            <span>字高（mm）</span>
            <input
              class="input" type="number" min="5" max="400"
              :value="activeBlock?.style.sizeMm"
              @change="(e) => patchStyle({ sizeMm: Number((e.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="field">
            <span>字间距（mm）</span>
            <input
              class="input" type="number" min="0" max="40" step="0.5"
              :value="activeBlock?.style.letterSpacingMm"
              @change="(e) => patchStyle({ letterSpacingMm: Number((e.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="field">
            <span>行高倍数</span>
            <input
              class="input" type="number" min="1" max="2.4" step="0.1"
              :value="activeBlock?.style.lineHeight"
              @change="(e) => patchStyle({ lineHeight: Number((e.target as HTMLInputElement).value) })"
            />
          </label>
          <label class="field">
            <span>文字颜色</span>
            <input
              type="color"
              :value="activeBlock?.style.color"
              @change="(e) => patchStyle({ color: (e.target as HTMLInputElement).value })"
            />
          </label>
          <button class="btn-ghost mode-btn" @click="toggleMode">
            切换为{{ activeBlock?.mode === 'horizontal' ? '竖排' : '横排' }}
          </button>
          <label class="field text-field">
            <span>正文内容</span>
            <textarea
              class="input" rows="5"
              :value="activeBlock?.content"
              @change="(e) => patchBlock({ content: (e.target as HTMLTextAreaElement).value })"
            ></textarea>
          </label>
          <div v-if="missingInPanel.length" class="missing-box">
            <strong>缺字回退（{{ missingInPanel.length }}）</strong>
            <div class="missing-chars">
              <span v-for="(m, i) in missingInPanel" :key="i" class="missing-char">{{ m.char }}</span>
            </div>
            <p class="muted">标红字符主字体缺失，已用备选字体渲染，刻字出图前请补齐字库</p>
          </div>
        </div>
      </div>

      <div class="card panel-picker">
        <h3 class="section-title">展板选择（展示前 60 块，共 {{ store.panels.length }}）</h3>
        <div class="picker-row">
          <button
            v-for="p in panelList" :key="p.id"
            class="picker-chip"
            :class="{ active: p.id === panel.id }"
            @click="onSelect(p.id)"
          >{{ p.code }}</button>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.layout-grid {
  display: grid;
  grid-template-columns: 1fr 340px;
  gap: var(--sp-5);
}

.canvas-card, .editor-card {
  padding: var(--sp-5);
}

.canvas-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--sp-4);
}

.canvas-wrap {
  background: #eef0f3;
  border-radius: var(--radius);
  padding: var(--sp-4);
  display: grid;
  place-items: center;
  min-height: 420px;
}

.sdf-canvas {
  max-width: 100%;
  background: #fff;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow);
}

.canvas-tip {
  position: absolute;
}

.layout-meta {
  display: flex;
  gap: var(--sp-5);
  margin-top: var(--sp-4);
  font-size: var(--fs-xs);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
  margin-bottom: var(--sp-4);
  font-size: var(--fs-sm);
  color: var(--c-text-2);
}

.field input, .field textarea {
  width: 100%;
}

.mode-btn {
  width: 100%;
  margin-bottom: var(--sp-4);
}

.text-field textarea {
  resize: vertical;
}

.missing-box {
  background: var(--c-warn-weak);
  border-radius: var(--radius);
  padding: var(--sp-4);
  color: var(--c-warn);
  font-size: var(--fs-xs);
}

.missing-chars {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
  margin: var(--sp-3) 0;
}

.missing-char {
  background: var(--c-danger);
  color: #fff;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: var(--radius-sm);
}

.panel-picker {
  margin-top: var(--sp-5);
  padding: var(--sp-5);
}

.picker-row {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.picker-chip {
  background: var(--c-bg);
  border: 1px solid var(--c-border);
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-xs);
  color: var(--c-text-2);
}

.picker-chip:hover, .picker-chip.active {
  border-color: var(--c-primary);
  color: var(--c-primary);
  background: var(--c-primary-weak);
}

.error-text {
  color: var(--c-danger);
  font-size: var(--fs-xs);
}
</style>
