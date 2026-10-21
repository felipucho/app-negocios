import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Las pruebas no leen package.json; donde importa, la versión entra por parámetro.
  define: { __APP_VERSION__: JSON.stringify('0.0.0-pruebas') },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'config/**/*.test.ts'],
    setupFiles: ['./src/test/setup.ts'],
  },
})
