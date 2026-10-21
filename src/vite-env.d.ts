/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

/** Versión de package.json. La define vite.config.ts (en las pruebas, vitest.config.ts). */
declare const __APP_VERSION__: string
