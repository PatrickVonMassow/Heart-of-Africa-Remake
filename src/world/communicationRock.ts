// The landmark boulder of the communication PoC (docs/communication-poc-spec.md,
// work-order 482; the digging is 487). The chief's drum message says "go to the
// river, follow it upstream, dig at the big rock", so the rock must be a REAL
// feature of the bird's-eye world the player travels to: a single conspicuous
// erratic standing on the Niger's bank a short way UPSTREAM of the Bambara
// village, outside the settlement, in travel reach of it.
//
// The placement is a pure, seeded function of the world model — the renderer
// draws the boulder at exactly this coordinate and the dig spot IS that
// coordinate, so no second, drifting position can exist (the rule points
// 129/378 write for every collider: derive from what the picture draws).

import { RIVERS, placeById, latLonToWorld } from './geo'
import { densifyRiverAxis } from './riverProfile'
import { RIVER_WIDTH_DEG } from './riverWidth'
import { mulberry32 } from './noise'
import { sampleTerrain, isBlocked } from './terrain'

/** The river the message points along, and the village it points away from. */
export const ROCK_RIVER_ID = 'niger'
export const ROCK_VILLAGE_ID = 'bambara-village'

// Calibratable placement values (no balance knob: this is world geometry like
// the §4.2 clearances, not a tuning dial).
/** Shortest distance upstream, in degrees along the river axis. ~1.6° is about
 *  three in-game days of travel — a real trip that still reads as "a short way
 *  upstream", and far enough that the boulder is never confused with the
 *  village's own surroundings. */
const UPSTREAM_MIN_DEG = 1.6
/** The seeded span added on top, so the site is placed anew each run. */
const UPSTREAM_SPAN_DEG = 0.8
/** Step taken further upstream when a candidate spot is unusable (water, a
 *  blocked cell); bounded by ROCK_SEARCH_STEPS. */
const UPSTREAM_RETRY_STEP_DEG = 0.12
/** How many stations upstream the search may try. Generous on purpose
 *  (work-order 585): the search must be able to walk the whole upstream axis
 *  rather than run out of tries and settle for a spot it had already rejected. */
const ROCK_SEARCH_STEPS = 120

/** Half-width of the drawn boulder in world units (10 units = 1°). */
export const ROCK_FOOTPRINT_UNITS = 0.9
/** Height of the drawn boulder in world units — an UPRIGHT block, markedly
 *  taller than the tallest dressing rock (a kopje reaches ~1.9 units at its
 *  largest instance scale), so it is unmistakable by shape as well as size. */
export const ROCK_HEIGHT_UNITS = 3.2
/** How far the dressing keeps clear of the boulder (world units), so no other
 *  rock or tree stands beside it — the "unmistakable against any other rock
 *  nearby" rule, enforced in the ONE placement decision the renderer and the
 *  collider share (TravelScene.placedFloraAt). */
export const ROCK_DRESSING_CLEARANCE = 6

/** Distance of the boulder's CENTRE from the river axis: past the water band
 *  and its own footprint, so the block stands dry ON the bank with its foot a
 *  step from the waterline. `push` steps it further back from the axis, which is
 *  what a station whose near bank is flooded is retried with. */
const bankOffsetDeg = (push = 0): number =>
  RIVER_WIDTH_DEG + ROCK_FOOTPRINT_UNITS / 10 + 0.03 + push
/** The extra offsets a station is retried with before the search steps further
 *  upstream: the water band is a fixed width, but the real channel wanders
 *  inside it, so a spot that is wet at the nominal offset is often dry a stone's
 *  throw further inland. */
const BANK_PUSH_DEG = [0, 0.05, 0.1] as const
/** How many points of the drawn footprint are tested besides its centre
 *  (work-order 585): a rim ring and a half-radius ring. The centre alone is not
 *  enough — a block 1.8 units across whose centre stands a step from the
 *  waterline still has its foot in the river, and the report's picture shows
 *  exactly that. The same points decide how high the block's base sits. */
