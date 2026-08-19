import { useState } from 'react'
import Icon from '../common/Icon'
import CompareModal from './CompareModal'
import { byId, scoreColor, fmtUSD } from '../../lib/habita'
import { useStore } from '../../store'

export default function CompareBar() {
  const compare = useStore((s) => s.compare)
  const toggleCompare = useStore((s) => s.toggleCompare)
  const clearCompare = useStore((s) => s.clearCompare)
  const [open, setOpen] = useState(false)

  if (compare.length === 0) return null

  return (
    <>
      <div id="compare-bar" className="hb-cmpbar">
        <div className="hb-cmpbar-items">
          {compare.map((id) => {
            const vm = byId(id)
            if (!vm) return null
            const c = scoreColor(vm.score)
            return (
              <span className="hb-cmpbar-item" key={id}>
                <span className="hb-cmpbar-sc" style={{ background: c }}>{vm.score}</span>
                {fmtUSD(vm.priceUSD)}
                <button aria-label="Quitar" onClick={() => toggleCompare(id)}><Icon name="close" size={13} /></button>
              </span>
            )
          })}
        </div>
        <div className="hb-cmpbar-actions">
          <button className="hb-cmpbar-clear" onClick={clearCompare}>Limpiar</button>
          <button className="hb-cmpbar-go" disabled={compare.length < 2} onClick={() => setOpen(true)}>
            Comparar {compare.length > 1 ? '(' + compare.length + ')' : ''}
          </button>
        </div>
      </div>
      {open ? <CompareModal onClose={() => setOpen(false)} /> : null}
    </>
  )
}
