import { useEffect, useMemo } from 'react'
import MapView from './components/map/MapView'
import SearchBar from './components/map/SearchBar'
import NearPanel from './components/map/NearPanel'
import LayersControl from './components/map/LayersControl'
import Legend from './components/map/Legend'
import Sidebar from './components/panel/Sidebar'
import DetailPanel from './components/detail/DetailPanel'
import CompareBar from './components/compare/CompareBar'
import Toast from './components/common/Toast'
import { computeActive, loadRent } from './lib/habita'
import { useStore } from './store'

export default function App() {
  const op = useStore((s) => s.op)
  const profile = useStore((s) => s.profile)
  const weights = useStore((s) => s.weights)
  const district = useStore((s) => s.district)
  const sort = useStore((s) => s.sort)
  const showSaved = useStore((s) => s.showSaved)
  const fav = useStore((s) => s.fav)
  const price = useStore((s) => s.price)
  const beds = useStore((s) => s.beds)
  const parkMax = useStore((s) => s.parkMax)
  const floorMax = useStore((s) => s.floorMax)
  const avoidNoisy = useStore((s) => s.avoidNoisy)
  const includeUnknown = useStore((s) => s.includeUnknown)
  const near = useStore((s) => s.near)
  const rentReady = useStore((s) => s.rentReady)
  const setRentReady = useStore((s) => s.setRentReady)
  const selectedId = useStore((s) => s.selectedId)
  const setOpLoading = useStore((s) => s.setOpLoading)

  // Lazy-load the rentals the first time "Alquilar" is tapped.
  useEffect(() => {
    if (op === 'alquiler' && !rentReady) {
      setOpLoading(true)
      loadRent().then(() => { setRentReady(true); setOpLoading(false) })
    }
  }, [op, rentReady, setRentReady, setOpLoading])

  // Al arrancar: carga los favoritos guardados desde el backend.
  useEffect(() => {
    useStore.getState().loadFavorites()
  }, [])

  // boot loader + deep-links (#p=<id> opens a property, #z=<id> selects a zone)
  useEffect(() => {
    const bl = document.getElementById('boot-loader'); if (bl) bl.remove()
    const h = window.location.hash
    const mp = h.match(/[#&]p=([^&]+)/); if (mp) useStore.getState().select(decodeURIComponent(mp[1]))
    const mz = h.match(/[#&]z=([^&]+)/); if (mz) useStore.getState().setDistrict(decodeURIComponent(mz[1]))
  }, [])

  // keeps the hash in sync with the open property
  useEffect(() => {
    if (selectedId != null) window.history.replaceState(null, '', '#p=' + encodeURIComponent(selectedId))
    else if (window.location.hash.startsWith('#p=')) window.history.replaceState(null, '', window.location.pathname + window.location.search)
  }, [selectedId])

  // Responsive: toggles the is-mobile class (<820px) that restructures the layout (stacked panel, detail card as bottom-sheet).
  useEffect(() => {
    const onResize = () => document.body.classList.toggle('is-mobile', window.innerWidth < 820)
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const { passing, list, totalForOp } = useMemo(
    () => computeActive({ op, profile, weights, district, sort, showSaved, fav, price, beds, parkMax, floorMax, avoidNoisy, includeUnknown, near }),
    [op, profile, weights, district, sort, showSaved, fav, price, beds, parkMax, floorMax, avoidNoisy, includeUnknown, near, rentReady],
  )

  return (
    <div id="app" className="dirA">
      <div className="dirA-side">
        <Sidebar list={list} totalForOp={totalForOp} shown={passing.length} />
      </div>
      <div className="dirA-map">
        <MapView passing={passing} />
        <SearchBar />
        <Legend />
        <LayersControl />
        <NearPanel />
        <CompareBar />
        <DetailPanel />
        <Toast />
      </div>
    </div>
  )
}
