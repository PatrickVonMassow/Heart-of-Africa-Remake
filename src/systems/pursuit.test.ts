// The pursue-and-evade stamina core (work-order 480/351). Everything here is
// pure, so the whole mechanic is pinned in the fast layer: the CURVE that says
// what a mover can do, the two THRESHOLDS that say what it chooses, and the
// bookkeeping of the reserve between them.

import { describe, expect, it } from 'vitest'
import {
  advanceReserve,
  blendHeading,
  chaserPresses,
  chooseEffort,
  CURVE_MAX_SLOPE,
  easeTrend,
  effortPace,
  evadeHeading,
  floorPace,
  headingToward,
  paceCap,
  pressState,
  recoverPace,
  runnerPresses,
  smoothstep,
  topPace,
  trotPace,
  type StaminaProfile,
} from './pursuit'
import { balance } from '../config/balance'

const P: StaminaProfile = {
  sprintSpeed: 4,
  runnerBoost: 1.2,
  trotFactor: 0.5,
  recoverFactor: 0.35,
  floorFactor: 0.3,
  drainPerSecond: 0.2,
  recoverPerSecond: 0.1,
  breakOff: 0.42,
  resume: 0.75,
}

describe('the pace curve — what a child CAN do (design.md §19.10)', () => {
  it('hits its endpoints EXACTLY: the floor at empty, the role top at full', () => {
    expect(paceCap(0, P, 'chaser')).toBe(floorPace(P))
    expect(paceCap(1, P, 'chaser')).toBe(topPace(P, 'chaser'))
    expect(paceCap(0, P, 'runner')).toBe(floorPace(P))
    expect(paceCap(1, P, 'runner')).toBe(topPace(P, 'runner'))
  })

  it('is monotone in the reserve over a thousand levels', () => {
    let prev = -Infinity
    for (let i = 0; i <= 1000; i++) {
      const v = paceCap(i / 1000, P, 'runner')
      expect(v).toBeGreaterThanOrEqual(prev)
      prev = v
    }
  })

  it('never jumps more than a bounded step between neighbouring levels — no snap', () => {
    const span = topPace(P, 'runner') - floorPace(P)
    const d = 1e-3
    const bound = CURVE_MAX_SLOPE * span * d + 1e-12
    for (let i = 0; i < 1000; i++) {
      const a = paceCap(i * d, P, 'runner')
      const b = paceCap((i + 1) * d, P, 'runner')
      expect(Math.abs(b - a)).toBeLessThanOrEqual(bound)
    }
  })

  it('clamps a reserve that drifted out of range instead of extrapolating', () => {
    expect(paceCap(-0.01, P, 'runner')).toBe(floorPace(P))
    expect(paceCap(1.01, P, 'runner')).toBe(topPace(P, 'runner'))
    expect(Number.isNaN(paceCap(NaN, P, 'runner'))).toBe(false)
    expect(paceCap(NaN, P, 'runner')).toBe(floorPace(P))
  })

  it('smoothstep is the shape: 0 at 0, 1 at 1, clamped outside', () => {
    expect(smoothstep(0)).toBe(0)
    expect(smoothstep(1)).toBe(1)
    expect(smoothstep(-5)).toBe(0)
    expect(smoothstep(5)).toBe(1)
    expect(smoothstep(0.5)).toBeCloseTo(0.5, 12)
  })

  it('pins the two orderings the spec demands: a fresh runner is faster, a spent one slower', () => {
    // A FRESH runner outruns a fresh chaser, so a catch is never immediate…
    expect(paceCap(1, P, 'runner')).toBeGreaterThan(paceCap(1, P, 'chaser'))
    // …while a SPENT runner is strictly slower than a fresh chaser, so it is
    // reachable. Both roles share the floor, so being spent is being caught.
    expect(paceCap(0, P, 'runner')).toBeLessThan(paceCap(1, P, 'chaser'))
    expect(paceCap(0, P, 'runner')).toBe(paceCap(0, P, 'chaser'))
    for (let i = 1; i <= 100; i++) {
      const r = i / 100
      expect(paceCap(r, P, 'runner')).toBeGreaterThan(paceCap(r, P, 'chaser'))
    }
  })

  it('the per-child spread cannot invert those orderings, because it never touches a pace', () => {
    // The variation is applied to the drain and recovery RATES and to the
    // opening reserve — never to sprintSpeed, runnerBoost or the factors. So the
    // orderings above hold for every child by construction; this test states it
    // where a future edit would trip over it.
    const spread = (v: number) => ({ ...P, drainPerSecond: P.drainPerSecond * v, recoverPerSecond: P.recoverPerSecond * v })
    for (const v of [0.5, 1, 2]) {
      const q = spread(v)
      expect(paceCap(1, q, 'runner')).toBe(paceCap(1, P, 'runner'))
      expect(paceCap(0, q, 'runner')).toBe(paceCap(0, P, 'chaser'))
    }
  })
})

