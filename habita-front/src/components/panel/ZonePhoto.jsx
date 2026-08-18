import { useEffect, useState } from 'react'
import Icon from '../common/Icon'
import { zonePhoto } from '../../lib/api'

// Zone photo via Unsplash (API key). Cached per query for the lifetime of the session.
const cache = {}

export default function ZonePhoto({ query }) {
  const [photo, setPhoto] = useState(query && cache[query] ? cache[query] : null)
  const [done, setDone] = useState(!!(query && cache[query] !== undefined && query in cache))

  useEffect(() => {
    if (!query) return
    if (query in cache) { setPhoto(cache[query]); setDone(true); return }
    let alive = true
    setDone(false); setPhoto(null)
    zonePhoto(query).then((p) => { cache[query] = p; if (alive) { setPhoto(p); setDone(true) } })
    return () => { alive = false }
  }, [query])

  if (!query) return null

  return (
    <div style={{ position: 'relative', borderRadius: 14, overflow: 'hidden', margin: '0 0 10px', aspectRatio: '16 / 7', background: 'var(--cream-3)' }}>
      {photo ? (
        <img src={photo.url} alt={photo.alt} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
      ) : (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, color: 'var(--muted)', fontSize: '.8rem' }}>
          <Icon name="home" size={20} stroke="#C9AE92" />
          <span>{done ? 'Sin foto de la zona' : 'Cargando foto…'}</span>
        </div>
      )}
      {photo && (
        <span style={{ position: 'absolute', bottom: 6, right: 8, fontSize: '.6rem', color: '#fff', background: 'rgba(0,0,0,.45)', padding: '2px 7px', borderRadius: 20 }}>
          📷 {photo.credit}
        </span>
      )}
    </div>
  )
}
