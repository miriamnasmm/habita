// Habita — data + scoring engine (ported from the vanilla site, same formulas).
// MAP_GEO viene del <script> en index.html; MAP_DATA lo arma main.jsx desde la API.
import { fetchListings } from './api'

export const MAP_DATA = (typeof window !== 'undefined' && window.MAP_DATA) || { listings: [], districts: {}, active_districts: [], rent_counts: {} }
export const MAP_GEO = (typeof window !== 'undefined' && window.MAP_GEO) || {}

export const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v))
export const fmtUSD = (n) => (n == null ? '—' : '$' + Math.round(n).toLocaleString('en-US'))
export const fmtSoles = (n) => (n == null ? '' : 'S/ ' + Math.round(n).toLocaleString('es-PE'))
export const fmtDist = (m) => (m == null ? '—' : m >= 1000 ? (m / 1000).toFixed(1) + 'km' : Math.round(m) + 'm')

export function priceLabel(vm) {
  const suf = vm.op === 'alquiler' ? '/mes' : ''
  if (vm.priceUSD) return fmtUSD(vm.priceUSD) + suf
  if (vm.priceSoles) return fmtSoles(vm.priceSoles) + suf
  return 'A consultar'
}

const SCALE = [
  { t: 0, c: [150, 52, 36] }, { t: 0.42, c: [182, 69, 43] }, { t: 0.6, c: [216, 154, 63] },
  { t: 0.78, c: [124, 142, 78] }, { t: 1, c: [78, 138, 91] },
]
export function scoreColor(s) {
  const t = clamp(s, 0, 100) / 100
  let a = SCALE[0], b = SCALE[SCALE.length - 1]
  for (let i = 0; i < SCALE.length - 1; i++) { if (t >= SCALE[i].t && t <= SCALE[i + 1].t) { a = SCALE[i]; b = SCALE[i + 1]; break } }
  const span = (b.t - a.t) || 1, k = (t - a.t) / span, ch = (i) => Math.round(a.c[i] + (b.c[i] - a.c[i]) * k)
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`
}
export function scoreWord(s) {
  if (s >= 75) return 'Excelente'; if (s >= 62) return 'Muy buena'
  if (s >= 50) return 'Buena'; if (s >= 40) return 'Regular'; return 'Baja'
}

export const PRESETS = {
  tranquilidad: { stroad: .20, commerce: .16, conn: .10, park: .12, health: .07, modernity: .05, cross: .05, bus: .04, value: .04, school: .07, security: .10 },
  familia: { stroad: .14, commerce: .09, conn: .05, park: .14, health: .09, modernity: .04, cross: .09, bus: .03, value: .04, school: .17, security: .12 },
  inversion: { stroad: .10, commerce: .15, conn: .17, park: .06, health: .04, modernity: .13, cross: .02, bus: .06, value: .21, school: .02, security: .04 },
}
export const PROFILE_LIST = [
  { key: 'tranquilidad', label: 'Tranquilidad / vivir', desc: 'Calles silenciosas y poco tránsito.' },
  { key: 'familia', label: 'Familia con niños', desc: 'Colegios y parques cerca, calles seguras.' },
  { key: 'inversion', label: 'Inversión / reventa', desc: 'Precio por m², conectividad y proyección.' },
  { key: 'personalizado', label: 'Personalizado', desc: 'Ajusta tú mismo lo que más importa.' },
]
export const PROFILE_SHORT = { tranquilidad: 'Tranquilidad', familia: 'Familia', inversion: 'Inversión', personalizado: 'Otro' }
export const SORTS = [
  { key: 'score', label: 'Habitabilidad' }, { key: 'price', label: 'Menor precio' },
  { key: 'area', label: 'Mayor área' }, { key: 'new', label: 'Más nuevo' },
]

export function weightsFor(profile, weights) {
  if (profile === 'personalizado') {
    const w = weights
    return { stroad: w.quiet, park: w.park, commerce: w.commerce, conn: w.commute, value: w.price, school: w.schools, security: w.security }
  }
  return PRESETS[profile] || PRESETS.familia
}
export function scoreOf(vm, w) {
  let s = 0, t = 0
  for (const k in w) { const v = vm.sub[k]; s += (v == null ? 0 : v) * w[k]; t += w[k] }
  return clamp(Math.round((t ? s / t : 0) * 100))
}

function adaptListings(listings) {
  return (listings || []).map((r) => {
    const s = r._score || {}
    const photos = (r.thumbs && r.thumbs.length) ? r.thumbs.slice(0, 8) : (r.fallback_images || []).slice(0, 8)
    return {
      id: r.id, lat: r.lat, lng: r.lng, district: r.district, op: r.op || 'venta',
      address: r.address || r.project_name || 'Sin dirección',
      priceUSD: r.price_usd, priceSoles: r.price_pen, pricePerM2: s.ppm_usd,
      areaM2: r.area_total_m2, beds: r.bedrooms,
      floorsBuilding: s.building_floors_est, floorUnit: s.llm_unit_floor,
      age: s.age_label || '—',
      isProject: r.source === 'developer_site',
      source: r.source === 'developer_site' ? 'Proyecto' : 'Urbania',
      projectStatus: r.project_status, deliveryYear: r.delivery_year,
      url: r.url, whatsapp: r.publisher_whatsapp, photos,
      construction: r.source === 'developer_site',
      sub: { stroad: s.stroad_score, commerce: s.commerce_score, conn: s.conn_score, park: s.park_score, health: s.health_score, modernity: s.modernity, cross: s.cross_score, bus: s.bus_score, value: s.value, security: s.security_score },
      parkDist: s.park_dist_m, parkName: s.park_name,
      noisyDist: s.stroad_nearest_dist_m, noisyName: s.stroad_nearest_name,
      score: 0, rank: 0,
    }
  })
}

// VMS: sale listings on load; rentals are added (lazily) when "Alquilar" is tapped.
export const VMS = adaptListings(MAP_DATA.listings)
let rentLoaded = false
export const rentIsLoaded = () => rentLoaded
export function loadRent() {
  return new Promise((resolve) => {
    if (rentLoaded) return resolve(VMS)
    fetchListings('alquiler')
      .then((listings) => {
        adaptListings(listings).forEach((v) => VMS.push(v))
        rentLoaded = true
        computeSchoolScores()
        resolve(VMS)
      })
      .catch(() => resolve(VMS))
  })
}

export const byId = (id) => VMS.find((v) => v.id === id)

// "Datos actualizados hoy / hace N días" (ported from the vanilla freshLabel)
export function freshLabel() {
  const ts = MAP_DATA.generated_at
  if (!ts) return 'Datos actualizados'
  const days = Math.floor((Date.now() - new Date(ts).getTime()) / 86400000)
  if (days <= 0) return 'Datos actualizados hoy'
  if (days === 1) return 'Datos actualizados ayer'
  return `Datos actualizados hace ${days} días`
}
export const DISTRICTS = MAP_DATA.districts || {}
export const distName = (id) => (DISTRICTS[id] && DISTRICTS[id].name) || id
export const activeDistrictCount = (MAP_DATA.active_districts || Object.keys(DISTRICTS)).length

export function sortList(list, sort) {
  const a = list.slice(), num = (v, d) => (v == null ? d : v)
  if (sort === 'price') a.sort((x, y) => num(x.priceUSD, Infinity) - num(y.priceUSD, Infinity))
  else if (sort === 'area') a.sort((x, y) => num(y.areaM2, -1) - num(x.areaM2, -1))
  else if (sort === 'new') a.sort((x, y) => ((y.isProject ? 1 : 0) - (x.isProject ? 1 : 0)) || num(y.deliveryYear, 0) - num(x.deliveryYear, 0) || num(y.sub && y.sub.modernity, 0) - num(x.sub && x.sub.modernity, 0) || y.score - x.score)
  else a.sort((x, y) => y.score - x.score)
  return a
}

// distance in meters (haversine) — for the proximity filter without depending on Leaflet
export function distMeters(a, b) {
  const R = 6371000, toR = (d) => (d * Math.PI) / 180
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1])
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// Property filter (ported from the vanilla `passes`).
export function passes(vm, st) {
  if ((vm.op || 'venta') !== st.op) return false
  if (st.district && vm.district !== st.district) return false
  if (st.near && distMeters([vm.lat, vm.lng], [st.near.lat, st.near.lng]) > st.near.radiusM) return false
  if (vm.priceUSD != null && (vm.priceUSD < st.price[0] || vm.priceUSD > st.price[1])) return false
  if (st.beds.length) { const ok = st.beds.some((b) => (b === 4 ? vm.beds >= 4 : vm.beds === b)); if (!ok) return false }
  const parkUnknown = vm.parkDist == null || vm.parkDist > 1200
  if (vm.parkDist != null && vm.parkDist > st.parkMax && !(st.includeUnknown && parkUnknown)) return false
  if (vm.floorsBuilding != null && vm.floorsBuilding > st.floorMax) return false
  if (st.avoidNoisy && vm.noisyDist != null && vm.noisyDist < 90) return false
  return true
}

export function reasonsOf(vm) {
  const r = (k) => Math.round(clamp((vm.sub[k] || 0) * 100))
  return [
    { label: 'Calle tranquila', v: r('stroad') },
    { label: 'Seguridad', v: r('security') },
    { label: 'Comercio a pie', v: r('commerce') },
    { label: 'Parque cerca', v: r('park') },
    { label: 'Colegios cerca', v: r('school') },
    { label: 'Salud', v: r('health') },
    { label: 'Transporte', v: r('conn') },
  ]
}

export const opTotal = (op) => VMS.reduce((a, v) => a + ((v.op || 'venta') === op ? 1 : 0), 0)
export const opCount = (id, op) => VMS.reduce((a, v) => a + (v.district === id && (v.op || 'venta') === op ? 1 : 0), 0)

// Per-district stats (for the Compare districts modal and the zone card).
export function districtStats(op, profile, weights) {
  const w = weightsFor(profile, weights)
  const A = MAP_DATA.active_districts || Object.keys(DISTRICTS)
  return A.map((id) => {
    const items = VMS.filter((v) => v.district === id && (v.op || 'venta') === op)
    if (!items.length) return null
    const scores = items.map((v) => scoreOf(v, w))
    const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
    const ppms = items.map((v) => v.pricePerM2).filter((x) => x > 0).sort((a, b) => a - b)
    const medPpm = ppms.length ? ppms[Math.floor(ppms.length / 2)] : null
    return { id, name: distName(id), count: items.length, avgScore, medPpm }
  }).filter(Boolean)
}
export function districtStatsCard(id, op, profile, weights) {
  if (!id) return null
  const w = weightsFor(profile, weights)
  const items = VMS.filter((v) => v.district === id && (v.op || 'venta') === op)
  if (!items.length) return null
  const scores = items.map((v) => scoreOf(v, w))
  const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
  const ppms = items.map((v) => v.pricePerM2).filter((x) => x > 0).sort((a, b) => a - b)
  const medPpm = ppms.length ? ppms[Math.floor(ppms.length / 2)] : null
  const vCount = opCount(id, 'venta')
  const aCount = rentLoaded ? opCount(id, 'alquiler') : ((MAP_DATA.rent_counts || {})[id] || 0)
  return { id, name: distName(id), count: items.length, avg, medPpm, vCount, aCount, op }
}

// Filter + score + sort. `passing` feeds the map; `list` feeds the list (sorted, with saved).
export function computeActive(st) {
  const w = weightsFor(st.profile, st.weights)
  const opAll = VMS.filter((v) => (v.op || 'venta') === st.op)
  opAll.forEach((v) => { v.score = scoreOf(v, w) })
  opAll.slice().sort((a, b) => b.score - a.score).forEach((v, i) => { v.rank = i + 1 })
  const passing = opAll.filter((v) => passes(v, st))
  let list = sortList(passing, st.sort)
  if (st.showSaved) list = list.filter((v) => st.fav[v.id])
  return { passing, list, totalForOp: opAll.length }
}

// schools sub-score from the OSM layer (ported from the vanilla computeSchoolScores)
export function computeSchoolScores() {
  const pts = (MAP_GEO.schools || []).map((s) => [s.lat, s.lng])
  VMS.forEach((vm) => {
    if (!pts.length) { vm.schoolDist = null; vm.sub.school = vm.sub.school == null ? 0 : vm.sub.school; return }
    let min = Infinity
    pts.forEach((p) => { const d = distMeters([vm.lat, vm.lng], p); if (d < min) min = d })
    vm.schoolDist = Math.round(min)
    vm.sub.school = clamp(1 - min / 900, 0, 1)
  })
}
computeSchoolScores() // initial (sale); rentals are recomputed once loaded

// search helpers
export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
export const streetOf = (addr) => String(addr || '').split(',')[0].replace(/\s+\d.*$/, '').trim()
export function streetIndex() {
  const m = {}
  VMS.forEach((vm) => { const st = streetOf(vm.address); if (!st) return; (m[st] || (m[st] = { name: st, items: [] })).items.push(vm) })
  return Object.values(m).sort((a, b) => a.name.localeCompare(b.name))
}

// map layers (layers panel), grouped by category
export const LAYER_GROUPS = [
  { cat: 'Educación', items: [
    { key: 'schools', sw: '#5E76A8', icon: 'school', title: 'Colegios', sub: 'Centros educativos' },
    { key: 'universities', sw: '#2980B9', icon: 'university', title: 'Universidades', sub: 'Educación superior' },
    { key: 'kindergarten', sw: '#E67E22', icon: 'nido', title: 'Nidos', sub: 'Guarderías y nidos' },
  ] },
  { cat: 'Salud', items: [
    { key: 'health', sw: '#2E9E8F', icon: 'med', title: 'Centros de salud', sub: 'Clínicas y postas' },
    { key: 'pharmacies', sw: '#27AE60', icon: 'pharmacy', title: 'Farmacias', sub: 'Boticas y farmacias' },
  ] },
  { cat: 'Servicios', items: [
    { key: 'banks', sw: '#34495E', icon: 'bank', title: 'Bancos', sub: 'Bancos y agencias' },
    { key: 'markets', sw: '#C2562F', icon: 'market', title: 'Mercados', sub: 'Mercados de abasto' },
    { key: 'malls', sw: '#8E44AD', icon: 'mall', title: 'Malls', sub: 'Centros comerciales' },
  ] },
  { cat: 'Movilidad', items: [
    { key: 'cycleways', sw: '#2E9E8F', icon: 'bike', title: 'Ciclovías', sub: 'Red de ciclovías' },
    { key: 'stroads', sw: '#B6452B', icon: 'road', title: 'Avenidas ruidosas', sub: 'Vías de tránsito alto' },
  ] },
  { cat: 'Seguridad', items: [
    { key: 'police', sw: '#3a4a8c', icon: 'shield', title: 'Comisarías', sub: 'Seguridad (proxy)' },
  ] },
]

export const ICON = {
  bed: 'M3 12V7a1 1 0 011-1h6a3 3 0 013 3v3M3 12h16a2 2 0 012 2v4M3 12v6M21 18v-2',
  area: 'M4 9V4h5M20 15v5h-5M4 4l6 6M20 20l-6-6',
  close: 'M6 6l12 12M18 6L6 18',
  pin: 'M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  chev: 'M9 6l6 6-6 6',
  heart: 'M20.8 5.6a5.4 5.4 0 0 0-7.7 0l-1.1 1.1-1.1-1.1a5.4 5.4 0 1 0-7.7 7.7l1.1 1.1 7.7 7.6 7.7-7.6 1.1-1.1a5.4 5.4 0 0 0 0-7.7z',
  sliders: 'M4 6h10M4 12h6M4 18h12M16 4v4M12 10v4M18 16v4',
  search: 'M21 21l-4.3-4.3M11 18a7 7 0 100-14 7 7 0 000 14z',
  home: 'M3 11l9-8 9 8M5 10v10h14V10',
  scale: 'M12 3v18M7 21h10M12 6l-5 2 5-2 5 2-5-2M7 8l-2.5 5h5L7 8zM17 8l-2.5 5h5L17 8z',
  bars: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  swap: 'M7 7h11l-3-3M17 17H6l3 3',
  chevL: 'M15 18l-6-6 6-6',
  med: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  road: 'M6 3 4 21M18 3l2 18M12 4v2M12 10v2M12 16v2',
  park: 'M12 22v-6M9 16a4 4 0 1 1 6 0M12 10V4M10 6l2-2 2 2',
  school: 'M3 9l9-4 9 4-9 4-9-4zM7 11v4c0 1.2 2.4 2 5 2s5-.8 5-2v-4M21 9v4',
  age: 'M12 7v5l3 2M21 12a9 9 0 11-18 0 9 9 0 0118 0z',
  floor: 'M4 20h16M7 20V8l5-3 5 3v12M10 20v-4h4v4',
  share: 'M4 12v7a1 1 0 001 1h14a1 1 0 001-1v-7M16 6l-4-4-4 4M12 2v13',
  check: 'M5 12l4 4 10-10',
  layers: 'M12 2 2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5',
  police: 'M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3z',
  market: 'M4 9h16l-1-4H5L4 9zM5 9v10h14V9M9 19v-5h6v5',
  bike: 'M6 17a3 3 0 100-6 3 3 0 000 6zM18 17a3 3 0 100-6 3 3 0 000 6zM6 14l4-7h4M10 7l4.5 7M14 7h3',
  mall: 'M6 8h12l-1 12H7L6 8zM9 8V6a3 3 0 016 0v2',
  bank: 'M3 21h18M4 21V10M20 21V10M3 10l9-6 9 6M8 21v-6M12 21v-6M16 21v-6',
  university: 'M12 4 2 9l10 5 10-5-10-5zM5 11v5c0 1.2 3.1 3 7 3s7-1.8 7-3v-5',
  pharmacy: 'M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6z',
  nido: 'M12 21a7 7 0 100-14 7 7 0 000 14zM6.5 8a2 2 0 110-4M17.5 8a2 2 0 100-4M9 14c1 1 5 1 6 0',
  shield: 'M12 3l7 3v5c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6l7-3zM9 12l2 2 4-4',
}

