// Region-typical place styling (design.md §2 "Graphics and atmosphere" and
// "Lively, densely built settlements"): building form, settlement layout, fences,
// ground/path palette, clothing colors and vegetation mix per region — so a
// desert village reads clearly differently from a jungle or rift one.
// Values are stylized educated guesses, not ethnographic detail.

import type { RegionId } from '../../world/geo'

export type HutRoof = 'cone' | 'tallCone' | 'dome' | 'flat'
export type WallShape = 'round' | 'box'
export type FenceKind = 'none' | 'thorn' | 'woven' | 'stone'

/**
 * Period-accurate organising principle of a village, keyed by people
 * (design.md §4.5, researched against the ~1890 record):
 * - `ring`     — Central Cattle Pattern / enkang: huts on a ring around the
 *                central cattle enclosure inside a perimeter fence.
 * - `street`   — Congo-basin street village: one cleared, swept axis with
 *                two facing house rows and a palaver shelter.
 * - `compound` — Sahel compound cluster: walled family enclosures around a
 *                central meeting ground, granaries inside.
 * - `scatter`  — dispersed camp: loose family groups of tents/small huts,
 *                no lanes, no shared fence.
 * - `ksar`     — fortified North-African block: dense flat-roofed houses on
 *                narrow lanes inside a perimeter wall with one gate.
 * - `riverstrip` — Nile fellah strip: house rows along one river-parallel
 *                lane just above the flood line.
 * - `coastrow` — Swahili mji: rectangular houses in a double row along one
 *                sandy shore path under palms.
 */
export type VillagePlanKind =
  | 'ring'
  | 'street'
  | 'compound'
  | 'scatter'
  | 'ksar'
  | 'riverstrip'
  | 'coastrow'

/** People → village plan (design.md §4.5; every game people is mapped). */
export const VILLAGE_PLANS: Record<string, VillagePlanKind> = {
  // North: Tuareg camp, Berber ksar, Nile strip, Sahel compounds.
  tuareg: 'scatter',
  berbers: 'ksar',
  nubians: 'riverstrip',
  bambara: 'compound',
  // West: compound architecture (Hausa gida, Mande lu); Fang street village.
  hausa: 'compound',
  mandinka: 'compound',
  fang: 'street',
  // Central: the cleared street village of the Congo basin; Twa forest camps.
  mongo: 'street',
  mbuti: 'scatter',
  banda: 'street',
  bambundu: 'street',
  lunda: 'street',
  // East: enkang thorn rings, Swahili coast row, highland/lakes compounds.
  maasai: 'ring',
  somali: 'ring',
  swahili: 'coastrow',
  sidama: 'compound',
  baganda: 'compound',
  // South: the Central Cattle Pattern; San camps. The Bemba are the exception
  // — they lived in the tsetse belt on citemene millet and kept NO cattle
  // (docs/peoples-1890.md §5.1), so a central cattle kraal is the wrong plan
  // for them; their 30-50 wattle-and-daub huts stood as family clusters
  // around an open central meeting ground (the insaka), which is `compound`.
  zulu: 'ring',
  pedi: 'ring',
  bemba: 'compound',
  wayeyi: 'scatter',
  san: 'scatter',
}

export interface RegionPlaceStyle {
  /** Ground material palette: base, alt, patch. */
  ground: [string, string, string]
  hutWall: { base: string; alt: string }
  hutThatch: { base: string; alt: string }
  roof: HutRoof
  /** Rectangular adobe vs. round hut dwellings. */
  wallShape: WallShape
  /** Raised floor on wooden stilts (humid Congo basin). */
  stilts: boolean
  /** Painted decorative band around the wall. */
  bandColor: string
  /** Clothing tones for villagers/NPCs. */
  cloth: string[]
  /** Vegetation mix for the place's flora slots (weights, sum ≈ 1). */
  flora: { palm: number; acacia: number; jungle: number; bush: number }
  /** Grass tuft density factor relative to the default. */
  grass: number
  /** Compound/kraal fencing style. */
  fence: FenceKind
  /** Trodden path color drawn into the ground. */
  pathColor: string
  /** Raised granaries next to the dwellings. */
  granaries: boolean
  /** Number of non-enterable dwellings in a village. */
  dwellingCount: number
}

