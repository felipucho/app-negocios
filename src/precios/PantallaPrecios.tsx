import { Fragment, useEffect, useId, useRef, useState, type FormEvent } from 'react'
import { compararPorNombre } from '../catalogo/buscar'
import { formatearPesos, parsearPesos } from '../lib/plata'
import type { ServicioProductos } from '../productos/productos'
import type { Producto } from '../tipos'
import {
  MENSAJES_PRECIOS,
  mensajePrecios,
  type GestionProducto,
  type PedidoAumento,
  type Redondeo,
  type ResultadoAumento,
  type ServicioPrecios,
} from './precios'

/** Lo que ofrece el select de redondeo. La base lo valida igual. */
const REDONDEOS: readonly Redondeo[] = [1, 5, 10, 50, 100]

export interface PropsPantallaPrecios {
  servicio: ServicioPrecios
  productos: Pick<ServicioProductos, 'listar'>
  /** Tras un aumento: cambiaron precios en la caché de las cajas. Editar costos no la toca. */
  alCambiarPrecios(): void
}

interface FilaPrecio {
  producto: Producto
  /** Null si el producto todavía no tiene fila de gestión: sin costo, rubro ni proveedor. */
  gestion: GestionProducto | null
}

interface CamposAumento {
  porcentaje: string
  redondeo: Redondeo
  rubro: string
  proveedor: string
}

const AUMENTO_VACIO: CamposAumento = { porcentaje: '', redondeo: 1, rubro: '', proveedor: '' }

function armarFilas(productos: Producto[], gestion: GestionProducto[]): FilaPrecio[] {
  const porId = new Map(gestion.map((g) => [g.producto_id, g] as const))
  return [...productos]
    .sort(compararPorNombre)
    .map((producto) => ({ producto, gestion: porId.get(producto.id) ?? null }))
}

/** Margen sobre el precio, redondeado. Sin costo no hay margen que mostrar. */
function margen(precio: number, costo: number | null): string {
  if (costo === null || precio <= 0) return '-'
  return `${Math.round(((precio - costo) / precio) * 100)} %`
}

/** Igual que editar_gestion_producto: sin espacios de más, así el aumento encuentra el mismo texto. */
function normalizarTexto(texto: string): string {
  return texto.trim().replace(/\s+/g, ' ')
}

/** Vacío = sin dato. parsearPesos devuelve 0 para el vacío, por eso se chequea antes. */
function datosGestion(
  costo: string,
  rubro: string,
  proveedor: string,
): Omit<GestionProducto, 'producto_id'> | { error: string } {
  const c = costo.trim()
  const costoPesos = c === '' ? null : parsearPesos(c)
  if (c !== '' && costoPesos === null) return { error: MENSAJES_PRECIOS.costo_invalido }
  const r = normalizarTexto(rubro)
  const p = normalizarTexto(proveedor)
  if (r.length > 40 || p.length > 60) return { error: MENSAJES_PRECIOS.texto_invalido }
  return { costo: costoPesos, rubro: r || null, proveedor: p || null }
}

/** Entero con signo escrito a mano: parsearPesos no admite negativos, y Number() solo daría 1 para "1.000". */
function pedidoDesde(c: CamposAumento): { pedido: Omit<PedidoAumento, 'operacionId'> } | { error: string } {
  const texto = c.porcentaje.trim()
  const porcentaje = Number(texto)
  if (!/^-?\d+$/.test(texto) || porcentaje === 0 || porcentaje < -90 || porcentaje > 1000) {
    return { error: MENSAJES_PRECIOS.porcentaje_invalido }
  }
  const pedido: Omit<PedidoAumento, 'operacionId'> = { porcentaje, redondeo: c.redondeo }
  const rubro = normalizarTexto(c.rubro)
  const proveedor = normalizarTexto(c.proveedor)
  if (rubro.length > 40 || proveedor.length > 60) return { error: MENSAJES_PRECIOS.texto_invalido }
  if (rubro) pedido.rubro = rubro
  if (proveedor) pedido.proveedor = proveedor
  return { pedido }
}

/** Lo que define un aumento: si cambia cualquiera de estos datos, es otra operación. */
function claveAumento(p: Omit<PedidoAumento, 'operacionId'>): string {
  return JSON.stringify([p.porcentaje, p.redondeo, p.rubro ?? null, p.proveedor ?? null])
}

function mensajeAplicado({ cantidad, ya_existia }: ResultadoAumento): string {
  if (ya_existia) return 'Ese aumento ya estaba aplicado: no se volvió a aplicar.'
  return cantidad === 1 ? 'Se cambió 1 precio.' : `Se cambiaron ${cantidad} precios.`
}

