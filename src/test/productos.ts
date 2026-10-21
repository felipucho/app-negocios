import { vi } from 'vitest'
import { ErrorProducto, type CambiosProducto, type ServicioProductos } from '../productos/productos'
import type { Producto } from '../tipos'

export function productoDePrueba(p: Pick<Producto, 'id' | 'nombre' | 'precio'> & Partial<Producto>): Producto {
  return { codigo_barras: null, activo: true, creado_en_caja: false, ...p }
}

/** Servicio de productos en memoria. alta crea "nuevo-<código o nombre>"; editar aplica los cambios. */
export function servicioProductosFalso(iniciales: readonly Producto[] = []) {
  const productos: Producto[] = iniciales.map((p) => ({ ...p }))
  const servicio = {
    listar: vi.fn(async () => productos.map((p) => ({ ...p }))),
    alta: vi.fn(async (codigo: string | null, nombre: string, precio: number): Promise<Producto> =>
      productoDePrueba({ id: `nuevo-${codigo ?? nombre}`, nombre, precio, codigo_barras: codigo, creado_en_caja: true }),
    ),
    editar: vi.fn(async (productoId: string, cambios: CambiosProducto): Promise<Producto> => {
      const i = productos.findIndex((p) => p.id === productoId)
      if (i < 0) throw new ErrorProducto('producto_desconocido')
      productos[i] = { ...productos[i], ...cambios }
      return { ...productos[i] }
    }),
  } satisfies ServicioProductos
  return servicio
}
