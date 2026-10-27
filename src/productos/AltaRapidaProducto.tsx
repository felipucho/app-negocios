import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import { detectarEscaneo, enRacha, esTeclaDeRacha, registrarPulsacion, type PulsacionEnCampo } from '../escaner/detector'
import type { Umbrales } from '../escaner/umbrales'
import type { Producto } from '../tipos'
import { ErrorProducto, mensajeErrorProducto, validarPrecio, validarProducto, type ServicioProductos } from './productos'

export interface PropsAltaRapidaProducto {
  /** Código escaneado que no está en el catálogo: se guarda tal cual. */
  codigo: string
  servicio: Pick<ServicioProductos, 'alta' | 'editar'>
  /** Producto creado o reactivado: la caja lo agrega a la venta. */
  alListo(producto: Producto): void
  alCancelar(): void
  /**
   * codigo_existente: la caché de la caja está vieja. La caja cierra el alta para que el reescaneo pase por el
   * campo con el catálogo actualizado; adentro del alta, el mismo código se ignora como lectura doble.
   */
  alCodigoExistente?(): void
  /** Falló el guardado: si otro escaneo ya cerró el formulario, el error de adentro no lo ve nadie. */
  alError?(error: unknown): void
  /**
   * En la caja el formulario toma el foco del campo de escaneo (decisión 13): una racha del escáner
   * tipeada acá no es un nombre, se manda a la venta. Mismo criterio que CampoEscaneo.
   */
  escaner?: { umbrales: Umbrales; ahora?: () => number; alEscanear(codigo: string, t: number): void }
}

/** Alta ante código inexistente (spec sección 6): nombre y precio, sin aprobación del jefe. */
export function AltaRapidaProducto({
  codigo,
  servicio,
  alListo,
  alCancelar,
  alCodigoExistente,
  alError,
  escaner,
}: PropsAltaRapidaProducto) {
  const [nombre, setNombre] = useState('')
  const [precio, setPrecio] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [inactivoId, setInactivoId] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const enCurso = useRef(false)
  // Cada pulsación guarda el campo y su valor previo: una racha del escáner se deshace al detectarla.
  const pulsaciones = useRef<PulsacionEnCampo[]>([])

  function alTecla(e: KeyboardEvent<HTMLFormElement>) {
    if (!escaner) return
    const t = escaner.ahora ? escaner.ahora() : e.timeStamp
    const campo = e.target instanceof HTMLInputElement ? e.target : null
    // Dentro de una racha, el espacio no activa Guardar y agregar: el clic salta al soltar la tecla.
    if (e.key === ' ' && e.target instanceof HTMLButtonElement && enRacha(pulsaciones.current, t, escaner.umbrales)) {
      e.preventDefault()
    }
    if (e.key === 'Enter') {
      const escaneo = detectarEscaneo(pulsaciones.current, t, escaner.umbrales)
      const primera = escaneo ? pulsaciones.current[escaneo.desde] : undefined
      pulsaciones.current = []
      if (!escaneo) return
      e.preventDefault()
      if (primera?.campo === 'nombre') setNombre(primera.antes)
      if (primera?.campo === 'precio') setPrecio(primera.antes)
      // El mismo código es lectura doble o reescaneo: el alta sigue abierta.
      if (escaneo.codigo !== codigo) escaner.alEscanear(escaneo.codigo, t)
    } else if (esTeclaDeRacha(e)) {
      // Con foco en un botón también: si no, el Enter del escáner lo activa y el código se pierde.
      pulsaciones.current = registrarPulsacion(pulsaciones.current, e.key, t, campo)
    }
  }

  async function correr(accion: () => Promise<Producto>) {
    if (enCurso.current) return
    enCurso.current = true
    setGuardando(true)
    setError(null)
    try {
      alListo(await accion())
    } catch (e) {
      if (e instanceof ErrorProducto && e.codigo === 'codigo_existente' && alCodigoExistente) {
        alCodigoExistente()
        return
      }
      if (e instanceof ErrorProducto && e.codigo === 'codigo_existente_inactivo' && e.productoId) {
        setInactivoId(e.productoId)
      }
      setError(mensajeErrorProducto(e))
      alError?.(e)
    } finally {
      enCurso.current = false
      setGuardando(false)
    }
  }

  /** Nombre y precio tipeados, o null con el aviso puesto. Guardar y reactivar validan igual. */
  function validar(): { nombre: string; precio: number } | null {
    const v = validarProducto(nombre, precio)
    if ('error' in v) {
      setError(v.error)
      return null
    }
    return v
  }

  function guardar(e: FormEvent) {
    e.preventDefault()
    const v = validar()
    if (v) void correr(() => servicio.alta(codigo, v.nombre, v.precio))
  }

  /** Sólo precio y activo: el producto conserva su nombre del catálogo (cambiarlo es otra decisión). */
  function reactivar(productoId: string) {
    const p = validarPrecio(precio)
    if ('error' in p) {
      setError(p.error)
      return
    }
    void correr(() => servicio.editar(productoId, { precio: p.precio, activo: true }))
  }

  return (
    <form className="alta-rapida" aria-label="Alta rápida de producto" onSubmit={guardar} onKeyDown={alTecla}>
      <p>
        Código <strong>{codigo}</strong>: cargalo para seguir vendiendo.
      </p>
      <label>
        Nombre
        <input name="nombre" value={nombre} maxLength={80} onChange={(e) => setNombre(e.target.value)} autoFocus />
      </label>
      <label>
        Precio
        <input name="precio" value={precio} inputMode="numeric" onChange={(e) => setPrecio(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {/* aria-disabled y no disabled: un botón deshabilitado con foco no recibe el escaneo (decisión 13). enCurso evita el doble envío. */}
      {inactivoId ? (
        <button type="button" aria-disabled={guardando} onClick={() => reactivar(inactivoId)}>
          Reactivar y agregar
        </button>
      ) : (
        <button type="submit" aria-disabled={guardando}>
          Guardar y agregar
        </button>
      )}
      <button type="button" onClick={alCancelar}>
        Cancelar
      </button>
    </form>
  )
}
