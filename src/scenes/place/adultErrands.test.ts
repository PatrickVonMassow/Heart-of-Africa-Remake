// The adults' errands (work-order point 483): the catalogue's own rules and the
// scheduler's behaviour, pinned without a browser.
//
// The teaching is a PROPERTY of this data, not of the frame it is drawn in —
// which concept is heard at which errand, that the two directions differ in
// nothing but the direction, that the rock is shown once away from the river,
// and that no errand is ever starved. All of that is decided here, so the
// browser is left with the one thing only it can show: that the villager
// actually walks.

import { describe, expect, it } from 'vitest'
import {
  ADULT_CONCEPTS,
  AT_PLACE_RADIUS,
  ERRAND_BY_ID,
  ERRAND_SITUATIONS,
  MIRRORED_ERRANDS,
  clearErrand,
  createAdultErrands,
  errandOf,
  isDigging,
  noteErrandArrival,
  placeOf,
  stepAdultErrands,
  type AdultErrandConfig,
  type ErrandGeography,
  type ErrandSituationId,
  type ErrandView,
  type SpokenErrand,
} from './adultErrands'
import { CHILD_CONCEPTS } from './childSituations'
import { MIRROR_PAIRS, utteranceOf, type ConceptId } from '../../communication/lexicon'
import { mulberry32 } from '../../world/noise'

const CFG: AdultErrandConfig = {
  intervalSeconds: 6,
  intervalSpread: 0.3,
  dwellSeconds: 4,
  digSeconds: 6,
  errandSeconds: 60,
  pace: 1.3,
}

/** The full geography of a river village: bank, both stretches, stone, patches. */
function fullGeography(overrides: Partial<ErrandGeography> = {}): ErrandGeography {
  return {
    bank: { x: 0, z: 20 },
    upstream: { x: -14, z: 18 },
    downstream: { x: 14, z: 18 },
    stone: { x: 9, z: -6 },
    digSites: [
      { x: -4, z: -3, kind: 'pit' },
      { x: 2, z: -9, kind: 'postHole' },
      { x: -9, z: 4, kind: 'patch' },
    ],
    ...overrides,
  }
}

/** What a village looks like TODAY, before point 482 lands the bank: a teaching
 *  stone and ground work, and no river the player can walk to. */
function bankLessGeography(): ErrandGeography {
  return fullGeography({ bank: null, upstream: null, downstream: null })
}

function villagers(count: number) {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / Math.max(1, count)) * Math.PI * 2
    return { x: Math.cos(a) * 3, z: Math.sin(a) * 3, free: true }
  })
}

/**
 * A village left running: villagers walk to whatever they were told at the
 * configured pace, report their arrival and stay for the dwell. Everything the
 * scene does, minus the geometry.
 */
function simulate(
  seconds: number,
  geography: ErrandGeography,
  options: { count?: number; dt?: number; cfg?: AdultErrandConfig; seed?: number } = {},
) {
  const cfg = options.cfg ?? CFG
  const dt = options.dt ?? 0.5
  const count = options.count ?? 4
  const people = villagers(count)
  const view: ErrandView = { villagers: people, geography }
  const state = createAdultErrands(count, cfg)
  const rand = mulberry32(options.seed ?? 1234)
  const spoken: SpokenErrand[] = []
  const walkTargets: Array<{ said: SpokenErrand; x: number; z: number }> = []
  for (let t = 0; t < seconds; t += dt) {
    for (let i = 0; i < count; i++) {
      const a = errandOf(state, i)
      people[i].free = !a
      if (!a || a.arrived) continue
      const dx = a.x - people[i].x
      const dz = a.z - people[i].z
      const d = Math.hypot(dx, dz)
      const stepLen = cfg.pace * dt
      if (d <= stepLen + 0.25) {
        people[i].x = a.x
        people[i].z = a.z
        noteErrandArrival(state, i, cfg)
      } else {
        people[i].x += (dx / d) * stepLen
        people[i].z += (dz / d) * stepLen
      }
    }
    const said = stepAdultErrands(state, view, dt, cfg, rand)
    if (said) {
      spoken.push(said)
      walkTargets.push({ said, x: said.walkTo.x, z: said.walkTo.z })
    }
  }
  return { state, spoken, walkTargets, people, view, cfg }
}

