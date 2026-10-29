import type { SupabaseClient } from '@supabase/supabase-js'
import { codigoDeError } from '../lib/errores'

/** Fila de proveedores. */
export interface Proveedor {
  id: string
  nombre: string
  contacto: string | null
  notas: string | null
}

export type EstadoVisita = 'prevista' | 'llego' | 'no_vino'

/** Fila de visitas_proveedor. fecha es el día de la base, 'AAAA-MM-DD', sin hora. */
export interface Visita {
  id: string
  proveedor_id: string
  fecha: string
  estado: EstadoVisita
  nota: string | null
}

/** Renglón de "qué pedirle". hecho: ya se pidió o ya llegó. */
export interface PedidoProveedor {
  id: string
  proveedor_id: string
  descripcion: string
  cantidad: string | null
  hecho: boolean
}

/** Movimiento de caja pago_proveedor con el proveedor asignado. */
export interface RetiroProveedor {
  id: string
  fecha: string
  importe: number
  detalle: string | null
}

export interface DatosProveedor {
  nombre: string
  contacto: string | null
  notas: string | null
}

export interface ServicioProveedores {
  leerProveedores(): Promise<Proveedor[]>
  leerVisitas(): Promise<Visita[]>
  leerPedidos(): Promise<PedidoProveedor[]>
  /** RLS: la caja ve sólo los retiros de hoy; el jefe, todos. */
  leerRetiros(proveedorId: string): Promise<RetiroProveedor[]>
  /** El id lo genera quien llama: guardar otra vez con el mismo id actualiza la ficha. */
  guardarProveedor(id: string, datos: DatosProveedor): Promise<Proveedor>
  registrarVisita(id: string, proveedorId: string, fecha: string, nota: string | null): Promise<void>
  marcarVisita(visitaId: string, estado: EstadoVisita): Promise<void>
  /** Sólo una visita prevista se quita. */
  quitarVisita(visitaId: string): Promise<void>
  agregarPedido(id: string, proveedorId: string, descripcion: string, cantidad: string | null): Promise<void>
  marcarPedido(pedidoId: string, hecho: boolean): Promise<void>
  quitarPedido(pedidoId: string): Promise<void>
  /** Suma los productos en mínimo o sin stock que Precios tiene con este proveedor. cantidad: renglones nuevos. */
  agregarFaltantes(proveedorId: string): Promise<{ cantidad: number }>
  /** Retiro de caja para el proveedor. Pide turno abierto en esta PC y el módulo movimientos_caja. */
  registrarRetiro(movimientoId: string, proveedorId: string, importe: number, detalle: string | null): Promise<void>
}

export const MENSAJES_PROVEEDORES: Record<string, string> = {
  modulo_deshabilitado: 'Este kiosco no tiene activado el módulo de proveedores.',
  stock_deshabilitado: 'Este kiosco no tiene activado el módulo de stock.',
  sin_cuenta: 'Esta cuenta no pertenece al kiosco. Volvé a iniciar sesión.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Cerrá sesión y volvé a entrar.',
  texto_invalido:
    'Revisá los textos: el nombre tiene hasta 60 letras, el contacto 80, las notas 200, la nota de la visita 120, el pedido 80 y la cantidad 30.',
  nombre_repetido: 'Ya hay un proveedor con ese nombre.',
  proveedor_desconocido: 'Ese proveedor no existe en este kiosco.',
  pedido_invalido: 'Faltan datos para guardar.',
  visita_desconocida: 'Esa visita ya no existe.',
  visita_ya_marcada: 'La visita ya está marcada. Sólo se quita una que todavía está prevista.',
  visita_id_reusado: 'La visita no se pudo guardar. Probá de nuevo.',
  estado_invalido: 'El estado de la visita no es válido.',
  pedido_desconocido: 'Ese renglón del pedido ya no existe.',
  pedido_id_reusado: 'El renglón no se pudo guardar. Probá de nuevo.',
}

/** Retiros: los códigos de registrar_movimiento_caja que pueden llegar desde esta pantalla. */
export const MENSAJES_RETIRO: Record<string, string> = {
  sin_turno: 'Abrí el turno en esta PC para registrar el retiro.',
  importe_invalido: 'El importe tiene que ser mayor que cero.',
  texto_invalido: 'El detalle tiene hasta 120 letras.',
  movimiento_id_reusado: 'Este retiro ya se registró con otros datos. Empezá uno nuevo.',
  proveedor_desconocido: 'Ese proveedor no existe en este kiosco.',
  modulo_deshabilitado: 'Este kiosco no tiene activados los movimientos de caja.',
}

const GENERICO = 'No se pudo guardar. Revisá la conexión y probá de nuevo.'

export function mensajeProveedores(e: unknown): string {
  return MENSAJES_PROVEEDORES[codigoDeError(e)] ?? GENERICO
}

