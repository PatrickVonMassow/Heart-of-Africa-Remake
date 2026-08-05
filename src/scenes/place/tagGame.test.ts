// The children's game of tag (design.md §19.10, work-order 480/351). The round
// is pure, so everything the eye is supposed to see is pinned here: that the
// game RESOLVES, that a catch is caused by a runner running out of steam rather
// than by a timer, that the role really moves between figures, and that no child
// can end a frame inside a hut, in the fire or outside the settlement.
//
// The scenarios were designed TWICE and independently (the point-351 procedure)
// and united; scenarios only one of the two designs produced are marked (unique)
// so a later trim cannot quietly drop the rare case they exist for.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  catchReached,
  chooseTarget,
  createTagGame,
  lineClear,
  nearestCatchable,
  stepTagGame,
  type TagChild,
  type TagConfig,
  type TagState,
  type TagSteer,
  type TagWorld,
} from './tagGame'
import { boxCollider, standingClear, tryNudgeToFree, type Collider } from './collision'
import { balance } from '../../config/balance'
import { floorPace, recoverPace, trotPace } from '../../systems/pursuit'
import { mulberry32 } from '../../world/noise'
import { resetDevAsserts } from '../../systems/devAssert'

const CFG: TagConfig = balance.villageLife.tag
const RADIUS = 26
const CHILD_R = 0.3

function makeWorld(colliders: Collider[] = [], radius = RADIUS): TagWorld {
  return {
    radius,
    childRadius: CHILD_R,
    blocked: (x, z) => Math.hypot(x, z) > radius || !standingClear(colliders, x, z, CHILD_R),
    nudge: (x, z) => {
      const r = tryNudgeToFree(colliders, x, z, CHILD_R)
      return { x: r.pos[0], z: r.pos[1], found: r.found }
    },
  }
}

const OPEN = makeWorld()

function game(spots: Array<[number, number]>, seed = 9, cfg: TagConfig = CFG): TagState {
  return createTagGame(
    spots.map(([x, z]) => ({ x, z })),
    mulberry32(seed),
    cfg,
  )
}

/** A four-child group in the open, the shipped calibration. */
const FOUR: Array<[number, number]> = [
  [6, 6],
  [8, 7],
  [5, 9],
  [9, 4],
]

/** Run the game forward, watching every step. */
function run(
  s: TagState,
  seconds: number,
  world = OPEN,
  cfg: TagConfig = CFG,
  dt = 1 / 60,
  watch?: (s: TagState, t: number) => void,
  steer?: TagSteer,
): void {
  const steps = Math.round(seconds / dt)
  for (let i = 0; i < steps; i++) {
    stepTagGame(s, dt, cfg, world, steer)
    watch?.(s, i * dt)
  }
}

describe('the round: who is IT, and how the role moves', () => {
  it('opens with exactly one chaser, and with the freshest child holding the role', () => {
    const s = game(FOUR)
    stepTagGame(s, 1 / 60, CFG, OPEN)
    stepTagGame(s, 1 / 60, CFG, OPEN)
    expect(s.playing).toBe(true)
    expect(s.chaser).toBeGreaterThanOrEqual(0)
    const freshest = s.children.reduce((b, c, i, a) => (c.reserve > a[b].reserve ? i : b), 0)
    // The opening reserves differ by the per-child spread; the freshest starts.
    expect([s.chaser, freshest]).toEqual([freshest, freshest])
  })

  it('targets the NEAREST catchable child, not the first in the array', () => {
    const s = game([
      [0, 0],
      [10, 0],
      [2, 0],
    ])
    s.chaser = 0
    s.playing = true
    expect(nearestCatchable(s)).toBe(2)
  })

  it('never targets itself, and never the child still under its immunity', () => {
    const s = game([
      [0, 0],
      [0.5, 0],
      [9, 0],
    ])
    s.chaser = 0
    s.playing = true
    s.immune = 1
    s.immuneFor = 1
    expect(nearestCatchable(s)).toBe(2)
    s.immuneFor = 0
    expect(nearestCatchable(s)).toBe(1)
  })

  it('breaks an exact distance tie to the lower index, so the quarry cannot flip frame by frame', () => {
    const s = game([
      [0, 0],
      [3, 0],
      [-3, 0],
    ])
    s.chaser = 0
    s.playing = true
    expect(nearestCatchable(s)).toBe(1)
    expect(nearestCatchable(s)).toBe(1)
  })

  it('switches opportunistically when someone crosses its path — but not for a hand’s breadth (unique)', () => {
    const s = game([
      [0, 0],
      [8, 0],
      [20, 0],
    ])
    s.chaser = 0
    s.playing = true
    s.target = 1
    // A candidate nearer by LESS than the margin does not steal the quarry…
    s.children[2].x = 8 - CFG.targetSwitchMargin * 0.5
    expect(chooseTarget(s, CFG)).toBe(1)
    // …one that genuinely crosses its path does.
    s.children[2].x = 3
    expect(chooseTarget(s, CFG)).toBe(2)
  })

  it('with the only other child immune it has no quarry, cruises, and re-acquires at the expiry', () => {
    const s = game([
      [0, 0],
      [1, 0],
    ])
    s.chaser = 0
    s.playing = true
    s.immune = 1
    s.immuneFor = 0.5
    stepTagGame(s, 1 / 60, CFG, OPEN)
    expect(s.target).toBe(-1)
    expect(s.tags).toBe(0)
    // It still moves — no child stands still while a chase runs.
    expect(s.children[0].pace).toBeGreaterThanOrEqual(floorPace(CFG))
    run(s, 1)
    expect(s.target).toBe(1)
  })
})

