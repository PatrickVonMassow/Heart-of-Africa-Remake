// Terrain sampling: fixed geography (geoIndex.ts over data/*) + procedural
// per-run appearance via seeded noise (design.md §3/§18). Heights are
// stylized, not to scale; the *positions* of coasts, rivers, lakes and
// mountains are authentic ~1890 geography.

import { regionAt } from './geo'
import {
  CELL_LAKE,
  CELL_OCEAN,
  cellAt,
  coastDistance,
  lakeDistance,
  riverDistance,
} from './geoIndex'
import { MOUNTAINS, RIDGES } from './data/landmarks'
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

/** River half-width in degrees for terrain carving. */
export const RIVER_WIDTH_DEG = 0.14

// Base palette per terrain type; noise varies brightness per run.
const PALETTE: Record<TerrainType, [number, number, number]> = {
  ocean: [0.11, 0.29, 0.5],
  coast: [0.86, 0.79, 0.56],
  desert: [0.88, 0.75, 0.46],
  savanna: [0.63, 0.6, 0.29],
  jungle: [0.11, 0.36, 0.13],
  mountain: [0.47, 0.41, 0.35],
  water: [0.2, 0.42, 0.6],
}

const SNOW: [number, number, number] = [0.94, 0.95, 0.97]

function vary(c: [number, number, number], f: number): [number, number, number] {
  return [c[0] * f, c[1] * f, c[2] * f]
}

function mix(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax
  const dy = by - ay
  const lenSq = dx * dx + dy * dy
  let t = lenSq === 0 ? 0 : ((px - ax) * dx + (py - ay) * dy) / lenSq
  t = Math.max(0, Math.min(1, t))
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy))
}

/**
 * Stylized elevation of the named mountains and highland ridges
 * (data/landmarks.ts) at the given coordinates, in world units.
 */
function landmarkElevation(lat: number, lon: number): number {
  let h = 0
  for (const m of MOUNTAINS) {
    const dLon = lon - m.lon
    const dLat = lat - m.lat
    const cutoff = m.radiusDeg * 2.5
    if (Math.abs(dLon) > cutoff || Math.abs(dLat) > cutoff) continue
    const d = Math.hypot(dLon, dLat) / m.radiusDeg
    h += (m.elevationM / 1000) * 1.5 * Math.exp(-d * d * 2.2)
  }
  for (const r of RIDGES) {
    let min = Infinity
    for (let i = 0; i < r.points.length - 1; i++) {
      const [ax, ay] = r.points[i]
      const [bx, by] = r.points[i + 1]
      const d = distToSegment(lon, lat, ax, ay, bx, by)
      if (d < min) min = d
    }
    const t = min / r.widthDeg
    if (t < 2.5) h += (r.elevationM / 1000) * 1.1 * Math.exp(-t * t * 1.6)
  }
  return h
}

/**
 * Sample terrain at geographic coordinates. `seed` controls the per-run
 * procedural appearance; geography itself is fixed.
 */
export function sampleTerrain(lat: number, lon: number, seed: number): TerrainSample {
  const cell = cellAt(lat, lon)
  const coastD = coastDistance(lat, lon)

  if (cell === CELL_OCEAN) {
    // Shallow shelf toward the shore avoids a hard height step at the
    // rasterized coast; the water plane at sea level hides the seam.
    const depth = Math.min(1, coastD / 2.5)
    const shelf = Math.min(1, coastD / 0.5)
    return {
      height: -0.08 - shelf * 0.4 - depth * 2.0,
      type: 'ocean',
      color: vary(PALETTE.ocean, 1.25 - depth * 0.65),
    }
  }

  // Lakes: surface below sea level so the global water plane covers them
  // (stylized — real altitudes are not modeled).
  if (cell === CELL_LAKE) {
    return { height: -0.6, type: 'water', color: PALETTE.water }
  }

  const riverD = riverDistance(lat, lon)
  if (riverD < RIVER_WIDTH_DEG) {
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
      // Sahara: low dune fields with subtle relief.
      type = 'desert'
      height = 0.5 + n * 1.1 + detail * 0.4
      break
    case 'central':
      // Congo basin rainforest.
      type = 'jungle'
      height = 0.4 + n * 0.8
      break
    case 'east':
      // Mountains/rift belt: ridged, higher relief.
      type = n > 0.45 ? 'mountain' : 'savanna'
      height = 0.8 + Math.pow(n, 1.5) * 6
      break
    case 'south':
      // High plateau; Namib/Kalahari desert strip toward the west coast.
      if (lon < 18.5 && lat > -31) {
        type = 'desert'
        height = 0.6 + n * 1.2
      } else {
        type = n > 0.75 ? 'mountain' : 'savanna'
        height = 1.8 + n * 2.4
      }
      break
    case 'west':
    default:
      // Savanna; rainforest belt along the Guinea coast.
      type = lat < 8 && lon < 2 && n > 0.35 ? 'jungle' : 'savanna'
      height = 0.5 + n * 1.4
      break
  }

  // Named mountains and highland ridges rise above the regional base.
  const peaks = landmarkElevation(lat, lon)
  if (peaks > 0.05) {
    height += peaks
    if (peaks > 2.0) type = 'mountain'
  }

  // Fertile strip along rivers turns desert green (visual only).
  if (type === 'desert' && riverD < 0.45) {
    type = 'savanna'
  }

  let color = PALETTE[type]

  // Snow caps on the highest peaks (Kilimandscharo, Kenia, Ruwenzori …).
  if (type === 'mountain' && height > 6.5) {
    color = mix(color, SNOW, Math.min(1, (height - 6.5) / 1.5))
  }

  // Smooth shoreline ramp near the sea coast.
  if (coastD < 0.6) {
    const t = coastD / 0.6
    height = height * t + 0.15 * (1 - t)
    if (coastD < 0.22) {
      type = 'coast'
      color = PALETTE.coast
    }
  }

  // Banks slope down toward lakes and rivers.
  const lakeD = lakeDistance(lat, lon, 1)
  if (lakeD < 0.35) {
    const t = lakeD / 0.35
    height = Math.min(height, 0.08 + t * Math.max(0.4, height))
  }
  if (riverD < RIVER_WIDTH_DEG * 2.5) {
    const t = (riverD - RIVER_WIDTH_DEG) / (RIVER_WIDTH_DEG * 1.5)
    height = Math.min(height, 0.1 + Math.max(0, t) * height)
  }

  return { height, type, color: vary(color, shade) }
}

/** Terrain type is ocean → not walkable on foot (design.md §11). */
export function isBlocked(type: TerrainType): boolean {
  return type === 'ocean'
}
