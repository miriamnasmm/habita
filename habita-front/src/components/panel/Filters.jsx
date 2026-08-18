import { useState } from 'react'
import Icon from '../common/Icon'
import { fmtUSD } from '../../lib/habita'
import { useStore } from '../../store'

// Price slider config per mode (ported from the vanilla PRICE_SLIDER).
const PRICE_SLIDER = {
  venta: { min: 50000, max: 400000, step: 5000, unit: 'USD' },
  alquiler: { min: 0, max: 12000, step: 100, unit: 'USD/mes' },
}

const BEDS = [1, 2, 3, 4]

export default function Filters() {
  const op = useStore((s) => s.op)
  const showFilters = useStore((s) => s.showFilters)
  const price = useStore((s) => s.price)
  const beds = useStore((s) => s.beds)
  const parkMax = useStore((s) => s.parkMax)
  const floorMax = useStore((s) => s.floorMax)
  const avoidNoisy = useStore((s) => s.avoidNoisy)
  const includeUnknown = useStore((s) => s.includeUnknown)
  const setPrice = useStore((s) => s.setPrice)
  const toggleBed = useStore((s) => s.toggleBed)
  const setParkMax = useStore((s) => s.setParkMax)
  const setFloorMax = useStore((s) => s.setFloorMax)
  const setAvoidNoisy = useStore((s) => s.setAvoidNoisy)
  const setIncludeUnknown = useStore((s) => s.setIncludeUnknown)
  const clearFilters = useStore((s) => s.clearFilters)

  const [fino, setFino] = useState(false)

  if (!showFilters) return null

  const sl = PRICE_SLIDER[op] || PRICE_SLIDER.venta
  const gap = op === 'alquiler' ? 100 : 10000
  const priceLbl = `${fmtUSD(price[0])} – ${fmtUSD(price[1])}${op === 'alquiler' ? '/mes' : ''}`

  const onLo = (e) => {
    const lo = Math.min(+e.target.value, price[1] - gap)
    setPrice([lo, price[1]])
  }
  const onHi = (e) => {
    const hi = Math.max(+e.target.value, price[0] + gap)
    setPrice([price[0], hi])
  }

  return (
    <div className="hb-filters" style={{ padding: '4px 20px 16px', gap: 14 }}>
      <div className="hb-block">
        <div className="hb-range-head"><span>Precio ({sl.unit})</span><b>{priceLbl}</b></div>
        <div className="hb-dual">
          <input type="range" min={sl.min} max={sl.max} step={sl.step} value={price[0]} onInput={onLo} onChange={onLo} />
          <input type="range" min={sl.min} max={sl.max} step={sl.step} value={price[1]} onInput={onHi} onChange={onHi} />
        </div>
      </div>
      <div className="hb-block">
        <div className="hb-label">Dormitorios</div>
        <div className="hb-beds">
          {BEDS.map((b) => (
            <button key={b} className={'hb-bed' + (beds.includes(b) ? ' on' : '')} onClick={() => toggleBed(b)}>
              {b === 4 ? '4+' : b}
            </button>
          ))}
        </div>
      </div>
      <button className="hb-fino-toggle" onClick={() => setFino((f) => !f)}>
        <Icon name="sliders" size={16} />
        <span style={{ flex: 1, textAlign: 'left' }}>{fino ? 'Ocultar ajuste fino' : 'Ajuste fino'}</span>
        <Icon name="chev" size={16} />
      </button>
      <div className="hb-block hb-fino" style={fino ? undefined : { display: 'none' }}>
        <div className="hb-range">
          <div className="hb-range-head"><span>Distancia máxima a un parque</span><b>{parkMax} m</b></div>
          <input type="range" min="100" max="1200" step="50" value={parkMax}
            onInput={(e) => setParkMax(+e.target.value)} onChange={(e) => setParkMax(+e.target.value)} />
        </div>
        <div className="hb-range">
          <div className="hb-range-head"><span>Pisos máximos del edificio</span><b>{floorMax}</b></div>
          <input type="range" min="3" max="25" step="1" value={floorMax}
            onInput={(e) => setFloorMax(+e.target.value)} onChange={(e) => setFloorMax(+e.target.value)} />
        </div>
        <div className="hb-label">Avenidas ruidosas</div>
        <div className="hb-radios">
          <label className={!avoidNoisy ? 'on' : ''}>
            <input type="radio" name="noisy" checked={!avoidNoisy} onChange={() => setAvoidNoisy(false)} /> No filtrar
          </label>
          <label className={avoidNoisy ? 'on' : ''}>
            <input type="radio" name="noisy" checked={avoidNoisy} onChange={() => setAvoidNoisy(true)} /> Sin avenidas muy ruidosas
          </label>
        </div>
        <label className="hb-check">
          <input type="checkbox" checked={includeUnknown} onChange={(e) => setIncludeUnknown(e.target.checked)} /> Incluir los que no se sabe
        </label>
      </div>
      <button onClick={() => clearFilters()} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, alignSelf: 'flex-start', padding: '7px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: '#fff', color: 'var(--clay)', fontSize: '.82rem', fontWeight: 600, cursor: 'pointer' }}>
        <Icon name="close" size={14} /> Limpiar filtros
      </button>
    </div>
  )
}