describe('the catch', () => {
  const pair = (gap: number): TagState => {
    const s = game([
      [0, 0],
      [gap, 0],
    ])
    s.chaser = 0
    s.playing = true
    s.target = 1
    return s
  }

  it('happens exactly AT the catch distance and not a hair beyond it', () => {
    const at = pair(CFG.catchDistance)
    expect(catchReached(at.children[0], at.children[1], CFG, OPEN)).toBe(true)
    const beyond = pair(CFG.catchDistance + 1e-9)
    expect(catchReached(beyond.children[0], beyond.children[1], CFG, OPEN)).toBe(false)
    // And the step really uses that predicate.
    const near = pair(CFG.catchDistance * 0.5)
    stepTagGame(near, 1e-6, CFG, OPEN)
    expect(near.tags).toBe(1)
    const far = pair(CFG.catchDistance + 0.05)
    stepTagGame(far, 1e-6, CFG, OPEN)
    expect(far.tags).toBe(0)
  })

  it('passes the role on, grants the old chaser its immunity and resets the tenure', () => {
    const s = pair(CFG.catchDistance * 0.5)
    s.chaserFor = 12
    stepTagGame(s, 1e-6, CFG, OPEN)
    expect(s.chaser).toBe(1)
    expect(s.immune).toBe(0)
    expect(s.immuneFor).toBe(CFG.immunitySeconds)
    expect(s.chaserFor).toBe(0)
    expect(s.tags).toBe(1)
  })

  it('and the new chaser TURNS AWAY from the child it just tagged before resuming', () => {
    const s = pair(CFG.catchDistance * 0.5)
    stepTagGame(s, 1e-6, CFG, OPEN)
    const now = s.children[s.chaser]
    const gone = s.children[s.immune]
    const toward = Math.atan2(gone.x - now.x, gone.z - now.z)
    const delta = Math.atan2(Math.sin(now.heading - toward), Math.cos(now.heading - toward))
    expect(Math.abs(delta)).toBeGreaterThan(Math.PI / 2)
  })

  it('cannot re-tag inside the immunity window, and can exactly at its end', () => {
    const s = pair(CFG.catchDistance * 0.5)
    stepTagGame(s, 1e-6, CFG, OPEN)
    expect(s.tags).toBe(1)
    // Held together the whole window through: the role must not swap again.
    for (let i = 0; i < 200; i++) {
      s.children[0].x = 0
      s.children[0].z = 0
      s.children[1].x = CFG.catchDistance * 0.5
      s.children[1].z = 0
      stepTagGame(s, CFG.immunitySeconds / 400, CFG, OPEN)
      expect(s.tags).toBe(1)
    }
    // Run the window out; the very step it expires the tag is allowed again.
    s.immuneFor = 1e-9
    s.children[0].x = 0
    s.children[0].z = 0
    s.children[1].x = CFG.catchDistance * 0.5
    s.children[1].z = 0
    stepTagGame(s, 1e-6, CFG, OPEN)
    expect(s.tags).toBe(2)
  })

  it('INSTANT RE-TAG regression: two children held together swap at most once per window', () => {
    const s = pair(CFG.catchDistance * 0.5)
    let swaps = 0
    let last = s.chaser
    for (let i = 0; i < 60 * 10; i++) {
      s.children[0].x = 0
      s.children[0].z = 0
      s.children[1].x = CFG.catchDistance * 0.5
      s.children[1].z = 0
      stepTagGame(s, 1 / 60, CFG, OPEN)
      if (s.chaser !== last) {
        swaps++
        last = s.chaser
      }
    }
    // Ten seconds of contact cannot produce more swaps than the window allows.
    expect(swaps).toBeLessThanOrEqual(Math.ceil(10 / CFG.immunitySeconds) + 1)
    expect(swaps).toBeGreaterThan(0)
  })

  it('resolves ONE tag per step even with the whole group inside the catch distance', () => {
    const s = game([
      [0, 0],
      [0.1, 0],
      [0.2, 0],
      [-0.1, 0],
    ])
    s.chaser = 0
    s.playing = true
    const before = s.chaser
    stepTagGame(s, 1e-6, CFG, OPEN)
    expect(s.tags).toBe(1)
    expect(s.chaser).not.toBe(before)
    expect(s.immune).toBe(before)
    // Exactly one chaser afterwards, and nobody else gained immunity.
    expect(s.chaser).toBeGreaterThanOrEqual(0)
  })

  it('immunity is PAIR-scoped: the new chaser may tag a third child at once (unique)', () => {
    const s = game([
      [0, 0],
      [0.3, 0],
      [0.5, 0],
    ])
    s.chaser = 0
    s.playing = true
    stepTagGame(s, 1e-6, CFG, OPEN)
    expect(s.tags).toBe(1)
    const second = s.chaser
    // A third child standing beside the new chaser was never immune.
    s.children[2].x = s.children[second].x + CFG.catchDistance * 0.4
    s.children[2].z = s.children[second].z
    stepTagGame(s, 1e-6, CFG, OPEN)
    expect(s.tags).toBe(2)
    expect(s.chaser).toBe(2)
  })

  it('a chained tag clears the stale immunity — the first child is catchable again (unique)', () => {
    const s = game([
      [0, 0],
      [0.3, 0],
      [0.5, 0],
    ])
    s.chaser = 0
    s.playing = true
    stepTagGame(s, 1e-6, CFG, OPEN) // 0 tags 1 → 0 immune
    const a = s.immune
    stepTagGame(s, 1e-6, CFG, OPEN) // 1 tags 2 → 1 immune, 0's protection is stale
    expect(s.immune).not.toBe(a)
    expect(s.immuneFor).toBe(CFG.immunitySeconds)
    // Only ONE child is ever immune, so the first one is fair game again.
    s.children[a].x = s.children[s.chaser].x + CFG.catchDistance * 0.4
    s.children[a].z = s.children[s.chaser].z
    expect(nearestCatchable(s)).toBe(a)
  })

  it('is never reached THROUGH a wall (unique)', () => {
    // A hut between two children within arm's reach of each other: the tag would
    // read as a bug, so the straight line has to be clear.
    const wall = [boxCollider(0.4, 0, 0.05, 3, 0)]
    const world = makeWorld(wall)
    expect(lineClear(0, 0, 0.8, 0, world)).toBe(false)
    expect(lineClear(0, 0, 0.8, 0, OPEN)).toBe(true)
    const s = game([
      [0, 0],
      [0.8, 0],
    ])
    s.chaser = 0
    s.playing = true
    s.target = 1
    // The pair is deliberately set down astride the wall, so the placement
    // invariant is EXPECTED to fire here. It is caught rather than left to
    // print: a stray [ASSERT] in a green run dulls the channel it is the whole
    // point of arming.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    stepTagGame(s, 1e-9, CFG, world)
    const fired = quiet.mock.calls.map((c) => String(c[0]))
    quiet.mockRestore()
    expect(s.tags).toBe(0)
    expect(fired.every((c) => c.includes('tag-inside'))).toBe(true)
  })

  it('two children on the very same spot resolve without a NaN (unique)', () => {
    const s = game([
      [4, 4],
      [4, 4],
    ])
    s.chaser = 0
    s.playing = true
    stepTagGame(s, 1 / 60, CFG, OPEN)
    for (const c of s.children) {
      expect(Number.isFinite(c.x)).toBe(true)
      expect(Number.isFinite(c.z)).toBe(true)
      expect(Number.isFinite(c.heading)).toBe(true)
    }
    expect(s.tags).toBe(1)
  })

  it('cannot be stepped over: the fastest clamped frame stays inside the catch ring', () => {
    const fastest = CFG.sprintSpeed * CFG.runnerBoost * 0.1 // the scene's dt clamp
    expect(fastest).toBeLessThan(CFG.catchDistance)
  })
})

