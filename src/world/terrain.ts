// Terrain sampling on real geodata (design.md §3 "Reale Geodaten und
// Terrain-Darstellung"): heights come from the SRTM-composite DEM
// (world/geodata.ts), shorelines from its flood-filled ocean mask, river and
// lake banks from exact ~1890 vector distances (world/hydro.ts). The seeded
// noise only adds per-run micro-relief and color variety (design.md §18);
// the geography itself is identical in every run.

import { regionAt } from './geo'
import { coastDistance, lakeDistance, riverDistance } from './geoIndex'
import { elevationAt, landFractionAt } from './geodata'
import { lakeContains, lakeIndexAt } from './hydro'
import { fbm2 } from './noise'
import { isNortheastOfBoundary } from './redSea'
import { LAND_POLYGONS } from './data/coastline'
import { LAKES } from './data/lakes'
import { balance } from '../config/balance'

export type TerrainType =
  | 'ocean'
  | 'coast'
  | 'desert'
  | 'savanna'
  | 'jungle'
  | 'mountain'
  | 'water' // river/lake

/** Splat weights for the ground textures: [sand, grass, rock, forest]. */
export type SplatWeights = [number, number, number, number]

export interface TerrainSample {
  /** Height in world units (sea level = 0). */
  height: number
  /** Real elevation in meters (below 0 in the ocean). */
  elevation: number
  type: TerrainType
  /** Vertex color as [r, g, b] in 0..1 (tint over the splatted albedo). */
  color: [number, number, number]
  splat: SplatWeights
}

/** River half-width in degrees for terrain carving. */
import { RIVER_WIDTH_DEG } from './riverWidth'
export { RIVER_WIDTH_DEG }

/** Vertical exaggeration: world units per meter (stylized, map scale). */
const METERS_TO_UNITS = 1.35 / 1000

/** Real elevation thresholds (meters) for mountain terrain and snow. */
const MOUNTAIN_M = 1600
/** Degrees of low-frequency meander applied to biome/region borders (design.md §3). */
const BIOME_WARP = 3.0

// Permanent ice (design.md §19.13, point 141): ONLY the three massifs that
// really carried glaciers in 1890 — Kilimanjaro, Mount Kenya, Rwenzori, all
// above the ~4,500-4,800 m equilibrium line. The named near misses stay BARE
// and are the test: Elgon (4,321 m — "the highest African mountain completely
// free of glaciation", missing the line by <200 m), Ras Dashen (transient
// Dec-Feb only; Ethiopia's rain is summer, so the high ground is dry when it
// is cold), Mount Cameroon (occasional dusting, no cap), Emi Koussi (snow
// about once every seven years). A bare elevation threshold gets Elgon and
// Ras Dashen wrong, which is exactly what the previous SNOW_M = 4300 did.
// The ice LINE is per massif, adapted to the DEM: the game's DEM flattens the
// narrow summits (Mount Kenya reads 4,454 m for a real 5,199; Rwenzori 4,227
// for 5,109), and all three REAL peaks stand far above the real equilibrium
// line, so each must actually show its cap. The GATE carries the truth (which
// massifs had ice); the line only places the cap on the flattened peak. The
// near misses stay excluded by the gate regardless — Elgon's DEM maximum is
// 4,018 m and Ras Dashen's 4,114, below every line here anyway.
const ICE_MASSIFS = [
  { lat: -3.07, lon: 37.35, radiusDeg: 0.55, lineM: 4450 }, // kilimanjaro (DEM peak 5,203)
  { lat: -0.15, lon: 37.31, radiusDeg: 0.5, lineM: 4100 }, // mount-kenya (DEM peak 4,454)
  { lat: 0.39, lon: 29.87, radiusDeg: 0.5, lineM: 3900 }, // rwenzori (DEM peak 4,227)
] as const

/** The glaciated massif covering a point, or null — the gate AND its ice line. */
export function iceMassifAt(lat: number, lon: number): { lineM: number } | null {
  for (const m of ICE_MASSIFS) {
    const dLat = lat - m.lat
    const dLon = lon - m.lon
    if (dLat * dLat + dLon * dLon <= m.radiusDeg * m.radiusDeg) return m
  }
  return null
}

/** Whether a point lies inside one of the three glaciated massifs. */
export function inIceMassif(lat: number, lon: number): boolean {
  return iceMassifAt(lat, lon) !== null
}

