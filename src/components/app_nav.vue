<script setup lang="ts">
import { RouterLink, useRoute } from 'vue-router'

const route = useRoute()
const navItems = [
  { to: '/projects', label: '展览项目', icon: 'M3 5h18v14H3z M3 9h18' },
  { to: '/floor', label: '展厅平面', icon: 'M4 4h16v16H4z M4 10h16 M10 4v16' },
  { to: '/layout', label: '图文排版', icon: 'M5 5h14 M5 10h10 M5 15h14 M5 19h8' },
  { to: '/preview', label: '上墙预览', icon: 'M3 7l9-4 9 4-9 4-9-4z M3 12l9 4 9-4 M3 17l9 4 9-4' },
  { to: '/readability', label: '可读性检查', icon: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7l8-4z M9 12l2 2 4-4' },
  { to: '/export', label: '出图', icon: 'M12 3v10 M7 9l5 5 5-5 M5 19h14' },
]
</script>

<template>
  <nav class="side-nav">
    <div class="brand">
      <span class="brand-mark">展</span>
      <div>
        <div class="brand-name">展陈排版工坊</div>
        <div class="brand-sub muted">SDF · WebGPU</div>
      </div>
    </div>
    <RouterLink
      v-for="item in navItems"
      :key="item.to"
      :to="item.to"
      class="nav-item"
      :class="{ active: route.path.startsWith(item.to) }"
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
        <path :d="item.icon" />
      </svg>
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<style scoped>
.side-nav {
  width: 216px;
  flex-shrink: 0;
  background: var(--c-surface);
  border-right: 1px solid var(--c-border);
  padding: var(--sp-5) var(--sp-3);
  display: flex;
  flex-direction: column;
  gap: var(--sp-1);
}

.brand {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-2) var(--sp-2) var(--sp-5);
}

.brand-mark {
  width: 40px;
  height: 40px;
  border-radius: var(--radius);
  background: var(--c-primary);
  color: #fff;
  display: grid;
  place-items: center;
  font-size: var(--fs-lg);
  font-weight: var(--fw-semibold);
}

.brand-name {
  font-weight: var(--fw-semibold);
  font-size: var(--fs-base);
}

.brand-sub {
  font-size: var(--fs-xs);
}

.nav-item {
  display: flex;
  align-items: center;
  gap: var(--sp-3);
  padding: var(--sp-3) var(--sp-3);
  border-radius: var(--radius);
  color: var(--c-text-2);
  text-decoration: none;
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  transition: background var(--t-fast), color var(--t-fast);
}

.nav-item svg {
  width: 20px;
  height: 20px;
}

.nav-item:hover {
  background: var(--c-bg);
  color: var(--c-text);
}

.nav-item.active {
  background: var(--c-primary-weak);
  color: var(--c-primary);
}
</style>
