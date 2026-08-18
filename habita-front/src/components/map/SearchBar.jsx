import { useState, useRef, useEffect } from 'react'
import Icon from '../common/Icon'
import { useStore } from '../../store'
import {
  DISTRICTS, distName, norm, streetOf, streetIndex, opCount, opTotal, MAP_GEO, VMS,
} from '../../lib/habita'
import { geocode } from '../../lib/api'

// center of a polygon (average of vertices) — ported from the vanilla polyCenter.
function polyCenter(poly) {
  let la = 0, ln = 0
  poly.forEach((p) => { la += p[0]; ln += p[1] })
  return [la / poly.length, ln / poly.length]
}

// District list for the search box (most properties first) — ported from the vanilla.
const DIST_COUNT = {}
VMS.forEach((v) => { if (v.district) DIST_COUNT[v.district] = (DIST_COUNT[v.district] || 0) + 1 })
const DIST_LIST = (() => {
  const A = Object.keys(DISTRICTS)
  return A.map((id) => ({
    id, name: DISTRICTS[id].name || id,
    center: DISTRICTS[id].center || [-12.0748, -77.0628], zoom: DISTRICTS[id].zoom || 15,
    count: DIST_COUNT[id] || 0,
  })).sort((a, b) => b.count - a.count)
})()

