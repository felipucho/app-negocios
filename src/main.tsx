import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { entornoNavegador, leerVersionMinima, vigilarVersion } from './app/version'
import { CacheCatalogo } from './catalogo/cache'
import { iniciarSentry } from './lib/sentry'
import { CLAVE_SESION, supabase } from './lib/supabase'
import { crearServicios } from './servicios'
import './estilos.css'

// Antes del resto del arranque. Los imports se evalúan antes: un error al cargarlos no llega a Sentry. Sólo con VITE_SENTRY_DSN y sin datos personales.
iniciarSentry()

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

// Antes del login y durante toda la vida de la pestaña: una app vieja, con sesión o sin ella, se recarga.
vigilarVersion(entornoNavegador(() => leerVersionMinima(supabase)))

// Una sola vez: los servicios son estables durante toda la vida de la pestaña.
const servicios = crearServicios(supabase, new CacheCatalogo(), CLAVE_SESION)

createRoot(raiz).render(
  <StrictMode>
    <App servicios={servicios} />
  </StrictMode>,
)