// Base palette per terrain type; noise varies brightness per run.
const PALETTE: Record<TerrainType, [number, number, number]> = {
  ocean: [0.11, 0.29, 0.5],
  coast: [0.87, 0.8, 0.58],
  desert: [0.89, 0.74, 0.44],
  savanna: [0.64, 0.6, 0.3],
  jungle: [0.13, 0.38, 0.14],
  mountain: [0.48, 0.42, 0.35],
  water: [0.2, 0.42, 0.6],
}

// Secondary tones blended in by noise for richer, less flat ground colors.
const PALETTE_ALT: Record<TerrainType, [number, number, number]> = {
  ocean: [0.08, 0.22, 0.42],
  coast: [0.8, 0.7, 0.48],
  desert: [0.78, 0.6, 0.34],
  savanna: [0.52, 0.47, 0.22],
  jungle: [0.09, 0.28, 0.11],
  mountain: [0.38, 0.34, 0.3],
  water: [0.2, 0.42, 0.6],
}

const SNOW: [number, number, number] = [0.94, 0.95, 0.97]
const LUSH: [number, number, number] = [0.3, 0.48, 0.18]

function sstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

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

/** Blended biome color: primary/alt tone mixed by noise, no hard steps. */
function biomeColor(type: TerrainType, n: number): [number, number, number] {
  return mix(PALETTE[type], PALETTE_ALT[type], sstep(0.25, 0.75, n))
}

function normalizeSplat(s: SplatWeights): SplatWeights {
  const sum = s[0] + s[1] + s[2] + s[3]
  if (sum <= 0) return [1, 0, 0, 0]
  return [s[0] / sum, s[1] / sum, s[2] / sum, s[3] / sum]
}

/**
 * Sample terrain at geographic coordinates. `seed` controls the per-run
 * procedural appearance; geography itself is fixed real data.
 */
/** Nearest lake by centroid — for the shore BLEND band just outside a polygon,
 *  where lakeIndexAt is already -1 (point 190). The lakes sit far apart, so the
 *  centroid pick is unambiguous. */
function nearestLakeIndex(lat: number, lon: number): number {
  let best = -1
  let bd = Infinity
  for (let li = 0; li < LAKES.length; li++) {
    const c = LAKES[li].center
    const d = Math.hypot(c[0] - lon, c[1] - lat)
    if (d < bd) {
      bd = d
      best = li
    }
  }
  return best
}

/** Per-lake BASIN LEVEL (point 190): the lowest shore ground on a ring pushed
 *  0.5 deg outside the polygon — far enough out that the samples lie beyond the
 *  0.3-deg lake carve band, so this never recurses into its own blend. A lake
 *  bed is levelled by its water: the interior blends to (level − drop), which
 *  puts the rendered sheet (bedMax + LAKE_LIFT) slightly BELOW the lowest shore
 *  at every lake by construction — the fix for the floating Lake Edward. */
const basinLevelCache = new Map<string, number>()
function lakeBasinLevel(li: number, seed: number): number {
  const key = `${li}|${seed}`
  const hit = basinLevelCache.get(key)
  if (hit !== undefined) return hit
  // Re-entrancy sentinel: a ring sample can graze ANOTHER edge of the same
  // snaking polygon and land back in the blend band — the nested call then
  // reads Infinity (bed clamps to no-op) instead of recursing forever.
  basinLevelCache.set(key, Infinity)
  const lake = LAKES[li]
  const cx = lake.points.reduce((s, p) => s + p[0], 0) / lake.points.length
  const cy = lake.points.reduce((s, p) => s + p[1], 0) / lake.points.length
  let lo = Infinity
  for (const [plon, plat] of lake.points) {
    const dx = plon - cx
    const dy = plat - cy
    const n = Math.hypot(dx, dy) || 1
    const olat = plat + (dy / n) * 0.5
    const olon = plon + (dx / n) * 0.5
    if (lakeIndexAt(olat, olon) >= 0) continue // still inside a lake — skip
    lo = Math.min(lo, sampleTerrain(olat, olon, seed).height)
  }
  if (!Number.isFinite(lo)) lo = 0.3 // degenerate polygon: a safe lowland level
  basinLevelCache.set(key, lo)
  return lo
}

