import { useEffect, useState } from 'react'
import type { ServicioClientes } from '../pagos/clientes'
import type { Cliente } from '../tipos'
import { mensajeJefe, type ServicioJefe } from './jefe'

export interface PropsAnonimizarCliente {
  /** Clientes no suprimidos del kiosco, con teléfono: dos "Juan" no pueden verse iguales en algo irreversible. */
  clientes: Pick<ServicioClientes, 'listarConTelefono'>
  servicio: Pick<ServicioJefe, 'anonimizarCliente'>
}

/** Decisión 40 y Ley 25.326: a pedido de la persona. Irreversible: pide confirmación explícita. */
export function AnonimizarCliente({ clientes, servicio }: PropsAnonimizarCliente) {
  const [lista, setLista] = useState<Cliente[] | null>(null)
  const [elegidoId, setElegidoId] = useState('')
  const [confirmado, setConfirmado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<string | null>(null)

  useEffect(() => {
    clientes.listarConTelefono().then(setLista, () => setError('No se pudo leer la lista de clientes. Revisá la conexión.'))
  }, [clientes])

  const elegido = lista?.find((c) => c.id === elegidoId) ?? null

  function elegir(id: string) {
    setElegidoId(id)
    setConfirmado(false)
    setHecho(null)
    setError(null)
  }

  async function anonimizar() {
    if (!elegido || !confirmado || enviando) return
    setEnviando(true)
    setError(null)
    try {
      await servicio.anonimizarCliente(elegido.id)
      setLista((l) => l?.filter((c) => c.id !== elegido.id) ?? null)
      setHecho(`${elegido.nombre} quedó como "Cliente suprimido". Sus ventas siguen guardadas.`)
      setElegidoId('')
      setConfirmado(false)
    } catch (e) {
      setError(mensajeJefe(e))
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="anonimizar-cliente">
      <h2>Anonimizar un cliente</h2>
      <p>
        Se hace sólo a pedido de la persona. El nombre pasa a "Cliente suprimido" y el teléfono se borra. Las ventas y
        los pagos fiados se mantienen. No se puede deshacer.
      </p>
      {hecho && (
        <p role="status" className="aviso">
          {hecho}
        </p>
      )}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      {lista && (
        <label>
          Cliente
          <select value={elegidoId} onChange={(e) => elegir(e.target.value)}>
            <option value="">Elegí un cliente</option>
            {lista.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
                {c.telefono ? ` (${c.telefono})` : ''}
              </option>
            ))}
          </select>
        </label>
      )}
      {elegido && (
        <div className="anonimizar-cliente__confirmacion">
          <p>
            Vas a anonimizar a <strong>{elegido.nombre}</strong>
            {elegido.telefono ? ` (${elegido.telefono})` : ''}.
          </p>
          <label>
            <input type="checkbox" checked={confirmado} onChange={(e) => setConfirmado(e.target.checked)} />
            Entiendo que no se puede deshacer
          </label>
          <button type="button" disabled={!confirmado || enviando} onClick={() => void anonimizar()}>
            Anonimizar
          </button>
          <button type="button" onClick={() => elegir('')}>
            Cancelar
          </button>
        </div>
      )}
    </section>
  )
}
