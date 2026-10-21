import { useRef, useState } from 'react'
import { formatearPesos } from '../lib/plata'
import type { CierreTurno } from './turno'

/** Sin turno abierto la caja no vende (SUPUESTO NUEVO): esta pantalla lo pide. Sin monto inicial. */
export function PedirApertura({ alAbrir }: { alAbrir: () => Promise<void> }) {
  const enCurso = useRef(false)
  const [abriendo, setAbriendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
      <button type="button" onClick={() => void abrir()} disabled={abriendo}>
        {abriendo ? 'Abriendo…' : 'Abrir turno'}
      </button>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
    </section>
  )
}

/** Cierre simple (decisión 26): total por medio de pago del turno, sin arqueo. */
export function ResumenCierre({ cierre, alSeguir }: { cierre: CierreTurno; alSeguir: () => void }) {
  const t = cierre.totales
  const filas: [string, number][] = [
    ['Efectivo', t.efectivo],
    ['Transferencia', t.transferencia],
    ['Tarjeta', t.tarjeta],
    ['Total cobrado', t.cobrado],
    ['Fiado (no cobrado)', t.fiado],
  ]
  return (
    <section className="turno">
      <h2>Turno cerrado</h2>
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
      <button type="button" onClick={alSeguir}>
        Listo
      </button>
    </section>
  )
}
