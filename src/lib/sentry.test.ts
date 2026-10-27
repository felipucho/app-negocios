import { describe, expect, it, vi } from 'vitest'
import { iniciarSentry, limpiarEvento, limpiarMiga, redactar, type EventoLimpiable } from './sentry'

const DSN = 'https://clave123@o111.ingest.us.sentry.io/222'

function eventoConDatosPersonales(): EventoLimpiable {
  return {
    message: 'No se pudo dar de alta a ana.gomez@kiosco.com (11 5555-1234)',
    user: { email: 'ana.gomez@kiosco.com', ip_address: '200.1.2.3' },
    extra: { nombre: 'Ana Gómez', telefono: '11 5555-1234' },
    contexts: {
      browser: { name: 'Chrome' },
      cliente: { nombre: 'Ana Gómez', telefono: '11 5555-1234' },
    },
    request: {
      url: 'https://caja.ejemplo/?q=Ana%20G%C3%B3mez',
      data: { nombre: 'Ana Gómez' },
      headers: { Cookie: 'sb-token' },
    },
    exception: { values: [{ value: 'alta_cliente falló para ana.gomez@kiosco.com, tel. +54 11 5555-1234' }] },
    breadcrumbs: [
      { category: 'console', message: 'cliente Ana Gómez 11 5555-1234' },
      { category: 'ui.input', message: 'input[name="Nombre o alias"]' },
      {
        category: 'fetch',
        data: {
          method: 'POST',
          status_code: 400,
          url: 'https://abcd.supabase.co/rest/v1/rpc/alta_cliente?nombre=Ana',
          request_body: { p_nombre: 'Ana Gómez' },
        },
      },
    ],
  }
}

interface OpcionesCapturadas {
  dsn: string
  sendDefaultPii: boolean
  integrations: { name: string }[]
  beforeSend(evento: EventoLimpiable, hint: unknown): EventoLimpiable | null
  beforeBreadcrumb(miga: object): object | null
}

function opcionesDe(iniciar: ReturnType<typeof vi.fn>): OpcionesCapturadas {
  return iniciar.mock.calls[0][0] as OpcionesCapturadas
}

describe('Sentry sin datos personales', () => {
  it('sin DSN no se inicializa', () => {
    const iniciar = vi.fn()
    expect(iniciarSentry(undefined, iniciar)).toBe(false)
    expect(iniciarSentry('', iniciar)).toBe(false)
    expect(iniciar).not.toHaveBeenCalled()
  })

  it('con DSN se inicializa sin PII por defecto', () => {
    const iniciar = vi.fn()
    expect(iniciarSentry(DSN, iniciar)).toBe(true)
    expect(iniciar).toHaveBeenCalledTimes(1)
    expect(opcionesDe(iniciar)).toEqual(expect.objectContaining({ dsn: DSN, sendDefaultPii: false }))
  })

  it('captura los console.error, que es donde la app deja sus fallos atrapados', () => {
    const iniciar = vi.fn()
    iniciarSentry(DSN, iniciar)
    expect(opcionesDe(iniciar).integrations.map((i) => i.name)).toContain('CaptureConsole')
  })

  it('un evento con email, nombre y teléfono sale sin esos campos', () => {
    const iniciar = vi.fn()
    iniciarSentry(DSN, iniciar)
    const limpio = opcionesDe(iniciar).beforeSend(eventoConDatosPersonales(), {})
    const texto = JSON.stringify(limpio)
    for (const dato of ['ana.gomez@kiosco.com', 'Ana', 'Gómez', '5555', '200.1.2.3', 'Cookie', 'request_body']) {
      expect(texto).not.toContain(dato)
    }
    expect(limpio?.contexts).toEqual({ browser: { name: 'Chrome' } })
    expect(limpio?.breadcrumbs).toEqual([
      {
        category: 'fetch',
        data: { method: 'POST', status_code: 400, url: 'https://abcd.supabase.co/rest/v1/rpc/alta_cliente' },
      },
    ])
  })

  it('un error de consola sale sin sus argumentos y con el email tapado', () => {
    const evento: EventoLimpiable = {
      message: 'alta de cliente falló para ana.gomez@kiosco.com',
      extra: { arguments: ['alta de cliente falló', { nombre: 'Ana Gómez', telefono: '11 5555-1234' }] },
    }
    limpiarEvento(evento)
    expect(evento.extra).toBeUndefined()
    expect(evento.message).toBe('alta de cliente falló para [email]')
    expect(JSON.stringify(evento)).not.toMatch(/Ana Gómez|5555/)
  })

  it('beforeBreadcrumb descarta la consola antes de guardarla', () => {
    const iniciar = vi.fn()
    iniciarSentry(DSN, iniciar)
    expect(opcionesDe(iniciar).beforeBreadcrumb({ category: 'console', message: 'Ana Gómez' })).toBeNull()
  })

  it('migas de interfaz afuera; las de red pierden la consulta y los cuerpos', () => {
    expect(limpiarMiga({ category: 'ui.click', message: 'button.alta-cliente' })).toBe(false)
    const red = {
      category: 'xhr',
      data: {
        method: 'GET',
        status_code: 200,
        url: 'https://abcd.supabase.co/rest/v1/clientes?select=*&nombre=ilike.Ana*',
        response_body: 'Ana Gómez',
      },
    }
    expect(limpiarMiga(red)).toBe(true)
    expect(red.data).toEqual({ method: 'GET', status_code: 200, url: 'https://abcd.supabase.co/rest/v1/clientes' })
  })

  it('redactar tapa emails y teléfonos', () => {
    expect(redactar('escribió a ana@kiosco.com desde el 11 4444-5555')).toBe('escribió a [email] desde el [número]')
    expect(redactar('venta A-000123 rechazada')).toBe('venta A-000123 rechazada')
  })
})
