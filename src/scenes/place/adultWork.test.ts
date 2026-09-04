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
  WATER_FOOT_REACH,
  WORK_ARRIVE_RADIUS,
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
}

const HEAD = { x: 12, z: 0 }
const FOOT = { x: 34, z: -6 }

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
    if (d <= 1e-6) continue
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

describe('RIVER remains a departure and return at the path head', () => {
  it('speaks both water situations at the head and aims both at the water', () => {
    const { words } = run(view(6), 240)
    const river = words.filter((word) => word.concept === 'RIVER')
    expect(new Set(river.map((word) => word.id))).toEqual(new Set(['water-out', 'water-back']))
    for (const word of river) {
      expect(Math.hypot(word.at.x - HEAD.x, word.at.z - HEAD.z)).toBeLessThanOrEqual(WORK_ARRIVE_RADIUS)
      expect(Math.hypot(word.at.x - FOOT.x, word.at.z - FOOT.z)).toBeGreaterThan(WATER_FOOT_REACH)
      expect({ x: word.aim.x, z: word.aim.z }).toEqual(FOOT)
    }
  })

  it('carries the empty jar out and the full jar back', () => {
    const v = view(4)
    const state = createAdultWork(4, CFG)
    const carried = new Set<string>()
    for (let elapsed = 0; elapsed < 240; elapsed += 1 / 60) {
      walkFrame(state, v, 1 / 60)
      for (let i = 0; i < 4; i++) {
        const task = taskOf(state, i)
        if (task) carried.add(`${task.situation}:${carryOf(state, i)}`)
      }
      stepAdultWork(state, v, 1 / 60, CFG, () => 0.5)
    }
    expect(carried).toContain('water-out:emptyJar')
    expect(carried).toContain('water-back:fullJar')
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
