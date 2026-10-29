interface Props {
  nombre: string
  valor: string
  alCambiar(valor: string): void
  /** Texto del botón, con su versión "en curso" si la tiene. */
  accion: string
  enviando: boolean
}

// Sin espacios de más: el HTML los junta al mostrar el nombre, y eso es lo que se copia.
const limpio = (texto: string) => texto.trim().replace(/\s+/g, ' ')

/**
 * Va dentro del formulario de una acción grave: el botón que envía sigue deshabilitado hasta que se escribe
 * el nombre del kiosco, con las mismas mayúsculas y tildes (P50).
 */
export function ConfirmarGrave({ nombre, valor, alCambiar, accion, enviando }: Props) {
  const esperado = limpio(nombre)
  const escrito = limpio(valor)
  // Avisa cuando lo escrito ya no puede llegar a ser el nombre, no mientras lo va escribiendo.
  const equivocado = !esperado.startsWith(escrito)

  return (
    <>
      <label>
        <span>
          Para confirmar, escribí el nombre del kiosco: <strong>{nombre}</strong>
        </span>
        <input autoComplete="off" value={valor} onChange={(e) => alCambiar(e.target.value)} />
      </label>
      {equivocado && (
        <p role="alert" className="aviso aviso--error">
          No coincide con el nombre del kiosco. Escribilo igual, con mayúsculas y tildes.
        </p>
      )}
      {/* shortcut: sin código de MFA (TOTP apagado en config.toml), pedirlo acá cuando el proyecto lo tenga */}
      <button type="submit" disabled={escrito !== esperado} aria-disabled={enviando}>
        {accion}
      </button>
    </>
  )
}