describe('stamina is what ends a pursuit — the cap is only the backstop', () => {
  it('a four-child group is caught again and again, each catch while the quarry RECOVERS', () => {
    const s = game(FOUR)
    const caughtWhileRecovering: boolean[] = []
    let tags = 0
    run(s, 90, OPEN, CFG, 1 / 60, () => {
      if (s.tags !== tags) {
        tags = s.tags
        caughtWhileRecovering.push(s.children[s.chaser].press === 'recover')
      }
    })
    expect(s.tags).toBeGreaterThanOrEqual(5)
    // EVERY catch happened to a child that had broken off to get its breath —
    // the catch is caused by the picture the viewer has been watching, not by a
    // timer firing off-screen.
    expect(caughtWhileRecovering.every(Boolean)).toBe(true)
  })

  it('and the first catch arrives well inside the backstop cap', () => {
    const firsts: number[] = []
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = game(FOUR, seed)
      let first = Infinity
      run(s, CFG.resolveCapSeconds, OPEN, CFG, 1 / 60, (st, t) => {
        if (st.tags > 0 && first === Infinity) first = t
      })
      firsts.push(first)
    }
    console.log('first catches', JSON.stringify(firsts))
    for (const f of firsts) expect(f).toBeLessThan(CFG.resolveCapSeconds * 0.6)
  })

  it('a pair plays on for minutes without deadlocking', () => {
    const s = game([
      [4, 4],
      [8, 8],
    ])
    run(s, 240)
    expect(s.tags).toBeGreaterThanOrEqual(8)
  })

  it('the BACKSTOP fires per chaser TENURE and resolves into ordinary idling', () => {
    // Nobody can ever be caught: the tenure runs out, the group idles, and a new
    // round then starts with exactly one chaser again.
    const cfg: TagConfig = { ...CFG, catchDistance: 0, resolveCapSeconds: 6, idleSeconds: 3 }
    const s = game(FOUR, 9, cfg)
    let sawIdle = false
    let idleChaser = false
    run(s, 8, OPEN, cfg, 1 / 60, (st) => {
      if (!st.playing) {
        sawIdle = true
        if (st.chaser >= 0) idleChaser = true
      }
    })
    expect(sawIdle).toBe(true)
    expect(idleChaser).toBe(false) // nobody holds the role during the break
    run(s, 4, OPEN, cfg)
    expect(s.playing).toBe(true)
    expect(s.chaser).toBeGreaterThanOrEqual(0)
  })

  it('a healthy round with regular catches is never cut short by the cap', () => {
    const s = game(FOUR)
    let brokeOff = false
    run(s, 60, OPEN, CFG, 1 / 60, (st) => {
      if (!st.playing) brokeOff = true
    })
    expect(s.tags).toBeGreaterThan(0)
    expect(brokeOff).toBe(false)
  })

  it('the tenure never runs past the cap, whatever the frame length', () => {
    for (const dt of [1 / 120, 1 / 60, 0.1]) {
      const cfg: TagConfig = { ...CFG, catchDistance: 0, resolveCapSeconds: 5 }
      const s = game(FOUR, 3, cfg)
      run(s, 20, OPEN, cfg, dt, (st) => {
        expect(st.chaserFor).toBeLessThanOrEqual(cfg.resolveCapSeconds + dt + 1e-6)
      })
    }
  })

  it('the cap counts SIM time, not frames (unique)', () => {
    const at = (dt: number) => {
      const cfg: TagConfig = { ...CFG, catchDistance: 0, resolveCapSeconds: 5 }
      const s = game(FOUR, 3, cfg)
      let broke = Infinity
      run(s, 12, OPEN, cfg, dt, (st, t) => {
        if (!st.playing && broke === Infinity) broke = t
      })
      return broke
    }
    expect(Math.abs(at(1 / 60) - at(1 / 30))).toBeLessThan(0.2)
  })

  it("the game's own clock counts SIM seconds, playing and idling alike (unique)", () => {
    // The live verification samples an INTERVAL OF GAME off this clock rather
    // than a count of frames — a frame budget buys wildly different amounts of
    // game on a fast machine and a loaded one. So it must advance by exactly the
    // dt it is given, at any frame length, and must NOT stall over the idle
    // break between two rounds.
    const cfg: TagConfig = { ...CFG, resolveCapSeconds: 4, idleSeconds: 3 }
    const s = game(FOUR, 3, cfg)
    expect(s.clock).toBe(0)
    run(s, 10, OPEN, cfg, 1 / 60)
    expect(s.clock).toBeCloseTo(10, 5)
    // Across the break too: the group idles, and the clock keeps counting.
    let sawIdle = false
    run(s, 10, OPEN, cfg, 1 / 30, (st) => {
      if (!st.playing) sawIdle = true
    })
    expect(sawIdle).toBe(true)
    expect(s.clock).toBeCloseTo(20, 5)
    // A zero or negative frame is not time and must not move it.
    stepTagGame(s, 0, cfg, OPEN)
    stepTagGame(s, -1, cfg, OPEN)
    expect(s.clock).toBeCloseTo(20, 5)
  })

  it('a chase driven into the ground still recovers: nobody stays a hopeless trotter', () => {
    const s = game([
      [0, 0],
      [2, 0],
    ])
    run(s, 20)
    let sawRecovery = false
    let sawSprintAgain = false
    run(s, 60, OPEN, CFG, 1 / 60, (st) => {
      if (st.children.some((c) => c.effort === 'recover')) sawRecovery = true
      if (sawRecovery && st.children.some((c) => c.effort === 'sprint')) sawSprintAgain = true
    })
    expect(sawRecovery).toBe(true)
    expect(sawSprintAgain).toBe(true)
  })
})