export function sampleTerrain(lat: number, lon: number, seed: number): TerrainSample {
  const land = landFractionAt(lat, lon)
  const elevation = elevationAt(lat, lon)
  const detail = fbm2(lon * 3, lat * 3, seed + 7, 3)

  // Continuous shoreline: height and color blend across the smooth
  // (bilinear) land fraction, so the waterline is the smooth 0-contour of
  // the height field — no per-vertex land/ocean steps.
  const shoreT = sstep(0.32, 0.68, land)
  const hOcean = -0.12 + Math.max(-3.4, elevation * 0.0006)
  const hLandBase = Math.max(0.06, elevation * METERS_TO_UNITS) + detail * 0.2 * shoreT

  if (land < 0.5) {
    const height = Math.min(-0.02, hOcean + (hLandBase - hOcean) * shoreT)
    // Depth-driven color following the continuous height field. It converges
    // quickly to one deep tone, so coarse far-LOD triangles show no banding;
    // the animated water plane above provides the visible ocean surface.
    const teal: [number, number, number] = [0.28, 0.52, 0.58]
    const shallow = mix(biomeColor('coast', detail), teal, sstep(0.0, -0.12, height))
    const color = mix(shallow, PALETTE_ALT.ocean, sstep(-0.08, -0.6, height))
    return { height, elevation, type: 'ocean', color, splat: [1, 0, 0, 0] }
  }

  const n = fbm2(lon * 0.6, lat * 0.6, seed, 4)
  // Domain warp (design.md §3): perturb the coordinates that decide the biome
  // and region-color borders with a low-frequency noise field, so those borders
  // meander naturally instead of following the straight region/threshold lines
  // (the raw lat/lon still drive elevation, rivers and coasts — real geodata).
  const warpU = fbm2(lon * 0.4 + 13, lat * 0.4 - 5, seed + 21, 3) - 0.5
  const warpV = fbm2(lon * 0.4 - 8, lat * 0.4 + 11, seed + 22, 3) - 0.5
  const wlon = lon + warpU * BIOME_WARP
  const wlat = lat + warpV * BIOME_WARP
  const region = regionAt(wlat, wlon)
  const shade = 0.85 + detail * 0.3
  const riverD = riverDistance(lat, lon)

  // Height: real relief with stylized exaggeration plus per-run micro-detail.
  let height = hOcean + (hLandBase - hOcean) * shoreT

  // Biome type: mountains from real elevation, the rest from region + noise.
  const mountainT = sstep(MOUNTAIN_M - 350, MOUNTAIN_M + 250, elevation)
  let type: TerrainType
  if (elevation > MOUNTAIN_M) {
    type = 'mountain'
  } else {
    switch (region) {
      case 'north':
        type = 'desert'
        break
      case 'central':
        type = 'jungle'
        break
      case 'east':
        type = n > 0.62 ? 'mountain' : 'savanna'
        break
      case 'south':
        type = wlon < 18.5 && wlat > -31 ? 'desert' : 'savanna'
        break
      case 'west':
      default:
        type = wlat < 8 && wlon < 2 && n > 0.35 ? 'jungle' : 'savanna'
        break
    }
  }

  // Fertile strip along rivers turns desert green (visual only).
  if (type === 'desert' && riverD < 0.45) {
    type = 'savanna'
  }

  // Soft region weights: the same boundaries as regionAt (geo.ts), but with
  // smoothstep transitions of ~2-3 degrees, so neither color nor texture
  // shows hard bands at region borders. The discrete `type` above keeps
  // driving gameplay and vegetation.
  const wNorth = Math.max(
    sstep(15.5, 18.5, wlat),
    Math.min(sstep(13.2, 15.5, wlat), sstep(23, 26.5, wlon)),
  )
  const wSouth = 1 - sstep(-13.5, -10.5, wlat)
  const wEast = Math.min(sstep(30, 33, wlon), 1 - wNorth, 1 - wSouth)
  const wCentral = Math.min(sstep(10.5, 13.5, wlon), 1 - sstep(6.2, 8.8, wlat), 1 - wEast, 1 - wNorth, 1 - wSouth)
  const wWest = Math.max(0, 1 - wNorth - wSouth - wEast - wCentral)

  // Per-region ground colors (before relief/river/coast overlays).
  const colDesert = biomeColor('desert', detail)
  const colSavanna = biomeColor('savanna', detail)
  const colJungle = biomeColor('jungle', detail)
  const colMountain = biomeColor('mountain', detail)
  const colWest =
    wlat < 8 && wlon < 2 ? mix(colSavanna, colJungle, sstep(0.28, 0.45, n)) : colSavanna
  const colEast = mix(colSavanna, colMountain, Math.max(mountainT, sstep(0.5, 0.68, n) * 0.6))
  // Namib/Kalahari strip toward the west coast, softly bounded.
  const southDesertT = Math.min(1 - sstep(17.5, 19.8, wlon), sstep(-32.5, -30, wlat))
  const colSouth = mix(colSavanna, colDesert, southDesertT)

  let color: [number, number, number] = [0, 0, 0]
  const acc = (c: [number, number, number], w: number) => {
    color[0] += c[0] * w
    color[1] += c[1] * w
    color[2] += c[2] * w
  }
  acc(colWest, wWest)
  acc(colJungle, wCentral)
  acc(colEast, wEast)
  acc(colSouth, wSouth)
  acc(colDesert, wNorth)

  // Real relief drives a rocky tint toward the peaks in every region.
  color = mix(color, colMountain, mountainT)

  // Splat weights blended with the same soft region weights.
  const forestW = wCentral + (wlat < 8 && wlon < 2 ? wWest * sstep(0.28, 0.45, n) : 0)
  const sandW = wNorth + wSouth * southDesertT
  const splat: SplatWeights = [
    sandW + 0.12,
    Math.max(0, 1 - forestW - sandW),
    mountainT * 2.5,
    forestW,
  ]

  // Lush banks along rivers and lakes (visual only).
  const bankT = 1 - Math.min(1, riverD / 0.5)
  if (bankT > 0 && type !== 'mountain') {
    const lush = sstep(0.15, 0.9, bankT) * 0.65
    color = mix(color, LUSH, lush)
    splat[1] += lush * 0.8
  }

  // Permanent ice caps (point 141): massif-gated, never a bare threshold —
  // Ras Dashen is higher than Mount Cameroon and still carries none.
  const massif = iceMassifAt(lat, lon)
  if (massif) {
    const snowT = sstep(massif.lineM - 150, massif.lineM + 250, elevation)
    if (snowT > 0) {
      color = mix(color, SNOW, snowT)
    }
  }

  // Smooth shoreline ramp near the sea coast: a gentle beach plain several
  // world units wide, so the waterline gradient stays smooth on all LODs.
  const coastD = coastDistance(lat, lon)
  if (coastD < 0.6) {
    const t = coastD / 0.6
    if (elevation < 400) {
      height = Math.min(height, 0.04 + coastD * 1.3 + detail * 0.06)
      color = mix(biomeColor('coast', detail), color, sstep(0.08, 0.5, t))
      splat[0] += (1 - sstep(0.08, 0.4, t)) * 2
      if (coastD < 0.15) type = 'coast'
    } else {
      height = height * (0.45 + 0.55 * t) // real cliffs, just softened
    }
  }

  // Lakes and rivers carve a continuous channel: height follows the signed
  // distance to the shoreline/centerline, so the waterline is the smooth
  // 0-contour — no per-vertex steps along banks (design.md §3).
  const lakeD = lakeDistance(lat, lon, 1)
  // RIVERS carve their bed *relative to the local relief*, so the water
  // follows the map's height profile (design.md §2/§11) instead of cutting
  // sea-level canyons through the highlands. LAKES are different (point 190):
  // a lake bed is levelled by its WATER — the old relative carve kept the rift
  // slope in the bed, so the max-bed sheet stood metres over the low shores
  // (the user's floating Lake Edward). Inside a lake the height now blends to
  // a flat per-lake BASIN LEVEL (lowest shore ground − drop), which puts the
  // sheet (bedMax + LAKE_LIFT) slightly BELOW its lowest shore at every lake
  // by construction. The visible surfaces are separate meshes laid into these
  // beds (scenes/travel/Rivers.tsx).
  let carve = 0
  let lakeDrop = 0 // applied directly here; carve below is river-only
  if (lakeD < 0.3 || lakeContains(lat, lon)) {
    const inside = lakeContains(lat, lon)
    const sd = inside ? -lakeD : lakeD // signed: negative inside
    const w = sstep(0.28, -0.12, sd)
    if (w > 0) {
      const li = inside ? lakeIndexAt(lat, lon) : nearestLakeIndex(lat, lon)
      if (li >= 0) {
        const bed = lakeBasinLevel(li, seed) - 0.35
        // Never RAISE relief onto the level (a spot already below stays).
        const flat = Math.min(height, bed)
        lakeDrop = (height - flat) * w
        height -= lakeDrop
      }
    }
    if (sd < -0.005) type = 'water'
  }
  const riverS = riverD - RIVER_WIDTH_DEG
  if (riverS < RIVER_WIDTH_DEG * 1.6) {
    carve = Math.max(carve, sstep(RIVER_WIDTH_DEG * 1.6, -RIVER_WIDTH_DEG * 0.6, riverS) * 0.5)
    if (riverS < -0.005) type = 'water'
  }
  if (carve > 0) height -= carve
  if (type === 'water') {
    // Sandy bank fading into water-blue with channel depth; the river/lake
    // surface meshes above add the actual water.
    const depth = sstep(0.1, 0.5, Math.max(carve, lakeDrop))
    color = mix(mix(biomeColor('coast', detail), color, 0.4), PALETTE.water, depth)
    splat[0] += 1.5
  }

  return { height, elevation, type, color: vary(color, shade), splat: normalizeSplat(splat) }
}

