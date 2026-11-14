import { describe, expect, it } from 'vitest'
import { rainAmount, skyOvercastParams } from '../systems/season'
import { overcastLook, setSkyOvercast, skyOvercast } from './skyOvercast'

// Point 354: rain fell from a blue settlement sky because the dome showed the
// linear grayMix (0.48 at the Zulu village on 03.01.1890) as a half-blue tint.
describe('overcastLook', () => {
  it('leaves the dry sky exactly clear', () => {
    expect(overcastLook(0)).toBe(0)
  })

  it('reads (nearly) fully heavy wherever the rain streaks are falling', () => {
    // Rain starts above wetness 0.45; take a light rain at 0.5.
    const wet = 0.5
    expect(rainAmount(wet, 1)).toBeGreaterThan(0)
    expect(overcastLook(skyOvercastParams(wet, 1).grayMix)).toBeGreaterThan(0.9)
  })

  it('rises monotonically and saturates at 1', () => {
    let last = 0
    for (let g = 0; g <= 0.75; g += 0.05) {
      const l = overcastLook(g)
      expect(l).toBeGreaterThanOrEqual(last)
      last = l
    }
    expect(overcastLook(0.75)).toBe(1)
  })
})

describe('setSkyOvercast wiring', () => {
  it('drives the dome look uniform from grayMix, not just the raw values', () => {
    const p = skyOvercastParams(0.634, 1) // the Zulu village in early January
    setSkyOvercast(p.grayMix, p.cloudBoost)
    const s = skyOvercast()
    expect(s.grayMix).toBeCloseTo(p.grayMix)
    expect(s.look).toBe(overcastLook(p.grayMix))
    expect(s.look).toBeGreaterThan(0.95)
    setSkyOvercast(0, 0)
    expect(skyOvercast().look).toBe(0)
  })
})
