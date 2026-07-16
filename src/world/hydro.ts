// Exact vector hydrology (design.md §3 "Reale Geodaten und Terrain-
// Darstellung"): the authored ~1890 river courses and lake outlines
// (data/rivers.ts, data/lakes.ts) are densified with Catmull-Rom splines and
// queried with true point-to-segment distances via a spatial bucket grid.
// No rasterization → no visible stair-steps on banks and shores.

import { RIVERS_DATA } from './data/rivers'
import { RIVER_WIDTH_DEG } from './riverWidth'
import { LAKES } from './data/lakes'

const DENSIFY_STEP = 0.02 // degrees between generated points
const BUCKET = 0.5 // degrees per spatial bucket
const MAX_QUERY = 0.45 // maximum distance the queries need to resolve

// Flat segment arrays [ax, ay, bx, by, ...] in (lon, lat).
let riverSegs: Float64Array
let lakeSegs: Float64Array
const riverBuckets = new Map<string, number[]>()
const lakeBuckets = new Map<string, number[]>()
// Densified closed lake rings for point-in-polygon tests.
let lakeRings: Array<{ ring: Float64Array; minX: number; minY: number; maxX: number; maxY: number }>

/**
 * Centripetal Catmull-Rom interpolation (Barry-Goldman) shared by every river
 * consumer (point 136): the source polylines average ~1.1° between control
 * points, so LINEAR densification turned every control point into a visible
 * hard corner. Centripetal (not uniform) parameterization, because the data
 * mixes short and long segments at real sharp bends (the Nile's Nimule knee,
 * the Sudd's east turn) where the uniform curve overshoots into loops. The
 * terrain water cells, the rendered ribbon and the DEM water mask all sample
 * this one curve, so bed, band and mask cannot diverge.
 */
export function catmullRom(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  // Knot spacing ~ sqrt of chord length; epsilon guards duplicate points.
  const knot = (a: [number, number], b: [number, number]) =>
    Math.max(1e-6, Math.sqrt(Math.hypot(b[0] - a[0], b[1] - a[1])))
  const t0 = 0
  const t1 = t0 + knot(p0, p1)
  const t2 = t1 + knot(p1, p2)
  const t3 = t2 + knot(p2, p3)
  const u = t1 + t * (t2 - t1)
  const lerp = (a: [number, number], b: [number, number], ta: number, tb: number): [number, number] => {
    const f = (u - ta) / (tb - ta)
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f]
  }
  const a1 = lerp(p0, p1, t0, t1)
  const a2 = lerp(p1, p2, t1, t2)
  const a3 = lerp(p2, p3, t2, t3)
  const b1 = lerp(a1, a2, t0, t2)
  const b2 = lerp(a2, a3, t1, t3)
  return lerp(b1, b2, t1, t2)
}

/** Densify a polyline (closed: wraps around) with Catmull-Rom splines. */
function densify(points: Array<[number, number]>, closed: boolean): Array<[number, number]> {
  const n = points.length
  const out: Array<[number, number]> = []
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const p0 = points[closed ? (i - 1 + n) % n : Math.max(0, i - 1)]
    const p1 = points[i]
    const p2 = points[(i + 1) % n]
    const p3 = points[closed ? (i + 2) % n : Math.min(n - 1, i + 2)]
    const dist = Math.hypot(p2[0] - p1[0], p2[1] - p1[1])
    const steps = Math.max(1, Math.ceil(dist / DENSIFY_STEP))
    for (let s = 0; s < steps; s++) {
      out.push(catmullRom(p0, p1, p2, p3, s / steps))
    }
  }
  if (!closed) out.push(points[n - 1])
  return out
}

function bucketKey(bx: number, by: number): string {
  return `${bx}|${by}`
}

/** Register segments of a densified path into a bucket grid. */
function indexSegments(
  paths: Array<Array<[number, number]>>,
  closed: boolean,
  buckets: Map<string, number[]>,
): Float64Array {
  const segs: number[] = []
  for (const path of paths) {
    const last = closed ? path.length : path.length - 1
    for (let i = 0; i < last; i++) {
      const a = path[i]
      const b = path[(i + 1) % path.length]
      const idx = segs.length
      segs.push(a[0], a[1], b[0], b[1])
      // A segment spanning DENSIFY_STEP touches at most 2 buckets per axis.
      const bx0 = Math.floor(Math.min(a[0], b[0]) / BUCKET)
      const bx1 = Math.floor(Math.max(a[0], b[0]) / BUCKET)
      const by0 = Math.floor(Math.min(a[1], b[1]) / BUCKET)
      const by1 = Math.floor(Math.max(a[1], b[1]) / BUCKET)
      for (let by = by0; by <= by1; by++) {
        for (let bx = bx0; bx <= bx1; bx++) {
          const key = bucketKey(bx, by)
          let list = buckets.get(key)
          if (!list) {
            list = []
            buckets.set(key, list)
          }
          list.push(idx)
        }
      }
    }
  }
  return new Float64Array(segs)
}

