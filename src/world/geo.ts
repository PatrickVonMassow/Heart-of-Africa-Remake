// Fixed geography of the continent (design.md §3/§4): coordinate mapping,
// region model and the full place roster — all 10 port cities and one village
// per each of the 22 peoples. Coastline, rivers, lakes and landmarks live in
// ./data/* and are indexed by ./geoIndex.ts. The geographic *positions* are
// fixed (authentic ~1890); only the visual appearance of the landscape is
// procedural per run (design.md §18).

import { RIVERS_DATA, type RiverDef } from './data/rivers'

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

/** All 17 rivers (design.md §4.3) with named source and mouth. */
export const RIVERS: RiverDef[] = RIVERS_DATA

export type RegionId = 'north' | 'west' | 'central' | 'east' | 'south'

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
 * Region lookup from coordinates (design.md §3: five regions). Banded model
 * refined to the continent's shape: Sahara belt incl. Nubia, the Congo basin,
 * the eastern mountain/rift belt and the southern plateau. Village/port
 * region *membership* follows design.md §4.5 via the explicit `region` field
 * on each place; this function drives landscape, status display and entry
 * journal texts.
 */
export function regionAt(lat: number, lon: number): RegionId {
  if (lat >= 17 || (lat >= 14.5 && lon >= 25)) return 'north'
  if (lat <= -12) return 'south'
  if (lon >= 31.5) return 'east'
  if (lon >= 12 && lat <= 7.5) return 'central'
  return 'west'
}

/**
 * Region boundary polylines as [lon, lat] points, matching regionAt()'s
 * thresholds exactly. Used to draw the borders on the exploration map and in
 * the bird's-eye view (design.md §3); renderers clip them to land themselves.
 */
export const REGION_BORDERS: Array<Array<[number, number]>> = [
  // North vs. the rest: lat 17 west of lon 25, stepping down to lat 14.5 east of it.
  [[-20, 17], [25, 17], [25, 14.5], [53, 14.5]],
  // South vs. the rest: lat -12.
  [[-20, -12], [53, -12]],
  // East vs. west/central: lon 31.5.
  [[31.5, 14.5], [31.5, -12]],
  // Central vs. west: lon 12 up to lat 7.5, then along lat 7.5 to the east border.
  [[12, -12], [12, 7.5], [31.5, 7.5]],
]

/**
 * Label anchors on both sides of every region border (design.md §3: the
 * region's name is shown on its side of the boundary). Anchors are spaced
 * `spacingDeg` along the border and offset `offsetDeg` perpendicular to it;
 * renderers clip them to land themselves.
 */
export function regionBorderLabelAnchors(
  spacingDeg: number,
  offsetDeg: number,
): Array<{ lat: number; lon: number; region: RegionId }> {
  const out: Array<{ lat: number; lon: number; region: RegionId }> = []
  for (const line of REGION_BORDERS) {
    let ahead = spacingDeg / 2 // distance to the next anchor
    for (let s = 0; s < line.length - 1; s++) {
      const [lon0, lat0] = line[s]
      const [lon1, lat1] = line[s + 1]
      const segLen = Math.hypot(lon1 - lon0, lat1 - lat0)
      const pLon = -(lat1 - lat0) / segLen
      const pLat = (lon1 - lon0) / segLen
      let d = ahead
      while (d < segLen) {
        const t = d / segLen
        const lon = lon0 + (lon1 - lon0) * t
        const lat = lat0 + (lat1 - lat0) * t
        for (const side of [1, -1]) {
          const oLon = lon + pLon * offsetDeg * side
          const oLat = lat + pLat * offsetDeg * side
          out.push({ lat: oLat, lon: oLon, region: regionAt(oLat, oLon) })
        }
        d += spacingDeg
      }
      ahead = d - segLen
    }
  }
  return out
}

export type PlaceKind = 'port' | 'village'

export interface PlaceDef {
  /** Place id; display names come from the language files (i18n). */
  id: string
  kind: PlaceKind
  /** People carrying the hints (villages only, design.md §4.2); i18n id. */
  peopleId?: string
  lat: number
  lon: number
  region: RegionId
  /**
   * Settlement size mirroring real ~1890 importance (design.md §4.1):
   * 1 = small outpost, 2 = town, 3 = major city. Villages omit it.
   */
  size?: 1 | 2 | 3
}