export default function SearchBar() {
  const district = useStore((s) => s.district)
  const op = useStore((s) => s.op)
  const setDistrict = useStore((s) => s.setDistrict)
  const setNear = useStore((s) => s.setNear)
  const select = useStore((s) => s.select)
  const setFlyTo = useStore((s) => s.setFlyTo)

  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [geo, setGeo] = useState([]) // exact addresses (geocoding API)
  const hostRef = useRef(null)
  const inputRef = useRef(null)

  // debounced geocoding (Geoapify, with API key)
  useEffect(() => {
    const v = q.trim()
    if (v.length < 4) { setGeo([]); return }
    const t = setTimeout(() => { geocode(v).then(setGeo) }, 350)
    return () => clearTimeout(t)
  }, [q])

  // close on outside click (ported from the vanilla global listener)
  useEffect(() => {
    const onDoc = (e) => { if (hostRef.current && !hostRef.current.contains(e.target)) { setOpen(false) } }
    document.addEventListener('click', onDoc)
    return () => document.removeEventListener('click', onDoc)
  }, [])

  useEffect(() => { if (open && inputRef.current) inputRef.current.focus() }, [open])

  const closeSearch = () => setOpen(false)

  function onSearchPick(kind, key, name) {
    if (kind === 'addr') {
      const parts = String(key).split(','), lat = +parts[0], lng = +parts[1]
      if (isFinite(lat) && isFinite(lng)) { closeSearch(); setNear({ lat, lng, radiusM: 1500, label: name || null }); setFlyTo({ center: [lat, lng], zoom: 17 }) }
      return
    }
    if (kind === 'poi') {
      const parts = String(key).split(','), lat = +parts[0], lng = +parts[1]
      if (isFinite(lat) && isFinite(lng)) {
        closeSearch()
        setNear({ lat, lng, radiusM: 1500, label: name || null })
        setFlyTo({ center: [lat, lng], zoom: 16 })
      }
      return
    }
    if (kind === 'dist') {
      closeSearch()
      if (key === '__all__') { setDistrict(null); setFlyTo({ fitAll: true }); return }
      if (!DISTRICTS[key]) return
      setDistrict(key) // the fly is handled by the `district` effect in MapView (a single animation)
      return
    }
    if (kind === 'street') {
      const items = VMS.filter((vm) => streetOf(vm.address) === key)
      closeSearch()
      if (items.length === 1) { select(items[0].id) }
      else if (items.length) { setFlyTo({ bounds: items.map((v) => [v.lat, v.lng]) }) }
      return
    }
    if (kind === 'park') {
      const p = (MAP_GEO.parks || []).find((x) => x.name === key)
      if (p) { closeSearch(); const c = p.poly ? polyCenter(p.poly) : [p.lat, p.lng]; setFlyTo({ center: c, zoom: 17 }) }
      return
    }
    if (kind === 'av') {
      const a = (MAP_GEO.stroads || []).find((x) => x.name === key)
      if (a && a.path) { closeSearch(); setFlyTo({ bounds: a.path }) }
      return
    }
  }

  // ---- results (ported from renderSearchResults) ----
  const nq = norm(q)
  const showAll = !nq.length
  const dist = DIST_LIST.filter((d) => norm(d.name).includes(nq))
  const streets = nq.length ? streetIndex().filter((s) => norm(s.name).includes(nq)).slice(0, 7) : []
  const parks = nq.length ? (MAP_GEO.parks || []).filter((p) => norm(p.name).includes(nq)).slice(0, 5) : []
  const avs = nq.length ? (MAP_GEO.stroads || []).filter((a) => norm(a.name).includes(nq)).slice(0, 5) : []

  const poiGroups = [
    { arr: MAP_GEO.schools, group: 'Colegios', ic: 'school', col: '#5E76A8' },
    { arr: MAP_GEO.health, group: 'Salud', ic: 'med', col: '#2E9E8F' },
  ]
  const otros = nq.length
    ? [].concat(MAP_GEO.markets || [], MAP_GEO.malls || [], MAP_GEO.universities || [],
        MAP_GEO.banks || [], MAP_GEO.pharmacies || [], MAP_GEO.kindergarten || [], MAP_GEO.police || [])
        .filter((p) => p.name && norm(p.name).includes(nq)).slice(0, 6)
    : []

  const groups = []
  if (geo.length) {
    groups.push(
      <div className="hb-srch-group" key="g-dir">Direcciones</div>,
      ...geo.map((g, i) => (
        <button className="hb-dist" key={'dir-' + i} onClick={() => onSearchPick('addr', g.lat + ',' + g.lng, g.name)}>
          <span className="hb-dist-ic"><Icon name="pin" size={14} stroke="var(--clay)" /></span>
          <span className="hb-dist-name">{g.name}</span>
          <span className="hb-dist-badge data">Ir</span>
        </button>
      )),
    )
  }
  if (dist.length || showAll) {
    groups.push(
      <div className="hb-srch-group" key="g-zonas">Zonas</div>,
      ...(showAll ? [(
        <button className={'hb-dist' + (!district ? ' on' : '')} key="d-all"
          onClick={() => onSearchPick('dist', '__all__')}>
          <span className="hb-dist-ic"><Icon name="search" size={14} stroke="var(--muted)" /></span>
          <span className="hb-dist-name">Todas las zonas</span>
          <span className="hb-dist-badge data">{opTotal(op)}</span>
        </button>
      )] : []),
      ...dist.map((d) => (
        <button className={'hb-dist' + (d.id === district ? ' on' : '')} key={'d-' + d.id}
          onClick={() => onSearchPick('dist', d.id)}>
          <span className="hb-dist-ic"><Icon name="search" size={14} stroke="var(--muted)" /></span>
          <span className="hb-dist-name">{d.name}</span>
          <span className="hb-dist-badge data">{opCount(d.id, op)}</span>
        </button>
      )),
    )
  }
  if (streets.length) {
    groups.push(
      <div className="hb-srch-group" key="g-calles">Calles y direcciones</div>,
      ...streets.map((s) => (
        <button className="hb-dist" key={'s-' + s.name} onClick={() => onSearchPick('street', s.name)}>
          <span className="hb-dist-ic"><Icon name="pin" size={14} stroke="var(--clay)" /></span>
          <span className="hb-dist-name">{s.name}</span>
          <span className="hb-dist-badge data">{s.items.length} aviso{s.items.length > 1 ? 's' : ''}</span>
        </button>
      )),
    )
  }
  if (parks.length) {
    groups.push(
      <div className="hb-srch-group" key="g-parques">Parques</div>,
      ...parks.map((p) => (
        <button className="hb-dist" key={'p-' + p.name} onClick={() => onSearchPick('park', p.name)}>
          <span className="hb-dist-ic"><Icon name="park" size={14} stroke="#4E8A5B" /></span>
          <span className="hb-dist-name">{p.name}</span>
        </button>
      )),
    )
  }
  if (avs.length) {
    groups.push(
      <div className="hb-srch-group" key="g-avenidas">Avenidas</div>,
      ...avs.map((a) => (
        <button className="hb-dist" key={'a-' + a.name} onClick={() => onSearchPick('av', a.name)}>
          <span className="hb-dist-ic"><Icon name="road" size={14} stroke="#B6452B" /></span>
          <span className="hb-dist-name">{a.name}</span>
        </button>
      )),
    )
  }
  if (nq.length) {
    poiGroups.forEach((g) => {
      const hits = (g.arr || []).filter((p) => p.name && norm(p.name).includes(nq)).slice(0, 5)
      if (hits.length) {
        groups.push(
          <div className="hb-srch-group" key={'g-' + g.group}>{g.group}</div>,
          ...hits.map((p) => (
            <button className="hb-dist" key={g.group + '-' + p.name + '-' + p.lat}
              onClick={() => onSearchPick('poi', p.lat + ',' + p.lng, p.name)}>
              <span className="hb-dist-ic"><Icon name={g.ic} size={14} stroke={g.col} /></span>
              <span className="hb-dist-name">{p.name}</span>
              <span className="hb-dist-badge data">Fijar punto</span>
            </button>
          )),
        )
      }
    })
    if (otros.length) {
      groups.push(
        <div className="hb-srch-group" key="g-lugares">Lugares</div>,
        ...otros.map((p) => (
          <button className="hb-dist" key={'o-' + p.name + '-' + p.lat}
            onClick={() => onSearchPick('poi', p.lat + ',' + p.lng, p.name)}>
            <span className="hb-dist-ic"><Icon name="pin" size={14} stroke="var(--clay)" /></span>
            <span className="hb-dist-name">{p.name}</span>
            <span className="hb-dist-badge data">Fijar punto</span>
          </button>
        )),
      )
    }
  }

  const empty = groups.length === 0

  return (
    <div className={'hb-search' + (open ? ' open' : '')} ref={hostRef}>
      <button className="hb-search-bar" onClick={(e) => {
        e.stopPropagation()
        const next = !open
        setOpen(next)
        if (next) setQ('')
      }}>
        <Icon name="search" size={18} />
        <span className="hb-search-label">
          <small>Zona</small>
          <strong>{district ? distName(district) : 'Todas las zonas'}</strong>
        </span>
        <span className="hb-chevd"><Icon name="chev" size={16} /></span>
      </button>
      <div className="hb-search-panel" hidden={!open}>
        <input className="hb-search-input" ref={inputRef} value={q}
          placeholder="Buscar zona, calle, colegio, hospital…" autoComplete="off"
          onChange={(e) => setQ(e.target.value)} />
        <div className="hb-search-list">
          {empty ? (
            <div className="hb-srch-empty">Sin coincidencias.<br /><small>Pulsa Enter para buscar “{q}” en el mapa.</small></div>
          ) : groups}
        </div>
      </div>
    </div>
  )
}
