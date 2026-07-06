// Region-typical place styling (design.md §2 "Graphics and atmosphere" and
// "Lively, densely built settlements"): building form, settlement layout, fences,
// ground/path palette, clothing colors and vegetation mix per region — so a
// desert village reads clearly differently from a jungle or rift one.
// Values are stylized educated guesses, not ethnographic detail.

import type { RegionId } from '../../world/geo'

export type HutRoof = 'cone' | 'tallCone' | 'dome' | 'flat'
export type WallShape = 'round' | 'box'
export type VillageLayout = 'lanes' | 'cluster' | 'kraal'
export type FenceKind = 'none' | 'thorn' | 'woven' | 'stone'

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
  /** Settlement pattern of the dwellings (design.md §2 lively settlements). */
  villageLayout: VillageLayout
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
    villageLayout: 'lanes',
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
    villageLayout: 'cluster',
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
    villageLayout: 'cluster',
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
    villageLayout: 'kraal',
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
    villageLayout: 'cluster',
    fence: 'stone',
    pathColor: '#8f7345',
    granaries: true,
    dwellingCount: 11,
  },
}
