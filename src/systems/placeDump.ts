// Place section of the F6 bug report (design.md §21.1): the live runtime of the
// place scene the traveller stands in.
//
// The dump carried the game state and the wildlife, but nothing a settlement
// animates: which villager did what, in which phase, holding which basket
// where. A report about a place vignette (the fishery's "head in the basket")
// could not be decided from its own file, because that runtime lives only in
// the scene's refs.
//
// Every place vignette with its own runtime REGISTERS a snapshot provider while
// it is mounted (the wildlife registry's shape, registered unconditionally: F6
// ships in the delivered build). This module only READS them, on an F6 press.
//
// The section is BOUNDED and DETERMINISTIC:
//   - a radius around the traveller (place-local units) and a cap per list of
//     each vignette, both named in `bounds`, with the omitted counts beside
//     every list, so a cut list never reads as complete;
//   - vignettes sorted by id, figures and objects by distance, then id; every
//     number rounded, so the same runtime state gives the same text.
//
// Rule going forward: a new place vignette with its own runtime registers its
// provider here (`registerPlaceDumpProvider`, or the scene hooks in
// `src/scenes/place/placeDumpRead.ts`).

/** Traveller-centred radius (place-local metres). The settlement boundary is
 *  ~28 × settlementRoom, so this covers the whole place and its landing.
 *  Calibratable diagnostic constant, not a gameplay value. */
export const PLACE_DUMP_RADIUS = 90

/** Maximum figures and maximum objects listed per vignette. */
export const PLACE_DUMP_CAP = 40

export interface PlaceVec3 {
  x: number
  y: number
  z: number
}

/** One animated figure of a vignette, as drawn this frame. */
export interface PlaceFigureSnapshot {
  /** Stable within its vignette: `fishery/netman`, `walkers/2`. */
  id: string
  role: string
  /** World (place-local) position of the figure's feet. */
  pos: PlaceVec3
  yaw: number
  /** The vignette's phase for this figure, and its current action. */
  phase: string | null
  action: string | null
  pose: {
    /** Trunk lean (rad), as the pose drew it. */
    lean: number | null
    /** Drawn height over drawn width of the body's group: 1 upright, < 1 squatting. */
    squat: number | null
    /** 0 standing … 1 kneeling. */
    kneel: number | null
  }
  /** World position of the crown (top of the head); null before the first frame. */
  head: PlaceVec3 | null
  visible: boolean
  /** Vignette-specific extras (clock, reach, inBoat …). */
  extra?: Record<string, unknown>
}

/** A carried or set-down object of a vignette. */
export interface PlaceObjectSnapshot {
  id: string
  kind: string
  /** Figure id holding it, or where it stands (`bank`, `fire`, `ground` …). */
  holder: string
  pos: PlaceVec3
  extra?: Record<string, unknown>
}

/** What a provider hands over. */
export interface PlaceVignetteSnapshot {
  kind: string
  /** Vignette-wide runtime (clocks, counters, sites). Kept small by the provider. */
  state?: Record<string, unknown>
  figures: PlaceFigureSnapshot[]
  objects: PlaceObjectSnapshot[]
}

export interface PlaceVignetteDump extends PlaceVignetteSnapshot {
  id: string
  counts: {
    figures: number
    figuresInRadius: number
    figuresOmitted: number
    objects: number
    objectsInRadius: number
    objectsOmitted: number
  }
  error?: string
}

export interface PlaceDump {
  bounds: {
    radius: number
    capPerList: number
    origin: { x: number; z: number } | null
    note: string
  }
  /** false while no place vignette is registered (travel, menus). */
  active: boolean
  counts: {
    vignettes: number
    figuresListed: number
    figuresOmitted: number
    objectsListed: number
    objectsOmitted: number
  }
  vignettes: PlaceVignetteDump[]
  error?: string
}

export type PlaceDumpProvider = () => PlaceVignetteSnapshot

const providers = new Map<string, PlaceDumpProvider>()

/** Registers a vignette's provider under a unique id; returns the unregister,
 *  which removes only this provider (a remount may already have replaced it). */
export function registerPlaceDumpProvider(id: string, fn: PlaceDumpProvider): () => void {
  providers.set(id, fn)
  return () => {
    if (providers.get(id) === fn) providers.delete(id)
  }
}