describe('the effort pace — the curve holds the intent down and the floor holds it up', () => {
  it('a sprint at an empty reserve is no faster than the floor', () => {
    expect(effortPace('sprint', 0, P, 'runner')).toBe(floorPace(P))
  })

  it('a near-empty child dropping to a cruise never snaps UP to the full trot', () => {
    const r = 0.05
    expect(effortPace('cruise', r, P, 'runner')).toBeLessThanOrEqual(paceCap(r, P, 'runner'))
    expect(effortPace('cruise', r, P, 'runner')).toBeLessThan(trotPace(P))
  })

  it('a fresh child runs its intent: sprint, trot and recovery pace as stated', () => {
    expect(effortPace('sprint', 1, P, 'runner')).toBe(topPace(P, 'runner'))
    expect(effortPace('cruise', 1, P, 'runner')).toBe(trotPace(P))
    expect(effortPace('recover', 1, P, 'runner')).toBe(recoverPace(P))
  })

  it('the recovery pace is slow enough to refill and never below the floor', () => {
    expect(recoverPace(P)).toBeLessThan(trotPace(P))
    expect(recoverPace(P)).toBeGreaterThanOrEqual(floorPace(P))
    // Even with a recoverFactor set below the floor by a debug edit.
    expect(recoverPace({ ...P, recoverFactor: 0.01 })).toBe(floorPace(P))
  })

  it('never returns anything below the floor, at any reserve or effort', () => {
    for (const e of ['sprint', 'cruise', 'recover'] as const) {
      for (let i = 0; i <= 20; i++) {
        expect(effortPace(e, i / 20, P, 'runner')).toBeGreaterThanOrEqual(floorPace(P))
      }
    }
  })
})

