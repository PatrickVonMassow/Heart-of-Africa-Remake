// Debug event trigger (design.md §21.3): the §19.8/§19.16 wildlife dramas and
// the §14 random events fired ON DEMAND from the debug menu. The dramas are
// rare by design — the grass fire, for instance, attempts ignition once per
// five minutes on savanna far ahead — so without a forced trigger they are
// nearly impossible to observe. This module holds everything that needs no
// three.js scene: the entry registry (grouped by category, sorted
// alphabetically within a group like the jump-to dropdown), the pure
// precondition locator that finds a staging spot near the traveller, and the
// registry through which the mounted travel scene installs its stager.
//
// The scene side (src/scenes/travel/Wildlife.tsx) registers its handler
// UNCONDITIONALLY — not behind `import.meta.env.DEV` like the headless
// verification's window hooks — so the dropdown works in the deployed build.

import { EVENT_KINDS, type EventKind } from './events'

/** The §19.8/§19.16 dramas the debug menu can stage near the traveller. */
export type WildlifeDramaKind =
  | 'calfDrowning'
  | 'calfMired'
  | 'crocodileAmbush'
  | 'elephantMourning'
  | 'elephantTrample'
  | 'grassFire'
  | 'huntCalf'
  | 'huntGeneric'
  | 'lionCubDefence'
  | 'vultureFlock'

export const WILDLIFE_DRAMA_KINDS: readonly WildlifeDramaKind[] = [
  'calfDrowning',
  'calfMired',
  'crocodileAmbush',
  'elephantMourning',
  'elephantTrample',
  'grassFire',
  'huntCalf',
  'huntGeneric',
  'lionCubDefence',
  'vultureFlock',
]

/** Traveller hazards outside the §14 roll (design.md §11): the ropeless fall. */
export type TravellerHazardKind = 'mountainFall'

export const TRAVELLER_HAZARD_KINDS: readonly TravellerHazardKind[] = ['mountainFall']

/**
 * Why a picked trigger could not be staged. Never a silent no-op: the debug
 * menu turns each of these into a localized toast telling the player what is
 * missing (design.md §21.3).
 */
export type DebugEventFailure =
  | 'noScene'
  | 'noSavanna'
  | 'noWater'
  | 'noPrey'
  | 'noCalf'
  | 'noCub'
  | 'noElephant'

// ---------------------------------------------------------------------------
// Entry list: grouped by category, alphabetical within each group.
// ---------------------------------------------------------------------------

/** Value prefixes keeping the three categories apart in one flat <select>. */
export const DRAMA_PREFIX = 'drama:'
export const EVENT_PREFIX = 'event:'
export const HAZARD_PREFIX = 'hazard:'

export interface DebugSelectOption {
  value: string
  label: string
}

export interface DebugSelectGroup {
  label: string
  options: DebugSelectOption[]
}

/**
 * Alphabetical order by LOCALIZED label — the jump-to dropdown's rule
 * (design.md §21.3), shared so both selectors sort identically. Returns a new
 * array; the input order is never mutated.
 */
export function sortByLabel<T extends { label: string }>(options: T[], lang: string): T[] {
  return [...options].sort((a, b) => a.label.localeCompare(b.label, lang))
}

export interface DebugEventLabels {
  groups: { wildlife: string; random: string; hazards: string }
  drama: Record<string, string>
  event: Record<string, string>
  hazard: Record<string, string>
}

/**
 * The dropdown's option groups in a fixed category order, each group sorted
 * alphabetically by its localized label.
 */
