// The season's straw/green recolour tint uniform (design.md §19.13, point
// 173). Pins the pure numeric clamp of setSeasonTint — the shader-side
// recolour curves (seasonTintNode/seasonFoliagePosition) are TSL node graphs
// exercised live in the running scene, not unit-testable without a renderer.
import { describe, expect, it } from 'vitest'
import { setSeasonTint, SEASON_TINT_U } from './seasonTint'

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
