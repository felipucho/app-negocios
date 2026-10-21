import { useEffect, useState } from 'react'
import { normalizar } from '../catalogo/normalizar'
import type { ClienteCaja, ServicioClientes } from './clientes'

const MAX_CLIENTES = 8

const ERRORES_ALTA: Record<string, string> = {
  nombre_invalido: 'Escribí un nombre o alias válido (hasta 60 letras).',
  telefono_invalido: 'El teléfono lleva al menos 6 números; sólo números, espacios y + ( ) -.',
  fiado_deshabilitado: 'El fiado no está activo en este kiosco.',
}

export interface PropsSelectorCliente {
  servicio: ServicioClientes
  elegido: ClienteCaja | null
  alElegir(cliente: ClienteCaja | null): void
  /** El botón tocado se desmonta: sin esto el foco cae al body y un escaneo se pierde sin aviso. */
  devolverFoco(): void
}

/** Sólo existe con el módulo fiado activo (lo decide PantallaPagos). Muestra sólo el nombre. */
export function SelectorCliente({ servicio, elegido, alElegir, devolverFoco }: PropsSelectorCliente) {
  const [clientes, setClientes] = useState<ClienteCaja[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [alta, setAlta] = useState(false)
  const [nombre, setNombre] = useState('')
  const [telefono, setTelefono] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Una vez al montar: si el padre recrea el servicio en cada render, no se vuelve a pedir la lista.
  useEffect(() => {
    let vigente = true
    servicio.listar().then(
      (lista) => {
        if (vigente) setClientes(lista)
      },
      () => {
        if (vigente) setError('No se pudo leer la lista de clientes.')
      },
    )
    return () => {
      vigente = false
    }
  }, [])

  function elegir(cliente: ClienteCaja | null) {
    alElegir(cliente)
    devolverFoco()
  }

  async function darDeAlta() {
    setGuardando(true)
    setError(null)
    try {
      const nuevo = await servicio.alta(nombre.trim(), telefono.trim() === '' ? null : telefono.trim())
      setClientes((lista) => [...(lista ?? []), nuevo])
      setAlta(false)
      setNombre('')
      setTelefono('')
      elegir(nuevo)
    } catch (e) {
      const codigo = typeof e === 'object' && e !== null && 'message' in e ? String(e.message) : ''
      setError(ERRORES_ALTA[codigo] ?? 'No se pudo dar de alta el cliente.')
    } finally {
      setGuardando(false)
    }
  }

  if (elegido) {
    return (
      <div className="selector-cliente">
        <p>
          Fiado a: <strong>{elegido.nombre}</strong>
        </p>
        <button type="button" onClick={() => elegir(null)}>
          Cambiar cliente
        </button>
      </div>
    )
  }

  const buscado = normalizar(filtro)
  const visibles = (clientes ?? []).filter((c) => normalizar(c.nombre).includes(buscado)).slice(0, MAX_CLIENTES)

  return (
    <fieldset className="selector-cliente">
      <legend>Cliente del fiado</legend>
      <label>
        Buscar cliente <input value={filtro} onChange={(e) => setFiltro(e.target.value)} autoComplete="off" />
      </label>
      {clientes === null && !error && <p>Cargando clientes…</p>}
      <ul aria-label="Clientes">
        {visibles.map((c) => (
          <li key={c.id}>
            <button type="button" onClick={() => elegir(c)}>
              {c.nombre}
            </button>
          </li>
        ))}
      </ul>
      {alta ? (
        <div className="alta-cliente">
          <label>
            Nombre o alias{' '}
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} autoComplete="off" autoFocus />
          </label>
          <label>
            Teléfono (opcional){' '}
            <input value={telefono} onChange={(e) => setTelefono(e.target.value)} inputMode="tel" autoComplete="off" />
          </label>
          <button type="button" onClick={() => void darDeAlta()} disabled={guardando}>
            Agregar cliente
          </button>
          <button
            type="button"
            onClick={() => {
              setAlta(false)
              devolverFoco()
            }}
            disabled={guardando}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button type="button" onClick={() => setAlta(true)}>
          Nuevo cliente
        </button>
      )}
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
    </fieldset>
  )
}
