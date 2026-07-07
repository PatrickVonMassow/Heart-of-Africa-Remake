// Transient UI state (dialogs, interaction prompt, debug menu visibility).

import { create } from 'zustand'

export type BuildingType = 'shop' | 'weapons' | 'tools' | 'market' | 'chief'

export type Dialog =
  | { kind: 'trade'; building: BuildingType }
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
  /** Mouse-wheel zoom in the bird's-eye view; unlocked in the debug menu. */
  wheelZoomEnabled: boolean
  /**
   * Do not disturb (design.md §16/§21, F2): new journal entries neither
   * open the journal nor auto-narrate; they stay readable on manual open.
   */
  journalDnd: boolean
  /** Current bird's-eye zoom factor (1 = default camera distance). */
  travelZoom: number
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
  setDialog: (dialog) => set({ dialog }),
  setPrompt: (prompt) => set({ prompt }),
  toggleDebug: () => set((s) => ({ debugOpen: !s.debugOpen })),
  toggleMap: () => set((s) => ({ mapOpen: !s.mapOpen })),
  setWebglFallback: (webglFallback) => set({ webglFallback }),
  dismissWebglWarning: () => set({ webglWarningDismissed: true }),
  setFpsVisible: (fpsVisible) => set({ fpsVisible }),
  // Disabling the unlock also resets the zoom to the default distance.
  setWheelZoomEnabled: (wheelZoomEnabled) =>
    set(wheelZoomEnabled ? { wheelZoomEnabled } : { wheelZoomEnabled, travelZoom: 1 }),
  setTravelZoom: (travelZoom) => set({ travelZoom: Math.min(2.5, Math.max(0.4, travelZoom)) }),
  setJournalDnd: (journalDnd) => set({ journalDnd }),
}))

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__ui = useUi
}
