import { describe, expect, it } from 'vitest'
import { digSiteAppearance } from './digSiteAppearance'

describe('the excavation records visible work', () => {
  it('deepens the walls, tightens the shadowed bottom, and grows one spoil heap', () => {
    const untouched = digSiteAppearance({ dug: 0, strikes: 0 })
    const watched = digSiteAppearance({ dug: 10, strikes: 6 })
    expect(watched.wallDepth).toBeGreaterThan(untouched.wallDepth)
    expect(watched.bottomRadius).toBeLessThan(untouched.bottomRadius)
    expect(watched.spoilScale).toBeGreaterThan(untouched.spoilScale)
    expect(watched.spoilHeight).toBeGreaterThan(untouched.spoilHeight)
  })

  it('clamps malformed and very old work records to finite scene geometry', () => {
    expect(digSiteAppearance({ dug: Number.NaN, strikes: 0 })).toEqual(digSiteAppearance())
    expect(digSiteAppearance({ dug: -4, strikes: 2 }).work).toBe(0)
    expect(digSiteAppearance({ dug: 1_000, strikes: 500 }).work).toBe(1)
    for (const value of Object.values(digSiteAppearance({ dug: 1_000, strikes: 500 }))) {
      expect(Number.isFinite(value)).toBe(true)
    }
  })
})
