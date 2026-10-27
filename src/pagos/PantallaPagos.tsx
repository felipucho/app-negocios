import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { AVISO_ESCANEO_EN_COBRO, AVISO_ESCANEO_EN_COMPROBANTE, type SesionCobro } from '../caja/PantallaCaja'
import { detectarEscaneo, enRacha, esTeclaDeRacha, registrarPulsacion, type PulsacionEnCampo } from '../escaner/detector'
import { UMBRALES, type Umbrales } from '../escaner/umbrales'
import { formatearPesos, parsearPesos } from '../lib/plata'
import { MEDIOS, NOMBRE_MEDIO, type LineaCarrito, type Medio } from '../tipos'
import { calcularCobro, pagosAEnviar, type ErrorCobro, type ImportesPorMedio, type PagoAEnviar } from '../venta/cobro'
import {
  claveContenido,
  confirmarVenta,
  type DiferenciaPrecio,
  type ErrorConfirmar,
  type LlamarRpc,
  type PedidoVenta,
  type VentaConfirmada,
} from '../venta/confirmar'
import type { ClienteCaja, ServicioClientes } from './clientes'
import { Comprobante } from './Comprobante'
import { SelectorCliente } from './SelectorCliente'

const TEXTO_COBRO: Record<ErrorCobro, string> = {
  importe_invalido: 'Hay un importe mal escrito: sólo pesos enteros, sin centavos.',
  venta_vacia: 'La venta no tiene productos.',
  no_suma_total: 'Los pagos no suman el total.',
  efectivo_insuficiente: 'Lo entregado no alcanza para la parte en efectivo.',
  entrega_sin_efectivo: 'Hay entrega en efectivo pero ninguna parte se paga en efectivo.',
  fiado_deshabilitado: 'El fiado no está activo en este kiosco.',
  fiado_sin_cliente: 'Elegí el cliente del fiado.',
}

const TEXTO_RECHAZO: Record<ErrorConfirmar, string> = {
  ...TEXTO_COBRO,
  sin_cuenta: 'Esta cuenta no pertenece al kiosco. Volvé a iniciar sesión.',
  dispositivo_desconocido: 'Esta PC no está registrada en el kiosco. Volvé a iniciar sesión.',
  pedido_invalido: 'La venta llegó incompleta. Probá de nuevo.',
  venta_id_reusado: 'La venta cambió después de un intento. Tocá Confirmar de nuevo.',
  sin_turno: 'No hay turno abierto en esta PC.',
  producto_no_disponible: 'Un producto ya no está disponible. Volvé a la venta y quitalo.',
  linea_invalida: 'Hay una cantidad inválida en la venta.',
  pago_invalido: 'Hay un medio de pago repetido o inválido.',
  total_distinto: 'El total no coincide con el de la base. Volvé a la venta y confirmá de nuevo.',
}

const SIN_IMPORTES: Record<Medio, string> = { efectivo: '', transferencia: '', tarjeta: '', fiado: '' }

/** Tecla con el campo que la recibió y el texto de ese campo antes de tipearla. */
type Tecla = PulsacionEnCampo

/** details de producto_no_disponible: JSON con los productoId que ya no se venden. Sin nombres, el texto genérico. */
function textoNoDisponibles(detalle: string | null, lineas: readonly LineaCarrito[]): string {
  const generico = TEXTO_RECHAZO.producto_no_disponible
  let ids: unknown
  try {
    ids = JSON.parse(detalle ?? '')
  } catch {
    return generico
  }
  const noVendidos: unknown[] = Array.isArray(ids) ? ids : []
  const nombres = lineas.filter((l) => noVendidos.includes(l.productoId)).map((l) => l.nombre)
  if (nombres.length === 0) return generico
  const uno = nombres.length === 1
  return `Ya no ${uno ? 'está' : 'están'} a la venta: ${nombres.join(', ')}. Volvé a la venta y quitalo${uno ? '' : 's'}.`
}

interface PropsCampoImporte {
  etiqueta: string
  /** name del input: un escaneo que cae en el importe se deshace por este nombre. */
  nombre: string
  valor: string
  autoFocus?: boolean
  ref?: Ref<HTMLInputElement>
  alCambiar(valor: string): void
  alEnfocar(campo: HTMLInputElement): void
}

