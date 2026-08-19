import { useState, useRef, useEffect } from 'react'
import Icon, { Logo } from '../common/Icon'
import ResultCard from './ResultCard'
import Survey from './Survey'
import FilterBar from './FilterBar'
import Filters from './Filters'
import DistrictStatsCard from './DistrictStatsCard'
import DistrictCompareModal from './DistrictCompareModal'
import { PROFILE_LIST, PROFILE_SHORT, SORTS, freshLabel } from '../../lib/habita'
import { useStore } from '../../store'

const STEP = 80 // cards added as you scroll down (shows all, without freezing)

export default function Sidebar({ list, totalForOp, shown }) {
  const op = useStore((s) => s.op)
  const setOp = useStore((s) => s.setOp)
  const profile = useStore((s) => s.profile)
  const setProfile = useStore((s) => s.setProfile)
  const sort = useStore((s) => s.sort)
  const setSort = useStore((s) => s.setSort)
  const showSaved = useStore((s) => s.showSaved)
  const setShowSaved = useStore((s) => s.setShowSaved)
  const clearFilters = useStore((s) => s.clearFilters)
  const opLoading = useStore((s) => s.opLoading)
  const [showDistCompare, setShowDistCompare] = useState(false)
  const hint = (PROFILE_LIST.find((p) => p.key === profile) || {}).desc || ''

  // incremental loading on scroll (equivalent to the original's "show all", but smooth)
  const paneRef = useRef(null)
  const [vis, setVis] = useState(STEP)
  useEffect(() => { setVis(STEP); if (paneRef.current) paneRef.current.scrollTop = 0 }, [list])
  const onScroll = () => {
    const el = paneRef.current
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 700) setVis((v) => Math.min(v + STEP, list.length))
  }

  return (
    <>
      <div className="dirA-side-head" id="side-head" style={{ padding: '16px 20px 4px' }}>
        <Logo size={34} />
      </div>
      <div className="hb-fresh" style={{ paddingLeft: 20 }}><Icon name="age" size={13} stroke="var(--clay)" /> {freshLabel()}</div>

      <div className="hb-optoggle">
        <button className={op === 'venta' ? 'on' : ''} onClick={() => setOp('venta')}>Comprar</button>
        <button className={op === 'alquiler' ? 'on' : ''} onClick={() => setOp('alquiler')}>{opLoading ? 'Cargando…' : 'Alquilar'}</button>
      </div>

      <div className="hb-count" id="count" style={{ marginTop: 10 }}>
        <b>{shown}</b> de {totalForOp} en {op === 'alquiler' ? 'alquiler' : 'venta'}
      </div>

      <div className="hb-pchips" style={{ paddingTop: 10 }}>
        {PROFILE_LIST.map((p) => (
          <button key={p.key} className={'hb-pchip' + (p.key === profile ? ' on' : '')} onClick={() => setProfile(p.key)}>
            {PROFILE_SHORT[p.key] || p.label}
          </button>
        ))}
      </div>
      <div className="hb-pchips-hint">{hint}</div>

      <Survey />
      <FilterBar />
      <Filters />

      <div className="dirA-side-scroll" id="results-pane" ref={paneRef} onScroll={onScroll}>
        <DistrictStatsCard />
        <div className="hb-sortbar">
          <label className="hb-sortsel">
            <span>Ordenar</span>
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              {SORTS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
            </select>
            <Icon name="chev" size={14} />
          </label>
          <button className="hb-cmp-btn" title="Comparar distritos" onClick={() => setShowDistCompare(true)}>
            <Icon name="bars" size={12} /><span className="hb-cmp-btn-t">Comparar</span>
          </button>
        </div>
        {list.length === 0 ? (
          showSaved ? (
            <div className="hb-empty">
              <span className="hb-empty-ic"><Icon name="heart" size={26} stroke="var(--clay)" w={1.8} /></span>
              <strong>Aún no guardas nada</strong>
              <p>Toca el ♥ en una propiedad para tenerla siempre a mano.</p>
              <button className="hb-empty-btn" onClick={() => setShowSaved(false)}>Ver todas</button>
            </div>
          ) : (
            <div className="hb-empty">
              <span className="hb-empty-ic"><Icon name="search" size={26} stroke="var(--clay)" w={1.8} /></span>
              <strong>No encontramos propiedades</strong>
              <p>Prueba ampliar el rango de precio o quitar algún filtro.</p>
              <button className="hb-empty-btn" onClick={() => clearFilters()}>Limpiar filtros</button>
            </div>
          )
        ) : (
          list.slice(0, vis).map((vm) => <ResultCard key={vm.op + vm.id} vm={vm} />)
        )}
      </div>

      {showDistCompare && <DistrictCompareModal onClose={() => setShowDistCompare(false)} />}
    </>
  )
}
