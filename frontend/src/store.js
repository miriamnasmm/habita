import { create } from 'zustand'
import { getFavorites, addFavorite, removeFavorite } from './lib/api'

// Global state (equivalent to the vanilla `state` object) + actions.
export const useStore = create((set, get) => ({
  op: 'venta',
  profile: 'familia',
  weights: { quiet: 60, park: 60, commerce: 50, commute: 45, price: 40, schools: 60, security: 55 },
  price: [80000, 350000],
  beds: [],
  parkMax: 800,
  floorMax: 20,
  avoidNoisy: true,
  includeUnknown: true,
  sort: 'score',
  district: null,
  selectedId: null,
  fav: {},
  showSaved: false,
  showFilters: false,
  compare: [],
  near: null, // {lat, lng, radiusM, label}
  nearMode: false,
  surveyOpen: true,
  rentReady: false,
  toast: null,
  _toastId: 0,
  opLoading: false, // while the rental data is downloading
  flyTo: null, // {center,zoom} | {bounds:[[lat,lng],[lat,lng]]} — navigation command for the map
  layers: { parks: true, schools: false, health: false, stroads: false, police: false, markets: false, cycleways: false, malls: false, banks: false, universities: false, pharmacies: false, kindergarten: false },

  setOp: (op) => set({ op, price: op === 'alquiler' ? [0, 4000] : [80000, 350000] }),
  setProfile: (profile) => set({ profile }),
  setWeights: (weights) => set({ weights }),
  setSort: (sort) => set({ sort }),
  setDistrict: (district) => set({ district }),
  select: (selectedId) => set({ selectedId }),
  setShowSaved: (showSaved) => set({ showSaved }),
  setShowFilters: (showFilters) => set({ showFilters }),
  setRentReady: (rentReady) => set({ rentReady }),
  // Marca/desmarca un favorito: actualiza al instante y lo guarda en el backend.
  // Si el backend falla, revierte y avisa.
  toggleFav: (id) => {
    const nowFav = !get().fav[id]
    set((s) => ({ fav: { ...s.fav, [id]: nowFav } }))
    const req = nowFav ? addFavorite(id) : removeFavorite(id)
    req.catch(() => {
      set((s) => ({ fav: { ...s.fav, [id]: !nowFav } }))
      get().showToast('No se pudo guardar el favorito')
    })
  },
  // Carga los favoritos guardados desde el backend (al arrancar la app).
  loadFavorites: async () => {
    const ids = await getFavorites()
    const fav = {}
    ids.forEach((id) => { fav[id] = true })
    set({ fav })
  },
  savedCount: () => 0, // convenience helper (use Object.values in components)

  setPrice: (price) => set({ price }),
  toggleBed: (b) => set((s) => ({ beds: s.beds.includes(b) ? s.beds.filter((x) => x !== b) : [...s.beds, b] })),
  setParkMax: (parkMax) => set({ parkMax }),
  setFloorMax: (floorMax) => set({ floorMax }),
  setAvoidNoisy: (avoidNoisy) => set({ avoidNoisy }),
  setIncludeUnknown: (includeUnknown) => set({ includeUnknown }),
  clearFilters: () => set((s) => ({ price: s.op === 'alquiler' ? [0, 4000] : [80000, 350000], beds: [], avoidNoisy: false, includeUnknown: true, parkMax: 800, floorMax: 20 })),
  // "Limpiar de frente": resets filters + removes proximity + disables Saved (does not delete favorites)
  clearAll: () => set((s) => ({ price: s.op === 'alquiler' ? [0, 4000] : [80000, 350000], beds: [], avoidNoisy: false, includeUnknown: true, parkMax: 800, floorMax: 20, near: null, nearMode: false, showSaved: false })),

  toggleCompare: (id) => set((s) => {
    const i = s.compare.indexOf(id)
    if (i >= 0) return { compare: s.compare.filter((x) => x !== id) }
    const c = s.compare.slice(); if (c.length >= 3) c.shift(); c.push(id)
    return { compare: c }
  }),
  clearCompare: () => set({ compare: [] }),

  setNear: (near) => set({ near, nearMode: false }),
  setNearMode: (nearMode) => set({ nearMode }),
  clearNear: () => set({ near: null, nearMode: false }),
  setNearRadius: (r) => set((s) => ({ near: s.near ? { ...s.near, radiusM: r } : s.near })),

  setSurveyOpen: (surveyOpen) => set({ surveyOpen }),
  setFlyTo: (flyTo) => set({ flyTo }),
  toggleLayer: (key) => set((s) => ({ layers: { ...s.layers, [key]: !s.layers[key] } })),
  setOpLoading: (opLoading) => set({ opLoading }),
  showToast: (msg) => set((s) => {
    const id = s._toastId + 1
    setTimeout(() => set((s2) => (s2._toastId === id ? { toast: null } : {})), 3200)
    return { toast: msg, _toastId: id }
  }),
}))