/** Importe en pesos enteros. Enter no confirma desde acá: el cobro no es un formulario que lo envíe. */
function CampoImporte({ etiqueta, nombre, valor, autoFocus, ref, alCambiar, alEnfocar }: PropsCampoImporte) {
  return (
    <label className="importe">
      <span>{etiqueta}</span>
      <input
        ref={ref}
        name={nombre}
        value={valor}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        onFocus={(e) => alEnfocar(e.currentTarget)}
        onChange={(e) => alCambiar(e.target.value)}
      />
    </label>
  )
}

export interface PropsPantallaPagos {
  sesion: SesionCobro
  dispositivoId: string
  /** modulo_activo('fiado'), leído por la tarea 17 con fiadoActivo. */
  fiadoHabilitado: boolean
  clientes: ServicioClientes
  /** (funcion, args) => supabase.rpc(funcion, args) */
  rpc: LlamarRpc
  umbrales?: Umbrales
  ahora?: () => number
  /** Tras precios_distintos o producto_no_disponible: pone al día la caché del catálogo ya, no en la próxima revisión; si no, la venta siguiente repite el rechazo. */
  alCambiarPrecios?: () => void
}

interface DatosComprobante {
  venta: VentaConfirmada
  lineas: LineaCarrito[]
  pagos: PagoAEnviar[]
}

