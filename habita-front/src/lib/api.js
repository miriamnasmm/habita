// External API integrations (with API key).
// Keys are read from Vite environment variables (.env file). If missing, a
// free keyless fallback is used ONLY so the demo does not break.
const GEOAPIFY_KEY = import.meta.env.VITE_GEOAPIFY_KEY
const UNSPLASH_KEY = import.meta.env.VITE_UNSPLASH_KEY

export const hasGeoKey = !!GEOAPIFY_KEY
export const hasPhotoKey = !!UNSPLASH_KEY

// Nuestro backend propio (Rails). La API key viaja en el header X-Api-Key.
const API_URL = import.meta.env.VITE_API_URL
const API_KEY = import.meta.env.VITE_API_KEY

export async function apiFetch(path, options = {}) {
  const r = await fetch(`${API_URL}${path}`, {
    ...options,
    headers: { 'X-Api-Key': API_KEY, ...(options.headers || {}) },
  })
  if (!r.ok) throw new Error(`Backend respondió ${r.status}`)
  return r.json()
}

// Prueba de conexión: confirma que web ↔ backend ↔ base de datos se hablan.
export function pingBackend() {
  return apiFetch('/ping')
}

// ---- Favoritos (guardados en la base de datos del backend) ----

// Trae los IDs guardados. Devuelve [] si algo falla (no rompe la app).
export async function getFavorites() {
  try {
    const d = await apiFetch('/favorites')
    return d.favorites || []
  } catch (_) { return [] }
}

export function addFavorite(id) {
  return apiFetch('/favorites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ listing_id: id }),
  })
}

export function removeFavorite(id) {
  return apiFetch(`/favorites/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

// ---- Data de propiedades (pública, desde la API/Postgres) ----

// Meta: distritos, rangos, conteos… (lo que antes venía dentro de map_data.js).
export async function fetchMeta() {
  const r = await fetch(`${API_URL}/meta.json`)
  if (!r.ok) throw new Error(`meta respondió ${r.status}`)
  return r.json()
}

// Listings (versión ligera) por operación (venta/alquiler) u otros filtros.
export async function fetchListings(op, params = {}) {
  const q = new URLSearchParams({ op, ...params }).toString()
  const r = await fetch(`${API_URL}/listings?${q}`)
  if (!r.ok) throw new Error(`listings respondió ${r.status}`)
  const d = await r.json()
  return d.listings || []
}

// Geocoding: exact address → coordinates (Geoapify Autocomplete, free with key).
export async function geocode(q) {
  q = (q || '').trim()
  if (q.length < 4) return []
  try {
    if (GEOAPIFY_KEY) {
      const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&filter=countrycode:pe&bias=proximity:-77.04,-12.06&limit=6&lang=es&format=json&apiKey=${GEOAPIFY_KEY}`
      const r = await fetch(url)
      const d = await r.json()
      return (d.results || []).map((f) => ({ name: f.formatted || f.address_line1, lat: f.lat, lng: f.lon }))
    }
    // keyless fallback (Nominatim) for the demo
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=6&accept-language=es&countrycodes=pe&q=${encodeURIComponent(q + ', Lima, Perú')}`
    const r = await fetch(url, { headers: { Accept: 'application/json' } })
    const d = await r.json()
    return (d || []).map((x) => ({ name: x.display_name.split(',').slice(0, 3).join(', '), lat: +x.lat, lng: +x.lon }))
  } catch (_) { return [] }
}

// Zone photo via Wikipedia (Wikimedia API, FREE and without an API key).
// Searches for the district article on Spanish Wikipedia and uses its lead image.
export async function zonePhoto(name) {
  if (!name) return null
  try {
    const url = `https://es.wikipedia.org/w/api.php?action=query&format=json&origin=*&generator=search&gsrsearch=${encodeURIComponent(name + ' Lima')}&gsrlimit=1&prop=pageimages&piprop=thumbnail&pithumbsize=640`
    const r = await fetch(url)
    const d = await r.json()
    const pages = d.query && d.query.pages
    if (!pages) return null
    const p = Object.values(pages)[0]
    if (p && p.thumbnail && p.thumbnail.source) return { url: p.thumbnail.source, alt: p.title, credit: 'Wikipedia' }
    return null
  } catch (_) { return null }
}
