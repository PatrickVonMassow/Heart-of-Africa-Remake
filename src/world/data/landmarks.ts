// Named landmarks of design.md §4.4: mountains ("u. a." — the five named
// peaks plus further major peaks of the continent), waterfalls, and the
// special site (elephant graveyard). Positions are real (~1890 geography);
// only the elephant graveyard is fictional and placed by educated guess.

import { riverDistanceExact } from '../hydro'
import { RIVER_WIDTH_DEG } from '../terrain'

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

// Special site (design.md §4.4): the elephant graveyard. Fictional; placed by
// educated guess in the remote steppe south-west of Kilimanjaro (calibratable).
// Digging here with the shovel recovers a limited supply of ivory treasures
// (store.dig, balance.economy.graveyardIvory).
export const ELEPHANT_GRAVEYARD = { id: 'elephant-graveyard', lon: 36.6, lat: -4.9 }

// Built cultural landmarks (design.md §4.4): achievements of African
// civilisations — the Nubian pyramids of Meroë (kingdom of Kush), Great
// Zimbabwe, the Zagwe-era rock-hewn churches of Lalibela, the coastal
// ruins of the Swahili Kilwa Sultanate, the towering stelae of the Aksumite
// kingdom, the Gondarine castles of Fasil Ghebbi (imperial Ethiopia), and
// the Dogon cliff dwellings of the Bandiagara escarpment above the older
// Tellem sites. Real positions (~1890 geography); all existed as standing
// structures or ruins by 1890. These are the game's built landmarks (the
// rest are natural peaks/falls/lakes/sites plus the fictional elephant
// graveyard).
export interface CulturalLandmarkDef {
  id: string
  lon: number
  lat: number
  /** Drives geometry and the discovery-journal flavor. */
  kind:
    | 'pyramids'
    | 'giza-pyramids'
    | 'stone-city'
    | 'rock-churches'
    | 'coastal-ruins'
    | 'stelae'
    | 'castles'
    | 'cliff-dwellings'
}

// The Meroë pyramid FIELD (render/landmarks.ts buildMeroePyramids) spreads
// ~6.4 world units (0.64° at 10 units/°) from its mount and sits on the Nile's
// east bank, so at its raw coordinate the westernmost tombs stand in the
// rendered river band (user report). Shift the mount off the nearest river until
// the WHOLE footprint clears the water: field radius + the river half-width
// (terrain RIVER_WIDTH_DEG 0.17°) + a small margin. Deterministic (pure river
// geometry), bounded; a site already clear returns unchanged after one query.
// Only Meroë is river-side, but the shift is generic so any bank-side field is
// nudged onto dry ground.
// Field spread (~0.64°) + rim margin past the calibratable river half-width.
const LANDMARK_FIELD_CLEARANCE_DEG = RIVER_WIDTH_DEG + 0.73

function clearedOfRiversBy(lat: number, lon: number, clearanceDeg: number): { lat: number; lon: number } {
  let a = lat
  let o = lon
  for (let i = 0; i < 40; i++) {
    const d = riverDistanceExact(a, o, 1)
    if (d >= clearanceDeg) break
    const e = 0.02
    const gLat = riverDistanceExact(a + e, o, 1) - riverDistanceExact(a - e, o, 1)
    const gLon = riverDistanceExact(a, o + e, 1) - riverDistanceExact(a, o - e, 1)
    const gl = Math.hypot(gLat, gLon)
    if (gl < 1e-6) {
      o += e // dead centre of a channel: fixed eastward nudge, re-aim
      continue
    }
    const step = Math.min(0.08, clearanceDeg - d + 0.01)
    a += (gLat / gl) * step
    o += (gLon / gl) * step
  }
  return { lat: a, lon: o }
}

const CULTURAL_LANDMARK_DEFS: CulturalLandmarkDef[] = [
  { id: 'meroe', lon: 33.75, lat: 16.94, kind: 'pyramids' },
  // Just west of Cairo across the Nile — via the travel-scene panorama the
  // field also stands on the port's first-person horizon (point 82).
  // West of the Nile's rendered band (axis ~31.22 at this latitude, half
  // width 0.17°): the whole FIELD FOOTPRINT (±~0.29° incl. the Sphinx) must
  // stand on the west-bank desert, not in the channel (user report).
  { id: 'giza', lon: 30.59, lat: 29.98, kind: 'giza-pyramids' },
  { id: 'great-zimbabwe', lon: 30.93, lat: -20.27, kind: 'stone-city' },
  { id: 'lalibela', lon: 39.04, lat: 12.03, kind: 'rock-churches' },
  { id: 'kilwa', lon: 39.51, lat: -8.96, kind: 'coastal-ruins' },
  { id: 'aksum', lon: 38.72, lat: 14.13, kind: 'stelae' },
  { id: 'gondar', lon: 37.47, lat: 12.61, kind: 'castles' },
  { id: 'bandiagara', lon: -3.4, lat: 14.35, kind: 'cliff-dwellings' },
]

// Meroë is shifted off the Nile so its whole pyramid field stands on the east
// bank; every other field is already clear and returns unchanged.
export const CULTURAL_LANDMARKS: CulturalLandmarkDef[] = CULTURAL_LANDMARK_DEFS.map((c) =>
  c.id === 'meroe' ? { ...c, ...clearedOfRiversBy(c.lat, c.lon, LANDMARK_FIELD_CLEARANCE_DEG) } : c,
)

// Natural point-landmarks (design.md §4.4): real natural wonders sighted and
// journaled like the other landmarks. Okavango is deliberately offset south
// so marker and label do not collide with the nearby village marker.
export interface NaturalSiteDef {
  id: string
  lon: number
  lat: number
  kind: 'crater' | 'volcano' | 'delta' | 'wetland'
}

export const NATURAL_SITES: NaturalSiteDef[] = [
  { id: 'ngorongoro', lon: 35.58, lat: -3.16, kind: 'crater' },
  { id: 'lengai', lon: 35.9, lat: -2.76, kind: 'volcano' },
  { id: 'okavango', lon: 22.9, lat: -19.5, kind: 'delta' },
  { id: 'sudd', lon: 30.5, lat: 8.0, kind: 'wetland' },
]