/** The ids registered now, sorted. */
export function placeDumpProviderIds(): string[] {
  return [...providers.keys()].sort()
}

/** Three decimals: millimetres and milliradians. */
function r3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Rounds every number of a plain value, deeply; drops functions. */
function rounded(v: unknown, depth = 0): unknown {
  if (typeof v === 'number') return Number.isFinite(v) ? r3(v) : String(v)
  if (v === null || typeof v !== 'object' || depth > 6) return typeof v === 'function' ? undefined : v
  if (Array.isArray(v)) return v.map((x) => rounded(x, depth + 1))
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) {
    if (typeof x !== 'function') out[k] = rounded(x, depth + 1)
  }
  return out
}

function distOf(p: PlaceVec3, origin: { x: number; z: number } | null): number {
  return origin ? Math.hypot(p.x - origin.x, p.z - origin.z) : 0
}

function bounded<T extends { id: string; pos: PlaceVec3 }>(
  list: readonly T[],
  origin: { x: number; z: number } | null,
  radius: number,
  cap: number,
): { listed: T[]; inRadius: number } {
  const keyed = list
    .map((e) => ({ e: rounded(e) as T, d: r3(distOf(e.pos, origin)) }))
    .filter((k) => k.d <= radius)
    .sort((a, b) => a.d - b.d || (a.e.id < b.e.id ? -1 : a.e.id > b.e.id ? 1 : 0))
  return { listed: keyed.slice(0, cap).map((k) => k.e), inRadius: keyed.length }
}

function vignetteOf(
  id: string,
  fn: PlaceDumpProvider,
  origin: { x: number; z: number } | null,
  radius: number,
  cap: number,
): PlaceVignetteDump {
  try {
    const snap = fn()
    const figures = bounded(snap.figures, origin, radius, cap)
    const objects = bounded(snap.objects, origin, radius, cap)
    return {
      id,
      kind: snap.kind,
      state: snap.state ? (rounded(snap.state) as Record<string, unknown>) : undefined,
      counts: {
        figures: snap.figures.length,
        figuresInRadius: figures.inRadius,
        figuresOmitted: snap.figures.length - figures.listed.length,
        objects: snap.objects.length,
        objectsInRadius: objects.inRadius,
        objectsOmitted: snap.objects.length - objects.listed.length,
      },
      figures: figures.listed,
      objects: objects.listed,
    }
  } catch (err) {
    // One broken provider must not cost the report its other vignettes.
    return {
      id,
      kind: 'unknown',
      counts: { figures: 0, figuresInRadius: 0, figuresOmitted: 0, objects: 0, objectsInRadius: 0, objectsOmitted: 0 },
      figures: [],
      objects: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/** The section for the dump: reads every registered provider and never
 *  throws. `origin` is the traveller's place-local position, null when no
 *  place scene reports one (then nothing is cut by radius). */
export function placeSection(
  origin: { x: number; z: number } | null,
  opts: { radius?: number; cap?: number } = {},
): PlaceDump {
  const radius = opts.radius ?? PLACE_DUMP_RADIUS
  const cap = opts.cap ?? PLACE_DUMP_CAP
  const o = origin ? { x: r3(origin.x), z: r3(origin.z) } : null
  const vignettes = placeDumpProviderIds().map((id) => vignetteOf(id, providers.get(id)!, o, radius, cap))
  const sum = (f: (v: PlaceVignetteDump) => number) => vignettes.reduce((s, v) => s + f(v), 0)
  return {
    bounds: {
      radius,
      capPerList: cap,
      origin: o,
      note: `Figures and objects within ${radius} m of the traveller (place-local), at most ${cap} per list and vignette, nearest first; each vignette names what it omitted.`,
    },
    active: vignettes.length > 0,
    counts: {
      vignettes: vignettes.length,
      figuresListed: sum((v) => v.figures.length),
      figuresOmitted: sum((v) => v.counts.figuresOmitted),
      objectsListed: sum((v) => v.objects.length),
      objectsOmitted: sum((v) => v.counts.objectsOmitted),
    },
    vignettes,
  }
}