const FOOTPRINT_RING = 12

export interface CommunicationRockSite {
  lat: number
  lon: number
  /** Drawn (and colliding) footprint radius in world units. */
  radius: number
  /** Height of the drawn block in world units. */
  height: number
  /** The height the block's base is drawn at, in world units: the LOWEST ground
   *  under its own footprint, read from the same terrain field the bird's-eye
   *  mesh takes its vertices from. The scene draws the base AT this height, so
   *  the boulder meets the drawn surface instead of hovering over it
   *  (work-order 585; the rule of points 129/378: derive from what the picture
   *  draws). */
  groundY: number
  /** Yaw the block is drawn with (radians). */
  yaw: number
  /** How far upstream of the village it stands, in degrees along the axis. */
  upstreamDeg: number
  /** Set only where the search exhausted itself AND the fallback spot does not
   *  pass the footprint test — a site nothing can vouch for. Unreachable in the
   *  shipped world; a synthetic all-water world reaches it, and it must be
   *  distinguishable there rather than looking like an ordinary placement. */
  unvouched?: boolean
  /** Downstream direction at the boulder as a unit vector in (lat, lon) — the
   *  sense the chief's UPSTREAM word is measured against. */
  downstream: { lat: number; lon: number }
}

const cache = new Map<number, CommunicationRockSite>()

/**
 * The boulder's site for a run seed. Deterministic and cached: the renderer,
 * the collider, the dressing suppression and (point 487) the dig all read this
 * one function, so they cannot disagree about where the rock is.
 */
export function communicationRockSite(seed: number): CommunicationRockSite {
  const hit = cache.get(seed)
  if (hit) return hit
  const site = buildSite(seed)
  cache.set(seed, site)
  return site
}

/** The spot the shovel digs at (point 487) — by construction the coordinate the
 *  renderer draws the boulder at, never a separate record of it. */
export function communicationRockDigSpot(seed: number): { lat: number; lon: number } {
  const s = communicationRockSite(seed)
  return { lat: s.lat, lon: s.lon }
}

/**
 * Is a coordinate close enough to the boulder for the shovel to reach what lies
 * buried at its foot (point 487)? The centre it measures against is
 * `communicationRockSite` — the very coordinate the renderer draws the block at
 * — so "the spot the picture shows" and "the spot that yields the artefact" are
 * one value, never two that can drift apart. The radius is the caller's (the
 * store passes the same dig reach every other dig site uses), so this module
 * keeps knowing only geometry.
 */
export function isAtCommunicationRock(
  lat: number,
  lon: number,
  seed: number,
  radiusDeg: number,
): boolean {
  const s = communicationRockSite(seed)
  return Math.hypot(lat - s.lat, lon - s.lon) <= radiusDeg
}

/** The boulder's position in world units, for the scene and the collider. */
export function communicationRockWorldPos(seed: number): { x: number; z: number } {
  const s = communicationRockSite(seed)
  return latLonToWorld(s.lat, s.lon)
}

