// Restablece la clave de la cuenta de jefe o caja de un kiosco. Sólo puede llamarla una cuenta de operador.
// La base valida el pedido y lo anota antes de tocar Auth: si algo no cumple, la clave no cambia.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CABECERAS, SIN_SESION, claveElegida, claveNueva, claveValida, codigo, responder, texto } from '../_shared/comun.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CABECERAS })
  if (req.method !== 'POST') return responder(405, { error: 'metodo_no_permitido' })

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const servicio = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')

  // Con el JWT del que llama: la base decide si es operador y registra el pedido.
  const operador = createClient(url, anon, { ...SIN_SESION, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: esOperador, error: errorOperador } = await operador.rpc('es_operador')
  if (errorOperador || esOperador !== true) return responder(403, { error: 'no_operador' })

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const negocioId = texto(cuerpo?.negocioId)
  const rol = texto(cuerpo?.rol)
  const motivo = texto(cuerpo?.motivo)
  const clave = claveElegida(cuerpo?.clave)
  if (clave !== '' && !claveValida(clave)) return responder(400, { error: 'clave_invalida' })

  // Primero la base: valida el pedido, lo anota y devuelve la cuenta. Recién después cambia Auth.
  const { data: usuarioId, error: errorRegistro } = await operador.rpc('registrar_restablecer_clave', {
    p_negocio: negocioId,
    p_rol: rol,
    p_motivo: motivo,
  })
  if (errorRegistro) return responder(400, { error: codigo(errorRegistro, 'restablecer_fallido') })

  const admin = createClient(url, servicio, SIN_SESION)
  const password = clave || claveNueva()
  const { data, error } = await admin.auth.admin.updateUserById(usuarioId, { password })
  if (error || !data.user) {
    return responder(422, { error: error?.code === 'weak_password' ? 'clave_debil' : 'restablecer_fallido' })
  }

  // La clave ya cambió: si no se pueden cerrar las sesiones, igual se devuelve para que el operador no la pierda.
  const { error: errorSesiones } = await operador.rpc('cerrar_sesiones_cuenta', { p_negocio: negocioId, p_rol: rol })

  // Sólo vuelve la clave generada: la que cargó el operador no sale de esta función.
  return responder(200, {
    rol,
    email: data.user.email,
    password: clave ? null : password,
    sesionesCerradas: !errorSesiones,
  })
})
