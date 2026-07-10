// Far-terrain color match (design.md §21.4): the whole-continent sheet bakes
// the chunks' mean ground-texture response into its vertex colors, so it does
// not read as a pale unrendered frame around the detailed chunk rectangle.
import { describe, it, expect } from 'vitest'
import { farTerrainColor, MEAN_ALBEDO, ALBEDO_BOOST } from './farColor'

describe('farTerrainColor', () => {
  it('multiplies the tint by the splat-weighted mean albedo and the chunk boost', () => {
    const sand = farTerrainColor([1, 1, 1], [1, 0, 0, 0])
    for (let c = 0; c < 3; c++) expect(sand[c]).toBeCloseTo(MEAN_ALBEDO[0][c] * ALBEDO_BOOST, 6)
  })

  it('blends the albedos by the splat weights', () => {
    const mixed = farTerrainColor([1, 1, 1], [0.5, 0.5, 0, 0])
    for (let c = 0; c < 3; c++) {
      expect(mixed[c]).toBeCloseTo(((MEAN_ALBEDO[0][c] + MEAN_ALBEDO[1][c]) / 2) * ALBEDO_BOOST, 6)
    }
  })

  it('scales linearly with the biome tint', () => {
    const full = farTerrainColor([0.64, 0.6, 0.3], [0, 1, 0, 0])
    const half = farTerrainColor([0.32, 0.3, 0.15], [0, 1, 0, 0])
    for (let c = 0; c < 3; c++) expect(half[c]).toBeCloseTo(full[c] / 2, 6)
  })

  it('keeps forest ground darker than sand ground (matches the textures)', () => {
    const sand = farTerrainColor([1, 1, 1], [1, 0, 0, 0])
    const forest = farTerrainColor([1, 1, 1], [0, 0, 0, 1])
    expect(forest[0]).toBeLessThan(sand[0])
    expect(forest[2]).toBeLessThan(sand[2])
  })
})
