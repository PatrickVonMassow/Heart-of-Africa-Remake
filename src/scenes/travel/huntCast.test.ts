import { describe, expect, it } from 'vitest'
import type { RegionId } from '../../world/geo'
import { PREDATOR_PREY, REGION_PREDATORS, REGION_PREY, pickHuntSpecies, type PreyKind } from './wildlifeBehavior'

const REGIONS: RegionId[] = ['east', 'south', 'central', 'west', 'north']
const ROLLS = [0, 0.13, 0.27, 0.41, 0.55, 0.69, 0.83, 0.999]
/** A scripted roll source that also counts its draws. */
const rolls = (...seq: number[]) => {
  const f = Object.assign(() => seq[f.draws++], { draws: 0 })
  return f
}

// Point 1063: the cast is picked for the region where the hunt BEGINS, so the
// enrichments check `every hunted prey fits the region and the predator food
// web` asks that start region, not the one a chase may have run into.
describe('pickHuntSpecies', () => {
  it('picks a predator and prey that fit the start region and the food web', () => {
    for (const region of REGIONS) {
      for (const a of ROLLS) {
        for (const b of ROLLS) {
          const { predator, prey } = pickHuntSpecies(region, null, rolls(a, b))
          expect(REGION_PREDATORS[region]).toContain(predator)
          expect(REGION_PREY[region]).toContain(prey)
          expect(PREDATOR_PREY[predator]).toContain(prey)
        }
      }
    }
  })

  it('never puts wildebeest in a central hunt', () => {
    for (const a of ROLLS) for (const b of ROLLS) expect(pickHuntSpecies('central', null, rolls(a, b)).prey).not.toBe('wildebeest')
  })

  it('keeps a victim species and gives it a predator whose scheme holds it', () => {
    const giraffe: PreyKind = 'giraffe'
    for (const a of ROLLS) {
      const { predator, prey } = pickHuntSpecies('east', giraffe, rolls(a))
      expect(prey).toBe('giraffe')
      expect(predator).toBe('lion')
    }
  })

  it('selects by fixed rolls exactly as the inline pick did', () => {
    // east predators [lion, cheetah, hyena, leopard]; hyena's east prey [wildebeest, zebra, warthog]
    expect(pickHuntSpecies('east', null, rolls(0.5, 0))).toEqual({ predator: 'hyena', prey: 'wildebeest' })
    expect(pickHuntSpecies('east', null, rolls(0, 0.99))).toEqual({ predator: 'lion', prey: 'giraffe' })
    // central predators [lion, leopard]; leopard's central prey [antelope, warthog]
    expect(pickHuntSpecies('central', null, rolls(0.75, 0.6))).toEqual({ predator: 'leopard', prey: 'warthog' })
  })

  it('draws once for a victim hunt and twice for a generic one', () => {
    const v = rolls(0.3)
    pickHuntSpecies('south', 'zebra', v)
    expect(v.draws).toBe(1)
    const g = rolls(0.3, 0.3)
    pickHuntSpecies('south', null, g)
    expect(g.draws).toBe(2)
  })

  it('falls back to the lion without a draw when no region predator holds the victim', () => {
    const r = rolls()
    expect(pickHuntSpecies('east', 'unicorn' as PreyKind, r)).toEqual({ predator: 'lion', prey: 'unicorn' })
    expect(r.draws).toBe(0)
  })

  it('falls back to the east tables for a region it does not know', () => {
    const unknown = 'atlantis' as RegionId
    expect(pickHuntSpecies(unknown, null, rolls(0.5, 0))).toEqual(pickHuntSpecies('east', null, rolls(0.5, 0)))
  })

  it('casts by the start region alone, so an east cast may hold prey the forest lacks', () => {
    // Only the picker's side: the scene's actual border crossing (start region
    // recorded once, crossings logged) is asserted by scripts/verify/enrichments.mjs.
    const begun = pickHuntSpecies('east', null, rolls(0.5, 0))
    expect(begun).toEqual({ predator: 'hyena', prey: 'wildebeest' })
    expect(REGION_PREY.central).not.toContain(begun.prey)
    const central = pickHuntSpecies('central', null, rolls(0.5, 0))
    expect(REGION_PREY.central).toContain(central.prey)
    expect(central).not.toEqual(begun)
  })
})