// --- Movement boundary (design.md §11.2) --------------------------------------
// Ocean enclosed by the continent's outline (bays, gulfs, straits cutting
// into the landmass) counts as inland water and can be swum through — but
// only within a calibratable band off the coast (balance.oceanSwimMarginDeg);
// further out, and everywhere outside the outline's convex hull, the open
// sea blocks movement. Exception: everything northeast of the Red Sea
// boundary (redSea.ts) is always open, impassable ocean — the Red Sea is
// never inland water.

let hullCache: Array<[number, number]> | null = null

/** Convex hull of the mainland outline (Andrew's monotone chain), lon/lat. */
function continentHull(): Array<[number, number]> {
  if (hullCache) return hullCache
  const pts = [...LAND_POLYGONS[0].points].sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const cross = (o: [number, number], a: [number, number], b: [number, number]) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
  const lower: Array<[number, number]> = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop()
    lower.push(p)
  }
  const upper: Array<[number, number]> = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop()
    upper.push(p)
  }
  hullCache = [...lower.slice(0, -1), ...upper.slice(0, -1)]
  return hullCache
}

/** Point-in-convex-polygon test (hull is counterclockwise, lon/lat). */
function insideContinentOutline(lat: number, lon: number): boolean {
  const hull = continentHull()
  for (let i = 0; i < hull.length; i++) {
    const [ax, ay] = hull[i]
    const [bx, by] = hull[(i + 1) % hull.length]
    if ((bx - ax) * (lat - ay) - (by - ay) * (lon - ax) < 0) return false
  }
  return true
}

