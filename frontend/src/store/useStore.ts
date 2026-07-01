import { create } from 'zustand'
import type { LatLng, RectBounds, CoordResult, AppStatus } from '../types'

interface AppState {
  status: AppStatus
  userLocation: LatLng | null
  bounds: RectBounds | null
  result: CoordResult | null
  history: CoordResult[]
  setStatus: (status: AppStatus) => void
  setUserLocation: (loc: LatLng) => void
  setBounds: (bounds: RectBounds) => void
  setResult: (result: CoordResult) => void
  clearResult: () => void
}

export const useStore = create<AppState>((set) => ({
  status: 'idle',
  userLocation: null,
  bounds: null,
  result: null,
  history: [],
  setStatus: (status) => set({ status }),
  setUserLocation: (loc) => set({ userLocation: loc }),
  setBounds: (bounds) => set({ bounds }),
  setResult: (result) =>
    set((state) => ({
      result,
      status: 'result',
      history: [...state.history, result],
    })),
  clearResult: () => set({ result: null, status: 'idle' }),
}))
