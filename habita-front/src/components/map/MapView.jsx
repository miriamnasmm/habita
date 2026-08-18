import { useEffect, useRef, useState } from 'react'
import { scoreColor, MAP_GEO, DISTRICTS, ICON, VMS } from '../../lib/habita'
import { useStore } from '../../store'

const L = window.L

function svg(name, size = 13, stroke = '#fff', w = 2) {
  const p = ICON[name] || name
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"><path d="${p}"/></svg>`
}
function pinHtml(score, color, selected, construction) {
  const ring = construction ? `<span style="position:absolute;inset:-5px;border:2px dashed ${color};border-radius:50% 50% 50% 0;transform:rotate(-45deg);opacity:.75"></span>` : ''
  const sel = selected ? 'box-shadow:0 0 0 4px rgba(255,255,255,.9), 0 8px 20px rgba(58,34,24,.45);z-index:9999;' : 'box-shadow:0 3px 8px rgba(58,34,24,.35);'
  const size = selected ? 40 : 34
  return `<div style="position:relative;width:${size}px;height:${size}px;">${ring}<div style="width:${size}px;height:${size}px;background:${color};border:2px solid #fff;border-radius:50% 50% 50% 0;transform:rotate(-45deg);${sel}"></div><span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:#fff;font:700 ${selected ? 14 : 12}px 'Hanken Grotesk',sans-serif;">${score}</span></div>`
}
const pinIcon = (vm, sel) => L.divIcon({ className: 'habita-pin', html: pinHtml(vm.score, scoreColor(vm.score), sel, vm.construction), iconSize: [sel ? 40 : 34, sel ? 40 : 34], iconAnchor: [sel ? 20 : 17, sel ? 40 : 34] })
function clusterIcon(cluster) {
  const ms = cluster.getAllChildMarkers()
  let sum = 0, n = 0
  ms.forEach((m) => { const s = m._vm ? m._vm.score : null; if (s != null) { sum += s; n++ } })
  const avg = n ? Math.round(sum / n) : 0
  const count = cluster.getChildCount(), size = count < 10 ? 44 : count < 50 ? 52 : 60
  return L.divIcon({ className: 'habita-cluster', iconSize: [size, size], html: `<div class="hb-cluster" style="width:${size}px;height:${size}px;background:${scoreColor(avg)}"><b>${count}</b><i>hab ${avg}</i></div>` })
}
const polyCenter = (poly) => { let la = 0, ln = 0; poly.forEach((p) => { la += p[0]; ln += p[1] }); return [la / poly.length, ln / poly.length] }

