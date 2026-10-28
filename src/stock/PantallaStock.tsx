import { useEffect, useRef, useState, type FormEvent } from 'react'
import { compararPorNombre } from '../catalogo/buscar'
import { codigoDeError } from '../lib/errores'
import type { ServicioProductos } from '../productos/productos'
import type { Producto } from '../tipos'
import { MENSAJES_STOCK, mensajeStock, type Faltante, type ItemIngreso, type ServicioStock, type StockProducto } from './stock'

export interface PropsPantallaStock {
  servicio: ServicioStock
  productos: Pick<ServicioProductos, 'listar'>
  esJefe: boolean
}

interface Datos {
  productos: Producto[]
  stock: StockProducto[]
  faltantes: Faltante[]
}

/** Faltantes y stock para caja y jefe. El ingreso es de caja y jefe; el ajuste, sólo del jefe. */
export function PantallaStock({ servicio, productos, esJefe }: PropsPantallaStock) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ajustarId, setAjustarId] = useState('')

  function cargar() {
    setError(null)
    Promise.all([productos.listar(), servicio.leerStock(), servicio.leerFaltantes()]).then(
      ([lista, stock, faltantes]) => setDatos({ productos: lista, stock, faltantes }),
      (e) => setError(mensajeStock(e)),
    )
  }

  useEffect(cargar, [servicio, productos])

  const activos = (datos?.productos ?? []).filter((p) => p.activo).sort(compararPorNombre)

  return (
    <section className="stock">
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}{' '}
          <button type="button" onClick={cargar}>
            Reintentar
          </button>
        </p>
      )}
      {!datos && !error && <p>Cargando…</p>}
      {datos && (
        <>
          <h2>En mínimo o sin stock</h2>
          {datos.faltantes.length === 0 ? (
            <p>Nada está en mínimo ni sin stock.</p>
          ) : (
            <table aria-label="En mínimo o sin stock">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th>Quedan</th>
                  <th>Mínimo</th>
                  {esJefe && <th>Proveedor</th>}
                </tr>
              </thead>
              <tbody>
                {datos.faltantes.map((f) => (
                  <tr key={f.producto_id}>
                    <td>{f.nombre}</td>
                    <td>{f.cantidad}</td>
                    <td>{f.minimo}</td>
                    {esJefe && <td>{f.proveedor || 'Sin cargar'}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Stock</h2>
          <table aria-label="Stock">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Stock</th>
                <th>Mínimo</th>
                {esJefe && <th />}
              </tr>
            </thead>
            <tbody>
              {activos.map((p) => {
                const fila = datos.stock.find((s) => s.producto_id === p.id)
                const cantidad = fila?.cantidad ?? 0
                return (
                  <tr key={p.id}>
                    <td>{p.nombre}</td>
                    <td>
                      {cantidad}
                      {cantidad < 0 && ' (Vendido sin stock)'}
                    </td>
                    <td>{fila?.minimo ?? 0}</td>
                    {esJefe && (
                      <td>
                        <button type="button" aria-label={`Ajustar ${p.nombre}`} onClick={() => setAjustarId(p.id)}>
                          Ajustar
                        </button>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>

          <h2>Ingreso de mercadería</h2>
          <FormularioIngreso servicio={servicio} activos={activos} alGuardar={cargar} />

          {esJefe && (
            <>
              <h2>Ajustar stock</h2>
              {/* key: cada Ajustar arranca un formulario limpio, con ese producto elegido. */}
              <FormularioAjuste
                key={ajustarId}
                servicio={servicio}
                activos={activos}
                productoInicial={ajustarId}
                alGuardar={cargar}
              />
            </>
          )}
        </>
      )}
    </section>
  )
}

export interface PropsFormularioIngreso {
  servicio: Pick<ServicioStock, 'ingresar'>
  activos: Producto[]
  alGuardar(): void
}

interface Renglon {
  productoId: string
  cantidad: string
}

const RENGLON_VACIO: Renglon = { productoId: '', cantidad: '' }

function FormularioIngreso({ servicio, activos, alGuardar }: PropsFormularioIngreso) {
  const [renglones, setRenglones] = useState<Renglon[]>([RENGLON_VACIO])
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enCurso = useRef(false)
  // Un id por ingreso: los reintentos lo reusan; cambiar el formulario o registrar bien lo descarta.
  const lote = useRef<string | null>(null)

  function actualizar(nuevos: Renglon[]) {
    lote.current = null
    setRenglones(nuevos)
  }

  function cambiar(i: number, cambio: Partial<Renglon>) {
    actualizar(renglones.map((r, j) => (j === i ? { ...r, ...cambio } : r)))
  }

  function agregar() {
    if (!enviando) actualizar([...renglones, RENGLON_VACIO])
  }

  function quitar(i: number) {
    if (!enviando) actualizar(renglones.filter((_, j) => j !== i))
  }

  async function registrar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const armado = armarItems(renglones)
    if ('error' in armado) {
      setError(armado.error)
      setAviso(null)
      return
    }
    const loteId = lote.current ?? crypto.randomUUID()
    lote.current = loteId
    enCurso.current = true
    setEnviando(true)
    setError(null)
    setAviso(null)
    try {
      const { ya_existia } = await servicio.ingresar(loteId, armado.items)
      lote.current = null
      setRenglones([RENGLON_VACIO])
      setAviso(ya_existia ? 'Ese ingreso ya estaba registrado: no se sumó otra vez.' : 'Ingreso registrado.')
      alGuardar()
    } catch (err) {
      // Con este código el lote ya no sirve: el próximo intento tiene que usar otro id.
      if (codigoDeError(err) === 'lote_id_reusado') lote.current = null
      setError(mensajeStock(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  return (
    <form className="ingreso-stock" aria-label="Ingreso de mercadería" onSubmit={(e) => void registrar(e)}>
      {renglones.map((r, i) => (
        <div key={i}>
          <label>
            Producto
            <select value={r.productoId} onChange={(e) => cambiar(i, { productoId: e.target.value })}>
              <option value="">Elegí un producto</option>
              {activos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Cantidad
            <input value={r.cantidad} inputMode="numeric" onChange={(e) => cambiar(i, { cantidad: e.target.value })} />
          </label>
          {renglones.length > 1 && (
            <button type="button" aria-label={`Quitar renglón ${i + 1}`} aria-disabled={enviando} onClick={() => quitar(i)}>
              Quitar
            </button>
          )}
        </div>
      ))}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso">
          {aviso}
        </p>
      )}
      <button type="button" aria-disabled={enviando} onClick={agregar}>
        Agregar otro producto
      </button>
      <button type="submit" aria-disabled={enviando}>
        Registrar ingreso
      </button>
    </form>
  )
}

/** Los renglones como items de ingreso, o el aviso de qué falta. */
function armarItems(renglones: Renglon[]): { items: ItemIngreso[] } | { error: string } {
  const items: ItemIngreso[] = []
  for (const r of renglones) {
    if (r.productoId === '' || r.cantidad.trim() === '') return { error: 'Completá el producto y la cantidad de cada renglón.' }
    const cantidad = leerEntero(r.cantidad)
    if (cantidad === null || cantidad < 1 || cantidad > 99999) return { error: MENSAJES_STOCK.linea_invalida }
    items.push({ productoId: r.productoId, cantidad })
  }
  const distintos = new Set(items.map((i) => i.productoId)).size
  if (items.length === 0 || distintos !== items.length) return { error: MENSAJES_STOCK.linea_invalida }
  return { items }
}

export interface PropsFormularioAjuste {
  servicio: Pick<ServicioStock, 'ajustar'>
  activos: Producto[]
  productoInicial: string
  alGuardar(): void
}

/** Sólo el jefe. Un campo vacío no se toca. */
function FormularioAjuste({ servicio, activos, productoInicial, alGuardar }: PropsFormularioAjuste) {
  const [productoId, setProductoId] = useState(productoInicial)
  const [cantidad, setCantidad] = useState('')
  const [minimo, setMinimo] = useState('')
  const [motivo, setMotivo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enCurso = useRef(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const v = validarAjuste(productoId, cantidad, minimo, motivo)
    if ('error' in v) {
      setError(v.error)
      setAviso(null)
      return
    }
    enCurso.current = true
    setEnviando(true)
    setError(null)
    setAviso(null)
    try {
      await servicio.ajustar(productoId, v.cambio)
      setCantidad('')
      setMinimo('')
      setMotivo('')
      setAviso('Stock ajustado.')
      alGuardar()
    } catch (err) {
      setError(mensajeStock(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  return (
    <form className="ajuste-stock" aria-label="Ajustar stock" onSubmit={(e) => void guardar(e)}>
      <label>
        Producto
        <select value={productoId} onChange={(e) => setProductoId(e.target.value)}>
          <option value="">Elegí un producto</option>
          {activos.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cantidad nueva (opcional)
        <input value={cantidad} inputMode="numeric" onChange={(e) => setCantidad(e.target.value)} />
      </label>
      <label>
        Mínimo (opcional)
        <input value={minimo} inputMode="numeric" onChange={(e) => setMinimo(e.target.value)} />
      </label>
      <label>
        Motivo (obligatorio si cambiás la cantidad, de 3 a 200 letras)
        <input value={motivo} maxLength={200} onChange={(e) => setMotivo(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {aviso && (
        <p role="status" className="aviso">
          {aviso}
        </p>
      )}
      <button type="submit" aria-disabled={enviando}>
        Guardar ajuste
      </button>
    </form>
  )
}

/** Cambio para ajustar, o el aviso de qué falta. */
function validarAjuste(
  productoId: string,
  cantidad: string,
  minimo: string,
  motivo: string,
): { cambio: { cantidad?: number; minimo?: number; motivo?: string } } | { error: string } {
  if (productoId === '') return { error: 'Elegí un producto.' }
  if (cantidad.trim() === '' && minimo.trim() === '') return { error: 'Escribí una cantidad nueva o un mínimo.' }
  const nueva = cantidad.trim() === '' ? undefined : leerEntero(cantidad)
  if (nueva === null) return { error: 'La cantidad nueva tiene que ser un número entero.' }
  const min = minimo.trim() === '' ? undefined : leerEntero(minimo)
  if (min === null || (min !== undefined && min < 0)) {
    return { error: 'El mínimo tiene que ser un entero mayor o igual a cero.' }
  }
  const texto = motivo.trim()
  if (nueva !== undefined && (texto.length < 3 || texto.length > 200)) return { error: MENSAJES_STOCK.motivo_invalido }
  return { cambio: { cantidad: nueva, minimo: min, motivo: texto || undefined } }
}

/** Entero escrito a mano ("12", "-3"). Null si no lo es: decimales, puntos de miles o letras. */
function leerEntero(texto: string): number | null {
  const limpio = texto.trim()
  return /^-?\d{1,9}$/.test(limpio) ? Number(limpio) : null
}
