// Longitudinal river-bed profile (design.md §3.3/§11.3): the DEM height
// profile along a river course is jagged — coarse texels, exaggeration and
// per-run micro-detail leave upward jags of up to ~1 world unit between
// neighbouring axis samples, and the carved bed (and the water sheet riding
// it) stairstepped down the current in visible transverse bands. A real
// river bed descends smoothly and monotonically from source to mouth, so the
// honest fix is to smooth the HEIGHT DATA along the flow, not to paper over
// it at the water sheet: each river's carved-bed elevation is low-passed and
// then clamped monotone non-increasing (a running min keeps every waterfall
// drop while removing every upward jag), and the terrain carve blends the
// channel toward this profile. Junctions are chained so a tributary meets
// its main stem at one shared level instead of stepping at the confluence.
//
// The module is lazily built per seed and guarded against re-entrancy: the
// build samples the terrain along each axis, and the terrain's river carve
// asks this module for the profile — during the build the lookup returns
// null and the carve falls back to the plain local carve, so the raw bed the
// profile smooths is exactly the pre-fix bed.

import { catmullRom } from './hydro'
import { RIVERS_DATA } from './data/rivers'
import { RIVER_WIDTH_DEG } from './riverWidth'
import { sampleTerrain, type TerrainSample } from './terrain'

/** Sampling step along a river axis (shared with the ribbon build). */
export const AXIS_STEP_DEG = 0.08

/**
 * Densify a river polyline at AXIS_STEP_DEG — the exact ribbon sampling. The
 * samples follow hydro.ts' centripetal Catmull-Rom (point 136), so the
 * researched course stays anchored while control points round smoothly.
 * (Moved here from waterSurface.ts so the world layer can share it without
 * importing from the scenes; waterSurface re-exports it unchanged.)
 */
export function densifyRiverAxis(points: Array<[number, number]>): Array<{ lat: number; lon: number }> {
  const n = points.length
  const out: Array<{ lat: number; lon: number }> = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(n - 1, i + 2)]
    const steps = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / AXIS_STEP_DEG))
    for (let s = 0; s < steps; s++) {
      const [lon, lat] = catmullRom(p0, p1, p2, p3, s / steps)
      out.push({ lat, lon })
    }
  }
  const last = points[n - 1]
  out.push({ lat: last[1], lon: last[0] })
  return out
}

/** Ocean floor values below this are clamped before smoothing, so a deep
 *  offshore texel near a mouth cannot drag the last land samples down. */
const RAW_FLOOR = -0.5
/** Low-pass radii (in axis samples of 0.08°): the first pass kills the DEM
 *  texel jitter before the running min, the second rounds the flat-then-drop
 *  corners the running min leaves (a moving average of a monotone sequence
 *  stays monotone, so the second pass cannot reintroduce upward jags). */
const SMOOTH_PRE = 3
const SMOOTH_POST = 2
/** Junction chaining: a river whose last axis point lies within this of
 *  another river's axis ends ON it (all the data's confluences are exact). */
const JUNCTION_DEG = 0.2
/** Max upstream rise per sample allowed when a tributary tail is pulled down
 *  to its main stem's level — a bounded-slope descent into the confluence
 *  instead of flattening the whole tributary. */
const JUNCTION_RAMP = 0.04

/** Centered moving average with clamped window edges. */
export function lowPass(vals: number[], radius: number): number[] {
  const n = vals.length
  const out = new Array<number>(n)
  for (let i = 0; i < n; i++) {
    let sum = 0
    let count = 0
    for (let j = Math.max(0, i - radius); j <= Math.min(n - 1, i + radius); j++) {
      sum += vals[j]
      count++
    }
    out[i] = sum / count
  }
  return out
}

/** Monotone non-increasing clamp from source (index 0) to mouth: every
 *  upward jag is removed, every genuine drop (waterfall, rapid) is kept. */
export function runningMin(vals: number[]): number[] {
  const out = vals.slice()
  for (let i = 1; i < out.length; i++) {
    if (out[i] > out[i - 1]) out[i] = out[i - 1]
  }
  return out
}

/** The full longitudinal smoothing: low-pass → running min → low-pass. */
export function smoothBedProfile(raw: number[]): number[] {
  const clamped = raw.map((v) => Math.max(v, RAW_FLOOR))
  return lowPass(runningMin(lowPass(clamped, SMOOTH_PRE)), SMOOTH_POST)
}