// Build everything once at module load (pure CPU, ~10 ms).
{
  const riverPaths = RIVERS_DATA.map((r) => densify(r.points, false))
  riverSegs = indexSegments(riverPaths, false, riverBuckets)
  const lakePaths = LAKES.map((l) => densify(l.points, true))
  lakeSegs = indexSegments(lakePaths, true, lakeBuckets)
  lakeRings = lakePaths.map((path) => {
    const ring = new Float64Array(path.length * 2)
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    path.forEach(([x, y], i) => {
      ring[i * 2] = x
      ring[i * 2 + 1] = y
      if (x < minX) minX = x
      if (x > maxX) maxX = x
      if (y < minY) minY = y
      if (y > maxY) maxY = y
    })
    return { ring, minX, minY, maxX, maxY }
  })
}

function segDistSq(px: number, py: number, segs: Float64Array, idx: number): number {
  const ax = segs[idx]
  const ay = segs[idx + 1]
  const bx = segs[idx + 2]
  const by = segs[idx + 3]
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = t < 0 ? 0 : t > 1 ? 1 : t
  const ex = px - (ax + t * dx)
  const ey = py - (ay + t * dy)
  return ex * ex + ey * ey
}

function bucketDistance(
  lon: number,
  lat: number,
  segs: Float64Array,
  buckets: Map<string, number[]>,
  maxDist: number,
): number {
  const bx = Math.floor(lon / BUCKET)
  const by = Math.floor(lat / BUCKET)
  let best = maxDist * maxDist
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const list = buckets.get(bucketKey(bx + dx, by + dy))
      if (!list) continue
      for (const idx of list) {
        const d = segDistSq(lon, lat, segs, idx)
        if (d < best) best = d
      }
    }
  }
  return Math.sqrt(best)
}

/** Exact distance (degrees) to the nearest river centerline, capped. */
export function riverDistanceExact(lat: number, lon: number, maxDist = MAX_QUERY): number {
  return bucketDistance(lon, lat, riverSegs, riverBuckets, maxDist)
}


/** Exact distance (degrees) to the nearest lake shoreline, capped. */
export function lakeShoreDistanceExact(lat: number, lon: number, maxDist = MAX_QUERY): number {
  return bucketDistance(lon, lat, lakeSegs, lakeBuckets, maxDist)
}

/**
 * Downstream flow at a point (design.md §11): the nearest river segment's
 * direction — the river data runs source → mouth, so the segment orientation
 * is downstream — and a 0..1 strength that fades with distance from the
 * centerline. Off the rivers the strength is 0. Direction is a unit vector in
 * (lat, lon) degrees.
 */
export function riverFlowExact(
  lat: number,
  lon: number,
  // Reach past the calibratable channel half-width (point 136): a traveller
  // at the widened bank must still feel the current.
  maxDist = RIVER_WIDTH_DEG + 0.05,
): { dirLat: number; dirLon: number; strength: number } {
  const bx = Math.floor(lon / BUCKET)
  const by = Math.floor(lat / BUCKET)
  let best = maxDist * maxDist
  let bestIdx = -1
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const list = riverBuckets.get(bucketKey(bx + dx, by + dy))
      if (!list) continue
      for (const idx of list) {
        const d = segDistSq(lon, lat, riverSegs, idx)
        if (d < best) {
          best = d
          bestIdx = idx
        }
      }
    }
  }
  if (bestIdx < 0) return { dirLat: 0, dirLon: 0, strength: 0 }
  let dLon = riverSegs[bestIdx + 2] - riverSegs[bestIdx]
  let dLat = riverSegs[bestIdx + 3] - riverSegs[bestIdx + 1]
  const len = Math.hypot(dLon, dLat) || 1
  dLon /= len
  dLat /= len
  const strength = Math.max(0, 1 - Math.sqrt(best) / maxDist)
  return { dirLat: dLat, dirLon: dLon, strength }
}

/** True if the point lies inside one of the ~1890 lake outlines. */
export function lakeContains(lat: number, lon: number): boolean {
  return lakeIndexAt(lat, lon) >= 0
}

/** Index (into LAKES order) of the lake containing the point, or -1. */
export function lakeIndexAt(lat: number, lon: number): number {
  for (let li = 0; li < lakeRings.length; li++) {
    const { ring, minX, minY, maxX, maxY } = lakeRings[li]
    if (lon < minX || lon > maxX || lat < minY || lat > maxY) continue
    // Ray casting.
    let inside = false
    const n = ring.length / 2
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const xi = ring[i * 2]
      const yi = ring[i * 2 + 1]
      const xj = ring[j * 2]
      const yj = ring[j * 2 + 1]
      if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
        inside = !inside
      }
    }
    if (inside) return li
  }
  return -1
}
