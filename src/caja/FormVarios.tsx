import { useState, type FormEvent } from 'react'
import { validarPrecio } from '../productos/productos'

/** Línea Varios tal como la tipea el cajero, ya validada. */
export interface DatosVarios {
  nombre: string
  precio: number
  cantidad: number
}

export interface PropsFormVarios {
  alAgregar(datos: DatosVarios): void
  alCancelar(): void
}

/** Caracteres de control e invisibles (ancho cero, direccionales): la base los rechaza en la descripción. */
const CARACTERES_INVALIDOS = /[\p{Cc}​-‏‪-‮⁦-⁩]/u

/** Descripción opcional (vacía = "Varios"), precio en pesos enteros y cantidad de 1 a 99999. */
export function validarVarios(descripcion: string, precio: string, cantidad: string): DatosVarios | { error: string } {
  const nombre = descripcion.trim()
  if (nombre.length > 40 || CARACTERES_INVALIDOS.test(nombre)) {
    return { error: 'La descripción tiene hasta 40 letras, sin caracteres raros.' }
  }
  const p = validarPrecio(precio)
  if ('error' in p) return p
  const c = cantidad.trim()
  if (!/^[1-9]\d{0,4}$/.test(c)) return { error: 'La cantidad va de 1 a 99999.' }
  return { nombre: nombre === '' ? 'Varios' : nombre, precio: p.precio, cantidad: Number(c) }
}

export function FormVarios({ alAgregar, alCancelar }: PropsFormVarios) {
  const [descripcion, setDescripcion] = useState('')
  const [precio, setPrecio] = useState('')
  const [cantidad, setCantidad] = useState('1')
  const [error, setError] = useState<string | null>(null)

  function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const datos = validarVarios(descripcion, precio, cantidad)
    if ('error' in datos) {
      setError(datos.error)
      return
    }
    alAgregar(datos)
  }

  return (
    <form className="varios" aria-label="Venta libre" onSubmit={enviar}>
      <label>
        <span>Descripción (opcional)</span>
        <input value={descripcion} maxLength={40} autoComplete="off" autoFocus onChange={(e) => setDescripcion(e.target.value)} />
      </label>
      <label>
        <span>Precio</span>
        <input value={precio} inputMode="numeric" autoComplete="off" onChange={(e) => setPrecio(e.target.value)} />
      </label>
      <label>
        <span>Cantidad</span>
        <input value={cantidad} inputMode="numeric" autoComplete="off" onChange={(e) => setCantidad(e.target.value)} />
      </label>
      {error && (
        <p role="alert" className="aviso aviso--error">
          {error}
        </p>
      )}
      <button type="submit">Agregar</button>
      <button type="button" onClick={alCancelar}>
        Cancelar
      </button>
    </form>
  )
}
