// The pure contract for the adults' teaching work (work-order 688/1051): DIG
// is an invitation beside a person, a shared walk, a second utterance beside a
// site, and only then a two-person bout whose strokes alter that site.

import { describe, expect, it, vi } from 'vitest'
import {
  ADULT_CONCEPTS,
  ADULT_SITUATIONS,
  carryOf,
  clearTask,
  createAdultWork,
  digProgressOf,
  digStrikeCrossed,
  goalOf,
  isDigging,
  stepAdultWork,
  taskOf,
  CASTABLE_SITUATIONS,
  JOIN_STAND_OFF,
  jarsOnStand,
  WORK_ARRIVE_RADIUS,
  arriveRadiusOf,
  FILL_ARRIVE_RADIUS,
  type AdultWorkConfig,
  type AdultWorkState,
  type AdultWorkView,
  type SpokenWord,
} from './adultWork'
import { CONCEPT_IDS } from '../../communication/lexicon'
import { DIG_CYCLE_SECONDS } from '../../render/gesture'
import { resetDevAsserts } from '../../systems/devAssert'

const CFG: AdultWorkConfig = {
  intervalSeconds: 1,
  intervalSpread: 0,
  dwellSeconds: 2,
  digSeconds: 6,
  errandSeconds: 90,
  stallSeconds: 20,
  pace: 1.25,
  fillSeconds: 2,
  standCapacity: 3,
}

const HEAD = { x: 12, z: 0 }
const FOOT = { x: 34, z: -6 }
/** The village water stand, and the water itself a step past the foot. */
const STAND = { x: -1.1, z: 3.9 }
const FILL = { x: 36, z: -6.4 }

function view(
  n: number,
  at?: Array<{ x: number; z: number }>,
  standable: (x: number, z: number) => boolean = () => true,
  childrenHear: (x: number, z: number) => boolean = () => false,
  invitationClear: (x: number, z: number) => boolean = () => true,
): AdultWorkView {
  return {
    villagers: Array.from({ length: n }, (_, i) => ({
      x: at?.[i]?.x ?? i * 0.6,
      z: at?.[i]?.z ?? i * 0.4,
      free: true,
    })),
    geography: {
      waterHead: { ...HEAD },
      waterFoot: { ...FOOT },
      waterStand: { ...STAND },
      waterFill: { ...FILL },
      digSites: [
        { x: -11, z: 2, kind: 'pit' },
        { x: -16, z: -1, kind: 'postHole' },
        { x: -4, z: -19, kind: 'patch' },
      ],
    },
    standable,
    invitationClear,
    childrenHear,
  }
}

function walkFrame(state: AdultWorkState, v: AdultWorkView, dt: number): void {
  for (let i = 0; i < v.villagers.length; i++) {
    const me = v.villagers[i]
    const task = taskOf(state, i)
    me.free = !task
    if (!task || task.arrived) continue
    const to = goalOf(task)
    const d = Math.hypot(to.x - me.x, to.z - me.z)
    // He STOPS where the scene stops him: `PlaceLife` halts the walk at the same
    // arrival radius the scheduler judges by, so a leg that arrives here arrives
    // in the game too (work-order 1065).
    if (d <= arriveRadiusOf(task)) continue
    const step = Math.min(d, CFG.pace * dt)
    me.x += ((to.x - me.x) / d) * step
    me.z += ((to.z - me.z) / d) * step
  }
}

interface SeenWord extends SpokenWord {
  at: { x: number; z: number }
  phases: Array<string | null>
  digging: boolean[]
}

function run(v: AdultWorkView, seconds: number, cfg = CFG): { state: AdultWorkState; words: SeenWord[] } {
  const state = createAdultWork(v.villagers.length, cfg)
  const words: SeenWord[] = []
  const dt = 1 / 60
  for (let elapsed = 0; elapsed < seconds; elapsed += dt) {
    walkFrame(state, v, dt)
    const word = stepAdultWork(state, v, dt, cfg, () => 0.5)
    if (word) {
      words.push({
        ...word,
        at: { x: v.villagers[word.speaker].x, z: v.villagers[word.speaker].z },
        phases: state.tasks.map((task) => task?.phase ?? null),
        digging: state.tasks.map((_, i) => isDigging(state, i)),
      })
    }
  }
  return { state, words }
}

