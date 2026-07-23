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
  // Camp caches (design.md §6): a free camp by id, or a village cache.
  | { kind: 'camp'; scope: 'free'; campId: number }
  | { kind: 'camp'; scope: 'village'; placeId: string }
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
   * Temporal anti-aliasing (design.md §2.7), default on since the manual
   * WebGPU check (CLAUDE.md §7.1 pt. 32) passed; when off, AA falls back
   * to the render pass' MSAA.
   */
  traaEnabled: boolean
  /** Debug: force the season wetness (0 dry .. 1 wet); null = derived from the date (design.md §21). */
  seasonWetnessOverride: number | null
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
  /** Current bird's-eye zoom factor scaling the base camera offset (the game
   *  starts at DEFAULT_TRAVEL_ZOOM). */
  travelZoom: number
  /**
   * Touch/tablet layer active (design.md §17.5, point 84): armed once by the
   * first real touch (deliberate-input guard in input.ts) — never by user-agent
   * sniffing — so a desktop with no touch events stays pixel-identical. Mounts
   * the on-screen controls and applies the mobile quality preset.
   */
  touchActive: boolean
  /** Screen-space ambient occlusion (design.md §2.7); off in the touch preset. */
  ssaoEnabled: boolean
  /** Half-size shadow maps (1024²) for the touch preset; full (2048²) otherwise. */
  shadowMapHalf: boolean
  /** Directional sun shadows (design.md §2.7/§21); a debug switch to turn cast
   *  shadows off entirely (default on). */
  shadowsEnabled: boolean
  /** Debug diagnosis (point 111): render the settlement ground with a plain
   *  material (no TSL surface structure/normal) to isolate a WebGPU-only black
   *  patch. Default off. */
  groundDebugFlat: boolean
  /** Debug diagnosis (point 175): the dry-season flora deformation (crown
   *  bare-branch collapse + ground-flora sprout). Default on; toggling it off
   *  keeps the flora at its full shape (the season colour stays) to isolate
   *  whether that per-instance vertex deformation causes a WebGPU-only jump. */
  seasonCollapseEnabled: boolean
  /** F6 state-dump popup (design.md §21.1): the full game state for bug reports. */
  stateDumpOpen: boolean
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
  setTraaEnabled: (enabled: boolean) => void
  setSeasonWetnessOverride: (wetness: number | null) => void
  setWheelZoomEnabled: (enabled: boolean) => void
  setTravelZoom: (zoom: number) => void
  setJournalDnd: (dnd: boolean) => void
  /** Arm the touch layer and apply the mobile quality preset (once). */
  activateTouch: () => void
  setSsaoEnabled: (enabled: boolean) => void
  setShadowMapHalf: (half: boolean) => void
  setShadowsEnabled: (enabled: boolean) => void
  setGroundDebugFlat: (flat: boolean) => void
  setSeasonCollapseEnabled: (enabled: boolean) => void
  toggleStateDump: () => void
}

// Default bird's-eye zoom (design.md §21.4): the game starts here, and without
// the debug unlock this is also the furthest the wheel can zoom out — only the
// unlock opens the wider range. Zooming in (down to 0.125) is always available.
export const DEFAULT_TRAVEL_ZOOM = 0.5

export const useUi = create<UiState>()((set) => ({
  dialog: null,
  prompt: null,
  debugOpen: false,
  mapOpen: false,
  webglFallback: false,
  webglWarningDismissed: false,
  fpsVisible: true,
  traaEnabled: true,
  seasonWetnessOverride: null,
  wheelZoomEnabled: false,
  journalDnd: false,
  travelZoom: DEFAULT_TRAVEL_ZOOM,
  touchActive: false,
  ssaoEnabled: true,
  shadowMapHalf: false,
  shadowsEnabled: true,
  groundDebugFlat: false,
  seasonCollapseEnabled: true,
  stateDumpOpen: false,
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
  setTraaEnabled: (traaEnabled) => set({ traaEnabled }),
  setSeasonWetnessOverride: (seasonWetnessOverride) => set({ seasonWetnessOverride }),
  // Disabling the unlock clamps any zoom-out back to the default distance;
  // a zoomed-in view is kept.
  setWheelZoomEnabled: (wheelZoomEnabled) =>
    set((s) => ({ wheelZoomEnabled, travelZoom: wheelZoomEnabled ? s.travelZoom : Math.min(DEFAULT_TRAVEL_ZOOM, s.travelZoom) })),
  // Zooming in is always available; zooming out beyond the default distance
  // requires the debug unlock (design.md §21). The unlocked range reaches far
  // enough to take in the whole continent.
  setTravelZoom: (travelZoom) =>
    set((s) => ({ travelZoom: Math.min(s.wheelZoomEnabled ? 16 : DEFAULT_TRAVEL_ZOOM, Math.max(0.125, travelZoom)) })),
  setJournalDnd: (journalDnd) => set({ journalDnd }),
  // First touch arms the layer and drops to the mobile quality preset: TRAA off
  // (back to the render pass' MSAA), SSAO off, half-size shadow maps. Each stays
  // individually re-enablable in the debug menu. Idempotent — later touches are
  // a no-op so a debug re-enable is not clobbered.
  activateTouch: () =>
    set((s) => (s.touchActive ? s : { touchActive: true, traaEnabled: false, ssaoEnabled: false, shadowMapHalf: true })),
  setSsaoEnabled: (ssaoEnabled) => set({ ssaoEnabled }),
  setShadowMapHalf: (shadowMapHalf) => set({ shadowMapHalf }),
  setShadowsEnabled: (shadowsEnabled) => set({ shadowsEnabled }),
  setGroundDebugFlat: (groundDebugFlat) => set({ groundDebugFlat }),
  setSeasonCollapseEnabled: (seasonCollapseEnabled) => set({ seasonCollapseEnabled }),
  toggleStateDump: () => set((s) => ({ stateDumpOpen: !s.stateDumpOpen })),
}))

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__ui = useUi
}
