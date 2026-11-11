// The travel ground's biome palette (linear RGB), split out of terrain.ts so a
// pure consumer (the bird's-eye Sphinx drift, src/render/sphinx.ts) can match
// the ground tone without loading the terrain sampler and its geodata.

import type { TerrainType } from './terrain'

// Base palette per terrain type; noise varies brightness per run.
export const PALETTE: Record<TerrainType, [number, number, number]> = {
  ocean: [0.11, 0.29, 0.5],
  coast: [0.87, 0.8, 0.58],
  desert: [0.89, 0.74, 0.44],
  savanna: [0.64, 0.6, 0.3],
  jungle: [0.13, 0.38, 0.14],
  mountain: [0.48, 0.42, 0.35],
  water: [0.2, 0.42, 0.6],
}

// Secondary tones blended in by noise for richer, less flat ground colors.
export const PALETTE_ALT: Record<TerrainType, [number, number, number]> = {
  ocean: [0.08, 0.22, 0.42],
  coast: [0.8, 0.7, 0.48],
  desert: [0.78, 0.6, 0.34],
  savanna: [0.52, 0.47, 0.22],
  jungle: [0.09, 0.28, 0.11],
  mountain: [0.38, 0.34, 0.3],
  water: [0.2, 0.42, 0.6],
}
