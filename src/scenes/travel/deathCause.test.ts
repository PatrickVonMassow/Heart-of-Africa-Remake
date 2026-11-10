// Every death has a VISIBLE cause (design.md §19.8, work-order point 326): the
// death causes are enumerated and each death function records its cause; the
// dev-assert fires on a death without one; and a staged crocodile kill followed
// by the parent's vigil ends in one of the two legitimate outcomes — the keeper
// taken by a predator that visibly walks in, or the keeper surviving to rejoin.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { balance } from '../../config/balance'
import { resetDevAsserts } from '../../systems/devAssert'
import { sinkKill } from './crocAftermath'
import {
  DEATH_ACTOR_REACH,
  DEATH_CAUSES,
  ENVIRONMENT_CAUSES,
  assertVisibleDeath,
  deathCauseVisible,
  huntHoldsCatch,
  recordDeathCause,
  tooLateDistFor,
  type DeathCause,
} from './deathCause'
import { vigilDrawReady } from './wildlifeBehavior'
import { markKilled, releaseBereavedParent, stepCaught } from './youngKill'

interface Body {
  id: string
  x: number
  z: number
  young?: boolean
  dead?: boolean
  gone?: boolean
  lionFed?: boolean
  dissolve?: number
  inWater?: number
  caught?: number
  caughtBy?: 'crocodile'
  deathCause?: DeathCause
  parent?: Body
  child?: Body
  vigil?: { x: number; z: number; carcass: Body; time: number }
  bereaved?: number
}

// Wildlife.tsx constants the staged drama mirrors.
const DT = 0.1
const CAUGHT_DURATION = 5
const CARCASS_SECONDS = 9
const PARENT_TOO_LATE_DIST = 3.2
const PARENT_SACRIFICE_DIST = 1.3
const VIGIL_HOLD_DIST = 1
const KEEPER_WALK = 1.2 // the vigil walk (YOUNG_FOLLOW_SPEED order)
const PREDATOR_SPEED = 4 // the drawn predator's approach (HUNT_LION_SPEED order)
const CATCH_DIST = 0.7 // CALF_CATCH_DIST order
const SPAWN_RING = 30 // spawned beyond the view ring

const ASSERT_CODE = 'death-without-visible-cause'

