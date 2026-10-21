/**
 * Umbrales del escáner (spec sección 9, caso 4). SUPUESTO: valores iniciales hasta medirlos con el
 * escáner real en la pantalla de calibración (Calibracion.tsx). Para cambiarlos, editar este archivo:
 * no se guardan en el navegador.
 */
export interface Umbrales {
  /** Máximo entre dos caracteres seguidos (y entre el último y el Enter) para que cuente como escaneo. */
  intervaloEscaneoMs: number
  /** Mínimo de caracteres de un código escaneado. */
  minimoCaracteres: number
  /** La misma lectura antes de este tiempo se ignora (lectura doble). */
  dobleLecturaMs: number
}

export const UMBRALES: Readonly<Umbrales> = {
  intervaloEscaneoMs: 50,
  minimoCaracteres: 4,
  dobleLecturaMs: 150,
}
