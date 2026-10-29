import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { FECHA_HORA } from '../lib/fecha'
import { formatearPesos, parsearPesos } from '../lib/plata'
import {
  fechaCorta,
  hoyEnElKiosco,
  intentoDe,
  MENSAJES_RETIRO,
  mensajeProveedores,
  mensajeRetiro,
  yaNoExiste,
  type DatosProveedor,
  type EstadoVisita,
  type Intento,
  type PedidoProveedor,
  type Proveedor,
  type RetiroProveedor,
  type ServicioProveedores,
  type Visita,
} from './proveedores'

const ETIQUETA_ESTADO: Record<EstadoVisita, string> = { prevista: 'Prevista', llego: 'Llegó', no_vino: 'No vino' }

const NUEVO = 'nuevo'
const MENSAJE_LECTURA = 'No se pudieron leer los proveedores. Revisá la conexión.'
const MENSAJE_FORMATO = 'El importe tiene que ser un importe en pesos enteros.'

/** Orden de la lista y del primer proveedor que se abre: por nombre, en español. */
function ordenarPorNombre(proveedores: Proveedor[]): Proveedor[] {
  return [...proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
}

/** El mensaje del error, o null. Un renglón que ya no existe no es un error. */
async function errorDe(operacion: () => Promise<void>): Promise<string | null> {
  try {
    await operacion()
    return null
  } catch (err) {
    return yaNoExiste(err) ? null : mensajeProveedores(err)
  }
}

interface Datos {
  proveedores: Proveedor[]
  visitas: Visita[]
  pedidos: PedidoProveedor[]
}

export interface PropsPantallaProveedores {
  servicio: ServicioProveedores
  /** Sin el módulo movimientos_caja no se anotan retiros. */
  retirosActivos: boolean
  /** Sin el módulo stock no se suman faltantes al pedido. */
  stockActivo: boolean
}

/** Ficha, visitas, qué pedirle y retiros de caja de cada proveedor (módulo proveedores, spec 2026-10-28). */
export function PantallaProveedores({ servicio, retirosActivos, stockActivo }: PropsPantallaProveedores) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<string | null>(null)
  // null: todavía no se eligió. NUEVO: la alta de un proveedor. Si no, el id del proveedor elegido.
  const [seleccion, setSeleccion] = useState<string | null>(null)
  // Sólo la última lectura pisa la lista: una respuesta vieja que llega tarde se descarta.
  const ultimaLectura = useRef(0)

  const cargar = useCallback(async () => {
    const esta = ++ultimaLectura.current
    try {
      const [proveedores, visitas, pedidos] = await Promise.all([
        servicio.leerProveedores(),
        servicio.leerVisitas(),
        servicio.leerPedidos(),
      ])
      if (esta !== ultimaLectura.current) return
      setDatos({ proveedores, visitas, pedidos })
      setError(null)
    } catch {
      if (esta === ultimaLectura.current) setError(MENSAJE_LECTURA)
    }
  }, [servicio])

  useEffect(() => {
    void cargar()
  }, [cargar])

  // Al entrar se abre el primer proveedor de la lista; si todavía no hay ninguno, la alta.
  useEffect(() => {
    if (datos && seleccion === null) setSeleccion(ordenarPorNombre(datos.proveedores)[0]?.id ?? NUEVO)
  }, [datos, seleccion])

  if (error) {
    return (
      <p role="alert" className="aviso aviso--error">
        {error}{' '}
        <button type="button" onClick={() => void cargar()}>
          Reintentar
        </button>
      </p>
    )
  }
  if (!datos) return <p>Cargando…</p>

  const lista = ordenarPorNombre(datos.proveedores)
  const elegido = lista.find((p) => p.id === seleccion)

  return (
    <section className="proveedores">
      <nav className="proveedores__lista" aria-label="Proveedores">
        {lista.map((p) => (
          <button key={p.id} type="button" aria-pressed={seleccion === p.id} onClick={() => setSeleccion(p.id)}>
            {p.nombre}
          </button>
        ))}
        <button type="button" aria-pressed={seleccion === NUEVO} onClick={() => setSeleccion(NUEVO)}>
          Nuevo proveedor
        </button>
      </nav>

      <div className="proveedores__detalle">
        {elegido && (
          <PanelProveedor
            key={elegido.id}
            servicio={servicio}
            proveedor={elegido}
            visitas={datos.visitas}
            pedidos={datos.pedidos}
            retirosActivos={retirosActivos}
            stockActivo={stockActivo}
            alCambiar={() => void cargar()}
          />
        )}
        {seleccion === NUEVO && (
          <>
            <h2>Nuevo proveedor</h2>
            <FormularioProveedor
              servicio={servicio}
              alGuardar={(id) => {
                setSeleccion(id)
                void cargar()
              }}
            />
          </>
        )}
      </div>
    </section>
  )
}

