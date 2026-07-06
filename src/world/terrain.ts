// Terrain sampling: fixed geography (geo.ts) + procedural per-run appearance
// via seeded noise (design.md §3/§18). Heights are stylized, not to scale.

import { COASTLINE, RIVERS, RIVER_WIDTH_DEG, regionAt } from './geo'
import { fbm2 } from './noise'

export type TerrainType =
  | 'ocean'
  | 'coast'
  | 'desert'
  | 'savanna'
  | 'jungle'
  | 'mountain'
  | 'water' // river/lake

export interface TerrainSample {
  /** Height in world units (sea level = 0). */
  height: number
  type: TerrainType
  /** Vertex color as [r, g, b] in 0..1. */
  color: [number, number, number]
}

function pointInPolygon(lon: number, lat: number, poly: Array<[number, number]>): boolean {
  let inside = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]
    const [xj, yj] = poly[j]
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside
    }
  }
  return inside
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * dx
  const cy = ay + t * dy
  return Math.hypot(px - cx, py - cy)
}

function distToPolyline(lon: number, lat: number, pts: Array<[number, number]>, closed: boolean): number {
  let min = Infinity
  const n = pts.length
  const last = closed ? n : n - 1
  for (let i = 0; i < last; i++) {
    const [ax, ay] = pts[i]
    const [bx, by] = pts[(i + 1) % n]
    const d = distToSegment(lon, lat, ax, ay, bx, by)
    if (d < min) min = d
  }
  return min
}

/** Distance in degrees to the nearest river centerline. */
export function riverDistance(lat: number, lon: number): number {
  let min = Infinity
  for (const r of RIVERS) {
    const d = distToPolyline(lon, lat, r.points, false)
    if (d < min) min = d
  }
  return min
}

function coastDistance(lat: number, lon: number): { inside: boolean; dist: number } {
  const inside = pointInPolygon(lon, lat, COASTLINE)
  const dist = distToPolyline(lon, lat, COASTLINE, true)
  return { inside, dist }
}

// Base palette per terrain type; noise varies brightness per run.
const PALETTE: Record<TerrainType, [number, number, number]> = {
  ocean: [0.13, 0.3, 0.5],
  coast: [0.85, 0.78, 0.55],
  desert: [0.87, 0.74, 0.45],
  savanna: [0.65, 0.62, 0.3],
  jungle: [0.13, 0.38, 0.15],
  mountain: [0.48, 0.42, 0.36],
  water: [0.2, 0.42, 0.6],
}

function vary(c: [number, number, number], f: number): [number, number, number] {
  return [c[0] * f, c[1] * f, c[2] * f]
}

/**
 * Sample terrain at geographic coordinates. `seed` controls the per-run
 * procedural appearance; geography itself is fixed.
 */
export function sampleTerrain(lat: number, lon: number, seed: number): TerrainSample {
  const { inside, dist } = coastDistance(lat, lon)

  if (!inside) {
    const depth = Math.min(1, dist / 2)
    return { height: -0.5 - depth * 2, type: 'ocean', color: vary(PALETTE.ocean, 1 - depth * 0.4) }
  }

  const rDist = riverDistance(lat, lon)
  if (rDist < RIVER_WIDTH_DEG) {
    return { height: -0.25, type: 'water', color: PALETTE.water }
  }

  const region = regionAt(lat, lon)
  const n = fbm2(lon * 0.6, lat * 0.6, seed, 4)
  const detail = fbm2(lon * 3, lat * 3, seed + 7, 3)
  const shade = 0.85 + detail * 0.3

  let type: TerrainType
  let height: number
  switch (region) {
    case 'north':
      type = 'desert'
      height = 0.6 + n * 1.2
      break
    case 'central':
      type = 'jungle'
      height = 0.5 + n * 0.8
      break
    case 'east':
      // Mountains/rift: ridged, higher relief.
      type = n > 0.45 ? 'mountain' : 'savanna'
      height = 0.8 + Math.pow(n, 1.5) * 7
      break
    case 'south':
      // High plateau.
      type = n > 0.75 ? 'mountain' : 'savanna'
      height = 2 + n * 2.5
      break
    case 'west':
    default:
      type = 'savanna'
      height = 0.5 + n * 1.5
      break
  }

  // Fertile strip along rivers turns desert green (visual only).
  if (type === 'desert' && rDist < 0.5) {
    type = 'savanna'
  }

  // Smooth shoreline ramp near the coast.
  if (dist < 0.6) {
    const t = dist / 0.6
    height = height * t + 0.15 * (1 - t)
    if (dist < 0.25) type = 'coast'
  }

  // Riverbank lowering.
  if (rDist < RIVER_WIDTH_DEG * 2.5) {
    const t = (rDist - RIVER_WIDTH_DEG) / (RIVER_WIDTH_DEG * 1.5)
    height = Math.min(height, 0.1 + Math.max(0, t) * height)
  }

  return { height, type, color: vary(PALETTE[type], shade) }
}

/** Terrain type is water/ocean → not walkable on foot (design.md §11). */
export function isBlocked(type: TerrainType): boolean {
  return type === 'ocean'
}