let spy: ReturnType<typeof vi.spyOn>
beforeEach(() => {
  resetDevAsserts()
  ;(window as unknown as { __assertLog?: unknown[] }).__assertLog = []
  spy = vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => spy.mockRestore())

const assertFired = () => spy.mock.calls.some((c) => String(c[0]).includes(`[ASSERT] ${ASSERT_CODE}`))

describe('the death causes (point 326)', () => {
  it('enumerates every death path once', () => {
    expect(new Set(DEATH_CAUSES).size).toBe(DEATH_CAUSES.length)
    for (const c of [
      'predator', 'crocodile', 'trample', 'drowning', 'waterfall', 'fire', 'fight', 'revenge', 'plague', 'remnant', 'staged',
    ] as const)
      expect(DEATH_CAUSES).toContain(c)
  })

  it('each cause is set on the body by the death functions', () => {
    for (const cause of DEATH_CAUSES) {
      const killed: Body = { id: 'k', x: 0, z: 0 }
      markKilled(killed, CARCASS_SECONDS, cause)
      expect(killed.dead).toBe(true)
      expect(killed.deathCause).toBe(cause)

      const sunk: Body = { id: 's', x: 0, z: 0 }
      sinkKill(sunk, CARCASS_SECONDS, cause)
      expect(sunk.dead).toBe(true)
      expect(sunk.inWater).toBe(0)
      expect(sunk.deathCause).toBe(cause)

      const recorded: Body = { id: 'r', x: 0, z: 0 }
      recordDeathCause(recorded, cause)
      expect(recorded.deathCause).toBe(cause)
    }
  })

  it('a cause with an actor is visible only while that actor is within reach', () => {
    for (const cause of DEATH_CAUSES) {
      if (cause === 'plague' || cause === 'remnant' || cause === 'staged') continue
      expect(deathCauseVisible(cause, 0)).toBe(true)
      expect(deathCauseVisible(cause, DEATH_ACTOR_REACH)).toBe(true)
      expect(deathCauseVisible(cause, DEATH_ACTOR_REACH + 0.01)).toBe(false)
      expect(deathCauseVisible(cause, null)).toBe(false)
      expect(deathCauseVisible(cause, Number.NaN)).toBe(false)
    }
  })

  it('the environment causes are the river, the falls and the flame line', () => {
    expect([...ENVIRONMENT_CAUSES].sort()).toEqual(['drowning', 'fire', 'waterfall'])
  })

  it('bodies spawned dead owe no actor; a death with no cause is never visible', () => {
    for (const cause of ['plague', 'remnant', 'staged'] as const) expect(deathCauseVisible(cause, null)).toBe(true)
    expect(deathCauseVisible(undefined, 0)).toBe(false)
    expect(deathCauseVisible(undefined, null)).toBe(false)
  })
})

describe('the dev-assert "death without a visible cause"', () => {
  it('fires on a synthetic causeless death', () => {
    const body: Body = { id: 'b', x: 3, z: 4, dead: true }
    assertVisibleDeath(body, 0, 'zebra')
    expect(assertFired()).toBe(true)
    const log = (window as unknown as { __assertLog: Array<{ code: string; detail: string }> }).__assertLog
    expect(log.some((e) => e.code === ASSERT_CODE && e.detail.includes('cause none'))).toBe(true)
  })

  it('fires on a predator death with no predator there', () => {
    const body: Body = { id: 'b', x: 0, z: 0 }
    markKilled(body, CARCASS_SECONDS, 'predator')
    assertVisibleDeath(body, null, 'zebra')
    expect(assertFired()).toBe(true)
  })

  it('fires on a crocodile death whose crocodile is far off', () => {
    const body: Body = { id: 'b', x: 0, z: 0 }
    sinkKill(body, CARCASS_SECONDS, 'crocodile')
    assertVisibleDeath(body, PARENT_TOO_LATE_DIST + 10, 'zebra')
    expect(assertFired()).toBe(true)
  })

  it('stays silent on a legitimate death', () => {
    const body: Body = { id: 'b', x: 0, z: 0 }
    markKilled(body, CARCASS_SECONDS, 'predator')
    assertVisibleDeath(body, 0.8, 'zebra')
    const drowned: Body = { id: 'd', x: 0, z: 0 }
    sinkKill(drowned, CARCASS_SECONDS, 'drowning')
    assertVisibleDeath(drowned, 0, 'zebra')
    expect(assertFired()).toBe(false)
  })
})

describe('a land catch is held only by a hunter that is there', () => {
  it('holds the hunt victim and a body within the predator reach', () => {
    expect(huntHoldsCatch(true, true, 50)).toBe(true)
    expect(huntHoldsCatch(true, false, 1)).toBe(true) // the mired calf beside the taken parent
  })
  it('releases a catch whose hunt is idle or far away', () => {
    expect(huntHoldsCatch(false, true, 0)).toBe(false)
    expect(huntHoldsCatch(true, false, DEATH_ACTOR_REACH + 1)).toBe(false)
  })
})

describe('the too-late distance (points 121/326)', () => {
  it('a land predator drags down a parent within the too-late distance', () => {
    expect(tooLateDistFor(false, PARENT_TOO_LATE_DIST, PARENT_SACRIFICE_DIST)).toBe(PARENT_TOO_LATE_DIST)
  })
  it('a crocodile takes only a parent its jaws reach', () => {
    expect(tooLateDistFor(true, PARENT_TOO_LATE_DIST, PARENT_SACRIFICE_DIST)).toBe(PARENT_SACRIFICE_DIST)
  })
})

type Outcome = 'taken-by-visible-predator' | 'survived-and-rejoined'

/**
 * Stage the user's report (25.07.2026): a crocodile seizes a calf at the
 * waterline, its parent rushes in but is still short of the jaws when the
 * struggle ends. The frame order mirrors Wildlife.tsx: the struggle countdown
 * and the kill, the parent's release, the vigil walk and its resolve, the
 * vigil's predator draw (spawned beyond the ring, walking in) and the keeper's
 * own struggle. Every death runs the dev-assert with the distance to its
 * actor. Returns which of the two legitimate endings played.
 */
function stageCrocKillThenVigil(opts: { predatorComes: boolean; parentGap: number; predatorDelay?: number }): {
  outcome: Outcome
  parent: Body
  fate: ReturnType<typeof releaseBereavedParent>
} {
  const seize = { x: 0, z: 0 } // where the crocodile seized the calf
  const croc = { x: 0.6, z: 0 } // in the water, the catch at its jaws
  const calf: Body = { id: 'calf', x: seize.x, z: seize.z, young: true, caught: CAUGHT_DURATION, caughtBy: 'crocodile' }
  const parent: Body = { id: 'parent', x: -opts.parentGap, z: 0, child: calf }
  calf.parent = parent
  let predator: { x: number; z: number } | null = null
  let fate: ReturnType<typeof releaseBereavedParent> = null

  for (let t = 0; t < 200; t += DT) {
    // The struggle and the kill — the crocodile holds the catch at its jaws.
    if (stepCaught(calf, DT)) {
      sinkKill(calf, CARCASS_SECONDS, 'crocodile')
      assertVisibleDeath(calf, Math.hypot(croc.x - calf.x, croc.z - calf.z), 'calf')
      fate = releaseBereavedParent(calf, {
        tooLateDist: tooLateDistFor(true, PARENT_TOO_LATE_DIST, PARENT_SACRIFICE_DIST),
        bereavedSeconds: balance.family.bereavedSeconds,
        vigilAt: seize,
      })
      if (fate === 'taken') {
        sinkKill(parent, CARCASS_SECONDS, 'crocodile')
        assertVisibleDeath(parent, Math.hypot(croc.x - parent.x, croc.z - parent.z), 'parent')
        return { outcome: 'taken-by-visible-predator', parent, fate }
      }
    }
    // The parent stays parked `parentGap` short of the catch: its charge has
    // not closed the gap by the time the struggle ends.
    // The river takes the body: it sinks over its dissolve window.
    if (calf.dead && calf.dissolve !== undefined && calf.dissolve > 0) calf.dissolve -= DT

    // The keeper's own struggle (a land catch by the drawn predator).
    if (parent.caught !== undefined && parent.caught > 0) {
      const pd = predator ? Math.hypot(predator.x - parent.x, predator.z - parent.z) : Infinity
      if (!huntHoldsCatch(predator !== null, true, pd)) parent.caught = undefined
      else if (stepCaught(parent, DT)) {
        markKilled(parent, CARCASS_SECONDS, 'predator')
        assertVisibleDeath(parent, pd, 'parent')
        return { outcome: 'taken-by-visible-predator', parent, fate }
      }
    }

    // The vigil: walk to the seize spot, hold, resolve on window or carcass gone.
    if (!parent.dead && parent.vigil) {
      const v = parent.vigil
      v.time += DT
      const gone = v.carcass.gone === true || (v.carcass.dissolve !== undefined && v.carcass.dissolve <= 0)
      if (v.time > balance.vigil.seconds || gone) {
        parent.vigil = undefined
        if (parent.caught === undefined) return { outcome: 'survived-and-rejoined', parent, fate }
      } else {
        const d = Math.hypot(v.x - parent.x, v.z - parent.z)
        if (d > VIGIL_HOLD_DIST) {
          parent.x += ((v.x - parent.x) / d) * KEEPER_WALK * DT
          parent.z += ((v.z - parent.z) / d) * KEEPER_WALK * DT
        }
        // The carcass draws a predator: it spawns beyond the ring and walks in.
        if (opts.predatorComes && !predator && vigilDrawReady(v.time, opts.predatorDelay ?? balance.vigil.predatorDelay))
          predator = { x: parent.x - SPAWN_RING, z: parent.z }
      }
    }
    if (predator && !parent.dead && parent.caught === undefined) {
      const dx = parent.x - predator.x
      const dz = parent.z - predator.z
      const d = Math.hypot(dx, dz)
      if (d < CATCH_DIST) {
        parent.caught = CAUGHT_DURATION
        parent.vigil = undefined // the seized keeper's watch is over
      } else {
        predator.x += (dx / d) * PREDATOR_SPEED * DT
        predator.z += (dz / d) * PREDATOR_SPEED * DT
      }
    }
  }
  throw new Error('the staged vigil never resolved')
}

describe('a staged crocodile kill then vigil ends in a legitimate outcome (point 326)', () => {
  it('the report: a parent short of the jaws is NOT killed in place — it keeps the vigil', () => {
    // 2.5 lies inside the land too-late distance (3.2): before the fix this
    // parent dropped dead at the waterline with no crocodile at it.
    const r = stageCrocKillThenVigil({ predatorComes: false, parentGap: 2.5 })
    expect(r.fate).toBe('vigil')
    expect(r.outcome).toBe('survived-and-rejoined')
    expect(r.parent.dead).toBeUndefined()
    expect(r.parent.vigil).toBeUndefined()
    expect(assertFired()).toBe(false)
  })

  it('with the shipped values the river takes the body before the draw: the keeper rejoins', () => {
    // The sinking catch is gone after its dissolve window, which ends the vigil
    // before the carcass can draw a predator — survival is the crocodile vigil's
    // ordinary ending (the second legitimate outcome).
    expect(CARCASS_SECONDS).toBeLessThan(balance.vigil.predatorDelay)
    const r = stageCrocKillThenVigil({ predatorComes: true, parentGap: 2.5 })
    expect(r.outcome).toBe('survived-and-rejoined')
    expect(r.parent.dead).toBeUndefined()
    expect(assertFired()).toBe(false)
  })

  it('a predator drawn before the body is gone takes the keeper, standing at the body', () => {
    const r = stageCrocKillThenVigil({ predatorComes: true, parentGap: 2.5, predatorDelay: 0 })
    expect(r.fate).toBe('vigil')
    expect(r.outcome).toBe('taken-by-visible-predator')
    expect(r.parent.dead).toBe(true)
    expect(r.parent.deathCause).toBe('predator')
    expect(assertFired()).toBe(false)
  })

  it('a parent the jaws do reach is taken by the crocodile, visibly', () => {
    const r = stageCrocKillThenVigil({ predatorComes: false, parentGap: 1 })
    expect(r.fate).toBe('taken')
    expect(r.outcome).toBe('taken-by-visible-predator')
    expect(r.parent.deathCause).toBe('crocodile')
    expect(assertFired()).toBe(false)
  })

  it('every gap ends in one of the two outcomes and never in a causeless death', () => {
    for (const gap of [0.5, 1, 1.29, 1.31, 2, 3, 3.19, 3.5, 8]) {
      for (const [predatorComes, predatorDelay] of [[false, undefined], [true, undefined], [true, 0]] as const) {
        const r = stageCrocKillThenVigil({ predatorComes, parentGap: gap, predatorDelay })
        expect(['taken-by-visible-predator', 'survived-and-rejoined']).toContain(r.outcome)
        if (r.parent.dead) expect(r.parent.deathCause).toBeDefined()
      }
    }
    expect(assertFired()).toBe(false)
  })
})
