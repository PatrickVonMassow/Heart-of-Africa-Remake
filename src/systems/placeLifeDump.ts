// Settlement-life section of the F6 bug report (design.md §21.1): every
// inhabitant of the place the traveller stands in, the children's round, the
// adults' errand scheduler and the settlement's teaching geography.
//
// A report taken inside a village carried "0 animals" and nothing about the
// child it was about: no position, no tag role, no pinned clock, no nudge
// count. This section is the settlement's counterpart of the wildlife one
// (wildlifeDump.ts) and is built the same way:
//
//   - the place-life components REGISTER a read-only snapshot callback while
//     they are mounted, unconditionally — F6 ships in the delivered build,
//     where the DEV hooks `__placeTag` / `__placeErrands` do not exist;
//   - this module only READS them, on an F6 press, never in a player frame;
//   - BOUNDED and DETERMINISTIC: a radius around the traveller and a cap on the
//     inhabitant list, both named in `bounds`, with the count of what was left
//     out; inhabitants sorted by distance, then id; every number rounded.
//
// Coordinates are the place scene's world frame — the frame the settlement
// layout is built in — so the section can be replayed against the layout.

/** Traveller-centred radius (place scene metres). The settlement boundary is
 *  ~28 × settlementRoom, so this covers the whole place and its landing.
 *  Calibratable diagnostic constant, not a gameplay value. */
export const PLACE_LIFE_DUMP_RADIUS = 90

/** Maximum inhabitants listed. Calibratable diagnostic constant. */
export const PLACE_LIFE_DUMP_CAP = 60

export type PlaceLifeKind = 'child' | 'adult' | 'porter' | 'errand-walker'

export interface PlaceLifePoint {
  x: number
  z: number
}

/** A child's part in the round: catcher/chaser, the one chased, or neither. */
export type PlaceLifeTagRole = 'chaser' | 'target' | 'free'

export interface PlaceLifeChild {
  tagRole: PlaceLifeTagRole
  /** Whether the child stands pinned right now (no real movement while walking). */
  pinned: boolean
  /** Seconds without real movement (the round's own `pinned` clock). */
  pinnedSeconds: number
  /** Seconds into the current progress window without having been reset by
   *  real progress (the unstuck check fires at `unstuckSeconds`). */
  noProgressSeconds: number
  /** How often the unstuck nudge teleported this child this visit. */
  nudges: number
  /** Metres it was carried by those nudges, cumulative. */
  carried: number
  /** Standing because it was told to, not because it stalled. */
  held: boolean
  /** The bank round's own role name (`catcher`, `runner` …); absent in the tag round. */
  bankRole?: string
}

export interface PlaceLifeErrand {
  /** Situation id (adults) or round name (walkers). */
  situation: string | null
  phase: string | null
  /** Where the errand is headed; null while it has no target. */
  target: PlaceLifePoint | null
  arrived: boolean
  /** Seconds left at the target (dig bout, linger); null while not dwelling. */
  dwellRemaining: number | null
}

/** One inhabitant as a component hands it over. */
export interface PlaceLifeInhabitant {
  /** Stable within the place: `kids/2`, `errands/0`, `walkers/3`. */
  id: string
  kind: PlaceLifeKind
  x: number
  z: number
  /** Metres per second in the scene frame; null where the runtime keeps none. */
  velocity: PlaceLifePoint | null
  yaw: number | null
  /** The body's reading this frame (`chaser`, `caught`, `dig`, `inside` …). */
  pose: string | null
  child?: PlaceLifeChild
  errand?: PlaceLifeErrand
}

/** The children's round, as `__placeTag` reports it. */
export interface PlaceLifeTag {
  round: 'tag' | 'bank'
  playing: boolean
  chaser: number
  target: number
  tags: number
  chaserFor: number
  /** The bank round's phase; null in the tag round. */
  phase: string | null
}

