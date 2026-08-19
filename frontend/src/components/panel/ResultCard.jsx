import Icon from '../common/Icon'
import { scoreColor, scoreWord, priceLabel } from '../../lib/habita'
import { useStore } from '../../store'

export default function ResultCard({ vm }) {
  const selectedId = useStore((s) => s.selectedId)
  const fav = useStore((s) => s.fav[vm.id])
  const cmp = useStore((s) => s.compare.includes(vm.id))
  const select = useStore((s) => s.select)
  const toggleFav = useStore((s) => s.toggleFav)
  const toggleCompare = useStore((s) => s.toggleCompare)
  const color = scoreColor(vm.score)
  const meta = [vm.beds != null ? vm.beds + ' dorm.' : '', vm.areaM2 != null ? vm.areaM2 + ' m²' : ''].filter(Boolean).join(' · ')

  return (
    <div className={'hb-rcard' + (vm.id === selectedId ? ' on' : '')} role="button" tabIndex={0}
      onClick={() => select(vm.id)}>
      <span className="hb-rcard-media">
        {vm.photos && vm.photos.length ? <img src={vm.photos[0]} loading="lazy" onError={(e) => (e.target.style.display = 'none')} /> : null}
        <span className="hb-ph"><Icon name="home" size={22} stroke="#C9AE92" /></span>
        <span className="hb-rcard-score" style={{ background: color }}>{vm.score}</span>
        {vm.construction ? <span className="hb-rcard-constr">Proyecto</span> : null}
      </span>
      <span className="hb-rcard-body">
        <span className="hb-rcard-price">{priceLabel(vm)}</span>
        <span className="hb-rcard-addr">{vm.address}</span>
        <span className="hb-rcard-meta">{meta}</span>
        <span className="hb-rcard-word" style={{ color }}>{scoreWord(vm.score)} para vivir</span>
      </span>
      <span className="hb-rcard-acts">
        <button className={'hb-rc-fav' + (fav ? ' on' : '')} title="Guardar" aria-label="Guardar"
          onClick={(e) => { e.stopPropagation(); toggleFav(vm.id) }}>
          <Icon name="heart" size={16} fill={fav ? 'currentColor' : 'none'} />
        </button>
        <button className={'hb-rc-cmp' + (cmp ? ' on' : '')} title="Comparar" aria-label="Comparar"
          onClick={(e) => { e.stopPropagation(); toggleCompare(vm.id) }}>
          <Icon name="scale" size={16} />
        </button>
      </span>
    </div>
  )
}
