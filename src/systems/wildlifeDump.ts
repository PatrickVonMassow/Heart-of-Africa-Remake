// Wildlife section of the F6 bug report (design.md §21.1, CLAUDE.md §7.1 pt. 20).
//
// The dump carried the complete game state, balance and UI — and not one
// animal. For a wildlife report the most valuable evidence was exactly the
// missing part: no predators, no carcasses, no hunt target, no vulture
// binding, no herd membership, so a wildlife bug could not be decided from
// its own report.
//
// The travel scene REGISTERS a read-only source while it is mounted (the same
// registry shape as the §21.3 drama trigger, and registered unconditionally —
// F6 ships in the delivered build, where no `window.__wildlife` exists). This
// module only READS it: nothing here writes to the wildlife state, and it runs
// on an F6 press, never in a player frame.
//
// The section is BOUNDED and DETERMINISTIC:
//   - a radius around the traveller and a cap per list, BOTH named in the
//     dumped section (`bounds`) together with the totals, so a reader sees
//     what was cut off rather than reading a truncated list as complete;
//   - every list is sorted by a stable key (distance, then species, then x/z
//     — all rounded values from the entry itself), never by the iteration
//     order of the herd arrays, which a hunt, a cull or a re-home reshuffles.

/** Traveller-centred radius (world units) the section reports animals within.
 *  The on-screen ring is 100 × zoom (default zoom 0.5 → 50), so this covers
 *  well beyond what the reporter could see. Calibratable constant, not a
 *  gameplay balance value — it only sizes a diagnostic file. */
export const WILDLIFE_DUMP_RADIUS = 120

/** Maximum entries per list (animals, carcasses, flocks). Keeps the report
 *  small in a dense herd; the omitted count is reported beside it. */
export const WILDLIFE_DUMP_CAP = 80

/** The animal fields this section reads — a structural subset of the travel
 *  scene's `Animal`, so the scene hands over its live records unchanged. */
export interface WildlifeAnimalLike {
  x: number
  z: number
  y?: number
  dead?: boolean
  young?: boolean
  herd?: number
  /** Seconds of carcass left before it is removed (design.md §19). */
  dissolve?: number
  /** Consumed by the on-scene predator, not by the ground scavenger. */
  lionFed?: boolean
  plague?: boolean
  remnant?: boolean
  gone?: boolean
  caught?: number
  inWater?: number
  wadeTime?: number
  mired?: number
  rescued?: boolean
  escape?: number
  mourn?: number
  fireTrapped?: number
  grief?: number
  separated?: number
  drink?: { tx: number; tz: number }
  crossing?: { tx: number; tz: number; time: number }
  vigil?: { x: number; z: number; time: number }
  rescueEntry?: { x: number; z: number }
  mournAt?: { x: number; z: number }
  plungeTo?: { x: number; z: number }
  trampleTo?: { x: number; z: number }
  lunge?: { victim: WildlifeAnimalLike | null; gripped: boolean }
  parent?: WildlifeAnimalLike
  child?: WildlifeAnimalLike
}

/** One vulture flock of the pool: it OWNS the carcass in `target` (§19.6). */
export interface WildlifeFlockLike {
  mode: string
  x: number
  z: number
  y?: number
  landed?: boolean
  target: WildlifeAnimalLike | null
}

/** The single scripted hunt (design.md §19.3). */
export interface WildlifeHuntLike {
  mode: string
  lx: number
  lz: number
  px: number
  pz: number
  predator: string
  prey: string
  victim: WildlifeAnimalLike | null
  victimHunt: boolean
}

/** What the travel scene hands over. Live references — read, never written. */
export interface WildlifeSource {
  herds: Readonly<Record<string, readonly WildlifeAnimalLike[]>> | null
  flocks: readonly WildlifeFlockLike[]
  hunt: WildlifeHuntLike | null
}

/** Where an animal is headed, with the reason it is headed there. */
export interface WildlifeTarget {
  kind: string
  x: number
  z: number
}

export interface WildlifeAnimalEntry {
  /** `zebra@12.3,-45.6` — names this body across the lists (flock, hunt). */
  id: string
  species: string
  x: number
  z: number
  y?: number
  /** Distance to the traveller, in world units. */
  dist: number
  /** The behaviour it is in right now — the first matching §19 drama. */
  state: string
  target: WildlifeTarget | null
  young?: boolean
  herd?: number
  parentAt?: { x: number; z: number }
  childAt?: { x: number; z: number }
}

