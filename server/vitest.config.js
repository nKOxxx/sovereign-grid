import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup-env.js'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
})