interface PropsPanelProveedor {
  servicio: ServicioProveedores
  proveedor: Proveedor
  visitas: Visita[]
  pedidos: PedidoProveedor[]
  retirosActivos: boolean
  stockActivo: boolean
  alCambiar(): void
}

/** Lo que se anota de un proveedor. Keyed por id en la pantalla: cambiar de proveedor arranca limpio. */
function PanelProveedor({ servicio, proveedor, visitas, pedidos, retirosActivos, stockActivo, alCambiar }: PropsPanelProveedor) {
  return (
    <>
      <h2>{proveedor.nombre}</h2>
      <h3>Ficha</h3>
      <FormularioProveedor servicio={servicio} inicial={proveedor} alGuardar={alCambiar} />
      <h3>Cuándo viene</h3>
      <SeccionVisitas
        servicio={servicio}
        proveedorId={proveedor.id}
        visitas={visitas.filter((v) => v.proveedor_id === proveedor.id)}
        alCambiar={alCambiar}
      />
      <h3>Qué pedirle</h3>
      <SeccionPedido
        servicio={servicio}
        proveedorId={proveedor.id}
        pedidos={pedidos.filter((p) => p.proveedor_id === proveedor.id)}
        stockActivo={stockActivo}
        alCambiar={alCambiar}
      />
      <h3>Retiros de caja</h3>
      <SeccionRetiros servicio={servicio} proveedorId={proveedor.id} retirosActivos={retirosActivos} />
    </>
  )
}

interface PropsFormularioProveedor {
  servicio: Pick<ServicioProveedores, 'guardarProveedor'>
  /** Sin ficha: alta de un proveedor nuevo. */
  inicial?: Proveedor
  alGuardar(id: string): void
}

