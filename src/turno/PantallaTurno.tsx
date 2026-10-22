import { useEffect, useRef, useState } from 'react'
import { FECHA_HORA } from '../lib/fecha'
import { formatearPesos } from '../lib/plata'
import type { CierreTurno, TotalesTurno } from './turno'

interface PropsPedirApertura {
  alAbrir: () => Promise<void>
  leerUltimoCerrado: () => Promise<CierreTurno | null>
}

/**
 * Sin turno abierto la caja no vende (SUPUESTO NUEVO): esta pantalla lo pide. Sin monto inicial.
 * Muestra el último turno cerrado de la PC: si se perdió la respuesta del cierre, sus totales se ven acá.
 */
export function PedirApertura({ alAbrir, leerUltimoCerrado }: PropsPedirApertura) {
  const enCurso = useRef(false)
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [ultimo, setUltimo] = useState<CierreTurno | null>(null)

  useEffect(() => {
    // Sólo informa: si no se puede leer, no se muestra y abrir el turno sigue igual.
    // vigente: una respuesta que llega tarde (otra lectura o pantalla desmontada) no pisa el estado.
    let vigente = true
    leerUltimoCerrado().then(
      (c) => vigente && setUltimo(c),
      (e) => console.warn('último turno cerrado', e),
    )
    return () => {
      vigente = false
    }
  }, [leerUltimoCerrado])

  async function abrir() {
    if (enCurso.current) return
    enCurso.current = true
    setAbriendo(true)
    setError(null)
    try {
      await alAbrir()
    } catch (e) {
      console.error(e)
      // P0001 = rechazo de la base (sin_cuenta, dispositivo_desconocido): reintentar no lo arregla.
      setError((e as { code?: string }).code === 'P0001'
        ? 'Esta PC no está habilitada para abrir turno. Avisá al dueño.'
        : 'No se pudo abrir el turno. Revisá la conexión y probá de nuevo.')
    } finally {
      enCurso.current = false
      setAbriendo(false)
    }
  }

  return (
    <section className="turno">
      <h2>No hay turno abierto en esta PC</h2>
      <p>Para vender, abrí el turno. No hace falta contar el efectivo.</p>
      {/* aria-disabled y no disabled: un botón con foco que pasa a disabled deja el foco en <body>. abrir() frena el doble clic. */}
      <button type="button" onClick={() => void abrir()} aria-disabled={abriendo}>
        {abriendo ? 'Abriendo…' : 'Abrir turno'}
      </button>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {ultimo && (
        <>
          <h3>Último turno cerrado</h3>
          <DetalleCierre cierre={ultimo} />
        </>
      )}
    </section>
  )
}

/**
 * Al abrir, el turno de la PC que la apertura cerró solo: con el nuevo ya abierto, sus totales no se ven en otro lado.
 * Decisión 13: no le saca el foco al campo de escaneo, ni al aparecer ni con "Entendido".
 */
export function AvisoTurnoCerradoSolo({ cierre, alEntender }: { cierre: CierreTurno; alEntender: () => void }) {
  return (
    <section className="aviso">
      <h2>Se cerró solo el turno anterior de esta PC</h2>
      <DetalleCierre cierre={cierre} />
      <p>Se cierra con Entendido o con Esc.</p>
      <button
        type="button"
        tabIndex={-1}
        aria-keyshortcuts="Escape"
        onMouseDown={(e) => e.preventDefault()}
        onClick={alEntender}
      >
        Entendido
      </button>
    </section>
  )
}

function DetalleCierre({ cierre }: { cierre: CierreTurno }) {
  return (
    <>
      <p>
        {FECHA_HORA.format(new Date(cierre.apertura))} – {FECHA_HORA.format(new Date(cierre.cierre))}
      </p>
      <TablaTotales totales={cierre.totales} />
    </>
  )
}

function TablaTotales({ totales: t }: { totales: TotalesTurno }) {
  const filas: [string, number][] = [
    ['Efectivo', t.efectivo],
    ['Transferencia', t.transferencia],
    ['Tarjeta', t.tarjeta],
    ['Total cobrado', t.cobrado],
    ['Fiado (no cobrado)', t.fiado],
  ]
  return (
    <table>
      <tbody>
        {filas.map(([nombre, importe]) => (
          <tr key={nombre}>
            <th scope="row">{nombre}</th>
            <td>{formatearPesos(importe)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

/** Cierre simple (decisión 26): total por medio de pago del turno, sin arqueo. */
export function ResumenCierre({ cierre, alSeguir }: { cierre: CierreTurno; alSeguir: () => void }) {
  return (
    <section className="turno">
      <h2>Turno cerrado</h2>
      <DetalleCierre cierre={cierre} />
      <button type="button" onClick={alSeguir}>
        Listo
      </button>
    </section>
  )
}
