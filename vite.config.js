import { defineConfig } from 'vite'
import { resolve } from 'path'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        viewer: resolve(__dirname, 'index.html'),
        editor: resolve(__dirname, 'editor/index.html'),
      },
    },
  },
})
