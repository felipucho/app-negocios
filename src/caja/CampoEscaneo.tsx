import { useRef, type KeyboardEvent, type RefObject } from 'react'
import { detectarEscaneo, type Pulsacion } from '../escaner/detector'
import type { Umbrales } from '../escaner/umbrales'
import { ID_SUGERENCIAS } from './ListaSugerencias'

const MAX_PULSACIONES = 64

export interface PropsCampoEscaneo {
  campoRef: RefObject<HTMLInputElement | null>
  valor: string
  umbrales: Umbrales
  /** Reloj inyectado (tests). Sin él, la marca del evento: no se corre si el hilo principal se traba en medio de un escaneo. */
  ahora?: () => number
  listaAbierta: boolean
  /** id de la sugerencia elegida con flechas. */
  opcionActiva?: string
  alCambiar(valor: string): void
  /** Racha rápida terminada en Enter: el código y el momento del Enter. */
  alEscanear(codigo: string, t: number): void
  /** Enter que no fue escaneo. */
  alEnter(): void
  alFlecha(paso: 1 | -1): void
  /** Escape y F2 (panel sin código, tarea 13). */
  alTeclaEspecial?(tecla: 'Escape' | 'F2'): void
}

/** Campo único "Escanear o buscar". Mide el tiempo de cada tecla para separar escaneo de tipeo. */
export function CampoEscaneo(p: PropsCampoEscaneo) {
  const pulsaciones = useRef<Pulsacion[]>([])

  function alTecla(e: KeyboardEvent<HTMLInputElement>) {
    const tecla = e.key
    const t = p.ahora ? p.ahora() : e.timeStamp
    if (tecla === 'Enter') {
      e.preventDefault()
      const escaneo = detectarEscaneo(pulsaciones.current, t, p.umbrales)
      pulsaciones.current = []
      if (escaneo) p.alEscanear(escaneo.codigo, t)
      else p.alEnter()
      return
    }
    if (tecla === 'ArrowDown' || tecla === 'ArrowUp') {
      e.preventDefault()
      p.alFlecha(tecla === 'ArrowDown' ? 1 : -1)
      return
    }
    if (tecla === 'Escape' || tecla === 'F2') {
      e.preventDefault()
      p.alTeclaEspecial?.(tecla)
      return
    }
    // El campo es la única parada de la caja: un Tab suelto haría perder el escaneo siguiente.
    if (tecla === 'Tab') {
      e.preventDefault()
      return
    }
    if (tecla.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      pulsaciones.current = [...pulsaciones.current, { tecla, t }].slice(-MAX_PULSACIONES)
    }
  }

  return (
    <label className="campo-escaneo">
      <span>Escanear o buscar</span>
      <input
        ref={p.campoRef}
        value={p.valor}
        onChange={(e) => p.alCambiar(e.target.value)}
        onKeyDown={alTecla}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        role="combobox"
        aria-autocomplete="list"
        aria-expanded={p.listaAbierta}
        aria-controls={ID_SUGERENCIAS}
        aria-activedescendant={p.opcionActiva}
      />
    </label>
  )
}