function FormularioProveedor({ servicio, inicial, alGuardar }: PropsFormularioProveedor) {
  const [nombre, setNombre] = useState(inicial?.nombre ?? '')
  const [contacto, setContacto] = useState(inicial?.contacto ?? '')
  const [notas, setNotas] = useState(inicial?.notas ?? '')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enCurso = useRef(false)
  // La alta lleva id propio: un reintento con los mismos datos no crea otro proveedor.
  const intento = useRef<Intento | null>(null)

  async function guardar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const datos: DatosProveedor = {
      nombre: nombre.trim(),
      contacto: contacto.trim() || null,
      notas: notas.trim() || null,
    }
    if (datos.nombre === '') {
      setError('Escribí el nombre del proveedor.')
      setAviso(null)
      return
    }
    const actual = intentoDe(intento.current, JSON.stringify(datos))
    intento.current = actual
    enCurso.current = true
    setEnviando(true)
    setError(null)
    setAviso(null)
    try {
      const guardado = await servicio.guardarProveedor(inicial?.id ?? actual.id, datos)
      intento.current = null
      if (inicial) setAviso('Ficha guardada.')
      alGuardar(guardado.id)
    } catch (err) {
      setError(mensajeProveedores(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  return (
    <form
      className="proveedores__formulario"
      aria-label={inicial ? 'Ficha del proveedor' : 'Alta de proveedor'}
      onSubmit={(e) => void guardar(e)}
    >
      <label>
        Nombre
        <input value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} />
      </label>
      <label>
        Contacto (opcional)
        <input value={contacto} maxLength={80} onChange={(e) => setContacto(e.target.value)} />
      </label>
      <label>
        Notas (opcional)
        <textarea value={notas} maxLength={200} rows={3} onChange={(e) => setNotas(e.target.value)} />
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
      {/* aria-disabled y no disabled: un botón con foco que pasa a disabled deja el foco en <body>. */}
      <button type="submit" aria-disabled={enviando}>
        {inicial ? 'Guardar ficha' : 'Dar de alta'}
      </button>
    </form>
  )
}

interface PropsSeccionVisitas {
  servicio: Pick<ServicioProveedores, 'registrarVisita' | 'marcarVisita' | 'quitarVisita'>
  proveedorId: string
  visitas: Visita[]
  alCambiar(): void
}

/** Cuándo viene: una visita prevista se marca como llegó o no vino, o se quita. */
function SeccionVisitas({ servicio, proveedorId, visitas, alCambiar }: PropsSeccionVisitas) {
  const hoy = hoyEnElKiosco()
  const [fecha, setFecha] = useState(hoy)
  const [nota, setNota] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enCurso = useRef(false)
  const intento = useRef<Intento | null>(null)

  const previstas = visitas.filter((v) => v.estado === 'prevista').sort((a, b) => a.fecha.localeCompare(b.fecha))
  const anteriores = visitas.filter((v) => v.estado !== 'prevista').sort((a, b) => b.fecha.localeCompare(a.fecha))

  async function anotar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    if (fecha === '') {
      setError('Elegí el día en que viene.')
      return
    }
    const notaLimpia = nota.trim()
    const actual = intentoDe(intento.current, JSON.stringify([fecha, notaLimpia]))
    intento.current = actual
    enCurso.current = true
    setEnviando(true)
    setError(null)
    try {
      await servicio.registrarVisita(actual.id, proveedorId, fecha, notaLimpia || null)
      intento.current = null
      setNota('')
      alCambiar()
    } catch (err) {
      setError(mensajeProveedores(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  async function operar(operacion: () => Promise<void>) {
    setError(await errorDe(operacion))
    alCambiar()
  }

  return (
    <>
      <form className="visita-proveedor" aria-label="Anotar visita" onSubmit={(e) => void anotar(e)}>
        <label>
          Día que viene
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label>
          Nota (opcional)
          <input value={nota} maxLength={120} onChange={(e) => setNota(e.target.value)} />
        </label>
        {error && (
          <p role="alert" className="aviso aviso--error">
            {error}
          </p>
        )}
        <button type="submit" aria-disabled={enviando}>
          Anotar visita
        </button>
      </form>

      {previstas.length === 0 ? (
        <p>No hay visitas previstas.</p>
      ) : (
        <table aria-label="Visitas previstas">
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Nota</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {previstas.map((v) => (
              <tr key={v.id}>
                <td>
                  {fechaCorta(v.fecha)}
                  {v.fecha < hoy && ' (ya pasó)'}
                </td>
                <td>{v.nota || '-'}</td>
                <td>
                  <button
                    type="button"
                    aria-label={`Llegó, visita del ${fechaCorta(v.fecha)}`}
                    onClick={() => void operar(() => servicio.marcarVisita(v.id, 'llego'))}
                  >
                    Llegó
                  </button>{' '}
                  <button
                    type="button"
                    aria-label={`No vino, visita del ${fechaCorta(v.fecha)}`}
                    onClick={() => void operar(() => servicio.marcarVisita(v.id, 'no_vino'))}
                  >
                    No vino
                  </button>{' '}
                  <button
                    type="button"
                    aria-label={`Quitar visita del ${fechaCorta(v.fecha)}`}
                    onClick={() => void operar(() => servicio.quitarVisita(v.id))}
                  >
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {anteriores.length > 0 && (
        <table aria-label="Visitas anteriores">
          <thead>
            <tr>
              <th scope="col">Día</th>
              <th scope="col">Estado</th>
              <th scope="col">Nota</th>
            </tr>
          </thead>
          <tbody>
            {anteriores.map((v) => (
              <tr key={v.id}>
                <td>{fechaCorta(v.fecha)}</td>
                <td>{ETIQUETA_ESTADO[v.estado]}</td>
                <td>{v.nota || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  )
}

interface PropsSeccionPedido {
  servicio: Pick<ServicioProveedores, 'agregarPedido' | 'marcarPedido' | 'quitarPedido' | 'agregarFaltantes'>
  proveedorId: string
  pedidos: PedidoProveedor[]
  stockActivo: boolean
  alCambiar(): void
}

/** Qué pedirle: renglones sueltos y, con el módulo stock, los faltantes que tiene este proveedor en Precios. */
function SeccionPedido({ servicio, proveedorId, pedidos, stockActivo, alCambiar }: PropsSeccionPedido) {
  const [descripcion, setDescripcion] = useState('')
  const [sumando, setSumando] = useState(false)
  const enSuma = useRef(false)
  const [cantidad, setCantidad] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enCurso = useRef(false)
  const intento = useRef<Intento | null>(null)

  async function agregar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const desc = descripcion.trim()
    if (desc === '') {
      setError('Escribí qué le vas a pedir.')
      setAviso(null)
      return
    }
    const cant = cantidad.trim() || null
    const actual = intentoDe(intento.current, JSON.stringify([desc, cant]))
    intento.current = actual
    enCurso.current = true
    setEnviando(true)
    setError(null)
    setAviso(null)
    try {
      await servicio.agregarPedido(actual.id, proveedorId, desc, cant)
      intento.current = null
      setDescripcion('')
      setCantidad('')
      alCambiar()
    } catch (err) {
      setError(mensajeProveedores(err))
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  async function sumarFaltantes() {
    if (enSuma.current) return
    enSuma.current = true
    setSumando(true)
    setError(null)
    setAviso(null)
    try {
      const { cantidad: sumados } = await servicio.agregarFaltantes(proveedorId)
      setAviso(sumados === 0 ? 'No hay faltantes de este proveedor para sumar.' : `Se sumaron ${sumados} productos al pedido.`)
    } catch (err) {
      setError(mensajeProveedores(err))
    } finally {
      enSuma.current = false
      setSumando(false)
      alCambiar()
    }
  }

  async function operar(operacion: () => Promise<void>) {
    setError(await errorDe(operacion))
    alCambiar()
  }

  const ordenados =[...pedidos.filter((p) => !p.hecho), ...pedidos.filter((p) => p.hecho)]

  return (
    <>
      <form className="pedido-proveedor" aria-label="Agregar al pedido" onSubmit={(e) => void agregar(e)}>
        <label>
          Qué pedirle
          <input value={descripcion} maxLength={80} onChange={(e) => setDescripcion(e.target.value)} />
        </label>
        <label>
          Cantidad (opcional)
          <input value={cantidad} maxLength={30} onChange={(e) => setCantidad(e.target.value)} />
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
          Agregar al pedido
        </button>
      </form>

      {stockActivo && (
        <>
          <button type="button" aria-disabled={sumando} onClick={() => void sumarFaltantes()}>
            Sumar faltantes de este proveedor
          </button>
          <p className="ayuda">Suma los productos en mínimo o sin stock que Precios tiene con este proveedor.</p>
        </>
      )}

      {ordenados.length === 0 ? (
        <p>No hay nada anotado para pedirle.</p>
      ) : (
        <>
          <p className="ayuda">Tildá lo que ya pediste o te llegó.</p>
          <ul className="pedido-proveedor__lista" aria-label="Qué pedirle">
            {ordenados.map((p) => (
              <li key={p.id} className={p.hecho ? 'pedido-proveedor--hecho' : undefined}>
                <label>
                  <input
                    type="checkbox"
                    checked={p.hecho}
                    onChange={(e) => void operar(() => servicio.marcarPedido(p.id, e.target.checked))}
                  />{' '}
                  {p.descripcion}
                  {p.cantidad && ` (${p.cantidad})`}
                </label>
                <button type="button" aria-label={`Quitar ${p.descripcion}`} onClick={() => void operar(() => servicio.quitarPedido(p.id))}>
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

interface PropsSeccionRetiros {
  servicio: Pick<ServicioProveedores, 'leerRetiros' | 'registrarRetiro'>
  proveedorId: string
  retirosActivos: boolean
}

/** Plata que salió de la caja para pagarle a este proveedor. Cuenta en el arqueo del turno. */
function SeccionRetiros({ servicio, proveedorId, retirosActivos }: PropsSeccionRetiros) {
  const [retiros, setRetiros] = useState<RetiroProveedor[] | null>(null)
  const [falla, setFalla] = useState(false)
  const [importe, setImporte] = useState('')
  const [detalle, setDetalle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const enCurso = useRef(false)
  const intento = useRef<Intento | null>(null)

  const cargarRetiros = useCallback(async () => {
    try {
      setRetiros(await servicio.leerRetiros(proveedorId))
      setFalla(false)
    } catch {
      setFalla(true)
    }
  }, [servicio, proveedorId])

  useEffect(() => {
    if (retirosActivos) void cargarRetiros()
  }, [retirosActivos, cargarRetiros])

  async function registrar(e: FormEvent) {
    e.preventDefault()
    if (enCurso.current) return
    const pesos = parsearPesos(importe)
    if (pesos === null) {
      setError(MENSAJE_FORMATO)
      setAviso(null)
      return
    }
    // Vacío da 0 en parsearPesos: el mismo aviso que un cero.
    if (pesos === 0) {
      setError(MENSAJES_RETIRO.importe_invalido)
      setAviso(null)
      return
    }
    const detalleLimpio = detalle.trim()
    if (detalleLimpio.length > 120) {
      setError(MENSAJES_RETIRO.texto_invalido)
      setAviso(null)
      return
    }
    const actual = intentoDe(intento.current, JSON.stringify([pesos, detalleLimpio]))
    intento.current = actual
    enCurso.current = true
    setEnviando(true)
    setError(null)
    setAviso(null)
    try {
      await servicio.registrarRetiro(actual.id, proveedorId, pesos, detalleLimpio || null)
      intento.current = null
      setImporte('')
      setDetalle('')
      setAviso('Retiro registrado. Ya cuenta en el arqueo del turno.')
      await cargarRetiros()
    } catch (err) {
      setError(mensajeRetiro(err))
      // El retiro pudo grabarse aunque la respuesta se perdió: la lista muestra lo que hay de verdad.
      void cargarRetiros()
    } finally {
      enCurso.current = false
      setEnviando(false)
    }
  }

  if (!retirosActivos) {
    return <p className="aviso">Para anotar retiros de caja para este proveedor, activá el módulo de movimientos de caja.</p>
  }

  const total = (retiros ?? []).reduce((suma, r) => suma + r.importe, 0)

  return (
    <>
      <form className="retiro-proveedor" aria-label="Registrar retiro" onSubmit={(e) => void registrar(e)}>
        <label>
          Importe
          <input value={importe} inputMode="numeric" onChange={(e) => setImporte(e.target.value)} />
        </label>
        <label>
          Detalle (opcional)
          <input value={detalle} maxLength={120} onChange={(e) => setDetalle(e.target.value)} />
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
          Registrar retiro
        </button>
      </form>

      {falla ? (
        <p role="alert" className="aviso aviso--error">
          No se pudieron leer los retiros. Revisá la conexión.{' '}
          <button type="button" onClick={() => void cargarRetiros()}>
            Reintentar
          </button>
        </p>
      ) : retiros === null ? (
        <p>Cargando…</p>
      ) : retiros.length === 0 ? (
        <p>No hay retiros para este proveedor.</p>
      ) : (
        <>
          <table aria-label="Retiros para este proveedor">
            <thead>
              <tr>
                <th scope="col">Fecha y hora</th>
                <th scope="col">Detalle</th>
                <th scope="col">Importe</th>
              </tr>
            </thead>
            <tbody>
              {retiros.map((r) => (
                <tr key={r.id}>
                  <td>{FECHA_HORA.format(new Date(r.fecha))}</td>
                  <td>{r.detalle || '-'}</td>
                  <td>{formatearPesos(r.importe)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>Total retirado: {formatearPesos(total)}</p>
        </>
      )}
      <p className="ayuda">Las cajas ven sólo los retiros de hoy.</p>
    </>
  )
}
