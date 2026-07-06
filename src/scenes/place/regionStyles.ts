// Region-typical place styling (design.md §2 "Grafik und Atmosphäre"):
// building style, ground palette, clothing colors and vegetation mix per
// region, so a desert village reads differently from a jungle or rift one.
// Values are stylized educated guesses, not ethnographic detail.

import type { RegionId } from '../../world/geo'

export type HutRoof = 'cone' | 'tallCone' | 'dome' | 'flat'

export interface RegionPlaceStyle {
  /** Ground material palette: base, alt, patch. */
  ground: [string, string, string]
  hutWall: { base: string; alt: string }
  hutThatch: { base: string; alt: string }
  roof: HutRoof
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
}

export const REGION_PLACE_STYLES: Record<RegionId, RegionPlaceStyle> = {
  // Sahara/Nubia: pale adobe, flat roofs, date palms, sparse ground cover.
  north: {
    ground: ['#dcc99c', '#c9b384', '#b59a6b'],
    hutWall: { base: '#d3bc8d', alt: '#b09a6c' },
    hutThatch: { base: '#c2a86f', alt: '#96814c' },
    roof: 'flat',
    stilts: false,
    bandColor: '#8a6a3c',
    cloth: ['#3a4a7c', '#e8e2d0', '#7c3a2a'],
    flora: { palm: 0.8, acacia: 0, jungle: 0, bush: 0.2 },
    grass: 0.3,
  },
  // West-African savanna: round mud huts, thatch cones, acacias.
  west: {
    ground: ['#c9a878', '#a9885c', '#8f7a4e'],
    hutWall: { base: '#b58343', alt: '#8a6231' },
    hutThatch: { base: '#a5894b', alt: '#6f5a2c' },
    roof: 'cone',
    stilts: false,
    bandColor: '#8a6a3c',
    cloth: ['#a3502f', '#c98a2e', '#7a3b5a'],
    flora: { palm: 0.15, acacia: 0.45, jungle: 0, bush: 0.4 },
    grass: 1,
  },
  // Congo basin: darker wood/leaf tones, tall roofs on stilts, big trees.
  central: {
    ground: ['#9a8556', '#7c6a44', '#6b5c3e'],
    hutWall: { base: '#8a6a42', alt: '#635033' },
    hutThatch: { base: '#7c6c3c', alt: '#55471f' },
    roof: 'tallCone',
    stilts: true,
    bandColor: '#4a5a2c',
    cloth: ['#3f6b3a', '#8a6a2c', '#5a3b2a'],
    flora: { palm: 0.2, acacia: 0, jungle: 0.6, bush: 0.2 },
    grass: 0.8,
  },
  // Rift/lakes: reddish earth, low dome huts (manyatta), red cloth.
  east: {
    ground: ['#c39a6e', '#a37c50', '#8a6a48'],
    hutWall: { base: '#a3764a', alt: '#7c5a36' },
    hutThatch: { base: '#96824a', alt: '#6b5a2f' },
    roof: 'dome',
    stilts: false,
    bandColor: '#a32b20',
    cloth: ['#a32b20', '#c04a2e', '#7c2a4a'],
    flora: { palm: 0, acacia: 0.4, jungle: 0, bush: 0.6 },
    grass: 0.7,
  },
  // Southern plateau: rondavels with painted band, dry bush.
  south: {
    ground: ['#c2a271', '#a08454', '#87724a'],
    hutWall: { base: '#bc9052', alt: '#8f6c3c' },
    hutThatch: { base: '#a08a50', alt: '#75602f' },
    roof: 'cone',
    stilts: false,
    bandColor: '#5a3a7c',
    cloth: ['#3a5a8a', '#8a4a2a', '#c2b090'],
    flora: { palm: 0, acacia: 0.3, jungle: 0, bush: 0.7 },
    grass: 0.9,
  },
}