export function debugEventGroups(labels: DebugEventLabels, lang: string): DebugSelectGroup[] {
  return [
    {
      label: labels.groups.wildlife,
      options: sortByLabel(
        WILDLIFE_DRAMA_KINDS.map((k) => ({ value: DRAMA_PREFIX + k, label: labels.drama[k] ?? k })),
        lang,
      ),
    },
    {
      label: labels.groups.random,
      options: sortByLabel(
        EVENT_KINDS.map((k) => ({ value: EVENT_PREFIX + k, label: labels.event[k] ?? k })),
        lang,
      ),
    },
    {
      label: labels.groups.hazards,
      options: sortByLabel(
        TRAVELLER_HAZARD_KINDS.map((k) => ({ value: HAZARD_PREFIX + k, label: labels.hazard[k] ?? k })),
        lang,
      ),
    },
  ]
}

// ---------------------------------------------------------------------------
// Precondition locator (pure).
// ---------------------------------------------------------------------------

export interface StagingSpot {
  x: number
  z: number
}

export interface StagingSearch {
  /** Largest radius probed, in world units. */
  maxRadius: number
  /** Radial gap between probed rings (default 4). */
  ringStep?: number
  /** Probes on the innermost ring; wider rings get proportionally more, so the
   *  arc spacing stays roughly constant (default 8). */
  samplesPerRing?: number
  /** Smallest radius probed; 0 lets the centre itself qualify (default 0). */
  minRadius?: number
}

/**
 * Nearest point around (x, z) at which `ok` holds — the staging spot a trigger
 * needs (savanna for the fire, river/lake water for the crocodile). Probed ring
 * by ring outwards, so the result is the nearest qualifying ring; `null` means
 * the precondition cannot be met in range and the caller raises its toast.
 * Deterministic: no randomness, same answer for the same world.
 */
export function nearestStagingSpot(
  x: number,
  z: number,
  ok: (x: number, z: number) => boolean,
  search: StagingSearch,
): StagingSpot | null {
  const step = Math.max(0.1, search.ringStep ?? 4)
  const base = Math.max(4, search.samplesPerRing ?? 8)
  const minRadius = Math.max(0, search.minRadius ?? 0)
  if (minRadius <= 0 && ok(x, z)) return { x, z }
  const first = Math.max(step, Math.ceil(minRadius / step) * step)
  for (let r = first; r <= search.maxRadius + 1e-9; r += step) {
    const n = Math.max(base, Math.round((base * r) / step))
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2
      const px = x + Math.sin(a) * r
      const pz = z + Math.cos(a) * r
      if (ok(px, pz)) return { x: px, z: pz }
    }
  }
  return null
}

// ---------------------------------------------------------------------------
// Scene registry.
// ---------------------------------------------------------------------------

export type WildlifeDramaTrigger = (kind: WildlifeDramaKind) => DebugEventFailure | null

let dramaTrigger: WildlifeDramaTrigger | null = null

/** Installed by the mounted travel wildlife; cleared on unmount. */
export function setWildlifeDramaTrigger(fn: WildlifeDramaTrigger | null): void {
  dramaTrigger = fn
}

/** Stage a drama; `'noScene'` while no travel scene is mounted. */
export function triggerWildlifeDrama(kind: WildlifeDramaKind): DebugEventFailure | null {
  return dramaTrigger ? dramaTrigger(kind) : 'noScene'
}

export interface DebugEventActions {
  /** The §14 roll applied at the traveller's position (store.debugTriggerEvent). */
  randomEvent: (kind: EventKind) => void
  /** The §11 ropeless mountain fall (store.debugTriggerMountainFall). */
  mountainFall: () => void
}

/**
 * Fire the dropdown's picked entry. Returns the failure to toast, or null when
 * the trigger went through.
 */
export function fireDebugEvent(value: string, actions: DebugEventActions): DebugEventFailure | null {
  if (value.startsWith(DRAMA_PREFIX)) {
    return triggerWildlifeDrama(value.slice(DRAMA_PREFIX.length) as WildlifeDramaKind)
  }
  if (value.startsWith(EVENT_PREFIX)) {
    actions.randomEvent(value.slice(EVENT_PREFIX.length) as EventKind)
    return null
  }
  if (value.startsWith(HAZARD_PREFIX)) {
    actions.mountainFall()
    return null
  }
  return null
}
