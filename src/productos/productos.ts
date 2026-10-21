import type { SupabaseClient } from '@supabase/supabase-js'
import { crearFuenteSupabase } from '../catalogo/fuente'
import { palabras } from '../catalogo/normalizar'
import type { Producto, ProductoCache } from '../tipos'

/** Errores de alta_producto_caja y editar_producto (tarea 15). 'desconocido' = red u otro. */
export type CodigoErrorProducto =
  | 'sin_cuenta'
  | 'dispositivo_desconocido'
  | 'codigo_invalido'
  | 'nombre_invalido'
  | 'precio_invalido'
  | 'codigo_existente'
  | 'codigo_existente_inactivo'
  | 'producto_desconocido'
  | 'desconocido'

export const MENSAJES_ERROR_PRODUCTO: Record<CodigoErrorProducto, string> = {
  sin_cuenta: 'Esta cuenta no está vinculada a este kiosco.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Cerrá sesión y volvé a entrar.',
  codigo_invalido: 'El código escaneado no es válido.',
  nombre_invalido: 'Escribí un nombre (hasta 80 letras).',
  precio_invalido: 'Escribí el precio en pesos enteros, mayor que cero.',
  codigo_existente: 'Ese código ya está cargado. Se está actualizando el catálogo: volvé a escanearlo.',
  codigo_existente_inactivo: 'Ese código es de un producto desactivado. Podés reactivarlo.',
  producto_desconocido: 'Ese producto no existe en este kiosco.',
  desconocido: 'No se pudo guardar. Revisá la conexión y probá de nuevo.',
}

const CODIGOS = Object.keys(MENSAJES_ERROR_PRODUCTO) as CodigoErrorProducto[]

export class ErrorProducto extends Error {
  readonly codigo: CodigoErrorProducto
  /** Id del producto existente (codigo_existente y codigo_existente_inactivo). */
  readonly productoId: string | null

  constructor(codigo: CodigoErrorProducto, productoId: string | null = null) {
    super(codigo)
    this.name = 'ErrorProducto'
    this.codigo = codigo
    this.productoId = productoId
  }
}

export function mensajeErrorProducto(e: unknown): string {
  return MENSAJES_ERROR_PRODUCTO[e instanceof ErrorProducto ? e.codigo : 'desconocido']
}

/** Sólo lo que cambia; lo que falta no se toca. El código de barras no se edita desde la app. */
export interface CambiosProducto {
  nombre?: string
  precio?: number
  activo?: boolean
}

export interface ServicioProductos {
  /** Todos los productos del kiosco, activos o no (lectura paginada de la tarea 7). */
  listar(): Promise<Producto[]>
  /** Alta desde la app (caja o jefe): queda "creado en caja". codigo null = producto sin código (grilla F2). */
  alta(codigo: string | null, nombre: string, precio: number): Promise<Producto>
  /** Reactivar = editar(id, { activo: true }). */
  editar(productoId: string, cambios: CambiosProducto): Promise<Producto>
}

export const aProductoCache = (p: Producto): ProductoCache => ({ ...p, palabras: palabras(p.nombre) })

function aProducto(dato: unknown): Producto {
  const r = dato as Producto
  return {
    id: r.id,
    nombre: r.nombre,
    precio: r.precio,
    codigo_barras: r.codigo_barras,
    activo: r.activo,
    creado_en_caja: r.creado_en_caja,
  }
}

function errorDeRpc(error: { message: string; details?: string | null }): ErrorProducto {
  const codigo = CODIGOS.find((c) => c === error.message) ?? 'desconocido'
  return new ErrorProducto(codigo, error.details || null)
}

/**
 * alCambiar se llama después de cada escritura (y ante codigo_existente, que indica caché vieja):
 * la tarea 17 lo usa para sincronizar la caché sin esperar los 3 minutos.
 */
export function crearServicioProductos(
  supabase: SupabaseClient,
  dispositivoId: string,
  alCambiar: () => void = () => undefined,
): ServicioProductos {
  const fuente = crearFuenteSupabase(supabase)
  return {
    listar: () => fuente.leerProductos(),
    async alta(codigo, nombre, precio) {
      const { data, error } = await supabase.rpc('alta_producto_caja', {
        p_dispositivo_id: dispositivoId,
        p_codigo_barras: codigo,
        p_nombre: nombre,
        p_precio: precio,
      })
      if (error) {
        const e = errorDeRpc(error)
        if (e.codigo === 'codigo_existente') alCambiar()
        throw e
      }
      alCambiar()
      return aProducto(data)
    },
    async editar(productoId, cambios) {
      const { data, error } = await supabase.rpc('editar_producto', {
        p_producto_id: productoId,
        p_dispositivo_id: dispositivoId,
        p_nombre: cambios.nombre ?? null,
        p_precio: cambios.precio ?? null,
        p_activo: cambios.activo ?? null,
      })
      if (error) throw errorDeRpc(error)
      alCambiar()
      return aProducto(data)
    },
  }
}