function buildSite(seed: number): CommunicationRockSite {
  const river = RIVERS.find((r) => r.id === ROCK_RIVER_ID)
  if (!river) throw new Error(`communication rock: no river ${ROCK_RIVER_ID}`)
  // The axis runs SOURCE → MOUTH, so walking toward index 0 walks UPSTREAM.
  const axis = densifyRiverAxis(river.points)
  const village = placeById(ROCK_VILLAGE_ID)
  let near = 0
  let bestD = Infinity
  for (let i = 0; i < axis.length; i++) {
    const d = Math.hypot(axis[i].lat - village.lat, axis[i].lon - village.lon)
    if (d < bestD) {
      bestD = d
      near = i
    }
  }

  const rand = mulberry32((seed ^ 0x0b0d1e) >>> 0)
  const wanted = UPSTREAM_MIN_DEG + rand() * UPSTREAM_SPAN_DEG
  const side = rand() < 0.5 ? 1 : -1
  const yaw = rand() * Math.PI * 2

  // A WET SPOT IS REJECTED, NEVER SETTLED FOR (work-order 585). The search used
  // to remember its FIRST candidate and hand that back once the tries ran out —
  // and that candidate was kept whether it was dry or not, so the one branch
  // that exists for the hard cases was the one branch that could stand the
  // boulder in the river. There is no such branch any more: only a spot whose
  // whole footprint is dry is ever returned.
  for (let attempt = 0; attempt < ROCK_SEARCH_STEPS; attempt++) {
    const target = wanted + attempt * UPSTREAM_RETRY_STEP_DEG
    const at = walkUpstream(axis, near, target)
    // The axis ran out before the wanted distance: nothing lies further
    // upstream, so stepping again would only re-test the source.
    if (at.walked < target - 1e-9) break
    // Both banks are tried at each station, and each bank is tried a step
    // further inland before the search moves on, so the boulder stays as close
    // to the wanted distance as the ground allows.
    for (const push of BANK_PUSH_DEG) {
      for (const s of [side, -side]) {
        const candidate = onBank(axis, at.index, at.lat, at.lon, s, at.walked, push)
        if (!standsDry(candidate.lat, candidate.lon, seed)) continue
        return { ...candidate, yaw, groundY: groundHeight(candidate.lat, candidate.lon, seed) }
      }
    }
  }
  // THE LAST RESORT VOUCHES FOR ITSELF OR SAYS IT CANNOT (four-eyes review by
  // GPT-5.6 Sol, 11.08.2026). It used to be argued dry — a village keeps the
  // §4.2 clearance to river water — and the argument is right for the shipped
  // world, but an argument is not a measurement: on a synthetic all-water world
  // this branch handed back a wet spot and a test blessed it. So the same
  // footprint test the loop uses decides here too, and where it says no, the
  // site is returned MARKED. Callers draw it as before; what changes is that the
  // one case nobody can vouch for is no longer indistinguishable from the
  // ordinary one, in the tests or in a bug report.
  const standsVouched = standsDry(village.lat, village.lon, seed)
  return {
    lat: village.lat,
    lon: village.lon,
    radius: ROCK_FOOTPRINT_UNITS,
    height: ROCK_HEIGHT_UNITS,
    groundY: groundHeight(village.lat, village.lon, seed),
    yaw,
    upstreamDeg: 0,
    downstream: { lat: 0, lon: 1 },
    // Present only when it is true: an `unvouched: false` on every ordinary site
    // would invite a reader to treat the flag's ABSENCE as unknown rather than as
    // vouched (Sol's fourth pass).
    ...(standsVouched ? {} : { unvouched: true as const }),
  }
}

/** The points the ground under the drawn block is read at: its centre and three
 *  rings out to its rim, each ring offset by half a step against the one inside
 *  it. Two rings left a gap the width of a probe spacing between them, and a
 *  waterline is a LINE — it can cross a footprint through such a gap and be
 *  missed (four-eyes review by GPT-5.6 Sol, 11.08.2026).
 *
 *  WHAT THIS DOES AND DOES NOT PROMISE, measured rather than hoped: finite point
 *  probes CANNOT prove a whole disc dry. With three staggered rings the worst
 *  chord still slips through with about 0.12 of the radius to spare, and a
 *  half-plane of water can hide in a rim cap of depth 1−cos(15°) ≈ 0.034 of the
 *  radius. At this footprint (0.9 world units) that cap is ~0.03 units — a
 *  hundredth of the block's height, below anything the picture shows. The
 *  guarantee is therefore "no probe stands in water", not "the disc is dry", and
 *  the residual is a sliver the player cannot see. A stronger promise needs a
 *  polygon test against the waterline, not more probes. */
