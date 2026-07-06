// Spatial index over the fixed geography (data/*): Chaikin-smoothed outlines,
// a rasterized land/lake mask and segment grids for fast distance queries.
// Everything here is deterministic and built once at module load — the
// geography is fixed, only the terrain appearance is procedural (design.md §3).

import { LAND_POLYGONS } from './data/coastline'
import { RIVERS_DATA } from './data/rivers'
import { LAKES } from './data/lakes'

export type Pt = [number, number] // (lon, lat)

/** One Chaikin corner-cutting pass for a closed polygon. */
function chaikinPassClosed(pts: Pt[]): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % pts.length]
    out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25])
    out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75])
  }
  return out
}

/** One Chaikin pass for an open polyline (endpoints kept). */
function chaikinPassOpen(pts: Pt[]): Pt[] {
  if (pts.length < 3) return pts
  const out: Pt[] = [pts[0]]
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[i + 1]
    out.push([ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25])
    out.push([ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75])
  }
  out.push(pts[pts.length - 1])
  return out
}

export function chaikinClosed(pts: Pt[], iterations: number): Pt[] {
  let p = pts
  for (let i = 0; i < iterations; i++) p = chaikinPassClosed(p)
  return p
}

export function chaikinOpen(pts: Pt[], iterations: number): Pt[] {
  let p = pts
  for (let i = 0; i < iterations; i++) p = chaikinPassOpen(p)
  return p
}

// Smoothed geometry (2 passes ≈ 4× the authored vertex density).
export const SMOOTH_LAND = LAND_POLYGONS.map((p) => ({
  name: p.name,
  points: chaikinClosed(p.points, 2),
}))
export const SMOOTH_RIVERS = RIVERS_DATA.map((r) => ({
  ...r,
  points: chaikinOpen(r.points, 2),
}))
export const SMOOTH_LAKES = LAKES.map((l) => ({
  ...l,
  points: chaikinClosed(l.points, 2),
}))

// --- Segment grid: uniform 1° buckets for nearest-segment distance ---------

class SegmentGrid {
  private cell = 1.0
  private buckets = new Map<string, number[]>()
  private segs: number[] = [] // packed ax, ay, bx, by

  private key(cx: number, cy: number): string {
    return `${cx},${cy}`
  }

  addPolyline(pts: Pt[], closed: boolean): void {
    const n = pts.length
    const last = closed ? n : n - 1
    for (let i = 0; i < last; i++) {
      const [ax, ay] = pts[i]
      const [bx, by] = pts[(i + 1) % n]
      const idx = this.segs.length
      this.segs.push(ax, ay, bx, by)
      const x0 = Math.floor(Math.min(ax, bx) / this.cell)
      const x1 = Math.floor(Math.max(ax, bx) / this.cell)
      const y0 = Math.floor(Math.min(ay, by) / this.cell)
      const y1 = Math.floor(Math.max(ay, by) / this.cell)
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const k = this.key(cx, cy)
          let arr = this.buckets.get(k)
          if (!arr) this.buckets.set(k, (arr = []))
          arr.push(idx)
        }
      }
    }
  }

  private segDist(px: number, py: number, idx: number): number {
    const ax = this.segs[idx]
    const ay = this.segs[idx + 1]
    const bx = this.segs[idx + 2]
    const by = this.segs[idx + 3]
    const dx = bx - ax
    const dy = by - ay
    const lenSq = dx * dx + dy * dy
    let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
    t = Math.max(0, Math.min(1, t))
    const cx = ax + t * dx - px
    const cy = ay + t * dy - py
    return Math.hypot(cx, cy)
  }

  /** Distance in degrees to the nearest segment, capped at maxDist. */
  distance(lon: number, lat: number, maxDist = 4): number {
    const cx = Math.floor(lon / this.cell)
    const cy = Math.floor(lat / this.cell)
    let best = Infinity
    const maxR = Math.ceil(maxDist / this.cell) + 1
    for (let r = 0; r <= maxR; r++) {
      // Any segment in an unscanned ring is at least (r-1) cells away.
      if (best <= (r - 1) * this.cell) break
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue // ring only
          const arr = this.buckets.get(this.key(cx + dx, cy + dy))
          if (!arr) continue
          for (const idx of arr) {
            const d = this.segDist(lon, lat, idx)
            if (d < best) best = d
          }
        }
      }
    }
    return Math.min(best, maxDist)
  }
}

const coastGrid = new SegmentGrid()
for (const p of SMOOTH_LAND) coastGrid.addPolyline(p.points, true)

const riverGrid = new SegmentGrid()
for (const r of SMOOTH_RIVERS) riverGrid.addPolyline(r.points, false)

const lakeGrid = new SegmentGrid()
for (const l of SMOOTH_LAKES) lakeGrid.addPolyline(l.points, true)

export function coastDistance(lat: number, lon: number, maxDist = 4): number {
  return coastGrid.distance(lon, lat, maxDist)
}

export function riverDistance(lat: number, lon: number, maxDist = 4): number {
  return riverGrid.distance(lon, lat, maxDist)
}

export function lakeDistance(lat: number, lon: number, maxDist = 4): number {
  return lakeGrid.distance(lon, lat, maxDist)
}

// --- Land/lake raster: even-odd scanline fill at 0.05° resolution ----------

const RASTER = {
  lonMin: -20,
  latMin: -37,
  lonMax: 56,
  latMax: 39,
  res: 0.05,
}
const NX = Math.round((RASTER.lonMax - RASTER.lonMin) / RASTER.res)
const NY = Math.round((RASTER.latMax - RASTER.latMin) / RASTER.res)
const mask = new Uint8Array(NX * NY)

export const CELL_OCEAN = 0
export const CELL_LAND = 1
export const CELL_LAKE = 2

function fillPolygon(poly: Pt[], value: number): void {
  let minLat = Infinity
  let maxLat = -Infinity
  for (const [, la] of poly) {
    if (la < minLat) minLat = la
    if (la > maxLat) maxLat = la
  }
  const iy0 = Math.max(0, Math.floor((minLat - RASTER.latMin) / RASTER.res))
  const iy1 = Math.min(NY - 1, Math.ceil((maxLat - RASTER.latMin) / RASTER.res))
  const xs: number[] = []
  for (let iy = iy0; iy <= iy1; iy++) {
    const y = RASTER.latMin + (iy + 0.5) * RASTER.res
    xs.length = 0
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i]
      const [xj, yj] = poly[j]
      if (yi > y !== yj > y) {
        xs.push(xi + ((y - yi) / (yj - yi)) * (xj - xi))
      }
    }
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const ix0 = Math.max(0, Math.ceil((xs[k] - RASTER.lonMin) / RASTER.res - 0.5))
      const ix1 = Math.min(NX - 1, Math.floor((xs[k + 1] - RASTER.lonMin) / RASTER.res - 0.5))
      for (let ix = ix0; ix <= ix1; ix++) mask[iy * NX + ix] = value
    }
  }
}

for (const p of SMOOTH_LAND) fillPolygon(p.points, CELL_LAND)
for (const l of SMOOTH_LAKES) fillPolygon(l.points, CELL_LAKE)

/** Cell class at coordinates: 0 = ocean, 1 = land, 2 = lake. */
export function cellAt(lat: number, lon: number): number {
  const ix = Math.floor((lon - RASTER.lonMin) / RASTER.res)
  const iy = Math.floor((lat - RASTER.latMin) / RASTER.res)
  if (ix < 0 || iy < 0 || ix >= NX || iy >= NY) return CELL_OCEAN
  return mask[iy * NX + ix]
}
