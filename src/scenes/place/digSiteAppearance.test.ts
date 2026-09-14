import { describe, expect, it } from 'vitest'
import { digSiteAppearance, digSiteFurniture } from './digSiteAppearance'

describe('the excavation records visible work', () => {
  it('deepens the walls and tightens the shadowed bottom', () => {
    const untouched = digSiteAppearance({ dug: 0, strikes: 0 })
    const watched = digSiteAppearance({ dug: 10, strikes: 6 })
    expect(watched.wallDepth).toBeGreaterThan(untouched.wallDepth)
    expect(watched.bottomRadius).toBeLessThan(untouched.bottomRadius)
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

describe('the work has a visible purpose and result', () => {
  it('gives every kind distinct furniture before work begins', () => {
    const recipes = (['pit', 'postHole', 'patch'] as const).map((kind) => digSiteFurniture(kind))
    expect(new Set(recipes.map((r) => r.ground)).size).toBe(3)
    expect(new Set(recipes.map((r) => r.beside)).size).toBe(3)
    expect(recipes.every((r) => r.result === null)).toBe(true)
    expect(digSiteFurniture('patch').ground).toBe('furrows')
  })

  it('requires a completed bout, rather than accumulated partial digging, to leave the result', () => {
    for (const [kind, result] of [['pit', 'covered-store'], ['postHole', 'set-post'], ['patch', 'planted-rows']] as const) {
      expect(digSiteFurniture(kind, { dug: 100, strikes: 80 }).result).toBeNull()
      expect(digSiteFurniture(kind, { dug: 12, strikes: 8, completed: true }).result).toBe(result)
    }
  })
})