/** The adults' errand scheduler, as `__placeErrands` reports it. */
export interface PlaceLifeErrands {
  staged: Record<string, number>
  last: { id: string; concept: string; speaker: number; age: number } | null
  /** Seconds since the last adult word (the scheduler's clock while none was said). */
  silenceSeconds: number
  /** Seconds until the scheduler casts its next errand. */
  nextCastIn: number
  standJars: number
}

/** The settlement's teaching geography (place scene frame). */
export interface PlaceLifeGeography {
  /** Where the water lies — the point the RIVER call points at. */
  bank: PlaceLifePoint | null
  upstream: PlaceLifePoint | null
  downstream: PlaceLifePoint | null
  /** The boulder the children climb and name. */
  teachingStone: (PlaceLifePoint & { radius: number; height: number }) | null
  digSites: Array<PlaceLifePoint & Record<string, unknown>>
  waterHead: PlaceLifePoint | null
  waterFoot: PlaceLifePoint | null
  waterStand: PlaceLifePoint | null
}

/** What one registered source hands over; every part optional. */
export interface PlaceLifeContribution {
  inhabitants?: PlaceLifeInhabitant[]
  tag?: PlaceLifeTag
  errands?: PlaceLifeErrands
  geography?: Partial<PlaceLifeGeography>
}

export interface PlaceLifeInhabitantEntry extends PlaceLifeInhabitant {
  /** Distance to the traveller; 0 when no origin is known. */
  dist: number
}

export interface PlaceLifeDump {
  bounds: {
    radius: number
    cap: number
    origin: PlaceLifePoint | null
    note: string
  }
  counts: {
    sources: number
    inhabitants: number
    inRadius: number
    listed: number
    omitted: number
    byKind: Record<PlaceLifeKind, number>
  }
  inhabitants: PlaceLifeInhabitantEntry[]
  tag: PlaceLifeTag | null
  errands: PlaceLifeErrands | null
  geography: PlaceLifeGeography
  /** Sources that threw, by id — one broken source never costs the others. */
  errors?: Record<string, string>
}

export type PlaceLifeSource = () => PlaceLifeContribution

const sources = new Map<string, PlaceLifeSource>()

/** Registers a source under a unique id; returns the unregister, which removes
 *  only this source (a remount may already have replaced it). */
export function registerPlaceLifeSource(id: string, fn: PlaceLifeSource): () => void {
  sources.set(id, fn)
  return () => {
    if (sources.get(id) === fn) sources.delete(id)
  }
}

/** Three decimals: millimetres and milliradians. */
function r3(n: number): number {
  return Math.round(n * 1000) / 1000
}

/** Rounds every number of a plain value into a JSON-safe copy: non-finite
 *  numbers and bigints become strings, cycles and values past depth six become
 *  markers, so the report's `JSON.stringify()` cannot throw on them. */
function rounded<T>(v: T, depth = 0, seen: object[] = []): T {
  if (typeof v === 'number') return (Number.isFinite(v) ? r3(v) : String(v)) as T
  if (typeof v === 'bigint') return String(v) as T
  if (v === null || typeof v !== 'object') return v
  if (seen.includes(v)) return '[circular]' as T
  if (depth > 6) return '[depth limit]' as T
  const path = [...seen, v]
  if (Array.isArray(v)) return v.map((x) => rounded(x, depth + 1, path)) as T
  const out: Record<string, unknown> = {}
  for (const [k, x] of Object.entries(v)) {
    if (typeof x !== 'function' && typeof x !== 'symbol' && x !== undefined) out[k] = rounded(x, depth + 1, path)
  }
  return out as T
}

function emptyGeography(): PlaceLifeGeography {
  return {
    bank: null,
    upstream: null,
    downstream: null,
    teachingStone: null,
    digSites: [],
    waterHead: null,
    waterFoot: null,
    waterStand: null,
  }
}

/**
 * The section from already-read contributions. Pure: `undefined` outside
 * `place` mode, so the dump carries no section there at all.
 */
