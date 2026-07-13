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
import { lakeIndexAt } from '../../world/hydro'
import { sampleTerrain } from '../../world/terrain'

/** River/lake surfaces sit this far above their carved bed (ribbon lift). */
export const SURFACE_LIFT = 0.3
/** Lake sheets sit this far above their highest interior bed sample. */
export const LAKE_LIFT = 0.12
/** Sampling step along a river axis (matches the ribbon build in Rivers.tsx). */
export const STEP_DEG = 0.08

/** Densify a river polyline at STEP_DEG — the exact ribbon sampling. */
export function densifyRiver(points: Array<[number, number]>): Array<{ lat: number; lon: number }> {
  const out: Array<{ lat: number; lon: number }> = []
  for (let i = 0; i < points.length - 1; i++) {
    const [lon0, lat0] = points[i]
    const [lon1, lat1] = points[i + 1]
    const steps = Math.max(1, Math.round(Math.hypot(lon1 - lon0, lat1 - lat0) / STEP_DEG))
    for (let s = 0; s < steps; s++) {
      const f = s / steps
      out.push({ lat: lat0 + (lat1 - lat0) * f, lon: lon0 + (lon1 - lon0) * f })
    }
  }
  const last = points[points.length - 1]
  out.push({ lat: last[1], lon: last[0] })
  return out
}

// A ribbon cross-section reaches HALF_WIDTH (1.7 world units = 0.17°) off its
// axis; add one sampling step of slack so a point between two axis samples
// still sees both. Points further away are covered by no ribbon.
const COVER_RANGE_DEG = 0.17 + STEP_DEG

// Per-seed spatial index of every river's axis samples with their ribbon
// surface height — ~2500 samples once per run, then O(1) frame queries.
const GRID = 0.25 // ≥ COVER_RANGE_DEG, so ±1 cell covers every query
type AxisIndex = Map<string, Array<{ lat: number; lon: number; surf: number }>>
const axisIndexCache = new Map<number, AxisIndex>()

function insertAxisSample(grid: AxisIndex, lat: number, lon: number, surf: number) {
  const key = `${Math.floor(lon / GRID)}:${Math.floor(lat / GRID)}`
  let list = grid.get(key)
  if (!list) {
    list = []
    grid.set(key, list)
  }
  list.push({ lat, lon, surf })
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
  samples: Array<{ lat: number; lon: number; surf: number }>,
): void {
  // The travel scene remounts on every settlement visit and re-registers the
  // identical data — the first registration (or a lazy build) wins.
  if (axisIndexCache.has(seed)) return
  const grid: AxisIndex = new Map()
  for (const s of samples) insertAxisSample(grid, s.lat, s.lon, s.surf)
  axisIndexCache.set(seed, grid)
}

function axisIndex(seed: number): AxisIndex {
  const hit = axisIndexCache.get(seed)
  if (hit) return hit
  const grid: AxisIndex = new Map()
  for (const river of RIVERS_DATA) {
    for (const p of densifyRiver(river.points)) {
      const surf = Math.max(-0.05, sampleTerrain(p.lat, p.lon, seed).height + SURFACE_LIFT)
      insertAxisSample(grid, p.lat, p.lon, surf)
    }
  }
  axisIndexCache.set(seed, grid)
  return grid
}

/** Highest ribbon surface covering a point, or null when no river is near. */
export function riverSurfaceAt(lat: number, lon: number, seed: number): number | null {
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
        if (best === null || p.surf > best) best = p.surf
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
