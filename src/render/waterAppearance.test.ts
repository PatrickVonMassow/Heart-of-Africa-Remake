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

const { RIVER_WATER_TONES, WATER_FOAM_ROUGHNESS, WATER_METALNESS, WATER_ROUGHNESS, riverWaterSurface } =
  await import('./waterAppearance')
const { FOAM_PATCH_OPACITY, FOAM_PATCH_SEGMENTS, foamPatchOpacity, buildFoamPatchGeometry, createPlaceRiverMaterial, createRiverFoamMaterial } =
  await import('./placeRiver')
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

// The pale flat discs judged at the Bambara bank (frames 482 / 1085 / 1106)
// were the drifting foam patches: a 10-sided disc in a matt material of its
// own, one flat opacity and a hard rim, so they read as paper cut-outs on
// water that carried full specular. They are the water's own foam now.
describe('the drifting foam patches are shaded as the water they ride', () => {

  it('takes the shared foam tone and the water foam roughness and metalness', () => {
    const m = createRiverFoamMaterial()
    expect(`#${m.color.getHexString()}`).toBe(RIVER_WATER_TONES.foam.toLowerCase())
    expect(m.roughness).toBeCloseTo(WATER_ROUGHNESS + WATER_FOAM_ROUGHNESS, 6)
    expect(m.metalness).toBe(WATER_METALNESS)
    expect(createRiverFoamMaterial()).toBe(m)
  })

  it('frays out at its rim instead of ending on a hard outline', () => {
    const m = createRiverFoamMaterial()
    expect(m.transparent).toBe(true)
    expect(m.depthWrite).toBe(false)
    expect(m.opacityNode, 'a per-fragment rim fade, not one flat opacity').toBeTruthy()
  })

  it('is opaque at the heart, frays with the noise, and is gone at the geometry rim', () => {
    expect(foamPatchOpacity(0, 0)).toBeCloseTo(FOAM_PATCH_OPACITY, 6)
    // The noise moves the outline: the same radius differs between samples.
    expect(foamPatchOpacity(0.6, -0.5)).toBeGreaterThan(foamPatchOpacity(0.6, 0.5) + 0.2)
    // However far the noise pulls the rim out, the mesh edge itself is clear.
    for (const churn of [-1, -0.5, 0, 0.5, 1]) expect(foamPatchOpacity(1, churn)).toBe(0)
    for (let r = 0; r <= 1; r += 0.05) {
      const a = foamPatchOpacity(r, -1)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(FOAM_PATCH_OPACITY)
    }
  })

  it('builds the opacity node with ordered smoothstep edges (undefined in GLSL ES otherwise)', () => {
    const src = source('src/render/placeRiver.ts')
    expect(src).not.toMatch(/smoothstep\(float\(1\),/)
    expect(src).toContain('smoothstep(float(FOAM_PATCH_CORE), float(1), edge).oneMinus()')
    expect(src).toContain('smoothstep(float(1 - FOAM_PATCH_RIM), float(1), r).oneMinus()')
    // Both factors must reach the node the material draws with.
    expect(src).toContain('m.opacityNode = fray.mul(guard).mul(FOAM_PATCH_OPACITY)')
  })

  it('builds the river surface fades with ordered smoothstep edges', () => {
    const src = source('src/render/waterAppearance.ts')
    expect(src).not.toContain('smoothstep(float(FINE_FOOTPRINT_GONE)')
    expect(src).not.toContain('smoothstep(float(SHORE_FOAM_REACH)')
    expect(src).toContain('smoothstep(float(FINE_FOOTPRINT_FULL), float(FINE_FOOTPRINT_GONE), footprint)')
    expect(src).toContain('smoothstep(float(0.3), float(SHORE_FOAM_REACH), v)')
  })

  it('is round enough that no facet corner shows, and faces up like the water', () => {
    expect(FOAM_PATCH_SEGMENTS).toBeGreaterThanOrEqual(24)
    const g = buildFoamPatchGeometry()
    const n = g.getAttribute('normal')
    for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeCloseTo(1, 6)
    const uvs = g.getAttribute('uv')
    expect(uvs.getX(0)).toBeCloseTo(0.5, 6)
    expect(uvs.getY(0)).toBeCloseTo(0.5, 6)
  })

  it('the scene draws the patches with that material and keeps no foam material of its own', () => {
    const scene = source('src/scenes/place/PlaceScene.tsx')
    expect(scene).toContain('createRiverFoamMaterial()')
    expect(scene).toContain('buildFoamPatchGeometry()')
    expect(scene.toLowerCase()).not.toContain('#e8f1f3')
  })
})