// build the geo layer groups (once) from MAP_GEO
function buildGeo() {
  const g = {}
  const grp = () => L.layerGroup()
  g.parks = grp(); g.schools = grp(); g.health = grp(); g.stroads = grp()
  ;['police', 'markets', 'cycleways', 'malls', 'banks', 'universities', 'pharmacies', 'kindergarten'].forEach((k) => (g[k] = grp()))
  ;(MAP_GEO.parks || []).forEach((pk) => { if (pk.poly) L.polygon(pk.poly, { className: 'hb-park-full', weight: 0, fillColor: '#C4E6AE', fillOpacity: 0.6, smoothFactor: 1 }).bindTooltip(pk.name, { direction: 'top' }).addTo(g.parks) })
  ;(MAP_GEO.stroads || []).forEach((av) => { L.polyline(av.path, { className: 'hb-stroad', weight: av.severity === 'HIGH' ? 7 : 4, opacity: 0.7, lineCap: 'round' }).bindTooltip('Av. ruidosa: ' + av.name, { sticky: true }).addTo(g.stroads) })
  ;(MAP_GEO.schools || []).forEach((s) => { L.marker([s.lat, s.lng], { icon: L.divIcon({ className: 'hb-school-wrap', html: `<span class="hb-school-badge">${svg('school', 13)}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).bindTooltip(s.name, { direction: 'top' }).addTo(g.schools) })
  ;(MAP_GEO.health || []).forEach((h) => { L.marker([h.lat, h.lng], { icon: L.divIcon({ className: 'hb-school-wrap', html: `<span class="hb-health-badge">${svg('med', 13, '#fff', 2.4)}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).bindTooltip(h.name, { direction: 'top' }).addTo(g.health) })
  const badge = (arr, layer, color, ic, label) => (arr || []).forEach((p) => { L.marker([p.lat, p.lng], { icon: L.divIcon({ className: 'hb-school-wrap', html: `<span class="hb-poi-badge" style="background:${color}">${svg(ic, 12)}</span>`, iconSize: [24, 24], iconAnchor: [12, 12] }) }).bindTooltip(label + ': ' + (p.name || '?'), { direction: 'top' }).addTo(layer) })
  badge(MAP_GEO.police, g.police, '#3a4a8c', 'shield', 'Comisaría')
  badge(MAP_GEO.markets, g.markets, '#C2562F', 'market', 'Mercado')
  ;(MAP_GEO.cycleways || []).forEach((c) => { if (c.path && c.path.length > 1) L.polyline(c.path, { color: '#2E9E8F', weight: 3, opacity: 0.75, dashArray: '1 6', lineCap: 'round' }).bindTooltip('Ciclovía' + (c.name ? ': ' + c.name : ''), { sticky: true }).addTo(g.cycleways) })
  badge(MAP_GEO.malls, g.malls, '#8E44AD', 'mall', 'Mall')
  badge(MAP_GEO.banks, g.banks, '#34495E', 'bank', 'Banco')
  badge(MAP_GEO.universities, g.universities, '#2980B9', 'university', 'Universidad')
  badge(MAP_GEO.pharmacies, g.pharmacies, '#27AE60', 'pharmacy', 'Farmacia')
  badge(MAP_GEO.kindergarten, g.kindergarten, '#E67E22', 'nido', 'Nido')
  return g
}
function buildBoundary(map) {
  const rings = (MAP_GEO.boundaries && MAP_GEO.boundaries.length) ? MAP_GEO.boundaries.filter((r) => r && r.length >= 3) : (MAP_GEO.boundary && MAP_GEO.boundary.length >= 3 ? [MAP_GEO.boundary] : [])
  if (!rings.length) return
  if (!map.getPane('district')) { map.createPane('district'); map.getPane('district').style.zIndex = 240; map.getPane('district').style.pointerEvents = 'none' }
  const world = [[-85, -180], [-85, 180], [85, 180], [85, -180]]
  L.polygon([world, ...rings], { pane: 'district', stroke: false, fillColor: '#FBF6F0', fillOpacity: 0.38, interactive: false }).addTo(map)
  rings.forEach((ring) => L.polygon(ring, { pane: 'district', fill: false, color: '#C2562F', weight: 2.4, opacity: 0.9, dashArray: '2 7', lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map))
}
function updatePoi(map, geo, layers) {
  const z = map.getZoom()
  ;[['schools', geo.schools], ['health', geo.health]].forEach(([k, layer]) => {
    const show = layers[k] && z >= 15
    if (show && !map.hasLayer(layer)) layer.addTo(map)
    else if (!show && map.hasLayer(layer)) map.removeLayer(layer)
  })
}
function fitAll(map) {
  const lats = [], lngs = []
  VMS.forEach((v) => { if (v.lat && v.lng) { lats.push(v.lat); lngs.push(v.lng) } })
  if (lats.length < 2) return
  lats.sort((a, b) => a - b); lngs.sort((a, b) => a - b)
  const q = (a, p) => a[Math.min(a.length - 1, Math.max(0, Math.floor(p * (a.length - 1))))]
  map.fitBounds(L.latLngBounds([[q(lats, 0.01), q(lngs, 0.01)], [q(lats, 0.99), q(lngs, 0.99)]]), { padding: [30, 30] })
}

export default function MapView({ passing }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const clusterRef = useRef(null)
  const markersRef = useRef({})
  const geoRef = useRef(null)
  const nearMk = useRef(null)
  const nearCi = useRef(null)
  const selectedId = useStore((s) => s.selectedId)
  const layers = useStore((s) => s.layers)
  const near = useStore((s) => s.near)
  const nearMode = useStore((s) => s.nearMode)
  const flyTo = useStore((s) => s.flyTo)
  const district = useStore((s) => s.district)
  const op = useStore((s) => s.op)
  const rentReady = useStore((s) => s.rentReady)
  const [mapLoading, setMapLoading] = useState(true)
  const didOp = useRef(false)

  useEffect(() => {
    const map = L.map(elRef.current, { center: [-12.0788, -77.0720], zoom: 14, zoomControl: false, scrollWheelZoom: true })
    L.control.zoom({ position: 'topleft' }).addTo(map)
    const baseTiles = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd', attribution: '© OpenStreetMap · © CARTO' }).addTo(map)
    baseTiles.on('load', () => setMapLoading(false))
    setTimeout(() => setMapLoading(false), 4500)
    map.createPane('labels'); map.getPane('labels').style.zIndex = 450; map.getPane('labels').style.pointerEvents = 'none'
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', { maxZoom: 20, subdomains: 'abcd', pane: 'labels' }).addTo(map)
    const cluster = L.markerClusterGroup({ maxClusterRadius: 58, spiderfyOnMaxZoom: true, showCoverageOnHover: false, removeOutsideVisibleBounds: true, chunkedLoading: true, disableClusteringAtZoom: 18, iconCreateFunction: clusterIcon }).addTo(map)
    mapRef.current = map; clusterRef.current = cluster
    const geo = buildGeo(); geoRef.current = geo
    const st = useStore.getState()
    if (st.layers.parks) geo.parks.addTo(map)
    ;['stroads', 'police', 'markets', 'cycleways', 'malls', 'banks', 'universities', 'pharmacies', 'kindergarten'].forEach((k) => { if (st.layers[k]) geo[k].addTo(map) })
    updatePoi(map, geo, st.layers)
    map.on('zoomend', () => updatePoi(map, geoRef.current, useStore.getState().layers))
    map.on('click', (e) => { const s = useStore.getState(); if (s.nearMode) s.setNear({ lat: e.latlng.lat, lng: e.latlng.lng, radiusM: (s.near && s.near.radiusM) || 1500, label: null }) })
    setTimeout(() => { map.invalidateSize(); fitAll(map) }, 60)
    let rt
    const onResize = () => { clearTimeout(rt); rt = setTimeout(() => map.invalidateSize(), 150) }
    window.addEventListener('resize', onResize)
    return () => { window.removeEventListener('resize', onResize); clearTimeout(rt); map.remove() }
  }, [])

  // property markers (change with profile/mode/district/filters)
  useEffect(() => {
    const cluster = clusterRef.current
    if (!cluster) return
    cluster.clearLayers(); markersRef.current = {}
    const select = useStore.getState().select
    const arr = passing.map((vm) => {
      const m = L.marker([vm.lat, vm.lng], { icon: pinIcon(vm, vm.id === selectedId) })
      m._vm = vm; m.on('click', () => select(vm.id)); markersRef.current[vm.id] = m
      return m
    })
    cluster.addLayers(arr)
  }, [passing]) // eslint-disable-line react-hooks/exhaustive-deps

  // selection → fly to and highlight
  useEffect(() => {
    const map = mapRef.current, cluster = clusterRef.current
    if (!map || !cluster) return
    const m = markersRef.current[selectedId]
    if (m) {
      if (cluster.hasLayer(m) && cluster.zoomToShowLayer) cluster.zoomToShowLayer(m, () => m.setIcon(pinIcon(m._vm, true)))
      else { m.setIcon(pinIcon(m._vm, true)); map.panTo([m._vm.lat, m._vm.lng], { animate: true, duration: 0.5 }) }
    }
    return () => { const mm = markersRef.current[selectedId]; if (mm) mm.setIcon(pinIcon(mm._vm, false)) }
  }, [selectedId])

  // visible layers
  useEffect(() => {
    const map = mapRef.current, geo = geoRef.current
    if (!map || !geo) return
    ;['parks', 'stroads', 'police', 'markets', 'cycleways', 'malls', 'banks', 'universities', 'pharmacies', 'kindergarten'].forEach((k) => {
      const lyr = geo[k]; if (!lyr) return
      if (layers[k]) { if (!map.hasLayer(lyr)) lyr.addTo(map) } else if (map.hasLayer(lyr)) map.removeLayer(lyr)
    })
    updatePoi(map, geo, layers)
  }, [layers])

  // proximity point (indigo pin + radius circle, draggable)
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    if (!near) {
      if (nearMk.current) { map.removeLayer(nearMk.current); nearMk.current = null }
      if (nearCi.current) { map.removeLayer(nearCi.current); nearCi.current = null }
      return
    }
    const ll = [near.lat, near.lng]
    if (!nearMk.current) {
      nearMk.current = L.marker(ll, { draggable: true, zIndexOffset: 1000, icon: L.divIcon({ className: 'hb-near-pin', html: `<span>${svg('pin', 16, '#fff', 2)}</span>`, iconSize: [34, 34], iconAnchor: [17, 17] }) }).addTo(map)
      nearMk.current.on('drag', (e) => { if (nearCi.current) nearCi.current.setLatLng(e.latlng) })
      nearMk.current.on('dragend', (e) => { const s = useStore.getState(); s.setNear({ lat: e.target.getLatLng().lat, lng: e.target.getLatLng().lng, radiusM: (s.near && s.near.radiusM) || 1500, label: s.near && s.near.label }) })
    } else nearMk.current.setLatLng(ll)
    if (!nearCi.current) nearCi.current = L.circle(ll, { radius: near.radiusM, color: '#3a4a8c', weight: 1.5, fillColor: '#3a4a8c', fillOpacity: 0.07, interactive: false }).addTo(map)
    else { nearCi.current.setLatLng(ll); nearCi.current.setRadius(near.radiusM) }
  }, [near])

  // crosshair cursor in "set point" mode
  useEffect(() => {
    const map = mapRef.current; if (!map) return
    map.getContainer().style.cursor = nearMode ? 'crosshair' : ''
  }, [nearMode])

  // fly command (from the search box / compare districts)
  useEffect(() => {
    const map = mapRef.current; if (!map || !flyTo) return
    if (flyTo.fitAll) fitAll(map)
    else if (flyTo.bounds) map.fitBounds(L.latLngBounds(flyTo.bounds), { padding: [60, 60], maxZoom: 17 })
    else if (flyTo.center) map.setView(flyTo.center, flyTo.zoom || 15, { animate: true })
    useStore.getState().setFlyTo(null)
  }, [flyTo])

  // when the zone changes, fly to its center
  useEffect(() => {
    const map = mapRef.current; if (!map || !district) return
    const d = DISTRICTS[district]
    if (d && d.center) map.setView(d.center, d.zoom || 15, { animate: true })
  }, [district])

  // when switching Buy/Rent, frame the properties of that mode
  useEffect(() => {
    if (!didOp.current) { didOp.current = true; return }
    const map = mapRef.current; if (!map) return
    const pts = VMS.filter((v) => (v.op || 'venta') === op && v.lat && v.lng).map((v) => [v.lat, v.lng])
    if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [30, 30] })
  }, [op, rentReady])

  return (
    <>
      <div className="habita-map" ref={elRef} />
      {mapLoading && <div className="hb-map-loading"><span className="hb-spin" /><span>Cargando mapa…</span></div>}
    </>
  )
}
