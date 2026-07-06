// Exact vector hydrology (design.md §3 "Reale Geodaten und Terrain-
// Darstellung"): the authored ~1890 river courses and lake outlines
// (data/rivers.ts, data/lakes.ts) are densified with Catmull-Rom splines and
// queried with true point-to-segment distances via a spatial bucket grid.
// No rasterization → no visible stair-steps on banks and shores.

import { RIVERS_DATA } from './data/rivers'
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

function catmullRom(
  p0: [number, number],
  p1: [number, number],
  p2: [number, number],
  p3: [number, number],
  t: number,
): [number, number] {
  const t2 = t * t
  const t3 = t2 * t
  return [
    0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3),
    0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3),
  ]
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

/** True if the point lies inside one of the ~1890 lake outlines. */
export function lakeContains(lat: number, lon: number): boolean {
  for (const { ring, minX, minY, maxX, maxY } of lakeRings) {
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
    if (inside) return true
  }
  return false
}
