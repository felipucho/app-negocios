import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { coincide, compararPorNombre, terminosDeBusqueda } from '../catalogo/buscar'
import { palabras } from '../catalogo/normalizar'
import { formatearPesos } from '../lib/plata'
import type { Producto } from '../tipos'
import { ErrorProducto, mensajeErrorProducto, validarProducto, type CambiosProducto, type ServicioProductos } from './productos'

/** Filas visibles a la vez; el resto se encuentra buscando. */
export const MAX_FILAS = 50

/** Un producto con las palabras de su nombre: se calculan una vez por lista, no en cada tecla. */
export interface ProductoIndexado {
  producto: Producto
  palabras: string[]
}

/**
 * Misma búsqueda que la caja (inicio de palabra, sin tildes, desde 2 letras; tarea 6), pero muestra
 * también los desactivados (para reactivarlos) y sin el tope de 8. Con menos de 2 letras, todo.
 */
export function filtrarProductos(indice: readonly ProductoIndexado[], consulta: string): Producto[] {
  const terminos = terminosDeBusqueda(consulta)
  return indice.filter((i) => !terminos || coincide(i.palabras, terminos)).map((i) => i.producto)
}

export interface PropsPantallaProductos {
  servicio: ServicioProductos
}

/**
 * Precios y productos (decisión 35): caja y jefe dan de alta (con código o sin código) y editan precio,
 * nombre y activo. Lo que se da de alta desde la app queda "creado en caja".
 */
export function PantallaProductos({ servicio }: PropsPantallaProductos) {
  const [productos, setProductos] = useState<Producto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [consulta, setConsulta] = useState('')
  const [editando, setEditando] = useState<Producto | null>(null)
  const [agregando, setAgregando] = useState(false)

  function cargar() {
    setError(null)
    servicio.listar().then(setProductos, () => setError('No se pudo leer la lista de productos. Revisá la conexión.'))
  }

  useEffect(cargar, [servicio])

  const indice = useMemo(
    () =>
      productos
        ? [...productos].sort(compararPorNombre).map((p) => ({ producto: p, palabras: palabras(p.nombre) }))
        : [],
    [productos],
  )
  const filtrados = useMemo(() => filtrarProductos(indice, consulta), [indice, consulta])

  function guardado(p: Producto) {
    setProductos((lista) => lista?.map((x) => (x.id === p.id ? p : x)) ?? null)
    setEditando((e) => (e?.id === p.id ? null : e))
  }

  function agregado(p: Producto) {
    setProductos((lista) => (lista ? [...lista, p] : [p]))
    setAgregando(false)
  }

  return (
    <section className="productos">
      <h2>Precios y productos</h2>
      <label>
        Buscar producto
        <input type="search" value={consulta} onChange={(e) => setConsulta(e.target.value)} />
      </label>
      {agregando ? (
        <AltaProducto servicio={servicio} alGuardar={agregado} alCancelar={() => setAgregando(false)} alRecargar={cargar} />
      ) : (
        <button type="button" onClick={() => setAgregando(true)}>
          Agregar producto
        </button>
      )}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}{' '}
          <button type="button" onClick={cargar}>
            Reintentar
          </button>
        </p>
      )}
      {productos === null && !error && <p>Cargando…</p>}
      {editando && (
        <EditorProducto
          key={editando.id}
          producto={editando}
          servicio={servicio}
          alGuardar={guardado}
          alCancelar={() => setEditando(null)}
        />
      )}
      {productos && (
        <>
          <table aria-label="Productos">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Precio</th>
                <th>Código</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filtrados.slice(0, MAX_FILAS).map((p) => (
                <tr key={p.id}>
                  <td>
                    {p.nombre}
                    {p.creado_en_caja && <span className="marca"> (creado en caja)</span>}
                  </td>
                  <td>{formatearPesos(p.precio)}</td>
                  <td>{p.codigo_barras ?? 'Sin código'}</td>
                  <td>{p.activo ? 'Activo' : 'Desactivado'}</td>
                  <td>
                    <button type="button" aria-label={`Editar ${p.nombre}`} onClick={() => setEditando(p)}>
                      Editar
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtrados.length > MAX_FILAS && (
            <p>
              Mostrando {MAX_FILAS} de {filtrados.length}. Buscá por nombre para encontrar el resto.
            </p>
          )}
        </>
      )}
    </section>
  )
}

