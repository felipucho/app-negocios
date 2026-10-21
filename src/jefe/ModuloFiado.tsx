import { useState } from 'react'
import { mensajeJefe, type ServicioJefe } from './jefe'

export interface PropsModuloFiado {
  /** Estado actual (modulo_activo, leído por la tarea 17). null: no se pudo leer todavía. */
  activo: boolean | null
  servicio: Pick<ServicioJefe, 'cambiarModuloFiado'>
  /** El kiosco actualiza su estado: la pantalla de cobro muestra u oculta el fiado. */
  alCambiar(activo: boolean): void
}

/** Decisión 39: el jefe activa o desactiva el fiado desde la app. La base es la que lo hace cumplir. */
export function ModuloFiado({ activo, servicio, alCambiar }: PropsModuloFiado) {
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function cambiar(nuevo: boolean) {
    if (guardando) return
    setGuardando(true)
    setError(null)
    try {
      alCambiar(await servicio.cambiarModuloFiado(nuevo))
    } catch (e) {
      setError(mensajeJefe(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section className="modulo-fiado">
      <h2>Módulo fiado</h2>
      {activo === null ? (
        <p role="alert" className="aviso aviso--error">
          No se pudo leer el módulo fiado. Revisá la conexión: se vuelve a intentar solo.
        </p>
      ) : (
        <label>
          <input type="checkbox" checked={activo} disabled={guardando} onChange={(e) => void cambiar(e.target.checked)} />
          Fiado activo
        </label>
      )}
      <p>Con el fiado activo, la caja puede cobrar una parte de la venta como fiado y dar de alta clientes.</p>
      <p>
        Con el fiado apagado, la caja no muestra el medio Fiado, y la base rechaza los pagos fiados y las altas de clientes
        aunque alguien los intente por otro lado. Los clientes y las ventas fiadas que ya existen no se borran.
      </p>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
    </section>
  )
}
