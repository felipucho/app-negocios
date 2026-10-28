import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Node 25 trae un localStorage global sin métodos que tapa al de jsdom: se usa uno en memoria.
const datos = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: {
    getItem: (clave: string) => datos.get(clave) ?? null,
    setItem: (clave: string, valor: string) => void datos.set(clave, String(valor)),
    removeItem: (clave: string) => void datos.delete(clave),
    clear: () => datos.clear(),
    key: (indice: number) => [...datos.keys()][indice] ?? null,
    get length() {
      return datos.size
    },
  },
})

afterEach(() => {
  cleanup()
})