let coastSegments: Float64Array | null = null

/** Distance (degrees) to the nearest coastline segment of any land polygon. */
function coastlineDistanceDeg(lat: number, lon: number): number {
  if (!coastSegments) {
    const segs: number[] = []
    for (const poly of LAND_POLYGONS) {
      const pts = poly.points
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i]
        const [bx, by] = pts[(i + 1) % pts.length]
        segs.push(ax, ay, bx - ax, by - ay)
      }
    }
    coastSegments = new Float64Array(segs)
  }
  let best = Infinity
  const s = coastSegments
  for (let i = 0; i < s.length; i += 4) {
    const ax = s[i]
    const ay = s[i + 1]
    const dx = s[i + 2]
    const dy = s[i + 3]
    const t = Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / (dx * dx + dy * dy)))
    const px = lon - (ax + dx * t)
    const py = lat - (ay + dy * t)
    const d = px * px + py * py
    if (d < best) best = d
  }
  return Math.sqrt(best)
}

/** The Mediterranean is open sea, never a swimmable bight (design.md §11.2):
 *  the convex hull spanning the northern coast would otherwise class the
 *  water off Alexandria or in the Gulf of Sidra as continent-enclosed and
 *  open its coastal band to swimming. Ocean north of this latitude and east
 *  of Gibraltar always blocks; the African north coast itself lies south of
 *  the latitude only as land, so no legitimate swim water is caught. */
const MEDITERRANEAN_LAT_MIN = 30.2
const MEDITERRANEAN_LON_MIN = -6.5

/**
 * Ocean blocks movement only outside the continent's outline (design.md
 * §11.2); enclosed sea water is swimmable like rivers and lakes, but only
 * within the calibratable swim margin off the coast — no swimming far out
 * into the open sea. Northeast of the Red Sea boundary and throughout the
 * Mediterranean the ocean always blocks, hull or not.
 */
export function isBlocked(type: TerrainType, lat?: number, lon?: number): boolean {
  if (type !== 'ocean') return false
  if (lat === undefined || lon === undefined) return true
  if (isNortheastOfBoundary(lat, lon)) return true
  if (lat > MEDITERRANEAN_LAT_MIN && lon > MEDITERRANEAN_LON_MIN) return true
  if (!insideContinentOutline(lat, lon)) return true
  return coastlineDistanceDeg(lat, lon) > balance.oceanSwimMarginDeg
}

// Dev hooks for the headless verification (CLAUDE.md §7.2): terrain type and
// height at a coordinate, so tests can locate a jungle/mountain/water tile —
// or a slope (the point-128 landed-vulture check).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__terrainType = (lat: number, lon: number, seed: number) =>
    sampleTerrain(lat, lon, seed).type
  ;(window as unknown as Record<string, unknown>).__terrainHeight = (lat: number, lon: number, seed: number) =>
    sampleTerrain(lat, lon, seed).height
}
