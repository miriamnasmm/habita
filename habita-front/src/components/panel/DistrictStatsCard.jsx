import { districtStatsCard, scoreColor } from '../../lib/habita'
import { useStore } from '../../store'
import ZonePhoto from './ZonePhoto'

export default function DistrictStatsCard() {
  const district = useStore((s) => s.district)
  const op = useStore((s) => s.op)
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)

  if (!district) return null
  const d = districtStatsCard(district, op, profile, weights)
  if (!d) return null

  return (
    <div className="hb-dstats">
      <ZonePhoto query={d.name} />
      <div className="hb-dstats-h">
        <strong>{d.name}</strong>
        <span>{d.count} en {op === 'alquiler' ? 'alquiler' : 'venta'}</span>
      </div>
      <div className="hb-dstats-row">
        <div className="hb-dstats-cell">
          <b style={{ color: scoreColor(d.avg) }}>{d.avg}</b>
          <small>Habitabilidad prom.</small>
        </div>
        <div className="hb-dstats-cell">
          <b>{d.medPpm ? '$' + d.medPpm.toLocaleString('en-US') : '—'}</b>
          <small>Precio/m²{op === 'alquiler' ? '/mes' : ''}</small>
        </div>
        <div className="hb-dstats-cell">
          <b>{d.vCount} / {d.aCount}</b>
          <small>venta / alquiler</small>
        </div>
      </div>
    </div>
  )
}
