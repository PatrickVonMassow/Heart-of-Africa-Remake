// Transient UI state (dialogs, interaction prompt, debug menu visibility).

import { create } from 'zustand'
import type { TreasureId } from '../systems/economy'

export type BuildingType = 'shop' | 'weapons' | 'tools' | 'market' | 'bazaar' | 'agency' | 'chief'

/** Building types trading with the flat goods list (design.md §9). */
export type TradeBuilding = 'shop' | 'weapons' | 'tools' | 'market'

export type Dialog =
  | { kind: 'trade'; building: TradeBuilding }
  | { kind: 'bazaar' }
  | { kind: 'agency' }
  | { kind: 'audience' }
  | null

interface UiState {
  dialog: Dialog
  /** Interaction prompt shown at the bottom of the screen, e.g. "E — Laden". */
  prompt: string | null
  debugOpen: boolean
  /** Self-drawing exploration map (design.md §19). */
  mapOpen: boolean
  /** True when the renderer fell back from WebGPU to WebGL 2 (CLAUDE.md §3). */
  webglFallback: boolean
  /** The fallback notice stays until the player dismisses it. */
  webglWarningDismissed: boolean
  /** Frame counter (FPS) in the screen corner; toggled in the debug menu. */
  fpsVisible: boolean
  /**
   * Debug unlock (design.md §21): allow zooming *out* beyond the default
   * camera distance. Zooming in is always available.
   */
  wheelZoomEnabled: boolean
  /**
   * Do not disturb (design.md §16/§21, F2): new journal entries neither
   * open the journal nor auto-narrate; they stay readable on manual open.
   */
  journalDnd: boolean
  /** Current bird's-eye zoom factor (1 = default camera distance). */
  travelZoom: number
  /** Open bazaar bid awaiting accept/decline (design.md §10). */
  bazaarBid: { treasure: TreasureId; amount: number } | null
  setBazaarBid: (bid: { treasure: TreasureId; amount: number } | null) => void
  setDialog: (d: Dialog) => void
  setPrompt: (p: string | null) => void
  toggleDebug: () => void
  toggleMap: () => void
  setWebglFallback: (fallback: boolean) => void
  dismissWebglWarning: () => void
  setFpsVisible: (visible: boolean) => void
  setWheelZoomEnabled: (enabled: boolean) => void
  setTravelZoom: (zoom: number) => void
  setJournalDnd: (dnd: boolean) => void
}

export const useUi = create<UiState>()((set) => ({
  dialog: null,
  prompt: null,
  debugOpen: false,
  mapOpen: false,
  webglFallback: false,
  webglWarningDismissed: false,
  fpsVisible: true,
  wheelZoomEnabled: false,
  journalDnd: false,
  travelZoom: 1,
  bazaarBid: null,
  setBazaarBid: (bazaarBid) => set({ bazaarBid }),
  // Closing or switching a dialog always discards a pending bazaar bid.
  setDialog: (dialog) => set({ dialog, bazaarBid: null }),
  setPrompt: (prompt) => set({ prompt }),
  toggleDebug: () => set((s) => ({ debugOpen: !s.debugOpen })),
  toggleMap: () => set((s) => ({ mapOpen: !s.mapOpen })),
  setWebglFallback: (webglFallback) => set({ webglFallback }),
  dismissWebglWarning: () => set({ webglWarningDismissed: true }),
  setFpsVisible: (fpsVisible) => set({ fpsVisible }),
  // Disabling the unlock clamps any zoom-out back to the default distance;
  // a zoomed-in view is kept.
  setWheelZoomEnabled: (wheelZoomEnabled) =>
    set((s) => ({ wheelZoomEnabled, travelZoom: wheelZoomEnabled ? s.travelZoom : Math.min(1, s.travelZoom) })),
  // Zooming in is always available; zooming out beyond the default camera
  // distance (factor 1) requires the debug unlock (design.md §21).
  setTravelZoom: (travelZoom) =>
    set((s) => ({ travelZoom: Math.min(s.wheelZoomEnabled ? 4 : 1, Math.max(0.25, travelZoom)) })),
  setJournalDnd: (journalDnd) => set({ journalDnd }),
}))

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__ui = useUi
}
