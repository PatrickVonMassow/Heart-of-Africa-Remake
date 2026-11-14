import { afterEach, describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import { placeById } from '../world/geo'
import { deriveSceneSun, sceneSunLatitude } from './sceneSun'

describe('the one scene sun (design.md §2.7)', () => {
  const hour = balance.sun.hour
  afterEach(() => {
    balance.sun.hour = hour
    balance.sun.shadowMinElevationDeg = 0
  })

  it('a settlement uses its own latitude, travel the quantized traveller latitude', () => {
    const cairo = placeById('cairo')
    expect(sceneSunLatitude({ mode: 'place', placeId: 'cairo', pos: { z: 999 } })).toBe(cairo.lat)
    expect(sceneSunLatitude({ mode: 'travel', placeId: null, pos: { z: -302 } })).toBe(30.25)
  })

  it('June and December at one place give different suns; the disc is westerly', () => {
    const june = deriveSceneSun(30, 171)
    const dec = deriveSceneSun(30, 354)
    expect(june.angles.elevation - dec.angles.elevation).toBeGreaterThan(20)
    expect(june.disc[0]).toBeLessThan(0)
  })

  it('the shadow floor lifts only the light, and a debug hour past sunset never lights from below', () => {
    balance.sun.shadowMinElevationDeg = 20
    const s = deriveSceneSun(-34, 171)
    expect(s.disc[1]).toBeLessThan(Math.sin((20 * Math.PI) / 180))
    expect(s.light[1]).toBeCloseTo(Math.sin((20 * Math.PI) / 180), 6)
    balance.sun.shadowMinElevationDeg = 0
    balance.sun.hour = 17.5
    expect(deriveSceneSun(-34, 171).light[1]).toBeGreaterThan(0)
  })
})