function riverless(v: AdultWorkView): AdultWorkView {
  v.geography.waterHead = null
  v.geography.waterFoot = null
  v.geography.waterStand = null
  v.geography.waterFill = null
  return v
}

function stageDig(v: AdultWorkView): AdultWorkState {
  const state = createAdultWork(v.villagers.length, CFG)
  stepAdultWork(state, v, CFG.intervalSeconds, CFG, () => 0.5)
  return state
}

function initiatorOf(state: AdultWorkState): number {
  return state.tasks.findIndex((task) => task?.role === 'initiator')
}

function putAtGoal(state: AdultWorkState, v: AdultWorkView, index: number): void {
  const goal = goalOf(taskOf(state, index)!)
  v.villagers[index].x = goal.x
  v.villagers[index].z = goal.z
}

function threeWordsDue(): { state: AdultWorkState; v: AdultWorkView } {
  const v = view(5, [
    { ...HEAD },
    { x: 5, z: 5 },
    { x: 5, z: 5.5 },
    { x: -16, z: -1 },
    { x: -13.6, z: -1 },
  ])
  const state = createAdultWork(5, CFG)
  state.next = Number.POSITIVE_INFINITY
  state.tasks[0] = {
    situation: 'water-back', phase: 'walk', carry: 'fullJar', role: 'worker', partner: null, siteIndex: null,
    x: HEAD.x, z: HEAD.z, arrived: false, dug: 0, owes: true,
    say: { at: HEAD, aim: FOOT }, via: null, age: 0,
  }
  state.tasks[1] = {
    situation: 'dig-first', phase: 'invite', carry: 'digTool', role: 'initiator', partner: 2, siteIndex: 0,
    x: v.villagers[2].x, z: v.villagers[2].z, arrived: true, dug: 0, owes: true,
    say: null, via: null, age: 0,
  }
  state.tasks[2] = {
    situation: 'dig-first', phase: 'invite', carry: 'digTool', role: 'partner', partner: 1, siteIndex: 0,
    x: -8.6, z: 2, arrived: true, dug: 0, owes: false,
    say: null, via: null, age: 0,
  }
  state.tasks[3] = {
    situation: 'dig-second', phase: 'site', carry: 'digTool', role: 'initiator', partner: 4, siteIndex: 1,
    x: -16, z: -1, arrived: true, dug: 0, owes: true,
    say: null, via: null, age: 0,
  }
  state.tasks[4] = {
    situation: 'dig-second', phase: 'site', carry: 'digTool', role: 'partner', partner: 3, siteIndex: 1,
    x: -13.6, z: -1, arrived: true, dug: 0, owes: false,
    say: null, via: null, age: 0,
  }
  return { state, v }
}

describe('the adults keep to their four teaching situations', () => {
  it('owns only RIVER and DIG, with two situations for each', () => {
    expect([...ADULT_CONCEPTS].sort()).toEqual(['DIG', 'RIVER'])
    for (const concept of ADULT_CONCEPTS) expect(CONCEPT_IDS).toContain(concept)
    expect(ADULT_SITUATIONS.filter((id) => id.startsWith('water-'))).toHaveLength(2)
    expect(ADULT_SITUATIONS.filter((id) => id.startsWith('dig-'))).toHaveLength(2)
  })

  it('leaves the direction words and ROCK to the children', () => {
    for (const concept of ADULT_CONCEPTS) expect(['UPSTREAM', 'DOWNSTREAM', 'ROCK']).not.toContain(concept)
  })
})

