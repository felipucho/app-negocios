// Datos de demo para probar la app a mano en el Supabase local: kiosco con jefe y caja, módulos activos,
// productos con costo y proveedor, stock, clientes con fiado, ventas y un turno cerrado.
// Las credenciales van a .env.demo.local (gitignored). Cada corrida crea un kiosco nuevo.
// Uso: node tests/soporte/seed-demo.mts
import { readFileSync, writeFileSync } from 'node:fs'
import { clienteAdmin, crearKioscoDePrueba } from './admin.ts'

const raiz = new URL('../../', import.meta.url)

for (const linea of readFileSync(new URL('.env.integracion.local', raiz), 'utf8').split(/\r?\n/)) {
  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(linea.trim())
  if (m) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '')
}

interface ProductoDemo {
  nombre: string
  precio: number
  costo: number
  rubro: string
  proveedor: string
  codigo?: string
  stock?: number
  minimo?: number
}

const catalogo: ProductoDemo[] = [
  { nombre: 'Alfajor de chocolate', precio: 900, costo: 550, rubro: 'Golosinas', proveedor: 'Distribuidora Norte', codigo: '7790001000011', stock: 30, minimo: 10 },
  { nombre: 'Alfajor de maicena', precio: 800, costo: 480, rubro: 'Golosinas', proveedor: 'Distribuidora Norte', stock: 20, minimo: 5 },
  { nombre: 'Caramelos x100 g', precio: 1200, costo: 700, rubro: 'Golosinas', proveedor: 'Distribuidora Norte' },
  { nombre: 'Chicle menta', precio: 300, costo: 150, rubro: 'Golosinas', proveedor: 'Distribuidora Norte', stock: 40, minimo: 10 },
  { nombre: 'Gaseosa 500 ml', precio: 1500, costo: 1000, rubro: 'Bebidas', proveedor: 'Bebidas del Sur', codigo: '7790001000028', stock: 12, minimo: 4 },
  { nombre: 'Agua mineral 500 ml', precio: 1000, costo: 600, rubro: 'Bebidas', proveedor: 'Bebidas del Sur', codigo: '7790001000035', stock: 6, minimo: 6 },
  { nombre: 'Papas fritas 120 g', precio: 1800, costo: 1200, rubro: 'Snacks', proveedor: 'Snacks SRL', stock: 10, minimo: 4 },
  { nombre: 'Galletitas de agua', precio: 1400, costo: 900, rubro: 'Almacén', proveedor: 'Almacén Central', codigo: '7790001000042', stock: 6, minimo: 8 },
  { nombre: 'Yogur bebible', precio: 1700, costo: 1100, rubro: 'Lácteos', proveedor: 'Lácteos del Valle' },
]

function producto(nombre: string): ProductoDemo {
  const p = catalogo.find((x) => x.nombre === nombre)
  if (!p) throw new Error(`Falta ${nombre} en el catálogo demo`)
  return p
}

function verificar(r: { data: any; error: unknown }): any {
  if (r.error) throw new Error(JSON.stringify(r.error))
  return r.data
}

interface PagoDemo {
  medio: string
  importe: number
  cliente_id?: string
}

const admin = clienteAdmin()
const kiosco = await crearKioscoDePrueba('Kiosco demo (datos de prueba)')
const { jefe, caja } = kiosco
const jefeDB = jefe.cliente
const cajaDB = caja.cliente
const dispositivo = crypto.randomUUID()

verificar(await admin.from('config_negocio').insert({ negocio_id: kiosco.negocioId, nombre_visible: 'Kiosco demo' }))
verificar(await admin.from('ficha_kiosco').insert({ negocio_id: kiosco.negocioId, es_demo: true }))
verificar(await admin.from('modulos_negocio').insert(
  ['fiado', 'precios', 'movimientos_caja', 'stock', 'varios'].map((modulo) => ({ negocio_id: kiosco.negocioId, modulo, activo: true })),
))
verificar(await cajaDB.rpc('registrar_dispositivo', { p_dispositivo_id: dispositivo }))

const filas = verificar(await admin.from('productos').insert(
  catalogo.map((p) => ({ negocio_id: kiosco.negocioId, nombre: p.nombre, precio: p.precio, codigo_barras: p.codigo ?? null })),
).select('id, nombre'))
const idDe = (nombre: string): string => filas.find((f: { nombre: string }) => f.nombre === nombre).id

for (const p of catalogo) {
  verificar(await jefeDB.rpc('editar_gestion_producto', {
    p_producto_id: idDe(p.nombre), p_costo: p.costo, p_rubro: p.rubro, p_proveedor: p.proveedor,
  }))
}

const conStock = catalogo.filter((p) => p.stock !== undefined)
verificar(await cajaDB.rpc('ingresar_stock', {
  p_lote_id: crypto.randomUUID(),
  p_dispositivo_id: dispositivo,
  p_items: conStock.map((p) => ({ producto_id: idDe(p.nombre), cantidad: p.stock })),
}))
for (const p of conStock) {
  verificar(await jefeDB.rpc('ajustar_stock', {
    p_dispositivo_id: dispositivo, p_producto_id: idDe(p.nombre), p_cantidad: null, p_minimo: p.minimo, p_motivo: null,
  }))
}

