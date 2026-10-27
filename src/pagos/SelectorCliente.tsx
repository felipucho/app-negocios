import { useEffect, useRef, useState } from 'react'
import { normalizar } from '../catalogo/normalizar'
import { codigoDeError } from '../lib/errores'
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
  /** Los guarda la pantalla: un escaneo con el foco en el buscador o en el alta lo deshace como a un importe. */
  filtro: string
  alCambiarFiltro(filtro: string): void
  datosAlta: { nombre: string; telefono: string }
  alCambiarDatosAlta(campo: 'nombre' | 'telefono', valor: string): void
}

/** Sólo existe con el módulo fiado activo (lo decide PantallaPagos). Muestra sólo el nombre. */
export function SelectorCliente({
  servicio,
  elegido,
  alElegir,
  devolverFoco,
  filtro,
  alCambiarFiltro,
  datosAlta,
  alCambiarDatosAlta,
}: PropsSelectorCliente) {
  const [clientes, setClientes] = useState<ClienteCaja[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [alta, setAlta] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const campoNombre = useRef<HTMLInputElement>(null)

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
    if (guardando) return
    setGuardando(true)
    setError(null)
    try {
      const nuevo = await servicio.alta(datosAlta.nombre.trim(), datosAlta.telefono.trim() === '' ? null : datosAlta.telefono.trim())
      setClientes((lista) => [...(lista ?? []), nuevo])
      setAlta(false)
      alCambiarDatosAlta('nombre', '')
      alCambiarDatosAlta('telefono', '')
      elegir(nuevo)
    } catch (e) {
      setError(ERRORES_ALTA[codigoDeError(e)] ?? 'No se pudo dar de alta el cliente.')
      campoNombre.current?.focus()
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
        Buscar cliente <input name="buscarCliente" value={filtro} onChange={(e) => alCambiarFiltro(e.target.value)} autoComplete="off" />
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
            <input
              ref={campoNombre}
              name="nombreCliente"
              value={datosAlta.nombre}
              onChange={(e) => alCambiarDatosAlta('nombre', e.target.value)}
              autoComplete="off"
              autoFocus
            />
          </label>
          <label>
            Teléfono (opcional){' '}
            <input
              name="telefonoCliente"
              value={datosAlta.telefono}
              onChange={(e) => alCambiarDatosAlta('telefono', e.target.value)}
              inputMode="tel"
              autoComplete="off"
            />
          </label>
          {/* aria-disabled y no disabled: un botón con foco que pasa a disabled deja el foco en <body> (decisión 13). */}
          <button type="button" onClick={() => void darDeAlta()} aria-disabled={guardando}>
            Agregar cliente
          </button>
          <button
            type="button"
            onClick={() => {
              if (guardando) return
              setAlta(false)
              devolverFoco()
            }}
            aria-disabled={guardando}
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
