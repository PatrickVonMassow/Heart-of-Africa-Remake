// Named landmarks of design.md §4.4: mountains ("u. a." — the five named
// peaks plus further major peaks of the continent), waterfalls, and the
// special site (elephant graveyard). Positions are real (~1890 geography);
// only the elephant graveyard is fictional and placed by educated guess.

export interface MountainDef {
  /** Landmark id; display names come from the language files (i18n). */
  id: string
  lon: number
  lat: number
  /** Real elevation in meters (drives the stylized terrain bump). */
  elevationM: number
  /** Bump radius in degrees (massif footprint, stylized). */
  radiusDeg: number
}

export const MOUNTAINS: MountainDef[] = [
  { id: 'toubkal', lon: -7.91, lat: 31.06, elevationM: 4167, radiusDeg: 0.7 },
  { id: 'emi-koussi', lon: 18.55, lat: 19.87, elevationM: 3445, radiusDeg: 1.2 },
  { id: 'kilimanjaro', lon: 37.35, lat: -3.07, elevationM: 5895, radiusDeg: 0.55 },
  { id: 'mount-kenya', lon: 37.31, lat: -0.15, elevationM: 5199, radiusDeg: 0.5 },
  { id: 'elgon', lon: 34.53, lat: 1.12, elevationM: 4321, radiusDeg: 0.5 },
  // "u. a." — further major peaks at their real positions:
  { id: 'ras-dashen', lon: 38.37, lat: 13.24, elevationM: 4550, radiusDeg: 0.8 },
  { id: 'mount-cameroon', lon: 9.17, lat: 4.2, elevationM: 4095, radiusDeg: 0.45 },
  { id: 'tahat', lon: 5.54, lat: 23.29, elevationM: 2908, radiusDeg: 1.4 },
  { id: 'rwenzori', lon: 29.87, lat: 0.39, elevationM: 5109, radiusDeg: 0.5 },
  { id: 'meru', lon: 36.75, lat: -3.25, elevationM: 4566, radiusDeg: 0.4 },
  { id: 'thabana-ntlenyana', lon: 29.27, lat: -29.47, elevationM: 3482, radiusDeg: 0.8 },
]

export interface WaterfallDef {
  /** Landmark id; display names come from the language files (i18n). */
  id: string
  lon: number
  lat: number
  /** River the falls belong to (matches rivers.ts ids). */
  river: string
}

export const WATERFALLS: WaterfallDef[] = [
  { id: 'stanley-falls', lon: 25.2, lat: 0.5, river: 'congo' },
  { id: 'livingstone-falls', lon: 14.35, lat: -5.15, river: 'congo' },
  { id: 'kabalega-falls', lon: 31.68, lat: 2.28, river: 'white-nile' },
  { id: 'victoria-falls', lon: 25.86, lat: -17.93, river: 'zambezi' },
  { id: 'augrabies-falls', lon: 20.34, lat: -28.59, river: 'orange' },
]

// Highland ridges as (lon, lat) polylines with a width in degrees — the major
// mountain belts beyond single peaks (stylized footprints, real locations).
export interface RidgeDef {
  /** Landmark id; display names come from the language files (i18n). */
  id: string
  points: Array<[number, number]>
  widthDeg: number
  /** Peak elevation in meters along the ridge crest. */
  elevationM: number
}

export const RIDGES: RidgeDef[] = [
  {
    id: 'atlas',
    points: [[-9.0, 30.5], [-7.0, 31.5], [-4.5, 33.0], [-2.0, 34.5], [0.5, 35.5], [4.0, 36.2]],
    widthDeg: 1.1,
    elevationM: 3800,
  },
  {
    id: 'ethiopian-highlands',
    points: [[36.5, 7.0], [38.0, 9.0], [39.0, 11.0], [38.4, 13.2]],
    widthDeg: 2.0,
    elevationM: 3400,
  },
  {
    id: 'drakensberg',
    points: [[27.0, -31.0], [29.3, -29.3], [30.3, -27.5], [30.5, -25.5]],
    widthDeg: 0.9,
    elevationM: 3000,
  },
]

// Special site (design.md §4.4): the elephant graveyard. Fictional; placed by
// educated guess in the remote steppe south-west of Kilimanjaro (calibratable).
// Digging here with the shovel recovers a limited supply of ivory treasures
// (store.dig, balance.economy.graveyardIvory).
export const ELEPHANT_GRAVEYARD = { id: 'elephant-graveyard', lon: 36.6, lat: -4.9 }
