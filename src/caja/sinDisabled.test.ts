import { describe, expect, it } from 'vitest'

// Decisión 13: en la caja, un botón disabled deja el foco en <body> y el escaneo siguiente se pierde.
// Se usa aria-disabled más una guarda en el handler. Esto frena que vuelva un disabled por costumbre.
const fuentes = import.meta.glob<string>(
  ['./*.tsx', '../pagos/*.tsx', '../turno/*.tsx', '../productos/AltaRapidaProducto.tsx', '!./**/*.test.tsx'],
  { query: '?raw', import: 'default', eager: true },
)

describe('pantallas de la caja sin disabled', () => {
  it.each(Object.keys(fuentes))('%s', (archivo) => {
    expect(fuentes[archivo]).not.toMatch(/\sdisabled=\{/)
  })
})
