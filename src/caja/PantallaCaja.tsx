import { useEffect, useReducer, useRef, useState, type ReactNode } from 'react'
import { crearFiltroDobleLectura } from '../escaner/dobleLectura'
import { UMBRALES, type Umbrales } from '../escaner/umbrales'
import { formatearPesos } from '../lib/plata'
import { AltaRapidaProducto } from '../productos/AltaRapidaProducto'
import { aProductoCache, MENSAJES_ERROR_PRODUCTO, mensajeErrorProducto, type ServicioProductos } from '../productos/productos'
import type { LineaCarrito, Producto, ProductoCache } from '../tipos'
import { PedirApertura } from '../turno/PantallaTurno'
import type { TurnoAbierto } from '../turno/turno'
import { pitido } from '../ui/pitido'
import { carritoReducer, carritoVacio, totalCarrito } from '../venta/carrito'
import { crearIdVenta, type GeneradorIdVenta } from '../venta/idVenta'
import { CampoEscaneo } from './CampoEscaneo'
import type { CatalogoCaja } from './catalogoCaja'
import { LineasVenta } from './LineasVenta'
import { idSugerencia, ListaSugerencias } from './ListaSugerencias'
import { PanelSinCodigo } from './PanelSinCodigo'
import { filtrarPanel, ordenarSinCodigo, type FilaRanking } from './ranking'

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
  /** ranking_sin_codigo (tarea 11). La tarea 17 pasa () => leerRankingSinCodigo(supabase). */
  leerRanking(): Promise<FilaRanking[]>
  cobro(sesion: SesionCobro): ReactNode
  umbrales?: Umbrales
  /** Sólo para tests: sin esto se usa la marca de tiempo de cada evento de teclado. */
  ahora?: () => number
  pitar?: () => void
  /** Alta rápida ante código inexistente y "Reactivar" ante un desactivado (tarea 15). Sin esto, sólo avisa. */
  productos?: ServicioProductos
}

type EstadoTurno =
  | { tipo: 'cargando' }
  | { tipo: 'error' }
  | { tipo: 'sin_turno' }
  | { tipo: 'abierto'; turno: TurnoAbierto }

