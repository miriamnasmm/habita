import { useEffect } from 'react'
import Icon from '../common/Icon'
import { byId, scoreColor, scoreWord, fmtUSD, clamp } from '../../lib/habita'
import { useStore } from '../../store'

const ROWS = [
  { label: 'Precio', get: (vm) => (vm.priceUSD != null ? fmtUSD(vm.priceUSD) : '—'), best: 'min', val: (vm) => vm.priceUSD },
  { label: 'Precio por m²', get: (vm) => (vm.pricePerM2 != null ? fmtUSD(vm.pricePerM2) : '—'), best: 'min', val: (vm) => vm.pricePerM2 },
  { label: 'Área', get: (vm) => (vm.areaM2 != null ? vm.areaM2 + ' m²' : '—'), best: 'max', val: (vm) => vm.areaM2 },
  { label: 'Dormitorios', get: (vm) => (vm.beds != null ? vm.beds : '—'), best: 'max', val: (vm) => vm.beds },
]
const SUBS = [
  ['stroad', 'Calle tranquila'], ['security', 'Seguridad'], ['commerce', 'Comercio a pie'],
  ['park', 'Parque cerca'], ['school', 'Colegios'], ['health', 'Salud'], ['conn', 'Transporte'],
]

const bestIdx = (vals, mode) => {
  const nums = vals.map((v) => (v == null ? null : +v))
  let bi = -1, bv = null
  nums.forEach((v, i) => { if (v == null) return; if (bv == null || (mode === 'min' ? v < bv : v > bv)) { bv = v; bi = i } })
  return bi
}

export default function CompareModal({ onClose }) {
  const compare = useStore((s) => s.compare)

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const vms = compare.map(byId).filter(Boolean)
  if (vms.length < 2) return null
  const colW = 'minmax(0,1fr)'

  return (
    <div className="hb-cmp-modal" onClick={(e) => { if (e.target === e.currentTarget) onClose() }}>
      <div className="hb-cmp-card" style={{ '--cols': vms.length }}>
        <div className="hb-cmp-head">
          <h2>Comparar propiedades</h2>
          <button aria-label="Cerrar" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <div className="hb-cmp-grid" style={{ gridTemplateColumns: `140px repeat(${vms.length},${colW})` }}>
          <div className="hb-cmp-col-head"></div>
          {vms.map((vm) => {
            const c = scoreColor(vm.score)
            return (
              <div className="hb-cmp-col" key={vm.id}>
                <div className="hb-cmp-media">
                  {vm.photos && vm.photos.length ? (
                    <img src={vm.photos[0]} onError={(e) => e.target.parentNode.classList.add('noimg')} />
                  ) : null}
                </div>
                <div className="hb-cmp-ring" style={{ '--c': c }}><span style={{ background: c }}>{vm.score}</span></div>
                <div className="hb-cmp-word" style={{ color: c }}>{scoreWord(vm.score)}</div>
                <div className="hb-cmp-addr">{vm.address}</div>
              </div>
            )
          })}

          {ROWS.map((r) => {
            const vals = vms.map(r.val)
            const bi = bestIdx(vals, r.best)
            return (
              <div className="hb-cmp-row" key={r.label}>
                <div className="hb-cmp-rl">{r.label}</div>
                {vms.map((vm, i) => (
                  <div className={'hb-cmp-cell ' + (i === bi ? 'best' : '')} key={vm.id}>
                    {r.get(vm)}{i === bi ? <Icon name="check" size={13} /> : null}
                  </div>
                ))}
              </div>
            )
          })}

          <div className="hb-cmp-section">Habitabilidad por factor</div>

          {SUBS.map(([k, l]) => {
            const vals = vms.map((vm) => Math.round(clamp((vm.sub[k] || 0) * 100)))
            const bi = bestIdx(vals, 'max')
            return (
              <div className="hb-cmp-row sub" key={k}>
                <div className="hb-cmp-rl">{l}</div>
                {vms.map((vm, i) => {
                  const v = vals[i]
                  return (
                    <div className={'hb-cmp-cell ' + (i === bi ? 'best' : '')} key={vm.id}>
                      <span className="hb-cmp-bar"><i style={{ width: v + '%', background: scoreColor(v) }} /></span>
                      <b>{v}</b>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
