// Transient UI state (dialogs, interaction prompt, debug menu visibility).

import { create } from 'zustand'
import type { TreasureId } from '../systems/economy'
import { QUALITY_PRESETS, nextDetailLevel, type DetailLevel } from '../config/quality'

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
  // The chief's drum message, shown after the drums and reopenable at any time
  // from the journal (design.md §13.4, point 486).
  | { kind: 'drumMessage' }
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
  /**
   * The ids of the OPEN debug-menu groups (design.md §21.3). Every group starts
   * collapsed; an opened one stays open for the rest of the session, so a
   * calibration pass does not re-open the same group after every F1.
   */
  debugGroupsOpen: string[]
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
   * Inverted vertical look (design.md §17.5/§21.3, point 392), DEFAULT ON:
   * pushing the mouse (or the right stick) FORWARD looks DOWN, pulling back
   * looks UP — the flight-stick convention the user chose. The debug-menu
   * checkbox turns it off; the horizontal look never changes with it.
   */
  invertLook: boolean
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
   * Graphics quality level — low / medium / high (design.md §21, F9 / point 276
   * part B), DEFAULT 'medium'. Each level maps through QUALITY_PRESETS
   * (src/config/quality.ts) to a value for every quality-relevant render lever;
   * every consumer reads its EFFECTIVE value through the selectors below
   * (`effectiveSsao` etc.), which combine the level's preset with the individual
   * debug flags. Unlike `activateTouch`, changing the level NEVER writes those
   * debug flags — they stay available to override within a level for tuning. The
   * lever PRIORITY follows the real-hardware benchmark (point 277,
   * docs/perf-277-user-hardware.md): fill-rate first (dpr, post), geometry last.
   */
  detailLevel: DetailLevel
  /** Screen-space ambient occlusion allow-flag (design.md §2.7): a suppressor
   *  over the level's preset (a level with SSAO on can be tuned off here). */
  ssaoEnabled: boolean
  /** Extra half-size shadow-map override (touch preset / debug): halves the
   *  level's sun-shadow resolution again on top of the preset. */
  shadowMapHalf: boolean
  /** Directional sun shadows (design.md §2.7/§21); a debug switch to turn cast
   *  shadows off entirely (default on). */
  shadowsEnabled: boolean
  /** Campfire-shadow allow-flag (design.md §19.10, point 289): a suppressor over
   *  the level's preset. Default ON — medium/high enable campfire shadows, and a
   *  player can tune them off here; low never casts them regardless. */
  fireShadowsEnabled: boolean
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
  /**
   * The chief's drums beating his message out (design.md §13.4, point 486), on
   * the WALL clock: what the player hears and watches, not in-game days. The
   * drummer figure animates from `startedAt` and the message display opens at
   * `endsAt`; null while no message is being sent. Transient scene furniture —
   * what the message TAUGHT lives in the game state and is saved there.
   */
  drumPerformance: { startedAt: number; endsAt: number } | null
  /** Open bazaar bid awaiting accept/decline (design.md §10). */
  bazaarBid: { treasure: TreasureId; amount: number } | null
  setBazaarBid: (bid: { treasure: TreasureId; amount: number } | null) => void
  /** The chief sends his message: the drums start now and beat for `seconds`. */
  startDrumMessage: (seconds: number, now?: number) => void
  /** The drums have finished (or the settlement was left) — clears the beating. */
  clearDrumMessage: () => void
  setDialog: (d: Dialog) => void
  setPrompt: (p: string | null) => void
  setEnterPlaceId: (id: string | null) => void
  toggleDebug: () => void
  /** Open/close one debug-menu group by id (design.md §21.3). */
  toggleDebugGroup: (id: string) => void
  toggleMap: () => void
  setWebglFallback: (fallback: boolean) => void
  dismissWebglWarning: () => void
  setFpsVisible: (visible: boolean) => void
  setTraaEnabled: (enabled: boolean) => void
  setSeasonWetnessOverride: (wetness: number | null) => void
  setInvertLook: (invert: boolean) => void
  setWheelZoomEnabled: (enabled: boolean) => void
  setTravelZoom: (zoom: number) => void
  setJournalDnd: (dnd: boolean) => void
  /** Arm the touch layer and apply the mobile quality preset (once). */
  activateTouch: () => void
  /** Set the graphics quality level directly (debug-menu picker). Reads DERIVED
   *  through the effective* selectors; never clobbers the individual debug flags. */
  setDetailLevel: (level: DetailLevel) => void
  /** Step the graphics level one DOWN, wrapping the bottom to the top (F9):
   *  medium → low → high → medium. */
  cycleDetailLevel: () => void
  setSsaoEnabled: (enabled: boolean) => void
  setShadowMapHalf: (half: boolean) => void
  setShadowsEnabled: (enabled: boolean) => void
  setFireShadowsEnabled: (enabled: boolean) => void
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
  debugGroupsOpen: [],
  mapOpen: false,
  webglFallback: false,
  webglWarningDismissed: false,
  fpsVisible: true,
  traaEnabled: true,
  seasonWetnessOverride: null,
  invertLook: true, // inverted vertical look is the shipped default (point 392)
  wheelZoomEnabled: false,
  journalDnd: false,
  travelZoom: DEFAULT_TRAVEL_ZOOM,
  touchActive: false,
  detailLevel: 'medium',
  ssaoEnabled: true,
  shadowMapHalf: false,
  shadowsEnabled: true,
  fireShadowsEnabled: true,
  groundDebugFlat: false,
  seasonCollapseEnabled: true,
  stateDumpOpen: false,
  benchProgress: null,
  benchReport: null,
  benchAbort: false,
  bazaarBid: null,
  drumPerformance: null,
  setBazaarBid: (bazaarBid) => set({ bazaarBid }),
  // A message already being beaten out is never restarted — asking twice while
  // the drums sound would double the strikes over one another.
  startDrumMessage: (seconds, now) =>
    set((s) => {
      if (s.drumPerformance) return s
      const startedAt = now ?? (typeof performance === 'undefined' ? Date.now() : performance.now())
      return { drumPerformance: { startedAt, endsAt: startedAt + Math.max(0, seconds) * 1000 } }
    }),
  clearDrumMessage: () => set((s) => (s.drumPerformance ? { drumPerformance: null } : s)),
  // Closing or switching a dialog always discards a pending bazaar bid.
  setDialog: (dialog) => set({ dialog, bazaarBid: null }),
  setPrompt: (prompt) => set({ prompt }),
  setEnterPlaceId: (enterPlaceId) => set({ enterPlaceId }),
  toggleDebug: () => set((s) => ({ debugOpen: !s.debugOpen })),
  toggleDebugGroup: (id) =>
    set((s) => ({
      debugGroupsOpen: s.debugGroupsOpen.includes(id)
        ? s.debugGroupsOpen.filter((g) => g !== id)
        : [...s.debugGroupsOpen, id],
    })),
  toggleMap: () => set((s) => ({ mapOpen: !s.mapOpen })),
  setWebglFallback: (webglFallback) => set({ webglFallback }),
  dismissWebglWarning: () => set({ webglWarningDismissed: true }),
  setFpsVisible: (fpsVisible) => set({ fpsVisible }),
  setTraaEnabled: (traaEnabled) => set({ traaEnabled }),
  setSeasonWetnessOverride: (seasonWetnessOverride) => set({ seasonWetnessOverride }),
  setInvertLook: (invertLook) => set({ invertLook }),
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
    set((s) =>
      s.touchActive
        ? s
        : { touchActive: true, traaEnabled: false, ssaoEnabled: false, shadowMapHalf: true, fireShadowsEnabled: false },
    ),
  // The graphics level is read DERIVED (the effective* selectors below), so —
  // unlike activateTouch — changing it writes ONLY the level and never touches
  // the player's individual debug flags, which stay available to tune within a
  // level. The F9 cycle steps DOWN (medium → low → high → medium).
  setDetailLevel: (detailLevel) => set({ detailLevel }),
  cycleDetailLevel: () => set((s) => ({ detailLevel: nextDetailLevel(s.detailLevel) })),
  setSsaoEnabled: (ssaoEnabled) => set({ ssaoEnabled }),
  setShadowMapHalf: (shadowMapHalf) => set({ shadowMapHalf }),
  setShadowsEnabled: (shadowsEnabled) => set({ shadowsEnabled }),
  setFireShadowsEnabled: (fireShadowsEnabled) => set({ fireShadowsEnabled }),
  setGroundDebugFlat: (groundDebugFlat) => set({ groundDebugFlat }),
  setSeasonCollapseEnabled: (seasonCollapseEnabled) => set({ seasonCollapseEnabled }),
  toggleStateDump: () => set((s) => ({ stateDumpOpen: !s.stateDumpOpen })),
  setBenchProgress: (benchProgress) => set({ benchProgress }),
  setBenchReport: (benchReport) => set({ benchReport }),
  requestBenchAbort: () => set({ benchAbort: true }),
  clearBenchAbort: () => set({ benchAbort: false }),
}))

