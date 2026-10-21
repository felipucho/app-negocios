import { defineConfig } from 'vitest/config'
import { loadEnv } from 'vite'

export default defineConfig({
  test: {
    include: ['tests/integracion/**/*.test.ts'],
    environment: 'node',
    env: loadEnv('integracion', process.cwd(), ''),
    testTimeout: 20000,
    fileParallelism: false,
  },
})
