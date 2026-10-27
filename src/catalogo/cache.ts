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

export const aCache = (p: Producto): ProductoCache => ({ ...p, palabras: palabras(p.nombre) })

/** Meta entero en una lectura. La marca de borrado va aparte: sólo la cambia un cierre de sesión. */
const estadoMeta = async (db: CacheCatalogo) => {
  const meta = await db.meta.toArray()
  return { todo: JSON.stringify(meta), borrado: meta.find((m) => m.clave === 'borrado')?.valor }
}

export async function sincronizarCatalogo(
  db: CacheCatalogo,
  fuente: FuenteCatalogo,
): Promise<{ actualizado: boolean; version: number }> {
  // Dos intentos como máximo: si otra sincronización escribió en el medio, el segundo lee lo que quedó.
  for (let intento = 1; ; intento++) {
    // Antes de la versión: un cierre de sesión durante la descarga cambia esta marca y la transacción aborta.
    const borradoAntes = (await db.meta.get('borrado'))?.valor
    // La versión se lee antes que los productos: si cambia en el medio, la revisión siguiente recarga.
    const { negocioId, version } = await fuente.leerVersion()
    const [negocio, guardada] = await Promise.all([db.meta.get('negocio_id'), db.meta.get('catalogo_version')])
    if (negocio?.valor === negocioId && guardada?.valor === version) return { actualizado: false, version }
    // Otro negocio: se vacía antes de bajar, para que una descarga fallida no deje su catálogo buscable.
    if (negocio && negocio.valor !== negocioId) await vaciar(db)
    const antes = await estadoMeta(db)

    const productos = await fuente.leerProductos()
    const resultado = await db.transaction('rw', db.productos, db.meta, async () => {
      // Optimista: otra sincronización que escribió → se reintenta una vez; un borrarCache (marca de borrado) aborta.
      // No compara versiones: un restore puede bajar catalogo_version y la caché tiene que seguirlo.
      const ahora = await estadoMeta(db)
      if (ahora.borrado !== borradoAntes) return 'borrada'
      if (ahora.todo !== antes.todo) return 'pisada'
      await db.productos.clear()
      await db.productos.bulkPut(productos.map(aCache))
      await db.meta.bulkPut([
        { clave: 'negocio_id', valor: negocioId },
        { clave: 'catalogo_version', valor: version },
      ])
      return 'escrita'
    })
    if (resultado !== 'pisada' || intento === 2) return { actualizado: resultado === 'escrita', version }
  }
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
    // La marca de borrado se conserva: sólo la cambia un cierre de sesión (ver estadoMeta).
    await db.meta.where('clave').notEqual('borrado').delete()
  })
}

/** Al entrar: si quedó el catálogo de otro negocio (un borrarCache que falló al salir), la caja no busca en él. */
export async function vaciarCacheAjena(db: CacheCatalogo, negocioId: string): Promise<void> {
  // Lectura y vaciado juntos: una sincronización que ya escribió este negocio no se borra.
  await db.transaction('rw', db.productos, db.meta, async () => {
    const negocio = await db.meta.get('negocio_id')
    if (negocio && negocio.valor !== negocioId) await vaciar(db)
  })
}

/** Al cerrar sesión (la PC puede ser compartida, spec sección 10). La usa la tarea 17. */
export async function borrarCache(db: CacheCatalogo): Promise<void> {
  // La marca cambia meta: una sincronización en curso en otra pestaña la ve y no reescribe.
  await db.transaction('rw', db.productos, db.meta, async () => {
    await vaciar(db)
    await db.meta.put({ clave: 'borrado', valor: crypto.randomUUID() })
  })
}
