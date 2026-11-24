<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useStore } from '@/store/app'
import { measureTextPrecision, type PrecisionReport } from '@/acceptance/precision'
import { fontRegistry } from '@/font/font_registry'
import { downloadTextFile, panelsToManifestCsv, panelToSvg } from '@/export/svg_export'

const store = useStore()
const selectedIds = ref<Set<string>>(new Set())
const precision = ref<PrecisionReport[]>([])
const exporting = ref(false)

const panels = computed(() => store.panels)
const allSelected = computed(() => selectedIds.value.size === panels.value.length)

const toggleAll = () => {
  selectedIds.value = allSelected.value ? new Set() : new Set(panels.value.map((p) => p.id))
}

const toggleOne = (id: string) => {
  const next = new Set(selectedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedIds.value = next
}

const exportSvg = (panelId: string) => {
  const panel = store.panels.find((p) => p.id === panelId)
  if (!panel) return
  downloadTextFile(`${panel.code}.svg`, panelToSvg(panel))
}

const exportSelected = () => {
  exporting.value = true
  for (const panel of store.panels.filter((p) => selectedIds.value.has(p.id))) {
    downloadTextFile(`${panel.code}.svg`, panelToSvg(panel))
  }
  exporting.value = false
}

const exportManifest = () => {
  downloadTextFile('展板中英对照与图片清单.csv', panelsToManifestCsv(store.panels), 'text/csv')
}

const runPrecision = () => {
  // 交互展示取代表字形两档字高；完整字形批测由单元测试覆盖
  const sample = '文明青铜A1'
  const outlines = [...sample].map((char) => ({
    char,
    outline: fontRegistry.getProvider(store.activeFontChain[0]).getOutline(char.codePointAt(0) ?? 0)!,
  }))
  const small = measureTextPrecision(outlines, 30)
  const large = measureTextPrecision(outlines, 200)
  precision.value = [...small, ...large]
}

onMounted(runPrecision)

const maxDeviation = computed(() =>
  precision.value.length ? Math.max(...precision.value.map((r) => r.maxDeviationMm)) : 0,
)
</script>

<template>
  <section class="export-page">
    <div class="card precision-card">
      <h3 class="section-title">1:1 刻字轮廓精度验收</h3>
      <p class="muted">同一份字形轮廓分别走 SVG 矢量路径与距离场光栅化，测量 SDF 零等值线相对矢量轮廓的毫米级偏差，验收线 0.1mm</p>
      <div class="precision-summary">
        <div class="stat">
          <span class="muted">采样字形</span>
          <strong>{{ precision.length }}</strong>
        </div>
        <div class="stat">
          <span class="muted">最大偏差</span>
          <strong :class="maxDeviation < 0.1 ? 'ok' : 'danger'">{{ maxDeviation.toFixed(4) }} mm</strong>
        </div>
        <div>
          <span :class="maxDeviation < 0.1 ? 'tag tag-ok' : 'tag tag-danger'">
            {{ maxDeviation < 0.1 ? '通过 0.1mm 验收' : '未达标' }}
          </span>
        </div>
        <button class="btn-ghost" @click="runPrecision">重新测量</button>
      </div>
      <div class="precision-table">
        <table>
          <thead><tr><th>字符</th><th>字高 mm</th><th>最大偏差 mm</th><th>均方根 mm</th><th>采样点</th><th>结论</th></tr></thead>
          <tbody>
            <tr v-for="(r, i) in precision.slice(0, 12)" :key="i">
              <td class="glyph-cell">{{ r.char }}</td>
              <td>{{ r.sizeMm }}</td>
              <td>{{ r.maxDeviationMm }}</td>
              <td>{{ r.rmsDeviationMm }}</td>
              <td>{{ r.sampleCount }}</td>
              <td><span :class="r.pass01mm ? 'tag tag-ok' : 'tag tag-danger'">{{ r.pass01mm ? '合格' : '超差' }}</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="card export-card">
      <div class="export-head">
        <h3 class="section-title">刻字矢量出图（SVG · 1:1 毫米单位）</h3>
        <div class="head-actions">
          <button class="btn-ghost" @click="toggleAll">{{ allSelected ? '取消全选' : '全选' }}</button>
          <button class="btn-primary" :disabled="!selectedIds.size || exporting" @click="exportSelected">
            导出选中 {{ selectedIds.size }} 块
          </button>
          <button class="btn-ghost" @click="exportManifest">导出中英对照 + 图片清单 CSV</button>
        </div>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th style="width:48px"></th><th>展板编号</th><th>中文</th><th>英文/拼音</th><th>图片编号</th><th>工艺</th><th>操作</th></tr>
          </thead>
          <tbody>
            <tr v-for="panel in panels.slice(0, 80)" :key="panel.id">
              <td><input type="checkbox" :checked="selectedIds.has(panel.id)" @change="toggleOne(panel.id)" /></td>
              <td><strong>{{ panel.code }}</strong></td>
              <td class="text-cell">{{ panel.blocks.map((b) => b.content).join(' / ').slice(0, 40) }}</td>
              <td class="muted text-cell">{{ panel.blocks.map((b) => b.latinContent ?? '').filter(Boolean).join(' / ').slice(0, 40) }}</td>
              <td>{{ panel.images.map((i) => i.imageCode).join(';') || '—' }}</td>
              <td>{{ panel.technique }}</td>
              <td><button class="btn-ghost link-btn" @click="exportSvg(panel.id)">下载 SVG</button></td>
            </tr>
          </tbody>
        </table>
      </div>
      <p class="muted table-foot">仅展示前 80 块，全量 200 块可通过「全选 + 导出选中」批量出图</p>
    </div>
  </section>
</template>

<style scoped>
.precision-card, .export-card {
  padding: var(--sp-5);
  margin-bottom: var(--sp-5);
}

.precision-summary {
  display: flex;
  align-items: center;
  gap: var(--sp-6);
  margin: var(--sp-4) 0;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.stat strong {
  font-size: var(--fs-xl);
}

.ok { color: var(--c-ok); }
.danger { color: var(--c-danger); }

.precision-table {
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  overflow: auto;
}

.glyph-cell {
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
}

.export-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--sp-4);
  flex-wrap: wrap;
}

.head-actions {
  display: flex;
  gap: var(--sp-3);
}

.text-cell {
  max-width: 280px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-btn {
  padding: var(--sp-1) var(--sp-3);
  font-size: var(--fs-xs);
}

.table-foot {
  margin: var(--sp-3) 0 0;
}
</style>
