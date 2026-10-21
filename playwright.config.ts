import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

// SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY de Supabase LOCAL (tarea 4, .env.integracion.local).
// Los usan preparar.ts y las pruebas (en Node); nunca llegan al navegador. Las variables ya puestas ganan.
Object.assign(process.env, { ...loadEnv('integracion', process.cwd(), 'SUPABASE_'), ...process.env })

// No es el 4173 de `vite preview`: así nunca se reusa un preview de producción (Supabase alojado).
const PUERTO = 4317

export default defineConfig({
  testDir: './tests/e2e',
  // Ruta en texto: testConfig.globalSetup acepta "string | Array<string>" (V8 de la parte 1, verificada).
  globalSetup: './tests/e2e/preparar.ts',
  // Un kiosco compartido y una prueba que apaga el fiado: de a una y en orden.
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://localhost:${PUERTO}`,
    // Las trazas guardan lo tipeado (contraseñas de prueba generadas en cada corrida): quedan en test-results/,
    // que no va al repo (.gitignore de la tarea 0).
    trace: 'retain-on-failure',
  },
  webServer: {
    // Modo e2e: Vite lee .env y .env.local (Supabase local) y nunca .env.production.local.
    command: `npx vite build --mode e2e && npx vite preview --port ${PUERTO} --strictPort`,
    url: `http://localhost:${PUERTO}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
