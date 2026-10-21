import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, it } from 'vitest'
import { clienteAnonimo, crearKioscoDePrueba, crearUsuarioSinCuenta } from '../soporte/admin'

async function negocioDelToken(cliente: SupabaseClient): Promise<unknown> {
  const { data } = await cliente.auth.getSession()
  if (!data.session) throw new Error('El cliente no tiene sesión')
  const contenido = JSON.parse(
    Buffer.from(data.session.access_token.split('.')[1], 'base64url').toString('utf8'),
  ) as Record<string, unknown>
  return contenido.negocio_id
}

describe('Custom Access Token Hook', () => {
  it('caja y jefe del mismo kiosco reciben su negocio_id en el token', async () => {
    const kiosco = await crearKioscoDePrueba('Kiosco token')
    expect(await negocioDelToken(kiosco.caja.cliente)).toBe(kiosco.negocioId)
    expect(await negocioDelToken(kiosco.jefe.cliente)).toBe(kiosco.negocioId)
  })

  it('cada cuenta lee su propio rol desde cuentas', async () => {
    const kiosco = await crearKioscoDePrueba('Kiosco roles')
    const caja = await kiosco.caja.cliente.from('cuentas').select('rol')
    const jefe = await kiosco.jefe.cliente.from('cuentas').select('rol')
    expect(caja.error).toBeNull()
    expect(caja.data).toEqual([{ rol: 'caja' }])
    expect(jefe.error).toBeNull()
    expect(jefe.data).toEqual([{ rol: 'jefe' }])
  })

  it('un usuario sin cuenta no entra', async () => {
    const usuario = await crearUsuarioSinCuenta()
    const { data, error } = await clienteAnonimo().auth.signInWithPassword({
      email: usuario.email,
      password: usuario.password,
    })
    expect(error?.status).toBe(403)
    expect(error?.message).toBe('Esta cuenta no está vinculada a ningún kiosco.')
    expect(data.session).toBeNull()
  })

  it('una cuenta no ve otro kiosco', async () => {
    const a = await crearKioscoDePrueba('Kiosco A')
    await crearKioscoDePrueba('Kiosco B')
    const { data, error } = await a.jefe.cliente.from('negocios').select('id')
    expect(error).toBeNull()
    expect(data).toEqual([{ id: a.negocioId }])
  })

  it('el registro público está apagado', async () => {
    const { error } = await clienteAnonimo().auth.signUp({
      email: `intruso-${crypto.randomUUID()}@prueba.local`,
      password: `prueba-${crypto.randomUUID()}`,
    })
    expect(error?.code).toBe('signup_disabled')
  })
})
