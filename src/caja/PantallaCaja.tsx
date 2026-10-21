import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { crearFiltroDobleLectura } from '../escaner/dobleLectura'
import { UMBRALES, type Umbrales } from '../escaner/umbrales'
import { formatearPesos } from '../lib/plata'
import type { LineaCarrito, ProductoCache } from '../tipos'
import { PedirApertura } from '../turno/PantallaTurno'
import type { TurnoAbierto } from '../turno/turno'
import { pitido } from '../ui/pitido'
import { carritoReducer, carritoVacio, totalCarrito } from '../venta/carrito'
import { crearIdVenta, type GeneradorIdVenta } from '../venta/idVenta'
import { CampoEscaneo } from './CampoEscaneo'
import type { CatalogoCaja } from './catalogoCaja'
import { LineasVenta } from './LineasVenta'
import { idSugerencia, ListaSugerencias } from './ListaSugerencias'

/** Un clic en estos conserva su foco; en cualquier otra cosa (texto, filas, espacio vacío), el foco se queda donde estaba. */
const ENFOCABLES = 'input, textarea, select, button, a[href], [tabindex]'

export const AVISO_ESCANEO_EN_COBRO =
  'El cobro está abierto: el escaneo no se agregó. Volvé a la venta para agregar productos.'

/** Turno de esta PC. La tarea 17 lo arma con leerTurnoAbierto y abrirTurno (tarea 8). */
export interface ServicioTurno {
  leer(): Promise<TurnoAbierto | null>
  abrir(): Promise<TurnoAbierto>
}

/** Lo que la pantalla de cobro (tarea 14) recibe de la caja. */
export interface SesionCobro {
  lineas: LineaCarrito[]
  total: number
  /** Vive en la caja, no en el cobro: cerrar y reabrir el cobro no cambia el id de un mismo contenido. */
  ids: GeneradorIdVenta
  /** Cierra el cobro sin tocar el carrito. */
  volver(): void
  /** Después del comprobante: vacía el carrito y vuelve al campo. */
  nuevaVenta(): void
  /** Tras un rechazo por precio: el carrito toma los precios actuales (y el id sale nuevo solo). */
  actualizarPrecios(precios: Record<string, number>): void
  /** La base dijo sin_turno: la caja pide abrir turno, con el carrito intacto. */
  perderTurno(): void
  avisar(texto: string): void
}

export interface PropsPantallaCaja {
  catalogo: CatalogoCaja
  turno: ServicioTurno
  cobro(sesion: SesionCobro): ReactNode
  umbrales?: Umbrales
  /** Sólo para tests: sin esto se usa la marca de tiempo de cada evento de teclado. */
  ahora?: () => number
  pitar?: () => void
}

type EstadoTurno =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'sin_turno' }
  | { tipo: 'abierto'; turno: TurnoAbierto }