describe('group size (the seasonal thinning of point 142 changes the player count)', () => {
  it('a LONE child never chases itself — it idles like any other village figure', () => {
    const s = game([[3, 3]])
    run(s, 30)
    expect(s.playing).toBe(false)
    expect(s.chaser).toBe(-1)
    expect(s.tags).toBe(0)
    expect(s.children[0].pace).toBe(0)
  })

  it('an empty group is a no-op and throws nothing', () => {
    const s = game([])
    expect(() => run(s, 2)).not.toThrow()
    expect(s.playing).toBe(false)
  })

  it('two is a whole game', () => {
    const s = game([
      [5, 5],
      [9, 6],
    ])
    run(s, 60)
    expect(s.tags).toBeGreaterThan(0)
    expect(s.chaser).toBeGreaterThanOrEqual(0)
  })

  it('a roster that SHRINKS mid-chase leaves exactly one valid chaser (unique)', () => {
    const s = game(FOUR)
    run(s, 6)
    // Removing the chaser leaves the role pointing past the end of the roster
    // for one step, so the invariant is EXPECTED to fire once. Caught rather
    // than printed, for the same reason as above.
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {})
    // The chaser itself is removed.
    s.children.splice(s.chaser, 1)
    run(s, 3)
    expect(s.chaser).toBeGreaterThanOrEqual(-1)
    expect(s.chaser).toBeLessThan(s.children.length)
    if (s.playing) expect(s.chaser).toBeGreaterThanOrEqual(0)
    // Down to one: the game must stop rather than chase a phantom.
    s.children.splice(1)
    run(s, CFG.idleSeconds + 2)
    const fired = quiet.mock.calls.map((c) => String(c[0]))
    quiet.mockRestore()
    expect(fired.every((c) => c.includes('tag-one-chaser'))).toBe(true)
    expect(s.children.length).toBe(1)
    expect(s.playing).toBe(false)
  })

  it('a lone child STILL HOLDING the role idles at once, not at the backstop (unique)', () => {
    // The index repair alone misses exactly this: with one child left and the
    // role on index 0, every index is in range and the round simply ran on —
    // measured, 43 s of a lone child wandering targetless before the cap idled
    // it. The shrink test above only ever removed a chaser whose index was left
    // out of range, so it never reached this state.
    const s = game(FOUR)
    run(s, 6)
    // Put the role on the child that will SURVIVE the shrink, then shrink.
    s.chaser = 0
    s.target = 1
    s.children.splice(1)
    expect(s.playing).toBe(true)
    stepTagGame(s, 1 / 60, CFG, OPEN)
    expect(s.playing).toBe(false)
    expect(s.chaser).toBe(-1)
    // And it stays idling rather than restarting a game with itself.
    run(s, CFG.idleSeconds + 5)
    expect(s.playing).toBe(false)
  })

  it('the drawn body TURNS rather than snapping: the facing never jumps (unique)', () => {
    // The travel heading is free to jump — a deflection round a hut corner is a
    // real change of direction — but the drawn body may only turn at its rate.
    // Measured before this held: ~7 one-frame about-faces per child-minute.
    const s = game(FOUR)
    const dt = 1 / 60
    let worst = 0
    const before = s.children.map((c) => c.facing)
    run(s, 120, OPEN, CFG, dt, (st, _t) => {
      st.children.forEach((c, i) => {
        const d = Math.abs(Math.atan2(Math.sin(c.facing - before[i]), Math.cos(c.facing - before[i])))
        worst = Math.max(worst, d)
        before[i] = c.facing
      })
    })
    expect(worst).toBeLessThanOrEqual(CFG.turnRate * dt + 1e-9)
    // It really does turn, though — a facing frozen at its start would pass the
    // bound above and be a far worse bug.
    expect(worst).toBeGreaterThan(0)
  })

  it('a runner hovering at the pressure distance does not flip its steering (unique)', () => {
    // Deciding flee-or-return on the bare pressure distance swung a runner 180°
    // every time it drifted across that one line. The band holds the choice.
    const s = game(FOUR)
    run(s, 6)
    const runner = s.children[(s.chaser + 1) % s.children.length]
    const chaser = s.children[s.chaser]
    let flips = 0
    let prev = runner.evading
    for (let i = 0; i < 600; i++) {
      // Park the runner exactly on the boundary, jittering by a hair either way
      // — the state the sharp rule flapped on.
      runner.x = chaser.x + CFG.pressureDistance + (i % 2 === 0 ? -1e-3 : 1e-3)
      runner.z = chaser.z
      stepTagGame(s, 1 / 60, CFG, OPEN)
      if (runner.evading !== prev) flips++
      prev = runner.evading
    }
    expect(flips).toBeLessThanOrEqual(1)
  })

  it('a roster that GROWS mid-chase leaves the chaser untouched and the newcomer a runner (unique)', () => {
    const s = game(FOUR)
    run(s, 6)
    const was = s.chaser
    const fresh: TagChild = { ...s.children[0], x: 14, z: 2, reserve: 1, pace: 0, walked: 0 }
    s.children.push(fresh)
    run(s, 2)
    expect(s.chaser).toBe(was)
    expect(s.children.length).toBe(5)
  })

  it('an immune child removed with the roster takes its protection with it (unique)', () => {
    const s = game(FOUR)
    run(s, 30)
    s.immune = s.children.length // out of range, as a removal would leave it
    stepTagGame(s, 1 / 60, CFG, OPEN)
    expect(s.immune).toBe(-1)
    expect(s.immuneFor).toBe(0)
  })
})

