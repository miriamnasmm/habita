import { useState, useEffect, useRef } from 'react'
import Icon from '../common/Icon'
import Legend from './Legend'
import { LAYER_GROUPS } from '../../lib/habita'
import { useStore } from '../../store'

export default function LayersControl() {
  const layers = useStore((s) => s.layers)
  const toggleLayer = useStore((s) => s.toggleLayer)
  const [open, setOpen] = useState(false)        // FAB (mobile)
  const [groupOpen, setGroupOpen] = useState({}) // all groups start collapsed

  const groupCount = (g) => g.items.filter((it) => layers[it.key]).length

  const panelRef = useRef(null)

  // drag AND resize the "Map layers" panel; remembers position + size
  // (localStorage). Double-clicking the title returns it to its default corner and size.
  useEffect(() => {
    const LAYERS_POS_KEY = 'hb_layers_pos'
    const panel = panelRef.current
    const handle = panel && panel.querySelector('.hb-layers-head')
    const grip = panel && panel.querySelector('.hb-layers-resize')
    const bodyEl = panel && panel.querySelector('.hb-layers-body')
    if (!panel || !handle) return
    handle.title = 'Arrastra para mover · doble-click para regresar'
    const op = () => (panel.offsetParent || document.body).getBoundingClientRect()
    const clampW = (w) => Math.max(165, Math.min(360, w))                          // min/max width
    const clampH = (h) => Math.max(70, Math.min(Math.round(window.innerHeight * 0.75), h)) // body height
    const setPos = (l, t) => {
      const o = op(), pr = panel.getBoundingClientRect()
      l = Math.max(4, Math.min(o.width - pr.width - 4, l)); t = Math.max(4, Math.min(o.height - pr.height - 4, t))
      panel.style.left = l + 'px'; panel.style.top = t + 'px'; panel.style.right = 'auto'; panel.style.bottom = 'auto'; return [l, t]
    }
    const anchorLeftTop = () => {                                                   // switch from right/top to left/top
      const pr = panel.getBoundingClientRect(), o = op()
      panel.style.left = (pr.left - o.left) + 'px'; panel.style.top = (pr.top - o.top) + 'px'
      panel.style.right = 'auto'; panel.style.bottom = 'auto'
    }
    const save = (patch) => {                                                       // merge pos+size
      let s = {}; try { s = JSON.parse(localStorage.getItem(LAYERS_POS_KEY) || '{}') || {} } catch (_) {}
      Object.assign(s, patch); try { localStorage.setItem(LAYERS_POS_KEY, JSON.stringify(s)) } catch (_) {}
    }
    const resetPos = () => {                                                        // back to the default CSS
      try { localStorage.removeItem(LAYERS_POS_KEY) } catch (_) {}
      panel.style.left = panel.style.top = panel.style.right = panel.style.bottom = panel.style.width = ''
      if (bodyEl) bodyEl.style.maxHeight = ''
    }
    // apply saved size + position on load
    try {
      const s = JSON.parse(localStorage.getItem(LAYERS_POS_KEY) || 'null')
      if (s) {
        if (s.w) panel.style.width = clampW(s.w) + 'px'
        if (bodyEl && s.h) bodyEl.style.maxHeight = clampH(s.h) + 'px'
        if (typeof s.left === 'number') setPos(s.left, s.top)
      }
    } catch (_) {}

    /* --- move (grabbing the title) --- */
    let drag = false, sx, sy, sl, st
    const onHandleDown = (e) => {
      if (e.button) return                                   // primary button only
      anchorLeftTop(); const pr = panel.getBoundingClientRect(), o = op()
      sl = pr.left - o.left; st = pr.top - o.top; sx = e.clientX; sy = e.clientY
      drag = true; panel.classList.add('dragging')
      try { handle.setPointerCapture(e.pointerId) } catch (_) {}
      e.preventDefault(); e.stopPropagation()                // so the map doesn't drag
    }
    const onHandleMove = (e) => { if (drag) setPos(sl + (e.clientX - sx), st + (e.clientY - sy)) }
    const endDrag = (e) => {
      if (drag) save({ left: parseFloat(panel.style.left) || 0, top: parseFloat(panel.style.top) || 0 })
      drag = false; panel.classList.remove('dragging'); try { handle.releasePointerCapture(e.pointerId) } catch (_) {}
    }
    handle.addEventListener('pointerdown', onHandleDown)
    handle.addEventListener('pointermove', onHandleMove)
    handle.addEventListener('pointerup', endDrag)
    handle.addEventListener('pointercancel', endDrag)
    handle.addEventListener('dblclick', resetPos)            // double-click = return

    /* --- resize (bottom-right corner): width + height --- */
    let onGripDown, onGripMove, endRz
    if (grip) {
      let rz = false, rsx, rsy, rsw, rsh
      onGripDown = (e) => {
        if (e.button) return
        anchorLeftTop()                                      // so the right edge follows the cursor
        const pr = panel.getBoundingClientRect()
        rsx = e.clientX; rsy = e.clientY; rsw = pr.width; rsh = bodyEl ? bodyEl.getBoundingClientRect().height : 0
        rz = true; panel.classList.add('dragging')
        try { grip.setPointerCapture(e.pointerId) } catch (_) {}
        e.preventDefault(); e.stopPropagation()
      }
      onGripMove = (e) => {
        if (!rz) return
        panel.style.width = clampW(rsw + (e.clientX - rsx)) + 'px'                 // narrow/wide
        if (bodyEl) bodyEl.style.maxHeight = clampH(rsh + (e.clientY - rsy)) + 'px' // short/tall
      }
      endRz = (e) => {
        if (rz) save({ w: parseFloat(panel.style.width) || undefined, h: bodyEl ? (parseFloat(bodyEl.style.maxHeight) || undefined) : undefined })
        rz = false; panel.classList.remove('dragging'); try { grip.releasePointerCapture(e.pointerId) } catch (_) {}
      }
      grip.addEventListener('pointerdown', onGripDown)
      grip.addEventListener('pointermove', onGripMove)
      grip.addEventListener('pointerup', endRz)
      grip.addEventListener('pointercancel', endRz)
    }

    return () => {
      handle.removeEventListener('pointerdown', onHandleDown)
      handle.removeEventListener('pointermove', onHandleMove)
      handle.removeEventListener('pointerup', endDrag)
      handle.removeEventListener('pointercancel', endDrag)
      handle.removeEventListener('dblclick', resetPos)
      if (grip) {
        grip.removeEventListener('pointerdown', onGripDown)
        grip.removeEventListener('pointermove', onGripMove)
        grip.removeEventListener('pointerup', endRz)
        grip.removeEventListener('pointercancel', endRz)
      }
    }
  }, [])

  return (
    <div ref={panelRef} className={'hb-layers floating' + (open ? ' open' : '')}>
      <button className="hb-layers-fab" onClick={() => setOpen((o) => !o)}>
        <Icon name="layers" size={16} /> Capas
      </button>
      <div className="hb-layers-head"><Icon name="layers" size={14} /> Capas del mapa</div>
      <div className="hb-layers-body">
        {LAYER_GROUPS.map((g) => {
          const n = groupCount(g)
          return (
            <div key={g.cat} className={'hb-lgroup' + (groupOpen[g.cat] ? ' open' : '')} data-cat={g.cat}>
              <button
                className="hb-lgroup-head"
                onClick={() => setGroupOpen((s) => ({ ...s, [g.cat]: !s[g.cat] }))}
              >
                <span className="hb-lgroup-tt">{g.cat}</span>
                <span className="hb-lgroup-badge" hidden={!n}>{n}</span>
                <span className="hb-lgroup-chev"><Icon name="chev" size={14} /></span>
              </button>
              <div className="hb-lgroup-body">
                {g.items.map((d) => (
                  <button
                    key={d.key}
                    className={'hb-layer' + (layers[d.key] ? ' on' : '')}
                    data-layer={d.key}
                    onClick={() => toggleLayer(d.key)}
                  >
                    <span className="hb-layer-sw" style={{ background: d.sw }}>
                      <Icon name={d.icon} size={13} stroke="#fff" w={2} />
                    </span>
                    <span className="hb-layer-txt"><strong>{d.title}</strong><small>{d.sub}</small></span>
                    <span className="hb-layer-tog"></span>
                  </button>
                ))}
              </div>
            </div>
          )
        })}
        <div className="hb-layers-legend"><Legend inline /></div>
      </div>
      <div className="hb-layers-resize" id="layers-resize" title="Arrastra para ajustar el tamaño"></div>
    </div>
  )
}