// All 10 port cities (design.md §4.1) at their real ~1890 positions, nudged
// slightly inland so each marker sits on walkable land.
const PORTS: PlaceDef[] = [
  // River ports sit on the bank beside the channel (east bank at Cairo,
  // west of the White Nile at Khartoum, north bank at Boma).
  // Sizes reflect real ~1890 importance: Cairo, Zanzibar and Cape Town were
  // major cities; Boma and Berbera small stations.
  { id: 'cairo', kind: 'port', lat: 30.05, lon: 31.45, region: 'north', size: 3 },
  { id: 'tangier', kind: 'port', lat: 35.6, lon: -5.75, region: 'north', size: 2 },
  { id: 'khartoum', kind: 'port', lat: 15.5, lon: 32.15, region: 'north', size: 2 },
  { id: 'st-louis', kind: 'port', lat: 15.9, lon: -16.2, region: 'west', size: 2 },
  { id: 'timbuktu', kind: 'port', lat: 16.77, lon: -3.0, region: 'west', size: 2 },
  { id: 'lagos', kind: 'port', lat: 6.55, lon: 3.4, region: 'west', size: 2 },
  { id: 'boma', kind: 'port', lat: -5.65, lon: 13.05, region: 'central', size: 1 },
  { id: 'berbera', kind: 'port', lat: 10.3, lon: 45.0, region: 'east', size: 1 },
  // Zanzibar lies on its island (data/coastline.ts); it is reached by ferry
  // from any port's travel agency (design.md §10) or by canoe across the
  // enclosed strait.
  { id: 'zanzibar', kind: 'port', lat: -6.16, lon: 39.3, region: 'east', size: 3 },
  { id: 'capetown', kind: 'port', lat: -33.8, lon: 18.5, region: 'south', size: 3 },
]

// One village per each of the 22 peoples (design.md §4.2), region membership
// per design.md §4.5. Positions are educated guesses at each people's ~1890
// heartland; where the design region and the historical heartland disagree
// (Bombara, Bemba, Fang), the position is shifted toward the design region.
const VILLAGES: PlaceDef[] = [
  // North — Tuareg, Berbers, Nubians, Bombara
  { id: 'tuareg-village', kind: 'village', peopleId: 'tuareg', lat: 23.2, lon: 5.8, region: 'north' },
  { id: 'berber-village', kind: 'village', peopleId: 'berbers', lat: 31.7, lon: -7.2, region: 'north' },
  { id: 'nubian-village', kind: 'village', peopleId: 'nubians', lat: 21.8, lon: 31.6, region: 'north' },
  { id: 'bombara-village', kind: 'village', peopleId: 'bombara', lat: 17.2, lon: -3.5, region: 'north' },
  // West — Hausa, Mandingo, Fang
  { id: 'hausa-village', kind: 'village', peopleId: 'hausa', lat: 12.0, lon: 8.5, region: 'west' },
  { id: 'mandingo-village', kind: 'village', peopleId: 'mandingo', lat: 11.5, lon: -9.0, region: 'west' },
  { id: 'fang-village', kind: 'village', peopleId: 'fang', lat: 1.8, lon: 11.5, region: 'west' },
  // Central — Mongo, Pygmies, Banda, Bambundu, Lunda
  { id: 'mongo-village', kind: 'village', peopleId: 'mongo', lat: -1.5, lon: 21.0, region: 'central' },
  { id: 'pygmy-village', kind: 'village', peopleId: 'pygmies', lat: 1.4, lon: 28.6, region: 'central' },
  { id: 'banda-village', kind: 'village', peopleId: 'banda', lat: 6.0, lon: 21.5, region: 'central' },
  { id: 'bambundu-village', kind: 'village', peopleId: 'bambundu', lat: -9.3, lon: 15.3, region: 'central' },
  { id: 'lunda-village', kind: 'village', peopleId: 'lunda', lat: -10.0, lon: 23.4, region: 'central' },
  // East — Masai, Swahili, Somali, Sidamo, Uganda
  { id: 'masai-village', kind: 'village', peopleId: 'masai', lat: -2.5, lon: 36.8, region: 'east' },
  { id: 'swahili-village', kind: 'village', peopleId: 'swahili', lat: -6.5, lon: 38.7, region: 'east' },
  { id: 'somali-village', kind: 'village', peopleId: 'somali', lat: 5.5, lon: 45.0, region: 'east' },
  { id: 'sidamo-village', kind: 'village', peopleId: 'sidamo', lat: 6.7, lon: 38.4, region: 'east' },
  { id: 'uganda-village', kind: 'village', peopleId: 'uganda', lat: 0.75, lon: 32.55, region: 'east' },
  // South — Batwa, Bemba, Bantu, Zulu, Bushmen
  { id: 'batwa-village', kind: 'village', peopleId: 'batwa', lat: -19.0, lon: 22.5, region: 'south' },
  { id: 'bemba-village', kind: 'village', peopleId: 'bemba', lat: -12.5, lon: 31.0, region: 'south' },
  { id: 'bantu-village', kind: 'village', peopleId: 'bantu', lat: -24.5, lon: 29.5, region: 'south' },
  { id: 'zulu-village', kind: 'village', peopleId: 'zulu', lat: -28.4, lon: 31.3, region: 'south' },
  { id: 'bushmen-village', kind: 'village', peopleId: 'bushmen', lat: -22.5, lon: 21.0, region: 'south' },
]

export const PLACES: PlaceDef[] = [...PORTS, ...VILLAGES]

export function placeById(id: string): PlaceDef {
  const p = PLACES.find((p) => p.id === id)
  if (!p) throw new Error(`unknown place: ${id}`)
  return p
}
