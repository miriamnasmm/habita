import { useStore } from '../../store'

// note per layer: colored dot (POI) or line (roads/cycleways)
const LEGEND_NOTES = {
  schools: ['#5E76A8', 'Colegio'], universities: ['#2980B9', 'Universidad'], kindergarten: ['#E67E22', 'Nido'],
  health: ['#2E9E8F', 'Salud'], pharmacies: ['#27AE60', 'Farmacia'],
  banks: ['#34495E', 'Banco'], markets: ['#C2562F', 'Mercado'], malls: ['#8E44AD', 'Mall'],
  police: ['#3a4a8c', 'Comisaría'],
}
const LEGEND_LINES = { cycleways: ['#2E9E8F', 'Ciclovía'], stroads: ['#B6452B', 'Avenida ruidosa'] }

// ported legendInner: only shows notes for visible symbols
function LegendInner() {
  const layers = useStore((s) => s.layers)
  return (
    <>
      <div className="hb-legend-note"><span className="dash"></span> En construcción</div>
      {layers.parks && (
        <div className="hb-legend-note"><span className="lg-park"></span> Parque</div>
      )}
      {Object.keys(LEGEND_NOTES).map((k) => {
        if (!layers[k]) return null
        const [c, l] = LEGEND_NOTES[k]
        return (
          <div key={k} className="hb-legend-note"><span className="lg-dot" style={{ background: c }}></span> {l}</div>
        )
      })}
      {Object.keys(LEGEND_LINES).map((k) => {
        if (!layers[k]) return null
        const [c, l] = LEGEND_LINES[k]
        return (
          <div key={k} className="hb-legend-note"><span className="lg-line" style={{ borderTopColor: c }}></span> {l}</div>
        )
      })}
    </>
  )
}

export default function Legend({ inline = false }) {
  if (inline) return <LegendInner />
  return (
    <div className="hb-legend floating">
      <LegendInner />
    </div>
  )
}