describe('RIVER is a dispatch, not a commentary (work-order 1065)', () => {
  it('speaks BOTH words at the village water stand, and NOTHING at the water', () => {
    const { words } = run(view(6), 240)
    const river = words.filter((word) => word.concept === 'RIVER')
    expect(new Set(river.map((word) => word.id))).toEqual(new Set(['water-out', 'water-back']))
    for (const word of river) {
      expect(Math.hypot(word.at.x - STAND.x, word.at.z - STAND.z)).toBeLessThanOrEqual(JOIN_STAND_OFF + WORK_ARRIVE_RADIUS)
      // The bank is a long walk away, and no word may fall down there: the
      // children's own teaching voices are at the water (work-order 1065).
      expect(Math.hypot(word.at.x - FILL.x, word.at.z - FILL.z)).toBeGreaterThan(10)
      expect(Math.hypot(word.at.x - HEAD.x, word.at.z - HEAD.z)).toBeGreaterThan(WORK_ARRIVE_RADIUS)
    }
  })

  it('addresses every word to somebody, and the order points at the water', () => {
    const { words } = run(view(6), 240)
    const river = words.filter((word) => word.concept === 'RIVER')
    expect(river.length).toBeGreaterThan(0)
    for (const word of river) {
      // NO VILLAGER SPEAKS TO NOBODY: each word names the person it is said to.
      expect(word.to).toBeTypeOf('number')
      expect(word.to).not.toBe(word.speaker)
    }
    const order = river.filter((word) => word.errand === 'order')
    const delivery = river.filter((word) => word.errand === 'delivery')
    expect(order.length).toBeGreaterThan(0)
    expect(delivery.length).toBeGreaterThan(0)
    // The order points at the river; the delivery is said to the man who sent him.
    for (const word of order) expect({ x: word.aim.x, z: word.aim.z }).toEqual(FILL)
    for (const word of delivery) expect(word.aim.y).toBe(1)
  })

  it('is ONE round trip held by one carrier, not two independent castings', () => {
    const v = view(6)
    const state = createAdultWork(6, CFG)
    const legs = new Map<number, string[]>()
    for (let elapsed = 0; elapsed < 240; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      for (let i = 0; i < 6; i++) {
        const task = taskOf(state, i)
        if (!task || task.situation === 'dig-first' || task.situation === 'dig-second') continue
        const seen = legs.get(i) ?? []
        const leg = `${task.situation}:${task.phase}:${carryOf(state, i)}`
        if (seen[seen.length - 1] !== leg) seen.push(leg)
        legs.set(i, seen)
      }
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    }
    // ONE carrier walks the whole errand: out with the empty jar, a fill at the
    // water, back with the full one. Both ids belong to that same person.
    const carrier = [...legs.values()].find((seen) => seen.some((leg) => leg.startsWith('water-back')))
    expect(carrier, 'no villager ever carried water back').toBeDefined()
    expect(carrier!.join(' > ')).toContain('water-out:fetch:emptyJar')
    expect(carrier!.join(' > ')).toContain('water-out:fill:emptyJar')
    expect(carrier!.join(' > ')).toContain('water-back:walk:fullJar')
    // The jar is FULL only after the fill, never before it.
    const beforeFill = carrier!.slice(0, carrier!.findIndex((leg) => leg.includes(':fill:')))
    expect(beforeFill.some((leg) => leg.includes('fullJar'))).toBe(false)
  })

  it('stops the fill leg AT the water, and every other leg at the shared radius', () => {
    // The fill is the one leg judged against a DRAWN surface: stopping 1.1 m
    // short of the waterline left the carrier 8 cm above it, dipping the jar
    // into air (measured 08.09.2026, work-order 1065).
    const v = view(6)
    const state = createAdultWork(6, CFG)
    const seen = new Map<string, number>()
    let closest = Infinity
    for (let elapsed = 0; elapsed < 240; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      for (let i = 0; i < 6; i++) {
        const task = taskOf(state, i)
        if (!task) continue
        seen.set(`${task.situation}:${task.phase}`, arriveRadiusOf(task))
        if (task.situation === 'water-out' && task.phase === 'fetch') {
          closest = Math.min(closest, Math.hypot(v.villagers[i].x - FILL.x, v.villagers[i].z - FILL.z))
        }
      }
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      if (state.delivered > 0) break
    }
    expect(seen.get('water-out:fetch')).toBe(FILL_ARRIVE_RADIUS)
    expect(seen.get('water-back:walk')).toBe(WORK_ARRIVE_RADIUS)
    expect(seen.get('water-out:invite')).toBe(WORK_ARRIVE_RADIUS)
    // ...and the walk really did come that close to the water.
    expect(closest).toBeLessThanOrEqual(FILL_ARRIVE_RADIUS)
  })

  it('holds the jar under the water for the configured seconds', () => {
    // ONE JAR, NOT EVERY JAR. The village may well have two errands out at once,
    // so a sum over all carriers measures how many men were at the water, not
    // how long a dip lasts — it stayed under the budget only as long as the
    // first errand happened to finish before a second one reached the water.
    const v = view(6)
    const state = createAdultWork(6, CFG)
    const filling = new Map<number, number>()
    for (let elapsed = 0; elapsed < 240; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      for (let i = 0; i < 6; i++) {
        if (taskOf(state, i)?.phase === 'fill') filling.set(i, (filling.get(i) ?? 0) + 1 / 60)
      }
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      if (state.delivered > 0) break
    }
    // A dip still under way when the first delivery breaks the loop is only
    // half measured, so the completed one is the longest: it has to reach the
    // budget, and NO dip may run past it.
    const dips = [...filling.values()]
    expect(dips.length).toBeGreaterThan(0)
    expect(Math.max(...dips)).toBeGreaterThanOrEqual(CFG.fillSeconds * 0.9)
    expect(Math.max(...dips)).toBeLessThan(CFG.fillSeconds * 1.6)
  })

  it('sets the jar down on the stand, and the stand never holds more than it can', () => {
    const v = view(6)
    const state = createAdultWork(6, CFG)
    for (let elapsed = 0; elapsed < 900; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    }
    expect(state.delivered).toBeGreaterThan(0)
    expect(jarsOnStand(state, CFG.standCapacity)).toBeLessThanOrEqual(CFG.standCapacity)
    expect(jarsOnStand(state, CFG.standCapacity)).toBe(Math.min(CFG.standCapacity, state.delivered))
  })

  it('yields the water word while a child could hear it, exactly as DIG does', () => {
    const heard = view(6, undefined, () => true, () => true)
    const { words } = run(heard, 240)
    expect(words.filter((word) => word.concept === 'RIVER')).toHaveLength(0)
  })

  it('never casts the return leg on its own', () => {
    expect(CASTABLE_SITUATIONS).not.toContain('water-back')
    expect(ADULT_SITUATIONS).toContain('water-back')
  })

  it('does not speak the order until the man it is spoken to has reached the stand', () => {
    // The addressee used to be cast as ALREADY arrived at a spot he never walked
    // to — and `arrived` is what stops the walk, so he stood wherever he was and
    // the order carried across the village to him.
    const v = view(6, [
      { x: 0, z: 0 }, { x: 0.6, z: 0 }, { x: 40, z: 40 },
      { x: 41, z: 40 }, { x: 42, z: 40 }, { x: 43, z: 40 },
    ])
    const state = createAdultWork(6, CFG)
    let order: SpokenWord | null = null
    for (let elapsed = 0; elapsed < 240 && !order; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      const word = stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      if (word?.errand === 'order') order = word
    }
    expect(order, 'the order was never spoken').not.toBeNull()
    const listener = v.villagers[order!.to!]
    // He is AT the stand when he is told, not somewhere across the village.
    expect(Math.hypot(listener.x - STAND.x, listener.z - STAND.z))
      .toBeLessThanOrEqual(JOIN_STAND_OFF + WORK_ARRIVE_RADIUS)
  })

  it('walks the full jar back to ground beside the stand, not onto the stand itself', () => {
    // The stand is a collider. The departure leg was already moved off its own
    // spot for that reason; the return walked straight back into it.
    const v = view(6)
    const state = createAdultWork(6, CFG)
    const backGoals: Array<{ x: number; z: number }> = []
    for (let elapsed = 0; elapsed < 240; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      for (let i = 0; i < 6; i++) {
        const task = taskOf(state, i)
        if (task?.situation === 'water-back') backGoals.push(goalOf(task))
      }
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      if (state.delivered > 0) break
    }
    expect(backGoals.length).toBeGreaterThan(0)
    for (const goal of backGoals) {
      expect(Math.hypot(goal.x - STAND.x, goal.z - STAND.z)).toBeCloseTo(JOIN_STAND_OFF, 5)
    }
  })

  it('sets the delivered jar down even when a child holds the report back', () => {
    // The jar used to go down only together with the word. A child within
    // earshot until the errand expired therefore took a jar that had already
    // been carried home: it vanished at the stand with nothing counted.
    const v = view(6)
    const state = createAdultWork(6, CFG)
    let carrier = -1
    for (let elapsed = 0; elapsed < 240 && carrier < 0; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      for (let i = 0; i < 6; i++) if (taskOf(state, i)?.situation === 'water-back') carrier = i
    }
    expect(carrier, 'nobody ever carried water back').toBeGreaterThanOrEqual(0)
    // From here on every child is within earshot: the report can never fall.
    v.childrenHear = () => true
    for (let elapsed = 0; elapsed < 240; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      if (state.delivered > 0) break
    }
    expect(state.delivered).toBeGreaterThan(0)
    expect(carryOf(state, carrier)).not.toBe('fullJar')
  })

  it('dips the jar even when one frame is longer than the whole fill', () => {
    // Entering the fill used to be conditional on the first `dt` still being
    // under the budget, so a single stalled frame left the carrier in `fetch`
    // for the rest of the errand and no jar ever went into the water.
    const v = view(6)
    const state = createAdultWork(6, CFG)
    // THE CARRIER THE STALL HIT, not whichever carrier happens to be dipping:
    // a second errand's ordinary dip would answer for the one that was skipped.
    let stalled = -1
    let dipped = false
    for (let elapsed = 0; elapsed < 240 && !dipped; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      if (stalled < 0) {
        // The frame that CAUSES the arrival, not one that observes it: arriving
        // and beginning the fill happen inside the same step, so `fetch` with
        // `arrived` set is never visible from out here.
        stalled = [...Array(6).keys()].find((i) => {
          const task = taskOf(state, i)
          if (!task || task.situation !== 'water-out' || task.phase !== 'fetch' || task.arrived) return false
          const to = goalOf(task)
          return Math.hypot(v.villagers[i].x - to.x, v.villagers[i].z - to.z) <= arriveRadiusOf(task)
        }) ?? -1
        // The stalled frame lands exactly on the arrival, which is where it hurt.
        stepAdultWork(state, v, stalled >= 0 ? CFG.fillSeconds * 2 : 1 / 60, CFG, () => 0.5)
      } else {
        stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
        if (taskOf(state, stalled)?.phase === 'fill') dipped = true
        if (carryOf(state, stalled) === 'fullJar') break
      }
    }
    expect(stalled, 'no carrier ever reached the water').toBeGreaterThanOrEqual(0)
    expect(dipped, 'a long frame skipped the dip entirely').toBe(true)
  })
})

