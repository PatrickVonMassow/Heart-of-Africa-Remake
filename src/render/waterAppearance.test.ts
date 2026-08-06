// The ONE water appearance (work-order 525). The seam the player saw at the
// Bambara village's bank was not a geometry fault — both halves of that river
// are measured from one course — but a SHADING one: the drawn surface mixed its
// own two literals while the panorama's continuation took the terrain's biome
// tone under the rock treatment, and the two met along a straight line across
// the picture.
//
// What can be judged without a browser is judged here: that there is exactly
// ONE description, that both materials are built from it, and that neither
// keeps a water colour of its own. The picture itself — that no step is left at
// the rim — is measured in scripts/verify/polish.mjs, at the bank, on both
// backends.

import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

vi.mock('./waterAppearance', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./waterAppearance')>()
  return { ...actual, riverWaterSurface: vi.fn(actual.riverWaterSurface) }
})

const { RIVER_WATER_TONES, riverWaterSurface } = await import('./waterAppearance')
const { createPlaceRiverMaterial } = await import('./placeRiver')
const { createBackdropMaterial } = await import('../scenes/place/backdropMaterial')

const source = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8')

describe('both halves of a settlement river read ONE water description', () => {
  it('the drawn surface at the bank builds its colour from the shared source', () => {
    vi.mocked(riverWaterSurface).mockClear()
    const m = createPlaceRiverMaterial(3)
    expect(riverWaterSurface).toHaveBeenCalledTimes(1)
    expect(m.colorNode).toBeTruthy()
    expect(m.opacityNode).toBeTruthy()
    expect(m.roughnessNode).toBeTruthy()
  })

  it('and so does the panorama that continues the same river past the rim', () => {
    vi.mocked(riverWaterSurface).mockClear()
    const { material } = createBackdropMaterial(3)
    expect(riverWaterSurface).toHaveBeenCalledTimes(1)
    expect(material.colorNode).toBeTruthy()
  })

  it('neither material states a water colour of its own — one source, no literals', () => {
    const tones = Object.values(RIVER_WATER_TONES)
    for (const path of ['src/render/placeRiver.ts', 'src/scenes/place/backdropMaterial.ts']) {
      const text = source(path)
      for (const tone of tones) {
        expect(text.toLowerCase(), `${path} restates the water tone ${tone}`).not.toContain(tone.toLowerCase())
      }
      expect(text, `${path} must read the shared description`).toContain('waterAppearance')
    }
  })

  it('the shared description is where the tones live, and nowhere else', () => {
    // A THIRD consumer inventing its own river tone is exactly how the two
    // halves drifted apart; the check is cheap and the failure is loud.
    const owners = ['src/render/waterAppearance.ts']
    for (const tone of Object.values(RIVER_WATER_TONES)) {
      const files = ['src/render/waterAppearance.ts', 'src/render/placeRiver.ts', 'src/scenes/place/backdropMaterial.ts']
      const carrying = files.filter((f) => source(f).toLowerCase().includes(tone.toLowerCase()))
      expect(carrying, `the tone ${tone} must be stated once`).toEqual(owners)
    }
  })
})

describe('the tones themselves (what the picture is judged against)', () => {
  const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)

  it('reads as water: every tone bluer than green, greener than red', () => {
    for (const tone of [RIVER_WATER_TONES.deep, RIVER_WATER_TONES.sheen]) {
      const [r, g, b] = rgb(tone)
      expect(b, `${tone} must be bluest`).toBeGreaterThan(g)
      expect(g, `${tone} must be greener than red`).toBeGreaterThan(r)
    }
  })

  it('the sheen is the LIGHTER of the two, and the foam lighter than both', () => {
    const luma = (hex: string) => rgb(hex).reduce((a, c) => a + c, 0) / 3
    expect(luma(RIVER_WATER_TONES.sheen)).toBeGreaterThan(luma(RIVER_WATER_TONES.deep))
    expect(luma(RIVER_WATER_TONES.foam)).toBeGreaterThan(luma(RIVER_WATER_TONES.sheen))
  })
})

describe('the detail field is one lever for both halves (the seam cannot come back)', () => {
  it('builds a surface at every octave count the presets carry', async () => {
    const { QUALITY_PRESETS, DETAIL_LEVELS } = await import('../config/quality')
    for (const level of DETAIL_LEVELS) {
      const octaves = QUALITY_PRESETS[level].waterDetailOctaves
      expect(octaves, `${level} must price the water field`).toBeGreaterThanOrEqual(1)
      const surface = riverWaterSurface({ along: 0, across: 0, octaves })
      expect(surface.color).toBeTruthy()
      expect(surface.ripple).toBeTruthy()
    }
  })

  it('caches ONE drawn-surface material per level, so the F9 cycle re-links nothing', () => {
    expect(createPlaceRiverMaterial(3)).toBe(createPlaceRiverMaterial(3))
    expect(createPlaceRiverMaterial(1)).not.toBe(createPlaceRiverMaterial(3))
  })
})
