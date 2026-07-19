// The season's straw/green recolour tint uniform (design.md §19.13, point
// 173). Pins the pure numeric clamp of setSeasonTint — the shader-side
// recolour curves (seasonTintNode/seasonFoliagePosition) are TSL node graphs
// exercised live in the running scene, not unit-testable without a renderer.
import { describe, expect, it } from 'vitest'
import { crownCollapse, drynessFromTint, groundSprout, setSeasonCollapse, setSeasonTint, SEASON_COLLAPSE_U, SEASON_TINT_U } from './seasonTint'

describe('setSeasonTint (design.md §19.13)', () => {
  it('clamps an out-of-range greenness to 0 before mixing at full strength', () => {
    // greenness clamps to [0,1] first: -5 -> 0; at strength 1 the tint value
    // equals full straw (0), not a negative overshoot.
    setSeasonTint(-5, 1)
    expect(SEASON_TINT_U.value).toBe(0)
  })

  it('strength 0 pins the tint to the neutral mid-year value regardless of greenness', () => {
    // greenness clamps to [0,1] first: 2 -> 1; strength 0 means the debug
    // override never moves the tint off its neutral 0.5.
    setSeasonTint(2, 0)
    expect(SEASON_TINT_U.value).toBe(0.5)
  })
})

describe('setSeasonCollapse — dry-season flora deformation gate (point 175)', () => {
  it('defaults the uniform to 1 (deformation on)', () => {
    expect(SEASON_COLLAPSE_U.value).toBe(1)
  })

  it('drops the uniform to 0 when off, so dryness*U zeroes the collapse and sprout', () => {
    // seasonFoliagePosition multiplies dryness by this uniform: at 0 the crown
    // shrink/y-drop and the ground sprout all vanish, leaving positionLocal.
    setSeasonCollapse(false)
    expect(SEASON_COLLAPSE_U.value).toBe(0)
    setSeasonCollapse(true)
    expect(SEASON_COLLAPSE_U.value).toBe(1)
  })
})

// The travel scene bakes the deformation into its instance matrices on the CPU
// (point 175); these mirror seasonFoliagePosition's maths and must stay in
// lock-step with the shader branch above.
describe('CPU collapse mirrors of seasonFoliagePosition (point 175)', () => {
  it('drynessFromTint = clamp(1 - tint*2): 0.5 neutral -> 0, 0 -> 1, clamps both ends', () => {
    expect(drynessFromTint(0.5)).toBe(0) // neutral mid-year, no collapse
    expect(drynessFromTint(0)).toBe(1) // full straw, full collapse
    expect(drynessFromTint(1)).toBe(0) // full green, clamped at 0
    expect(drynessFromTint(0.25)).toBeCloseTo(0.5)
  })

  it('crownCollapse: shrink = 1 - dryness*0.6, drop = dryness*0.22, clamped', () => {
    expect(crownCollapse(0).shrink).toBeCloseTo(1) // wet: identity crown
    expect(crownCollapse(0).drop).toBeCloseTo(0)
    expect(crownCollapse(1).shrink).toBeCloseTo(0.4) // dry: full collapse
    expect(crownCollapse(1).drop).toBeCloseTo(0.22)
    expect(crownCollapse(0.5).shrink).toBeCloseTo(0.7)
    expect(crownCollapse(0.5).drop).toBeCloseTo(0.11)
    expect(crownCollapse(2).drop).toBeCloseTo(0.22) // dryness clamps to 1
  })

  it('groundSprout: 1 - dryness*0.85, clamped', () => {
    expect(groundSprout(0)).toBeCloseTo(1) // wet: full height
    expect(groundSprout(1)).toBeCloseTo(0.15) // dry: withdrawn toward the soil
    expect(groundSprout(-1)).toBeCloseTo(1) // clamped
  })
})
