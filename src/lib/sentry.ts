import * as Sentry from '@sentry/browser'

/** Lo que se mira de una miga (breadcrumb) de Sentry. */
export interface MigaLimpiable {
  category?: string
  message?: string
  data?: { [clave: string]: unknown }
}

/** Lo que se mira de un evento de error de Sentry. */
export interface EventoLimpiable {
  message?: string
  user?: unknown
  extra?: unknown
  contexts?: object
  request?: { url?: string; data?: unknown; cookies?: unknown; headers?: unknown; query_string?: unknown }
  exception?: { values?: { value?: string }[] }
  breadcrumbs?: MigaLimpiable[]
}

const EMAIL = /[^\s@"'<>()]+@[^\s@"'<>()]+\.[^\s@"'<>()]+/g
const TELEFONO = /\+?\d[\d\s().-]{5,}\d/g
const CONTEXTOS_TECNICOS = new Set(['browser', 'os', 'device', 'culture', 'trace'])

/** Tapa emails y teléfonos en un texto libre (mensajes de error). */
export function redactar(texto: string): string {
  return texto.replace(EMAIL, '[email]').replace(TELEFONO, '[número]')
}

/** URL sin consulta ni fragmento: los filtros de PostgREST (?nombre=...) pueden llevar datos de clientes. */
export function sinConsulta(url: string): string {
  const corte = url.search(/[?#]/)
  return corte === -1 ? url : url.slice(0, corte)
}

/**
 * Deja pasar sólo migas de red (método, estado y URL sin consulta, nunca cuerpos) y de navegación.
 * Consola, clics, teclas y cualquier otra quedan afuera: pueden llevar nombres o teléfonos de clientes.
 * Modifica la miga; devuelve false si hay que descartarla.
 */
export function limpiarMiga(miga: MigaLimpiable): boolean {
  const d = miga.data ?? {}
  if (miga.category === 'fetch' || miga.category === 'xhr') {
    miga.data = {
      method: d.method,
      status_code: d.status_code,
      url: typeof d.url === 'string' ? sinConsulta(d.url) : undefined,
    }
    miga.message = undefined
    return true
  }
  if (miga.category === 'navigation') {
    miga.data = {
      from: typeof d.from === 'string' ? sinConsulta(d.from) : undefined,
      to: typeof d.to === 'string' ? sinConsulta(d.to) : undefined,
    }
    miga.message = undefined
    return true
  }
  return false
}

/** Saca del evento todo lo que puede tener datos personales (spec sección 10). Modifica el evento. */
export function limpiarEvento(evento: EventoLimpiable): void {
  evento.user = undefined
  evento.extra = undefined
  if (evento.request) {
    evento.request = { url: evento.request.url ? sinConsulta(evento.request.url) : undefined }
  }
  if (evento.contexts) {
    evento.contexts = Object.fromEntries(
      Object.entries(evento.contexts).filter(([clave]) => CONTEXTOS_TECNICOS.has(clave)),
    )
  }
  if (evento.message) evento.message = redactar(evento.message)
  for (const valor of evento.exception?.values ?? []) {
    if (valor.value) valor.value = redactar(valor.value)
  }
  if (evento.breadcrumbs) evento.breadcrumbs = evento.breadcrumbs.filter(limpiarMiga)
}

type IniciarSentry = (opciones: Sentry.BrowserOptions) => unknown

/** Sentry sólo para errores (spec sección 3 y decisión 32). Sin VITE_SENTRY_DSN, no hace nada. */
export function iniciarSentry(
  dsn: string | undefined = import.meta.env.VITE_SENTRY_DSN,
  iniciar: IniciarSentry = Sentry.init,
): boolean {
  if (!dsn) return false
  iniciar({
    dsn,
    release: __APP_VERSION__,
    environment: import.meta.env.MODE,
    // SDK 10: sin dataCollection manda sendDefaultPii (V42). false = sin IP, cookies ni datos del usuario.
    sendDefaultPii: false,
    maxBreadcrumbs: 30,
    beforeBreadcrumb(miga) {
      return limpiarMiga(miga) ? miga : null
    },
    beforeSend(evento) {
      limpiarEvento(evento)
      return evento
    },
  })
  return true
}
