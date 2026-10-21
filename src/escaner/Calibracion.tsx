import { useRef, useState, type KeyboardEvent } from 'react'
import { intervalos, umbralSugerido } from './calibrar'
import { UMBRALES } from './umbrales'

export const LECTURAS_CALIBRACION = 10

/**
 * El cajero pasa 10 códigos con el escáner real y ve el intervalo mínimo y máximo entre caracteres.
 * No guarda nada en el navegador: el valor sugerido se copia a mano en src/escaner/umbrales.ts.
 */
// Sin ahora, el tiempo del evento (e.timeStamp), igual que el detector de la caja: el render no suma a los intervalos.
export function Calibracion({ ahora }: { ahora?: () => number }) {
  const tiempos = useRef<number[]>([])
  const [valor, setValor] = useState('')
  const [medidos, setMedidos] = useState<number[]>([])
  const [lecturas, setLecturas] = useState(0)
  const completa = lecturas >= LECTURAS_CALIBRACION
  const resumen = completa ? umbralSugerido(medidos) : null

  function alTecla(e: KeyboardEvent<HTMLInputElement>) {
    if (completa) return
    const t = ahora ? ahora() : e.timeStamp
    if (e.key === 'Enter') {
      e.preventDefault()
      // El Enter cuenta: el detector también exige que llegue rápido después del último carácter.
      const lectura = intervalos([...tiempos.current, t])
      tiempos.current = []
      setValor('')
      if (lectura.length === 0) return
      setMedidos((m) => [...m, ...lectura])
      setLecturas((n) => n + 1)
      return
    }
    if (e.key.length === 1) tiempos.current.push(t)
  }

  function reiniciar() {
    tiempos.current = []
    setMedidos([])
    setLecturas(0)
    setValor('')
  }

  return (
    <section className="calibracion">
      <h2>Calibrar el escáner</h2>
      <p>
        Pasá {LECTURAS_CALIBRACION} códigos con el escáner, uno por vez, con el cursor en el campo. No tipees a mano.
      </p>
      <label>
        Lectura{' '}
        <input
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          onKeyDown={alTecla}
          autoFocus
          autoComplete="off"
          disabled={completa}
        />
      </label>
      <p>
        Lecturas: {lecturas} de {LECTURAS_CALIBRACION}
      </p>
      {resumen && (
        <div>
          <p>Intervalo mínimo entre caracteres: {resumen.minimo.toFixed(1)} ms</p>
          <p>Intervalo máximo entre caracteres: {resumen.maximo.toFixed(1)} ms</p>
          <p>
            Valor sugerido: <strong>{resumen.sugerido} ms</strong> (hoy: {UMBRALES.intervaloEscaneoMs} ms)
          </p>
          <p>Para usarlo, copiar esta línea en src/escaner/umbrales.ts:</p>
          <pre>intervaloEscaneoMs: {resumen.sugerido},</pre>
          <p>Esta pantalla no guarda nada en el navegador.</p>
        </div>
      )}
      <button type="button" onClick={reiniciar}>
        Volver a medir
      </button>
    </section>
  )
}
