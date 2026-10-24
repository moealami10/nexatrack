import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

/**
 * Hosted on GitHub Pages under moealami10.github.io/nexatrack/, so the
 * build must be rooted at /nexatrack/ (dev servers stay at /).
 * main.tsx uses the same base as the router basename.
 */
export default defineConfig(({ mode }) => ({
  base: mode === 'development' ? '/' : '/nexatrack/',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
}))