describe('a blocked walk is released rather than left to pin its pair (work-order 1065)', () => {
  /**
   * The village as it really is: a man walks at his goal and something — a
   * collider, another body — holds him just outside the radius that would let
   * him arrive. Measured 10.09.2026 inside the full suite at 1.15 m against a
   * 1.10 m arrival.
   */
  function wedgedWalkFrame(state: AdultWorkState, v: AdultWorkView, dt: number, wedgeAt: number): void {
    for (let i = 0; i < v.villagers.length; i++) {
      const me = v.villagers[i]
      const task = taskOf(state, i)
      me.free = !task
      if (!task || task.arrived) continue
      const to = goalOf(task)
      const d = Math.hypot(to.x - me.x, to.z - me.z)
      if (d <= Math.max(arriveRadiusOf(task), wedgeAt)) continue
      const step = Math.min(d - wedgeAt, CFG.pace * dt)
      me.x += ((to.x - me.x) / d) * step
      me.z += ((to.z - me.z) / d) * step
    }
  }

  function runWedged(v: AdultWorkView, seconds: number, wedgeAt: number): { state: AdultWorkState; words: SpokenWord[] } {
    const state = createAdultWork(v.villagers.length, CFG)
    const words: SpokenWord[] = []
    for (let elapsed = 0; elapsed < seconds; elapsed += 1 / 60) {
      wedgedWalkFrame(state, v, 1 / 60, wedgeAt)
      const word = stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      if (word) words.push(word)
    }
    return { state, words }
  }

  it('lets a man held a few centimetres short arrive where he stands, and the order still falls', () => {
    // A join stand-off is a bearing round an anchor, not a mark on the floor.
    const { words } = runWedged(view(6), 120, 1.15)
    const order = words.filter((word) => word.id === 'water-out')
    expect(order.length, 'the order never fell, so both men were still walking').toBeGreaterThan(0)
    expect(order[0].to).toBeTypeOf('number')
  })

  it('does NOT forgive the fill leg, which is judged against the drawn water', () => {
    // A dip granted up the bank is the defect this work order exists to end.
    const { state } = runWedged(view(6), 200, 1.15)
    expect(state.delivered, 'a carrier who never reached the water still delivered').toBe(0)
    expect(state.stalled['water-out'] ?? 0).toBeGreaterThan(0)
  })

  it('frees the pinned villagers long before the errand would expire', () => {
    // THE MEASURED DEFECT: with nothing reading `stallSeconds`, a wedged leg
    // held two villagers for the whole `errandSeconds`, `anyFree` found nobody
    // and ONE water errand was cast in a whole window.
    const { state } = runWedged(view(6), 200, 1.15)
    expect(state.staged['water-out'] ?? 0, 'the caster never got its adults back').toBeGreaterThanOrEqual(2)
  })

  it('starts a fresh reckoning when a leg is re-aimed, so a long walk is never mistaken for a wedge', () => {
    // The carrier is sent from the stand to a waterline tens of metres away. If
    // the stall clock carried the last leg's best distance over, that walk would
    // look stalled from its first frame and the errand would die at the door.
    const { state } = run(view(6), 240)
    expect(state.delivered).toBeGreaterThan(0)
    expect(state.stalled, 'a village where nobody is blocked stalls nothing').toEqual({})
  })
})

