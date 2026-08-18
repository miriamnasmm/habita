import { useState } from 'react'
import Icon from '../common/Icon'
import { useStore } from '../../store'

// Labels for the custom survey (ported from the vanilla CWLABELS).
const CWLABELS = [
  ['quiet', 'Tranquilidad'],
  ['security', 'Seguridad'],
  ['park', 'Parques cerca'],
  ['schools', 'Colegios cerca'],
  ['commerce', 'Comercio a pie'],
  ['commute', 'Transporte'],
  ['price', 'Buen precio/m²'],
]
const LEVELS = [['nada', 'Nada', 15], ['algo', 'Algo', 50], ['mucho', 'Mucho', 90]]
const levelOf = (v) => (v < 33 ? 'nada' : v < 70 ? 'algo' : 'mucho')

export default function Survey() {
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)
  const surveyOpen = useStore((s) => s.surveyOpen)
  const setWeights = useStore((s) => s.setWeights)
  const setSurveyOpen = useStore((s) => s.setSurveyOpen)

  const [draft, setDraft] = useState(weights)

  if (profile !== 'personalizado') return null

  if (!surveyOpen) {
    return (
      <button className="hb-survey-toggle" onClick={() => { setDraft(weights); setSurveyOpen(true) }}>
        <Icon name="sliders" size={15} />
        <span>Editar mis prioridades</span>
        <span className="hb-survey-chev"><Icon name="chev" size={15} /></span>
      </button>
    )
  }

  const go = () => { setWeights(draft); setSurveyOpen(false) }

  return (
    <div className="hb-survey">
      <div className="hb-survey-head">
        <strong>¿Qué te importa más?</strong>
        <small>Marca cada cosa y pulsa <b>Ver resultados</b>.</small>
      </div>
      {CWLABELS.map(([k, l]) => {
        const cur = levelOf(draft[k])
        return (
          <div key={k} className="hb-srow">
            <span className="hb-srow-l">{l}</span>
            <div className="hb-seg-group">
              {LEVELS.map(([id, lab, val]) => (
                <button key={id} className={'hb-seg' + (cur === id ? ' on' : '')}
                  onClick={() => setDraft((d) => ({ ...d, [k]: val }))}>
                  {lab}
                </button>
              ))}
            </div>
          </div>
        )
      })}
      <button className="hb-survey-go" onClick={go}>
        <Icon name="check" size={16} stroke="#fff" w={2.4} />Ver resultados
      </button>
    </div>
  )
}
