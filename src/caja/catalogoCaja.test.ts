// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { CacheCatalogo } from '../catalogo/cache'
import { palabras } from '../catalogo/normalizar'
import type { ProductoCache } from '../tipos'
import { crearCatalogoCaja } from './catalogoCaja'

const producto = (id: string, nombre: string, codigo_barras: string | null, activo = true): ProductoCache => ({
  id,
  nombre,
  precio: 100,
  codigo_barras,
  activo,
  creado_en_caja: false,
  palabras: palabras(nombre),
})

async function armar() {
  const db = new CacheCatalogo(`prueba-${crypto.randomUUID()}`)
  await db.productos.bulkPut([
    producto('p1', 'Alfajor triple', '7790001'),
    producto('p2', 'Bizcochos', null),
    producto('p3', 'Pan de ayer', null, false),
    producto('p4', 'Turrón', 'ABC-9', false),
  ])
  return crearCatalogoCaja(db)
}

describe('crearCatalogoCaja', () => {
  it('por código encuentra el exacto, también si está desactivado', async () => {
    const catalogo = await armar()
    expect((await catalogo.porCodigo('7790001'))?.id).toBe('p1')
    expect((await catalogo.porCodigo('ABC-9'))?.activo).toBe(false)
    expect(await catalogo.porCodigo('0000')).toBeUndefined()
  })

  it('por nombre usa la búsqueda de la caché', async () => {
    const catalogo = await armar()
    expect((await catalogo.porNombre('alf')).map((p) => p.id)).toEqual(['p1'])
  })

  it('sin código devuelve sólo los activos sin código de barras', async () => {
    const catalogo = await armar()
    expect((await catalogo.sinCodigo()).map((p) => p.id)).toEqual(['p2'])
  })
})