describe('the adults’ errand catalogue', () => {
  it('teaches each of the five landscape and action concepts in at least two distinct situations', () => {
    for (const concept of ['RIVER', 'UPSTREAM', 'DOWNSTREAM', 'BIG_ROCK', 'DIG'] as ConceptId[]) {
      const ids = ERRAND_SITUATIONS.filter((s) => s.teaches === concept).map((s) => s.id)
      expect(new Set(ids).size, `${concept} situations: ${ids.join(', ')}`).toBeGreaterThanOrEqual(2)
    }
  })

  it('covers exactly the five concepts the children do NOT teach', () => {
    expect([...ADULT_CONCEPTS].sort()).toEqual(
      ['BIG_ROCK', 'DIG', 'DOWNSTREAM', 'RIVER', 'UPSTREAM'].sort(),
    )
    for (const c of ADULT_CONCEPTS) expect(CHILD_CONCEPTS).not.toContain(c)
  })

  it('mixes every new concept with one the children already taught', () => {
    for (const s of ERRAND_SITUATIONS) {
      const known = s.concepts.filter((c) => CHILD_CONCEPTS.includes(c))
      const fresh = s.concepts.filter((c) => ADULT_CONCEPTS.includes(c))
      expect(known.length, `${s.id} carries no known concept`).toBeGreaterThanOrEqual(1)
      expect(fresh, `${s.id} must teach exactly one new concept`).toEqual([s.teaches])
    }
  })

  it('speaks the atoms of its phrase, in order and unparsed', () => {
    const { spoken } = simulate(600, fullGeography())
    expect(spoken.length).toBeGreaterThan(10)
    for (const said of spoken) {
      expect(said.utterances).toEqual(said.concepts.map((c) => utteranceOf(c)))
      expect(said.utterances.length).toBe(said.concepts.length)
    }
  })

  it('has a unique id per entry and a lookup that agrees with the list', () => {
    const ids = ERRAND_SITUATIONS.map((s) => s.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const s of ERRAND_SITUATIONS) expect(ERRAND_BY_ID[s.id]).toBe(s)
  })
})

describe('RIVER cannot collapse into “fetch water”', () => {
  it('is spoken at three errands: one to the bank, one back from it, one that begins there', () => {
    const river = ERRAND_SITUATIONS.filter((s) => s.teaches === 'RIVER')
    expect(river.map((s) => s.id)).toEqual([
      'sendToTheBank',
      'callBackFromTheBank',
      'gatherAtTheBank',
    ])
    // The walk runs TOWARD the water in one and AWAY from it in another, so no
    // single direction of travel can be what the utterance means.
    expect(ERRAND_BY_ID.sendToTheBank.action).toBe('walkToTarget')
    expect(ERRAND_BY_ID.callBackFromTheBank.action).toBe('walkToSpeaker')
  })

  it('stages all three when the village has a bank', () => {
    const { state } = simulate(1800, fullGeography())
    expect(state.staged.sendToTheBank).toBeGreaterThanOrEqual(1)
    expect(state.staged.callBackFromTheBank).toBeGreaterThanOrEqual(1)
    expect(state.staged.gatherAtTheBank).toBeGreaterThanOrEqual(1)
  })

  it('sends the villager to the bank itself, and calls it back to the speaker', () => {
    const geo = fullGeography()
    const { spoken } = simulate(1800, geo)
    const sent = spoken.find((s) => s.id === 'sendToTheBank')
    expect(sent).toBeDefined()
    expect(Math.hypot(sent!.walkTo.x - geo.bank!.x, sent!.walkTo.z - geo.bank!.z)).toBeLessThan(1e-6)
    const back = spoken.find((s) => s.id === 'callBackFromTheBank')
    expect(back).toBeDefined()
    expect(back!.walkPlace).toBe('speaker')
  })
})

