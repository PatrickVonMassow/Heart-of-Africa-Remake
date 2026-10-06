import { describe, expect, it } from 'vitest'
import { VILLAGER_GLTF } from '../../config/balance'
import { digBout } from './adultWork'

describe('the dig bout holds through a shove (the dig flicker)', () => {
  it('a body jostled off the rim for a few frames keeps digging; one that leaves the bout stops at once', () => {
    const hold = { digHold: 0 }
    const dt = 1 / 60
    expect(digBout(hold, true, true, dt)).toBe(true)
    // pushed across the rim's edge for five frames: no frame drops the stroke
    for (let k = 0; k < 5; k++) expect(digBout(hold, false, true, dt)).toBe(true)
    expect(digBout(hold, true, true, dt)).toBe(true)
    // off the rim for longer than the hold: the stroke ends
    let still = 0
    for (let t = 0; t < VILLAGER_GLTF.transitionSeconds + 0.1; t += dt) if (digBout(hold, false, true, dt)) still++
    expect(still).toBeLessThan(Math.ceil(VILLAGER_GLTF.transitionSeconds / dt) + 1)
    expect(digBout(hold, false, true, dt)).toBe(false)
    // out of the bout: nothing is held
    digBout(hold, true, true, dt)
    expect(digBout(hold, true, false, dt)).toBe(false)
    expect(digBout(hold, false, true, dt)).toBe(false)
  })
})
