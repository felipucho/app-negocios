// Alta de un kiosco con su cuenta de jefe y de caja. Sólo puede llamarla una cuenta de operador.
// Los usuarios de Auth los crea el service role de acá; el kiosco y las cuentas van por RPC con el JWT
// del operador, así que la base vuelve a chequear es_operador().
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { CABECERAS, SIN_SESION, claveElegida, claveNueva, claveValida, codigo, responder, texto } from '../_shared/comun.ts'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// Auth responde 422 tanto para mail repetido como para clave débil: el código dice cuál.
function motivoAuth(error: { status?: number; code?: string } | null): string {
  if (error?.code === 'weak_password') return 'clave_debil'
  return error?.status === 422 ? 'email_ocupado' : 'alta_fallida'
}

async function crearUsuario(admin: SupabaseClient, email: string, clave: string) {
  const password = clave || claveNueva()
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  const usuario = data?.user
  if (!usuario) throw new Error(motivoAuth(error))
  // Sólo vuelve la clave que generamos: la que cargó el operador no sale de esta función.
  return { id: usuario.id, email, password: clave ? null : password }
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
  const colorPrimario = texto(cuerpo?.colorPrimario)
  const clienteDesde = texto(cuerpo?.clienteDesde) || null
  const esDemo = cuerpo?.esDemo === true
  const etiquetas: unknown = cuerpo?.etiquetas ?? []
  const contactoNombre = texto(cuerpo?.contactoNombre)
  const contactoTelefono = texto(cuerpo?.contactoTelefono)
  const contactoDireccion = texto(cuerpo?.contactoDireccion)
  const claveJefe = claveElegida(cuerpo?.claveJefe)
  const claveCaja = claveElegida(cuerpo?.claveCaja)
  if (!EMAIL.test(emailJefe) || !EMAIL.test(emailCaja)) return responder(400, { error: 'email_invalido' })
  if (emailJefe.toLowerCase() === emailCaja.toLowerCase()) return responder(400, { error: 'emails_iguales' })
  if (nombreVisible.length > 60) return responder(400, { error: 'nombre_visible_invalido' })
  if (!Array.isArray(etiquetas) || !etiquetas.every((t) => typeof t === 'string')) {
    return responder(400, { error: 'etiquetas_invalidas' })
  }
  if ((claveJefe !== '' && !claveValida(claveJefe)) || (claveCaja !== '' && !claveValida(claveCaja))) {
    return responder(400, { error: 'clave_invalida' })
  }

  const { data: negocioId, error: errorKiosco } = await operador.rpc('crear_kiosco', { p_nombre: nombre })
  if (errorKiosco) return responder(400, { error: codigo(errorKiosco) })

  const admin = createClient(url, servicio, SIN_SESION)
  const creados: string[] = []
  try {
    const jefe = await crearUsuario(admin, emailJefe, claveJefe)
    creados.push(jefe.id)
    const caja = await crearUsuario(admin, emailCaja, claveCaja)
    creados.push(caja.id)
    await vincular(operador, negocioId, jefe.id, 'jefe')
    await vincular(operador, negocioId, caja.id, 'caja')
    // Último paso: si falla, el catch deshace el alta como antes (el historial del alta aún no existe).
    const { error: errorAlta } = await operador.rpc('cerrar_alta_kiosco', {
      p_negocio: negocioId,
      p_nombre_visible: nombreVisible,
      p_color_primario: colorPrimario,
      p_cliente_desde: clienteDesde,
      p_etiquetas: etiquetas,
      p_es_demo: esDemo,
      p_contacto_nombre: contactoNombre,
      p_contacto_telefono: contactoTelefono,
      p_contacto_direccion: contactoDireccion,
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
