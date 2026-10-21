import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// npm y Playwright corren desde la raíz del proyecto: package.json se lee desde ahí.
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

export default defineConfig({
  plugins: [react()],
  define: {
    // Versión de la app que se compara con version_minima() (src/app/version.ts).
    __APP_VERSION__: JSON.stringify(version),
  },
})