function footprintProbes(lat: number, lon: number): Array<{ lat: number; lon: number }> {
  const r = ROCK_FOOTPRINT_UNITS / 10 // world units → degrees
  const out = [{ lat, lon }]
  const rings = [0.4, 0.72, 1]
  for (let k = 0; k < rings.length; k++) {
    const f = rings[k]
    for (let i = 0; i < FOOTPRINT_RING; i++) {
      const a = ((i + (k % 2) * 0.5) / FOOTPRINT_RING) * Math.PI * 2
      out.push({ lat: lat + Math.cos(a) * r * f, lon: lon + Math.sin(a) * r * f })
    }
  }
  return out
}

/**
 * Does the WHOLE drawn footprint stand on dry, unblocked ground? What the player
 * sees is the block's foot, not its centre point (work-order 585): a block whose
 * centre is a step from the waterline still stands in the river.
 */
function standsDry(lat: number, lon: number, seed: number): boolean {
  for (const p of footprintProbes(lat, lon)) {
    const t = sampleTerrain(p.lat, p.lon, seed)
    if (t.type === 'water' || t.type === 'ocean') return false
    if (isBlocked(t.type, p.lat, p.lon)) return false
  }
  return true
}

/**
 * How high the block's base is drawn: the LOWEST drawn ground under its
 * footprint (work-order 585).
 *
 * Not a floor value and not the centre sample. The base is a flat, horizontal
 * face while the bank it stands on rolls, so a base set to the centre height
 * hangs in the air wherever the ground falls away under the block's edge —
 * which is exactly the picture the report was filed for. Set to the lowest
 * ground it covers, the block never hovers; where the ground rises under it, it
 * beds INTO the slope, which is how an erratic sits.
 */
function groundHeight(lat: number, lon: number, seed: number): number {
  let lo = Infinity
  for (const p of footprintProbes(lat, lon)) {
    lo = Math.min(lo, sampleTerrain(p.lat, p.lon, seed).height)
  }
  return lo
}

/** Walk `wanted` degrees upstream from `from` along the densified axis. */
function walkUpstream(
  axis: Array<{ lat: number; lon: number }>,
  from: number,
  wanted: number,
): { index: number; lat: number; lon: number; walked: number } {
  let walked = 0
  let i = from
  while (i > 0 && walked < wanted) {
    const step = Math.hypot(axis[i].lat - axis[i - 1].lat, axis[i].lon - axis[i - 1].lon)
    if (walked + step >= wanted) {
      const f = (wanted - walked) / (step || 1)
      return {
        index: i - 1,
        lat: axis[i].lat + (axis[i - 1].lat - axis[i].lat) * f,
        lon: axis[i].lon + (axis[i - 1].lon - axis[i].lon) * f,
        walked: wanted,
      }
    }
    walked += step
    i -= 1
  }
  return { index: i, lat: axis[i].lat, lon: axis[i].lon, walked }
}

/** Offset an axis point onto one bank, and report the local flow direction. */
function onBank(
  axis: Array<{ lat: number; lon: number }>,
  index: number,
  lat: number,
  lon: number,
  side: number,
  walked: number,
  push: number,
): Omit<CommunicationRockSite, 'yaw' | 'groundY'> {
  const a = axis[Math.max(0, Math.min(axis.length - 2, index))]
  const b = axis[Math.max(1, Math.min(axis.length - 1, index + 1))]
  let dLat = b.lat - a.lat
  let dLon = b.lon - a.lon
  const len = Math.hypot(dLat, dLon) || 1
  dLat /= len
  dLon /= len
  // Perpendicular to the flow, in (lat, lon).
  const off = bankOffsetDeg(push)
  return {
    lat: lat + -dLon * off * side,
    lon: lon + dLat * off * side,
    radius: ROCK_FOOTPRINT_UNITS,
    height: ROCK_HEIGHT_UNITS,
    upstreamDeg: walked,
    downstream: { lat: dLat, lon: dLon },
  }
}
