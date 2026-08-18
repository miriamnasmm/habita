import Icon from '../common/Icon'
import { useStore } from '../../store'

// Count of active filters (ported from the vanilla filterCount, with price per mode).
function filterCount(s) {
  let n = 0
  const def = s.op === 'alquiler' ? [0, 4000] : [80000, 350000]
  if (s.price[0] !== def[0] || s.price[1] !== def[1]) n++
  if (s.beds.length) n++
  if (s.avoidNoisy) n++
  if (s.parkMax !== 800) n++
  if (s.floorMax !== 20) n++
  return n
}

export default function FilterBar() {
  const showFilters = useStore((s) => s.showFilters)
  const showSaved = useStore((s) => s.showSaved)
  const near = useStore((s) => s.near)
  const nearMode = useStore((s) => s.nearMode)
  const setShowFilters = useStore((s) => s.setShowFilters)
  const setShowSaved = useStore((s) => s.setShowSaved)
  const setNearMode = useStore((s) => s.setNearMode)
  const clearNear = useStore((s) => s.clearNear)
  const clearAll = useStore((s) => s.clearAll)
  const showToast = useStore((s) => s.showToast)

  const active = useStore(filterCount)
  const saved = useStore((s) => Object.values(s.fav).filter(Boolean).length)
  const nearOn = !!(near || nearMode)
  const canClear = active > 0 || nearOn || showSaved

  return (
    <div className="hb-filterbar">
      <div className="hb-fbtns">
        <button className={'hb-fbtn' + (showFilters ? ' on' : '')} onClick={() => setShowFilters(!showFilters)}>
          <Icon name="sliders" size={15} /><span>Filtros</span>
          {active ? <span className="hb-fbadge">{active}</span> : null}
        </button>
        <button className={'hb-fbtn' + (nearOn ? ' on' : '')}
          onClick={() => { if (nearOn) clearNear(); else { setNearMode(true); showToast('Toca el mapa para fijar tu punto (trabajo, colegio…)') } }}>
          <Icon name="pin" size={15} /><span>Cercanía</span>
        </button>
        <button className={'hb-savedtog' + (showSaved ? ' on' : '')} onClick={() => setShowSaved(!showSaved)}>
          <Icon name="heart" size={15} fill={showSaved ? 'currentColor' : 'none'} /><span>Guardadas</span>
          {saved ? <span className="hb-fbadge alt">{saved}</span> : null}
        </button>
      </div>
      <button className="hb-fclear" disabled={!canClear} onClick={() => clearAll()}>Limpiar</button>
    </div>
  )
}
