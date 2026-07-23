// Bird's-eye settlement entry (design.md §2.3): the candidate + Space-gate
// helpers. Entering is movement-based but confirmed with the Space use key —
// reaching the enter radius never enters on its own, and a water cell blocks it.
import { describe, it, expect } from 'vitest'
import { settlementEnterCandidate, settlementToEnter, shouldEnterSettlement, type EnterablePlace } from './settlementEntry'

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

describe('settlementToEnter — the press-time decision at the LIVE position (design.md §2.3)', () => {
  it('resolves against the position handed in NOW, not any earlier frame: a press right after a teleport onto the marker enters', () => {
    // The stale-candidate race: the last rendered frame stood far away (its
    // candidate was null), then the traveller teleported onto the marker and
    // Space landed before the next frame. Deriving from the live position must
    // enter — reading the frame-written candidate did nothing.
    expect(settlementToEnter(50, 50, PLACES, R, false, false)).toBeNull() // where the LAST frame stood
    expect(settlementToEnter(1, 0, PLACES, R, false, false)).toBe('cairo') // where the press LANDS
  })

  it('keeps the radius rule: a press outside every enter radius does nothing', () => {
    expect(settlementToEnter(R + 0.01, 0, PLACES, R, false, false)).toBeNull()
    expect(settlementToEnter(R, 0, PLACES, R, false, false)).toBe('cairo')
  })

  it('keeps the water guard: a press on a water cell never enters (river/lake passage)', () => {
    expect(settlementToEnter(1, 0, PLACES, R, true, false)).toBeNull()
  })

  it('keeps the block gate: an open dialog or a finished run never enters', () => {
    expect(settlementToEnter(1, 0, PLACES, R, false, true)).toBeNull()
  })
})