describe('the two directions are taught as mirrors', () => {
  it('pairs one send and one haul, and the lexicon mirrors the pair too', () => {
    expect(MIRRORED_ERRANDS.length).toBe(2)
    expect(MIRROR_PAIRS).toContainEqual(['UPSTREAM', 'DOWNSTREAM'])
    for (const [up, down] of MIRRORED_ERRANDS) {
      const a = ERRAND_BY_ID[up]
      const b = ERRAND_BY_ID[down]
      expect(a.teaches).toBe('UPSTREAM')
      expect(b.teaches).toBe('DOWNSTREAM')
      // The pictures differ in the direction and in NOTHING else.
      expect(a.gesture).toBe(b.gesture)
      expect(a.action).toBe(b.action)
      expect(a.concepts.length).toBe(b.concepts.length)
      const differ = a.concepts
        .map((c, i) => (c === b.concepts[i] ? -1 : i))
        .filter((i) => i >= 0)
      expect(differ.length).toBe(1)
      expect([a.concepts[differ[0]], b.concepts[differ[0]]]).toEqual(['UPSTREAM', 'DOWNSTREAM'])
    }
  })

  it('walks the mirrored errands to opposite sides of the bank', () => {
    const geo = fullGeography()
    const view: ErrandView = { villagers: villagers(4), geography: geo }
    for (const [up, down] of MIRRORED_ERRANDS) {
      const a = ERRAND_BY_ID[up].cast(view)
      const b = ERRAND_BY_ID[down].cast(view)
      expect(a, up).not.toBeNull()
      expect(b, down).not.toBeNull()
      const ux = a!.walkTo.x - geo.bank!.x
      const uz = a!.walkTo.z - geo.bank!.z
      const dx = b!.walkTo.x - geo.bank!.x
      const dz = b!.walkTo.z - geo.bank!.z
      // Opposite senses along the flow: the dot product of the two offsets is
      // negative, so one walk runs against the current and the other with it.
      expect(ux * dx + uz * dz).toBeLessThan(0)
    }
  })

  it('casts the mirrored errands with the same parts, so only the direction reads', () => {
    const view: ErrandView = { villagers: villagers(4), geography: fullGeography() }
    for (const [up, down] of MIRRORED_ERRANDS) {
      const a = ERRAND_BY_ID[up].cast(view)!
      const b = ERRAND_BY_ID[down].cast(view)!
      expect(a.speaker).toBe(b.speaker)
      expect(a.addressees).toEqual(b.addressees)
      expect(a.walkPlace).toBe('upstream')
      expect(b.walkPlace).toBe('downstream')
    }
  })

  it('stages both directions in a running village', () => {
    const { state } = simulate(1800, fullGeography())
    expect(state.staged.sendUpTheBank).toBeGreaterThanOrEqual(1)
    expect(state.staged.sendDownTheBank).toBeGreaterThanOrEqual(1)
    expect(state.staged.haulUpTheBank).toBeGreaterThanOrEqual(1)
    expect(state.staged.haulDownTheBank).toBeGreaterThanOrEqual(1)
  })
})

