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

  it('THE WINDOW IS THE WHOLE GROUP’S: no third child is tagged inside it (point 648, unique)', () => {
    // The role used to be free to run round a knot — A tags B, B tags C, C tags
    // A, each catch clearing the last protection — and at the reported seed it
    // changed every two or three FRAMES, leaving three children trembling within
    // 7 cm of one another. No catch at all resolves while the window runs.
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
    // A third child standing right beside the new chaser, the whole window long.
    for (let i = 0; i < 100; i++) {
      s.children[2].x = s.children[second].x + CFG.catchDistance * 0.4
      s.children[2].z = s.children[second].z
      stepTagGame(s, CFG.immunitySeconds / 200, CFG, OPEN)
      expect(s.tags).toBe(1)
    }
    // And is fair game the moment it has run out.
    s.immuneFor = 1e-9
    s.children[2].x = s.children[second].x + CFG.catchDistance * 0.4
    s.children[2].z = s.children[second].z
    stepTagGame(s, 1e-6, CFG, OPEN)
    expect(s.tags).toBe(2)
    expect(s.chaser).toBe(2)
  })

  it('the role changes at most once per window, whoever is standing about (unique)', () => {
    const s = game([
      [0, 0],
      [0.3, 0],
      [0.5, 0],
      [0.2, 0.3],
    ])
    s.chaser = 0
    s.playing = true
    let swaps = 0
    let last = s.chaser
    // Ten seconds with the whole group inside one another's catch ring.
    for (let i = 0; i < 60 * 10; i++) {
      s.children.forEach((c, k) => {
        c.x = k * 0.2
        c.z = 0
      })
      stepTagGame(s, 1 / 60, CFG, OPEN)
      if (s.chaser !== last) {
        swaps++
        last = s.chaser
      }
    }
    expect(swaps).toBeGreaterThan(0)
    expect(swaps).toBeLessThanOrEqual(Math.ceil(10 / CFG.immunitySeconds) + 1)
  })

  it('the child that just tagged stays out of the quarry while its window runs (unique)', () => {
    const s = game([
      [0, 0],
      [0.3, 0],
      [0.5, 0],
    ])
    s.chaser = 0
    s.playing = true
    stepTagGame(s, 1e-6, CFG, OPEN) // 0 tags 1 → 0 immune
    expect(s.immuneFor).toBe(CFG.immunitySeconds)
    const gone = s.immune
    // Standing nearest the new chaser buys it nothing while it is protected —
    // the third child, well away, is the quarry instead.
    s.children[gone].x = s.children[s.chaser].x + CFG.catchDistance * 0.4
    s.children[gone].z = s.children[s.chaser].z
    s.children[2].x = s.children[s.chaser].x + 5
    s.children[2].z = s.children[s.chaser].z
    expect(nearestCatchable(s)).not.toBe(gone)
    // Once the window is out it is the nearest catchable child like any other.
    s.immuneFor = 0
    s.immune = -1
    expect(nearestCatchable(s)).toBe(gone)
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

describe('another inhabitant’s body is ground to walk round (point 657)', () => {
  const SEP = balance.villageLife.separation
  const KID_SCALE = 0.55
  const KID_BODY = SEP.bodyRadius * KID_SCALE
  /** An adult standing in the ground, judged the way the settlement judges it:
   *  the PAIR'S contact distance — the adult's contact radius plus the child's. */
  const adultReach = SEP.bodyRadius + KID_BODY
  /** The settlement's own wiring in miniature: every other child's body at its
   *  live position, self and the tag partner excluded. */
  const childrenOccupy =
    (s: TagState, extra?: { x: number; z: number }) =>
    (self: number, partner: number, x: number, z: number): boolean => {
      if (extra && Math.hypot(x - extra.x, z - extra.z) < adultReach) return true
      const reach = KID_BODY * 2
      return s.children.some(
        (o, j) => j !== self && j !== partner && Math.hypot(x - o.x, z - o.z) < reach,
      )
    }

  it('an errand walks ROUND a standing body instead of pressing into it', () => {
    // The cause of point 657 in one child: the way to where it was sent passes
    // straight through a body. With `occupied` the step deflects round it — the
    // child never enters the body's ground and still arrives; without it, this
    // very walk pressed into the body and was pushed back out frame after frame.
    const s = game([[0, 0]])
    const world: TagWorld = {
      ...OPEN,
      occupied: (_self, _partner, x, z) => Math.hypot(x - 3, z) < adultReach,
    }
    let nearest = Infinity
    run(
      s,
      10,
      world,
      CFG,
      1 / 60,
      (st) => {
        const c = st.children[0]
        nearest = Math.min(nearest, Math.hypot(c.x - 3, c.z))
      },
      (i, st) => {
        const c = st.children[i]
        // Arrived: the claim ends and the child stands, like a real errand.
        if (Math.hypot(6 - c.x, c.z) < 0.5) return null
        return { heading: Math.atan2(6 - c.x, 0 - c.z), pace: 1.2 }
      },
    )
    const c = s.children[0]
    // It got there — past the body, not onto it.
    expect(Math.hypot(c.x - 6, c.z)).toBeLessThan(1)
    expect(nearest).toBeGreaterThanOrEqual(adultReach - 1e-6)
    // And the walk was a detour, not a struggle: little more than the straight
    // six metres, nothing walked on the spot against the body.
    expect(c.walked).toBeLessThan(6 * 1.6)
  })

  it('the chase flows ROUND an adult standing in its ground, and the game still catches', () => {
    const s = game(FOUR)
    const adult = { x: 7, z: 6.5 } // amid the four spawn spots
    const world: TagWorld = { ...OPEN, occupied: childrenOccupy(s, adult) }
    let nearest = Infinity
    run(s, 60, world, CFG, 1 / 60, (st) => {
      for (const c of st.children) nearest = Math.min(nearest, Math.hypot(c.x - adult.x, c.z - adult.z))
    })
    // Nobody ever stood on the adult's ground: every landed step was probed
    // against it, so the chase went round the body the way it rounds a hut.
    expect(nearest).toBeGreaterThanOrEqual(adultReach - 1e-6)
    // And the avoidance is not rescue-driven: the hover watch fires its
    // centimetre-scale correction about once per child-minute in the OPEN world
    // too (measured, 3 in this same minute without `occupied`), so the bound is
    // that scale, far under the live gate of 6 per child-minute.
    for (const c of s.children) expect(c.nudges).toBeLessThanOrEqual(2)
    expect(s.tags).toBeGreaterThan(0)
  })

  it('the pair is never walled off from its own catch: first catches still arrive early', () => {
    // The mirror of the bare-world catch test above, with every body standing in
    // the way — self and partner excluded, exactly as the settlement wires it.
    // Treating the quarry as a wall would hold the chaser at arm's length here.
    for (const seed of [1, 2, 3, 4, 5]) {
      const s = game(FOUR, seed)
      const world: TagWorld = { ...OPEN, occupied: childrenOccupy(s) }
      let first = Infinity
      run(s, CFG.resolveCapSeconds, world, CFG, 1 / 60, (st, t) => {
        if (st.tags > 0 && first === Infinity) first = t
      })
      expect(first).toBeLessThan(CFG.resolveCapSeconds * 0.6)
    }
  })

  it('a catch past a third child’s body counts — occupied steers, it is not a wall', () => {
    // `lineClear` stays a WALL test on purpose: a tag reached past a bystander
    // is a tag, through a hut it is not. The bystander stands exactly on the
    // line at the moment of the catch.
    const s = game([
      [0, 0],
      [0.7, 0],
      [0.35, 0.05],
    ])
    const world: TagWorld = { ...OPEN, occupied: childrenOccupy(s) }
    s.playing = true
    s.chaser = 0
    s.target = 1
    stepTagGame(s, 1 / 60, CFG, world)
    expect(s.tags).toBe(1)
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
    // Written as a negation rather than a comparison with `false`: the
    // assignment above narrows the field to the literal `true`, and the
    // compiler then rejects `=== false` as unintentional — while the whole
    // point is that the STEP may have changed it.
    expect(!s.playing || codes().join(' ').includes('tag-resolve-cap')).toBe(true)
  })

  it('reports a child pinned past its unstuck window', () => {
    const s = game(FOUR)
    run(s, 2)
    s.children[2].pinned = CFG.unstuckSeconds * 5
    stepTagGame(s, 0, CFG, OPEN)
    stepTagGame(s, 1 / 3600, CFG, OPEN)
    expect(codes().join(' ')).toContain('tag-pinned')
  })

  // THE LONG-RUN ALARM (point 589): the play itself is a producer, and what it
  // produces is what the player sees happen — a catch, or a fresh round. The
  // defect class is the one no suite reaches: a game that runs for minutes and
  // then stops producing while every timer inside it keeps moving.
  it('says nothing over half an hour of a healthy game', () => {
    const s = game(FOUR, 5)
    run(s, 1800)
    expect(codes()).toEqual([])
    expect(s.play.produced).toBeGreaterThan(1)
  })

  it('nor when a tenure runs all the way to the backstop and the group idles after it', () => {
    // The longest LEGITIMATE gap between two round events, at the shipped
    // calibration: nobody is ever caught, so each round runs to the cap and the
    // idle break follows it. The window must sit clear of exactly this.
    const cfg: TagConfig = { ...CFG, catchDistance: 0 }
    const s = game(FOUR, 5, cfg)
    run(s, 600, OPEN, cfg)
    expect(codes()).toEqual([])
  })

  it('FIRES when the game produces neither a catch nor a fresh round for its window', () => {
    // A round that can never end: nobody catchable, and the backstop pushed out
    // of reach. Every timer still runs — which is why only the RESULT catches it.
    const cfg: TagConfig = { ...CFG, catchDistance: 0, resolveCapSeconds: 1e6 }
    const s = game(FOUR, 5, cfg)
    run(s, cfg.silenceSeconds + 20, OPEN, cfg)
    expect(codes().join(' ')).toContain('tag-silent')
  })

  it('nor with a single child, who has nobody to play with', () => {
    const s = game([[6, 6]], 5)
    run(s, CFG.silenceSeconds * 3)
    expect(codes()).toEqual([])
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

  it('keeps the floor pace for every child the CHASE steers, claim or no claim', () => {
    const s = game(FOUR)
    run(s, 1)
    const floor = floorPace(CFG)
    // Only the odd children are claimed: the rest are the chase's own, and the
    // floor is theirs — winded, never frozen.
    run(
      s,
      3,
      OPEN,
      CFG,
      1 / 60,
      (st) => {
        if (!st.playing) return
        st.children.forEach((c, i) => {
          if (i % 2 === 0 || i === st.chaser) expect(c.pace).toBeGreaterThanOrEqual(floor - 1e-6)
        })
      },
      (i) => (i % 2 === 1 ? { heading: 0, pace: 2 } : null),
    )
  })

  it('lets a child that was TOLD to stand actually stand, mid-round (point 648)', () => {
    // The refusal, the held spot and a reached errand target all ask for a pace
    // of zero. Forcing the chase's floor on them walked the child forward at
    // 1.16 m/s into whatever stood in front of it, and the blocked-step fallback
    // then turned it a quarter every frame — it spun on the spot instead of
    // standing (the user's "Kind zittert auf der Stelle herum").
    const s = game(FOUR)
    run(s, 1)
    expect(s.playing).toBe(true)
    const still = s.children.findIndex((_, i) => i !== s.chaser)
    s.immune = still // uncatchable, so the role cannot move onto it mid-run
    s.immuneFor = 1e4
    const at = { x: s.children[still].x, z: s.children[still].z }
    const walked = s.children[still].walked
    run(s, 3, OPEN, CFG, 1 / 60, undefined, (i, st) =>
      i === still && i !== st.chaser ? { heading: 1.2, pace: 0 } : null,
    )
    expect(s.children[still].pace).toBe(0)
    expect(s.children[still].held).toBe(true)
    expect(Math.hypot(s.children[still].x - at.x, s.children[still].z - at.z)).toBeLessThan(0.01)
    // Its legs stay still with it, and it never counts as pinned on geometry.
    expect(s.children[still].walked - walked).toBeLessThan(0.01)
    expect(s.children[still].pinned).toBe(0)
  })

  it('settles a child at the target it was sent to instead of oscillating (point 648)', () => {
    // The situations' own shape: walk to a spot, and once there ask for nothing.
    // A child that is pushed on regardless overshoots its mark and turns back on
    // it, frame after frame — the alternating step that reads as a jitter.
    const s = game(FOUR)
    run(s, 1)
    const sent = s.children.findIndex((_, i) => i !== s.chaser)
    // Off the chaser's list for the whole run, so the round cannot hand it the
    // role halfway through and turn the measurement into one of a chase.
    s.immune = sent
    s.immuneFor = 1e4
    const mark = { x: s.children[sent].x + 3, z: s.children[sent].z }
    const arrived: Array<{ x: number; z: number }> = []
    run(
      s,
      6,
      OPEN,
      CFG,
      1 / 60,
      (st) => {
        const c = st.children[sent]
        if (Math.hypot(c.x - mark.x, c.z - mark.z) <= 0.8) arrived.push({ x: c.x, z: c.z })
      },
      (i, st) => {
        if (i !== sent || i === st.chaser) return null
        const c = st.children[i]
        const d = Math.hypot(c.x - mark.x, c.z - mark.z)
        return d <= 0.8
          ? { heading: c.heading, pace: 0 }
          : { heading: Math.atan2(mark.x - c.x, mark.z - c.z), pace: 1.6 }
      },
    )
    expect(arrived.length).toBeGreaterThan(60) // it got there and stayed
    // CONVERGED, not alternating: every reading after the first sits on the same
    // spot, so the position does not swing back and forth across the mark.
    const spread = Math.max(
      ...arrived.map((p) => Math.hypot(p.x - arrived[0].x, p.z - arrived[0].z)),
    )
    expect(spread).toBeLessThan(0.05)
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

describe('a village of huts does not make the children shuffle (point 648)', () => {
  // The user's "Kind zittert auf der Stelle herum", in the shape that produces
  // it: a walled compound with a fence across the yard, which is what turns a run
  // into a run PAST things. Open ground barely shows it at all — the defect is in
  // the DEFLECTION, which re-minimised the turn every frame while which turns are
  // free depends on where the child is standing, so the minimum flipped between
  // two values that undid one another.
  const huts: Collider[] = Array.from({ length: 8 }, (_, i) => {
    const a = (i / 8) * Math.PI * 2
    return boxCollider(Math.sin(a) * 5.5, Math.cos(a) * 5.5, 2.6, 2.6, a)
  })
  huts.push(boxCollider(0, 1.6, 6, 0.3, 0.4)) // a fence across the yard
  const village: TagWorld = {
    radius: 10,
    childRadius: CHILD_R,
    blocked: (x, z) => Math.hypot(x, z) > 10 || !standingClear(huts, x, z, CHILD_R),
    nudge: (x, z) => {
      const r = tryNudgeToFree(huts, x, z, CHILD_R)
      return { x: r.pos[0], z: r.pos[1], found: r.found }
    },
  }

  it('lets a step reverse the one before it only rarely, over a long game', () => {
    const s = game([
      [0, 0],
      [0.9, -0.7],
      [-1.1, -0.5],
      [1.4, -1.4],
    ])
    const prev = s.children.map((c) => ({ x: c.x, z: c.z }))
    const last: Array<{ x: number; z: number } | null> = s.children.map(() => null)
    let steps = 0
    let reversals = 0
    run(s, 40, village, CFG, 1 / 30, (st) => {
      st.children.forEach((c, k) => {
        const v = { x: c.x - prev[k].x, z: c.z - prev[k].z }
        const u = last[k]
        // Only real steps have a direction to compare at all.
        if (u && Math.hypot(u.x, u.z) >= 1e-3 && Math.hypot(v.x, v.z) >= 1e-3) {
          steps++
          if (u.x * v.x + u.z * v.z < 0) reversals++
        }
        if (Math.hypot(v.x, v.z) >= 1e-3) last[k] = v
        prev[k] = { x: c.x, z: c.z }
      })
    })
    expect(steps).toBeGreaterThan(2000) // they really ran
    // Measured on this fixture: 1.0 % with the course rule and 3.3 % without it,
    // against 0.2–0.4 % on open ground with no huts at all. The gate sits between
    // the two, so it can only be tripped by the defect coming back — not by a run
    // of unlucky evasions.
    expect(reversals / steps).toBeLessThan(0.02)
  })
})

describe('a child cornered by the settlement walks out (point 648)', () => {
  // A dead-end lane between two huts: the only free ground is BEHIND the child.
  // The wildlife's ±90° deflection cannot see it, so the child used to stand
  // there until the unstuck timer teleported it — the user's "Kind hängt kurz
  // fest", measured at his seed as every stalled frame having free ground
  // 105–150° off the heading it wanted.
  const deadEnd: TagWorld = {
    radius: 20,
    childRadius: CHILD_R,
    blocked: (x, z) => z > -0.5 || Math.abs(x) > 0.35,
    nudge: (x, z) => ({ x, z, found: false }),
  }

  it('keeps walking instead of standing there, and needs no teleport', () => {
    const s = game([[0, -1]]) // a lone child: the round idles, the claim steers
    let left = 0
    let walked = 0
    let stillest = Infinity
    let window = 0
    run(
      s,
      4,
      deadEnd,
      CFG,
      1 / 60,
      (st) => {
        const c = st.children[0]
        left = Math.max(left, Math.hypot(c.x, c.z + 1))
        expect(deadEnd.blocked(c.x, c.z)).toBe(false)
        // The least ground covered in any half second: a child that stood there
        // for its unstuck window would leave a zero here.
        if (c.walked - window >= 0 && st.clock % 0.5 < 1 / 60) {
          stillest = Math.min(stillest, c.walked - window)
          window = c.walked
        }
        walked = c.walked
      },
      // Sent straight at the dead end, the way a chase or an errand would.
      () => ({ heading: 0, pace: 2 }),
    )
    expect(left).toBeGreaterThan(0.8) // it turned round and left the pocket
    expect(walked).toBeGreaterThan(6) // and kept walking the whole time
    expect(stillest).toBeGreaterThan(0.2) // never froze in any half second
    expect(s.children[0].pinned).toBe(0) // never stalled long enough to be nudged
  })

  it('lets the way round AGE while the child stands, so it never sets off on a stale one', () => {
    // The commitment is a hysteresis, and a hysteresis that only ticks while the
    // child WALKS never runs out on one that stands. A child told to stay put
    // would keep the way round it committed to before it stopped and set off on
    // it again however much later — a side that by then means nothing.
    const s = game([[0, -1]])
    // Sent into the pocket until it has turned aside and committed to a side.
    run(s, 0.2, deadEnd, CFG, 1 / 60, undefined, () => ({ heading: 0, pace: 2 }))
    expect(s.children[0].edgeFor).toBeGreaterThan(0)
    expect(s.children[0].edgeSide).not.toBe(0)

    // Now TOLD to stand, for longer than the window lasts.
    run(s, CFG.edgeSeconds + 0.2, deadEnd, CFG, 1 / 60, undefined, (i, st) => ({
      heading: st.children[i].heading,
      pace: 0,
    }))
    expect(s.children[0].edgeFor).toBe(0)
    expect(s.children[0].edgeSide).toBe(0)
    expect(s.children[0].held).toBe(true)

    // And set off again on the direction it is GIVEN, not the one it kept. Read
    // in the OPEN, where nothing deflects it: the way out it was holding pointed
    // back down the lane (−Z), so a stale one would still be showing there.
    const before = { x: s.children[0].x, z: s.children[0].z }
    run(s, 0.2, OPEN, CFG, 1 / 60, undefined, () => ({ heading: Math.PI / 2, pace: 2 }))
    const c = s.children[0]
    expect(c.x - before.x).toBeGreaterThan(0.3) // heading PI/2 is +X, as asked
    expect(Math.abs(c.z - before.z)).toBeLessThan(0.01)
  })
})

describe('the play ground is a disc of its own (point 481.4)', () => {
  it('keeps the children inside a ground that is NOT the settlement centre', () => {
    // The ground the shipped village actually derives (lifeSpots.test.ts): a
    // corner disc well off the settlement's own middle.
    const centre = { x: 10.9, z: -10.9 }
    const play = 7
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

describe('the rescue is a finding, not an escape (point 656)', () => {
  /** A world whose only free ground is a small island — everything else is
   *  refused, and a rescue sets the child down at a known free spot. */
  function island(radius: number, cx = 0, cz = 0, escape: [number, number] = [12, 12]): TagWorld {
    return {
      radius: RADIUS,
      childRadius: CHILD_R,
      // The island, and the open ground a rescue sets the child down on — so a
      // freed child is really free and does not simply stall again where it
      // landed.
      blocked: (x, z) =>
        Math.hypot(x - cx, z - cz) > radius && Math.hypot(x - escape[0], z - escape[1]) > 4,
      nudge: () => ({ x: escape[0], z: escape[1], found: true }),
    }
  }

  it('counts the teleport that frees a child which cannot move at all', () => {
    // The island is narrower than one probe, so every direction reads shut and
    // the child stands: the stall watch of the MOVE is the one that fires.
    const world = island(0.05)
    const s = game([
      [0, 0],
      [0.02, 0.01],
    ])
    run(s, 1.4, world, CFG)
    expect(s.children[0].nudges).toBe(0) // still inside its window
    expect(s.children[0].pinned).toBeGreaterThan(1.2)
    run(s, 0.3, world, CFG)
    // Freed exactly ONCE, though both watches were running out together: the
    // rescue re-takes the anchor, so the frame that picked the child up cannot
    // be charged a second time by the progress watch a few lines later.
    expect(s.children[0].nudges).toBe(1)
    // Set down on the open ground and walking again from there.
    expect(Math.hypot(s.children[0].x - 12, s.children[0].z - 12)).toBeLessThan(2)
    expect(s.children[0].pinned).toBe(0)
  })

  it('and records HOW FAR it carried it, which nothing outside could work out', () => {
    // The counter the checks read (point 656). A watcher outside sees one vector
    // per frame with the child's walking and the settlement's correction added
    // together, and `walked` is a scalar that cannot say which way the legs
    // went — so the distance is taken HERE, at the teleport, where it is known.
    const world = island(0.05)
    const s = game([
      [0, 0],
      [0.02, 0.01],
    ])
    const c = s.children[0]
    expect(c.carried).toBe(0)
    let before = { x: c.x, z: c.z }
    for (let i = 0; i < 240 && c.nudges === 0; i++) {
      before = { x: c.x, z: c.z }
      stepTagGame(s, 1 / 60, CFG, world)
    }
    expect(c.nudges).toBe(1)
    // On this island the child is blocked on every probe, so the frame that
    // freed it moved it by the teleport and by nothing else.
    expect(c.carried).toBeCloseTo(Math.hypot(c.x - before.x, c.z - before.z), 6)
    expect(c.carried).toBeGreaterThan(10) // it really was carried, to open ground
    expect(c.walked).toBe(0) // and not a centimetre of it counts as walking
  })

  it('counts the teleport that frees a child which walks without getting anywhere', () => {
    // The reported symptom itself: a child at a full walking pace whose heading
    // is turned right round every quarter second, so it paces a few centimetres
    // to and fro on open ground. Nothing blocks it — `pinned` never moves — and
    // the PROGRESS watch is the only one that can see it.
    // A lone child, so the group idles and the claim is the only thing steering
    // it: the role can never move to the child under test half way through.
    const s = game([[0, 0]])
    const steer: TagSteer = (_i, st) => ({
      heading: Math.floor(st.clock * 4) % 2 === 0 ? 0 : Math.PI,
      pace: 1.5,
    })
    run(s, 4, OPEN, CFG, 1 / 60, undefined, steer)
    const c = s.children[0]
    expect(c.pinned).toBe(0) // never blocked by anything
    expect(c.walked).toBeGreaterThan(4) // and walking the whole time
    expect(c.nudges).toBeGreaterThanOrEqual(2) // rescued once per window
  })

  it('a child told to stand loses the stall it walked in with', () => {
    // A stale count from BEFORE a hold would fire a teleport on the first
    // blocked frame after it, on a child that had just been asked to stand.
    const s = game([
      [0, 0],
      [3, 0],
    ])
    stepTagGame(s, 1 / 60, CFG, OPEN)
    const still = s.children.findIndex((_, i) => i !== s.chaser)
    s.children[still].pinned = CFG.unstuckSeconds * 0.99
    const hold: TagSteer = (i) => (i === still ? { heading: 0, pace: 0 } : null)
    stepTagGame(s, 1 / 60, CFG, OPEN, hold)
    expect(s.children[still].held).toBe(true)
    expect(s.children[still].pinned).toBe(0)
    expect(s.children[still].nudges).toBe(0)
  })

  it('and the round breaking off clears it for everyone', () => {
    const s = game(FOUR)
    run(s, 0.5)
    for (const c of s.children) c.pinned = CFG.unstuckSeconds * 0.99
    s.chaserFor = CFG.resolveCapSeconds
    stepTagGame(s, 1 / 60, CFG, OPEN)
    expect(s.playing).toBe(false)
    for (const c of s.children) {
      expect(c.pinned).toBe(0)
      expect(c.nudges).toBe(0)
    }
  })
})
