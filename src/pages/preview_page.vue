<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useStore, selectPanel, ensureAtlasForPanel } from '@/store/app'
import { buildHallShapes, buildPanelScene } from '@/preview/scene_builder'
import { computeGlareZones } from '@/preview/glare'
import type { GlareInstance } from '@/webgpu/glare_renderer'
import type { TextInstance } from '@/webgpu/text_renderer'
import type { ShapeObject } from '@/webgpu/shape_renderer'
import { TECHNIQUE_LABEL } from '@/config/standards'

const store = useStore()
const canvasRef = ref<HTMLCanvasElement | null>(null)
const renderError = ref('')
const showGlare = ref(true)
const audienceFilter = ref<'all' | 'adult' | 'wheelchair'>('all')
const cameraPreset = ref<'walk' | 'front' | 'side'>('walk')

let renderer: import('@/webgpu/studio_renderer').StudioRenderer | null = null
let raf = 0
let orbitAngle = 0

const hall = computed(() => store.halls.find((h) => h.id === store.selectedHallId) ?? store.halls[0])
const panels = computed(() => store.panels.filter((p) => p.hallId === hall.value?.id).slice(0, 24))

const frame = async () => {
  if (!renderer || !hall.value) return
  const walls = store.walls.filter((w) => w.hallId === hall.value.id)
  const cases = store.cases.filter((c) => c.hallId === hall.value.id)
  const shapes: ShapeObject[] = buildHallShapes(hall.value, walls, cases)
  const texts: TextInstance[] = []
  const glares: GlareInstance[] = []
  for (const panel of panels.value) {
    const wall = walls.find((w) => w.id === panel.wallId)
    if (!wall) continue
    const atlases = await ensureAtlasForPanel(panel)
    if (!atlases.length) continue
    renderer.uploadAtlas(atlases[0].meta, atlases[0].pixels)
    const zones = computeGlareZones(panel, wall, store.spotlights.filter((l) => l.hallId === hall.value.id))
    const scene = buildPanelScene(panel, wall, store.layouts, atlases[0].meta, zones)
    shapes.push(scene.substrate)
    if (scene.acrylicMesh) shapes.push(scene.acrylicMesh)
    texts.push(...scene.textInstances)
    if (showGlare.value) glares.push(...scene.glare)
  }
  const eye =
    cameraPreset.value === 'front'
      ? [0, 1700, 5200]
      : cameraPreset.value === 'side'
        ? [4200, 1500, 200]
        : [Math.sin(orbitAngle) * 3600, 1500, Math.cos(orbitAngle) * 3600 + 1800]
  renderer.setPerspectiveCamera(eye as [number, number, number], [0, 1400, 0], 3800)
  renderer.render({ shapes, textInstances: texts, glare: glares })
}

const tick = () => {
  void frame()
  raf = requestAnimationFrame(tick)
}

const viewpoints = computed(() =>
  store.viewpoints.filter((vp) => audienceFilter.value === 'all' || vp.audience === audienceFilter.value),
)

onMounted(async () => {
  if (!canvasRef.value) return
  try {
    const { StudioRenderer } = await import('@/webgpu/studio_renderer')
    renderer = await StudioRenderer.create(canvasRef.value)
    canvasRef.value.width = 1000
    canvasRef.value.height = 620
    tick()
  } catch (err) {
    renderError.value = (err as Error).message
  }
})

onUnmounted(() => cancelAnimationFrame(raf))

watch([showGlare, cameraPreset, () => store.selectedPanelId], () => {
  orbitAngle += 0.4
})

const techniqueOf = (key: string) => panels.value.filter((p) => p.technique === key).length
</script>