describe('the reserve — spent at speed, refilled at a trot or standing', () => {
  it('drains above the trot and refills at or below it (the boundary refills)', () => {
    expect(advanceReserve(0.5, trotPace(P) + 1e-6, 1, P)).toBeLessThan(0.5)
    expect(advanceReserve(0.5, trotPace(P), 1, P)).toBeGreaterThan(0.5)
    expect(advanceReserve(0.5, trotPace(P) - 1e-6, 1, P)).toBeGreaterThan(0.5)
    expect(advanceReserve(0.5, 0, 1, P)).toBeGreaterThan(0.5)
  })

  it('the drain follows the pace ACTUALLY run, so the faster runner burns faster', () => {
    const runner = advanceReserve(1, topPace(P, 'runner'), 1, P)
    const chaser = advanceReserve(1, topPace(P, 'chaser'), 1, P)
    expect(runner).toBeLessThan(chaser)
  })

  it('a child whose curve has capped it at or below the trot REFILLS — the exhausted-forever hole', () => {
    // The reserve at which the curve meets the trot: a child "sprinting" there
    // is not running flat out any more. Keying the drain to the intent instead
    // of the pace would pin it at empty for the rest of the round.
    let r = 0.02
    const pace = effortPace('sprint', r, P, 'runner')
    expect(pace).toBeLessThanOrEqual(trotPace(P))
    r = advanceReserve(r, pace, 0.5, P)
    expect(r).toBeGreaterThan(0.02)
  })

  it('never leaves [0,1] under ten thousand adversarial ticks', () => {
    let r = 0.5
    let seed = 7
    const rand = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 0x100000000)
    for (let i = 0; i < 10000; i++) {
      const dt = 1 / 120 + rand() * (0.1 - 1 / 120)
      const pace = rand() * topPace(P, 'runner') * 1.5
      r = advanceReserve(r, pace, dt, P, 1 + rand(), 1 + rand())
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThanOrEqual(1)
    }
  })

  it('holds at the ends: empty stays empty under a sprint, full stays full at rest', () => {
    expect(advanceReserve(0, topPace(P, 'runner'), 10, P)).toBe(0)
    expect(advanceReserve(1, 0, 10, P)).toBe(1)
  })

  it('dt = 0 (and a negative dt) changes nothing', () => {
    expect(advanceReserve(0.4, topPace(P, 'runner'), 0, P)).toBe(0.4)
    expect(advanceReserve(0.4, topPace(P, 'runner'), -1, P)).toBe(0.4)
  })

  it('honours the per-child rate spread', () => {
    const fast = advanceReserve(0.5, 0, 1, P, 1, 2)
    const slow = advanceReserve(0.5, 0, 1, P, 1, 1)
    expect(fast - 0.5).toBeCloseTo((slow - 0.5) * 2, 10)
  })

  it('integrates the same amount of sim time whatever the frame length', () => {
    // The mechanic must not play differently on a slow machine: the reserve is
    // a function of elapsed SIM time, not of a frame count.
    const run = (dt: number) => {
      let r = 1
      for (let t = 0; t < 5 - 1e-9; t += dt) r = advanceReserve(r, topPace(P, 'chaser'), dt, P)
      return r
    }
    expect(run(1 / 60)).toBeCloseTo(run(1 / 30), 6)
  })
})

describe('the two thresholds — what a child CHOOSES (hysteresis, never one boundary)', () => {
  it('breaks off exactly AT the low threshold and not a hair above it', () => {
    expect(pressState('press', P.breakOff, P)).toBe('recover')
    expect(pressState('press', P.breakOff + 1e-9, P)).toBe('press')
  })

  it('resumes exactly AT the high threshold and not a hair below it', () => {
    expect(pressState('recover', P.resume, P)).toBe('press')
    expect(pressState('recover', P.resume - 1e-9, P)).toBe('recover')
  })

  it('keeps whatever entered the band, from BOTH sides', () => {
    const mid = (P.breakOff + P.resume) / 2
    expect(pressState('press', mid, P)).toBe('press')
    expect(pressState('recover', mid, P)).toBe('recover')
  })

  it('a reserve trembling about the low threshold cannot flap the state', () => {
    let st = pressState('press', P.breakOff - 1e-6, P)
    expect(st).toBe('recover')
    let flips = 0
    for (let i = 0; i < 1000; i++) {
      const r = P.breakOff + (i % 2 === 0 ? 1e-6 : -1e-6)
      const next = pressState(st, r, P)
      if (next !== st) flips++
      st = next
    }
    // Only the crossings of the LOW threshold count, and the band above it holds
    // the recovering state — so the state never oscillates frame by frame.
    expect(flips).toBe(0)
  })

  it('survives thresholds a debug edit has put in the wrong order', () => {
    const bad = { ...P, breakOff: 0.8, resume: 0.2 }
    let st: 'press' | 'recover' = 'press'
    let flips = 0
    for (let i = 0; i < 200; i++) {
      const next = pressState(st, 0.5, bad)
      if (next !== st) flips++
      st = next
    }
    expect(flips).toBeLessThanOrEqual(1) // settles, never oscillates
    expect(st).toBe('recover')
    expect(pressState('recover', 0.85, bad)).toBe('press')
  })

  it('RECOVERY IS ITS OWN INTENTION — pressure never overrides it', () => {
    expect(chooseEffort('recover', true)).toBe('recover')
    expect(chooseEffort('press', true)).toBe('sprint')
    expect(chooseEffort('press', false)).toBe('cruise')
  })

  it('a child driven to empty under constant pressure RECOVERS and sprints again', () => {
    // The regression witness for the exhausted-forever case: simulated forward
    // with the pressure never letting up.
    let r = 1
    let st: 'press' | 'recover' = 'press'
    const dt = 1 / 60
    let sawRecoveryPace = false
    let passedResume = false
    let sprintedAgain = false
    for (let i = 0; i < 60 * 200; i++) {
      st = pressState(st, r, P)
      const effort = chooseEffort(st, true)
      const pace = effortPace(effort, r, P, 'runner')
      if (effort === 'recover') sawRecoveryPace = true
      if (sawRecoveryPace && r >= P.resume) passedResume = true
      if (passedResume && effort === 'sprint' && pace > trotPace(P)) sprintedAgain = true
      r = advanceReserve(r, pace, dt, P)
    }
    expect(sawRecoveryPace).toBe(true)
    expect(passedResume).toBe(true)
    expect(sprintedAgain).toBe(true)
  })
})

