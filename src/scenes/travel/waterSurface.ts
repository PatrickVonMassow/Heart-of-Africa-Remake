// Water-surface height for objects floating on rivers and lakes (design.md
// §7/§11.3). The river RIBBON is flat across its width at the height of its
// axis samples, and the lake sheet sits at the lake-wide bedMax — while the
// local bed under a floating object can lie far lower where the relief slopes
// across the channel (a river hugging a hillside, a cataract cliff). Floating
// on the local bed alone sank the canoe hull under the rendered surface on
// such stretches, so a floater reads its height from the SAME axis samples
// the ribbons are built from: at confluences and bends more than one ribbon
// stretch can cover a point, and the floater clears the highest of them.

import { LAKES } from '../../world/data/lakes'
import { RIVERS_DATA } from '../../world/data/rivers'
import { catmullRom, lakeIndexAt } from '../../world/hydro'
import { RIVER_WIDTH_DEG, sampleTerrain } from '../../world/terrain'

/** River/lake surfaces sit this far above their carved bed (ribbon lift). */
export const SURFACE_LIFT = 0.3
/** Lake sheets sit this far above their highest interior bed sample. */
export const LAKE_LIFT = 0.12
/** Sampling step along a river axis (matches the ribbon build in Rivers.tsx). */
const STEP_DEG = 0.08

/**
 * Densify a river polyline at STEP_DEG — the exact ribbon sampling. The
 * samples follow a Catmull-Rom curve through the control points (point 136):
 * the source data averages ~1.1° between points, so linear interpolation put
 * a hard corner at every control point. The curve is hydro.ts' own — the same
 * one the terrain's water cells are carved along — and passes through every
 * control point, so the researched course stays anchored.
 */
export function densifyRiver(points: Array<[number, number]>): Array<{ lat: number; lon: number }> {
  const n = points.length
  const out: Array<{ lat: number; lon: number }> = []
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[Math.min(n - 1, i + 2)]
    const steps = Math.max(1, Math.round(Math.hypot(p2[0] - p1[0], p2[1] - p1[1]) / STEP_DEG))
    for (let s = 0; s < steps; s++) {
      const [lon, lat] = catmullRom(p0, p1, p2, p3, s / steps)
      out.push({ lat, lon })
    }
  }
  const last = points[n - 1]
  out.push({ lat: last[1], lon: last[0] })
  return out
}

// point 211(a): a river's mouth reaches the sea across a short OCEAN run, but
// the ribbon build used to end at the last LAND point (the coast contour),
// which sits inland of where the sea sheet begins — leaving a beach strip
// between ribbon and sea. Carry the ribbon over the first MOUTH_BRIDGE ocean
// points of an open strip so it merges into the sea sheet; a longer run is the
// open sea and ends the strip.
export const MOUTH_BRIDGE = 3

/**
 * Which axis points the ribbon draws, and which connect to their predecessor
 * (point 211a, pure so the mouth junction is unit-testable): isolated inland
 * points misclassified as ocean are bridged; the MOUTH of an open strip is
 * carried `bridge` points into the sea; a longer ocean run is the open sea and
 * ends the strip; ocean points with no open strip (a source in misclassified
 * sea) are skipped. `strips` counts the separately drawn pieces — 1 means the
 * river renders as one continuous ribbon.
 */
export function planRibbonStrips(
  isOcean: boolean[],
  bridge = MOUTH_BRIDGE,
): { drawn: boolean[]; connected: boolean[]; strips: number } {
  const n = isOcean.length
  const drawn = new Array<boolean>(n).fill(false)
  const connected = new Array<boolean>(n).fill(false)
  let stripStart = -1
  let oceanRun = 0
  let strips = 0
  for (let i = 0; i < n; i++) {
    if (isOcean[i]) {
      oceanRun++
      if (stripStart < 0 || oceanRun > bridge) {
        if (oceanRun > bridge) stripStart = -1 // reached open sea: stop rather than bridge across it
        continue
      }
    } else {
      oceanRun = 0
    }
    drawn[i] = true
    if (stripStart >= 0) connected[i] = true
    else strips++
    stripStart = i
  }
  return { drawn, connected, strips }
}

