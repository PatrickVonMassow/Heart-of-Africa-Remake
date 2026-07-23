import { describe, expect, it } from 'vitest'
import { fireHasCookShelter } from './cookShelter'
import { PLACES } from '../world/geo'

describe('fireHasCookShelter (point 256 — the cook-shelter is people-gated on the research roster)', () => {
  it('shows the canopy for the compound/kitchen-structure peoples (peoples-1890 §9.4)', () => {
    for (const id of ['baganda', 'hausa', 'bambara', 'mandinka', 'bemba', 'lunda', 'swahili']) {
      expect(fireHasCookShelter(id), id).toBe(true)
    }
  })

  it('hides the canopy for the dome-dwellers (their accurate answer is the indoor hearth, §9.5)', () => {
    for (const id of ['zulu', 'maasai', 'mbuti', 'san']) {
      expect(fireHasCookShelter(id), id).toBe(false)
    }
  })

  it('hides the canopy for the Fang (closed bark-walled house, indoor hearth)', () => {
    expect(fireHasCookShelter('fang')).toBe(false)
  })

  it('does not assume a canopy for the GAP peoples (§9.4 "do not assume")', () => {
    for (const id of ['mongo', 'banda', 'bambundu', 'wayeyi', 'somali', 'sidama']) {
      expect(fireHasCookShelter(id), id).toBe(false)
    }
  })

  it('leaves the effectively-rainless desert points without a canopy (moot)', () => {
    for (const id of ['tuareg', 'nubians', 'berbers']) {
      expect(fireHasCookShelter(id), id).toBe(false)
    }
  })

  it('returns false for an unknown or missing people id', () => {
    expect(fireHasCookShelter(undefined)).toBe(false)
    expect(fireHasCookShelter('')).toBe(false)
    expect(fireHasCookShelter('atlantis')).toBe(false)
  })

  it('only ever names real game peoples (no phantom roster entries)', () => {
    // Every id the predicate accepts must correspond to a village people the game has.
    const gamePeople = new Set(PLACES.filter((p) => p.kind === 'village').map((v) => v.peopleId))
    for (const id of ['baganda', 'hausa', 'bambara', 'mandinka', 'bemba', 'lunda', 'swahili']) {
      expect(gamePeople.has(id), id).toBe(true)
    }
  })
})
