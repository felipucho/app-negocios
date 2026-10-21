import type { LineaCarrito } from '../tipos'
import type { ErrorCobro, PagoAEnviar } from './cobro'

/** Códigos que devuelve confirmar_venta: los de cobro (tarea 5) más los propios de la base. */
export type ErrorConfirmar =
  | ErrorCobro
  | 'sin_cuenta'
  | 'dispositivo_desconocido'
  | 'pedido_invalido'
  | 'venta_id_reusado'
  | 'sin_turno'
  | 'producto_no_disponible'
  | 'linea_invalida'
  | 'pago_invalido'
  | 'total_distinto'

// satisfies Record<...>: un código nuevo en el tipo que falte acá no compila.
const CODIGOS = {
  importe_invalido: true, venta_vacia: true, no_suma_total: true, efectivo_insuficiente: true, entrega_sin_efectivo: true,
  fiado_deshabilitado: true, fiado_sin_cliente: true, sin_cuenta: true, dispositivo_desconocido: true, pedido_invalido: true,
  venta_id_reusado: true, sin_turno: true, producto_no_disponible: true, linea_invalida: true, pago_invalido: true,
  total_distinto: true,
} satisfies Record<ErrorConfirmar, true>

function esCodigo(m: string): m is ErrorConfirmar {
  return Object.hasOwn(CODIGOS, m)
}

export interface PedidoVenta {
  dispositivoId: string
  lineas: LineaCarrito[]
  pagos: PagoAEnviar[]
  total: number
  efectivoEntregado: number | null
}

export interface VentaConfirmada {
  ventaId: string
  prefijo: string
  numero: number
  total: number
  fecha: string
  vuelto: number
  yaExistia: boolean
}

export interface DiferenciaPrecio {
  productoId: string
  nombre: string
  precioVisto: number
  precioActual: number
}

export type ResultadoConfirmar =
  | { tipo: 'confirmada'; venta: VentaConfirmada }
  | { tipo: 'precios_distintos'; diferencias: DiferenciaPrecio[] }
  | { tipo: 'rechazada'; codigo: ErrorConfirmar; detalle: string | null }
  | { tipo: 'error_red' }
  | { tipo: 'desconocido'; mensaje: string }

export interface RespuestaRpc {
  data: unknown
  error: { message: string; code?: string; details?: string | null } | null
}

/** Se arma con el cliente real: (funcion, args) => supabase.rpc(funcion, args). */
export type LlamarRpc = (funcion: 'confirmar_venta', args: Record<string, unknown>) => PromiseLike<RespuestaRpc>

type Respuesta =
  | { estado: 'confirmada'; venta_id: string; prefijo: string; numero: number; total: number; fecha: string; vuelto: number; ya_existia: boolean }
  | { estado: 'precios_distintos'; diferencias: { producto_id: string; nombre: string; precio_visto: number; precio_actual: number }[] }

export function argumentosConfirmar(ventaId: string, p: PedidoVenta): Record<string, unknown> {
  return {
    p_venta_id: ventaId,
    p_dispositivo_id: p.dispositivoId,
    p_lineas: p.lineas.map((l) => ({ producto_id: l.productoId, cantidad: l.cantidad, precio_visto: l.precio })),
    p_pagos: p.pagos,
    p_total: p.total,
    p_efectivo_entregado: p.efectivoEntregado,
  }
}

/** Mismo texto ⇔ mismo contenido que la base convierte en hash_contenido. Lo usa idVenta. */
export function claveContenido(p: PedidoVenta): string {
  return JSON.stringify(argumentosConfirmar('', p))
}

export async function confirmarVenta(rpc: LlamarRpc, ventaId: string, pedido: PedidoVenta): Promise<ResultadoConfirmar> {
  let r: RespuestaRpc
  try {
    r = await rpc('confirmar_venta', argumentosConfirmar(ventaId, pedido))
  } catch {
    return { tipo: 'error_red' }
  }
  const error = r.error
  if (error) {
    if (!error.code) return { tipo: 'error_red' } // V5: el fetch falló, la venta pudo o no grabarse
    const codigo = error.message
    return esCodigo(codigo)
      ? { tipo: 'rechazada', codigo, detalle: error.details ?? null }
      : { tipo: 'desconocido', mensaje: error.message }
  }
  const d = r.data as Respuesta
  if (d.estado === 'precios_distintos') {
    return {
      tipo: 'precios_distintos',
      diferencias: d.diferencias.map((x) => ({
        productoId: x.producto_id,
        nombre: x.nombre,
        precioVisto: x.precio_visto,
        precioActual: x.precio_actual,
      })),
    }
  }
  return {
    tipo: 'confirmada',
    venta: {
      ventaId: d.venta_id,
      prefijo: d.prefijo,
      numero: d.numero,
      total: d.total,
      fecha: d.fecha,
      vuelto: d.vuelto,
      yaExistia: d.ya_existia,
    },
  }
}

/** Número del comprobante en pantalla: prefijo de la PC y seis dígitos (A-000123). */
export function formatearNumeroVenta(prefijo: string, numero: number): string {
  return `${prefijo}-${String(numero).padStart(6, '0')}`
}