describe('who sprints: the runner under pressure, the chaser while it is closing', () => {
  it('the runner sprints exactly AT the pressure distance and not beyond it', () => {
    expect(runnerPresses(9, 9)).toBe(true)
    expect(runnerPresses(9 + 1e-9, 9)).toBe(false)
  })

  it('the chaser never presses a target beyond its reach, whatever the trend', () => {
    expect(chaserPresses(true, 20, -5, 14, 0.05, 0.3)).toBe(false)
    expect(chaserPresses(false, 20, -5, 14, 0.05, 0.3)).toBe(false)
  })

  it('it opens a burst when the gap has stopped growing — a steady chase trends at zero', () => {
    expect(chaserPresses(false, 5, 0, 14, 0.05, 0.3)).toBe(true)
    expect(chaserPresses(false, 5, -0.5, 14, 0.05, 0.3)).toBe(true)
  })

  it('and CRUISES when the gap is clearly running away — which is how it refills', () => {
    expect(chaserPresses(true, 5, 0.4, 14, 0.05, 0.3)).toBe(false)
  })

  it('the trend band keeps the previous decision, from both sides', () => {
    expect(chaserPresses(true, 5, 0.2, 14, 0.05, 0.3)).toBe(true)
    expect(chaserPresses(false, 5, 0.2, 14, 0.05, 0.3)).toBe(false)
  })

  it('the trend ease is bounded, monotone toward the sample and a no-op at dt 0', () => {
    expect(easeTrend(0, 2, 0, 0.6)).toBe(0)
    const a = easeTrend(0, 2, 1 / 60, 0.6)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(2)
    let v = 0
    for (let i = 0; i < 600; i++) v = easeTrend(v, 2, 1 / 60, 0.6)
    expect(v).toBeCloseTo(2, 3)
  })
})