export interface BedProfile {
  id: string
  pts: Array<{ lat: number; lon: number }>
  /** Raw carved-bed height at each axis sample (pre-smoothing — kept for the
   *  regression witness: the jagged profile the smoothing exists to fix). */
  raw: number[]
  /** Smoothed, monotone bed height the terrain carve blends toward. */
  profile: number[]
}

/**
 * Chain the profiles at confluences (mutates `profile` arrays): where river A
 * ends on river B's axis, both meet at the shared level min(A mouth, B there)
 * — A's tail descends to it under the bounded ramp, B carries it downstream
 * via a running min. Iterated so chains (Sankuru → Kasai → Congo) propagate.
 */
export function chainJunctions(profiles: BedProfile[]): void {
  for (let pass = 0; pass < 3; pass++) {
    for (const a of profiles) {
      const tail = a.pts[a.pts.length - 1]
      for (const b of profiles) {
        if (b.id === a.id) continue
        let k = -1
        let bd = JUNCTION_DEG
        for (let j = 0; j < b.pts.length; j++) {
          const d = Math.hypot(b.pts[j].lat - tail.lat, b.pts[j].lon - tail.lon)
          if (d < bd) {
            bd = d
            k = j
          }
        }
        if (k < 0) continue
        const target = Math.min(a.profile[a.profile.length - 1], b.profile[k])
        // A's tail: bounded-slope descent into the junction level.
        const last = a.profile.length - 1
        for (let j = last; j >= 0; j--) {
          const cap = target + (last - j) * JUNCTION_RAMP
          if (a.profile[j] <= cap) break
          a.profile[j] = cap
        }
        // B from the junction on: never above the joined level (stays monotone).
        for (let j = k; j < b.profile.length; j++) {
          if (b.profile[j] > target) b.profile[j] = target
        }
      }
    }
  }
}

// --- Per-seed lazy build with a spatial lookup grid --------------------------

interface ProfileIndex {
  /** Spatial buckets of axis samples; each carries its river (`ri`) and index
   *  (`i`) so the lookup can interpolate ALONG the course between neighbours
   *  instead of snapping to the nearest sample (point 281). */
  grid: Map<string, Array<{ lat: number; lon: number; ri: number; i: number }>>
  profiles: BedProfile[]
}

/** The carve band reaches riverD < 2.6 × half-width; one axis step of slack
 *  so a point between two samples still finds its neighbour. */
const COVER_DEG = RIVER_WIDTH_DEG * 2.6 + AXIS_STEP_DEG
const GRID = Math.max(0.8, COVER_DEG)

const indexCache = new Map<number, ProfileIndex>()
let building = false

function buildIndex(seed: number): ProfileIndex {
  const profiles: BedProfile[] = RIVERS_DATA.map((river) => {
    const pts = densifyRiverAxis(river.points)
    const raw = pts.map((p) => sampleTerrain(p.lat, p.lon, seed).height)
    return { id: river.id, pts, raw, profile: smoothBedProfile(raw) }
  })
  chainJunctions(profiles)
  const grid: ProfileIndex['grid'] = new Map()
  for (let ri = 0; ri < profiles.length; ri++) {
    const r = profiles[ri]
    for (let i = 0; i < r.pts.length; i++) {
      const p = r.pts[i]
      const key = `${Math.floor(p.lon / GRID)}:${Math.floor(p.lat / GRID)}`
      let list = grid.get(key)
      if (!list) {
        list = []
        grid.set(key, list)
      }
      list.push({ lat: p.lat, lon: p.lon, ri, i })
    }
  }
  return { grid, profiles }
}

/** The per-river smoothed profiles (test/diagnostic access; builds lazily). */
export function bedProfiles(seed: number): BedProfile[] {
  return profileIndex(seed).profiles
}

function profileIndex(seed: number): ProfileIndex {
  let hit = indexCache.get(seed)
  if (!hit) {
    building = true
    try {
      hit = buildIndex(seed)
    } finally {
      building = false
    }
    indexCache.set(seed, hit)
  }
  return hit
}

/**
 * The PRE-profile terrain sample — the raw locally carved bed, exactly what
 * the game rendered before the longitudinal smoothing: the building flag
 * makes the terrain's carve fall back to the plain local carve. Regression
 * witnesses use it to reproduce the defects the profile fixed (the jagged
 * bed, the cross-band wedge, the sunken local-bed float).
 */