export function PantallaPagos({
  sesion,
  dispositivoId,
  fiadoHabilitado,
  clientes,
  rpc,
  umbrales = UMBRALES,
  ahora,
  alCambiarPrecios,
}: PropsPantallaPagos) {
  const [textos, setTextos] = useState<Record<Medio, string>>(() => ({ ...SIN_IMPORTES, efectivo: String(sesion.total) }))
  const [entrega, setEntrega] = useState('')
  const [cliente, setCliente] = useState<ClienteCaja | null>(null)
  const [filtroCliente, setFiltroCliente] = useState('')
  const [datosAlta, setDatosAlta] = useState({ nombre: '', telefono: '' })
  const campoFiado = useRef<HTMLInputElement>(null)
  const campoPrimero = useRef<HTMLInputElement>(null)
  const [confirmando, setConfirmando] = useState(false)
  const enCurso = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [diferencias, setDiferencias] = useState<DiferenciaPrecio[]>([])
  const [comprobante, setComprobante] = useState<DatosComprobante | null>(null)
  const totalVisto = useRef(sesion.total)
  const pulsaciones = useRef<Tecla[]>([])

  // Si el total cambia (precios actualizados tras un rechazo), los importes se vuelven a proponer.
  useEffect(() => {
    if (totalVisto.current === sesion.total) return
    totalVisto.current = sesion.total
    setTextos({ ...SIN_IMPORTES, efectivo: String(sesion.total) })
    setEntrega('')
  }, [sesion.total])

  // El jefe apagó el fiado con un importe fiado cargado: el campo desaparece, así que se vacía y se avisa.
  const [fiadoApagado, setFiadoApagado] = useState(false)
  useEffect(() => {
    if (fiadoHabilitado || textos.fiado.trim() === '') return
    setTextos((t) => ({ ...t, fiado: '' }))
    setCliente(null)
    setFiadoApagado(true)
  }, [fiadoHabilitado, textos.fiado])

  // El buscador y el alta viven acá para que un escaneo los deshaga; al ocultarse el selector arrancan vacíos.
  const verSelector = fiadoHabilitado && textos.fiado.trim() !== ''
  useEffect(() => {
    if (verSelector) return
    setFiltroCliente('')
    setDatosAlta({ nombre: '', telefono: '' })
  }, [verSelector])

  const medios = MEDIOS.filter((m) => m !== 'fiado' || fiadoHabilitado)
  const leer = (texto: string) => parsearPesos(texto) ?? Number.NaN
  const importes: ImportesPorMedio = {
    efectivo: leer(textos.efectivo),
    transferencia: leer(textos.transferencia),
    tarjeta: leer(textos.tarjeta),
    fiado: fiadoHabilitado ? leer(textos.fiado) : 0,
  }
  const hayEfectivo = importes.efectivo > 0
  const entregado = hayEfectivo && entrega.trim() !== '' ? leer(entrega) : null
  const cobro = calcularCobro({
    total: sesion.total,
    importes,
    efectivoEntregado: entregado,
    clienteFiadoId: cliente?.id ?? null,
    fiadoHabilitado,
  })
  const problemas = cobro.errores.map((e) =>
    e === 'no_suma_total'
      ? cobro.falta > 0
        ? `Faltan ${formatearPesos(cobro.falta)}.`
        : `Sobran ${formatearPesos(-cobro.falta)}.`
      : TEXTO_COBRO[e],
  )

  /** Un medio vacío, al enfocarlo, propone el saldo restante seleccionado: tipear un importe lo reemplaza. */
  function proponer(medio: Medio, campo: HTMLInputElement) {
    if (textos[medio].trim() === '' && cobro.falta > 0) {
      const saldo = String(cobro.falta)
      // Primero en el DOM: React ve el mismo valor, no lo reescribe y la selección queda.
      campo.value = saldo
      campo.select()
      setTextos((t) => ({ ...t, [medio]: saldo }))
    }
  }

  const avisarEscaneo = () => sesion.avisar(comprobante ? AVISO_ESCANEO_EN_COMPROBANTE : AVISO_ESCANEO_EN_COBRO)

  /** Un escaneo deshace lo que su racha tipeó en cada importe y en el buscador de clientes: vuelve al texto de antes, por el name del campo. */
  function deshacerEnImportes(racha: readonly Tecla[]) {
    const antes = new Map<string, string>()
    for (const p of racha) {
      if (!antes.has(p.campo)) antes.set(p.campo, p.antes)
    }
    for (const [campo, valor] of antes) {
      if (campo === 'entrega') setEntrega(valor)
      else if (campo === 'buscarCliente') setFiltroCliente(valor)
      else if (campo === 'nombreCliente' || campo === 'telefonoCliente') {
        setDatosAlta((d) => ({ ...d, [campo === 'nombreCliente' ? 'nombre' : 'telefono']: valor }))
      }
      else if (Object.hasOwn(textos, campo)) {
        setFiadoApagado(false)
        setTextos((t) => ({ ...t, [campo]: valor }))
      }
    }
  }

  /**
   * Guardia de todo el cobro, comprobante incluido: el foco puede estar en cualquier control, así que un escaneo
   * no confirma, no elige cliente y no se tipea en un importe. Un Enter a mano sigue activando el control enfocado.
   */
  function alTeclaCobro(e: KeyboardEvent<HTMLDivElement>) {
    const t = ahora ? ahora() : e.timeStamp
    if (e.key === 'Enter') {
      const escaneo = detectarEscaneo(pulsaciones.current, t, umbrales)
      const racha = escaneo ? pulsaciones.current.slice(escaneo.desde) : []
      pulsaciones.current = []
      if (!escaneo) return
      e.preventDefault()
      deshacerEnImportes(racha)
      avisarEscaneo()
      return
    }
    // Dentro de una racha, el espacio de un código no activa el botón enfocado: el clic salta al soltar la tecla.
    if (e.key === ' ' && e.target instanceof HTMLButtonElement && enRacha(pulsaciones.current, t, umbrales)) {
      e.preventDefault()
    }
    if (esTeclaDeRacha(e)) {
      const campo = e.target instanceof HTMLInputElement ? e.target : null
      pulsaciones.current = registrarPulsacion(pulsaciones.current, e.key, t, campo)
    }
  }

  async function confirmar() {
    if (enCurso.current || !cobro.valido) return
    enCurso.current = true
    setConfirmando(true)
    setError(null)
    setDiferencias([])
    const pedido: PedidoVenta = {
      dispositivoId,
      lineas: sesion.lineas,
      pagos: pagosAEnviar(importes, cliente?.id ?? null),
      total: sesion.total,
      efectivoEntregado: entregado,
    }
    // El id se ata al contenido: mismo contenido, mismo id (reintento); otro contenido, id nuevo.
    const ventaId = sesion.ids.idPara(claveContenido(pedido))
    const r = await confirmarVenta(rpc, ventaId, pedido)
    enCurso.current = false
    setConfirmando(false)
    // Si no se confirmó, el foco vuelve a un importe: ahí un escaneo avisa; en Confirmar, su Enter reintentaría.
    if (r.tipo !== 'confirmada') campoPrimero.current?.focus()

    switch (r.tipo) {
      case 'confirmada':
        sesion.ids.reiniciar()
        setComprobante({ venta: r.venta, lineas: pedido.lineas, pagos: pedido.pagos })
        return
      case 'precios_distintos':
        setDiferencias(r.diferencias)
        sesion.actualizarPrecios(Object.fromEntries(r.diferencias.map((d) => [d.productoId, d.precioActual])))
        alCambiarPrecios?.()
        setError('Cambiaron precios en el catálogo. Revisá el total nuevo y confirmá de nuevo.')
        return
      case 'rechazada':
        if (r.codigo === 'sin_turno') {
          sesion.perderTurno()
          return
        }
        if (r.codigo === 'producto_no_disponible') {
          alCambiarPrecios?.()
          setError(textoNoDisponibles(r.detalle, sesion.lineas))
          return
        }
        if (r.codigo === 'venta_id_reusado') sesion.ids.reiniciar()
        setError(TEXTO_RECHAZO[r.codigo])
        return
      case 'error_red':
        setError(
          'No se pudo confirmar. Revisá la conexión y tocá Confirmar de nuevo sin cambiar la venta ni los pagos: si la venta ya se había grabado, no se duplica. Si tenés que cambiar la venta o los pagos, antes revisá las ventas de hoy: puede que ya esté grabada.',
        )
        return
      case 'sesion_vencida':
        setError('Se venció la sesión y la venta no se grabó. Cerrá la sesión y volvé a entrar.')
        return
      case 'desconocido':
        console.error('confirmar_venta: error inesperado', r.mensaje) // el detalle no va a la pantalla
        setError('Error inesperado al confirmar. Probá de nuevo.')
    }
  }

  return (
    <div onKeyDown={alTeclaCobro}>
      {comprobante ? (
        <Comprobante
          venta={comprobante.venta}
          lineas={comprobante.lineas}
          pagos={comprobante.pagos}
          alNuevaVenta={sesion.nuevaVenta}
          alCobrarDeNuevo={sesion.volver}
        />
      ) : (
        <section className="pagos" aria-label="Cobro">
          <h2>Total {formatearPesos(sesion.total)}</h2>
          {medios.map((m, i) => (
            <CampoImporte
              key={m}
              ref={m === 'fiado' ? campoFiado : i === 0 ? campoPrimero : undefined}
              etiqueta={NOMBRE_MEDIO[m]}
              nombre={m}
              valor={textos[m]}
              autoFocus={i === 0}
              alCambiar={(v) => {
                setFiadoApagado(false)
                setTextos((t) => ({ ...t, [m]: v }))
              }}
              alEnfocar={(campo) => proponer(m, campo)}
            />
          ))}
          {hayEfectivo && (
            <CampoImporte
              etiqueta="Entrega en efectivo"
              nombre="entrega"
              valor={entrega}
              alCambiar={setEntrega}
              alEnfocar={() => undefined}
            />
          )}
          <p className="vuelto">
            Vuelto: <strong>{formatearPesos(cobro.vuelto)}</strong>
          </p>
          {fiadoApagado && (
            <p role="alert" className="aviso aviso--error">
              Se apagó el fiado mientras cobrabas: el importe fiado ya no cuenta. Cobrá el resto con otro medio.
            </p>
          )}
          {/* Montado mientras haya texto: editar el importe no relee la lista ni borra la búsqueda. */}
          {verSelector && (
            <SelectorCliente
              servicio={clientes}
              elegido={cliente}
              alElegir={setCliente}
              filtro={filtroCliente}
              alCambiarFiltro={setFiltroCliente}
              datosAlta={datosAlta}
              alCambiarDatosAlta={(campo, valor) => setDatosAlta((d) => ({ ...d, [campo]: valor }))}
              // Al importe del fiado y no a Confirmar: ahí un escaneo avisa; en Confirmar, su Enter cerraría la venta.
              devolverFoco={() => campoFiado.current?.focus()}
            />
          )}
          {problemas.length > 0 && (
            <ul className="problemas" aria-label="Falta para confirmar">
              {problemas.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}
          {diferencias.length > 0 && (
            <ul aria-label="Precios que cambiaron">
              {diferencias.map((d) => (
                <li key={d.productoId}>
                  {d.nombre}: {formatearPesos(d.precioVisto)} → {formatearPesos(d.precioActual)}
                </li>
              ))}
            </ul>
          )}
          {error && (
            <p role="alert" className="aviso aviso--error">
              {error}
            </p>
          )}
          {/* aria-disabled y no disabled: un botón con foco que pasa a disabled deja el foco en <body> y el
              escaneo siguiente se pierde sin aviso (decisión 13). confirmar() y enCurso frenan el clic.
              El clic tampoco le saca el foco al importe: un escaneo mientras confirma avisa. */}
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => void confirmar()}
            aria-disabled={confirmando || !cobro.valido}
          >
            {confirmando ? 'Confirmando…' : 'Confirmar'}
          </button>
          <button
            type="button"
            onClick={() => {
              if (!enCurso.current) sesion.volver()
            }}
            aria-disabled={confirmando}
          >
            Volver a la venta
          </button>
        </section>
      )}
    </div>
  )
}