describe('headings', () => {
  it('points at the target in the codebase convention (direction = sin h, cos h)', () => {
    const h = headingToward(0, 0, 0, 5)
    expect(Math.sin(h)).toBeCloseTo(0, 9)
    expect(Math.cos(h)).toBeCloseTo(1, 9)
    const g = headingToward(0, 0, 5, 0)
    expect(Math.sin(g)).toBeCloseTo(1, 9)
    expect(Math.cos(g)).toBeCloseTo(0, 9)
  })

  it('a coincident target keeps the fallback instead of an arbitrary atan2(0,0)', () => {
    expect(headingToward(2, 3, 2, 3, 1.234)).toBe(1.234)
  })

  it('blends the short way round and clamps its parameter', () => {
    expect(blendHeading(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4, 9)
    // Across the ±π seam: from 3.0 rad to −3.0 rad the short way is +0.28 rad.
    const b = blendHeading(3.0, -3.0, 1)
    expect(Math.sin(b)).toBeCloseTo(Math.sin(-3.0), 9)
    expect(blendHeading(0, 1, -1)).toBe(0)
    expect(blendHeading(0, 1, 5)).toBe(1)
  })

  it('a runner in the open flees straight away from the chaser', () => {
    const h = evadeHeading(0, 0, 0, -3, 28)
    expect(Math.sin(h)).toBeCloseTo(0, 6)
    expect(Math.cos(h)).toBeCloseTo(1, 6)
  })

  it('and is pulled back toward open ground as it nears the rim', () => {
    // Standing far out at +x with the chaser inside it: the pure away-heading
    // would run it off the edge, so the heading must turn inward.
    const away = headingToward(20, 0, 27, 0)
    const h = evadeHeading(27, 0, 20, 0, 28)
    expect(Math.abs(Math.atan2(Math.sin(h - away), Math.cos(h - away)))).toBeGreaterThan(0.3)
    // A step along it moves the child inward rather than further out.
    expect(Math.hypot(27 + Math.sin(h) * 0.5, Math.cos(h) * 0.5)).toBeLessThan(27.5)
  })
})

describe('the shipped calibration (design.md §21.2 — every value debug-editable)', () => {
  const t = balance.villageLife.tag

  it('states a coherent set of paces and thresholds', () => {
    expect(t.runnerBoost).toBeGreaterThan(1)
    expect(t.floorFactor).toBeGreaterThan(0)
    expect(t.floorFactor).toBeLessThan(t.recoverFactor)
    expect(t.recoverFactor).toBeLessThan(t.trotFactor)
    expect(t.trotFactor).toBeLessThan(1)
    expect(t.breakOff).toBeGreaterThan(0)
    expect(t.breakOff).toBeLessThan(t.resume)
    expect(t.resume).toBeLessThan(1)
    expect(t.catchDistance).toBeGreaterThan(0)
    expect(t.catchDistance).toBeLessThan(t.pressureDistance)
    expect(t.pressureDistance).toBeLessThan(t.chaseReach)
    expect(t.immunitySeconds).toBeGreaterThan(0)
    expect(t.drainPerSecond).toBeGreaterThan(0)
    expect(t.recoverPerSecond).toBeGreaterThan(0)
    expect(t.trendEnter).toBeLessThan(t.trendLeave)
    expect(t.trendEnter).toBeGreaterThanOrEqual(0) // a steady chase must still open a burst
  })

  it('puts the break-off threshold ABOVE the reserve at which EITHER role meets the trot', () => {
    // Below that reserve a child refills again (the drain follows the pace it
    // actually runs), so it settles into an equilibrium there. With the
    // threshold underneath it, a child would hover just above the trot and never
    // visibly break off to recover — the decision would never confirm what the
    // picture has been showing, and the chaser would never give up and puff.
    for (const role of ['chaser', 'runner'] as const) {
      let meets = 1
      for (let i = 0; i <= 1000; i++) {
        const r = i / 1000
        if (paceCap(r, t, role) >= trotPace(t)) {
          meets = r
          break
        }
      }
      expect(t.breakOff).toBeGreaterThan(meets)
    }
  })

  it('cannot let a catch be stepped over in one clamped frame', () => {
    // The frame delta is clamped at 0.1 s everywhere in the scene; the fastest a
    // child can travel in one is well inside the catch ring, so no frame can
    // miss a catch that happened between two of them.
    expect(topPace(t, 'runner') * 0.1).toBeLessThan(t.catchDistance)
  })
})
