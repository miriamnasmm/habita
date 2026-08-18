import { useEffect, useState } from 'react'
import Icon from '../common/Icon'
import { useStore } from '../../store'
import ScoreExplainerModal from './ScoreExplainerModal'
import {
  byId, scoreColor, scoreWord, priceLabel, fmtUSD, fmtSoles,
  reasonsOf, clamp, distName, distMeters, MAP_GEO, VMS,
} from '../../lib/habita'

/* ---------- "Vivir aquí" (Live here) helpers (ported from the vanilla) ---------- */
const fmtDistEnv = (d) => (d == null ? '—' : d < 1000 ? d + ' m' : (d / 1000).toFixed(1) + ' km')
const envWord = (s) => (s >= 75 ? 'excelente' : s >= 62 ? 'muy bueno' : s >= 50 ? 'bueno' : s >= 40 ? 'regular' : 'limitado')

function ptsNear(lat, lng, pts, maxM) {
  let n = 0, min = Infinity
  ;(pts || []).forEach((p) => {
    const d = distMeters([lat, lng], [p.lat, p.lng])
    if (d <= maxM) n++
    if (d < min) min = d
  })
  return { n, min: isFinite(min) ? Math.round(min) : null }
}
function parksNear(lat, lng, maxM) {
  let n = 0, min = Infinity
  ;(MAP_GEO.parks || []).forEach((pk) => {
    let dm = Infinity
    ;(pk.poly || []).forEach((v) => { const d = distMeters([lat, lng], v); if (d < dm) dm = d })
    if (dm <= maxM) n++
    if (dm < min) min = dm
  })
  return { n, min: isFinite(min) ? Math.round(min) : null }
}

function BarrioBlock({ vm }) {
  const hasParks = (MAP_GEO.parks || []).length
  const hasSch = (MAP_GEO.schools || []).length
  const hasHea = (MAP_GEO.health || []).length
  const park = parksNear(vm.lat, vm.lng, 500)
  const sch = ptsNear(vm.lat, vm.lng, MAP_GEO.schools, 600)
  const hea = ptsNear(vm.lat, vm.lng, MAP_GEO.health, 800)
  const parkMin = hasParks ? park.min : (vm.parkDist != null ? vm.parkDist : null)
  const schMin = hasSch ? sch.min : (vm.schoolDist != null ? vm.schoolDist : null)
  const env = Math.round(clamp(((vm.sub.park || 0) + (vm.sub.school || 0) + (vm.sub.health || 0) + (vm.sub.stroad || 0)) / 4 * 100))
  const rows = [
    { bg: '#6FA77E', ic: 'park', t: 'Parques cerca', s: parkMin != null ? 'El más próximo a ' + fmtDistEnv(parkMin) : 'Sin datos cerca', v: hasParks ? park.n : '—' },
    { bg: '#5E76A8', ic: 'school', t: 'Colegios', s: schMin != null ? 'El más próximo a ' + fmtDistEnv(schMin) : 'Sin datos cerca', v: hasSch ? sch.n : '—' },
    { bg: '#2E9E8F', ic: 'med', t: 'Centros de salud', s: hea.min != null ? 'El más próximo a ' + fmtDistEnv(hea.min) : 'Sin datos cerca', v: hasHea ? hea.n : '—' },
  ]
  if (vm.noisyDist != null) rows.push({ bg: '#B6452B', ic: 'road', t: 'Avenida ruidosa', s: (vm.noisyName ? vm.noisyName + ' · ' : '') + 'a ' + fmtDistEnv(vm.noisyDist), v: '1', small: true })

  return (
    <div className="hb-barrio">
      <div className="hb-barrio-h">
        <Icon name="home" size={18} stroke="var(--clay)" w={1.8} />
        <h4>Vivir aquí</h4>
        <span className="hb-barrio-pill">Entorno {envWord(env)}</span>
      </div>
      {rows.map((r, i) => (
        <div className="hb-barrio-row" key={i}>
          <span className="hb-barrio-ic" style={{ background: r.bg }}>
            <Icon name={r.ic} size={16} fill="none" stroke="#fff" w={2} />
          </span>
          <span className="hb-barrio-tx"><strong>{r.t}</strong><span>{r.s}</span></span>
          <span className="hb-barrio-val" style={r.small ? { fontSize: '.95rem', color: 'var(--espresso-2)' } : undefined}>{r.v}</span>
        </div>
      ))}
      <div className="hb-barrio-foot">Datos del entorno de OpenStreetMap. Distancias aproximadas en línea recta.</div>
    </div>
  )
}

