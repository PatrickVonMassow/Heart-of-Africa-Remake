// Transient UI state (dialogs, interaction prompt, debug menu visibility).

import { create } from 'zustand'
import type { TreasureId } from '../systems/economy'

export type BuildingType = 'shop' | 'weapons' | 'tools' | 'market' | 'bazaar' | 'agency' | 'chief'

/** Progress of the running in-game benchmark (design.md §21.1, F8). */
export interface BenchProgress {
  /** Config name, or null while the discarded warm-up pass runs. */
  config: string | null
  configIndex: number
  configCount: number
  /** Route phase id (localized in the overlay). */
  phase: string
  framesDone: number
  framesTotal: number
  remainingMs: number
}

/** A finished benchmark report, ready to download or copy. */
export interface BenchReportFile {
  filename: string
  json: string
  aborted: boolean
}

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

export interface UiState {
  dialog: Dialog
  /** Interaction prompt shown at the bottom of the screen, e.g. "Space — Laden". */
  prompt: string | null
  /** The settlement (place id) whose enter radius the traveller is within in the
   *  bird's-eye view (design.md §2.3): the "Space to enter" hint shows and the
   *  marker's name-label is hidden while set. null when clear of every settlement. */
  enterPlaceId: string | null
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
  /**
   * "Low Details" performance mode (design.md §21, F7 / point 276 part B). A
   * SUPERSET of the touch quality preset: while on it derives the render levers
   * DOWN — dpr cap, post off (SSAO/Bloom/TRAA), shadows off, terrain refine off,
   * a tighter flora radius — for a large win on weak GPUs, at some visible
   * quality loss. Unlike `activateTouch` it NEVER writes the individual debug
   * flags: every lever reads its EFFECTIVE value through the selectors below
   * (`effectiveSsao` etc.), so turning it off restores exactly the player's
   * chosen settings, and `lowDetails === false` is picture-identical to today.
   * Default off — the mechanism is picture-neutral until the player enables it.
   * The lever PRIORITY follows the real-hardware benchmark (point 277,
   * docs/perf-277-user-hardware.md): fill-rate first (dpr, post), geometry last.
   */
  lowDetails: boolean
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
  /** Live in-game benchmark (design.md §21.1, F8); null while none runs. */
  benchProgress: BenchProgress | null
  /** Finished benchmark report awaiting download/copy; null when none. */
  benchReport: BenchReportFile | null
  /** Esc during a run raises this; the runner polls it and unwinds. */
  benchAbort: boolean
  /** Open bazaar bid awaiting accept/decline (design.md §10). */
  bazaarBid: { treasure: TreasureId; amount: number } | null
  setBazaarBid: (bid: { treasure: TreasureId; amount: number } | null) => void
  setDialog: (d: Dialog) => void
  setPrompt: (p: string | null) => void
  setEnterPlaceId: (id: string | null) => void
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
  /** Toggle the "Low Details" performance mode (F7); reads DERIVED, never
   *  clobbers the individual debug flags. */
  setLowDetails: (on: boolean) => void
  setSsaoEnabled: (enabled: boolean) => void
  setShadowMapHalf: (half: boolean) => void
  setShadowsEnabled: (enabled: boolean) => void
  setGroundDebugFlat: (flat: boolean) => void
  setSeasonCollapseEnabled: (enabled: boolean) => void
  toggleStateDump: () => void
  setBenchProgress: (progress: BenchProgress | null) => void
  setBenchReport: (report: BenchReportFile | null) => void
  requestBenchAbort: () => void
  clearBenchAbort: () => void
}

// Default bird's-eye zoom (design.md §21.4): the game starts here, and without
// the debug unlock this is also the furthest the wheel can zoom out — only the
// unlock opens the wider range. Zooming in (down to 0.125) is always available.
export const DEFAULT_TRAVEL_ZOOM = 0.5

export const useUi = create<UiState>()((set) => ({
  dialog: null,
  prompt: null,
  enterPlaceId: null,
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
  lowDetails: false,
  ssaoEnabled: true,
  shadowMapHalf: false,
  shadowsEnabled: true,
  groundDebugFlat: false,
  seasonCollapseEnabled: true,
  stateDumpOpen: false,
  benchProgress: null,
  benchReport: null,
  benchAbort: false,
  bazaarBid: null,
  setBazaarBid: (bazaarBid) => set({ bazaarBid }),
  // Closing or switching a dialog always discards a pending bazaar bid.
  setDialog: (dialog) => set({ dialog, bazaarBid: null }),
  setPrompt: (prompt) => set({ prompt }),
  setEnterPlaceId: (enterPlaceId) => set({ enterPlaceId }),
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
  // Low Details is read DERIVED (the effective* selectors below), so — unlike
  // activateTouch — it writes ONLY its own flag and never touches the player's
  // individual debug settings; toggling it off restores them untouched.
  setLowDetails: (lowDetails) => set({ lowDetails }),
  setSsaoEnabled: (ssaoEnabled) => set({ ssaoEnabled }),
  setShadowMapHalf: (shadowMapHalf) => set({ shadowMapHalf }),
  setShadowsEnabled: (shadowsEnabled) => set({ shadowsEnabled }),
  setGroundDebugFlat: (groundDebugFlat) => set({ groundDebugFlat }),
  setSeasonCollapseEnabled: (seasonCollapseEnabled) => set({ seasonCollapseEnabled }),
  toggleStateDump: () => set((s) => ({ stateDumpOpen: !s.stateDumpOpen })),
  setBenchProgress: (benchProgress) => set({ benchProgress }),
  setBenchReport: (benchReport) => set({ benchReport }),
  requestBenchAbort: () => set({ benchAbort: true }),
  clearBenchAbort: () => set({ benchAbort: false }),
}))

// --- Effective render levers (design.md §21, F7 / point 276 part B) ----------
// Low Details is a SUPERSET of the touch quality preset, read DERIVED so it
// never clobbers the individual debug flags: every render consumer reads its
// effective value through one of these selectors, so `lowDetails === false` is
// picture-identical to today and the touch preset (a subset) is never regressed.
// Each is `base && !lowDetails` (a lever the player left on is forced off in the
// mode); the shadow-map lever is the inverse (Low Details FORCES half-size), and
// bloom — which has no player flag — is simply on unless Low Details is on.

/** SSAO renders unless the player switched it off OR Low Details is on. */
export const effectiveSsao = (s: UiState): boolean => s.ssaoEnabled && !s.lowDetails
/** TRAA renders unless the player switched it off OR Low Details is on. */
export const effectiveTraa = (s: UiState): boolean => s.traaEnabled && !s.lowDetails
/** Bloom renders unless Low Details is on (no player-facing bloom flag). */
export const effectiveBloom = (s: UiState): boolean => !s.lowDetails
/** Sun shadows cast unless the player switched them off OR Low Details is on. */
export const effectiveShadows = (s: UiState): boolean => s.shadowsEnabled && !s.lowDetails
/** Half-size shadow maps: the player's choice, but Low Details FORCES half. */
export const effectiveShadowMapHalf = (s: UiState): boolean => s.shadowMapHalf || s.lowDetails

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__ui = useUi
}