describe('DIG is a summons said twice', () => {
  it('walks to a free adult and addresses the invitation to that person', () => {
    const v = riverless(view(4))
    const state = stageDig(v)
    const initiator = initiatorOf(state)
    const task = taskOf(state, initiator)!
    const partner = task.partner!
    expect(task.phase).toBe('invite')
    expect(task.arrived).toBe(false)
    expect(taskOf(state, partner)).toMatchObject({ role: 'partner', phase: 'invite', arrived: true })

    putAtGoal(state, v, initiator)
    const word = stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    expect(word).toMatchObject({ concept: 'DIG', speaker: initiator, purpose: 'invitation' })
    expect(word?.aim).toEqual({ x: v.villagers[partner].x, y: 1, z: v.villagers[partner].z })
  })

  it('sends the invited pair toward one site, says DIG there, then starts both digging', () => {
    const v = riverless(view(4))
    const state = stageDig(v)
    const initiator = initiatorOf(state)
    const partner = taskOf(state, initiator)!.partner!
    putAtGoal(state, v, initiator)
    expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)?.purpose).toBe('invitation')

    const first = taskOf(state, initiator)!
    const second = taskOf(state, partner)!
    expect(first.phase).toBe('site')
    expect(second.phase).toBe('site')
    expect(first.arrived).toBe(false)
    expect(second.arrived).toBe(false)
    expect(first.siteIndex).toBe(second.siteIndex)
    const site = v.geography.digSites[first.siteIndex!]
    expect(goalOf(first)).toEqual({ x: site.x, z: site.z })
    expect(Math.hypot(goalOf(second).x - site.x, goalOf(second).z - site.z)).toBeCloseTo(2.4, 6)

    putAtGoal(state, v, initiator)
    putAtGoal(state, v, partner)
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5) // both arrival flags
    const atSite = stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    expect(atSite).toMatchObject({ concept: 'DIG', speaker: initiator, purpose: 'site' })
    expect(atSite?.aim).toEqual({ x: site.x, y: 0, z: site.z })
    expect(isDigging(state, initiator)).toBe(true)
    expect(isDigging(state, partner)).toBe(true)
  })

  it('keeps both real tools through the invitation, walk, and whole stroke', () => {
    const v = riverless(view(4))
    const state = stageDig(v)
    const initiator = initiatorOf(state)
    const partner = taskOf(state, initiator)!.partner!
    expect(carryOf(state, initiator)).toBe('digTool')
    expect(carryOf(state, partner)).toBe('digTool')
    putAtGoal(state, v, initiator)
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    expect(carryOf(state, initiator)).toBe('digTool')
    expect(carryOf(state, partner)).toBe('digTool')
    putAtGoal(state, v, initiator)
    putAtGoal(state, v, partner)
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    expect(carryOf(state, initiator)).toBe('digTool')
    expect(carryOf(state, partner)).toBe('digTool')
  })

  it('uses two different sites for the two bouts in a teaching round', () => {
    const { words } = run(riverless(view(6)), 180)
    const siteWords = words.filter((word) => word.purpose === 'site')
    expect(siteWords.some((word) => word.id === 'dig-first')).toBe(true)
    expect(siteWords.some((word) => word.id === 'dig-second')).toBe(true)
    const first = siteWords.find((word) => word.id === 'dig-first')!
    const second = siteWords.find((word) => word.id === 'dig-second')!
    expect(`${first.aim.x},${first.aim.z}`).not.toBe(`${second.aim.x},${second.aim.z}`)
  })

  it('never stages a solo bout when no second adult is free', () => {
    const v = riverless(view(5))
    const state = createAdultWork(5, CFG)
    for (let elapsed = 0; elapsed < 30; elapsed += 1 / 60) {
      for (let i = 0; i < v.villagers.length; i++) v.villagers[i].free = i === 0 && !taskOf(state, i)
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    }
    expect(state.staged['dig-first'] ?? 0).toBe(0)
    expect(state.staged['dig-second'] ?? 0).toBe(0)
    expect(state.tasks.every((task) => task === null)).toBe(true)
  })

  it('invites only a free adult standing clear of the children`s ground', () => {
    const positions = [{ x: 0, z: 0 }, { x: 2, z: 0 }, { x: 14, z: 0 }, { x: 3, z: 0 }]
    const v = riverless(view(4, positions, undefined, undefined, (x) => x > 10))
    const state = stageDig(v)
    const initiator = initiatorOf(state)

    expect(taskOf(state, initiator)?.partner).toBe(2)
    expect(v.invitationClear(v.villagers[2].x, v.villagers[2].z)).toBe(true)
  })

  it('skips a dig bout when no free partner stands clear of the children`s ground', () => {
    const v = riverless(view(4, undefined, undefined, undefined, () => false))
    const state = stageDig(v)

    expect(state.tasks.every((task) => task === null)).toBe(true)
    expect(state.staged['dig-first'] ?? 0).toBe(0)
  })

  it('holds both utterances while a child can hear and resumes each afterwards', () => {
    let audibleToChild = true
    const v = riverless(view(4, undefined, undefined, () => audibleToChild))
    const state = stageDig(v)
    const initiator = initiatorOf(state)
    const partner = taskOf(state, initiator)!.partner!
    putAtGoal(state, v, initiator)

    expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)).toBeNull()
    expect(taskOf(state, initiator)).toMatchObject({ phase: 'invite', owes: true, hushed: true })
    audibleToChild = false
    expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)?.purpose).toBe('invitation')

    putAtGoal(state, v, initiator)
    putAtGoal(state, v, partner)
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    audibleToChild = true
    expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)).toBeNull()
    expect(taskOf(state, initiator)).toMatchObject({ phase: 'site', owes: true, hushed: true })
    expect(isDigging(state, initiator)).toBe(false)
    audibleToChild = false
    expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)?.purpose).toBe('site')
    expect(isDigging(state, initiator)).toBe(true)
    expect(isDigging(state, partner)).toBe(true)
  })

  it('holds the site word when a bystander enters the hole after staging', () => {
    const v = riverless(view(5))
    const state = stageDig(v)
    const initiator = initiatorOf(state)
    const partner = taskOf(state, initiator)!.partner!
    putAtGoal(state, v, initiator)
    expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)?.purpose).toBe('invitation')

    const site = v.geography.digSites[taskOf(state, initiator)!.siteIndex!]
    const bystander = v.villagers.findIndex((_, i) => i !== initiator && i !== partner)
    v.villagers[bystander].x = site.x
    v.villagers[bystander].z = site.z
    putAtGoal(state, v, initiator)
    putAtGoal(state, v, partner)
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)

    expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)).toBeNull()
    expect(taskOf(state, initiator)).toMatchObject({ phase: 'site', owes: true, hushed: true })
    expect(isDigging(state, initiator)).toBe(false)

    v.villagers[bystander].x = 40
    v.villagers[bystander].z = 40
    expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)?.purpose).toBe('site')
    expect(isDigging(state, initiator)).toBe(true)
    expect(isDigging(state, partner)).toBe(true)
  })
})

