<script setup lang="ts">
import { computed, ref } from 'vue'
import { useStore, selectPanel } from '@/store/app'
import { READABILITY_STANDARDS } from '@/config/standards'

const store = useStore()
const selectedHallId = ref(store.selectedHallId ?? '')

const hall = computed(() => store.halls.find((h) => h.id === selectedHallId.value) ?? store.halls[0])
const walls = computed(() => store.walls.filter((w) => w.hallId === hall.value?.id))
const cases = computed(() => store.cases.filter((c) => c.hallId === hall.value?.id))
const panels = computed(() => store.panels.filter((p) => p.hallId === hall.value?.id))
const viewpoints = computed(() => store.viewpoints)

// 俯视图缩放：毫米 -> 屏幕像素
const scale = computed(() => {
  if (!hall.value) return 0.1
  return Math.min(860 / hall.value.width, 560 / hall.value.depth)
})

const wallLines = computed(() =>
  walls.value.map((w) => ({
    id: w.id,
    x1: (w.from[0] - hallOrigin.value.x) * scale.value,
    y1: (w.from[1] - hallOrigin.value.z) * scale.value,
    x2: (w.to[0] - hallOrigin.value.x) * scale.value,
    y2: (w.to[1] - hallOrigin.value.z) * scale.value,
    name: w.name,
  })),
)

const hallOrigin = computed(() => {
  if (!hall.value) return { x: 0, z: 0 }
  const xs = walls.value.flatMap((w) => [w.from[0], w.to[0]])
  const zs = walls.value.flatMap((w) => [w.from[1], w.to[1]])
  return { x: Math.min(...xs), z: Math.min(...zs) }
})

const panelOnWall = (panelId: string) => {
  const panel = store.panels.find((p) => p.id === panelId)
  const wall = walls.value.find((w) => w.id === panel?.wallId)
  if (!panel || !wall) return null
  const t = 0.5
  return {
    x: (wall.from[0] + (wall.to[0] - wall.from[0]) * t - hallOrigin.value.x) * scale.value,
    y: (wall.from[1] + (wall.to[1] - wall.from[1]) * t - hallOrigin.value.z) * scale.value,
  }
}

const audienceLabel = (a: string) => (a === 'adult' ? `成人 ${READABILITY_STANDARDS.adultEyeHeight}mm` : `轮椅 ${READABILITY_STANDARDS.wheelchairEyeHeight}mm`)
</script>

