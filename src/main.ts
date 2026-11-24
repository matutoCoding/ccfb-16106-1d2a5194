import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { useStore } from './store/app'
import './styles/global.css'

createApp(App).use(router).mount('#app')

// 开发态调试钩子，便于 CDP 冒烟与问题定位
if (import.meta.env.DEV) {
  ;(window as unknown as { __store: unknown }).__store = useStore()
}