export interface WildlifeFeeder {
  kind: 'vultureFlock' | 'predator' | 'crocodile'
  /** Pool index of the flock, for a vulture feeder. */
  flock?: number
  landed?: boolean
  species?: string
  mode?: string
}

export interface WildlifeCarcassEntry {
  id: string
  species: string
  x: number
  z: number
  dist: number
  /** Seconds of carcass left; undefined while nothing has started on it. */
  dissolveSeconds?: number
  lionFed?: boolean
  plague?: boolean
  remnant?: boolean
  /** Who is feeding on it right now. */
  feeders: WildlifeFeeder[]
}

export interface WildlifeFlockEntry {
  /** Pool index — the flock list is ordered by it, never by a Map. */
  index: number
  mode: string
  x: number
  z: number
  y?: number
  landed?: boolean
  dist: number
  /** The carcass this flock owns (§19.6), or null while it owns none. */
  carcass: { id: string; species: string; x: number; z: number } | null
}

export interface WildlifeHuntEntry {
  mode: string
  predator: string
  prey: string
  predatorAt: { x: number; z: number }
  preyAt: { x: number; z: number }
  dist: number
  /** The real herd animal being hunted, by id; null for a scripted prey. */
  victim: string | null
  victimHunt: boolean
}

export interface WildlifeDump {
  /** What this section leaves out — stated IN the file (point 454). */
  bounds: {
    radius: number
    capPerList: number
    origin: { x: number; z: number }
    note: string
  }
  /** false while no travel scene is mounted (a settlement, the menus). */
  active: boolean
  counts: {
    animalsStreamed: number
    animalsInRadius: number
    animalsListed: number
    animalsOmitted: number
    carcassesStreamed: number
    carcassesInRadius: number
    carcassesListed: number
    carcassesOmitted: number
    flocks: number
  }
  hunt: WildlifeHuntEntry | null
  animals: WildlifeAnimalEntry[]
  carcasses: WildlifeCarcassEntry[]
  flocks: WildlifeFlockEntry[]
  /** Set when the source threw — a report must never fail over its wildlife. */
  error?: string
}

type SourceGetter = () => WildlifeSource

let source: SourceGetter | null = null

/** Registered by the travel scene while it is mounted; cleared on unmount, so
 *  no stale herd reference outlives the scene. */
export function setWildlifeDumpSource(fn: SourceGetter | null): void {
  source = fn
}

/** The live source, or null outside the travel scene. */
export function readWildlifeDumpSource(): WildlifeSource | null {
  return source ? source() : null
}

/** Two decimals — small file, and a stable sort key. */
function r2(n: number): number {
  return Math.round(n * 100) / 100
}

function idOf(species: string, x: number, z: number): string {
  return `${species}@${r2(x)},${r2(z)}`
}

/** The §19 drama this animal is in, most acute first. One label, so the
 *  reader sees at a glance what the body was doing. */
function stateOf(a: WildlifeAnimalLike, hunted: boolean): string {
  if (a.dead) return 'dead'
  if (a.caught !== undefined) return 'seized'
  if (a.fireTrapped !== undefined) return 'fireTrapped'
  if (a.mired !== undefined) return 'mired'
  if (a.inWater !== undefined) return 'inWater'
  if (a.rescued) return 'rescued'
  if (a.wadeTime !== undefined) return 'wading'
  if (a.plungeTo) return 'plunging'
  if (a.trampleTo || a.grief !== undefined) return 'grieving'
  if (a.vigil) return 'vigil'
  if (a.mourn !== undefined) return 'mourning'
  if (a.escape !== undefined) return 'escaping'
  if (a.crossing) return 'crossing'
  if (a.lunge) return 'ambushing'
  if (hunted) return 'hunted'
  if (a.drink) return 'drinking'
  if (a.separated !== undefined) return 'separated'
  return 'roaming'
}

