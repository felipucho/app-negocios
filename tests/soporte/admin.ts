import { createClient, type SupabaseClient } from '@supabase/supabase-js'

type RolDePrueba = 'caja' | 'jefe'

function variable(nombre: string): string {
  const valor = process.env[nombre]
  if (!valor) throw new Error(`Falta ${nombre}: generar .env.integracion.local (tarea 4, step 6)`)
  return valor
}

const sinSesionPersistente = { auth: { persistSession: false, autoRefreshToken: false } }

export function clienteAdmin(): SupabaseClient {
  return createClient(variable('SUPABASE_URL'), variable('SUPABASE_SERVICE_ROLE_KEY'), sinSesionPersistente)
}

export function clienteAnonimo(): SupabaseClient {
  return createClient(variable('SUPABASE_URL'), variable('SUPABASE_ANON_KEY'), sinSesionPersistente)
}

export async function iniciarSesion(email: string, password: string): Promise<SupabaseClient> {
  const cliente = clienteAnonimo()
  const { error } = await cliente.auth.signInWithPassword({ email, password })
  if (error) throw error
  return cliente
}

export interface UsuarioDePrueba {
  usuarioId: string
  email: string
  password: string
}

export interface CuentaDePrueba extends UsuarioDePrueba {
  cliente: SupabaseClient
}

export interface KioscoDePrueba {
  negocioId: string
  caja: CuentaDePrueba
  jefe: CuentaDePrueba
}

/** Usuario de Auth sin fila en cuentas (no debería poder entrar). */
export async function crearUsuarioSinCuenta(): Promise<UsuarioDePrueba> {
  const email = `prueba-${crypto.randomUUID()}@prueba.local`
  const password = `prueba-${crypto.randomUUID()}`
  const { data, error } = await clienteAdmin().auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  return { usuarioId: data.user.id, email, password }
}

async function crearCuenta(negocioId: string, rol: RolDePrueba): Promise<CuentaDePrueba> {
  const usuario = await crearUsuarioSinCuenta()
  const { error } = await clienteAdmin()
    .from('cuentas')
    .insert({ usuario_id: usuario.usuarioId, negocio_id: negocioId, rol })
  if (error) throw error
  const cliente = await iniciarSesion(usuario.email, usuario.password)
  return { ...usuario, cliente }
}

/** Kiosco nuevo con sus dos cuentas (caja y jefe), cada una ya logueada. */
export async function crearKioscoDePrueba(nombre: string): Promise<KioscoDePrueba> {
  const negocio = await clienteAdmin().from('negocios').insert({ nombre }).select('id').single()
  if (negocio.error) throw negocio.error
  const negocioId = negocio.data.id as string
  const caja = await crearCuenta(negocioId, 'caja')
  const jefe = await crearCuenta(negocioId, 'jefe')
  return { negocioId, caja, jefe }
}