// point 211(b): the flat ribbon cross-section rides the AXIS height while the
// terrain carve is relative to the LOCAL relief — on a cross-sloping bank a
// carved, still-high 'water'-typed wedge stood ABOVE the sheet and cut a
// visible notch into the rendered river (the user's Cairo report; the same
// pattern along the Blue Nile gorge). Each row therefore lifts until every
// water-typed terrain sample across its own band sits below the sheet by
// NOTCH_CLEARANCE. Only water-typed samples count: the band-edge LAND is the
// bank itself, and the ribbon edge disappearing into it is the waterline.
const NOTCH_CLEARANCE = 0.08
const NOTCH_FRACTIONS = [-0.9, -0.7, -0.5, -0.3, 0.3, 0.5, 0.7, 0.9]

/**
 * The rendered ribbon surface height of axis row `i` (shared by the ribbon
 * build in Rivers.tsx and the lazy float index below — one formula, so the
 * canoe float and the rendered surface can never diverge). Base: just above
 * the carved bed at the axis; lifted per the point-211(b) cross-band rule.
 * Ocean rows (the mouth bridge) keep the plain base so they merge under the
 * sea sheet instead of standing proud of it.
 */
export function ribbonRowSurfaceAt(
  pts: Array<{ lat: number; lon: number }>,
  i: number,
  seed: number,
): number {
  const p = pts[i]
  const s = sampleTerrain(p.lat, p.lon, seed)
  let surf = Math.max(-0.05, s.height + SURFACE_LIFT)
  if (s.type === 'ocean') return surf
  // Cross-band direction: perpendicular to the local axis, matching the ribbon
  // vertex offsets exactly (world x = lon·10, z = −lat·10 is a uniform scale,
  // so the degree-space perpendicular is the same lateral line).
  const a = pts[Math.max(0, i - 1)]
  const b = pts[Math.min(pts.length - 1, i + 1)]
  const dLat = b.lat - a.lat
  const dLon = b.lon - a.lon
  const len = Math.hypot(dLat, dLon) || 1
  const pLat = (-dLon / len) * RIVER_WIDTH_DEG
  const pLon = (dLat / len) * RIVER_WIDTH_DEG
  for (const f of NOTCH_FRACTIONS) {
    const q = sampleTerrain(p.lat + pLat * f, p.lon + pLon * f, seed)
    if (q.type === 'water' && q.height + NOTCH_CLEARANCE > surf) surf = q.height + NOTCH_CLEARANCE
  }
  return surf
}

// A ribbon cross-section reaches RIVER_WIDTH_DEG off its axis; add one
// sampling step of slack so a point between two axis samples still sees both.
const COVER_RANGE_DEG = RIVER_WIDTH_DEG + STEP_DEG

// Per-seed spatial index of every river's axis samples with their ribbon
// surface height — ~2500 samples once per run, then O(1) frame queries.
const GRID = Math.max(0.25, COVER_RANGE_DEG) // ≥ COVER_RANGE_DEG, so ±1 cell covers every query
type AxisIndex = Map<string, Array<{ lat: number; lon: number; surf: number; nile: boolean }>>
const axisIndexCache = new Map<number, AxisIndex>()

/**
 * This frame's Nile flood rise in world units (point 138) — a frame-scratch
 * global in the CURRENT_WEATHER mould, written by the travel scene from
 * `nileFloodAt(day) * balance.season.nileFloodRise`. Read here by the float
 * height (the canoe rides the flood) and mirrored into the ribbon material's
 * uniform by Rivers.tsx — ONE source, so the rendered surface and the floater
 * can never drift apart. It rises the surface VERTICALLY only: the ribbon
 * keeps its width, so the flood never reaches ground the low-water river does
 * not already border (the §4.2 village clearance is untouched by design).
 */
export const NILE_FLOOD = { rise: 0 }

function insertAxisSample(grid: AxisIndex, lat: number, lon: number, surf: number, nile: boolean) {
  const key = `${Math.floor(lon / GRID)}:${Math.floor(lat / GRID)}`
  let list = grid.get(key)
  if (!list) {
    list = []
    grid.set(key, list)
  }
  list.push({ lat, lon, surf, nile })
}

/**
 * Adopt the ribbon build's own axis samples (Rivers.tsx computes them anyway
 * when the travel scene mounts): zero re-sampling, and the float heights are
 * literally the rendered ribbon's values. Without a registration the lazy
 * build below computes the identical data — but synchronously, which must
 * never happen inside the frame loop (it stalls the scene switch).
 */
export function registerRiverSurfaces(
  seed: number,
  samples: Array<{ lat: number; lon: number; surf: number; nile: boolean }>,
): void {
  // The travel scene remounts on every settlement visit and re-registers the
  // identical data — the first registration (or a lazy build) wins.
  if (axisIndexCache.has(seed)) return
  const grid: AxisIndex = new Map()
  for (const s of samples) insertAxisSample(grid, s.lat, s.lon, s.surf, s.nile)
  axisIndexCache.set(seed, grid)
}

