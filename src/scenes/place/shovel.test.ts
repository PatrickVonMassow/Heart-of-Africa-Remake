import { describe, expect, it } from 'vitest'
import { VILLAGER_ASSET, VILLAGER_GLTF } from '../../config/balance'
import { FIGURE_LIMBS } from '../../render/figures'
import { digPose, gesturePose, restGesture } from '../../render/gesture'
import { PRIMITIVE_CARRY_TILT, easeDigWeight, mixDigPose, primitiveToolTilt, tipDrop } from './shovelHold'

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

describe('the primitive figure going into and out of the dig', () => {
  it('turns the shovel and the arms together by the eased dig weight, never in one frame', () => {
    const dt = 1 / 60
    let k = 0
    let dug = 0
    const rest = gesturePose(restGesture())
    let lastTilt = primitiveToolTilt(k)
    let lastPitch = rest.right.pitch
    let worstTilt = 0
    let worstPitch = 0
    for (let f = 0; f < 120; f++) {
      const digging = f >= 10 && f < 70
      k = easeDigWeight(k, digging, dt)
      dug = digging || k > 0 ? dug + dt : 0
      const tilt = primitiveToolTilt(k)
      const pitch = mixDigPose(rest, digPose(dug), k).right.pitch
      worstTilt = Math.max(worstTilt, Math.abs(tilt - lastTilt))
      worstPitch = Math.max(worstPitch, Math.abs(pitch - lastPitch))
      lastTilt = tilt
      lastPitch = pitch
      if (f === 69) expect(Math.abs(tilt)).toBe(0)
    }
    expect(k).toBe(0)
    expect(lastTilt).toBe(PRIMITIVE_CARRY_TILT)
    // the whole turn spread over the transition, not taken in one frame
    expect(worstTilt).toBeLessThan((Math.abs(PRIMITIVE_CARRY_TILT) * dt) / VILLAGER_GLTF.transitionSeconds + 1e-9)
    expect(worstPitch).toBeLessThan(0.2)
  })
})