describe('the settlement: the chase runs THROUGH it, never into it', () => {
  // Two huts, a fire ring and the walkable rim — the shapes a village actually
  // puts in a child's way.
  const village: Collider[] = [
    boxCollider(4, 2, 2.4, 2.0, 0.3),
    boxCollider(-3, 6, 3.0, 2.2, -0.6),
    { x: -3.5, z: 2.5, r: 1.3 }, // the fire pit, exactly as the layout builds it
  ]
  const world = makeWorld(village)

  it('no child ever ends a step inside a collider, in the fire or outside the rim', () => {
    for (const seed of [1, 5, 11]) {
      const s = game(FOUR, seed)
      run(s, 60, world, CFG, 1 / 60, (st) => {
        for (const c of st.children) {
          expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(RADIUS + 1e-6)
          expect(standingClear(village, c.x, c.z, CHILD_R)).toBe(true)
        }
      })
    }
  })

  it('a run at a wall CONTINUES past it — the deflected step, not the walker slide', () => {
    const s = game([
      [4, -4],
      [4, 8],
    ])
    s.chaser = 0
    s.playing = true
    // The chaser is aimed straight through the first hut at its quarry.
    let stalled = 0
    let worst = 0
    run(s, 8, world, CFG, 1 / 60, (st) => {
      const c = st.children[st.chaser]
      if (c.pinned > 0) stalled++
      worst = Math.max(worst, c.pinned)
    })
    expect(worst).toBeLessThanOrEqual(CFG.unstuckSeconds + 1e-6)
    expect(stalled).toBeLessThan(60 * 8 * 0.2)
    // And it got past the hut rather than stopping at its face.
    expect(s.children[0].walked).toBeGreaterThan(8)
  })

  it('a child boxed into a pocket is nudged free inside its window and runs on', () => {
    const pocket: Collider[] = [
      boxCollider(0, 1.2, 4, 0.2, 0),
      boxCollider(0, -1.2, 4, 0.2, 0),
      boxCollider(1.2, 0, 0.2, 4, 0),
      boxCollider(-1.2, 0, 0.2, 4, 0),
    ]
    const boxed = makeWorld(pocket)
    const s = game([
      [0, 0],
      [10, 0],
    ])
    s.chaser = 1
    s.playing = true
    run(s, CFG.unstuckSeconds * 3, boxed)
    // Either it found its way out or the nudge moved it; either way it does not
    // stand pinned past its window.
    expect(s.children[0].pinned).toBeLessThanOrEqual(CFG.unstuckSeconds + 1e-6)
  })

  it('a runner cornered with the chaser closing is CAUGHT rather than pinned', () => {
    const pen: Collider[] = [
      boxCollider(0, 3, 4, 0.3, 0),
      boxCollider(3.5, 0, 0.3, 4, 0),
      boxCollider(-3.5, 0, 0.3, 4, 0),
    ]
    const cornered = makeWorld(pen)
    const s = game([
      [0, -3],
      [0, 2],
    ])
    s.chaser = 0
    s.playing = true
    run(s, 40, cornered)
    expect(s.tags).toBeGreaterThan(0)
  })

  it('presses ALONG the rim rather than into it — the runner keeps moving at the edge', () => {
    const s = game([
      [RADIUS - 1.5, 0],
      [RADIUS - 4, 0],
    ])
    s.chaser = 1
    s.playing = true
    const start = { ...s.children[0] }
    run(s, 6)
    expect(Math.hypot(s.children[0].x, s.children[0].z)).toBeLessThanOrEqual(RADIUS + 1e-6)
    expect(Math.hypot(s.children[0].x - start.x, s.children[0].z - start.z)).toBeGreaterThan(3)
  })

  it('uses the SAME footprint the picture draws with, so no phantom collider exists (unique)', () => {
    // The world hands the chase its child radius; the chase resolves with that
    // one and nothing else, so a collider can never be wider or narrower than
    // the body the renderer puts on the ground.
    const probed: number[] = []
    const spy: TagWorld = {
      ...OPEN,
      blocked: (x, z) => {
        probed.push(Math.hypot(x, z))
        return OPEN.blocked(x, z)
      },
    }
    const s = game(FOUR)
    run(s, 1, spy)
    expect(probed.length).toBeGreaterThan(0)
    expect(spy.childRadius).toBe(CHILD_R)
  })

  it('the traveller is not a wall: the chase flows through where he stands', () => {
    // No inhabitant in this settlement treats the player as a collider, and a
    // game that could be blocked by standing in it would be a way to freeze the
    // vignette. The world predicate is the settlement's, and the player is not
    // in it — stated here so a later change has to face the decision.
    const s = game(FOUR)
    run(s, 20, OPEN, CFG, 1 / 60, (st) => {
      for (const c of st.children) expect(c.pace).toBeGreaterThanOrEqual(floorPace(CFG))
    })
    expect(s.tags).toBeGreaterThan(0)
  })
})

