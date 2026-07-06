// Named landmarks of design.md §4.4: mountains ("u. a." — the five named
// peaks plus further major peaks of the continent), waterfalls, and the
// special site (elephant graveyard). Positions are real (~1890 geography);
// only the elephant graveyard is fictional and placed by educated guess.

export interface MountainDef {
  name: string
  lon: number
  lat: number
  /** Real elevation in meters (drives the stylized terrain bump). */
  elevationM: number
  /** Bump radius in degrees (massif footprint, stylized). */
  radiusDeg: number
}

export const MOUNTAINS: MountainDef[] = [
  { name: 'Toubkal', lon: -7.91, lat: 31.06, elevationM: 4167, radiusDeg: 0.7 },
  { name: 'Emi Koussi', lon: 18.55, lat: 19.87, elevationM: 3445, radiusDeg: 1.2 },
  { name: 'Kilimandscharo', lon: 37.35, lat: -3.07, elevationM: 5895, radiusDeg: 0.55 },
  { name: 'Kenia', lon: 37.31, lat: -0.15, elevationM: 5199, radiusDeg: 0.5 },
  { name: 'Elgon', lon: 34.53, lat: 1.12, elevationM: 4321, radiusDeg: 0.5 },
  // "u. a." — further major peaks at their real positions:
  { name: 'Ras Daschan', lon: 38.37, lat: 13.24, elevationM: 4550, radiusDeg: 0.8 },
  { name: 'Kamerunberg', lon: 9.17, lat: 4.2, elevationM: 4095, radiusDeg: 0.45 },
  { name: 'Tahat', lon: 5.54, lat: 23.29, elevationM: 2908, radiusDeg: 1.4 },
  { name: 'Ruwenzori', lon: 29.87, lat: 0.39, elevationM: 5109, radiusDeg: 0.5 },
  { name: 'Meru', lon: 36.75, lat: -3.25, elevationM: 4566, radiusDeg: 0.4 },
  { name: 'Thabana Ntlenyana', lon: 29.27, lat: -29.47, elevationM: 3482, radiusDeg: 0.8 },
]

export interface WaterfallDef {
  name: string
  lon: number
  lat: number
  /** River the falls belong to (matches rivers.ts names). */
  river: string
}

export const WATERFALLS: WaterfallDef[] = [
  { name: 'Stanley-Fälle', lon: 25.2, lat: 0.5, river: 'Kongo' },
  { name: 'Livingstone-Fälle', lon: 14.35, lat: -5.15, river: 'Kongo' },
  { name: 'Kabalega-Fälle', lon: 31.68, lat: 2.28, river: 'Weißer Nil' },
  { name: 'Victoria-Fälle', lon: 25.86, lat: -17.93, river: 'Sambesi' },
  { name: 'Augrabies-Fälle', lon: 20.34, lat: -28.59, river: 'Oranje' },
]

// Highland ridges as (lon, lat) polylines with a width in degrees — the major
// mountain belts beyond single peaks (stylized footprints, real locations).
export interface RidgeDef {
  name: string
  points: Array<[number, number]>
  widthDeg: number
  /** Peak elevation in meters along the ridge crest. */
  elevationM: number
}

export const RIDGES: RidgeDef[] = [
  {
    name: 'Atlas',
    points: [[-9.0, 30.5], [-7.0, 31.5], [-4.5, 33.0], [-2.0, 34.5], [0.5, 35.5], [4.0, 36.2]],
    widthDeg: 1.1,
    elevationM: 3800,
  },
  {
    name: 'Äthiopisches Hochland',
    points: [[36.5, 7.0], [38.0, 9.0], [39.0, 11.0], [38.4, 13.2]],
    widthDeg: 2.0,
    elevationM: 3400,
  },
  {
    name: 'Drakensberge',
    points: [[27.0, -31.0], [29.3, -29.3], [30.3, -27.5], [30.5, -25.5]],
    widthDeg: 0.9,
    elevationM: 3000,
  },
]

// Special site (design.md §4.4): the elephant graveyard. Fictional; placed by
// educated guess in the remote steppe south-west of Kilimanjaro (calibratable).
// OPEN: design.md gives the graveyard valuable ivory but no collection
// mechanic is defined for the POC — it is placed and labeled only.
export const ELEPHANT_GRAVEYARD = { name: 'Elefantenfriedhof', lon: 36.6, lat: -4.9 }