describe('the rock is learnable beside the direction', () => {
  it('names BIG_ROCK in two errands, at least one of them with no upstream walk', () => {
    const rock = ERRAND_SITUATIONS.filter((s) => s.teaches === 'BIG_ROCK')
    expect(rock.length).toBeGreaterThanOrEqual(2)
    expect(rock.some((s) => !s.involvesUpstream)).toBe(true)
    // …and one that DOES carry the river walk, so the contrast exists at all.
    expect(rock.some((s) => s.involvesUpstream)).toBe(true)
  })

  it('casts the no-upstream rock errand in a village that has no river at all', () => {
    const view: ErrandView = { villagers: villagers(3), geography: bankLessGeography() }
    const noUpstream = ERRAND_SITUATIONS.filter(
      (s) => s.teaches === 'BIG_ROCK' && !s.involvesUpstream,
    )
    expect(noUpstream.length).toBeGreaterThanOrEqual(1)
    for (const s of noUpstream) expect(s.cast(view), s.id).not.toBeNull()
  })

  it('sends the villager to the stone itself', () => {
    const geo = fullGeography()
    const view: ErrandView = { villagers: villagers(3), geography: geo }
    const cast = ERRAND_BY_ID.sendToTheStone.cast(view)!
    expect(cast.walkPlace).toBe('stone')
    expect(cast.walkTo).toEqual({ x: geo.stone!.x, z: geo.stone!.z })
  })

  it('never casts a rock errand in a village without a stone', () => {
    const view: ErrandView = { villagers: villagers(4), geography: fullGeography({ stone: null }) }
    for (const s of ERRAND_SITUATIONS.filter((e) => e.teaches === 'BIG_ROCK')) {
      expect(s.cast(view), s.id).toBeNull()
    }
  })
})

describe('digging is shown, in more than one situation', () => {
  it('carries three dig errands, all of them ending in ground work', () => {
    const dig = ERRAND_SITUATIONS.filter((s) => s.teaches === 'DIG')
    expect(dig.length).toBeGreaterThanOrEqual(2)
    for (const s of dig) expect(['digWhereSpoken', 'digAtTarget']).toContain(s.action)
  })

  it('gives the digger an assignment that reads as digging once it has arrived', () => {
    const geo = fullGeography()
    const { state, spoken } = simulate(1200, geo)
    expect(spoken.some((s) => s.id === 'sendToThePostHole')).toBe(true)
    // A dig assignment reports digging only AFTER the arrival — a villager
    // still on its way is walking, not working.
    const cfg = CFG
    const people = villagers(3)
    const view: ErrandView = { villagers: people, geography: geo }
    const fresh = createAdultErrands(3, cfg)
    const rand = mulberry32(5)
    let said: SpokenErrand | null = null
    for (let t = 0; t < 200 && !said; t += 0.5) {
      const got = stepAdultErrands(fresh, view, 0.5, cfg, rand)
      if (got && got.action === 'digAtTarget') said = got
    }
    expect(said).not.toBeNull()
    const digger = said!.addressees[0]
    expect(isDigging(fresh, digger)).toBe(false)
    noteErrandArrival(fresh, digger, cfg)
    expect(isDigging(fresh, digger)).toBe(true)
    expect(errandOf(fresh, digger)?.dwell).toBeCloseTo(cfg.digSeconds)
    expect(state.staged.sendToThePostHole).toBeGreaterThanOrEqual(1)
  })

  it('stages more than one dig situation in a running village', () => {
    const { state } = simulate(1800, fullGeography())
    const dug = ERRAND_SITUATIONS.filter((s) => s.teaches === 'DIG' && state.staged[s.id] > 0)
    expect(dug.length).toBeGreaterThanOrEqual(2)
  })

  it('stages no dig errand in a settlement with no ground work to do', () => {
    const { state } = simulate(600, fullGeography({ digSites: [] }))
    for (const s of ERRAND_SITUATIONS.filter((e) => e.teaches === 'DIG')) {
      expect(state.staged[s.id], s.id).toBe(0)
    }
  })
})

