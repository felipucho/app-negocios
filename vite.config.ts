import { readFileSync } from 'node:fs'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { archivoHeaders, exigirClaveAnonDeProduccion, exigirSupabaseDeProduccion } from './config/headers.ts'

// npm y Playwright corren desde la raíz del proyecto: package.json se lee desde ahí.
const { version } = JSON.parse(readFileSync('package.json', 'utf8')) as { version: string }

/** Escribe dist/_headers con la CSP armada con las URLs del build (Cloudflare lo aplica a los assets). */
function headersCloudflare(supabaseUrl: string | undefined, anonKey: string | undefined, sentryDsn: string | undefined, produccion: boolean): Plugin {
  return {
    name: 'headers-cloudflare',
    apply: 'build',
    generateBundle() {
      if (!supabaseUrl) this.error('Falta VITE_SUPABASE_URL: sin ella no se puede armar la CSP de _headers.')
      if (produccion) {
        exigirSupabaseDeProduccion(supabaseUrl)
        exigirClaveAnonDeProduccion(anonKey)
      }
      this.emitFile({ type: 'asset', fileName: '_headers', source: archivoHeaders({ supabaseUrl, sentryDsn }) })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    plugins: [react(), headersCloudflare(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, env.VITE_SENTRY_DSN || undefined, mode === 'production')],
    define: {
      // Versión de la app que se compara con version_minima() (src/app/version.ts).
      __APP_VERSION__: JSON.stringify(version),
    },
  }
})
