import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './habita.css'
import { fetchMeta, fetchListings } from './lib/api'

// Carga la data desde la API (Postgres) antes de montar la app.
// window.MAP_GEO ya viene del <script> en index.html; aquí armamos MAP_DATA.
async function boot() {
  try {
    const [meta, listings] = await Promise.all([fetchMeta(), fetchListings('venta')])
    window.MAP_DATA = { ...meta, listings }
  } catch (e) {
    console.error('No se pudo cargar la data desde la API:', e)
    const span = document.querySelector('#boot-loader span')
    if (span) span.textContent = 'No se pudo cargar la data. ¿El backend está prendido?'
    return
  }

  const { default: App } = await import('./App.jsx')
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

boot()
