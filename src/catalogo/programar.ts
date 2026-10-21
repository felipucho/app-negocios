export const INTERVALO_CATALOGO_MS = 180_000

/** Revisa catalogo_version al arrancar, cada 3 minutos y al volver a la pestaña. Devuelve cómo cancelar. */
export function programarSincronizacion(sincronizar: () => Promise<unknown>): () => void {
  const correr = () => {
    sincronizar().catch((e) => console.warn('sincronizar catálogo', e)) // la próxima revisión reintenta
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
