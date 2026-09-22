// THE GROUP REGROUPS ON ARRIVAL BEFORE THE BACKSTOP (work-order 687, split out
// of `tagShuffle.bankRound.test.ts` under work-order 1178). Replayed at the
// shipped roaming figures and at the shortened ones the debug menu uses, which
// is why these cases MUTATE `BANK_CFG` and restore it: safe inside one file,
// and the reason this block does not share a file with any other.

import { describe, expect, it } from 'vitest'
import { BANK_CFG, village, frame, RIVER_VILLAGES } from './tagShuffleHarness'

describe('the children`s bank round can reach its own stage (work-order 687)', () => {
  describe.each([
    ['shipped roaming', BANK_CFG.roamSeconds, BANK_CFG.roamGuardSeconds],
    ['shortened roaming', 8, 8],
  ] as const)('%s', (_setting, roamSeconds, roamGuardSeconds) => {
    it.each(RIVER_VILLAGES)('%s at seed %i regroups on arrival before the backstop', async (placeId, seed) => {
      const shippedRoam = BANK_CFG.roamSeconds
      const shippedGuard = BANK_CFG.roamGuardSeconds
      try {
        BANK_CFG.roamSeconds = roamSeconds
        BANK_CFG.roamGuardSeconds = roamGuardSeconds
        const v = village(placeId, seed)
        const bank = v.bank!
        const dt = 1 / 60
        const segments: number[] = []
        let began: number | null = null
        let expired = false
        // Replay both shipped roaming and the polish section's 8 s roaming:
        // the shorter interval exposes occupied stone queues between runs.
        for (let step = 0; step < 400 * 60; step++) {
          const before = bank.phase
          frame(v, dt)
          if (bank.phase === 'regroup' && before !== 'regroup') began = bank.clock
          if (bank.phase === 'regroup' && bank.phaseFor <= 0) expired = true
          if (before === 'regroup' && bank.phase !== 'regroup') {
            segments.push(bank.clock - began!)
            began = null
          }
          if ((step + 1) % 1200 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
        }
        const unfinished = began === null ? 0 : bank.clock - began
        const measured = JSON.stringify({ placeId, seed, roamSeconds, roamGuardSeconds, segments, unfinished, expired })
        expect(segments.length, measured).toBeGreaterThanOrEqual(4)
        expect(expired, measured).toBe(false)
        // Also catch expiry on the transition frame, or an unfinished last regroup.
        expect(Math.max(...segments, unfinished), measured).toBeLessThan(BANK_CFG.regroupSeconds)
      } finally {
        BANK_CFG.roamSeconds = shippedRoam
        BANK_CFG.roamGuardSeconds = shippedGuard
      }
    }, 60_000)
  })
})
