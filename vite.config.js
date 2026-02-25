import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/RF-Constructor/',
  plugins: [react()],
  optimizeDeps: {
    include: ['mammoth']
  }
})