describe('the paces the eye reads', () => {
  it('nobody ever falls below the floor while a chase runs — winded, never frozen', () => {
    const s = game(FOUR)
    run(s, 45, OPEN, CFG, 1 / 60, (st) => {
      if (!st.playing) return
      for (const c of st.children) expect(c.pace).toBeGreaterThanOrEqual(floorPace(CFG) - 1e-9)
    })
  })

  it('a recovering child really is slower than a trotting one, and the reserve rises', () => {
    expect(recoverPace(CFG)).toBeLessThan(trotPace(CFG))
    const s = game([
      [0, 0],
      [1.2, 0],
    ])
    s.chaser = 0
    s.playing = true
    s.children[1].reserve = 0.05
    s.children[1].press = 'recover'
    const before = s.children[1].reserve
    run(s, 1)
    expect(s.children[1].reserve).toBeGreaterThan(before)
  })

  it('the posture is a function of the PACE, so nothing snaps at a threshold (unique)', () => {
    const s = game(FOUR)
    let prev: number[] = s.children.map((c) => c.lean)
    run(s, 30, OPEN, CFG, 1 / 60, (st) => {
      st.children.forEach((c, i) => {
        expect(c.lean).toBeGreaterThanOrEqual(-1e-9)
        expect(c.lean).toBeLessThanOrEqual(CFG.leanAtSprint + 1e-9)
        expect(Math.abs(c.lean - prev[i])).toBeLessThan(CFG.leanAtSprint * 0.2)
      })
      prev = st.children.map((c) => c.lean)
    })
  })

  it('the walked distance the legs ride grows with the running and stands still at rest (unique)', () => {
    const s = game([[3, 3]]) // a lone child idles: it stands, so its legs must not swing
    run(s, 5)
    expect(s.children[0].walked).toBe(0)
    const p = game(FOUR)
    run(p, 5)
    for (const c of p.children) expect(c.walked).toBeGreaterThan(1)
  })

  it('a teleport nudge is NOT added to the walked distance — the legs never flail (unique)', () => {
    const pocket: Collider[] = [
      boxCollider(0, 0.8, 4, 0.2, 0),
      boxCollider(0, -0.8, 4, 0.2, 0),
      boxCollider(0.8, 0, 0.2, 4, 0),
      boxCollider(-0.8, 0, 0.2, 4, 0),
    ]
    const boxed = makeWorld(pocket)
    const s = game([
      [0, 0],
      [12, 0],
    ])
    s.chaser = 1
    s.playing = true
    const before = { ...s.children[0] }
    run(s, CFG.unstuckSeconds + 0.5, boxed)
    const moved = Math.hypot(s.children[0].x - before.x, s.children[0].z - before.z)
    // It was carried out of the pocket…
    expect(moved).toBeGreaterThan(0.5)
    // …and the gait phase did not follow the jump.
    expect(s.children[0].walked).toBeLessThan(moved)
  })
})