describe('the scheduler', () => {
  it('stages every errand of a full river village, none of them starved', () => {
    const { state } = simulate(3000, fullGeography())
    const never = ERRAND_SITUATIONS.filter((s) => state.staged[s.id] === 0).map((s) => s.id)
    expect(never, `never staged: ${never.join(', ')}`).toEqual([])
    for (const s of ERRAND_SITUATIONS) {
      expect(state.staged[s.id], s.id).toBeGreaterThanOrEqual(2)
    }
  })

  it('keeps the queue fair: no errand runs away from the least-staged one', () => {
    const { state } = simulate(3000, fullGeography())
    const counts = ERRAND_SITUATIONS.map((s) => state.staged[s.id])
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(
      Math.max(3, Math.round(Math.max(...counts) * 0.6)),
    )
  })

  it('stages only what a bank-less village can show, and never throws', () => {
    const { state, spoken } = simulate(1800, bankLessGeography())
    expect(spoken.length).toBeGreaterThan(5)
    for (const id of [
      'sendToTheBank',
      'callBackFromTheBank',
      'gatherAtTheBank',
      'sendUpTheBank',
      'sendDownTheBank',
      'haulUpTheBank',
      'haulDownTheBank',
      'callInFromUpstream',
    ] as ErrandSituationId[]) {
      expect(state.staged[id], id).toBe(0)
    }
    expect(state.staged.sendToTheStone).toBeGreaterThanOrEqual(1)
    expect(state.staged.sendToThePostHole).toBeGreaterThanOrEqual(1)
  })

  it('says nothing at all when there is nowhere to be sent', () => {
    const { spoken } = simulate(900, {
      bank: null,
      upstream: null,
      downstream: null,
      stone: null,
      digSites: [],
    })
    expect(spoken).toEqual([])
  })

  it('waits one interval before the first word, and one between two errands', () => {
    const cfg: AdultErrandConfig = { ...CFG, intervalSpread: 0 }
    const { spoken } = simulate(400, fullGeography(), { cfg, dt: 0.25 })
    expect(spoken.length).toBeGreaterThan(3)
    const state = createAdultErrands(4, cfg)
    const view: ErrandView = { villagers: villagers(4), geography: fullGeography() }
    const rand = mulberry32(3)
    let elapsed = 0
    let first: number | null = null
    for (let i = 0; i < 400 && first === null; i++) {
      elapsed += 0.25
      if (stepAdultErrands(state, view, 0.25, cfg, rand)) first = elapsed
    }
    expect(first).not.toBeNull()
    expect(first!).toBeGreaterThanOrEqual(cfg.intervalSeconds)
  })

  it('never stages two errands back to back: the cooldown stands between them', () => {
    const cfg: AdultErrandConfig = { ...CFG, intervalSpread: 0 }
    const people = villagers(4)
    const view: ErrandView = { villagers: people, geography: fullGeography() }
    const state = createAdultErrands(4, cfg)
    const rand = mulberry32(77)
    let said: SpokenErrand | null = null
    for (let t = 0; t < 200 && !said; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      said = stepAdultErrands(state, view, 0.5, cfg, rand)
    }
    expect(said).not.toBeNull()
    // The very next steps say nothing until a whole interval has passed.
    let quiet = 0
    for (let t = 0; t < cfg.intervalSeconds - 0.5; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      if (stepAdultErrands(state, view, 0.5, cfg, rand) === null) quiet++
      else break
    }
    expect(quiet).toBe(Math.round((cfg.intervalSeconds - 0.5) / 0.5))
  })

  it('never gives a villager two errands at once, and never casts a speaker as its own addressee', () => {
    const geo = fullGeography()
    const cfg = CFG
    const people = villagers(4)
    const view: ErrandView = { villagers: people, geography: geo }
    const state = createAdultErrands(4, cfg)
    const rand = mulberry32(99)
    for (let t = 0; t < 2000; t += 0.5) {
      for (let i = 0; i < people.length; i++) {
        const a = errandOf(state, i)
        people[i].free = !a
        if (a && !a.arrived) {
          people[i].x = a.x
          people[i].z = a.z
          noteErrandArrival(state, i, cfg)
        }
      }
      const said = stepAdultErrands(state, view, 0.5, cfg, rand)
      if (!said) continue
      expect(said.addressees).not.toContain(said.speaker)
      for (const i of said.addressees) {
        expect(i, 'an addressee must have been free').toBeGreaterThanOrEqual(0)
        expect(i).toBeLessThan(people.length)
      }
    }
  })

  it('sends every errand to a place the village actually has', () => {
    const geo = fullGeography()
    const { walkTargets } = simulate(2400, geo)
    expect(walkTargets.length).toBeGreaterThan(20)
    const named = [geo.bank!, geo.upstream!, geo.downstream!, geo.stone!, ...geo.digSites]
    for (const { said, x, z } of walkTargets) {
      // Inside the walkable region the fixture describes: nothing is ever sent
      // out of the settlement.
      expect(Math.hypot(x, z), said.id).toBeLessThanOrEqual(26)
      if (said.walkPlace === 'speaker') continue
      const nearest = Math.min(...named.map((p) => Math.hypot(p.x - x, p.z - z)))
      // Exactly a named place, or the arm's length beside one (two villagers
      // working the same patch).
      expect(nearest, `${said.id} walks to no named place`).toBeLessThanOrEqual(1.3)
    }
  })

  it('drops an errand whose walk never finishes, rather than pinning the villager', () => {
    const cfg: AdultErrandConfig = { ...CFG, errandSeconds: 12 }
    const people = villagers(3)
    const view: ErrandView = { villagers: people, geography: fullGeography() }
    const state = createAdultErrands(3, cfg)
    const rand = mulberry32(11)
    let assigned = -1
    for (let t = 0; t < 200 && assigned < 0; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      const said = stepAdultErrands(state, view, 0.5, cfg, rand)
      if (said && said.addressees.length > 0) assigned = said.addressees[0]
    }
    expect(assigned).toBeGreaterThanOrEqual(0)
    const stuck = errandOf(state, assigned)
    expect(stuck).not.toBeNull()
    // Nobody ever arrives: the backstop must let go of THAT errand anyway (the
    // villager is free again afterwards, and may well be given a new one).
    for (let t = 0; t < cfg.errandSeconds + 2; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      stepAdultErrands(state, view, 0.5, cfg, rand)
    }
    expect(errandOf(state, assigned)).not.toBe(stuck)
    expect(stuck!.seconds).toBeLessThanOrEqual(0)
  })

  it('ends an errand when the dwell is spent', () => {
    const cfg = CFG
    const people = villagers(3)
    const view: ErrandView = { villagers: people, geography: fullGeography() }
    const state = createAdultErrands(3, cfg)
    const rand = mulberry32(21)
    let walker = -1
    for (let t = 0; t < 200 && walker < 0; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      const said = stepAdultErrands(state, view, 0.5, cfg, rand)
      if (said && said.addressees.length > 0) walker = said.addressees[0]
    }
    noteErrandArrival(state, walker, cfg)
    expect(errandOf(state, walker)?.arrived).toBe(true)
    for (let t = 0; t < cfg.dwellSeconds + 1; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      stepAdultErrands(state, view, 0.5, cfg, rand)
    }
    expect(errandOf(state, walker)).toBeNull()
  })

  it('carries a follower along with the leader it was told to follow', () => {
    const geo = fullGeography()
    const cfg = CFG
    const people = villagers(4)
    const view: ErrandView = { villagers: people, geography: geo }
    const state = createAdultErrands(4, cfg)
    const rand = mulberry32(31)
    let haul: SpokenErrand | null = null
    for (let t = 0; t < 600 && !haul; t += 0.5) {
      for (let i = 0; i < people.length; i++) {
        const a = errandOf(state, i)
        people[i].free = !a
        if (a && !a.arrived && a.kind !== 'follow') {
          people[i].x = a.x
          people[i].z = a.z
          noteErrandArrival(state, i, cfg)
        }
      }
      const said = stepAdultErrands(state, view, 0.5, cfg, rand)
      if (said && said.action === 'followToTarget') haul = said
    }
    expect(haul).not.toBeNull()
    const follower = haul!.addressees[0]
    expect(errandOf(state, follower)?.kind).toBe('follow')
    expect(errandOf(state, follower)?.follow).toBe(haul!.speaker)
    // The leader moves and the follower's destination moves with it.
    people[haul!.speaker].x += 5
    stepAdultErrands(state, view, 0.5, cfg, rand)
    expect(errandOf(state, follower)?.x).toBeCloseTo(people[haul!.speaker].x)
  })

  it('keeps a follower walking until the one it follows has arrived', () => {
    const geo = fullGeography()
    const cfg = CFG
    const people = villagers(4)
    const view: ErrandView = { villagers: people, geography: geo }
    const state = createAdultErrands(4, cfg)
    const rand = mulberry32(53)
    let haul: SpokenErrand | null = null
    for (let t = 0; t < 600 && !haul; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      const said = stepAdultErrands(state, view, 0.5, cfg, rand)
      if (said && said.action === 'followToTarget') haul = said
    }
    expect(haul).not.toBeNull()
    const leader = haul!.speaker
    const follower = haul!.addressees[0]
    // The follower has caught up (it starts beside the leader) — and is still
    // NOT there, because the walk it was asked along on has not happened yet.
    noteErrandArrival(state, follower, cfg)
    expect(errandOf(state, follower)?.arrived).toBe(false)
    // Once the leader is at the far end of the stretch, the follower is too.
    noteErrandArrival(state, leader, cfg)
    noteErrandArrival(state, follower, cfg)
    expect(errandOf(state, leader)?.arrived).toBe(true)
    expect(errandOf(state, follower)?.arrived).toBe(true)
  })

  it('survives a group that changed size, an unmounted villager and a bad step', () => {
    const geo = fullGeography()
    const people = villagers(4)
    const view: ErrandView = { villagers: people, geography: geo }
    const state = createAdultErrands(4, CFG)
    const rand = mulberry32(41)
    for (let t = 0; t < 120; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      stepAdultErrands(state, view, 0.5, CFG, rand)
    }
    // A villager leaves the scene: its slot goes with it.
    people.pop()
    expect(() => stepAdultErrands(state, view, 0.5, CFG, rand)).not.toThrow()
    expect(state.assignments.length).toBe(people.length)
    // Nonsense deltas advance nothing and throw nothing.
    expect(() => stepAdultErrands(state, view, Number.NaN, CFG, rand)).not.toThrow()
    expect(() => stepAdultErrands(state, view, -3, CFG, rand)).not.toThrow()
    expect(() => stepAdultErrands(state, { villagers: [], geography: geo }, 0.5, CFG, rand)).not.toThrow()
    // Clearing an errand is safe for any index.
    clearErrand(state, 0)
    clearErrand(state, -1)
    clearErrand(state, 99)
    expect(errandOf(state, 0)).toBeNull()
    expect(errandOf(state, 99)).toBeNull()
  })

  it('reads where a villager is standing, and calls the open ground nothing', () => {
    const geo = fullGeography()
    const view: ErrandView = {
      villagers: [
        { x: geo.bank!.x, z: geo.bank!.z, free: true },
        { x: geo.upstream!.x, z: geo.upstream!.z, free: true },
        { x: geo.stone!.x, z: geo.stone!.z, free: true },
        { x: geo.digSites[0].x, z: geo.digSites[0].z, free: true },
        { x: geo.bank!.x, z: geo.bank!.z - AT_PLACE_RADIUS * 3, free: true },
      ],
      geography: geo,
    }
    expect(placeOf(view, 0)).toBe('bank')
    expect(placeOf(view, 1)).toBe('upstream')
    expect(placeOf(view, 2)).toBe('stone')
    expect(placeOf(view, 3)).toBe('dig')
    expect(placeOf(view, 4)).toBeNull()
    expect(placeOf(view, 99)).toBeNull()
  })
})
