// THE TRAVELLER STANDING IN THE RUNNING LANE (work-order 687, split out of
// `tagShuffle.bankRound.test.ts` under work-order 1178). The single most
// expensive case in the unit layer sits here — 99.8 s of replay, because a
// run-phase crossing with a traveller planted in the lane is a sparse event and
// every cycle-first window has to show one. It is the floor no worker pool can
// go under, so it shares its file only with the two cheap cases that judge the
// same ground: that the stage IS walkable, and that the walk goes round the
// traveller rather than through him.

import { describe, expect, it } from 'vitest'
import { BANK_CFG, NPC_RADIUS, village, frame, RIVER_VILLAGES } from './tagShuffleHarness'
import { PLAYER_RADIUS } from './collision'
import { type BankEnd, rockAt, stationAt } from './bankGame'

describe('the children`s bank round can reach its own stage (work-order 687)', () => {
  for (const [placeId, seed] of RIVER_VILLAGES) {
    it(`${placeId} at seed ${seed} lets the children stand on every part of the stage`, () => {
      const v = village(placeId, seed)
      expect(v.stage).not.toBeNull()
      const stage = v.stage!
      const ends: BankEnd[] = ['upstream', 'downstream']
      for (const end of ends) {
        // EVERY WAITING STATION. `stationAt` is what the walk down aims at and
        // what `inPlace` judges, so a blocked station is a gather that can only
        // ever end on its backstop.
        for (let slot = 0; slot < v.children.length; slot++) {
          const at = stationAt(stage, end, slot, BANK_CFG)
          expect({ end, slot, blocked: v.world.blocked(at.x, at.z) }).toEqual({ end, slot, blocked: false })
        }
        // AND AN ARRIVAL IS PHYSICALLY POSSIBLE: the rock is a collider, so what
        // has to exist is standing room inside the reach the run judges the
        // touch by.
        const rock = rockAt(stage, end)
        let touchable = 0
        for (let k = 0; k < 36; k++) {
          const a = (k / 36) * Math.PI * 2
          const r = BANK_CFG.reachDistance * 0.9
          if (!v.world.blocked(rock.x + Math.cos(a) * r, rock.z + Math.sin(a) * r)) touchable++
        }
        expect({ end, touchable: touchable > 0 }).toEqual({ end, touchable: true })
      }
      // AND THE WHOLE RUNNING LANE BETWEEN THEM, station to station: the ground
      // the runners cross and the ground a traveller plants himself in.
      const from = stationAt(stage, 'upstream', 1, BANK_CFG)
      const to = stationAt(stage, 'downstream', 1, BANK_CFG)
      const walled: number[] = []
      for (let k = 0; k <= 40; k++) {
        const t = k / 40
        const x = from.x + (to.x - from.x) * t
        const z = from.z + (to.z - from.z) * t
        if (v.world.blocked(x, z)) walled.push(Number(t.toFixed(2)))
      }
      expect(walled).toEqual([])
    })
  }

  it('walks round a traveller planted in the running lane, never through him', () => {
    const [placeId, seed] = RIVER_VILLAGES[0]
    const v = village(placeId, seed)
    const stage = v.stage!
    const up = rockAt(stage, 'upstream')
    const down = rockAt(stage, 'downstream')
    // He plants himself in the MIDDLE of the running ground — the worst place he
    // could pick, and the one the browser section stands him in.
    const him = { x: (up.x + down.x) / 2, z: (up.z + down.z) / 2, radius: PLAYER_RADIUS }
    v.world.stranger = him
    const bodies = PLAYER_RADIUS + NPC_RADIUS
    const owed = bodies + BANK_CFG.strangerBerth
    let minGap = Infinity
    const dt = 1 / 60
    for (let t = 0; t < 200; t += dt) {
      frame(v, dt)
      for (const c of v.children) minGap = Math.min(minGap, Math.hypot(c.x - him.x, c.z - him.z))
    }
    // A run happened with him standing in it, rather than the round halting.
    expect(v.bank!.runs).toBeGreaterThan(0)
    // ...and nobody brushed past him: the bodies never met, and the extra radius
    // the children owe the stranger was kept as well.
    expect(minGap).toBeGreaterThanOrEqual(bodies)
    expect(minGap).toBeGreaterThanOrEqual(owed)
  })

  /**
   * AND THE BROWSER SECTION'S OWN LANE RULE, REPLAYED (work-order 687). The
   * picture check stands the traveller in the middle of the stretch, opens a
   * window on the round's own clock and asks whether a child goes from one side
   * of him to the other INSIDE A RUN. Which run it opened on, and how long it
   * watched, decided the answer — and nobody had measured that:
   *
   *  - A cycle's LATER runs carry only the runners that survived the ones before
   *    it, so they end in about two seconds. A runner covers six or seven metres
   *    in that, and the traveller stands ten from the start line: nobody can
   *    reach him, let alone pass him. Only a cycle's FIRST run has the whole line
   *    in it, and `gather` — the walk down to the bank, once per cycle — is what
   *    announces it.
   *  - The 45 s window was mostly the roaming phase. The section shortens
   *    `roamSeconds` to 8, but the off-game ROCK guard held every cycle for its
   *    full 45 s of overtime on top (the boulder goes unnamed at these seeds), so
   *    the phase still ran 55 s and the window held one short run at best.
   *
   * Measured over the layouts below, both defects fixed: 75 of 75 windows carry a
   * crossing at 120 s. At the old 45 s, six of 84 carried none — a gate that went
   * green on luck, which is exactly what it did until it did not.
   */
  it('carries a child past a planted traveller in every cycle-first run window (work-order 687)', async () => {
    // THE SAME FOUR LAYOUTS THE STAGE CASES ABOVE USE, and for the same reason
    // (work-order 1094): the teaching round is played in `ROCK_VILLAGE_ID`, so
    // the spread runs over its SEEDS rather than over settlements the player
    // never learns a word in.
    const CASES: Array<[string, number]> = [
      ['bambara-village', 42],
      ['bambara-village', 2972259115],
      ['bambara-village', 9],
      ['bambara-village', 23],
    ]
    // What the browser section sets while it watches, and why: see
    // `scripts/verify/polish.mjs`, section `children-bank-game`.
    const SECTION_ROAM_S = 8
    const SECTION_GUARD_S = 8
    // The window the section opens, in played seconds.
    const LANE_WINDOW_S = 120
    // A third of headroom against a worst measured wait of 151.83 s (2026-09-19):
    // bambara-village / 42: 151.83 s; bambara-village / 2972259115: 139.37 s;
    // nubian-village / 42: 135.15 s; mandinka-village / 99: 146.90 s.
    const RUN_BUDGET_S = 205
    const shippedRoam = BANK_CFG.roamSeconds
    const shippedGuard = BANK_CFG.roamGuardSeconds
    try {
      BANK_CFG.roamSeconds = SECTION_ROAM_S
      BANK_CFG.roamGuardSeconds = SECTION_GUARD_S
      for (const [placeId, seed] of CASES) {
        const v = village(placeId, seed)
        expect({ placeId, seed, staged: !!v.stage }).toEqual({ placeId, seed, staged: true })
        const stage = v.stage!
        const up = rockAt(stage, 'upstream')
        const down = rockAt(stage, 'downstream')
        const him = { x: (up.x + down.x) / 2, z: (up.z + down.z) / 2, radius: PLAYER_RADIUS }
        v.world.stranger = him
        const dx = down.x - up.x
        const dz = down.z - up.z
        const len = Math.hypot(dx, dz) || 1
        const ax = dx / len
        const az = dz / len
        const dt = 1 / 60
        // Long enough to hold several whole cycles AND one full window after the
        // last opening this asserts on.
        const trace: Array<{ t: number; phase: string; along: number[] }> = []
        // THE REPLAY YIELDS, or it starves the worker's own bookkeeping. Four
        // layouts of 480 replayed seconds is some twelve seconds of straight
        // synchronous stepping, and the file already carries a seventeen-second
        // one beside it — measured on CI, the two together blocked the vitest
        // worker long enough to miss its `onTaskUpdate` RPC, and the whole run
        // failed with 14 598 tests green and no failing test named (the load
        // signature of point 803). A yield every replayed minute costs nothing
        // and lets the worker answer.
        let steps = 0
        for (let t = 0; t < 480; t += dt) {
          frame(v, dt)
          trace.push({
            t,
            phase: v.bank!.phase,
            along: v.children.map((c) => (c.x - him.x) * ax + (c.z - him.z) * az),
          })
          if (++steps % 1200 === 0) await new Promise((resolve) => setTimeout(resolve, 0))
        }
        // The openings the browser wait now picks: the first run of a cycle, the
        // one `gather` announces.
        const opens: number[] = []
        let prev = trace[0].phase
        let lastNonRun = trace[0].phase
        for (const s of trace) {
          if (s.phase === 'run' && prev !== 'run' && lastNonRun === 'gather') opens.push(s.t)
          if (s.phase !== 'run') lastNonRun = s.phase
          prev = s.phase
        }
        // A cycle-first run comes inside the measured regression budget, from a
        // cold start and between any two of them.
        let worstWait = opens.length > 0 ? opens[0] : Infinity
        for (let i = 1; i < opens.length; i++) worstWait = Math.max(worstWait, opens[i] - opens[i - 1])
        expect(worstWait, JSON.stringify({ placeId, seed, opens })).toBeLessThanOrEqual(RUN_BUDGET_S)
        // ...and every window that fits whole inside the replay carries a
        // crossing, counted exactly as the browser counts it: inside the run
        // phase only, with the side forgotten on leaving it and a metre of
        // hysteresis about his line.
        const windows = opens.filter((t) => t + LANE_WINDOW_S <= trace[trace.length - 1].t)
        expect({ placeId, seed, windows: windows.length > 0 }).toEqual({ placeId, seed, windows: true })
        const crossers = windows.map((from) => {
          const win = trace.filter((s) => s.t >= from && s.t < from + LANE_WINDOW_S)
          let n = 0
          for (let k = 0; k < v.children.length; k++) {
            let side = 0
            let swapped = false
            for (const s of win) {
              if (s.phase !== 'run') {
                side = 0
                continue
              }
              const a = s.along[k]
              if (a > 1 || a < -1) {
                const now = a > 0 ? 1 : -1
                if (side !== 0 && now !== side) swapped = true
                side = now
              }
            }
            if (swapped) n++
          }
          return n
        })
        expect({ placeId, seed, empty: crossers.filter((n) => n === 0).length }).toEqual({
          placeId,
          seed,
          empty: 0,
        })
      }
    } finally {
      BANK_CFG.roamSeconds = shippedRoam
      BANK_CFG.roamGuardSeconds = shippedGuard
    }
    // Four layouts of 480 replayed seconds each: this measurement carries its own
    // budget rather than flaking under the suite's worker contention.
    // MEASURED 12.09.2026, and the number is deliberate (point 1111's rule for a
    // genuinely long case): this replay takes 85.5 s on the batch host and 1.55x
    // that on the GitHub runner, so the 120 s that stood here was 13 s of
    // headroom and the runner ate it. An abort here is not a local failure — it
    // leaves the shared BANK_CFG mutated and its async replay still stepping, so
    // the two cases after it failed with it on 12.09.2026 (CI run 34664112811).
  }, 300_000)
})
