<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useStore, createDemoProject, importFontFile } from '@/store/app'
import { SYNTHETIC_FONT_ID } from '@/font/font_registry'
import { TECHNIQUE_LABEL } from '@/config/standards'

const router = useRouter()
const store = useStore()
const importing = ref(false)
const importError = ref('')

const onFontFile = async (event: Event) => {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  importing.value = true
  importError.value = ''
  try {
    await importFontFile(file)
  } catch (err) {
    importError.value = `字体解析失败：${(err as Error).message}`
  } finally {
    importing.value = false
    input.value = ''
  }
}

const createDemo = async () => {
  await createDemoProject()
  await router.push('/floor')
}

const techniqueCount = (key: string) => store.panels.filter((p) => p.technique === key).length
</script>

<template>
  <section class="projects-page">
    <div class="grid-2">
      <div class="card panel-block">
        <h2 class="section-title">展览项目</h2>
        <div v-if="store.exhibition" class="project-info">
          <div class="info-row"><span class="muted">项目名称</span><strong>{{ store.exhibition.name }}</strong></div>
          <div class="info-row"><span class="muted">场馆</span><span>{{ store.exhibition.venue }}</span></div>
          <div class="info-row"><span class="muted">展厅</span><span>{{ store.halls.length }} 个</span></div>
          <div class="info-row"><span class="muted">展板</span><span>{{ store.panels.length }} 块</span></div>
          <div class="info-row"><span class="muted">观众站位</span><span>{{ store.viewpoints.length }} 个</span></div>
        </div>
        <div v-else class="empty-state">
          <div class="empty-icon"></div>
          <div>
            <strong>还没有展览项目</strong>
            <p class="muted">生成一个含 200 块展板的完整演示展览，数据全部保存在浏览器 IndexedDB</p>
          </div>
        </div>
        <div class="actions">
          <button class="btn-primary" :disabled="importing" @click="createDemo">
            {{ store.exhibition ? '重建 200 板演示展览' : '生成演示展览（200 块展板）' }}
          </button>
        </div>
        <div v-if="store.exhibition" class="technique-grid">
          <div v-for="(label, key) in TECHNIQUE_LABEL" :key="key" class="technique-item">
            <span class="muted">{{ label }}</span>
            <strong>{{ techniqueCount(key) }}</strong>
          </div>
        </div>
      </div>

      <div class="card panel-block">
        <h2 class="section-title">字体库</h2>
        <p class="muted font-hint">导入 TTF / OTF 字体，系统只对排版实际用到的字在 Worker 中生成距离场图集</p>
        <label class="upload-zone">
          <input type="file" accept=".ttf,.otf" hidden @change="onFontFile" />
          <span>{{ importing ? '正在解析字体…' : '点击导入 TTF / OTF 字体' }}</span>
        </label>
        <p v-if="importError" class="error-text">{{ importError }}</p>
        <ul class="font-list">
          <li class="font-item">
            <div>
              <strong>内置演示黑体（合成）</strong>
              <p class="muted">系统内置 · 无真实字库时跑通全管线</p>
            </div>
            <span class="tag tag-warn">fallback</span>
          </li>
          <li v-for="font in store.fonts" :key="font.id" class="font-item">
            <div>
              <strong>{{ font.family }}</strong>
              <p class="muted">{{ font.format.toUpperCase() }} · {{ (font.byteLength / 1024 / 1024).toFixed(2) }} MB</p>
            </div>
            <span class="tag tag-ok">已加载</span>
          </li>
        </ul>
        <div v-if="store.missingChars.length" class="missing-box">
          <strong>缺字回退提示</strong>
          <p>当前排版有 {{ store.missingChars.length }} 处字符在主字体缺失，已回退到
            {{ store.activeFontChain.includes(SYNTHETIC_FONT_ID) ? '内置合成字体' : '备选字体' }}，排版页会逐字标红</p>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-5);
}

.panel-block {
  padding: var(--sp-5);
}

.project-info {
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
  margin-bottom: var(--sp-5);
}

.info-row {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-sm);
}

.actions {
  margin-bottom: var(--sp-5);
}

.technique-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--sp-3);
}

.technique-item {
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: var(--sp-3);
  display: flex;
  justify-content: space-between;
}

.font-hint {
  margin: 0 0 var(--sp-4);
}

.upload-zone {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--c-border);
  border-radius: var(--radius);
  padding: var(--sp-6);
  color: var(--c-text-2);
  cursor: pointer;
  transition: border-color var(--t-fast), color var(--t-fast);
  margin-bottom: var(--sp-4);
}

.upload-zone:hover {
  border-color: var(--c-primary);
  color: var(--c-primary);
}

.font-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--sp-3);
}

.font-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border: 1px solid var(--c-border);
  border-radius: var(--radius);
  padding: var(--sp-3) var(--sp-4);
}

.font-item p {
  margin: var(--sp-1) 0 0;
}

.missing-box {
  margin-top: var(--sp-4);
  padding: var(--sp-4);
  background: var(--c-warn-weak);
  border-radius: var(--radius);
  color: var(--c-warn);
  font-size: var(--fs-xs);
}

.missing-box p {
  margin: var(--sp-2) 0 0;
  line-height: 1.6;
}

.error-text {
  color: var(--c-danger);
  font-size: var(--fs-xs);
}
</style>