describe('the frame delta', () => {
  it('dt = 0 changes nothing at all', () => {
    const s = game(FOUR)
    run(s, 2)
    const before = JSON.stringify(s)
    stepTagGame(s, 0, CFG, OPEN)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('a long stalled frame is still a valid step — no tunnelling, no NaN', () => {
    const s = game(FOUR)
    for (let i = 0; i < 200; i++) {
      stepTagGame(s, 0.1, CFG, OPEN)
      for (const c of s.children) {
        expect(Number.isFinite(c.x) && Number.isFinite(c.z)).toBe(true)
        expect(Math.hypot(c.x, c.z)).toBeLessThanOrEqual(RADIUS + 1e-6)
        expect(c.reserve).toBeGreaterThanOrEqual(0)
        expect(c.reserve).toBeLessThanOrEqual(1)
      }
    }
  })
})

describe('debug edits land mid-round without breaking the game (unique)', () => {
  it('immunity set to zero still cannot produce a per-frame ping-pong', () => {
    const cfg: TagConfig = { ...CFG, immunitySeconds: 0 }
    const s = game([
      [0, 0],
      [0.3, 0],
    ])
    s.chaser = 0
    s.playing = true
    let swaps = 0
    let last = s.chaser
    for (let i = 0; i < 300; i++) {
      stepTagGame(s, 1 / 60, cfg, OPEN)
      if (s.chaser !== last) {
        swaps++
        last = s.chaser
      }
    }
    // The turn-away separates them, so even with no window at all the pair does
    // not trade the role every single frame.
    expect(swaps).toBeLessThan(300)
  })

  it('a tenfold drain only tires them sooner', () => {
    const cfg: TagConfig = { ...CFG, drainPerSecond: CFG.drainPerSecond * 10 }
    const s = game(FOUR, 9, cfg)
    run(s, 20, OPEN, cfg)
    for (const c of s.children) {
      expect(c.reserve).toBeGreaterThanOrEqual(0)
      expect(c.reserve).toBeLessThanOrEqual(1)
    }
    expect(s.children.some((c) => c.press === 'recover')).toBe(true)
  })

  it('a catch distance larger than the pressure distance does not livelock', () => {
    const cfg: TagConfig = { ...CFG, catchDistance: CFG.pressureDistance + 4 }
    const s = game(FOUR, 9, cfg)
    expect(() => run(s, 20, OPEN, cfg)).not.toThrow()
    expect(s.tags).toBeGreaterThan(0)
  })

  it('thresholds moved under the whole group leave every child recovering, then running again', () => {
    const s = game(FOUR)
    run(s, 10)
    // A threshold above every reachable reserve: the whole group must go into
    // recovery gracefully rather than flicker.
    const cfg: TagConfig = { ...CFG, breakOff: 1, resume: 1 }
    run(s, 3, OPEN, cfg)
    expect(s.children.every((c) => c.press === 'recover')).toBe(true)
    for (const c of s.children) expect(c.pace).toBeGreaterThanOrEqual(floorPace(cfg) - 1e-9)
    // Put them back and the game runs on.
    let sprinted = false
    run(s, 30, OPEN, CFG, 1 / 60, (st) => {
      if (st.children.some((c) => c.effort === 'sprint')) sprinted = true
    })
    expect(sprinted).toBe(true)
  })
})

describe('the armed invariants (point 207(i)) — the channel every session listens on', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    resetDevAsserts()
    spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => spy.mockRestore())

  const codes = () => spy.mock.calls.map((c) => String(c[0]))

  it('says NOTHING over a long healthy game — an assert that cries wolf is ignored', () => {
    for (const seed of [1, 2, 3]) {
      const s = game(FOUR, seed)
      run(s, 90)
    }
    expect(codes()).toEqual([])
  })

  it('nor during the idle break, where no chaser is the correct state', () => {
    const cfg: TagConfig = { ...CFG, catchDistance: 0, resolveCapSeconds: 3, idleSeconds: 5 }
    const s = game(FOUR, 9, cfg)
    run(s, 7, OPEN, cfg)
    expect(s.playing).toBe(false)
    expect(codes()).toEqual([])
  })

  it('reports a group playing with no chaser', () => {
    const s = game(FOUR)
    run(s, 2)
    s.chaser = -1
    s.playing = true
    stepTagGame(s, 1 / 60, CFG, OPEN)
    // The step repairs the state into idling AND the assert names it.
    expect(codes().join(' ')).toContain('tag-one-chaser')
  })

  it('reports a reserve outside its bounds', () => {
    const s = game(FOUR)
    run(s, 2)
    s.children[0].reserve = 1.5
    stepTagGame(s, 0, CFG, OPEN)
    stepTagGame(s, 1 / 60, CFG, OPEN)
    expect(codes().join(' ')).toContain('tag-reserve')
  })

  it('reports a child standing inside a collider or outside the settlement', () => {
    const s = game(FOUR)
    run(s, 2)
    s.children[1].x = RADIUS + 10
    s.children[1].z = 0
    stepTagGame(s, 1 / 60, CFG, OPEN)
    expect(codes().join(' ')).toContain('tag-inside')
  })

  it('reports a chaser that has held the role past the backstop cap', () => {
    const s = game(FOUR)
    run(s, 2)
    s.chaserFor = CFG.resolveCapSeconds * 10
    // Reading it BEFORE the cap check would hide it; the assert runs after the
    // step either way, so a state carried in from outside is still named.
    s.playing = true
    stepTagGame(s, 1 / 60, CFG, OPEN)
    s.chaserFor = CFG.resolveCapSeconds * 10
    s.playing = true
    stepTagGame(s, 0, CFG, OPEN)
    expect(s.playing === false || codes().join(' ').includes('tag-resolve-cap')).toBe(true)
  })

  it('reports a child pinned past its unstuck window', () => {
    const s = game(FOUR)
    run(s, 2)
    s.children[2].pinned = CFG.unstuckSeconds * 5
    stepTagGame(s, 0, CFG, OPEN)
    stepTagGame(s, 1 / 3600, CFG, OPEN)
    expect(codes().join(' ')).toContain('tag-pinned')
  })
})