describe('digging records work at the site', () => {
  it('crosses one strike per tool cycle', () => {
    let strikes = 0
    const dt = 1 / 60
    for (let t = 0; t < DIG_CYCLE_SECONDS * 10; t += dt) if (digStrikeCrossed(t, t + dt)) strikes++
    expect(strikes).toBe(10)
  })

  it('adds worker-seconds and strike events only after the second utterance', () => {
    const v = riverless(view(4))
    const state = stageDig(v)
    const initiator = initiatorOf(state)
    const partner = taskOf(state, initiator)!.partner!
    const siteIndex = taskOf(state, initiator)!.siteIndex!
    putAtGoal(state, v, initiator)
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    putAtGoal(state, v, initiator)
    putAtGoal(state, v, partner)
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    expect(digProgressOf(state, v.geography.digSites.length)[siteIndex]).toEqual({ dug: 0, strikes: 0 })
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    for (let t = 0; t < 5; t += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    }
    const progress = digProgressOf(state, v.geography.digSites.length)[siteIndex]
    expect(progress.dug).toBeGreaterThan(9)
    expect(progress.strikes).toBeGreaterThanOrEqual(6)
  })

  it('returns progress as a copy rather than exposing scheduler state', () => {
    const state = createAdultWork(1, CFG)
    state.siteProgress[0] = { dug: 4, strikes: 2 }
    const shown = digProgressOf(state, 2)
    shown[0].dug = 99
    expect(state.siteProgress[0].dug).toBe(4)
    expect(shown[1]).toEqual({ dug: 0, strikes: 0 })
  })
})