<template>
  <section class="floor-page">
    <div v-if="!hall" class="empty-state">
      <div class="empty-icon"></div>
      <div><strong>暂无展厅数据</strong><p class="muted">先到「展览项目」页生成演示展览</p></div>
    </div>
    <template v-else>
      <div class="toolbar">
        <select v-model="selectedHallId" class="input">
          <option v-for="h in store.halls" :key="h.id" :value="h.id">{{ h.name }}</option>
        </select>
        <div class="legend">
          <span><i class="dot dot-wall"></i>墙面</span>
          <span><i class="dot dot-case"></i>展柜/展台</span>
          <span><i class="dot dot-panel"></i>展板挂载点</span>
          <span><i class="dot dot-vp"></i>观众动线</span>
        </div>
      </div>
      <div class="floor-grid">
        <div class="card plan-card">
          <svg :viewBox="`0 0 ${hall.width * scale} ${hall.depth * scale}`" class="plan-svg">
            <rect x="0" y="0" :width="hall.width * scale" :height="hall.depth * scale" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2" />
            <line
              v-for="line in wallLines"
              :key="line.id"
              :x1="line.x1" :y1="line.y1" :x2="line.x2" :y2="line.y2"
              stroke="#475569" stroke-width="10" stroke-linecap="round"
            />
            <text
              v-for="line in wallLines"
              :key="`${line.id}-t`"
              :x="(line.x1 + line.x2) / 2" :y="(line.y1 + line.y2) / 2 - 14"
              text-anchor="middle" font-size="13" fill="#64748b"
            >{{ line.name }} · 高 {{ hall.wallHeight }}mm</text>
            <g v-for="c in cases" :key="c.id">
              <rect
                :x="(c.x - c.width / 2 - hallOrigin.x) * scale"
                :y="(c.y - c.depth / 2 - hallOrigin.z) * scale"
                :width="c.width * scale" :height="c.depth * scale"
                :fill="c.type === 'plinth' ? '#d6d3d1' : '#e0f2fe'"
                stroke="#7dd3fc" stroke-width="1.5" rx="4"
              />
              <text
                :x="(c.x - hallOrigin.x) * scale" :y="(c.y - hallOrigin.z) * scale"
                text-anchor="middle" font-size="11" fill="#475569"
              >{{ c.type === 'plinth' ? '展台' : '展柜' }}</text>
            </g>
            <g v-for="p in panels" :key="p.id">
              <circle
                v-if="panelOnWall(p.id)"
                :cx="panelOnWall(p.id)!.x" :cy="panelOnWall(p.id)!.y" r="7"
                :class="['panel-dot', { active: store.selectedPanelId === p.id }]"
                @click="selectPanel(p.id)"
              />
              <title>{{ p.code }} · 标高 {{ p.elevation }}mm</title>
            </g>
            <g v-for="vp in viewpoints" :key="vp.id">
              <circle
                :cx="(vp.x - hallOrigin.x) * scale" :cy="(vp.z - hallOrigin.z) * scale"
                r="6" :class="['vp-dot', vp.audience]"
              />
              <title>{{ audienceLabel(vp.audience) }}</title>
            </g>
            <polyline
              :points="viewpoints.map((vp) => `${(vp.x - hallOrigin.x) * scale},${(vp.z - hallOrigin.z) * scale}`).join(' ')"
              fill="none" stroke="#1d4ed8" stroke-width="1.5" stroke-dasharray="6 4" opacity="0.5"
            />
          </svg>
        </div>
        <div class="card side-card">
          <h3 class="section-title">本厅展板（{{ panels.length }}）</h3>
          <div class="panel-list">
            <button
              v-for="p in panels" :key="p.id"
              class="panel-row"
              :class="{ active: store.selectedPanelId === p.id }"
              @click="selectPanel(p.id)"
            >
              <span class="panel-code">{{ p.code }}</span>
              <span class="panel-title">{{ p.title }}</span>
              <span class="muted">标高 {{ p.elevation }}mm</span>
            </button>
          </div>
        </div>
      </div>
    </template>
  </section>
</template>

<style scoped>
.toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--sp-5);
}

.legend {
  display: flex;
  gap: var(--sp-5);
  font-size: var(--fs-xs);
  color: var(--c-text-2);
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: var(--sp-2);
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
}

.dot-wall { background: #475569; }
.dot-case { background: #7dd3fc; }
.dot-panel { background: #1d4ed8; }
.dot-vp { background: #b45309; }

.floor-grid {
  display: grid;
  grid-template-columns: 1fr 320px;
  gap: var(--sp-5);
}

.plan-card {
  padding: var(--sp-4);
}

.plan-svg {
  width: 100%;
  height: auto;
}

.panel-dot {
  fill: #1d4ed8;
  cursor: pointer;
  transition: r var(--t-fast);
}

.panel-dot:hover, .panel-dot.active {
  fill: #b91c1c;
}

.vp-dot.adult { fill: #b45309; }
.vp-dot.wheelchair { fill: #15803d; }

.side-card {
  padding: var(--sp-4);
  max-height: 640px;
  overflow: auto;
}

.panel-list {
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.panel-row {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: var(--sp-3);
  align-items: center;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  padding: var(--sp-2) var(--sp-3);
  border-radius: var(--radius-sm);
}

.panel-row:hover, .panel-row.active {
  background: var(--c-primary-weak);
}

.panel-code {
  font-weight: var(--fw-semibold);
  color: var(--c-primary);
  font-size: var(--fs-xs);
}

.panel-title {
  font-size: var(--fs-sm);
}
</style>
