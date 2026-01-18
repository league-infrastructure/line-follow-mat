import { defineConfig } from 'vite'

export default defineConfig({
  // Use relative paths for assets so it works on GitHub Pages subpaths
  base: './',
  build: {
    outDir: 'dist',
    emptyOutDir: true
  }
})