export default function DetailPanel() {
  const selectedId = useStore((s) => s.selectedId)
  const select = useStore((s) => s.select)
  const toggleFav = useStore((s) => s.toggleFav)
  const fav = useStore((s) => (selectedId == null ? false : !!s.fav[selectedId]))

  const [idx, setIdx] = useState(0)
  const [showExplainer, setShowExplainer] = useState(false)
  const [toastMsg, setToastMsg] = useState(null)

  // reset carousel & explainer when the selected property changes
  useEffect(() => { setIdx(0); setShowExplainer(false) }, [selectedId])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== 'Escape') return
      if (showExplainer) return // modal handles its own Escape
      select(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [select, showExplainer])

  if (selectedId == null) return null
  const vm = byId(selectedId)
  if (!vm) return null

  const color = scoreColor(vm.score)
  const photos = vm.photos || []
  const reasons = reasonsOf(vm)
  const floorTxt = (vm.floorUnit != null && vm.floorsBuilding != null)
    ? vm.floorUnit + '/' + vm.floorsBuilding
    : (vm.floorsBuilding != null ? String(vm.floorsBuilding) : '—')
  const stats = [
    { ic: 'area', v: vm.areaM2 != null ? vm.areaM2 + ' m²' : '—', l: 'área' },
    { ic: 'bed', v: vm.beds != null ? vm.beds : '—', l: 'dormitorios' },
    { ic: 'age', v: vm.age, l: 'antigüedad' },
    { ic: 'floor', v: floorTxt, l: 'piso' },
  ]
  const deg = (vm.score / 100) * 360

  const showToast = (msg) => { setToastMsg(msg); setTimeout(() => setToastMsg(null), 2200) }
  const onShare = () => {
    const link = location.origin + location.pathname + '#p=' + encodeURIComponent(vm.id)
    if (navigator.clipboard) {
      navigator.clipboard.writeText(link).then(() => showToast('Link copiado ✓'), () => showToast(link))
    } else {
      showToast(link)
    }
  }

  const statusBadge = vm.isProject && (vm.projectStatus || vm.deliveryYear)
    ? (vm.projectStatus || '') + (vm.deliveryYear ? ' · entrega ' + vm.deliveryYear : '')
    : null

  return (
    <div className="dirA-detail">
      <div className="hb-detail">
        <div className="hb-detail-media">
          {photos.length ? (
            <img className="ph-img" src={photos[idx]}
              onError={(e) => { e.target.style.display = 'none'; const n = e.target.nextElementSibling; if (n) n.style.display = 'flex' }} />
          ) : null}
          <div className="ph-none" style={photos.length ? { display: 'none' } : undefined}>
            <Icon name="home" size={30} fill="none" stroke="#C9AE92" w={1.6} />
            <span>Sin fotos disponibles</span>
          </div>
          <button className="hb-detail-close" onClick={() => select(null)}><Icon name="close" size={20} /></button>
          {photos.length > 1 ? (
            <>
              <button className="hb-nav prev" onClick={() => setIdx((idx - 1 + photos.length) % photos.length)}><Icon name="chevL" size={22} /></button>
              <button className="hb-nav next" onClick={() => setIdx((idx + 1) % photos.length)}><Icon name="chev" size={22} /></button>
              <span className="hb-detail-count">{idx + 1} / {photos.length}</span>
            </>
          ) : null}
          <button className={'hb-fav big' + (fav ? ' on' : '')} onClick={() => toggleFav(vm.id)}>
            <Icon name="heart" size={18} fill={fav ? 'currentColor' : 'none'} />
          </button>
          <button className="hb-fav big hb-detail-share" title="Compartir" aria-label="Compartir" onClick={onShare}>
            <Icon name="share" size={17} />
          </button>
        </div>
        <div className="hb-detail-scroll">
          <div className="hb-detail-head">
            <h2>{vm.address}</h2>
            <div className="hb-detail-loc">{distName(vm.district)} · Lima</div>
            <span className="hb-src-badge">{vm.source}</span>
            {statusBadge ? (
              <span className="hb-src-badge" style={{ marginLeft: 6, color: 'var(--espresso-2)', background: 'var(--cream-2)' }}>{statusBadge}</span>
            ) : null}
          </div>
          <div className="hb-detail-price">
            <strong>{priceLabel(vm)}</strong>
            {vm.priceSoles != null ? <span>{fmtSoles(vm.priceSoles)}</span> : null}
            {vm.pricePerM2 != null ? <small>{fmtUSD(vm.pricePerM2)} por m²</small> : null}
          </div>
          <div className="hb-habit-card" style={{ '--c': color }}>
            <div className="hb-ring" style={{ width: 76, height: 76 }}>
              <div className="hb-ring-bg" style={{ background: `conic-gradient(${color} ${deg}deg, #EFE3D6 ${deg}deg)` }} />
              <div className="hb-ring-hole" style={{ color: 'var(--espresso)' }}><strong style={{ fontSize: 26 }}>{vm.score}</strong></div>
            </div>
            <div className="hb-habit-txt">
              <strong>Habitabilidad {scoreWord(vm.score).toLowerCase()}</strong>
              <span>#{vm.rank} de {VMS.length} · según tus prioridades</span>
            </div>
            <button className="hb-habit-q" title="¿Cómo funciona el puntaje?" aria-label="¿Cómo funciona el puntaje?" onClick={() => setShowExplainer(true)}>?</button>
          </div>
          <div className="hb-stats">
            {stats.map((s, i) => (
              <div className="hb-stat" key={i}>
                <Icon name={s.ic} size={18} fill="none" stroke="var(--clay)" />
                <b>{s.v}</b><small>{s.l}</small>
              </div>
            ))}
          </div>
          <div className="hb-cta-row">
            {vm.url
              ? <a className="hb-btn primary" href={vm.url} target="_blank" rel="noopener">{vm.isProject ? 'Ver proyecto' : 'Ver aviso'}</a>
              : <button className="hb-btn primary" style={{ opacity: .5 }} disabled>Sin enlace</button>}
            {vm.whatsapp
              ? <a className="hb-btn ghost" href={vm.whatsapp} target="_blank" rel="noopener">WhatsApp</a>
              : <button className="hb-btn ghost" style={{ opacity: .5 }} disabled>WhatsApp</button>}
          </div>
          <BarrioBlock vm={vm} />
          <div className="hb-why">
            <h4>¿Por qué este puntaje?</h4>
            <div className="hb-reasons">
              {reasons.map((rr, i) => (
                <div className="hb-reason" key={i}>
                  <span className="hb-reason-lab">{rr.label}</span>
                  <span className="hb-reason-bar"><i style={{ width: rr.v + '%', background: scoreColor(rr.v) }} /></span>
                  <span className="hb-reason-val">{rr.v}</span>
                </div>
              ))}
            </div>
            <p className="hb-why-note">Calculado con datos reales del entorno (calle, comercios, parques, colegios, salud, transporte y comisarías, de OpenStreetMap) ponderados según tu perfil. <i>Seguridad = cercanía a comisaría (proxy).</i></p>
          </div>
        </div>
      </div>
      {showExplainer ? <ScoreExplainerModal vm={vm} onClose={() => setShowExplainer(false)} /> : null}
      {toastMsg ? <div className="hb-toast show">{toastMsg}</div> : null}
    </div>
  )
}
