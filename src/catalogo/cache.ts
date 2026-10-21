import { Dexie, type EntityTable } from 'dexie'
import type { Producto, ProductoCache } from '../tipos'
import { buscarPorNombre, terminosDeBusqueda } from './buscar'
import type { FuenteCatalogo } from './fuente'
import { palabras } from './normalizar'

interface Meta {
  clave: 'negocio_id' | 'catalogo_version' | 'borrado'
  valor: string | number
}

/** Caché del catálogo de un negocio. Sólo para cargar rápido: nunca es fuente de verdad (decisión 5). */
export class CacheCatalogo extends Dexie {
  productos!: EntityTable<ProductoCache, 'id'>
  meta!: EntityTable<Meta, 'clave'>

  constructor(nombre = 'catalogo') {
    super(nombre)
    // Un cambio de esquema es version(2) con su upgrader; nunca editar esta versión publicada.
    this.version(1).stores({
      productos: 'id, codigo_barras, *palabras',
      meta: 'clave',
    })
  }
}

let cacheApp: CacheCatalogo | null = null

/** Instancia de la app (perezosa: no abre IndexedDB hasta usarla). */
export function cacheDeLaApp(): CacheCatalogo {
  cacheApp ??= new CacheCatalogo()
  return cacheApp
}

const aCache = (p: Producto): ProductoCache => ({ ...p, palabras: palabras(p.nombre) })
const estadoMeta = async (db: CacheCatalogo) => JSON.stringify(await db.meta.toArray())

export async function sincronizarCatalogo(
  db: CacheCatalogo,
  fuente: FuenteCatalogo,
): Promise<{ actualizado: boolean; version: number }> {
  // La versión se lee antes que los productos: si cambia en el medio, la revisión siguiente recarga.
  const { negocioId, version } = await fuente.leerVersion()
  const [negocio, guardada] = await Promise.all([db.meta.get('negocio_id'), db.meta.get('catalogo_version')])
  if (negocio?.valor === negocioId && guardada?.valor === version) return { actualizado: false, version }
  // Otro negocio: se vacía antes de bajar, para que una descarga fallida no deje su catálogo buscable.
  if (negocio && negocio.valor !== negocioId) await vaciar(db)
  const antes = await estadoMeta(db)

  const productos = await fuente.leerProductos()
  const escrito = await db.transaction('rw', db.productos, db.meta, async () => {
    // Optimista: si mientras bajaba otra sincronización o un borrarCache (de cualquier pestaña) tocó meta, no se pisa.
    // No compara versiones: un restore puede bajar catalogo_version y la caché tiene que seguirlo.
    if ((await estadoMeta(db)) !== antes) return false
    await db.productos.clear()
    await db.productos.bulkPut(productos.map(aCache))
    await db.meta.bulkPut([
      { clave: 'negocio_id', valor: negocioId },
      { clave: 'catalogo_version', valor: version },
    ])
    return true
  })
  return { actualizado: escrito, version }
}

export async function buscarEnCache(db: CacheCatalogo, consulta: string): Promise<ProductoCache[]> {
  const terminos = terminosDeBusqueda(consulta)
  if (!terminos) return []
  const candidatos = await db.productos.where('palabras').startsWith(terminos[0]).distinct().toArray()
  return buscarPorNombre(candidatos, consulta)
}

/** Código exacto (con letras o sin ellas), activo o no: un inactivo se ofrece reactivar. */
export async function buscarPorCodigoEnCache(db: CacheCatalogo, codigo: string): Promise<ProductoCache | undefined> {
  return db.productos.where('codigo_barras').equals(codigo).first()
}

async function vaciar(db: CacheCatalogo): Promise<void> {
  await db.transaction('rw', db.productos, db.meta, async () => {
    await db.productos.clear()
    await db.meta.clear()
  })
}

/** Al cerrar sesión (la PC puede ser compartida, spec sección 10). La usa la tarea 17. */
export async function borrarCache(db: CacheCatalogo = cacheDeLaApp()): Promise<void> {
  // La marca cambia meta: una sincronización en curso en otra pestaña la ve y no reescribe.
  await db.transaction('rw', db.productos, db.meta, async () => {
    await vaciar(db)
    await db.meta.put({ clave: 'borrado', valor: crypto.randomUUID() })
  })
}