export function mensajeRetiro(e: unknown): string {
  return MENSAJES_RETIRO[codigoDeError(e)] ?? mensajeProveedores(e)
}

/** Quitar o marcar un renglón que ya no está no es un error: otra PC o un doble clic ya lo resolvió. */
export function yaNoExiste(e: unknown): boolean {
  return ['visita_desconocida', 'pedido_desconocido'].includes(codigoDeError(e))
}

/** 'AAAA-MM-DD' a 'DD/MM/AAAA'. Sin Date: new Date('AAAA-MM-DD') cae en el día anterior en Argentina. */
export function fechaCorta(fecha: string): string {
  const [anio, mes, dia] = fecha.split('-')
  return `${dia}/${mes}/${anio}`
}

/** Hoy en la hora del kiosco, 'AAAA-MM-DD', sea cual sea la zona de la PC. */
export function hoyEnElKiosco(ahora: Date = new Date()): string {
  return ahora.toLocaleDateString('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' })
}

/** Un intento de formulario: mismo contenido, mismo id. Un reintento no crea otra fila. */
export interface Intento {
  clave: string
  id: string
}

export function intentoDe(previo: Intento | null, clave: string): Intento {
  return previo?.clave === clave ? previo : { clave, id: crypto.randomUUID() }
}

export function crearServicioProveedores(supabase: SupabaseClient, dispositivoId: string): ServicioProveedores {
  return {
    async leerProveedores() {
      const { data, error } = await supabase.from('proveedores').select('id, nombre, contacto, notas')
      if (error) throw error
      return (data ?? []) as Proveedor[]
    },
    async leerVisitas() {
      const { data, error } = await supabase.from('visitas_proveedor').select('id, proveedor_id, fecha, estado, nota')
      if (error) throw error
      return (data ?? []) as Visita[]
    },
    async leerPedidos() {
      const { data, error } = await supabase
        .from('pedidos_proveedor')
        .select('id, proveedor_id, descripcion, cantidad, hecho')
        .order('creado')
      if (error) throw error
      return (data ?? []) as PedidoProveedor[]
    },
    async leerRetiros(proveedorId) {
      const { data, error } = await supabase
        .from('movimientos_caja')
        .select('id, fecha, importe, detalle')
        .eq('proveedor_id', proveedorId)
        .order('fecha', { ascending: false })
      if (error) throw error
      return (data ?? []) as RetiroProveedor[]
    },
    async guardarProveedor(id, d) {
      const { data, error } = await supabase.rpc('guardar_proveedor', {
        p_id: id,
        p_nombre: d.nombre,
        p_contacto: d.contacto,
        p_notas: d.notas,
      })
      if (error) throw error
      return data as Proveedor
    },
    async registrarVisita(id, proveedorId, fecha, nota) {
      const { error } = await supabase.rpc('registrar_visita_proveedor', {
        p_id: id,
        p_proveedor_id: proveedorId,
        p_fecha: fecha,
        p_nota: nota,
      })
      if (error) throw error
    },
    async marcarVisita(visitaId, estado) {
      const { error } = await supabase.rpc('marcar_visita_proveedor', { p_visita_id: visitaId, p_estado: estado })
      if (error) throw error
    },
    async quitarVisita(visitaId) {
      const { error } = await supabase.rpc('quitar_visita_proveedor', { p_visita_id: visitaId })
      if (error) throw error
    },
    async agregarPedido(id, proveedorId, descripcion, cantidad) {
      const { error } = await supabase.rpc('agregar_pedido_proveedor', {
        p_id: id,
        p_proveedor_id: proveedorId,
        p_descripcion: descripcion,
        p_cantidad: cantidad,
      })
      if (error) throw error
    },
    async marcarPedido(pedidoId, hecho) {
      const { error } = await supabase.rpc('marcar_pedido_proveedor', { p_pedido_id: pedidoId, p_hecho: hecho })
      if (error) throw error
    },
    async quitarPedido(pedidoId) {
      const { error } = await supabase.rpc('quitar_pedido_proveedor', { p_pedido_id: pedidoId })
      if (error) throw error
    },
    async agregarFaltantes(proveedorId) {
      const { data, error } = await supabase.rpc('agregar_faltantes_al_pedido', { p_proveedor_id: proveedorId })
      if (error) throw error
      return data as { cantidad: number }
    },
    async registrarRetiro(movimientoId, proveedorId, importe, detalle) {
      const { error } = await supabase.rpc('registrar_movimiento_caja', {
        p_movimiento_id: movimientoId,
        p_dispositivo_id: dispositivoId,
        p_tipo: 'pago_proveedor',
        p_importe: importe,
        p_detalle: detalle,
        p_proveedor_id: proveedorId,
      })
      if (error) throw error
    },
  }
}
