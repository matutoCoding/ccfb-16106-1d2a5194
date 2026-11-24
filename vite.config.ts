import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  // 固定监听 IPv4，避免部分环境 Node 默认仅绑定 IPv6 ::1 导致 127.0.0.1 不可达
  server: { host: '127.0.0.1' },
  preview: { host: '127.0.0.1' },
  plugins: [vue(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es',
  },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
})