export function buildPlaceLife(
  mode: string,
  origin: PlaceLifePoint | null,
  contributions: ReadonlyArray<{ id: string; data?: PlaceLifeContribution; error?: string }>,
  opts: { radius?: number; cap?: number } = {},
): PlaceLifeDump | undefined {
  if (mode !== 'place') return undefined
  const radius = opts.radius ?? PLACE_LIFE_DUMP_RADIUS
  const cap = opts.cap ?? PLACE_LIFE_DUMP_CAP
  const o = origin ? { x: r3(origin.x), z: r3(origin.z) } : null
  const all: PlaceLifeInhabitantEntry[] = []
  let tag: PlaceLifeTag | null = null
  let errands: PlaceLifeErrands | null = null
  const geography = emptyGeography()
  const errors: Record<string, string> = {}
  const ordered = [...contributions].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  for (const c of ordered) {
    if (c.error !== undefined) errors[c.id] = c.error
    const d = c.data
    if (!d) continue
    // Read into locals first: a contribution that throws mid-way (a getter, a
    // malformed entry) is reported under its id and leaves nothing half-merged.
    try {
      const entries: PlaceLifeInhabitantEntry[] = []
      for (const h of d.inhabitants ?? []) {
        const e = rounded(h)
        const dist = o ? r3(Math.hypot(h.x - o.x, h.z - o.z)) : 0
        entries.push({ ...e, dist })
      }
      const t = d.tag ? rounded(d.tag) : null
      const er = d.errands ? rounded(d.errands) : null
      const geo: Record<string, unknown> = {}
      if (d.geography) {
        for (const [k, v] of Object.entries(d.geography)) {
          if (v !== undefined && v !== null) geo[k] = rounded(v)
        }
      }
      all.push(...entries)
      if (t) tag = t
      if (er) errands = er
      Object.assign(geography, geo)
    } catch (err) {
      errors[c.id] = err instanceof Error ? err.message : String(err)
    }
  }
  const byKind: Record<PlaceLifeKind, number> = { child: 0, adult: 0, porter: 0, 'errand-walker': 0 }
  for (const h of all) byKind[h.kind]++
  const inRadius = all
    .filter((h) => h.dist <= radius)
    .sort((a, b) => a.dist - b.dist || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const listed = inRadius.slice(0, cap)
  return {
    bounds: {
      radius,
      cap,
      origin: o,
      note: `Inhabitants within ${radius} m of the traveller (place scene world frame, the layout's coordinates), at most ${cap}, nearest first; omitted counts what the radius and the cap left out.`,
    },
    counts: {
      sources: ordered.length,
      inhabitants: all.length,
      inRadius: inRadius.length,
      listed: listed.length,
      omitted: all.length - listed.length,
      byKind,
    },
    inhabitants: listed,
    tag,
    errands,
    geography,
    ...(Object.keys(errors).length > 0 ? { errors } : {}),
  }
}

/** The section for the dump: reads every registered source and never throws —
 *  a bug report must be produced even when a settlement's state cannot be.
 *  `undefined` outside `place` mode. */
export function placeLifeSection(
  mode: string,
  origin: PlaceLifePoint | null,
  opts: { radius?: number; cap?: number } = {},
): PlaceLifeDump | undefined {
  if (mode !== 'place') return undefined
  const read = [...sources.entries()].map(([id, fn]) => {
    try {
      return { id, data: fn() }
    } catch (err) {
      return { id, error: err instanceof Error ? err.message : String(err) }
    }
  })
  return buildPlaceLife(mode, origin, read, opts)
}

/** The sizes the report's description file names, read back from the dump
 *  JSON actually shipped. Null when it carries no placeLife section. */
export function placeLifeReportCounts(json: string): {
  radius: number
  cap: number
  listed: number
  omitted: number
} | null {
  try {
    const p = (JSON.parse(json) as { placeLife?: PlaceLifeDump }).placeLife
    if (!p) return null
    return { radius: p.bounds.radius, cap: p.bounds.cap, listed: p.counts.listed, omitted: p.counts.omitted }
  } catch {
    return null
  }
}