/** Where it is headed, with the reason — the hunt/rescue/drink target. */
function targetOf(a: WildlifeAnimalLike): WildlifeTarget | null {
  if (a.lunge?.victim) return { kind: 'prey', x: r2(a.lunge.victim.x), z: r2(a.lunge.victim.z) }
  if (a.crossing) return { kind: 'crossing', x: r2(a.crossing.tx), z: r2(a.crossing.tz) }
  if (a.rescueEntry) return { kind: 'rescueEntry', x: r2(a.rescueEntry.x), z: r2(a.rescueEntry.z) }
  if (a.plungeTo) return { kind: 'plunge', x: r2(a.plungeTo.x), z: r2(a.plungeTo.z) }
  if (a.trampleTo) return { kind: 'trample', x: r2(a.trampleTo.x), z: r2(a.trampleTo.z) }
  if (a.vigil) return { kind: 'vigil', x: r2(a.vigil.x), z: r2(a.vigil.z) }
  if (a.mournAt) return { kind: 'mourn', x: r2(a.mournAt.x), z: r2(a.mournAt.z) }
  if (a.drink) return { kind: 'drink', x: r2(a.drink.tx), z: r2(a.drink.tz) }
  return null
}

/** Distance, then species, then x/z — a total order over the rounded values
 *  the entry itself carries, so two dumps of one state list identically. */
function byDistance(
  a: { dist: number; species: string; x: number; z: number },
  b: { dist: number; species: string; x: number; z: number },
): number {
  if (a.dist !== b.dist) return a.dist - b.dist
  if (a.species !== b.species) return a.species < b.species ? -1 : 1
  if (a.x !== b.x) return a.x - b.x
  return a.z - b.z
}

function emptyDump(
  origin: { x: number; z: number },
  radius: number,
  cap: number,
  active: boolean,
  error?: string,
): WildlifeDump {
  return {
    bounds: {
      radius,
      capPerList: cap,
      origin: { x: r2(origin.x), z: r2(origin.z) },
      note: `animals within ${radius} world units of the traveller, at most ${cap} entries per list, nearest first`,
    },
    active,
    counts: {
      animalsStreamed: 0,
      animalsInRadius: 0,
      animalsListed: 0,
      animalsOmitted: 0,
      carcassesStreamed: 0,
      carcassesInRadius: 0,
      carcassesListed: 0,
      carcassesOmitted: 0,
      flocks: 0,
    },
    hunt: null,
    animals: [],
    carcasses: [],
    flocks: [],
    ...(error ? { error } : {}),
  }
}

/**
 * The wildlife section: bounded, deterministic, read-only. Pure given a
 * position and a source — the registry is only how the scene hands its live
 * state over.
 */
