import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const root = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root,
  build: {
    outDir: resolve(root, 'dist'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve(root, 'index.html'),
        notFound: resolve(root, '404.html'),
        rules: resolve(root, 'rules.html'),
        socialPreview: resolve(root, 'og.html'),
      },
    },
  },
})
