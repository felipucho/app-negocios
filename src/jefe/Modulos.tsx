import { useCallback, useEffect, useState } from 'react'
import { mensajeJefe, type ModuloJefe, type ServicioJefe } from './jefe'

export interface PropsModulos {
  servicio: Pick<ServicioJefe, 'modulos' | 'cambiarModulo'>
  /** El kiosco actualiza el módulo que cambió: la pantalla de cobro y el menú siguen su estado. */
  alCambiar(clave: string, activo: boolean): void
}

/** Decisión 39: el jefe prende o apaga los módulos desde la app. El plan, los extras y las dependencias los cumple la base. */
export function Modulos({ servicio, alCambiar }: PropsModulos) {
  const [modulos, setModulos] = useState<ModuloJefe[] | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recargar = useCallback(
    () => servicio.modulos().then(setModulos, (e) => setError(mensajeJefe(e))),
    [servicio],
  )

  useEffect(() => {
    void recargar()
  }, [recargar])

  async function cambiar(clave: string, activo: boolean) {
    if (guardando) return
    setGuardando(true)
    setError(null)
    try {
      alCambiar(clave, await servicio.cambiarModulo(clave, activo))
      await recargar()
    } catch (e) {
      setError(mensajeJefe(e))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <section>
      <h2>Módulos</h2>
      <p>Con un módulo apagado, la caja no lo muestra y la base rechaza lo que usa. Lo que ya existe no se borra.</p>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {modulos === null && !error && <p>Cargando…</p>}
      <ul>
        {modulos?.map((m) => (
          <li key={m.clave}>
            <label>
              <input
                type="checkbox"
                checked={m.uso}
                disabled={guardando || !m.derecho}
                onChange={(e) => void cambiar(m.clave, e.target.checked)}
              />
              {m.descripcion}
            </label>
            <p>{estadoJefe(m)}</p>
            {m.faltan.length > 0 && <p>Antes prendé: {m.faltan.join(', ')}</p>}
          </li>
        ))}
      </ul>
    </section>
  )
}

function estadoJefe(m: ModuloJefe): string {
  if (m.excepcion === 'agregado') return 'Agregado por Felipe'
  return m.derecho ? 'Incluido en tu plan' : 'No está en tu plan'
}
