import { useEffect } from 'react'
import Icon from '../common/Icon'
import { useStore } from '../../store'
import { weightsFor, PROFILE_LIST } from '../../lib/habita'

const FACTOR_LABELS = [
  ['stroad', 'Calle tranquila'],
  ['security', 'Seguridad'],
  ['park', 'Parques cerca'],
  ['school', 'Colegios cerca'],
  ['commerce', 'Comercio a pie'],
  ['health', 'Centros de salud'],
  ['conn', 'Transporte'],
  ['value', 'Buen precio'],
]

const lvl = (r) => (r >= 0.7 ? 'Alto' : r >= 0.38 ? 'Medio' : 'Bajo')

export default function ScoreExplainerModal({ vm, onClose }) {
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const profileLabel = () => {
    const p = PROFILE_LIST.find((x) => x.key === profile)
    return p ? p.label : 'tu perfil'
  }

  const w = weightsFor(profile, weights)
  const items = FACTOR_LABELS
    .map(([k, l]) => ({ k, l, w: +(w[k] || 0) }))
    .filter((x) => x.w > 0)
    .sort((a, b) => b.w - a.w)
  const maxW = Math.max.apply(null, items.map((x) => x.w).concat(0.01))

  return (
    <div className="hb-exp-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hb-exp-card">
        <div className="hb-exp-h">
          <h3>¿Cómo funciona el puntaje?</h3>
          <button className="hb-exp-x" aria-label="Cerrar" onClick={onClose}><Icon name="close" size={18} /></button>
        </div>
        <p className="hb-exp-intro">La <b>habitabilidad</b> mide qué tan bien se vive en esta ubicación. Combinamos datos del entorno y los pesamos según lo que <b>a ti</b> te importa.</p>
        <span className="hb-exp-profile">● Perfil: {profileLabel()}</span>
        <div className="hb-exp-rows">
          {items.map((it) => {
            const r = it.w / maxW
            return (
              <div className="hb-exp-row" key={it.k}>
                <span className="l">{it.l}</span>
                <span className="bar"><i style={{ width: Math.round(r * 100) + '%' }} /></span>
                <span className="v">{lvl(r)}</span>
              </div>
            )
          })}
        </div>
        <p className="hb-exp-foot">Calculado con datos reales de OpenStreetMap (parques, colegios, salud, avenidas y comisarías). Cambia de perfil y el puntaje se recalcula al instante.</p>
      </div>
    </div>
  )
}
