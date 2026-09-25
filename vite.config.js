import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The server API runs on http://localhost:8791 (see server/.env PORT and the
// Wave C deploy). Dev and preview both proxy /api to it so the frontend can
// call the real backend same-origin. On the static GitHub Pages site (no
// backend) the proxy never applies — fetch fails and screens fall back to seed.
const API_TARGET = 'http://localhost:8791'
const proxy = { '/api': { target: API_TARGET, changeOrigin: true } }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: process.env.DEPLOY_BASE || '/',
  server: { proxy },
  preview: { proxy },
  test: { environment: 'node', include: ['src/**/*.test.{js,jsx}'] },
})
