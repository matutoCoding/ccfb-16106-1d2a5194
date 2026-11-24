<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStore, selectPanel, recomputeReadability } from '@/store/app'
import { benchmarkReadability } from '@/acceptance/benchmark'
import type { BenchmarkReport } from '@/acceptance/benchmark'
import { READABILITY_STANDARDS } from '@/config/standards'

const router = useRouter()
const store = useStore()
const filter = ref<'all' | 'fail' | 'pass'>('all')
const benchmark = ref<BenchmarkReport | null>(null)
const running = ref(false)

const rows = computed(() => {
  const list = [...store.readability.values()]
  if (filter.value === 'fail') return list.filter((r) => !r.pass)
  if (filter.value === 'pass') return list.filter((r) => r.pass)
  return list
})

const panelCode = (panelId: string) => store.panels.find((p) => p.id === panelId)?.code ?? panelId

const jumpToLayout = (panelId: string) => {
  selectPanel(panelId)
  void router.push('/layout')
}

const runBenchmark = () => {
  running.value = true
  // 模拟"改字体后重算"：全展可读性指标重算并计时（验收线 3 秒）
  benchmark.value = benchmarkReadability(store.panels, store.walls, store.halls, store.viewpoints, store.spotlights)
  recomputeReadability()
  running.value = false
}

const failCount = computed(() => [...store.readability.values()].filter((r) => !r.pass).length)
</script>

<template>
  <section class="readability-page">
    <div class="summary-grid">
      <div class="card stat-card">
        <span class="muted">展板总数</span>
        <strong>{{ store.readability.size }}</strong>
      </div>
      <div class="card stat-card ok">
        <span class="muted">合格</span>
        <strong>{{ store.readability.size - failCount }}</strong>
      </div>
      <div class="card stat-card danger">
        <span class="muted">不合格</span>
        <strong>{{ failCount }}</strong>
      </div>
      <div class="card stat-card">
        <span class="muted">上次重算耗时</span>
        <strong>{{ store.readabilityElapsedMs.toFixed(1) }} ms</strong>
      </div>
    </div>

    <div class="toolbar">
      <div class="filter-group">
        <button class="btn-ghost" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部</button>
        <button class="btn-ghost" :class="{ active: filter === 'fail' }" @click="filter = 'fail'">仅不合格</button>
        <button class="btn-ghost" :class="{ active: filter === 'pass' }" @click="filter = 'pass'">仅合格</button>
      </div>
      <button class="btn-primary" :disabled="running" @click="runBenchmark">
        {{ running ? '重算中…' : '模拟改字体后重算（3 秒验收基准）' }}
      </button>
    </div>

    <div v-if="benchmark" class="card bench-card" :class="{ pass: benchmark.passUnder3s }">
      <strong>验收基准结果</strong>
      <div class="bench-grid">
        <span>展板 {{ benchmark.panelCount }} 块 × 站位 {{ benchmark.viewpointCount }} 个</span>
        <span>中位耗时 <b>{{ benchmark.elapsedMs }} ms</b>（验收线 3000ms）</span>
        <span>五轮耗时 {{ benchmark.runsMs.join(' / ') }} ms</span>
        <span :class="benchmark.passUnder3s ? 'tag tag-ok' : 'tag tag-danger'">
          {{ benchmark.passUnder3s ? '通过 3 秒验收' : '未达标' }}
        </span>
      </div>
    </div>

    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>展板</th>
            <th>观众</th>
            <th>字高 mm</th>
            <th>字视角 角分</th>
            <th>对比度</th>
            <th>视距 mm</th>
            <th>入射角°</th>
            <th>眩光遮挡</th>
            <th>结论</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rows" :key="`${row.panelId}-${row.viewpointId}`" :class="{ failed: !row.pass }">
            <td><strong>{{ panelCode(row.panelId) }}</strong></td>
            <td>{{ row.audience === 'adult' ? `成人 ${READABILITY_STANDARDS.adultEyeHeight}` : `轮椅 ${READABILITY_STANDARDS.wheelchairEyeHeight}` }}</td>
            <td :class="{ warn: row.glyphHeightMm < READABILITY_STANDARDS.minBodyGlyphMm }">{{ row.glyphHeightMm }}</td>
            <td :class="{ warn: row.angularMinute < READABILITY_STANDARDS.minAngularMinute }">{{ row.angularMinute }}</td>
            <td :class="{ warn: row.contrastRatio < READABILITY_STANDARDS.minContrast }">{{ row.contrastRatio }}</td>
            <td :class="{ warn: row.distanceMm > READABILITY_STANDARDS.maxViewDistanceMm }">{{ row.distanceMm }}</td>
            <td :class="{ warn: row.incidenceDeg > READABILITY_STANDARDS.maxIncidenceDeg }">{{ row.incidenceDeg }}</td>
            <td :class="{ warn: row.glareCoverage > READABILITY_STANDARDS.maxGlareCoverage }">{{ (row.glareCoverage * 100).toFixed(1) }}%</td>
            <td>
              <span v-if="row.pass" class="tag tag-ok">合格</span>
              <span v-else class="tag tag-danger">{{ row.failures.join('、') }}</span>
            </td>
            <td>
              <button class="btn-ghost link-btn" @click="jumpToLayout(row.panelId)">去排版修改</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>

<style scoped>
.summary-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
}

.stat-card {
  padding: var(--sp-5);
  display: flex;
  flex-direction: column;
  gap: var(--sp-2);
}

.stat-card strong {
  font-size: var(--fs-2xl);
}

.stat-card.ok strong { color: var(--c-ok); }
.stat-card.danger strong { color: var(--c-danger); }

.toolbar {
  display: flex;
  justify-content: space-between;
  margin-bottom: var(--sp-5);
}

.filter-group {
  display: flex;
  gap: var(--sp-2);
}

.btn-ghost.active {
  border-color: var(--c-primary);
  color: var(--c-primary);
  background: var(--c-primary-weak);
}

.bench-card {
  padding: var(--sp-4) var(--sp-5);
  margin-bottom: var(--sp-5);
  border-left: 4px solid var(--c-warn);
}

.bench-card.pass {
  border-left-color: var(--c-ok);
}

.bench-grid {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sp-5);
  margin-top: var(--sp-3);
  font-size: var(--fs-sm);
  color: var(--c-text-2);
}

tr.failed {
  background: var(--c-danger-weak);
}

td.warn {
  color: var(--c-danger);
  font-weight: var(--fw-semibold);
}

.link-btn {
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
}
</style>