export function PantallaCaja({
  catalogo,
  turno,
  leerRanking,
  cobro,
  umbrales = UMBRALES,
  ahora,
  pitar = pitido,
  productos,
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
  const [panelAbierto, setPanelAbierto] = useState(false)
  const [ranking, setRanking] = useState<FilaRanking[]>([])
  const [sinCodigo, setSinCodigo] = useState<ProductoCache[]>([])
  const [altaCodigo, setAltaCodigo] = useState<string | null>(null)
  const [inactivo, setInactivo] = useState<ProductoCache | null>(null)
  const [reactivando, setReactivando] = useState(false)
  const cobroAbiertoRef = useRef(false)
  // Lo que está abierto ahora, para las respuestas que llegan tarde con clausuras viejas.
  const altaRef = useRef<string | null>(null)
  const inactivoRef = useRef<ProductoCache | null>(null)
  const consulta = useRef('')
  const pedidoSinCodigo = useRef(0)
  const total = totalCarrito(carrito)
  const turnoId = estadoTurno.tipo === 'abierto' ? estadoTurno.turno.turnoId : null

  function cargarTurno() {
    setEstadoTurno({ tipo: 'cargando' })
    turno.leer().then(
      (t) => setEstadoTurno(t ? { tipo: 'abierto', turno: t } : { tipo: 'sin_turno' }),
      () => setEstadoTurno({ tipo: 'error' }),
    )
  }

  // Una sola vez al montar: el turno se lee de la base, nunca del navegador.
  useEffect(cargarTurno, [])

  // El ranking se pide cuando hay turno abierto y queda fijo en memoria durante el turno.
  useEffect(() => {
    if (turnoId === null) return
    let vigente = true
    leerRanking().then(
      (filas) => {
        if (vigente) setRanking(filas)
      },
      () => {
        // Sin ranking, la grilla queda en orden alfabético.
        if (vigente) setRanking([])
      },
    )
    return () => {
      vigente = false
    }
  }, [turnoId])

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

  function ponerAlta(codigo: string | null) {
    altaRef.current = codigo
    setAltaCodigo(codigo)
  }

  function ponerInactivo(producto: ProductoCache | null) {
    inactivoRef.current = producto
    setInactivo(producto)
  }

  const otroAbierto = () => altaRef.current !== null || inactivoRef.current !== null

  function limpiarBusqueda() {
    consulta.current = ''
    setTexto('')
    setSugerencias([])
    setSeleccion(null)
  }

  function agregar(producto: ProductoCache, limpiarAviso = true) {
    despachar({ tipo: 'agregar', producto })
    setResaltado(producto.id)
    if (limpiarAviso) setAviso(null)
    pitar()
  }

  function abrirPanel() {
    if (cobroAbiertoRef.current) return
    limpiarBusqueda()
    setPanelAbierto(true)
    // Descarta respuestas viejas: abrir, cerrar y reabrir rápido deja dos pedidos en vuelo.
    const pedido = ++pedidoSinCodigo.current
    catalogo.sinCodigo().then(
      (productos) => {
        if (pedido === pedidoSinCodigo.current) setSinCodigo(productos)
      },
      () => {
        if (pedido === pedidoSinCodigo.current) setSinCodigo([])
      },
    )
    enfocar()
  }

  function cerrarPanel() {
    setPanelAbierto(false)
    limpiarBusqueda()
    enfocar()
  }

  function teclaEspecial(tecla: 'Escape' | 'F2') {
    if (tecla === 'F2') {
      if (panelAbierto) cerrarPanel()
      else abrirPanel()
    } else if (panelAbierto) {
      cerrarPanel()
    }
  }

  async function cambiarTexto(valor: string) {
    setTexto(valor)
    setSeleccion(null)
    consulta.current = valor
    // Con el panel abierto, el texto filtra la grilla y no busca sugerencias.
    if (cobroAbiertoRef.current || panelAbierto) {
      setSugerencias([])
      return
    }
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
    setPanelAbierto(false)
    enfocar()
    if (!filtroLecturas.aceptar({ codigo, t })) return
    ponerAlta(null)
    ponerInactivo(null)
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
      if (productos) ponerAlta(codigo)
      return
    }
    if (!producto.activo) {
      setAviso(`${producto.nombre} está desactivado.`)
      if (productos) ponerInactivo(producto)
      return
    }
    agregar(producto)
  }

  /**
   * Producto creado o reactivado por el alta rápida: entra a la venta como cualquier escaneo.
   * El alta de `codigo` pudo cerrarse mientras guardaba y abrirse otra: esa no se toca.
   */
  function altaLista(codigo: string, producto: Producto) {
    if (altaRef.current === codigo) {
      ponerAlta(null)
      enfocar()
    }
    // El alta pudo terminar con el cobro ya abierto: el carrito está congelado.
    if (cobroAbiertoRef.current) {
      setAviso(AVISO_ESCANEO_EN_COBRO)
      return
    }
    agregar(aProductoCache(producto), !otroAbierto())
  }

  function altaYaCargada(codigo: string) {
    if (altaRef.current === codigo) {
      ponerAlta(null)
      enfocar()
    }
    if (!otroAbierto()) setAviso(MENSAJES_ERROR_PRODUCTO.codigo_existente)
  }

  /** Con el alta de `codigo` todavía abierta, su propio error alcanza; cerrada, el producto se perdería sin aviso. */
  function altaFallida(codigo: string, error: unknown) {
    if (altaRef.current !== codigo) {
      setAviso(`No se pudo guardar ${codigo}: no se agregó a la venta. ${mensajeErrorProducto(error)}`)
    }
  }

  async function reactivar(producto: ProductoCache) {
    // Decisión 13: el foco vuelve al campo ya, no al terminar; si no, un escaneo durante la espera se pierde.
    enfocar()
    if (!productos || reactivando) return
    setReactivando(true)
    try {
      const reactivado = await productos.editar(producto.id, { activo: true })
      if (inactivoRef.current?.id === producto.id) ponerInactivo(null)
      if (cobroAbiertoRef.current) setAviso(AVISO_ESCANEO_EN_COBRO)
      else agregar(aProductoCache(reactivado), !otroAbierto())
    } catch {
      setAviso(`No se pudo reactivar ${producto.nombre}. Probá de nuevo.`)
    } finally {
      setReactivando(false)
    }
  }

  function elegir(producto: ProductoCache) {
    agregar(producto)
    limpiarBusqueda()
    enfocar()
  }

  /** Toque en la grilla: suma 1 y el panel queda abierto. */
  function tocar(producto: ProductoCache) {
    agregar(producto)
    enfocar()
  }

  /** Enter nunca agrega una sugerencia sola: sólo la elegida con flechas. */
  function enter() {
    if (panelAbierto || seleccion === null) return
    const producto = sugerencias[seleccion]
    if (producto) elegir(producto)
  }

  function mover(paso: 1 | -1) {
    if (panelAbierto || sugerencias.length === 0) return
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
    setPanelAbierto(false)
    ponerAlta(null)
    ponerInactivo(null)
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

  const enPanel = panelAbierto ? filtrarPanel(ordenarSinCodigo(ranking, sinCodigo), texto) : []
  const listaAbierta = !cobroAbierto && !panelAbierto && sugerencias.length > 0

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
      {inactivo && productos && (
        <p className="reactivar">
          <button type="button" disabled={reactivando} onClick={() => void reactivar(inactivo)}>
            Reactivar {inactivo.nombre}
          </button>
        </p>
      )}
      {altaCodigo !== null && productos && (
        <AltaRapidaProducto
          key={altaCodigo}
          codigo={altaCodigo}
          servicio={productos}
          alListo={(producto) => altaLista(altaCodigo, producto)}
          escaner={{
            umbrales,
            ahora,
            // Escaneo de otro código con foco en el formulario: el cajero siguió vendiendo.
            // escanear() cierra el alta si el filtro de lectura doble acepta la lectura.
            alEscanear: (codigo, t) => void escanear(codigo, t),
          }}
          alCancelar={() => {
            ponerAlta(null)
            enfocar()
          }}
          alCodigoExistente={() => altaYaCargada(altaCodigo)}
          alError={(error) => altaFallida(altaCodigo, error)}
        />
      )}
      <CampoEscaneo
        campoRef={campo}
        valor={texto}
        umbrales={umbrales}
        ahora={ahora}
        listaAbierta={listaAbierta}
        opcionActiva={seleccion !== null && sugerencias[seleccion] ? idSugerencia(sugerencias[seleccion]) : undefined}
        alCambiar={(v) => void cambiarTexto(v)}
        alEscanear={(codigo, t) => void escanear(codigo, t)}
        alEnter={enter}
        alFlecha={mover}
        alTeclaEspecial={teclaEspecial}
      />
      {!cobroAbierto && (
        <button
          type="button"
          className="boton-sin-codigo"
          tabIndex={-1}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => teclaEspecial('F2')}
        >
          Sin código (F2)
        </button>
      )}
      {panelAbierto && <PanelSinCodigo productos={enPanel} alTocar={tocar} alCerrar={cerrarPanel} />}
      {listaAbierta && (
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
