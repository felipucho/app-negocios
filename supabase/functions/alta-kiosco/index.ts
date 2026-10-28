// Alta de un kiosco con su cuenta de jefe y de caja. Sólo puede llamarla una cuenta de operador.
// Los usuarios de Auth los crea el service role de acá; el kiosco y las cuentas van por RPC con el JWT
// del operador, así que la base vuelve a chequear es_operador().
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

const CABECERAS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type',
  'content-type': 'application/json',
  // La respuesta trae claves en claro: que ningún caché la guarde.
  'cache-control': 'no-store',
}

const SIN_SESION = { auth: { persistSession: false, autoRefreshToken: false } }
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function responder(estado: number, cuerpo: unknown): Response {
  return new Response(JSON.stringify(cuerpo), { status: estado, headers: CABECERAS })
}

// Sólo códigos de la base o de esta función (minúsculas y guiones bajos): el resto no sale al cliente.
function codigo(e: unknown): string {
  const mensaje = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : ''
  return /^[a-z_]+$/.test(mensaje) ? mensaje : 'alta_fallida'
}

function claveNueva(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function crearUsuario(admin: SupabaseClient, email: string) {
  const password = claveNueva()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  const usuario = data?.user
  if (!usuario) throw new Error(error?.status === 422 ? 'email_ocupado' : 'alta_fallida')
  return { id: usuario.id, email, password }
}

async function vincular(operador: SupabaseClient, negocioId: string, usuarioId: string, rol: 'jefe' | 'caja') {
  const { error } = await operador.rpc('vincular_cuenta', { p_negocio: negocioId, p_usuario: usuarioId, p_rol: rol })
  if (error) throw error
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CABECERAS })
  if (req.method !== 'POST') return responder(405, { error: 'metodo_no_permitido' })

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')

  // Con el JWT del que llama: la base decide si es operador.
  const operador = createClient(url, anon, { ...SIN_SESION, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: esOperador, error: errorOperador } = await operador.rpc('es_operador')
  if (errorOperador || esOperador !== true) return responder(403, { error: 'no_operador' })

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const nombre = typeof cuerpo?.nombre === 'string' ? cuerpo.nombre : ''
  const nombreVisible = typeof cuerpo?.nombreVisible === 'string' ? cuerpo.nombreVisible.trim() : ''
  const emailJefe = typeof cuerpo?.emailJefe === 'string' ? cuerpo.emailJefe.trim() : ''
  const emailCaja = typeof cuerpo?.emailCaja === 'string' ? cuerpo.emailCaja.trim() : ''
  if (!EMAIL.test(emailJefe) || !EMAIL.test(emailCaja)) return responder(400, { error: 'email_invalido' })
  if (emailJefe.toLowerCase() === emailCaja.toLowerCase()) return responder(400, { error: 'emails_iguales' })
  if (nombreVisible.length > 60) return responder(400, { error: 'nombre_visible_invalido' })

  const { data: negocioId, error: errorKiosco } = await operador.rpc('crear_kiosco', { p_nombre: nombre })
  if (errorKiosco) return responder(400, { error: codigo(errorKiosco) })

  const admin = createClient(url, servicio, SIN_SESION)
  const creados: string[] = []
  try {
    const jefe = await crearUsuario(admin, emailJefe)
    creados.push(jefe.id)
    const caja = await crearUsuario(admin, emailCaja)
    creados.push(caja.id)
    await vincular(operador, negocioId, jefe.id, 'jefe')
    await vincular(operador, negocioId, caja.id, 'caja')
    // Último paso: si falla, el catch deshace el alta como antes (el historial del alta aún no existe).
    const { error: errorAlta } = await operador.rpc('cerrar_alta_kiosco', {
      p_negocio: negocioId,
      p_nombre_visible: nombreVisible,
    })
    if (errorAlta) throw errorAlta
    return responder(200, {
      negocioId,
      cuentas: [
        { rol: 'jefe', email: jefe.email, password: jefe.password },
        { rol: 'caja', email: caja.email, password: caja.password },
      ],
    })
  } catch (e) {
    // Deshace lo hecho. Borrar un usuario borra su cuenta (cascada); el kiosco todavía no tiene ventas.
    for (const id of creados) await admin.auth.admin.deleteUser(id)
    await admin.from('negocios').delete().eq('id', negocioId)
    return responder(422, { error: codigo(e) })
  }
})
