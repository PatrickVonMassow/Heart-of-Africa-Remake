import { describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../../config/balance'
import { FIGURE_LIMBS } from '../../render/figures'
import { PRIMITIVE_CARRY_TILT, tipDrop } from './shovelHold'

describe('the shovel in the primitive figure’s hand', () => {
  it('is carried with the blade clear of the ground even from the lowest hanging hand', () => {
    const lowestHand = FIGURE_LIMBS.shoulderY - FIGURE_LIMBS.armLength
    expect(lowestHand - tipDrop(PRIMITIVE_CARRY_TILT)).toBeGreaterThan(0.08)
    // hanging straight down it would stand in the earth: why it is carried tilted
    expect(lowestHand - tipDrop(0)).toBeLessThan(0)
  })

  it('is a shovel, not a hoe: the blade continues the shaft below the grip', () => {
    const s = VILLAGER_ASSET.shovel
    expect(s.tip).toBeLessThan(s.shaftBottom)
    expect(s.shaftBottom).toBeLessThan(0)
    expect(s.top).toBeGreaterThan(0)
  })
})
