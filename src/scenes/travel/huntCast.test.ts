import { describe, expect, it } from 'vitest'
import type { RegionId } from '../../world/geo'
import { PREDATOR_PREY, REGION_PREDATORS, REGION_PREY, pickHuntSpecies, type PreyKind } from './wildlifeBehavior'

const REGIONS: RegionId[] = ['east', 'south', 'central', 'west', 'north']
const ROLLS = [0, 0.13, 0.27, 0.41, 0.55, 0.69, 0.83, 0.999]

// Point 1063: the cast is picked for the region where the hunt BEGINS, so the
// enrichments check `every hunted prey fits the region and the predator food
// web` asks that start region, not the one a chase may have run into.
describe('pickHuntSpecies', () => {
  it('picks a predator and prey that fit the start region and the food web', () => {
    for (const region of REGIONS) {
      for (const a of ROLLS) {
        for (const b of ROLLS) {
          const { predator, prey } = pickHuntSpecies(region, null, a, b)
          expect(REGION_PREDATORS[region]).toContain(predator)
          expect(REGION_PREY[region]).toContain(prey)
          expect(PREDATOR_PREY[predator]).toContain(prey)
        }
      }
    }
  })

  it('never puts wildebeest in a central hunt', () => {
    for (const a of ROLLS) for (const b of ROLLS) expect(pickHuntSpecies('central', null, a, b).prey).not.toBe('wildebeest')
  })

  it('keeps a victim species and gives it a predator whose scheme holds it', () => {
    const giraffe: PreyKind = 'giraffe'
    for (const a of ROLLS) {
      const { predator, prey } = pickHuntSpecies('east', giraffe, a, 0.5)
      expect(prey).toBe('giraffe')
      expect(predator).toBe('lion')
    }
  })
})
