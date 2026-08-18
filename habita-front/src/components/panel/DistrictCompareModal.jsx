import { useEffect, useState } from 'react'
import Icon from '../common/Icon'
import { districtStats, scoreColor, PROFILE_LIST } from '../../lib/habita'
import { useStore } from '../../store'

export default function DistrictCompareModal({ onClose }) {
  const op = useStore((s) => s.op)
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)
  const setDistrict = useStore((s) => s.setDistrict)
  const [sortKey, setSortKey] = useState('score')

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const profileLabel = () => {
    const p = PROFILE_LIST.find((x) => x.key === profile)
    return p ? p.label : 'tu perfil'
  }

  const rows = districtStats(op, profile, weights).sort((a, b) =>
    sortKey === 'ppm' ? ((a.medPpm || 1e12) - (b.medPpm || 1e12)) : (b.avgScore - a.avgScore),
  )
  const maxS = Math.max.apply(null, rows.map((r) => r.avgScore).concat(1))

  return (
    <div className="hb-exp-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hb-exp-card hb-dc-card">
        <div className="hb-exp-h">
          <h3>Comparar distritos</h3>
          <button className="hb-exp-x" aria-label="Cerrar" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <p className="hb-exp-intro">Ranking de distritos por <b>habitabilidad promedio</b> para tu perfil ({profileLabel()}) y su <b>precio por m²</b> típico. Toca un distrito para ir allá.</p>
        <div className="hb-dc-sort">
          <button className={sortKey === 'score' ? 'on' : ''} onClick={() => setSortKey('score')}>Por habitabilidad</button>
          <button className={sortKey === 'ppm' ? 'on' : ''} onClick={() => setSortKey('ppm')}>Por precio/m²</button>
        </div>
        <div className="hb-dc-head"><span>#</span><span>Distrito</span><span>Habitabilidad</span><span>Precio/m²</span></div>
        <div className="hb-dc-list">
          {rows.map((r, i) => (
            <button className="hb-dc-row" key={r.id} onClick={() => { setDistrict(r.id); onClose() }}>
              <span className="hb-dc-rank">{i + 1}</span>
              <span className="hb-dc-name">{r.name}<small>{r.count} props</small></span>
              <span className="hb-dc-score">
                <span className="hb-dc-bar"><i style={{ width: Math.round(r.avgScore / maxS * 100) + '%', background: scoreColor(r.avgScore) }} /></span>
                <b>{r.avgScore}</b>
              </span>
              <span className="hb-dc-ppm">{r.medPpm ? '$' + r.medPpm.toLocaleString('en-US') + '/m²' : '—'}</span>
            </button>
          ))}
        </div>
        <p className="hb-exp-foot">El ranking se recalcula con el perfil que elijas. Precio/m² = mediana de los avisos del distrito.</p>
      </div>
    </div>
  )
}
