import Icon from '../common/Icon'
import { useStore } from '../../store'

// time estimate (ported from the vanilla nearEst): 5 km/h on foot, 22 km/h by car.
function nearEst(m) {
  return '≈ ' + Math.round((m / 1000 / 5) * 60) + ' min a pie · ' + Math.round((m / 1000 / 22) * 60) + ' min en auto'
}

export default function NearPanel() {
  const near = useStore((s) => s.near)
  const clearNear = useStore((s) => s.clearNear)
  const setNearRadius = useStore((s) => s.setNearRadius)

  if (!near) return null

  return (
    <div className="hb-near-panel">
      <div className="hb-near-h">
        <Icon name="pin" size={14} />
        <span>{near.label ? 'Cerca de ' + near.label : 'Cerca de tu punto'}</span>
        <button aria-label="Quitar" onClick={clearNear}><Icon name="close" size={15} /></button>
      </div>
      <div className="hb-near-r"><span>Radio</span><b>{(near.radiusM / 1000).toFixed(1)} km</b></div>
      <input type="range" min="300" max="5000" step="100" value={near.radiusM}
        onChange={(e) => setNearRadius(+e.target.value)} />
      <div className="hb-near-est">{nearEst(near.radiusM)}</div>
    </div>
  )
}
