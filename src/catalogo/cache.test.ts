// @vitest-environment node
import 'fake-indexeddb/auto'
import { describe, expect, it, vi } from 'vitest'
import type { Producto } from '../tipos'
import {
  borrarCache,
  buscarEnCache,
  buscarPorCodigoEnCache,
  CacheCatalogo,
  sincronizarCatalogo,
  vaciarCacheAjena,
} from './cache'
import type { FuenteCatalogo } from './fuente'

const coca: Producto = { id: 'p1', nombre: 'Coca Cola 500', precio: 1500, codigo_barras: 'ABC-7790', activo: true, creado_en_caja: false }
const pan: Producto = { id: 'p2', nombre: 'Pan casero', precio: 800, codigo_barras: null, activo: true, creado_en_caja: false }
const viejo: Producto = { id: 'p3', nombre: 'Coca vieja', precio: 100, codigo_barras: '111', activo: false, creado_en_caja: false }

function fuenteFalsa(negocioId: string, version: number, productos: Producto[]) {
  const estado = { negocioId, version, productos }
  const fuente: FuenteCatalogo = {
    leerVersion: vi.fn(async () => ({ negocioId: estado.negocioId, version: estado.version })),
    leerProductos: vi.fn(async () => estado.productos),
  }
  return { estado, fuente }
}

const nuevaCache = () => new CacheCatalogo(`prueba-${crypto.randomUUID()}`)

describe('sincronizarCatalogo', () => {
  it('la primera vez carga el catálogo', async () => {
    const db = nuevaCache()
    const { fuente } = fuenteFalsa('n1', 4, [coca, pan])
    expect(await sincronizarCatalogo(db, fuente)).toEqual({ actualizado: true, version: 4 })
    expect((await buscarEnCache(db, 'coca')).map((p) => p.id)).toEqual(['p1'])
  })

  it('con la misma versión no vuelve a bajar productos', async () => {
    const db = nuevaCache()
    const { fuente } = fuenteFalsa('n1', 4, [coca])
    await sincronizarCatalogo(db, fuente)
    expect(await sincronizarCatalogo(db, fuente)).toEqual({ actualizado: false, version: 4 })
    expect(fuente.leerProductos).toHaveBeenCalledTimes(1)
  })

  it('si catalogo_version cambió, recarga la caché entera', async () => {
    const db = nuevaCache()
    const { estado, fuente } = fuenteFalsa('n1', 4, [coca, pan])
    await sincronizarCatalogo(db, fuente)
    estado.version = 5
    estado.productos = [{ ...coca, precio: 1700 }]
    expect(await sincronizarCatalogo(db, fuente)).toEqual({ actualizado: true, version: 5 })
    expect((await buscarPorCodigoEnCache(db, 'ABC-7790'))?.precio).toBe(1700)
    expect(await buscarEnCache(db, 'pan')).toEqual([])
  })

  it('si cambió el negocio, no mezcla catálogos', async () => {
    const db = nuevaCache()
    await sincronizarCatalogo(db, fuenteFalsa('n1', 4, [coca]).fuente)
    await sincronizarCatalogo(db, fuenteFalsa('n2', 4, [pan]).fuente)
    expect(await buscarEnCache(db, 'coca')).toEqual([])
    expect((await buscarEnCache(db, 'pan')).map((p) => p.id)).toEqual(['p2'])
  })

  it('si cambió el negocio y la descarga falla, no deja el catálogo anterior buscable', async () => {
    const db = nuevaCache()
    await sincronizarCatalogo(db, fuenteFalsa('n1', 4, [coca]).fuente)
    const { fuente } = fuenteFalsa('n2', 4, [])
    vi.mocked(fuente.leerProductos).mockRejectedValueOnce(new Error('sin red'))
    await expect(sincronizarCatalogo(db, fuente)).rejects.toThrow('sin red')
    expect(await buscarEnCache(db, 'coca')).toEqual([])
  })

  it('una sincronización en curso al cerrar sesión no vuelve a llenar la caché', async () => {
    const db = nuevaCache()
    const { fuente } = fuenteFalsa('n1', 1, [coca])
    let soltar!: (p: Producto[]) => void
    vi.mocked(fuente.leerProductos).mockReturnValueOnce(new Promise((r) => (soltar = r)))
    const enCurso = sincronizarCatalogo(db, fuente)
    await vi.waitFor(() => expect(fuente.leerProductos).toHaveBeenCalled())
    await borrarCache(db)
    soltar([coca])
    expect(await enCurso).toEqual({ actualizado: false, version: 1 })
    expect(await buscarEnCache(db, 'coca')).toEqual([])
  })

  it('una sincronización vieja que termina última no pisa a una más nueva', async () => {
    const db = nuevaCache()
    const lenta = fuenteFalsa('n1', 5, [coca])
    let soltar!: (p: Producto[]) => void
    vi.mocked(lenta.fuente.leerProductos).mockReturnValueOnce(new Promise((r) => (soltar = r)))
    const vieja = sincronizarCatalogo(db, lenta.fuente)
    await vi.waitFor(() => expect(lenta.fuente.leerProductos).toHaveBeenCalled())
    await sincronizarCatalogo(db, fuenteFalsa('n1', 6, [{ ...coca, precio: 1700 }]).fuente)
    // El servidor ya está en la 6: al reintentar, la vieja lo ve y no vuelve a escribir.
    lenta.estado.version = 6
    lenta.estado.productos = [{ ...coca, precio: 1700 }]
    soltar([coca])
    expect(await vieja).toEqual({ actualizado: false, version: 6 })
    expect((await buscarEnCache(db, 'coca'))[0].precio).toBe(1700)
  })

  it('si la sincronización nueva termina después de una vieja, la nueva gana', async () => {
    const db = nuevaCache()
    const nueva = fuenteFalsa('n1', 6, [{ ...coca, precio: 1700 }])
    let soltar!: (p: Producto[]) => void
    vi.mocked(nueva.fuente.leerProductos).mockReturnValueOnce(new Promise((r) => (soltar = r)))
    const enCurso = sincronizarCatalogo(db, nueva.fuente)
    await vi.waitFor(() => expect(nueva.fuente.leerProductos).toHaveBeenCalled())
    await sincronizarCatalogo(db, fuenteFalsa('n1', 5, [coca]).fuente)
    soltar([{ ...coca, precio: 1700 }])
    expect(await enCurso).toEqual({ actualizado: true, version: 6 })
    expect((await buscarEnCache(db, 'coca'))[0].precio).toBe(1700)
  })

  it('si la versión del servidor bajó (restore), igual recarga', async () => {
    const db = nuevaCache()
    await sincronizarCatalogo(db, fuenteFalsa('n1', 10, [coca]).fuente)
    expect(await sincronizarCatalogo(db, fuenteFalsa('n1', 3, [{ ...coca, precio: 9999 }]).fuente)).toEqual({
      actualizado: true,
      version: 3,
    })
    expect((await buscarEnCache(db, 'coca'))[0].precio).toBe(9999)
  })

  it('un borrarCache desde otra pestaña frena la sincronización en curso', async () => {
    const nombre = `prueba-${crypto.randomUUID()}`
    const [pestana1, pestana2] = [new CacheCatalogo(nombre), new CacheCatalogo(nombre)]
    const { fuente } = fuenteFalsa('n1', 1, [coca])
    let soltar!: (p: Producto[]) => void
    vi.mocked(fuente.leerProductos).mockReturnValueOnce(new Promise((r) => (soltar = r)))
    const enCurso = sincronizarCatalogo(pestana2, fuente)
    await vi.waitFor(() => expect(fuente.leerProductos).toHaveBeenCalled())
    await borrarCache(pestana1)
    soltar([coca])
    expect(await enCurso).toEqual({ actualizado: false, version: 1 })
    expect(await buscarEnCache(pestana1, 'coca')).toEqual([])
  })

  it('un cierre de sesión mientras se pide la versión tampoco deja la caché llena', async () => {
    const db = nuevaCache()
    const { fuente } = fuenteFalsa('n1', 1, [coca])
    let soltar!: (v: { negocioId: string; version: number }) => void
    vi.mocked(fuente.leerVersion).mockReturnValueOnce(new Promise((r) => (soltar = r)))
    const enCurso = sincronizarCatalogo(db, fuente)
    await vi.waitFor(() => expect(fuente.leerVersion).toHaveBeenCalled())
    await borrarCache(db)
    soltar({ negocioId: 'n1', version: 1 })
    expect(await enCurso).toEqual({ actualizado: false, version: 1 })
    expect(await buscarEnCache(db, 'coca')).toEqual([])
  })

  it('vaciar la caché de otro negocio no borra la marca de cierre: la sincronización siguiente escribe', async () => {
    const db = nuevaCache()
    await borrarCache(db)
    await sincronizarCatalogo(db, fuenteFalsa('n1', 4, [coca]).fuente)
    expect(await sincronizarCatalogo(db, fuenteFalsa('n2', 4, [pan]).fuente)).toEqual({ actualizado: true, version: 4 })
    expect((await buscarEnCache(db, 'pan')).map((p) => p.id)).toEqual(['p2'])
  })
})