describe('the group never tires in unison (the per-child spread)', () => {
  it('gives each child its own rates and opening reserve', () => {
    const s = game(FOUR)
    const drains = new Set(s.children.map((c) => c.drainScale))
    const recovers = new Set(s.children.map((c) => c.recoverScale))
    expect(drains.size).toBe(4)
    expect(recovers.size).toBe(4)
    for (const c of s.children) {
      expect(c.drainScale).toBeGreaterThanOrEqual(1 - CFG.variation)
      expect(c.drainScale).toBeLessThanOrEqual(1 + CFG.variation)
      expect(c.reserve).toBeGreaterThanOrEqual(1 - CFG.variation)
      expect(c.reserve).toBeLessThanOrEqual(1)
    }
  })

  it('and the same seed gives the same game twice — nothing here is wall-clock driven', () => {
    const a = game(FOUR, 4)
    const b = game(FOUR, 4)
    run(a, 30)
    run(b, 30)
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

describe('the paths are a GAME, not a route', () => {
  it('the gap between chaser and quarry rises and falls repeatedly', () => {
    const s = game(FOUR)
    const gaps: number[] = []
    run(s, 60, OPEN, CFG, 1 / 60, (st, t) => {
      if (Math.round(t * 60) % 15 !== 0 || st.target < 0) return
      const c = st.children[st.chaser]
      const q = st.children[st.target]
      gaps.push(Math.hypot(c.x - q.x, c.z - q.z))
    })
    let turns = 0
    for (let i = 2; i < gaps.length; i++) {
      const a = gaps[i - 1] - gaps[i - 2]
      const b = gaps[i] - gaps[i - 1]
      if (a * b < 0) turns++
    }
    expect(turns).toBeGreaterThanOrEqual(6)
  })

  it('their headings cover a wide spread rather than circling one centre', () => {
    const s = game(FOUR)
    const bins = new Set<number>()
    const radii: number[] = []
    run(s, 60, OPEN, CFG, 1 / 60, (st, t) => {
      if (Math.round(t * 60) % 20 !== 0) return
      for (const c of st.children) {
        bins.add(Math.floor(((c.heading + Math.PI * 3) % (Math.PI * 2)) / (Math.PI / 6)))
        radii.push(Math.hypot(c.x, c.z))
      }
    })
    expect(bins.size).toBeGreaterThanOrEqual(10)
    // And they do not hold one radius either — a ring would be a route too.
    const mean = radii.reduce((a, b) => a + b, 0) / radii.length
    const sd = Math.sqrt(radii.reduce((a, b) => a + (b - mean) ** 2, 0) / radii.length)
    expect(sd).toBeGreaterThan(1)
  })

  it('the role really moves around the group over a long game', () => {
    const s = game(FOUR)
    const held = new Set<number>()
    run(s, 120, OPEN, CFG, 1 / 60, (st) => {
      if (st.chaser >= 0) held.add(st.chaser)
    })
    expect(held.size).toBeGreaterThanOrEqual(2)
  })
})

describe('an outside claim on a child: what was SAID steers it (point 481)', () => {
  /** A claim that walks ONE child due +x at a fixed pace. */
  const dueEast =
    (index: number, pace: number): TagSteer =>
    (i) =>
      i === index ? { heading: Math.PI / 2, pace } : null

  it('walks a child between rounds, where the chase would leave it standing', () => {
    const s = game(FOUR)
    s.playing = false
    s.chaser = -1
    s.idleFor = 30 // a long break, so nothing else moves anyone
    const before = s.children[2].x
    run(s, 2, OPEN, CFG, 1 / 60, undefined, dueEast(2, 1.6))
    expect(s.children[2].x).toBeGreaterThan(before + 1)
    // The legs ride the distance actually walked.
    expect(s.children[2].walked).toBeGreaterThan(1)
    // Everybody else stood still: the break is still a break.
    for (const i of [0, 1, 3]) {
      expect(Math.hypot(s.children[i].x - FOUR[i][0], s.children[i].z - FOUR[i][1])).toBeLessThan(0.01)
    }
  })

  it('holds a child still between rounds when the claim asks for a pace of zero', () => {
    const s = game(FOUR)
    s.playing = false
    s.chaser = -1
    s.idleFor = 30
    run(s, 2, OPEN, CFG, 1 / 60, undefined, () => ({ heading: 0, pace: 0 }))
    for (let i = 0; i < s.children.length; i++) {
      expect(s.children[i].pace).toBe(0)
      expect(Math.hypot(s.children[i].x - FOUR[i][0], s.children[i].z - FOUR[i][1])).toBeLessThan(0.01)
    }
  })

  it('turns a RUNNER onto the claimed heading while a round runs', () => {
    const s = game(FOUR)
    run(s, 1) // let a round open
    expect(s.playing).toBe(true)
    const steered = s.children.findIndex((_, i) => i !== s.chaser)
    run(s, 1.5, OPEN, CFG, 1 / 60, undefined, dueEast(steered, 3))
    const off = Math.atan2(
      Math.sin(s.children[steered].heading - Math.PI / 2),
      Math.cos(s.children[steered].heading - Math.PI / 2),
    )
    expect(Math.abs(off)).toBeLessThan(0.9) // the claim's heading, deflection allowed
  })

  it('never steers the chaser — the round belongs to it', () => {
    const s = game(FOUR)
    run(s, 1)
    const it = s.chaser
    expect(it).toBeGreaterThanOrEqual(0)
    let asked = false
    run(s, 1, OPEN, CFG, 1 / 60, undefined, (i, st) => {
      if (i === st.chaser) asked = true
      return { heading: Math.PI / 2, pace: 0 }
    })
    expect(asked).toBe(false)
  })

  it('keeps the floor pace while a round runs, whatever the claim asks for', () => {
    const s = game(FOUR)
    run(s, 1)
    const floor = floorPace(CFG)
    run(
      s,
      3,
      OPEN,
      CFG,
      1 / 60,
      (st) => {
        if (!st.playing) return
        for (const c of st.children) expect(c.pace).toBeGreaterThanOrEqual(floor - 1e-6)
      },
      () => ({ heading: 0, pace: 0 }),
    )
  })

  it('leaves every child where a walker may stand, claim or no claim', () => {
    // A hut between the group and where they are being sent: the claim decides
    // the direction, the chase's own deflection keeps them out of the wall.
    const colliders = [boxCollider(0, 0, 2, 2, 0)]
    const world = makeWorld(colliders)
    const s = game(FOUR)
    run(
      s,
      20,
      world,
      CFG,
      1 / 60,
      (st) => {
        for (const c of st.children) expect(world.blocked(c.x, c.z)).toBe(false)
      },
      (i, st) =>
        i % 2 === 0
          ? { heading: Math.atan2(-st.children[i].x, -st.children[i].z), pace: 3 }
          : null,
    )
  })
})

describe('the play ground is a disc of its own (point 481.4)', () => {
  it('keeps the children inside a ground that is NOT the settlement centre', () => {
    const centre = { x: 14, z: -14 }
    const play = 8
    const world: TagWorld = {
      radius: play,
      centerX: centre.x,
      centerZ: centre.z,
      childRadius: CHILD_R,
      blocked: (x, z) => Math.hypot(x - centre.x, z - centre.z) > play,
      nudge: (x, z) => ({ x, z, found: false }),
    }
    const s = game([
      [centre.x + 1, centre.z + 1],
      [centre.x - 2, centre.z + 2],
      [centre.x + 3, centre.z - 1],
      [centre.x - 1, centre.z - 3],
    ])
    run(s, 90, world, CFG, 1 / 60, (st) => {
      for (const c of st.children) {
        expect(Math.hypot(c.x - centre.x, c.z - centre.z)).toBeLessThanOrEqual(play + 1e-6)
      }
    })
    // And it is still a GAME in there: somebody was caught.
    expect(s.tags).toBeGreaterThan(0)
  })
})
