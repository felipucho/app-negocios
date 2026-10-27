import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY (ver .env.example)')

/** Dónde guarda supabase-js la sesión. Fija para poder borrarla si signOut falla sin red (V35). */
export const CLAVE_SESION = 'kiosco-sesion'

/** Cliente único de la app. Sólo la anon key: la service role nunca llega al navegador. */
export const supabase = createClient(url, anonKey, {
  // Un enlace con #access_token no inicia sesión: la app no usa flujos por URL.
  auth: { storageKey: CLAVE_SESION, detectSessionInUrl: false },
})