<template>
  <section class="preview-page">
    <div class="toolbar card">
      <select v-model="store.selectedHallId" class="input">
        <option v-for="h in store.halls" :key="h.id" :value="h.id">{{ h.name }}</option>
      </select>
      <div class="preset-group">
        <button class="btn-ghost" :class="{ active: cameraPreset === 'walk' }" @click="cameraPreset = 'walk'">漫游视角</button>
        <button class="btn-ghost" :class="{ active: cameraPreset === 'front' }" @click="cameraPreset = 'front'">正面</button>
        <button class="btn-ghost" :class="{ active: cameraPreset === 'side' }" @click="cameraPreset = 'side'">斜视（反光）</button>
      </div>
      <label class="switch-row">
        <input type="checkbox" v-model="showGlare" />
        <span>射灯眩光叠加</span>
      </label>
      <label class="switch-row">
        <span>站位</span>
        <select v-model="audienceFilter" class="input">
          <option value="all">全部</option>
          <option value="adult">成人 1600mm</option>
          <option value="wheelchair">轮椅 1200mm</option>
        </select>
      </label>
    </div>

    <div class="preview-grid">
      <div class="card canvas-card">
        <canvas ref="canvasRef" class="preview-canvas"></canvas>
        <p v-if="renderError" class="error-text">{{ renderError }}</p>
        <p class="muted canvas-note">同一条距离场着色管线：前言大标题与 5mm 展品卡小字均为 SDF 纹理，拉近笔画边缘保持锐利；远距小字按人眼解析极限自然糊化</p>
      </div>
      <div class="card side-card">
        <h3 class="section-title">工艺材质</h3>
        <ul class="technique-list">
          <li v-for="(label, key) in TECHNIQUE_LABEL" :key="key">
            <span>{{ label }}</span>
            <strong>{{ techniqueOf(key) }}</strong>
          </li>
        </ul>
        <h3 class="section-title">本厅展板</h3>
        <div class="panel-list">
          <button
            v-for="p in panels" :key="p.id"
            class="panel-row"
            :class="{ active: store.selectedPanelId === p.id }"
            @click="selectPanel(p.id)"
          >
            <span>{{ p.code }}</span>
            <span class="muted">{{ TECHNIQUE_LABEL[p.technique] }}</span>
          </button>
        </div>
        <h3 class="section-title">观众站位（{{ viewpoints.length }}）</h3>
        <div class="vp-list">
          <span v-for="vp in viewpoints" :key="vp.id" class="vp-chip" :class="vp.audience">
            {{ vp.audience === 'adult' ? '成人' : '轮椅' }}
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.toolbar {
  display: flex;
  align-items: center;
  gap: var(--sp-4);
  padding: var(--sp-4) var(--sp-5);
  margin-bottom: var(--sp-5);
  flex-wrap: wrap;
}

.preset-group {
  display: flex;
  gap: var(--sp-2);
}

.btn-ghost.active {
  border-color: var(--c-primary);
  color: var(--c-primary);
  background: var(--c-primary-weak);
}

.switch-row {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
  font-size: var(--fs-sm);
  color: var(--c-text-2);
}

.preview-grid {
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: var(--sp-5);
}

.canvas-card {
  padding: var(--sp-4);
}

.preview-canvas {
  width: 100%;
  display: block;
  border-radius: var(--radius);
  background: #f5f6f8;
}

.canvas-note {
  margin: var(--sp-3) 0 0;
  line-height: 1.6;
}

.side-card {
  padding: var(--sp-4);
  max-height: 700px;
  overflow: auto;
}

.technique-list {
  list-style: none;
  margin: 0 0 var(--sp-5);
  padding: 0;
}

.technique-list li {
  display: flex;
  justify-content: space-between;
  padding: var(--sp-2) 0;
  border-bottom: 1px solid var(--c-border);
  font-size: var(--fs-sm);
}

.panel-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
  margin-bottom: var(--sp-5);
}

.panel-row {
  display: flex;
  justify-content: space-between;
  background: transparent;
  border: 1px solid transparent;
  padding: var(--sp-2);
  border-radius: var(--radius-sm);
  font-size: var(--fs-xs);
}

.panel-row:hover, .panel-row.active {
  background: var(--c-primary-weak);
}

.vp-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-2);
}

.vp-chip {
  padding: 2px var(--sp-2);
  border-radius: var(--radius-sm);
  font-size: var(--fs-xs);
}

.vp-chip.adult {
  background: var(--c-warn-weak);
  color: var(--c-warn);
}

.vp-chip.wheelchair {
  background: var(--c-ok-weak);
  color: var(--c-ok);
}

.error-text {
  color: var(--c-danger);
}
</style>
