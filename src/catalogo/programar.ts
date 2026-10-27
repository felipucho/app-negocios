export const INTERVALO_CATALOGO_MS = 180_000

/** Revisa catalogo_version al arrancar, cada 3 minutos y al volver a la pestaña. Devuelve cómo cancelar. */
export function programarSincronizacion(sincronizar: () => Promise<unknown>): () => void {
  // Una caída se reporta una sola vez (console.error llega a Sentry); el resto de la racha sólo avisa en consola.
  let enCaida = false
  const correr = () => {
    sincronizar().then(
      () => {
        enCaida = false
      },
      (e) => {
        if (enCaida) console.warn('sincronizar catálogo', e)
        else console.error('sincronizar catálogo', e) // la próxima revisión reintenta
        enCaida = true
      },
    )
  }
  const alCambiarVisibilidad = () => {
    if (document.visibilityState === 'visible') correr()
  }
  correr()
  const intervalo = setInterval(correr, INTERVALO_CATALOGO_MS)
  document.addEventListener('visibilitychange', alCambiarVisibilidad)
  return () => {
    clearInterval(intervalo)
    document.removeEventListener('visibilitychange', alCambiarVisibilidad)
  }
}