const marta = verificar(await cajaDB.rpc('alta_cliente', { p_nombre: 'Marta Gómez', p_telefono: '11 5555-0101' }))
const rosa = verificar(await cajaDB.rpc('alta_cliente', { p_nombre: 'Rosa Fernández', p_telefono: '11 5555-0102' }))
verificar(await cajaDB.rpc('alta_cliente', { p_nombre: 'Juan Pérez' }))
verificar(await jefeDB.rpc('fijar_limite_fiado', { p_cliente_id: marta.id, p_limite: 5000 }))

verificar(await cajaDB.rpc('abrir_turno', { p_dispositivo_id: dispositivo }))
verificar(await cajaDB.rpc('fijar_monto_inicial', { p_dispositivo_id: dispositivo, p_monto: 5000 }))

async function vender(lineas: [string, number][], pagos: PagoDemo[]): Promise<string> {
  const total = lineas.reduce((s, [nombre, cantidad]) => s + producto(nombre).precio * cantidad, 0)
  if (pagos.reduce((s, p) => s + p.importe, 0) !== total) throw new Error('Los pagos no suman el total')
  const ventaId = crypto.randomUUID()
  verificar(await cajaDB.rpc('confirmar_venta', {
    p_venta_id: ventaId,
    p_dispositivo_id: dispositivo,
    p_lineas: lineas.map(([nombre, cantidad]) => ({ producto_id: idDe(nombre), cantidad, precio_visto: producto(nombre).precio })),
    p_pagos: pagos.map((p) => ({ medio: p.medio, importe: p.importe, cliente_id: p.cliente_id ?? null })),
    p_total: total,
    p_efectivo_entregado: null,
  }))
  return ventaId
}

await vender([['Alfajor de chocolate', 2], ['Gaseosa 500 ml', 1]], [{ medio: 'efectivo', importe: 3300 }])
await vender([['Agua mineral 500 ml', 2]], [{ medio: 'transferencia', importe: 2000 }])
await vender([['Papas fritas 120 g', 1], ['Chicle menta', 2]], [{ medio: 'efectivo', importe: 1000 }, { medio: 'tarjeta', importe: 1400 }])
await vender([['Papas fritas 120 g', 1], ['Alfajor de chocolate', 1]], [{ medio: 'fiado', importe: 2700, cliente_id: marta.id }])
await vender([['Galletitas de agua', 2]], [{ medio: 'efectivo', importe: 800 }, { medio: 'fiado', importe: 2000, cliente_id: rosa.id }])
await vender([['Yogur bebible', 1]], [{ medio: 'efectivo', importe: 1700 }])
const anulada = await vender([['Alfajor de maicena', 3]], [{ medio: 'efectivo', importe: 2400 }])
verificar(await cajaDB.rpc('anular_venta', {
  p_venta_id: anulada, p_dispositivo_id: dispositivo, p_motivo: 'Cobro cargado dos veces (dato de prueba)',
}))

verificar(await cajaDB.rpc('cobrar_fiado', {
  p_pago_id: crypto.randomUUID(), p_dispositivo_id: dispositivo, p_cliente_id: marta.id, p_medio: 'efectivo', p_importe: 1000,
}))

const movimientos: [string, number, string][] = [
  ['ingreso', 1000, 'Cambio de billetes'],
  ['retiro', 2000, 'Retiro para el banco'],
  ['gasto', 800, 'Bolsas y servilletas'],
  ['pago_proveedor', 1500, 'Pago a Bebidas del Sur'],
]
for (const [tipo, importe, detalle] of movimientos) {
  verificar(await cajaDB.rpc('registrar_movimiento_caja', {
    p_movimiento_id: crypto.randomUUID(), p_dispositivo_id: dispositivo, p_tipo: tipo, p_importe: importe, p_detalle: detalle,
  }))
}

// El arqueo esperado da 9.500. Se cuentan 9.200: faltan 300 a propósito, para ver una diferencia.
const cierre = verificar(await cajaDB.rpc('cerrar_turno', { p_dispositivo_id: dispositivo, p_efectivo_contado: 9200 }))

writeFileSync(new URL('.env.demo.local', raiz), [
  '# Datos de demo (tests/soporte/seed-demo.mts). Local, no se commitea.',
  `DEMO_JEFE_EMAIL=${jefe.email}`,
  `DEMO_JEFE_PASSWORD=${jefe.password}`,
  `DEMO_CAJA_EMAIL=${caja.email}`,
  `DEMO_CAJA_PASSWORD=${caja.password}`,
].join('\n') + '\n')

console.log(`Kiosco demo listo (negocio ${kiosco.negocioId}). Diferencia de caja: ${cierre.arqueo.diferencia}`)
