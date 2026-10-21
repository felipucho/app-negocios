import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
if (!url || !anonKey) throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_ANON_KEY (ver .env.example)')

/** Cliente único de la app. Sólo la anon key: la service role nunca llega al navegador. */
export const supabase = createClient(url, anonKey)