// --- Effective render levers (design.md §21, F9 / point 276 part B) ----------
// Every render consumer reads its effective value through one of these
// selectors, which combine the current level's preset (QUALITY_PRESETS) with the
// individual debug allow-flags. The preset decides the level's baseline; the
// allow-flags (ssao/traa/shadows/fire, all default ON) are suppressors that let
// a player tune a feature OFF within a level without the level clobbering them.
// So a fresh install at 'medium' reads exactly the medium preset, and 'low'/
// 'high' shift every lever together.

/** The quality preset for the current graphics level. */
export const currentQuality = (s: UiState) => QUALITY_PRESETS[s.detailLevel]

/** Device-pixel-ratio cap for the current level; null keeps the native ratio. */
export const effectiveDprCap = (s: UiState): number | null => currentQuality(s).dprCap
/** SSAO renders when the level allows it AND the player has not tuned it off. */
export const effectiveSsao = (s: UiState): boolean => currentQuality(s).ssao && s.ssaoEnabled
/** TRAA renders when the level allows it AND the player has not tuned it off. */
export const effectiveTraa = (s: UiState): boolean => currentQuality(s).traa && s.traaEnabled
/** Bloom renders when the level allows it (no player-facing bloom flag). */
export const effectiveBloom = (s: UiState): boolean => currentQuality(s).bloom
/** Sun shadows cast when the level allows it AND the player has not tuned them off. */
export const effectiveShadows = (s: UiState): boolean => currentQuality(s).sunShadows && s.shadowsEnabled
/** Sun shadow-map resolution: the level's value, halved once more if the touch/
 *  debug half-map override is set (floored so it never reaches 0). */
