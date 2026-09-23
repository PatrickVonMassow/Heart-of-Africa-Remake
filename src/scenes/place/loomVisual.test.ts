import { describe, expect, it } from 'vitest'
import { Color } from 'three/webgpu'
import { balance } from '../../config/balance'
import { createLoomWork, loomPicture } from './loomWork'
import { FOLDED_STRIP, LOOM_BUILD, loomClothTransform, loomStackPosition, loomWeaveColor } from './loomVisual'
import { WARP_BODY_RADIUS } from './loom'

describe('the loom picture preserves its low reconstruction', () => {
  it('keeps the warp, stakes and strip at their reconstructed dimensions', () => {
    expect(LOOM_BUILD.warpY).toBe(0.22)
    expect(LOOM_BUILD.stakeHeight).toBe(0.34)
    expect(LOOM_BUILD.stripWidth).toBe(0.12)
    expect(LOOM_BUILD.shuttle[0]).toBeGreaterThan(LOOM_BUILD.stripWidth)
  })

  it('saturates the village dye without changing its hue or lightness', () => {
    for (const hex of ['#8a6a3c', '#4a5a2c', '#a32b20', '#5a3a7c']) {
      const before = new Color(hex).getHSL({ h: 0, s: 0, l: 0 })
      const after = loomWeaveColor(hex).getHSL({ h: 0, s: 0, l: 0 })
      expect(after.h).toBeCloseTo(before.h)
      expect(after.l).toBeCloseTo(before.l)
      expect(after.s).toBeGreaterThan(before.s)
    }
  })

  it.each([-1, 1])('lays a full strip onto the next stack layer on bank side %s', (side) => {
    const state = createLoomWork(balance.villageLife.loom, () => 0)
    state.cloth = balance.villageLife.loom.warpHalf
    state.fold = 0
    const full = loomClothTransform(loomPicture(state), 3, side)
    expect(full.scale[2]).toBe(state.cloth)
    state.fold = 0.3
    const gathering = loomClothTransform(loomPicture(state), 3, side)
    expect(gathering.visible).toBe(true)
    expect(gathering.scale[2]).toBeLessThan(full.scale[2])
    expect(gathering.scale[2]).toBeGreaterThan(FOLDED_STRIP.length)
    state.fold = 1
    const laid = loomClothTransform(loomPicture(state), 3, side)
    expect(laid.position).toEqual(loomStackPosition(3, side))
    expect(laid.scale[2]).toBeCloseTo(FOLDED_STRIP.length)
    expect(laid.scale[1] * LOOM_BUILD.clothThickness).toBeCloseTo(FOLDED_STRIP.thickness)
  })

  it('keeps the pile beside the warp and inside its existing collision footprint', () => {
    for (let i = 0; i < balance.villageLife.loom.stackCap; i++) {
      const [x, y, z] = loomStackPosition(i, 1)
      expect(Math.abs(x) - LOOM_BUILD.stripWidth / 2).toBeGreaterThan(LOOM_BUILD.stripWidth / 2)
      expect(Math.abs(x) + LOOM_BUILD.stripWidth / 2).toBeLessThanOrEqual(WARP_BODY_RADIUS)
      expect(Math.abs(z) + FOLDED_STRIP.length / 2).toBeLessThan(balance.villageLife.loom.warpHalf)
      expect(y).toBeLessThan(0.5)
    }
  })
})
