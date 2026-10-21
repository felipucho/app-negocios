import type { FullConfig } from '@playwright/test'
import { loadEnv } from 'vite'
import { clienteAdmin, crearKioscoDePrueba } from '../soporte/admin'

/** Productos del kiosco de prueba. Dos con código (escáner) y dos sin código (grilla F2). */
export const PRODUCTOS_E2E = {
  alfajor: { nombre: 'Alfajor E2E', precio: 900, codigo: 'E2E-ALF-0001' },
  agua: { nombre: 'Agua E2E', precio: 1200, codigo: 'E2E-AGU-0002' },
  chipa: { nombre: 'Chipá E2E', precio: 500, codigo: null },
  turron: { nombre: 'Turrón E2E', precio: 300, codigo: null },
} as const

export const CLIENTE_E2E = 'Cliente E2E'
export const NOMBRE_VISIBLE_E2E = 'Kiosco E2E'

function exigir<T>(valor: T | null | undefined, error: unknown, que: string): T {
  if (error || valor === null || valor === undefined) {
    throw new Error(`preparar.ts: no se pudo crear ${que}: ${JSON.stringify(error)}`)
  }
  return valor
}

/** Sólo Supabase local: por el host ya parseado, así `http://127.0.0.1:1@otro.host` no pasa. */
function esLocal(url: string | undefined): boolean {
  try {
    const u = new URL(url ?? '')
    return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
  } catch {
    return false
  }
}

/**
 * Kiosco nuevo en Supabase LOCAL con caja y jefe, config, productos con y sin código, un cliente de fiado
 * y una venta de ayer (para la anulación del jefe). Usa la service role local de tests/soporte/admin.ts.
 * Las credenciales (emails y contraseñas al azar) viven sólo en process.env durante la corrida: nunca en el repo.
 */
export default async function preparar(_config: FullConfig): Promise<void> {
  if (!esLocal(process.env.SUPABASE_URL)) {
    throw new Error('El E2E corre sólo contra Supabase local (SUPABASE_URL de .env.integracion.local).')
  }
  // El build que prueba el navegador (modo e2e) también tiene que apuntar al Supabase local.
  if (!esLocal(loadEnv('e2e', process.cwd(), 'VITE_').VITE_SUPABASE_URL)) {
    throw new Error('El E2E corre sólo contra Supabase local (VITE_SUPABASE_URL del modo e2e, .env.local).')
  }
  const kiosco = await crearKioscoDePrueba(`Kiosco E2E ${new Date().toISOString()}`)
  const admin = clienteAdmin()
  const negocioId = kiosco.negocioId
  const cajaId = kiosco.caja.usuarioId

  const config = await admin
    .from('config_negocio')
    .insert({ negocio_id: negocioId, nombre_visible: NOMBRE_VISIBLE_E2E, color_primario: '#2e7d32' })
  exigir(config.error ? null : true, config.error, 'la config del negocio')

  const productos = await admin
    .from('productos')
    .insert(
      Object.values(PRODUCTOS_E2E).map((p) => ({
        negocio_id: negocioId,
        nombre: p.nombre,
        precio: p.precio,
        codigo_barras: p.codigo,
      })),
    )
    .select('id, nombre')
  const filas = exigir(productos.data, productos.error, 'los productos')
  const alfajorId = exigir(
    filas.find((p) => p.nombre === PRODUCTOS_E2E.alfajor.nombre)?.id as string | undefined,
    null,
    'el alfajor',
  )

  const cliente = await admin.from('clientes').insert({ negocio_id: negocioId, nombre: CLIENTE_E2E }).select('id').single()
  const clienteId = exigir(cliente.data?.id as string | undefined, cliente.error, 'el cliente de fiado')

  // Venta de ayer, insertada directo con la service role: confirmar_venta siempre fecha con now().
  // El trigger de la tarea 3 sólo impide update y delete; insertar se puede (V44).
  const ayer = Date.now() - 24 * 60 * 60 * 1000
  const dispositivoAyer = crypto.randomUUID()
  const turnoAyer = crypto.randomUUID()
  const ventaAyer = crypto.randomUUID()

  const pc = await admin.from('dispositivos').insert({
    id: dispositivoAyer,
    negocio_id: negocioId,
    prefijo: 'A',
    ultimo_numero: 1,
    creado_por: cajaId,
  })
  exigir(pc.error ? null : true, pc.error, 'la PC de ayer')

  const turno = await admin.from('turnos').insert({
    id: turnoAyer,
    negocio_id: negocioId,
    dispositivo_id: dispositivoAyer,
    cuenta_id: cajaId,
    apertura: new Date(ayer - 60 * 60 * 1000).toISOString(),
    cierre: new Date(ayer + 60 * 60 * 1000).toISOString(),
    cierre_cuenta_id: cajaId,
  })
  exigir(turno.error ? null : true, turno.error, 'el turno de ayer')

  const venta = await admin.from('ventas').insert({
    id: ventaAyer,
    negocio_id: negocioId,
    dispositivo_id: dispositivoAyer,
    cuenta_id: cajaId,
    turno_id: turnoAyer,
    numero: 1,
    fecha: new Date(ayer).toISOString(),
    total: PRODUCTOS_E2E.alfajor.precio,
    hash_contenido: 'e'.repeat(64),
  })
  exigir(venta.error ? null : true, venta.error, 'la venta de ayer')

  const linea = await admin.from('lineas_venta').insert({
    negocio_id: negocioId,
    venta_id: ventaAyer,
    producto_id: alfajorId,
    cantidad: 1,
    precio_unitario: PRODUCTOS_E2E.alfajor.precio,
  })
  exigir(linea.error ? null : true, linea.error, 'la línea de la venta de ayer')

  const pago = await admin.from('pagos_venta').insert({
    negocio_id: negocioId,
    venta_id: ventaAyer,
    medio: 'efectivo',
    importe: PRODUCTOS_E2E.alfajor.precio,
  })
  exigir(pago.error ? null : true, pago.error, 'el pago de la venta de ayer')

  // "environment variables which are set in globalSetup are only available inside test()" (doc de Playwright).
  Object.assign(process.env, {
    E2E_NEGOCIO_ID: negocioId,
    E2E_CAJA_EMAIL: kiosco.caja.email,
    E2E_CAJA_PASSWORD: kiosco.caja.password,
    E2E_JEFE_EMAIL: kiosco.jefe.email,
    E2E_JEFE_PASSWORD: kiosco.jefe.password,
    E2E_CLIENTE_ID: clienteId,
    E2E_ALFAJOR_ID: alfajorId,
    E2E_VENTA_AYER_ID: ventaAyer,
    E2E_DISPOSITIVO_AYER_ID: dispositivoAyer,
  })
}
