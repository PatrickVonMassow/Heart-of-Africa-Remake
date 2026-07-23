// Bird's-eye settlement entry (design.md §2.3): the candidate + Space-gate
// helpers. Entering is movement-based but confirmed with the Space use key —
// reaching the enter radius never enters on its own, and a water cell blocks it.
import { describe, it, expect } from 'vitest'
import { settlementEnterCandidate, shouldEnterSettlement, type EnterablePlace } from './settlementEntry'

const PLACES: EnterablePlace[] = [
  { id: 'cairo', x: 0, z: 0 },
  { id: 'boma', x: 100, z: 100 },
]
const R = 2.5 // enter radius

describe('settlementEnterCandidate (design.md §2.3)', () => {
  it('names the settlement whose enter radius the traveller is within', () => {
    expect(settlementEnterCandidate(1, 0, PLACES, R, false)).toBe('cairo')
    expect(settlementEnterCandidate(101, 100, PLACES, R, false)).toBe('boma')
  })

  it('is null outside every enter radius', () => {
    expect(settlementEnterCandidate(50, 50, PLACES, R, false)).toBeNull()
    // Just past the radius: no candidate (exactly on the radius still counts).
    expect(settlementEnterCandidate(R + 0.01, 0, PLACES, R, false)).toBeNull()
    expect(settlementEnterCandidate(R, 0, PLACES, R, false)).toBe('cairo')
  })

  it('blocks entry on a water cell even inside the radius (river/lake guard)', () => {
    // On land the traveller could enter; the water guard turns it off so a
    // riverside village is never pulled in by a canoe drift (design.md §2.3).
    expect(settlementEnterCandidate(1, 0, PLACES, R, false)).toBe('cairo')
    expect(settlementEnterCandidate(1, 0, PLACES, R, true)).toBeNull()
  })
})

describe('shouldEnterSettlement (design.md §2.3)', () => {
  it('enters only on a real Space press, never automatically on radius', () => {
    // A candidate is present but no key was pressed → no entry (not auto-enter).
    expect(shouldEnterSettlement('cairo', false, false)).toBe(false)
    // The Space press confirms entry.
    expect(shouldEnterSettlement('cairo', true, false)).toBe(true)
  })

  it('never enters without a candidate', () => {
    expect(shouldEnterSettlement(null, true, false)).toBe(false)
  })

  it('is blocked while a dialog is open or the run is over (checkpoint safety)', () => {
    expect(shouldEnterSettlement('cairo', true, true)).toBe(false)
  })
})
