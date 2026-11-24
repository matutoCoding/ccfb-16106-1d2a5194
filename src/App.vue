<script setup lang="ts">
import { onMounted } from 'vue'
import { RouterView, useRoute } from 'vue-router'
import { tokens } from '@/styles/tokens'
import { initApp, useStore } from '@/store/app'
import AppNav from '@/components/app_nav.vue'

const route = useRoute()
const store = useStore()

onMounted(() => {
  const style = document.createElement('style')
  style.textContent = tokens
  document.head.appendChild(style)
  void initApp()
})
</script>

<template>
  <div class="app-shell">
    <AppNav />
    <main class="app-main">
      <header v-if="route.meta.title" class="main-header">
        <h1 class="page-title">{{ route.meta.title }}</h1>
        <div v-if="store.exhibition" class="project-meta">
          <span class="muted">{{ store.exhibition.name }}</span>
          <span class="muted">展板 {{ store.panels.length }} 块</span>
        </div>
      </header>
      <RouterView v-if="store.ready" />
      <div v-else class="loading-state muted">正在初始化 IndexedDB 与字体管线…</div>
    </main>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  min-height: 100vh;
}

.app-main {
  flex: 1;
  padding: var(--sp-6) var(--sp-7);
  min-width: 0;
}

.main-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--sp-4);
  margin-bottom: var(--sp-5);
}

.project-meta {
  display: flex;
  gap: var(--sp-4);
}

.loading-state {
  padding: var(--sp-7);
  text-align: center;
}
</style>
