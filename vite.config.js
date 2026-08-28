import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Renderer lives in src/renderer; built into ./dist which Electron loads via file://.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  server: { port: 5175 },
  build: {
    outDir: '../../dist',
    emptyOutDir: true,
  },
})