function axisIndex(seed: number): AxisIndex {
  const hit = axisIndexCache.get(seed)
  if (hit) return hit
  const grid: AxisIndex = new Map()
  for (const river of RIVERS_DATA) {
    const pts = densifyRiver(river.points)
    for (let i = 0; i < pts.length; i++) {
      // The SAME row formula the ribbon renders (incl. the point-211b lift).
      const surf = ribbonRowSurfaceAt(pts, i, seed)
      insertAxisSample(grid, pts[i].lat, pts[i].lon, surf, river.id === 'nile')
    }
  }
  axisIndexCache.set(seed, grid)
  return grid
}

/** Highest ribbon surface covering a point, or null when no river is near. */
function riverSurfaceAt(lat: number, lon: number, seed: number): number | null {
  const grid = axisIndex(seed)
  const bx = Math.floor(lon / GRID)
  const by = Math.floor(lat / GRID)
  const rangeSq = COVER_RANGE_DEG * COVER_RANGE_DEG
  let best: number | null = null
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const list = grid.get(`${bx + dx}:${by + dy}`)
      if (!list) continue
      for (const p of list) {
        const eLon = lon - p.lon
        const eLat = lat - p.lat
        if (eLon * eLon + eLat * eLat > rangeSq) continue
        // The Nile rides the flood (point 138) — same rise the ribbon renders.
        const surf = p.nile ? p.surf + NILE_FLOOD.rise : p.surf
        if (best === null || surf > best) best = surf
      }
    }
  }
  return best
}

// The lake bedMax scan is 64 terrain samples — too hot for a per-frame float
// query, so cache it per lake and seed (lakes are static per run).
const bedMaxCache = new Map<string, number>()

/**
 * Highest interior bed sample of a lake — the height its sheet is laid over
 * (Rivers.tsx builds the visible surface from this same value, so a floater
 * and the sheet can never drift apart).
 */
export function lakeBedMax(lakeIndex: number, seed: number): number {
  const lake = LAKES[lakeIndex]
  const key = `${lake.id}:${seed}`
  const hit = bedMaxCache.get(key)
  if (hit !== undefined) return hit
  let minLon = Infinity
  let maxLon = -Infinity
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [lon, lat] of lake.points) {
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  // The surface sits just above the highest interior bed sample. A min over
  // the shore points would let a single low outlier (an outlet gorge) pull
  // the sheet under the carved bed (TASKS pt. 11).
  let bedMax = -Infinity
  const N = 9
  for (let i = 1; i < N; i++) {
    for (let j = 1; j < N; j++) {
      const lon = minLon + ((maxLon - minLon) * i) / N
      const lat = minLat + ((maxLat - minLat) * j) / N
      if (lakeIndexAt(lat, lon) !== lakeIndex) continue
      bedMax = Math.max(bedMax, sampleTerrain(lat, lon, seed).height)
    }
  }
  if (bedMax === -Infinity) {
    // A sliver of a lake between grid points: fall back to its centre.
    bedMax = sampleTerrain(lake.center[1], lake.center[0], seed).height
  }
  bedMaxCache.set(key, bedMax)
  return bedMax
}

/** The lake sheet height for a lake index (bed + lift, never below the sea). */
export function lakeSurfaceY(lakeIndex: number, seed: number): number {
  return Math.max(-0.05, lakeBedMax(lakeIndex, seed) + LAKE_LIFT)
}

/**
 * The rendered water-surface height at a point, or null when the point is on
 * neither a river nor a lake (the sea plane at ~0 covers the rest). Pass the
 * already-sampled local terrain height; the result is never below it +
 * SURFACE_LIFT, so a floater also clears any local rise between axis samples.
 */
export function waterSurfaceY(
  lat: number,
  lon: number,
  seed: number,
  localHeight: number,
): number | null {
  let y: number | null = null
  const river = riverSurfaceAt(lat, lon, seed)
  if (river !== null) y = Math.max(river, Math.max(-0.05, localHeight + SURFACE_LIFT))
  const lake = lakeIndexAt(lat, lon)
  if (lake >= 0) {
    const ly = Math.max(lakeSurfaceY(lake, seed), Math.max(-0.05, localHeight + SURFACE_LIFT))
    y = y === null ? ly : Math.max(y, ly)
  }
  return y
}
