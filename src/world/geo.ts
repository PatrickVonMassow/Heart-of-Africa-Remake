// Fixed geography of the continent (design.md §3/§4): coordinate mapping,
// approximate coastline, the Nile river system, region lookup and place data.
// The geographic *positions* are fixed; only the visual appearance of the
// landscape is procedural per run (design.md §18).

/** World units per degree of latitude/longitude (flat equirectangular mapping). */
export const UNITS_PER_DEGREE = 10

export interface LatLon {
  lat: number
  lon: number
}

export function latLonToWorld(lat: number, lon: number): { x: number; z: number } {
  return { x: lon * UNITS_PER_DEGREE, z: -lat * UNITS_PER_DEGREE }
}

export function worldToLatLon(x: number, z: number): LatLon {
  return { lat: -z / UNITS_PER_DEGREE, lon: x / UNITS_PER_DEGREE }
}

/** German coordinate string, e.g. "Breite 30,0 Grad Nord, Länge 31,2 Grad Ost". */
export function formatLatLon(p: LatLon): string {
  const latDir = p.lat >= 0 ? 'Nord' : 'Süd'
  const lonDir = p.lon >= 0 ? 'Ost' : 'West'
  const fmt = (v: number) => Math.abs(v).toFixed(1).replace('.', ',')
  return `Breite ${fmt(p.lat)} Grad ${latDir} · Länge ${fmt(p.lon)} Grad ${lonDir}`
}

// Approximate African coastline as (lon, lat) polygon, clockwise from Tangier.
// Rudimentary by design (CLAUDE.md §7.1.3) — shape, not survey accuracy.
export const COASTLINE: Array<[number, number]> = [
  [-5.9, 35.8], [3.0, 36.9], [10.3, 37.3], [10.0, 33.5], [15.3, 32.4],
  [20.1, 32.2], [25.0, 31.6], [29.9, 31.2], [32.3, 31.3], [32.6, 29.9],
  [33.9, 27.0], [35.5, 24.0], [37.2, 21.0], [39.6, 15.5], [42.8, 12.6],
  [43.4, 11.5], [44.3, 10.4], [51.0, 11.8], [51.4, 10.4], [45.3, 2.0],
  [41.0, -2.0], [39.7, -4.0], [39.3, -6.8], [40.5, -10.5], [40.6, -14.0],
  [36.9, -17.8], [34.8, -19.8], [35.4, -23.8], [32.6, -25.9], [31.0, -29.9],
  [27.9, -33.0], [25.6, -34.0], [20.0, -34.8], [18.4, -34.2], [18.3, -32.0],
  [16.5, -28.6], [14.5, -22.5], [11.8, -18.0], [13.2, -8.8], [12.3, -6.1],
  [9.3, 0.4], [9.8, 4.0], [5.3, 5.3], [3.4, 6.4], [-2.0, 4.9],
  [-7.5, 4.4], [-13.3, 8.5], [-17.4, 14.7], [-16.2, 19.5], [-14.5, 24.0],
  [-11.5, 28.0], [-9.8, 31.5], [-7.6, 33.6],
]

// Nile river system as (lon, lat) polylines (design.md §4.3).
// OPEN: only the Nile system is modeled in the POC; the other 16 rivers,
// lakes and named landmarks from design.md §4.3/§4.4 are out of POC scope
// (CLAUDE.md §8 allows the minimum of one region).
export const RIVERS: Array<{ name: string; points: Array<[number, number]> }> = [
  {
    name: 'Nil',
    points: [
      [31.0, 31.4], [31.2, 30.0], [31.3, 28.0], [30.8, 26.2], [32.9, 24.1],
      [33.0, 22.0], [30.5, 19.2], [32.5, 15.6],
    ],
  },
  {
    name: 'Weißer Nil',
    points: [
      [32.5, 15.6], [32.5, 12.0], [31.7, 9.5], [31.6, 7.0], [31.4, 4.0], [31.4, 2.2],
    ],
  },
  {
    name: 'Blauer Nil',
    points: [
      [32.5, 15.6], [34.1, 13.5], [35.6, 12.6], [37.3, 12.0],
    ],
  },
]

/** River half-width in degrees for terrain sampling. */
export const RIVER_WIDTH_DEG = 0.18

export type RegionId = 'north' | 'west' | 'central' | 'east' | 'south'

export const REGION_NAMES: Record<RegionId, string> = {
  north: 'Norden',
  west: 'Westen',
  central: 'Zentral',
  east: 'Osten',
  south: 'Süden',
}

// Culture/value matrix (design.md §8): revered / rejected materials per region.
export type Material = 'gold' | 'silver' | 'emerald' | 'copper' | 'ivory'

export const REGION_VALUES: Record<RegionId, { revered: Material[]; rejected: Material[] }> = {
  north: { revered: ['gold', 'emerald'], rejected: ['silver'] },
  west: { revered: ['ivory'], rejected: ['emerald'] },
  central: { revered: ['silver'], rejected: ['gold'] },
  south: { revered: ['copper', 'emerald'], rejected: ['ivory'] },
  east: { revered: ['emerald'], rejected: ['copper'] },
}

/**
 * Region lookup from coordinates. Rudimentary banded model of design.md §3:
 * north = Sahara belt, west = savanna west of the Congo basin, central =
 * Congo basin jungle, east = mountains/rift east of it, south = high plateau.
 */
export function regionAt(lat: number, lon: number): RegionId {
  if (lat > 16) return 'north'
  if (lat < -11) return 'south'
  if (lon > 30) return 'east'
  if (lon >= 9 && lat < 6) return 'central'
  return 'west'
}

export type PlaceKind = 'port' | 'village'

export interface PlaceDef {
  id: string
  kind: PlaceKind
  name: string
  /** People carrying the hints (villages only, design.md §4.2). */
  people?: string
  lat: number
  lon: number
  region: RegionId
}

// POC minimum (CLAUDE.md §8): the start port Cairo and one village of the
// Nubians (north region, design.md §4.5), placed on the Nile.
export const PLACES: PlaceDef[] = [
  { id: 'cairo', kind: 'port', name: 'Kairo', lat: 30.0, lon: 31.5, region: 'north' },
  { id: 'nubian-village', kind: 'village', name: 'Dorf der Nubier', people: 'Nubier', lat: 21.8, lon: 32.6, region: 'north' },
]

export function placeById(id: string): PlaceDef {
  const p = PLACES.find((p) => p.id === id)
  if (!p) throw new Error(`unknown place: ${id}`)
  return p
}
