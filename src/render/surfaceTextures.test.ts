// Baked surface textures (CLAUDE.md §7.1 pt. 15, design.md §2.6): the
// settlement materials sample reproducibly generated tileable maps. Pinned
// here: every height field tiles exactly (opposite edges continue each
// other), the baked normal maps are normalised unit vectors with positive z,
// and the albedo stays mid-brightness (the runtime doubles the texel onto
// the region tint, so the mean must sit near 128).
import { describe, it, expect } from 'vitest'
import { SURFACE_MATERIALS, TERRAIN_MATERIALS, bakeMaterial } from '../../scripts/textureFields.mjs'

const SAMPLES = 23
const BAKE_SIZE = 64

describe('surface material height fields', () => {
  for (const [name, mat] of Object.entries(SURFACE_MATERIALS)) {
    it(`${name}: tiles exactly in u and v`, () => {
      for (let i = 0; i < SAMPLES; i++) {
        const t = (i + 0.31) / SAMPLES
        expect(mat.height(0, t)).toBeCloseTo(mat.height(1, t), 9)
        expect(mat.height(t, 0)).toBeCloseTo(mat.height(t, 1), 9)
      }
    })

    it(`${name}: height stays in [0, 1]`, () => {
      for (let i = 0; i < SAMPLES; i++) {
        for (let j = 0; j < SAMPLES; j++) {
          const h = mat.height((i + 0.5) / SAMPLES, (j + 0.5) / SAMPLES)
          expect(h).toBeGreaterThanOrEqual(0)
          expect(h).toBeLessThanOrEqual(1)
        }
      }
    })
  }

  it('terrain fields keep the same tiling contract (shared bake core)', () => {
    for (const mat of Object.values(TERRAIN_MATERIALS)) {
      for (let i = 0; i < 7; i++) {
        const t = (i + 0.4) / 7
        expect(mat.height(0, t)).toBeCloseTo(mat.height(1, t), 9)
        expect(mat.height(t, 0)).toBeCloseTo(mat.height(t, 1), 9)
      }
    }
  })
})

describe('bakeMaterial', () => {
  for (const [name, mat] of Object.entries(SURFACE_MATERIALS)) {
    it(`${name}: normal map holds normalised vectors with positive z`, () => {
      const { normal } = bakeMaterial(mat, BAKE_SIZE)
      for (let i = 0; i < BAKE_SIZE * BAKE_SIZE; i++) {
        const nx = (normal[i * 3] / 255) * 2 - 1
        const ny = (normal[i * 3 + 1] / 255) * 2 - 1
        const nz = (normal[i * 3 + 2] / 255) * 2 - 1
        expect(nz).toBeGreaterThan(0)
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 1)
      }
    })

    it(`${name}: albedo stays mid-brightness for the runtime tint multiply`, () => {
      const { albedo } = bakeMaterial(mat, BAKE_SIZE)
      let sum = 0
      for (let i = 0; i < albedo.length; i += 3) {
        sum += (albedo[i] + albedo[i + 1] + albedo[i + 2]) / 3
      }
      const mean = sum / (BAKE_SIZE * BAKE_SIZE)
      expect(mean).toBeGreaterThan(100)
      expect(mean).toBeLessThan(160)
    })
  }

  // The ground terrain fields (sand/grass/rock/forest) share bakeMaterial's
  // core with SURFACE_MATERIALS but were never run through it (point 173).
  // Unlike SURFACE_MATERIALS, these are NOT doubled onto a region tint at
  // runtime — generate-terrain-textures.mjs writes them straight out as the
  // final ground look (sand pale, forest canopy dark) — so the mid-128
  // contract does not apply here; instead pin the general byte-range and
  // genuine per-pixel variation (catches a degenerate/flat/NaN bake).
  for (const [name, mat] of Object.entries(TERRAIN_MATERIALS)) {
    it(`${name} (terrain): normal map holds normalised vectors with positive z`, () => {
      const { normal } = bakeMaterial(mat, BAKE_SIZE)
      for (let i = 0; i < BAKE_SIZE * BAKE_SIZE; i++) {
        const nx = (normal[i * 3] / 255) * 2 - 1
        const ny = (normal[i * 3 + 1] / 255) * 2 - 1
        const nz = (normal[i * 3 + 2] / 255) * 2 - 1
        expect(nz).toBeGreaterThan(0)
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 1)
      }
    })

    it(`${name} (terrain): albedo stays a valid byte range with real per-pixel variation`, () => {
      const { albedo } = bakeMaterial(mat, BAKE_SIZE)
      let min = 255
      let max = 0
      for (let i = 0; i < albedo.length; i++) {
        expect(albedo[i]).toBeGreaterThanOrEqual(0)
        expect(albedo[i]).toBeLessThanOrEqual(255)
        if (albedo[i] < min) min = albedo[i]
        if (albedo[i] > max) max = albedo[i]
      }
      expect(max - min).toBeGreaterThan(10) // not a flat/degenerate fill
    })
  }
})