export function rawSampleTerrain(lat: number, lon: number, seed: number): TerrainSample {
  const prev = building
  building = true
  try {
    return sampleTerrain(lat, lon, seed)
  } finally {
    building = prev
  }
}

/** Whether the profile index is being built right now. During the build the
 *  bed lookup returns null and the terrain carve must fall back to the plain
 *  local carve (the raw bed the profile smooths); outside the build a null
 *  lookup means no river axis is within reach and the carve must vanish, not
 *  the other way round (point 281). */
export function buildingProfile(): boolean {
  return building
}

/** Nearest point on segment A→B to Q, in (lon,lat) space: the clamped
 *  parameter t and the squared distance. Used to interpolate the bed profile
 *  ALONG the course instead of snapping to a sample (point 281). */
function projectSeg(
  qLon: number,
  qLat: number,
  aLon: number,
  aLat: number,
  bLon: number,
  bLat: number,
): { t: number; d2: number } {
  const dLon = bLon - aLon
  const dLat = bLat - aLat
  const len2 = dLon * dLon + dLat * dLat
  let t = len2 > 0 ? ((qLon - aLon) * dLon + (qLat - aLat) * dLat) / len2 : 0
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const eLon = qLon - (aLon + dLon * t)
  const eLat = qLat - (aLat + dLat * t)
  return { t, d2: eLon * eLon + eLat * eLat }
}

/** A bed-profile sample: the smoothed bed height and the distance (degrees)
 *  from the query to the interpolated point on the course. */
export interface BedSample {
  bed: number
  dist: number
}

/**
 * The smoothed bed height and course distance at (lat, lon), or null when no
 * river axis lies within the carve band's reach — or while the profile is being
 * built from the raw terrain (the carve then falls back to the plain local
 * carve, which is exactly the raw bed the profile smooths).
 *
 * Point 281, two fixes to the Cairo backdrop staircase:
 * (1) The bed value is INTERPOLATED linearly along the course between the two
 *     axis samples the query projects between, not snapped to the single nearest
 *     sample. Nearest-neighbour made the returned bed a piecewise-constant
 *     Voronoi field that jumped at every ~0.08° sample boundary. Linear
 *     interpolation between two monotone-non-increasing samples stays between
 *     them, so the bed remains monotone and no water-typed sample is lifted
 *     above its ribbon row (which reads the profile AT the samples, where
 *     interpolation is a no-op).
 * (2) The `dist` is returned so the carve can FADE with the true course
 *     proximity this lookup measures (resolved out to COVER_DEG), instead of the
 *     range-1 `riverDistance` that caps at 0.45° — SHORTER than the carve band
 *     edge, which froze the carve at a plateau and stepped it against this
 *     lookup's null boundary. Carve and profile now vanish together.
 */
export function riverBedProfileAt(lat: number, lon: number, seed: number): BedSample | null {
  if (building) return null
  const { grid, profiles } = profileIndex(seed)
  const bx = Math.floor(lon / GRID)
  const by = Math.floor(lat / GRID)
  const coverSq = COVER_DEG * COVER_DEG
  let best = coverSq
  let bri = -1
  let bi = -1
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const list = grid.get(`${bx + dx}:${by + dy}`)
      if (!list) continue
      for (const p of list) {
        const eLon = lon - p.lon
        const eLat = lat - p.lat
        const d = eLon * eLon + eLat * eLat
        if (d < best) {
          best = d
          bri = p.ri
          bi = p.i
        }
      }
    }
  }
  if (bri < 0) return null
  // Interpolate along the course: project the query onto the two segments
  // adjacent to the nearest sample and take the closer projection's linear
  // blend of the endpoint profile values (and its distance).
  const prof = profiles[bri]
  const pts = prof.pts
  const pv = prof.profile
  let vBest = pv[bi]
  let dBest = best
  const consider = (j: number) => {
    if (j < 0 || j + 1 >= pts.length) return
    const r = projectSeg(lon, lat, pts[j].lon, pts[j].lat, pts[j + 1].lon, pts[j + 1].lat)
    if (r.d2 < dBest) {
      dBest = r.d2
      vBest = pv[j] + (pv[j + 1] - pv[j]) * r.t
    }
  }
  consider(bi - 1)
  consider(bi)
  return { bed: vBest, dist: Math.sqrt(dBest) }
}