export function PantallaCaja({
  catalogo,
  turno,
  cobro,
  umbrales = UMBRALES,
  ahora,
  pitar = pitido,
}: PropsPantallaCaja) {
  const campo = useRef<HTMLInputElement>(null)
  const [estadoTurno, setEstadoTurno] = useState<EstadoTurno>({ tipo: 'cargando' })
  const [carrito, despachar] = useReducer(carritoReducer, carritoVacio)
  const [ids] = useState(() => crearIdVenta())
  const [filtroLecturas] = useState(() => crearFiltroDobleLectura(umbrales.dobleLecturaMs))
  const [texto, setTexto] = useState('')
  const [sugerencias, setSugerencias] = useState<ProductoCache[]>([])
  const [seleccion, setSeleccion] = useState<number | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [resaltado, setResaltado] = useState<string | null>(null)
  const [cobroAbierto, setCobroAbierto] = useState(false)
  const cobroAbiertoRef = useRef(false)
  const consulta = useRef('')
  const total = totalCarrito(carrito)

  function cargarTurno() {
    setEstadoTurno({ tipo: 'cargando' })
    turno.leer().then(
      (t) => setEstadoTurno(t ? { tipo: 'abierto', turno: t } : { tipo: 'sin_turno' }),
      () => setEstadoTurno({ tipo: 'error' }),
    )
  }

  // Una sola vez al montar: el turno se lee de la base, nunca del navegador.
  useEffect(cargarTurno, [])

  // Decisión 13: el campo siempre con foco. Un clic suelto no lo saca; si no, el próximo escaneo se pierde sin aviso.
  useEffect(() => {
    const guardia = (e: MouseEvent) => {
      if (e.target instanceof Element && !e.target.closest(ENFOCABLES)) e.preventDefault()
    }
    document.addEventListener('mousedown', guardia)
    return () => document.removeEventListener('mousedown', guardia)
  }, [])

  const enfocar = () => campo.current?.focus()

  function ponerCobro(abierto: boolean) {
    cobroAbiertoRef.current = abierto
    setCobroAbierto(abierto)
  }

  function limpiarBusqueda() {
    consulta.current = ''
    setTexto('')
    setSugerencias([])
    setSeleccion(null)
  }

  function agregar(producto: ProductoCache) {
    despachar({ tipo: 'agregar', producto })
    setResaltado(producto.id)
    setAviso(null)
    pitar()
  }

  async function cambiarTexto(valor: string) {
    setTexto(valor)
    setSeleccion(null)
    consulta.current = valor
    if (cobroAbiertoRef.current) return
    try {
      const encontrados = await catalogo.porNombre(valor)
      // Descarta respuestas viejas: el texto pudo cambiar (o limpiarse por un escaneo) mientras tanto.
      if (consulta.current === valor) setSugerencias(encontrados)
    } catch {
      if (consulta.current === valor) setSugerencias([])
    }
  }

  async function escanear(codigo: string, t: number) {
    limpiarBusqueda()
    enfocar()
    if (!filtroLecturas.aceptar({ codigo, t })) return
    if (cobroAbiertoRef.current) {
      setAviso(AVISO_ESCANEO_EN_COBRO)
      return
    }
    let producto: ProductoCache | undefined
    try {
      producto = await catalogo.porCodigo(codigo)
    } catch {
      setAviso('No se pudo buscar el código. Probá de nuevo.')
      return
    }
    // El cobro pudo abrirse mientras se buscaba: el total ya se mostró.
    if (cobroAbiertoRef.current) {
      setAviso(AVISO_ESCANEO_EN_COBRO)
      return
    }
    if (!producto) {
      setAviso(`Código ${codigo} no encontrado. Buscalo por nombre.`)
      return
    }
    if (!producto.activo) {
      setAviso(`${producto.nombre} está desactivado.`)
      return
    }
    agregar(producto)
  }

  function elegir(producto: ProductoCache) {
    agregar(producto)
    limpiarBusqueda()
    enfocar()
  }

  /** Enter nunca agrega una sugerencia sola: sólo la elegida con flechas. */
  function enter() {
    if (seleccion === null) return
    const producto = sugerencias[seleccion]
    if (producto) elegir(producto)
  }

  function mover(paso: 1 | -1) {
    if (sugerencias.length === 0) return
    setSeleccion((s) =>
      s === null ? (paso === 1 ? 0 : sugerencias.length - 1) : (s + paso + sugerencias.length) % sugerencias.length,
    )
  }

  function cambiarCantidad(productoId: string, delta: 1 | -1) {
    if (cobroAbiertoRef.current) return
    despachar({ tipo: 'cambiarCantidad', productoId, delta })
    enfocar()
  }

  function abrirCobro() {
    if (carrito.lineas.length === 0) return
    limpiarBusqueda()
    ponerCobro(true)
  }

  const sesion: SesionCobro = {
    lineas: carrito.lineas,
    total,
    ids,
    volver: () => {
      ponerCobro(false)
      enfocar()
    },
    nuevaVenta: () => {
      despachar({ tipo: 'vaciar' })
      setResaltado(null)
      setAviso(null)
      ponerCobro(false)
      enfocar()
    },
    actualizarPrecios: (precios) => despachar({ tipo: 'actualizarPrecios', precios }),
    perderTurno: () => {
      ponerCobro(false)
      setEstadoTurno({ tipo: 'sin_turno' })
    },
    avisar: setAviso,
  }

  if (estadoTurno.tipo === 'cargando') return <p className="caja-cargando">Cargando…</p>
  if (estadoTurno.tipo === 'error') {
    return (
      <section className="caja">
        <p role="alert" className="aviso aviso--error">
          No se pudo leer el turno. Revisá la conexión.
        </p>
        <button type="button" onClick={cargarTurno}>
          Reintentar
        </button>
      </section>
    )
  }
  if (estadoTurno.tipo === 'sin_turno') {
    return (
      <PedirApertura
        alAbrir={async () => {
          setEstadoTurno({ tipo: 'abierto', turno: await turno.abrir() })
        }}
      />
    )
  }

  return (
    <section className="caja">
      {/* Siempre montado: un lector de pantalla anuncia el cambio de texto, no una región que aparece ya llena. */}
      <p role="status" className={aviso ? 'aviso' : undefined}>
        {aviso}
      </p>
      <CampoEscaneo
        campoRef={campo}
        valor={texto}
        umbrales={umbrales}
        ahora={ahora}
        listaAbierta={!cobroAbierto && sugerencias.length > 0}
        opcionActiva={seleccion !== null && sugerencias[seleccion] ? idSugerencia(sugerencias[seleccion]) : undefined}
        alCambiar={(v) => void cambiarTexto(v)}
        alEscanear={(codigo, t) => void escanear(codigo, t)}
        alEnter={enter}
        alFlecha={mover}
      />
      {!cobroAbierto && sugerencias.length > 0 && (
        <ListaSugerencias productos={sugerencias} seleccion={seleccion} alElegir={elegir} />
      )}
      {/* Decisión 31: la venta en armado vive sólo en memoria. */}
      <p className="ayuda">
        Si recargás la página (F5), la venta sin confirmar se pierde: antes de volver a cargarla, revisá las ventas de
        hoy, porque pudo haberse grabado.
      </p>
      <LineasVenta lineas={carrito.lineas} resaltado={resaltado} bloqueada={cobroAbierto} alCambiar={cambiarCantidad} />
      {!cobroAbierto && (
        <button
          type="button"
          className="boton-cobrar"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={abrirCobro}
          disabled={carrito.lineas.length === 0}
        >
          Cobrar {formatearPesos(total)}
        </button>
      )}
      {cobroAbierto && cobro(sesion)}
    </section>
  )
}