interface PropsEditorProducto {
  producto: Producto
  servicio: Pick<ServicioProductos, 'editar'>
  alGuardar(producto: Producto): void
  alCancelar(): void
}

function EditorProducto({ producto, servicio, alGuardar, alCancelar }: PropsEditorProducto) {
  const [nombre, setNombre] = useState(producto.nombre)
  const [precio, setPrecio] = useState(String(producto.precio))
  const [activo, setActivo] = useState(producto.activo)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const v = validarProducto(nombre, precio)
    if ('error' in v) {
      setError(v.error)
      return
    }
    const cambios: CambiosProducto = {}
    if (v.nombre !== producto.nombre) cambios.nombre = v.nombre
    if (v.precio !== producto.precio) cambios.precio = v.precio
    if (activo !== producto.activo) cambios.activo = activo
    if (Object.keys(cambios).length === 0) {
      alCancelar()
      return
    }
    enCurso.current = true
    setGuardando(true)
    setError(null)
    try {
      alGuardar(await servicio.editar(producto.id, cambios))
    } catch (err) {
      setError(mensajeErrorProducto(err))
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <form className="editor-producto" aria-label={`Editar ${producto.nombre}`} onSubmit={(e) => void guardar(e)}>
      <p>Código de barras: {producto.codigo_barras ?? 'sin código'} (no se cambia desde la app).</p>
      <label>
        Nombre
        <input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label>
        Precio
        <input value={precio} inputMode="numeric" onChange={(e) => setPrecio(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={activo} onChange={(e) => setActivo(e.target.checked)} />
        Activo
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <button type="submit" disabled={guardando}>
        Guardar
      </button>
      <button type="button" onClick={alCancelar}>
        Cancelar
      </button>
    </form>
  )
}

interface PropsAltaProducto {
  servicio: Pick<ServicioProductos, 'alta'>
  alGuardar(producto: Producto): void
  alCancelar(): void
  /** El código ya está cargado: esta lista puede no tenerlo (se dio de alta en otra PC), así que se vuelve a leer. */
  alRecargar(): void
}

/** Alta desde la pantalla de productos. Código vacío = producto sin código: va a la grilla F2 con 0 ventas. */
function AltaProducto({ servicio, alGuardar, alCancelar, alRecargar }: PropsAltaProducto) {
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const v = validarProducto(nombre, precio)
    if ('error' in v) {
      setError(v.error)
      return
    }
    enCurso.current = true
    setGuardando(true)
    setError(null)
    try {
      alGuardar(await servicio.alta(codigo.trim() || null, v.nombre, v.precio))
    } catch (err) {
      if (err instanceof ErrorProducto && (err.codigo === 'codigo_existente' || err.codigo === 'codigo_existente_inactivo')) {
        alRecargar()
      }
      // codigo_existente_inactivo: el producto está en la lista como "Desactivado" y se reactiva desde ahí.
      // El mensaje de codigo_existente es para la caja ("volvé a escanearlo"); acá no se escanea.
      setError(
        err instanceof ErrorProducto && err.codigo === 'codigo_existente'
          ? 'Ese código ya está cargado: buscalo en la lista.'
          : mensajeErrorProducto(err),
      )
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  return (
    <form className="alta-producto" aria-label="Nuevo producto" onSubmit={(e) => void guardar(e)}>
      <label>
        Nombre
        <input value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      <label>
        Precio
        <input value={precio} inputMode="numeric" onChange={(e) => setPrecio(e.target.value)} />
      </label>
      <label>
        Código de barras (opcional)
        <input value={codigo} maxLength={48} onChange={(e) => setCodigo(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <button type="submit" disabled={guardando}>
        Guardar producto
      </button>
      <button type="button" onClick={alCancelar}>
        Cancelar
      </button>
    </form>
  )
}
