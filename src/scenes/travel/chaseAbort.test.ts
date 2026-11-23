import { describe, expect, it } from 'vitest'
import { abortChaseIntoLeave, type ChaseAbortState } from './chaseAbort'

describe('abortChaseIntoLeave', () => {
  it('keeps the predator where it stands when a crocodile steals the chase victim', () => {
    // Predator still chasing at (10, 0); the stolen calf is far off at (40, 30).
    const s: ChaseAbortState<object> & { px: number; pz: number } = {
      mode: 'chase', lx: 10, lz: 0, px: 40, pz: 30,
      heading: 1.2, leaveHeading: 0.5, leaveT: 7, victim: {}, victimHunt: true,
    }
    abortChaseIntoLeave(s, 0, 0)
    expect(s.mode).toBe('leave')
    expect(s.lx).toBe(10)
    expect(s.lz).toBe(0)
    // Walks straight away from the traveller at the origin, from its own spot.
    expect(s.heading).toBeCloseTo(Math.atan2(10, 0))
    expect(s.leaveHeading).toBeUndefined()
    expect(s.leaveT).toBe(0)
    expect(s.victim).toBeNull()
    expect(s.victimHunt).toBe(false)
  })
})
