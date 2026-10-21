import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { cacheDeLaApp } from './catalogo/cache'
import { CLAVE_SESION, supabase } from './lib/supabase'
import { crearServicios } from './servicios'
import './estilos.css'

const raiz = document.getElementById('root')
if (!raiz) throw new Error('Falta el elemento #root en index.html')

// Una sola vez: los servicios son estables durante toda la vida de la pestaña.
const servicios = crearServicios(supabase, cacheDeLaApp(), CLAVE_SESION)

createRoot(raiz).render(
  <StrictMode>
    <App servicios={servicios} />
  </StrictMode>,
)