describe('búsquedas en caché', () => {
  it('busca por inicio de palabra con el índice multiEntry y oculta inactivos', async () => {
    const db = nuevaCache()
    await sincronizarCatalogo(db, fuenteFalsa('n1', 1, [coca, pan, viejo]).fuente)
    expect((await buscarEnCache(db, 'cola 5')).map((p) => p.id)).toEqual(['p1'])
    expect((await buscarEnCache(db, 'coca')).map((p) => p.id)).toEqual(['p1'])
    expect(await buscarEnCache(db, 'c')).toEqual([])
  })

  it('busca por código exacto, con letras, incluidos los inactivos', async () => {
    const db = nuevaCache()
    await sincronizarCatalogo(db, fuenteFalsa('n1', 1, [coca, viejo]).fuente)
    expect((await buscarPorCodigoEnCache(db, 'ABC-7790'))?.nombre).toBe('Coca Cola 500')
    expect((await buscarPorCodigoEnCache(db, '111'))?.activo).toBe(false)
    expect(await buscarPorCodigoEnCache(db, 'abc-7790')).toBeUndefined()
  })

  it('vaciarCacheAjena deja el catálogo del mismo negocio y vacía el de otro', async () => {
    const db = nuevaCache()
    const { fuente } = fuenteFalsa('n1', 1, [coca])
    await sincronizarCatalogo(db, fuente)
    await vaciarCacheAjena(db, 'n1')
    expect((await buscarPorCodigoEnCache(db, 'ABC-7790'))?.id).toBe('p1')
    await vaciarCacheAjena(db, 'n2')
    expect(await buscarPorCodigoEnCache(db, 'ABC-7790')).toBeUndefined()
    expect(await buscarEnCache(db, 'coca')).toEqual([])
    expect(await sincronizarCatalogo(db, fuente)).toEqual({ actualizado: true, version: 1 })
  })

  it('borrarCache deja todo vacío y obliga a recargar', async () => {
    const db = nuevaCache()
    const { fuente } = fuenteFalsa('n1', 1, [coca])
    await sincronizarCatalogo(db, fuente)
    await borrarCache(db)
    expect(await buscarEnCache(db, 'coca')).toEqual([])
    expect(await sincronizarCatalogo(db, fuente)).toEqual({ actualizado: true, version: 1 })
  })
})