export function collectWildlife(
  origin: { x: number; z: number },
  src: WildlifeSource | null,
  opts: { radius?: number; cap?: number } = {},
): WildlifeDump {
  const radius = opts.radius ?? WILDLIFE_DUMP_RADIUS
  const cap = opts.cap ?? WILDLIFE_DUMP_CAP
  const out = emptyDump(origin, radius, cap, src !== null && src.herds !== null)
  if (!src || !src.herds) return out
  // Held as a const: the narrowing above does not survive into the closures
  // below, and the herds must not be re-read halfway through a section.
  const herds = src.herds

  const dist = (x: number, z: number) => r2(Math.hypot(x - origin.x, z - origin.z))

  // Which flock owns which carcass, and which crocodile grips which body:
  // looked up by object identity, so a carcass names its feeders without a
  // second scan per carcass.
  const flockOf = new Map<WildlifeAnimalLike, { flock: number; landed: boolean }>()
  src.flocks.forEach((f, index) => {
    if (f.target) flockOf.set(f.target, { flock: index, landed: f.landed === true })
  })
  const gripOf = new Map<WildlifeAnimalLike, string>()

  const species = Object.keys(herds).sort()
  const live: WildlifeAnimalEntry[] = []
  const dead: WildlifeCarcassEntry[] = []
  const huntVictim = src.hunt?.victim ?? null

  for (const sp of species) {
    for (const a of herds[sp] ?? []) {
      if (a.lunge?.victim && a.lunge.gripped) gripOf.set(a.lunge.victim, sp)
      if (a.dead) out.counts.carcassesStreamed++
      else out.counts.animalsStreamed++
    }
  }
  for (const sp of species) {
    for (const a of herds[sp] ?? []) {
      const d = dist(a.x, a.z)
      if (d > radius) continue
      const id = idOf(sp, a.x, a.z)
      if (a.dead) {
        out.counts.carcassesInRadius++
        const feeders: WildlifeFeeder[] = []
        const bound = flockOf.get(a)
        if (bound) feeders.push({ kind: 'vultureFlock', flock: bound.flock, landed: bound.landed })
        if (src.hunt && huntVictim === a) {
          feeders.push({ kind: 'predator', species: src.hunt.predator, mode: src.hunt.mode })
        }
        const grip = gripOf.get(a)
        if (grip) feeders.push({ kind: 'crocodile', species: grip })
        dead.push({
          id,
          species: sp,
          x: r2(a.x),
          z: r2(a.z),
          dist: d,
          ...(a.dissolve !== undefined ? { dissolveSeconds: r2(a.dissolve) } : {}),
          ...(a.lionFed ? { lionFed: true } : {}),
          ...(a.plague ? { plague: true } : {}),
          ...(a.remnant ? { remnant: true } : {}),
          feeders,
        })
      } else {
        out.counts.animalsInRadius++
        live.push({
          id,
          species: sp,
          x: r2(a.x),
          z: r2(a.z),
          ...(a.y !== undefined ? { y: r2(a.y) } : {}),
          dist: d,
          state: stateOf(a, huntVictim === a),
          target: targetOf(a),
          ...(a.young ? { young: true } : {}),
          ...(a.herd !== undefined ? { herd: a.herd } : {}),
          ...(a.parent ? { parentAt: { x: r2(a.parent.x), z: r2(a.parent.z) } } : {}),
          ...(a.child ? { childAt: { x: r2(a.child.x), z: r2(a.child.z) } } : {}),
        })
      }
    }
  }

  live.sort(byDistance)
  dead.sort(byDistance)
  out.animals = live.slice(0, cap)
  out.carcasses = dead.slice(0, cap)
  out.counts.animalsListed = out.animals.length
  out.counts.animalsOmitted = live.length - out.animals.length
  out.counts.carcassesListed = out.carcasses.length
  out.counts.carcassesOmitted = dead.length - out.carcasses.length

  // The flock pool is small and ordered by its own index — no radius filter:
  // a flock circling in from beyond the ring is exactly the evidence a
  // vulture report needs.
  out.flocks = src.flocks.slice(0, cap).map((f, index) => ({
    index,
    mode: f.mode,
    x: r2(f.x),
    z: r2(f.z),
    ...(f.y !== undefined ? { y: r2(f.y) } : {}),
    ...(f.landed !== undefined ? { landed: f.landed } : {}),
    dist: dist(f.x, f.z),
    carcass: f.target
      ? {
          id: idOf(speciesOf(herds, f.target) ?? 'unknown', f.target.x, f.target.z),
          species: speciesOf(herds, f.target) ?? 'unknown',
          x: r2(f.target.x),
          z: r2(f.target.z),
        }
      : null,
  }))
  out.counts.flocks = out.flocks.length

  if (src.hunt) {
    out.hunt = {
      mode: src.hunt.mode,
      predator: src.hunt.predator,
      prey: src.hunt.prey,
      predatorAt: { x: r2(src.hunt.lx), z: r2(src.hunt.lz) },
      preyAt: { x: r2(src.hunt.px), z: r2(src.hunt.pz) },
      dist: dist(src.hunt.lx, src.hunt.lz),
      victim: huntVictim
        ? idOf(speciesOf(herds, huntVictim) ?? 'unknown', huntVictim.x, huntVictim.z)
        : null,
      victimHunt: src.hunt.victimHunt,
    }
  }
  return out
}

/** Which herd list a referenced body belongs to (a flock target, a victim). */
function speciesOf(
  herds: Readonly<Record<string, readonly WildlifeAnimalLike[]>>,
  a: WildlifeAnimalLike,
): string | null {
  for (const sp of Object.keys(herds).sort()) {
    if ((herds[sp] ?? []).includes(a)) return sp
  }
  return null
}

/** The section for the dump: reads the registered source and never throws —
 *  a bug report must be produced even when the wildlife state cannot be. */
export function wildlifeSection(
  origin: { x: number; z: number },
  opts: { radius?: number; cap?: number } = {},
): WildlifeDump {
  try {
    return collectWildlife(origin, readWildlifeDumpSource(), opts)
  } catch (err) {
    return emptyDump(
      origin,
      opts.radius ?? WILDLIFE_DUMP_RADIUS,
      opts.cap ?? WILDLIFE_DUMP_CAP,
      false,
      err instanceof Error ? err.message : String(err),
    )
  }
}
