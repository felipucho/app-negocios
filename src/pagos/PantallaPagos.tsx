import { useEffect, useRef, useState, type KeyboardEvent, type Ref } from 'react'
import { AVISO_ESCANEO_EN_COBRO, type SesionCobro } from '../caja/PantallaCaja'
import { detectarEscaneo, type Pulsacion } from '../escaner/detector'
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

interface PropsCampoImporte {
  etiqueta: string
  valor: string
  autoFocus?: boolean
  ref?: Ref<HTMLInputElement>
  umbrales: Umbrales
  ahora?: () => number
  alCambiar(valor: string): void
  alEnfocar(campo: HTMLInputElement): void
  alEscaneo(): void
}

/**
 * Importe en pesos enteros. Si llega un escaneo (el foco está en el cobro), el importe vuelve a lo
 * que tenía antes de la racha y se avisa. Enter nunca confirma desde un importe.
 */
function CampoImporte({ etiqueta, valor, autoFocus, ref, umbrales, ahora, alCambiar, alEnfocar, alEscaneo }: PropsCampoImporte) {
  const pulsaciones = useRef<(Pulsacion & { valorAntes: string })[]>([])

  function alTecla(e: KeyboardEvent<HTMLInputElement>) {
    // Sin reloj inyectado, la hora del evento (como CampoEscaneo): un hilo lento no amontona teclas.
    const t = ahora ? ahora() : e.timeStamp
    if (e.key === 'Enter') {
      e.preventDefault()
      const escaneo = detectarEscaneo(pulsaciones.current, t, umbrales)
      if (escaneo) {
        alCambiar(pulsaciones.current[escaneo.desde].valorAntes)
        alEscaneo()
      }
      pulsaciones.current = []
      return
    }
    if (e.key.length === 1) {
      pulsaciones.current = [
        ...pulsaciones.current,
        { tecla: e.key, t, valorAntes: e.currentTarget.value },
      ].slice(-64)
    }
  }

  return (
    <label className="importe">
      <span>{etiqueta}</span>
      <input
        ref={ref}
        value={valor}
        inputMode="numeric"
        autoComplete="off"
        autoFocus={autoFocus}
        onFocus={(e) => alEnfocar(e.currentTarget)}
        onChange={(e) => alCambiar(e.target.value)}
        onKeyDown={alTecla}
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
}: PropsPantallaPagos) {
  const [textos, setTextos] = useState<Record<Medio, string>>(() => ({ ...SIN_IMPORTES, efectivo: String(sesion.total) }))
  const [entrega, setEntrega] = useState('')
  const [cliente, setCliente] = useState<ClienteCaja | null>(null)
  const campoFiado = useRef<HTMLInputElement>(null)
  const [confirmando, setConfirmando] = useState(false)
  const enCurso = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [diferencias, setDiferencias] = useState<DiferenciaPrecio[]>([])
  const [comprobante, setComprobante] = useState<DatosComprobante | null>(null)
  const totalVisto = useRef(sesion.total)

  // Si el total cambia (precios actualizados tras un rechazo), los importes se vuelven a proponer.
  useEffect(() => {
    if (totalVisto.current === sesion.total) return
    totalVisto.current = sesion.total
    setTextos({ ...SIN_IMPORTES, efectivo: String(sesion.total) })
    setEntrega('')
  }, [sesion.total])

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

  const avisarEscaneo = () => sesion.avisar(AVISO_ESCANEO_EN_COBRO)

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

    switch (r.tipo) {
      case 'confirmada':
        sesion.ids.reiniciar()
        setComprobante({ venta: r.venta, lineas: pedido.lineas, pagos: pedido.pagos })
        return
      case 'precios_distintos':
        setDiferencias(r.diferencias)
        sesion.actualizarPrecios(Object.fromEntries(r.diferencias.map((d) => [d.productoId, d.precioActual])))
        setError('Cambiaron precios en el catálogo. Revisá el total nuevo y confirmá de nuevo.')
        return
      case 'rechazada':
        if (r.codigo === 'sin_turno') {
          sesion.perderTurno()
          return
        }
        if (r.codigo === 'venta_id_reusado') sesion.ids.reiniciar()
        setError(TEXTO_RECHAZO[r.codigo])
        return
      case 'error_red':
        setError(
          'No se pudo confirmar. Revisá la conexión y tocá Confirmar de nuevo sin cambiar los pagos: si la venta ya se había grabado, no se duplica. Si tenés que cambiar los pagos, antes revisá las ventas de hoy: puede que ya esté grabada.',
        )
        return
      case 'desconocido':
        console.error('confirmar_venta: error inesperado', r.mensaje) // el detalle no va a la pantalla
        setError('Error inesperado al confirmar. Probá de nuevo.')
    }
  }

  if (comprobante) {
    return (
      <Comprobante
        venta={comprobante.venta}
        lineas={comprobante.lineas}
        pagos={comprobante.pagos}
        alNuevaVenta={sesion.nuevaVenta}
        umbrales={umbrales}
        ahora={ahora}
        alEscaneo={avisarEscaneo}
      />
    )
  }

  return (
    <section className="pagos" aria-label="Cobro">
      <h2>Total {formatearPesos(sesion.total)}</h2>
      {medios.map((m, i) => (
        <CampoImporte
          key={m}
          ref={m === 'fiado' ? campoFiado : undefined}
          etiqueta={NOMBRE_MEDIO[m]}
          valor={textos[m]}
          autoFocus={i === 0}
          umbrales={umbrales}
          ahora={ahora}
          alCambiar={(v) => setTextos((t) => ({ ...t, [m]: v }))}
          alEnfocar={(campo) => proponer(m, campo)}
          alEscaneo={avisarEscaneo}
        />
      ))}
      {hayEfectivo && (
        <CampoImporte
          etiqueta="Entrega en efectivo"
          valor={entrega}
          umbrales={umbrales}
          ahora={ahora}
          alCambiar={setEntrega}
          alEnfocar={() => undefined}
          alEscaneo={avisarEscaneo}
        />
      )}
      <p className="vuelto">
        Vuelto: <strong>{formatearPesos(cobro.vuelto)}</strong>
      </p>
      {/* Montado mientras haya texto: editar el importe no relee la lista ni borra la búsqueda. */}
      {fiadoHabilitado && textos.fiado.trim() !== '' && (
        <SelectorCliente
          servicio={clientes}
          elegido={cliente}
          alElegir={setCliente}
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
      <button type="button" onClick={() => void confirmar()} disabled={confirmando || !cobro.valido}>
        {confirmando ? 'Confirmando…' : 'Confirmar'}
      </button>
      <button type="button" onClick={sesion.volver} disabled={confirmando}>
        Volver a la venta
      </button>
    </section>
  )
}
