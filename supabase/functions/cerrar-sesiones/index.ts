// Cierra las sesiones de la cuenta de jefe o caja de un kiosco. Sólo puede llamarla una cuenta de operador.
// La base valida el pedido y lo anota antes de cerrar: si algo no cumple, las sesiones siguen abiertas.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { CABECERAS, SIN_SESION, codigo, responder, texto } from '../_shared/comun.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CABECERAS })
  if (req.method !== 'POST') return responder(405, { error: 'metodo_no_permitido' })

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const anon = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
  const token = (req.headers.get('authorization') ?? '').replace(/^Bearer /, '')

  // Con el JWT del que llama: la base decide si es operador, registra el pedido y cierra las sesiones.
  const operador = createClient(url, anon, { ...SIN_SESION, global: { headers: { Authorization: `Bearer ${token}` } } })
  const { data: esOperador, error: errorOperador } = await operador.rpc('es_operador')
  if (errorOperador || esOperador !== true) return responder(403, { error: 'no_operador' })

  const cuerpo = (await req.json().catch(() => null)) as Record<string, unknown> | null
  const negocioId = texto(cuerpo?.negocioId)
  const rol = texto(cuerpo?.rol)
  const motivo = texto(cuerpo?.motivo)

  // Primero la base: valida el rol y el motivo y lo anota. Recién después cierra.
  const { error: errorRegistro } = await operador.rpc('registrar_cerrar_sesiones', {
    p_negocio: negocioId,
    p_rol: rol,
    p_motivo: motivo,
  })
  if (errorRegistro) return responder(400, { error: codigo(errorRegistro, 'cerrar_sesiones_fallido') })

  const { error: errorSesiones } = await operador.rpc('cerrar_sesiones_cuenta', { p_negocio: negocioId, p_rol: rol })
  return responder(200, { rol, sesionesCerradas: !errorSesiones })
})