export const effectiveShadowResolution = (s: UiState): number =>
  Math.max(256, Math.round(currentQuality(s).sunShadowResolution / (s.shadowMapHalf ? 2 : 1)))
/** Campfire shadows (point 289) cast when the level allows it AND the player has
 *  not tuned them off. */
export const effectiveFireShadows = (s: UiState): boolean => currentQuality(s).fireShadows && s.fireShadowsEnabled
/** Campfire cube-shadow map resolution for the current level (0 when off). */
export const effectiveFireShadowResolution = (s: UiState): number => currentQuality(s).fireShadowResolution
/** Soft (PCF) campfire shadows — the costlier high-only variant. */
export const effectiveFireShadowSoft = (s: UiState): boolean => currentQuality(s).fireShadowSoft
/** Near-ring terrain refinement (point 209) for the current level. */
export const effectiveTerrainRefine = (s: UiState): boolean => currentQuality(s).terrainRefine
/** Flora fog-radius factor for the current level (<1 tightens the spawn circle). */
export const effectiveFloraFogFactor = (s: UiState): number => currentQuality(s).floraFogFactor
/** Whether ground flora casts sun shadows at the current level. */
export const effectiveFloraCastShadow = (s: UiState): boolean => currentQuality(s).floraCastShadow
/** Atmospheric haze/rain intensity factor for the current level (1 = full). */
export const effectiveWeatherIntensity = (s: UiState): number => currentQuality(s).weatherIntensity
/** Radial segments of the villager figures' limb primitives (point 479). */
export const effectiveFigureLimbSegments = (s: UiState): number => currentQuality(s).figureLimbSegments
/** Segments along the current of a settlement river's surface (work-order 482). */
export const effectivePlaceRiverSegments = (s: UiState): number => currentQuality(s).placeRiverSegments
/** How many patches of foam ride that current (work-order 482). */
export const effectivePlaceRiverFoam = (s: UiState): number => currentQuality(s).placeRiverFoam
/** Octaves of the one water detail field both halves of a settlement river read
 *  (work-order 525). */
export const effectiveWaterDetailOctaves = (s: UiState): number => currentQuality(s).waterDetailOctaves

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__ui = useUi
}
