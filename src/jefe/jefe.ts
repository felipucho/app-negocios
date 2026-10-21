import type { SupabaseClient } from '@supabase/supabase-js'
import type { Cliente } from '../tipos'

export type TipoHistorial =
  | 'alta_producto'
  | 'cambio_precio'
  | 'cambio_producto'
  | 'anulacion'
  | 'apertura_turno'
  | 'cierre_turno'

export type EntidadHistorial = 'productos' | 'ventas' | 'turnos'

/** Quién hizo el cambio: el kiosco tiene una cuenta por rol; vacío = Supabase Studio. */
export type QuienHistorial = 'caja' | 'jefe' | 'fuera_de_la_app'

/** Fila de public.historial como la devuelve la API. */
export interface FilaHistorialCruda {
  id: string
  tipo: TipoHistorial
  fecha: string
  cuenta_id: string | null
  dispositivo_id: string | null
  entidad: EntidadHistorial
  entidad_id: string
  valor_anterior: Record<string, unknown> | null
  valor_nuevo: Record<string, unknown> | null
  motivo: string | null
}

export interface FilaHistorial {
  id: string
  tipo: TipoHistorial
  fecha: string
  quien: QuienHistorial
  /** Prefijo de la PC, o null si el cambio fue fuera de la app. */
  prefijo: string | null
  entidad: EntidadHistorial
  entidadId: string
  /** Nombre actual del producto (sólo en filas de productos). */
  nombreProducto: string | null
  valorAnterior: Record<string, unknown> | null
  valorNuevo: Record<string, unknown> | null
  motivo: string | null
}

export const PAGINA_HISTORIAL = 100

export interface ServicioJefe {
  /** cambiar_modulo_fiado (tarea 16). Devuelve el estado que quedó. */
  cambiarModuloFiado(activo: boolean): Promise<boolean>
  /** anonimizar_cliente (tarea 16). Irreversible. */
  anonimizarCliente(clienteId: string): Promise<Cliente>
  /** De a PAGINA_HISTORIAL filas, más nuevas primero. */
  leerHistorial(desde: number): Promise<FilaHistorial[]>
}

export const MENSAJES_JEFE: Record<string, string> = {
  solo_jefe: 'Sólo el jefe puede hacer esto.',
  sin_cuenta: 'Esta cuenta no está vinculada a este kiosco.',
  cliente_desconocido: 'Ese cliente no existe en este kiosco.',
  pedido_invalido: 'El pedido no es válido.',
}

export function mensajeJefe(e: unknown): string {
  const codigo = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : ''
  return MENSAJES_JEFE[codigo] ?? 'No se pudo guardar. Revisá la conexión y probá de nuevo.'
}

export function aFilaHistorial(
  f: FilaHistorialCruda,
  propioId: string,
  prefijos: ReadonlyMap<string, string>,
  nombres: ReadonlyMap<string, string>,
): FilaHistorial {
  return {
    id: f.id,
    tipo: f.tipo,
    fecha: f.fecha,
    quien: f.cuenta_id === null ? 'fuera_de_la_app' : f.cuenta_id === propioId ? 'jefe' : 'caja',
    prefijo: f.dispositivo_id === null ? null : (prefijos.get(f.dispositivo_id) ?? null),
    entidad: f.entidad,
    entidadId: f.entidad_id,
    nombreProducto: f.entidad === 'productos' ? (nombres.get(f.entidad_id) ?? null) : null,
    valorAnterior: f.valor_anterior,
    valorNuevo: f.valor_nuevo,
    motivo: f.motivo,
  }
}

export function crearServicioJefe(supabase: SupabaseClient): ServicioJefe {
  return {
    async cambiarModuloFiado(activo) {
      const { data, error } = await supabase.rpc('cambiar_modulo_fiado', { p_activo: activo })
      if (error) throw error
      return (data as { activo: boolean }).activo
    },
    async anonimizarCliente(clienteId) {
      const { data, error } = await supabase.rpc('anonimizar_cliente', { p_cliente_id: clienteId })
      if (error) throw error
      return data as Cliente
    },
    async leerHistorial(desde) {
      // RLS: el historial lo ve sólo el jefe; de cuentas, sólo la propia fila.
      const [propia, pcs, pagina] = await Promise.all([
        supabase.from('cuentas').select('usuario_id').single(),
        supabase.from('dispositivos').select('id, prefijo'),
        supabase
          .from('historial')
          .select('id, tipo, fecha, cuenta_id, dispositivo_id, entidad, entidad_id, valor_anterior, valor_nuevo, motivo')
          .order('fecha', { ascending: false })
          .order('id', { ascending: false })
          .range(desde, desde + PAGINA_HISTORIAL - 1),
      ])
      if (propia.error) throw propia.error
      if (pcs.error) throw pcs.error
      if (pagina.error) throw pagina.error
      const filas = pagina.data as FilaHistorialCruda[]
      const ids = [...new Set(filas.filter((f) => f.entidad === 'productos').map((f) => f.entidad_id))]
      const nombres = new Map<string, string>()
      if (ids.length > 0) {
        const productos = await supabase.from('productos').select('id, nombre').in('id', ids)
        if (productos.error) throw productos.error
        for (const p of productos.data as { id: string; nombre: string }[]) nombres.set(p.id, p.nombre)
      }
      const prefijos = new Map((pcs.data as { id: string; prefijo: string }[]).map((d) => [d.id, d.prefijo]))
      const propioId = (propia.data as { usuario_id: string }).usuario_id
      return filas.map((f) => aFilaHistorial(f, propioId, prefijos, nombres))
    },
  }
}
