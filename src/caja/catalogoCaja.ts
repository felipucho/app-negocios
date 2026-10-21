import { buscarEnCache, buscarPorCodigoEnCache, type CacheCatalogo } from '../catalogo/cache'
import type { ProductoCache } from '../tipos'

/** Lo que la caja lee del catálogo. En la app sale de la caché Dexie; en las pruebas, de una lista. */
export interface CatalogoCaja {
  /** Código exacto, activo o no (un inactivo se ofrece reactivar en la tarea 15). */
  porCodigo(codigo: string): Promise<ProductoCache | undefined>
  /** Búsqueda por nombre: desde 2 letras, inicio de palabra, máximo 8 (tarea 6). */
  porNombre(consulta: string): Promise<ProductoCache[]>
  /** Activos sin código de barras, para el panel F2 (tarea 13). */
  sinCodigo(): Promise<ProductoCache[]>
}

export function crearCatalogoCaja(db: CacheCatalogo): CatalogoCaja {
  return {
    porCodigo: (codigo) => buscarPorCodigoEnCache(db, codigo),
    porNombre: (consulta) => buscarEnCache(db, consulta),
    sinCodigo: () => db.productos.filter((p) => p.activo && p.codigo_barras === null).toArray(),
  }
}