export const REGION_PLACE_STYLES: Record<RegionId, RegionPlaceStyle> = {
  // Sahara/Nubia: tight adobe quarters with flat roofs along narrow lanes,
  // date palms, pale trodden sand paths.
  north: {
    ground: ['#dcc99c', '#c9b384', '#b59a6b'],
    hutWall: { base: '#d3bc8d', alt: '#b09a6c' },
    hutThatch: { base: '#c2a86f', alt: '#96814c' },
    roof: 'flat',
    wallShape: 'box',
    stilts: false,
    bandColor: '#8a6a3c',
    cloth: ['#3a4a7c', '#e8e2d0', '#7c3a2a'],
    flora: { palm: 0.8, acacia: 0, jungle: 0, bush: 0.2 },
    grass: 0.3,
    fence: 'none',
    pathColor: '#f0e2b8',
    granaries: false,
    dwellingCount: 13,
  },
  // West-African savanna: round mud huts in family compounds with woven
  // fences and stilt granaries.
  west: {
    ground: ['#c9a878', '#a9885c', '#8f7a4e'],
    hutWall: { base: '#b58343', alt: '#8a6231' },
    hutThatch: { base: '#a5894b', alt: '#6f5a2c' },
    roof: 'cone',
    wallShape: 'round',
    stilts: false,
    bandColor: '#8a6a3c',
    cloth: ['#a3502f', '#c98a2e', '#7a3b5a'],
    flora: { palm: 0.15, acacia: 0.45, jungle: 0, bush: 0.4 },
    grass: 1,
    fence: 'woven',
    pathColor: '#a07a48',
    granaries: true,
    dwellingCount: 12,
  },
  // Congo basin: stilt houses with tall roofs under big trees, dark humus
  // ground, raised granaries.
  central: {
    ground: ['#8a744a', '#6b5a3c', '#59492f'],
    hutWall: { base: '#8a6a42', alt: '#635033' },
    hutThatch: { base: '#7c6c3c', alt: '#55471f' },
    roof: 'tallCone',
    wallShape: 'round',
    stilts: true,
    bandColor: '#4a5a2c',
    cloth: ['#3f6b3a', '#8a6a2c', '#5a3b2a'],
    flora: { palm: 0.2, acacia: 0, jungle: 0.6, bush: 0.2 },
    grass: 0.8,
    fence: 'none',
    pathColor: '#55432a',
    granaries: true,
    dwellingCount: 10,
  },
  // Rift/lakes: manyatta — low dome huts on a ring inside a thorn-bush
  // kraal with a central cattle pen; red earth and red cloth.
  east: {
    ground: ['#c08c5e', '#9c6f44', '#83603e'],
    hutWall: { base: '#a3764a', alt: '#7c5a36' },
    hutThatch: { base: '#96824a', alt: '#6b5a2f' },
    roof: 'dome',
    wallShape: 'round',
    stilts: false,
    bandColor: '#a32b20',
    cloth: ['#a32b20', '#c04a2e', '#7c2a4a'],
    flora: { palm: 0, acacia: 0.4, jungle: 0, bush: 0.6 },
    grass: 0.7,
    fence: 'thorn',
    pathColor: '#96602f',
    granaries: false,
    dwellingCount: 12,
  },
  // Southern plateau: rondavels with painted bands in loose compounds with
  // low dry-stone walls.
  south: {
    ground: ['#c2a271', '#a08454', '#87724a'],
    hutWall: { base: '#bc9052', alt: '#8f6c3c' },
    hutThatch: { base: '#a08a50', alt: '#75602f' },
    roof: 'cone',
    wallShape: 'round',
    stilts: false,
    bandColor: '#5a3a7c',
    cloth: ['#3a5a8a', '#8a4a2a', '#c2b090'],
    flora: { palm: 0, acacia: 0.3, jungle: 0, bush: 0.7 },
    grass: 0.9,
    fence: 'stone',
    pathColor: '#8f7345',
    granaries: true,
    dwellingCount: 11,
  },
}
