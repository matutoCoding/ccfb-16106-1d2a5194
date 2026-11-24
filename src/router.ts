import { createRouter, createWebHashHistory } from 'vue-router'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', redirect: '/projects' },
    { path: '/projects', name: 'projects', component: () => import('@/pages/projects_page.vue'), meta: { title: '展览项目' } },
    { path: '/floor', name: 'floor', component: () => import('@/pages/floor_page.vue'), meta: { title: '展厅平面' } },
    { path: '/layout', name: 'layout', component: () => import('@/pages/layout_page.vue'), meta: { title: '图文排版' } },
    { path: '/preview', name: 'preview', component: () => import('@/pages/preview_page.vue'), meta: { title: '上墙预览' } },
    { path: '/readability', name: 'readability', component: () => import('@/pages/readability_page.vue'), meta: { title: '可读性检查' } },
    { path: '/export', name: 'export', component: () => import('@/pages/export_page.vue'), meta: { title: '出图' } },
  ],
})
