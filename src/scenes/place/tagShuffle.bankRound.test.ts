// THE ROUND WALKED DOWN AND PLAYED OUT (work-order 687; the rest of the round
// moved into `tagShuffle.bankTraveller`, `tagShuffle.bankRoaming` and
// `tagShuffle.bankRegroup` under work-order 1178). What is left here is the
// whole journey judged end to end: the group walks down to the bank and runs
// the stretch, and it keeps covering ground with `buildWedgeCarve` off — the
// removal PlaceLife makes on every bank phase, and the one that has a cost.

import { describe, expect, it } from 'vitest'
import {
  BANK_CFG,
  BANK_ROUND_WINDOW,
  village,
  frame,
  playRound,
  expectLively,
  RIVER_VILLAGES,
} from './tagShuffleHarness'
import {
  CHILD_MOTION,
  judgedEnough,
  rescueRate,
  shuffleWindows,
} from '../../../scripts/verify/childMotionMetric.mjs'
import { rockAt } from './bankGame'

describe('the children`s bank round can reach its own stage (work-order 687)', () => {
  for (const [placeId, seed] of RIVER_VILLAGES) {
    it(`${placeId} at seed ${seed} walks the group down to the bank and runs the stretch`, () => {
      const v = village(placeId, seed)
      const stage = v.stage!
      const up = rockAt(stage, 'upstream')
      const down = rockAt(stage, 'downstream')
      const mid = { x: (up.x + down.x) / 2, z: (up.z + down.z) / 2 }
      const span = Math.hypot(down.x - up.x, down.z - up.z) || 1
      const ax = (down.x - up.x) / span
      const az = (down.z - up.z) / span
      // The window is a BOUND, not the cost: every condition measured below is
      // monotone — counts only grow, the nearest distances only shrink, a
      // crossing once seen stays seen — so the replay stops at the first frame
      // on which all of them already hold, and `BANK_ROUND_WINDOW` is how long
      // it may take. The bound is wide by need: a run-phase crossing is a sparse
      // event under the shipped roam length (roaming is ~65 % of the round's
      // time).
      const stood = BANK_CFG.standOff + BANK_CFG.reachDistance
      const nearest = { up: Infinity, down: Infinity }
      // The nearest a child came to EITHER stone WHILE A RUN WAS ON. Measured
      // across every phase it proved nothing about the run: a child idling at a
      // stone during the gather, plus an unrelated run somewhere in the window,
      // satisfied a claim about how a run ENDS (GPT-5.6 Sol, confirming round).
      let touchedInRun = Infinity
      const side = v.children.map(() => ({ before: 0, crossed: false }))
      const dt = 1 / 60
      for (let t = 0; t < BANK_ROUND_WINDOW; t += dt) {
        frame(v, dt)
        const running = v.bank!.phase === 'run'
        for (let i = 0; i < v.children.length; i++) {
          const c = v.children[i]
          nearest.up = Math.min(nearest.up, Math.hypot(c.x - up.x, c.z - up.z))
          nearest.down = Math.min(nearest.down, Math.hypot(c.x - down.x, c.z - down.z))
          if (running) {
            touchedInRun = Math.min(
              touchedInRun,
              Math.hypot(c.x - up.x, c.z - up.z),
              Math.hypot(c.x - down.x, c.z - down.z),
            )
          }
          // The lane's own axis with the middle of the stretch as its origin, and
          // a metre of hysteresis so a child loitering beside the middle is never
          // read as having crossed it.
          const along = (c.x - mid.x) * ax + (c.z - mid.z) * az
          // BOTH SIDES ARE ESTABLISHED INSIDE THE RUN. Carrying the side across
          // phases let a child enter the deadband while roaming, sit there while
          // the run opened, and leave on the far side — counted as a crossing
          // whose whole journey happened outside the run (GPT-5.6 Sol,
          // confirming round). Between runs the side is forgotten.
          if (!running) {
            side[i].before = 0
            continue
          }
          if (Math.abs(along) <= 1) continue
          const now = along > 0 ? 1 : -1
          if (side[i].before !== 0 && now !== side[i].before) side[i].crossed = true
          side[i].before = now
        }
        if (
          v.bank!.runs > 0 &&
          v.bank!.cycles > 0 &&
          nearest.up <= stood &&
          nearest.down <= stood &&
          touchedInRun <= BANK_CFG.reachDistance &&
          side.some((s) => s.crossed)
        )
          break
      }
      // A CYCLE WAS PLAYED — not merely a phase clock ticking over a group that
      // never arrived, which is exactly what the plain circle produced.
      expect(v.bank!.runs).toBeGreaterThan(0)
      expect(v.bank!.cycles).toBeGreaterThan(0)
      // BOTH ENDS OF THE STAGE WERE STOOD AT: a child at its station is
      // `standOff` from its rock, so this is the group at each end rather than
      // near one of them.
      expect(nearest.up).toBeLessThanOrEqual(stood)
      expect(nearest.down).toBeLessThanOrEqual(stood)
      // ...and one of them was TOUCHED DURING A RUN, inside the reach the arrival
      // is judged by — so a run can end in a `ROCK` at the far stone and not only
      // in tags.
      expect(touchedInRun).toBeLessThanOrEqual(BANK_CFG.reachDistance)
      // AND THE STRETCH WAS RUN: somebody went from one side of its middle to
      // the other DURING A RUN. That middle is where the browser section plants
      // the traveller, so this is the pure half of "the children walk PAST him"
      // — and it must be the run that carries them past, not a drift across the
      // middle while roaming beside an unrelated run, which the uncoupled count
      // accepted. Measured over the bound, with the crowd
      // replaying the SHIPPED work choreography: 1 of 4 children crosses during
      // a run at bambara@42 (first at 1711 s), 1 of 4 at bambara@2972259115
      // (358 s), 1 of 4 at nubian@42 (175 s), 1 of 4 at mandinka@99 (290 s).
      // Often the catcher running to meet the group is the first across the
      // middle, and most runs end in tags short of it, which is why the event is
      // sparse.
      //
      // THE NUMBERS MOVED, AND WHY THEY MOVED IS THE POINT. They used to read 2
      // of 4 at 251 s, 3 of 4 at 80 s and so on — measured while this replay
      // still strolled adult bodies to the water's FOOT, which stands on the
      // children's own stage and which the shipped component pointedly refuses
      // as a stroll target. A grown man walking through the middle of the round
      // shoves children across it, and a good share of those crossings were his
      // doing rather than the game's. With him gone the event is rarer, and the
      // count is honest.
      expect(side.filter((s) => s.crossed).length).toBeGreaterThan(0)
      // The replay stops at the first frame that satisfies everything, so only
      // the sparse case pays the full bound — bambara@42 runs to 1711 s of
      // simulated time, which is past the default 20 s wall-clock budget under
      // the full suite's worker contention. A measurement this long carries its
      // own budget, as the case above it does.
    }, 120_000)
  }

  /**
   * AND THE CARVE'S REMOVAL IS PAID FOR, CHILD BY CHILD (work-order 687 item 11,
   * cross-vendor finding 18.08.2026). `PlaceLife` takes `buildWedgeCarve` off
   * EVERY bank phase, because at the verification's own seed the only route from
   * the children's quarter to the water ran through one carved wedge and the
   * group stood in a pocket instead. That is right, and it has a COST: a roaming
   * child is steered LOCALLY, so with the carve gone nothing but its own steering
   * keeps it out of a dead-end wedge. Nothing measured that. The per-child
   * shuffle measure ran over `bambara@2972259115`, `maasai@42` and `swahili@99`
   * — and the last two stand on no river, so they never play this round at all —
   * while the cases above assert reachable ground and a played cycle, never
   * per-child progress. Three of the four river layouts were ungated.
   *
   * THE WINDOW IS 200 s BECAUSE THAT IS WHERE THE WHOLE CYCLE FITS, and the
   * carve is gone from all of it. It was 120 s, measured on a round of four
   * children whose catcher swept the line: one run of 2.4-3.3 s closed the
   * cycle. Work-order 1047 made the round watchable instead — a fifth child,
   * a catcher that holds at its one tag, a held tap before each run and a
   * readable crouch at the end — so a cycle now takes three or four runs and
   * the gather walks one more body down to the bank. Re-measured over 400 s of
   * each of the four layouts, the first full cycle closes at 105.1 s
   * (nubian@42), 108.3 s (bambara@2972259115), 164.7 s (mandinka@99) and
   * 169.7 s (bambara@42); 200 s clears the slowest of them by half a minute.
   */

  for (const [placeId, seed] of RIVER_VILLAGES) {
    // 8.0 s on the batch host; the default 20 s left too little for a slower
    // runner once a neighbouring case had been aborted (CI run 34664112811).
    it(`${placeId} at seed ${seed} keeps every child covering ground with the carve gone`, () => {
      const { v, paths } = playRound(placeId, seed, 200)
      // THE WINDOW HELD A WHOLE CYCLE, read off the very replay judged below —
      // not a second one that could have diverged. Without this the gate could
      // pass on a round stalled in its roam, which is the one state the phases
      // above are bounded to prevent.
      expect({ runs: v.bank!.runs > 0, cycles: v.bank!.cycles > 0 }).toEqual({ runs: true, cycles: true })
      expectLively(paths)
      const r = shuffleWindows(paths)
      const burst = shuffleWindows(paths, CHILD_MOTION.short)
      // AND BOTH MEASURES LOOKED AT SOMETHING: a share is 0 when nothing was bad
      // and equally when nothing was judged. Measured over the 200 s cycle, the
      // same in all four layouts: 995 judged child-seconds and least judgeable
      // child 0.995 on the one-second window, 998 and 0.998 on the burst — the
      // missing part is the tail no window can reach into.
      expect(judgedEnough(r)).toBe(true)
      expect(judgedEnough(burst)).toBe(true)
      // THE VERDICT OFF THE WORST CHILD, because one child wedged among four
      // healthy ones is divided by five in every group average. With contact
      // probes ending at the stand, the worst child reads 0.000 / 0.0084 /
      // 0.0168 / 0.1256 % in the four layouts, against the unchanged 0.25 %
      // gate. Probing beyond the stand into the rock made Bambara's child 3
      // circle it at 105 s: 38 bad windows, now zero (hand-stone-contact.md).
      expect(r.leastJudged).toBeGreaterThan(CHILD_MOTION.judgedGate)
      expect(r.worstShare, JSON.stringify(r.worst)).toBeLessThan(CHILD_MOTION.shareGate)
      expect(burst.worstShare).toBeLessThan(CHILD_MOTION.shareGate)
      // AND NOBODY IS CARRIED OUT OF A WEDGE INSTEAD: the rescue teleport is what
      // ENDS a snag, so a layout that keeps its share down only by picking a
      // child up would fail here rather than pass above. Re-measured over the
      // 200 s window: not one rescue and not one carried metre falls in the
      // cycle, in any of the four.
      const rescues = rescueRate(paths)
      expect(rescues.carriedPublished).toBe(true)
      expect(rescues.nudgesPublished).toBe(true)
      expect(rescues.worstPerChildMinute).toBeLessThan(CHILD_MOTION.worstChildRescueGate)
      expect(rescues.worstCarriedMetresPerChildMinute).toBeLessThan(CHILD_MOTION.worstChildCarryGate)
    }, 60_000)
  }
})
