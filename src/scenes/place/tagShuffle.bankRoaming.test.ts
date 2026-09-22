// THE ROAMING PHASE IS BOUNDED, SO A RUN ALWAYS COMES (work-order 687/1094,
// split out of `tagShuffle.bankRound.test.ts` under work-order 1178). Both cases
// drive the same shared replay from a case list — the seed spread, and the one
// foreign layout that is itself the statement — so they belong together and
// nowhere else.

import { describe, expect, it } from 'vitest'
import { BANK_CFG, village, frame } from './tagShuffleHarness'

describe('the children`s bank round can reach its own stage (work-order 687)', () => {


  /**
   * THE ROAMING PHASE CANNOT RUN FOREVER (work-order 687). Its only exit was the
   * off-game ROCK guard resolving, and that guard's watch resets on ANY gain
   * toward the boulder — so a child creeping at a stone it can never quite reach
   * neither arrived nor gave up, and the phase had no bound. Measured in the
   * browser under load: the round played 150 s of its own clock in `roam` and
   * never opened a run, which is a player standing at the bank watching the
   * children wander and never play.
   *
   * The three layouts below are the ones that showed it, and they are here by
   * measurement: at this section's shortened roam the guard spent 136 s of
   * overtime in bambara@7 and in bambara@236333330 it NEVER named the boulder
   * at all (275 s to abandon). The ordinary case is beside them so the bound is
   * not only proved where it bites.
   *
   * THE FOREIGN LAYOUT IS GONE, AND ITS PROPERTY IS NOT (work-order 1094). The
   * long-overtime case used to be mandinka@99 at 206 s, in a village nobody
   * learns the language in. Re-swept over bambara seeds 1-30 with the guard's
   * bound lifted, 400 replayed seconds each: seed 21 roams 237.2 s against a cap
   * of 55.0 and does not get to its first run until 265.8 s, seed 4 roams 280.2 s
   * (first run 310.5 s) and seed 7 roams 227.9 s — all three abandon the boulder.
   * Seed 21 carries the case now, on the axis the player is actually dealt.
   * THE REPLAY ITSELF IS SHARED (work-order 1094). It is driven from a case
   * list so the seed spread and the one foreign layout that carries its own
   * statement can stand in SEPARATE cases without a second copy of the loop.
   */
  const boundsRoaming = async (CASES: Array<[string, number]>) => {
    const shippedRoam = BANK_CFG.roamSeconds
    try {
      // The browser section shortens the roam exactly this way (debug menu §21),
      // and it is the stress case: less time inside the phase means the guard
      // spends more of it in overtime.
      BANK_CFG.roamSeconds = 8
      const cap = BANK_CFG.roamSeconds * (1 + BANK_CFG.roamSpread) + BANK_CFG.roamGuardSeconds
      // The budget the browser check gives a run to start, in played seconds.
      const RUN_BUDGET_S = 150
      for (const [placeId, seed] of CASES) {
        const v = village(placeId, seed)
        const dt = 1 / 60
        let worstRoam = 0
        let roamFor = 0
        let firstRun = Infinity
        let last = ''
        // Yields for the same reason the traveller-lane replay above does: a
        // long synchronous replay starves the worker's own RPC.
        let steps = 0
        for (let t = 0; t < 400; t += dt) {
          if (++steps % 1200 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
          frame(v, dt)
          const b = v.bank!
          if (b.phase === 'roam') roamFor += dt
          else {
            if (last === 'roam') worstRoam = Math.max(worstRoam, roamFor)
            roamFor = 0
          }
          if (b.phase === 'run' && firstRun === Infinity) firstRun = b.playedClock
          last = b.phase
        }
        // THE PHASE THE WINDOW CLOSES IN IS COUNTED TOO (cross-vendor finding,
        // 14.08.2026). Folding a roam in only where it ENDS is blind to the one
        // failure this test exists for: a round still roaming when the window
        // closes never left the phase, so its length was never measured — and an
        // earlier successful run had already made `firstRun` green. The test
        // then passed on exactly the state it is meant to catch.
        if (last === 'roam') worstRoam = Math.max(worstRoam, roamFor)
        // A tenth of a second of slack for the frame the bound falls in.
        expect({ placeId, seed, longestRoam: worstRoam <= cap + 0.1 }).toEqual({
          placeId,
          seed,
          longestRoam: true,
        })
        // ...and the round got to its game, inside the budget the picture check
        // allows it.
        expect({ placeId, seed, ranWithin: firstRun <= RUN_BUDGET_S }).toEqual({
          placeId,
          seed,
          ranWithin: true,
        })
      }
    } finally {
      BANK_CFG.roamSeconds = shippedRoam
    }
  }

  // THE BUDGET IS PER CASE, and it comes from the measurement the five-case
  // version left behind: 91.2 s of replay on the batch host for five cases, so
  // about 18 s each, and at the runner's measured 1.55x about 29 s each. The
  // four-case spread therefore carries 240 s and the single foreign layout 120 s
  // — the same headroom per case that the 300 s gave five, after CI run
  // 34909464052 aborted the 180 s version and took the whole job down.
  it('bounds the roaming phase, so a run always comes (work-order 687)', () =>
    boundsRoaming([
      ['bambara-village', 42],
      ['bambara-village', 7],
      ['bambara-village', 21],
      ['bambara-village', 236333330],
    ]), 240_000)

  /**
   * THE ONE FOREIGN LAYOUT THE SEED SPREAD KEEPS (work-order 1094), in its own
   * case so the spread above names bambara alone. It is kept by MEASUREMENT
   * rather than by omission: bambara has no layout that can replace it. Seeds
   * 1-120 were swept against the unbounded code (`roamSeconds` 8,
   * `roamGuardSeconds` lifted so no roam is ever abandoned on the clock, 400
   * replayed seconds each), reading the longest ENDED roam and the roam the
   * window CLOSES in apart. Not one of the 120 shows the combination this case
   * is built on — an ended roam inside the 55.0 s cap beside a closing roam over
   * it, with a run already opened. Only two bambara seeds close in an over-cap
   * roam at all, 86 (closing 136.1 s) and 117 (closing 115.1 s), and BOTH also
   * carry an ended roam over the cap (184.7 s and 94.5 s), which the exit-only
   * measurement catches on its own. Deleting this entry would therefore delete
   * the only witness that makes the fold necessary: it is an assertion where the
   * foreign layout IS the statement, exactly like the riverless village in
   * `riverBank.test.ts`, and work-order 1094 leaves that shape standing by name.
   */
  it('keeps the one foreign layout that proves the fold (work-order 687)', () =>
    boundsRoaming([['mandinka-village', 58]]), 120_000)
})