function alcanceDe(p: PedidoAumento): string {
  if (p.rubro && p.proveedor) return `los productos del rubro ${p.rubro} y del proveedor ${p.proveedor}`
  if (p.rubro) return `los productos del rubro ${p.rubro}`
  if (p.proveedor) return `los productos del proveedor ${p.proveedor}`
  return 'todos los productos'
}

function textoConfirmacion(p: PedidoAumento): string {
  const verbo = p.porcentaje < 0 ? 'bajar' : 'subir'
  const inicio = `Vas a ${verbo} los precios de ${alcanceDe(p)} un ${Math.abs(p.porcentaje)} %`
  return `${inicio}, redondeando hacia arriba a múltiplos de ${p.redondeo}. ¿Aplicar?`
}

/** Precios y costos. Sólo el jefe llega acá; la base hace cumplir el rol y el módulo. */
export function PantallaPrecios({ servicio, productos, alCambiarPrecios }: PropsPantallaPrecios) {
  const [filas, setFilas] = useState<FilaPrecio[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editando, setEditando] = useState<string | null>(null)
  const [aumento, setAumento] = useState<CamposAumento>(AUMENTO_VACIO)
  const [revisado, setRevisado] = useState<PedidoAumento | null>(null)
  const [errorAumento, setErrorAumento] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)
  const [aplicando, setAplicando] = useState(false)
  // Un id por aumento revisado. Un reintento del mismo aumento (corte de red) lo reusa: la base no lo aplica dos veces.
  const [operaciones] = useState(() => new Map<string, string>())
  const enCurso = useRef(false)
  const idAyuda = useId()

  function cargar() {
    setError(null)
    Promise.all([productos.listar(), servicio.leerGestion()]).then(
      ([lista, gestion]) => setFilas(armarFilas(lista, gestion)),
      (e) => setError(mensajePrecios(e)),
    )
  }

  useEffect(cargar, [servicio, productos])

  function guardado(g: GestionProducto) {
    setFilas((fs) => fs?.map((f) => (f.producto.id === g.producto_id ? { ...f, gestion: g } : f)) ?? null)
    setEditando((id) => (id === g.producto_id ? null : id))
  }

  function cambiarAumento(cambio: Partial<CamposAumento>) {
    setAumento((a) => ({ ...a, ...cambio }))
    setRevisado(null)
  }

  function revisar(e: FormEvent) {
    e.preventDefault()
    setHecho(null)
    setErrorAumento(null)
    const v = pedidoDesde(aumento)
    if ('error' in v) {
      setErrorAumento(v.error)
      return
    }
    const clave = claveAumento(v.pedido)
    const operacionId = operaciones.get(clave) ?? crypto.randomUUID()
    operaciones.set(clave, operacionId)
    setRevisado({ ...v.pedido, operacionId })
  }

  async function aplicar(pedido: PedidoAumento) {
    if (enCurso.current) return
    enCurso.current = true
    setAplicando(true)
    setErrorAumento(null)
    try {
      const resultado = await servicio.aumentarPrecios(pedido)
      operaciones.delete(claveAumento(pedido))
      setRevisado(null)
      setHecho(mensajeAplicado(resultado))
      alCambiarPrecios()
      cargar()
    } catch (e) {
      // Sin código no hubo respuesta de la base: puede que el aumento se haya guardado igual.
      const sinRespuesta = !(e as { code?: string } | null)?.code
      setRevisado(null)
      setErrorAumento(
        sinRespuesta ? `${mensajePrecios(e)} Si el aumento ya se había guardado, volver a aplicarlo no lo repite.` : mensajePrecios(e),
      )
      cargar()
    } finally {
      enCurso.current = false
      setAplicando(false)
    }
  }

  return (
    <section className="precios">
      <h2>Precios y costos</h2>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {filas === null && !error && <p>Cargando…</p>}
      {filas && (
        <table aria-label="Precios y costos">
          <thead>
            <tr>
              <th>Producto</th>
              <th>Precio</th>
              <th>Costo</th>
              <th>Margen</th>
              <th>Rubro</th>
              <th>Proveedor</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {filas.map(({ producto, gestion }) => {
              const costo = gestion?.costo ?? null
              return (
                <Fragment key={producto.id}>
                  <tr>
                    <td>
                      {producto.nombre}
                      {!producto.activo && ' (Desactivado)'}
                    </td>
                    <td>{formatearPesos(producto.precio)}</td>
                    <td>{costo === null ? 'Sin cargar' : formatearPesos(costo)}</td>
                    <td>{margen(producto.precio, costo)}</td>
                    <td>{gestion?.rubro ?? 'Sin cargar'}</td>
                    <td>{gestion?.proveedor ?? 'Sin cargar'}</td>
                    <td>
                      <button
                        type="button"
                        aria-label={`Editar ${producto.nombre}`}
                        onClick={() => setEditando(producto.id)}
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                  {editando === producto.id && (
                    <tr>
                      <td colSpan={7}>
                        <EditorPrecio
                          producto={producto}
                          gestion={gestion}
                          servicio={servicio}
                          alGuardar={guardado}
                          alCancelar={() => setEditando(null)}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      )}
      <section className="aumento-precios">
        <h3>Aumento de precios</h3>
        <form aria-label="Aumento de precios" onSubmit={revisar}>
          <label>
            Porcentaje
            <input
              value={aumento.porcentaje}
              inputMode="numeric"
              onChange={(e) => cambiarAumento({ porcentaje: e.target.value })}
            />
          </label>
          <label>
            Redondeo
            <select
              value={aumento.redondeo}
              aria-describedby={`${idAyuda}-redondeo`}
              onChange={(e) => cambiarAumento({ redondeo: Number(e.target.value) as Redondeo })}
            >
              {REDONDEOS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <p className="ayuda" id={`${idAyuda}-redondeo`}>
            El precio se redondea hacia arriba al múltiplo elegido.
          </p>
          <label>
            Rubro (opcional)
            <input
              value={aumento.rubro}
              aria-describedby={`${idAyuda}-filtro`}
              onChange={(e) => cambiarAumento({ rubro: e.target.value })}
            />
          </label>
          <label>
            Proveedor (opcional)
            <input
              value={aumento.proveedor}
              aria-describedby={`${idAyuda}-filtro`}
              onChange={(e) => cambiarAumento({ proveedor: e.target.value })}
            />
          </label>
          <p className="ayuda" id={`${idAyuda}-filtro`}>
            Rubro y proveedor coinciden con el texto escrito, sin importar mayúsculas. Si los dejás vacíos, el aumento va a
            todos los productos.
          </p>
          {errorAumento && (
            <p role="alert" className="aviso aviso--error">
              {errorAumento}
            </p>
          )}
          <button type="submit">Revisar aumento</button>
        </form>
        {revisado && (
          <div className="aumento-precios__confirmacion">
            <p>{textoConfirmacion(revisado)}</p>
            <button type="button" aria-disabled={aplicando} onClick={() => void aplicar(revisado)}>
              Aplicar aumento
            </button>
            <button type="button" onClick={() => setRevisado(null)}>
              Cancelar
            </button>
          </div>
        )}
        {hecho && (
          <p role="status" className="aviso">
            {hecho}
          </p>
        )}
      </section>
    </section>
  )
}

interface PropsEditorPrecio {
  producto: Producto
  gestion: GestionProducto | null
  servicio: Pick<ServicioPrecios, 'editarGestion'>
  alGuardar(gestion: GestionProducto): void
  alCancelar(): void
}

/** Va dentro de la fila del producto. editarGestion reemplaza los tres valores, así que siempre se mandan los tres. */
function EditorPrecio({ producto, gestion, servicio, alGuardar, alCancelar }: PropsEditorPrecio) {
  const [costo, setCosto] = useState(gestion?.costo?.toString() ?? '')
  const [rubro, setRubro] = useState(gestion?.rubro ?? '')
  const [proveedor, setProveedor] = useState(gestion?.proveedor ?? '')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const datos = datosGestion(costo, rubro, proveedor)
    if ('error' in datos) {
      setError(datos.error)
      return
    }
    enCurso.current = true
    setGuardando(true)
    setError(null)
    try {
      alGuardar(await servicio.editarGestion(producto.id, datos))
    } catch (err) {
      setError(mensajePrecios(err))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <form
      className="editor-precio"
      aria-label={`Costo, rubro y proveedor de ${producto.nombre}`}
      onSubmit={(e) => void guardar(e)}
    >
      <label>
        Costo
        <input value={costo} inputMode="numeric" onChange={(e) => setCosto(e.target.value)} />
      </label>
      <label>
        Rubro
        <input value={rubro} onChange={(e) => setRubro(e.target.value)} />
      </label>
      <label>
        Proveedor
        <input value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <button type="submit" aria-disabled={guardando}>
        Guardar
      </button>
      <button type="button" onClick={alCancelar}>
        Cancelar
      </button>
    </form>
  )
}