describe('the single-utterance frame slot', () => {
  it('speaks at most one word a frame', () => {
    const { state, v } = threeWordsDue()
    const word = stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)

    expect(word).toMatchObject({ concept: 'RIVER', speaker: 0 })
    expect(state.last).toMatchObject({ id: word!.id, concept: word!.concept, speaker: word!.speaker })
    expect(taskOf(state, 1)?.owes).toBe(true)
    expect(taskOf(state, 3)?.owes).toBe(true)
  })

  it('holds the second atom back rather than swallowing it, when two fall together', () => {
    const { state, v } = threeWordsDue()
    const words: SpokenWord[] = []
    for (let frame = 0; frame < 3; frame++) {
      const word = stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
      if (word) words.push(word)
    }

    expect(words).toHaveLength(3)
    expect(words.map((word) => word.concept)).toEqual(['RIVER', 'DIG', 'DIG'])
    expect(words.map((word) => word.purpose ?? 'water')).toEqual(['water', 'invitation', 'site'])
    expect(new Set(words.map((word) => word.speaker)).size).toBe(3)
  })
})

describe('task lifecycle safeguards', () => {
  it('clears both members when either half of a pair is abandoned', () => {
    const v = riverless(view(4))
    const state = stageDig(v)
    const initiator = initiatorOf(state)
    const partner = taskOf(state, initiator)!.partner!
    clearTask(state, partner)
    expect(taskOf(state, initiator)).toBeNull()
    expect(taskOf(state, partner)).toBeNull()
  })

  it('refuses a site whose partner is already standing on it', () => {
    const v = riverless(view(2, [{ x: 0, z: 0 }, { x: -11, z: 2 }]))
    const state = stageDig(v)
    const initiator = initiatorOf(state)
    expect(taskOf(state, initiator)?.siteIndex).not.toBe(0)
  })

  it('never stages work where the second stand has no room', () => {
    const v = riverless(view(3, undefined, () => false))
    const state = stageDig(v)
    expect(state.tasks.every((task) => task === null)).toBe(true)
    expect(state.staged['dig-first'] ?? 0).toBe(0)
  })

  it('reports and releases an unreachable pair that still owes its word at the errand backstop', () => {
    resetDevAsserts()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const v = riverless(view(3))
    const state = stageDig(v)
    for (let elapsed = 0; elapsed < CFG.errandSeconds + 1; elapsed += 1 / 30) {
      for (const villager of v.villagers) villager.free = false
      stepAdultWork(state, v, 1 / 30, CFG, () => 0.5)
    }
    expect(state.tasks.every((task) => task === null)).toBe(true)
    expect(errors.mock.calls.map((call) => String(call[0])).join(' ')).toContain('[ASSERT] adult-atom-lost')
    errors.mockRestore()
    resetDevAsserts()
  })

  it('does not report an owed word that expires only because a child held it', () => {
    resetDevAsserts()
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    const v = riverless(view(3, undefined, undefined, () => true))
    const state = stageDig(v)
    const initiator = initiatorOf(state)
    putAtGoal(state, v, initiator)
    stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    expect(taskOf(state, initiator)).toMatchObject({ owes: true, hushed: true })

    state.next = Number.POSITIVE_INFINITY
    stepAdultWork(state, v, CFG.errandSeconds, CFG, () => 0.5)
    expect(state.tasks.every((task) => task === null)).toBe(true)
    expect(errors).not.toHaveBeenCalled()
    errors.mockRestore()
    resetDevAsserts()
  })

  it('is inert in a settlement with neither water nor work', () => {
    const v = riverless(view(3))
    v.geography.digSites = []
    const state = createAdultWork(3, CFG)
    for (let t = 0; t < 30; t += 1 / 60) expect(stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)).toBeNull()
    expect(state.last).toBeNull()
  })
})
