// THE CHILDREN`S BANK ROUND (work-order 687, split out of `tagShuffle.test.ts`
// under work-order 1178). The longest replays in the family: the group has to
// walk down to its stage, regroup there and run the stretch, which is a sparse
// event and needs a long window. It keeps a file to itself because it MUTATES
// the shared `BANK_CFG` for the roaming cases and restores it afterwards — safe
// within one file, and not worth spreading across several.

import { describe, expect, it } from 'vitest'
import {
  BANK_CFG,
  NPC_RADIUS,
  BANK_ROUND_WINDOW,
  village,
  frame,
  playRound,
  expectLively,
} from './tagShuffleHarness'
import {
  CHILD_MOTION,
  judgedEnough,
  rescueRate,
  shuffleWindows,
} from '../../../scripts/verify/childMotionMetric.mjs'
import { PLAYER_RADIUS } from './collision'
import { type BankEnd, rockAt, stationAt } from './bankGame'

/**
 * THE ROUND IS PLAYED WHERE THE STAGE IS (work-order 687).
 *
 * The bank round's two rocks stand on the settlement's BANK LOBE — measured on
 * all three river villages, 32.5 m from the middle, while the plain walkable
 * radius is 28 and the children's own rim 27.4. Wired to the plain circle, the
 * children could not reach their own stage at ALL: the gather ran out on its
 * backstop with the group pressed against the rim four metres short of the
 * stones, the run opened on a bunched group, the catcher swept it in seconds and
 * the cycle ended without one child on the bank. Every gate above went green on
 * it — a group shuffling nowhere is exactly what they are built to catch, and
 * this group was walking hard, just never to the bank — and the browser check
 * photographed an empty stretch.
 *
 * So the stage is asserted as GROUND FIRST (nothing else can be true if the
 * children may not stand there) and then as a PLAYED ROUND: the group arrives at
 * both rocks and the runners cross the middle of the stretch, which is where a
 * traveller standing in the lane would be.
 */
describe('the children`s bank round can reach its own stage (work-order 687)', () => {
  // SEED 42 FIRST, because it is the world the BROWSER section judges this round
  // in (`scripts/verify/verify-seed.mjs` pins the verify lane to it). The pure
  // layer had covered the bambara village at the child-motion report's seed
  // only, and the layout the picture check actually walks — a different one —
  // was the one whose route across the village could not be planned.
  // AND THE OTHER TWO ARE SEEDS, NOT VILLAGES (work-order 1094). They were the
  // nubian and the mandinka layout, on the reasoning that one settlement proves
  // nothing about the next — true, and beside the point: the round that TEACHES
  // is played in `ROCK_VILLAGE_ID`, and what varies for the player there is the
  // world SEED, drawn afresh at every start. The two replacements are chosen by
  // measurement over bambara seeds 1-30 (400 replayed seconds each, the guard's
  // bound lifted so the layout rather than the bound is read): seed 9 is the
  // FASTEST layout of the sweep to its first run (22.0 s) and seed 23 one of the
  // slowest that still gets there in the ordinary way (89.3 s), so the pair
  // spans the range the player is really dealt instead of two foreign corners.
  const RIVER_VILLAGES: Array<[string, number]> = [
    ['bambara-village', 42],
    ['bambara-village', 2972259115],
    ['bambara-village', 9],
    ['bambara-village', 23],
  ]

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
