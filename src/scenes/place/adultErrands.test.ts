// The adults' errands (work-order point 483): the catalogue's own rules and the
// scheduler's behaviour, pinned without a browser.
//
// The teaching is a PROPERTY of this data, not of the frame it is drawn in —
// which concept is heard at which errand, that the two directions differ in
// nothing but the direction, that the rock is shown once away from the river,
// and that no errand is ever starved. All of that is decided here, so the
// browser is left with the one thing only it can show: that the villager
// actually walks.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
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
import { resetDevAsserts } from '../../systems/devAssert'
import { CHILD_CONCEPTS } from './childSituations'
import { MIRROR_PAIRS, utteranceOf, type ConceptId } from '../../communication/lexicon'
import { mulberry32 } from '../../world/noise'
import { buildLayout } from './layout'
import { ROCK_VILLAGE_ID } from '../../world/communicationRock'

const CFG: AdultErrandConfig = {
  intervalSeconds: 6,
  intervalSpread: 0.3,
  dwellSeconds: 4,
  digSeconds: 6,
  errandSeconds: 60,
  stallSeconds: 15,
  silenceSeconds: 60,
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

/** A village with no river the player can walk to: a teaching stone and ground
 *  work, and nothing else. Most of the roster looks like this. */
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
  options: {
    count?: number
    dt?: number
    cfg?: AdultErrandConfig
    seed?: number
    /**
     * A wall the walkers cannot pass (point 586 / 583): a target this returns
     * true for is approached to within five metres and never reached, exactly
     * as a spot behind a fence or inside a collider behaves in the settlement.
     */
    unreachable?: (x: number, z: number) => boolean
  } = {},
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
  /** Seconds between two staged errands, the longest first — what the player
   *  experiences as silence. */
  let gap = 0
  let longestGap = 0
  /** The longest a single assignment was ever held, and the longest STALL any
   *  assignment reached before it was let go. */
  let longestHold = 0
  let longestStall = 0
  const held = new Map<number, number>()
  for (let t = 0; t < seconds; t += dt) {
    for (let i = 0; i < count; i++) {
      const a = errandOf(state, i)
      people[i].free = !a
      if (!a) {
        held.delete(i)
        continue
      }
      held.set(i, (held.get(i) ?? 0) + dt)
      longestHold = Math.max(longestHold, held.get(i)!)
      longestStall = Math.max(longestStall, a.stall)
      if (a.arrived) continue
      const dx = a.x - people[i].x
      const dz = a.z - people[i].z
      const d = Math.hypot(dx, dz)
      const stepLen = cfg.pace * dt
      if (options.unreachable?.(a.x, a.z) && d <= 5) continue
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
      longestGap = Math.max(longestGap, gap)
      gap = 0
    } else gap += dt
  }
  return {
    state,
    spoken,
    walkTargets,
    people,
    view,
    cfg,
    longestGap: Math.max(longestGap, gap),
    longestHold,
    longestStall,
  }
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

describe('the PoC village’s OWN geography (work-order 482)', () => {
  // Not a fixture: the very object PlaceLife hands the scheduler, built from the
  // layout the scene draws. What the errands are about and what the player sees
  // are then the same thing by construction.
  const layout = buildLayout(ROCK_VILLAGE_ID, 4711)
  const geography: ErrandGeography = {
    bank: layout.bank ? { x: layout.bank.bank.x, z: layout.bank.bank.z } : null,
    upstream: layout.bank ? { x: layout.bank.upstream.x, z: layout.bank.upstream.z } : null,
    downstream: layout.bank ? { x: layout.bank.downstream.x, z: layout.bank.downstream.z } : null,
    stone: layout.teachingStone ? { x: layout.teachingStone.x, z: layout.teachingStone.z } : null,
    digSites: layout.digSites,
  }

  it('carries every place the five concepts are taught at', () => {
    expect(geography.bank).not.toBeNull()
    expect(geography.upstream).not.toBeNull()
    expect(geography.downstream).not.toBeNull()
    expect(geography.stone).not.toBeNull()
    expect(geography.digSites.length).toBeGreaterThanOrEqual(2)
  })

  it('keeps the three river places far enough apart to be TOLD APART', () => {
    // `placeOf` decides which place a villager is standing at by AT_PLACE_RADIUS.
    // If two of them overlapped, a walk up the bank would also read as a walk to
    // the bank and the direction could not be learned from the picture.
    const named = [geography.bank!, geography.upstream!, geography.downstream!, geography.stone!]
    for (let i = 0; i < named.length; i++) {
      for (let j = i + 1; j < named.length; j++) {
        expect(Math.hypot(named[i].x - named[j].x, named[i].z - named[j].z)).toBeGreaterThan(
          AT_PLACE_RADIUS * 2,
        )
      }
    }
  })

  it('goes LIVE: every errand in the catalogue is staged, the river ones included', () => {
    const { state } = simulate(3000, geography)
    for (const situation of ERRAND_SITUATIONS) {
      expect(state.staged[situation.id], situation.id).toBeGreaterThanOrEqual(1)
    }
  })

  it('teaches the two directions as a mirrored pair on the real bank', () => {
    const { walkTargets } = simulate(3000, geography)
    const up = walkTargets.find((w) => w.said.id === 'sendUpTheBank')
    const down = walkTargets.find((w) => w.said.id === 'sendDownTheBank')
    expect(up).toBeDefined()
    expect(down).toBeDefined()
    const bank = layout.bank!
    const along = (x: number, z: number) => x * bank.fx + z * bank.fz
    // The same situation walked the other way along the same water.
    expect(along(up!.x, up!.z)).toBeLessThan(along(down!.x, down!.z))
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
    // THE BACKSTOP on its own: the stall release (pinned in its own block
    // below) is put out of reach here, so what has to let go of this errand is
    // `errandSeconds` and nothing else.
    const cfg: AdultErrandConfig = { ...CFG, errandSeconds: 12, stallSeconds: 1e6 }
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

/**
 * THE VILLAGE MUST NEVER RUN OUT OF SPEAKERS (work-order point 586).
 *
 * The defect this block exists for is TIME-DEPENDENT, which is exactly why no
 * suite caught it: the adults went quiet after MINUTES of play, and every
 * browser suite simulates seconds. So these cases run a whole visit — half an
 * hour of village time — and judge the RATE of speech at the end of it, not
 * whether the staging function would fire once.
 *
 * What was measured on the shipped code: with the river places walled off, all
 * four villagers hang on errands they cannot finish, each one held for the full
 * 180-second backstop — twenty staged errands long — and the village stands
 * silent for stretches of nearly three minutes. That is what the user saw.
 */
describe('a village never runs out of speakers, however the walks go', () => {
  /** The river places behind a wall: a spot nobody can reach (point 583 found
   *  exactly such an invisible wall in this very village). */
  const walledRiver = (_x: number, z: number) => z > 12

  it('keeps speaking through half an hour of village time', () => {
    const { spoken, longestGap } = simulate(1800, fullGeography())
    expect(spoken.length).toBeGreaterThan(150)
    expect(longestGap).toBeLessThan(CFG.silenceSeconds)
  })

  it('keeps speaking when the places it sends people to cannot be reached', () => {
    const { spoken, longestGap } = simulate(1800, fullGeography(), {
      unreachable: walledRiver,
    })
    expect(spoken.length).toBeGreaterThan(120)
    // Nowhere near the silence the user reported: a walk that gets nowhere is
    // let go, and the next errand is staged behind it.
    expect(longestGap).toBeLessThan(CFG.silenceSeconds)
  })

  it('WOULD go quiet without the release — the case has teeth', () => {
    // The same walled village with the stall release out of reach: the backstop
    // alone leaves the gaps the defect report describes. Without this the two
    // cases above would pass on the broken code too.
    const backstopOnly: AdultErrandConfig = { ...CFG, stallSeconds: 1e6 }
    const { longestGap } = simulate(1800, fullGeography(), {
      cfg: backstopOnly,
      unreachable: walledRiver,
    })
    expect(longestGap).toBeGreaterThan(CFG.errandSeconds / 2)
  })

  it('lets no assignment outlive its bound, reachable target or not', () => {
    for (const unreachable of [undefined, walledRiver]) {
      const { longestHold, longestStall } = simulate(1800, fullGeography(), { unreachable })
      // The stall release is the tight bound; the backstop is the outer one.
      expect(longestStall).toBeLessThanOrEqual(CFG.stallSeconds + 0.5)
      expect(longestHold).toBeLessThanOrEqual(CFG.errandSeconds + 0.5)
    }
  })

  it('keeps the rotation fair while it does it: no concept is starved', () => {
    const { state } = simulate(1800, fullGeography(), { unreachable: walledRiver })
    for (const s of ERRAND_SITUATIONS) {
      // The three that need somebody ALREADY STANDING at a walled-off place
      // cannot be cast in this village at all, and are excluded for that reason
      // alone. Every other errand keeps coming round — the release frees stuck
      // villagers, it does not re-order anyone.
      const needsSomeoneAtTheRiver =
        s.id === 'callBackFromTheBank' ||
        s.id === 'gatherAtTheBank' ||
        s.id === 'callInFromUpstream'
      if (needsSomeoneAtTheRiver) continue
      expect(state.staged[s.id], `${s.id} was starved`).toBeGreaterThan(0)
    }
  })

  it('carries a follower without ever calling its steady gap a stall', () => {
    // A follower walks at its leader's pace and so never closes the distance to
    // it. Measured as headway that reads as a stall, and the two errands whose
    // whole picture is the pair walking the stretch together would be cut in
    // half every time.
    const cfg: AdultErrandConfig = { ...CFG, stallSeconds: 2 }
    const geo = fullGeography()
    const people = villagers(4)
    const view: ErrandView = { villagers: people, geography: geo }
    const state = createAdultErrands(4, cfg)
    const rand = mulberry32(77)
    let follower = -1
    let leader = -1
    for (let t = 0; t < 400 && follower < 0; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      const said = stepAdultErrands(state, view, 0.5, cfg, rand)
      if (said?.action === 'followToTarget') {
        leader = said.speaker
        follower = said.addressees[0]
      }
    }
    expect(follower).toBeGreaterThanOrEqual(0)
    // The leader walks the stretch; the follower keeps its distance behind it.
    for (let t = 0; t < cfg.stallSeconds * 3; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      const lead = errandOf(state, leader)
      if (lead && !lead.arrived) {
        const d = Math.hypot(lead.x - people[leader].x, lead.z - people[leader].z)
        people[leader].x += ((lead.x - people[leader].x) / d) * cfg.pace * 0.5
        people[leader].z += ((lead.z - people[leader].z) / d) * cfg.pace * 0.5
      }
      // Two paces behind, all the way — no headway, and no stall either.
      people[follower].x = people[leader].x - 2
      people[follower].z = people[leader].z
      stepAdultErrands(state, view, 0.5, cfg, rand)
      expect(errandOf(state, follower)?.situation ?? null).not.toBeNull()
    }
  })

  it('lets a follower go once there is nobody left to walk after', () => {
    const cfg: AdultErrandConfig = { ...CFG, stallSeconds: 3 }
    const geo = fullGeography()
    const people = villagers(4)
    const view: ErrandView = { villagers: people, geography: geo }
    const state = createAdultErrands(4, cfg)
    const rand = mulberry32(77)
    let follower = -1
    let leader = -1
    for (let t = 0; t < 400 && follower < 0; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      const said = stepAdultErrands(state, view, 0.5, cfg, rand)
      if (said?.action === 'followToTarget') {
        leader = said.speaker
        follower = said.addressees[0]
      }
    }
    clearErrand(state, leader)
    for (let t = 0; t < cfg.stallSeconds + 1; t += 0.5) {
      for (let i = 0; i < people.length; i++) people[i].free = !errandOf(state, i)
      stepAdultErrands(state, view, 0.5, cfg, rand)
    }
    expect(errandOf(state, follower)).toBeNull()
  })
})

/**
 * THE ARMED ALARM (point 207(i)): a village that has gone quiet says so. This
 * defect class leaves no trace in a screenshot and none in a short suite, so the
 * running game is what has to report it — in every headless run, whose
 * console-error gates fail on it, and in every manual session.
 */
describe('the silence alarm', () => {
  let spy: ReturnType<typeof vi.spyOn>
  beforeEach(() => {
    resetDevAsserts()
    spy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })
  afterEach(() => spy.mockRestore())

  const codes = () => spy.mock.calls.map((c) => String(c[0]))

  it('says nothing through half an hour of a healthy village', () => {
    simulate(1800, fullGeography())
    expect(codes()).toEqual([])
  })

  it('nor when the walks cannot be finished — because the village keeps speaking', () => {
    simulate(1800, fullGeography(), { unreachable: (_x, z) => z > 12 })
    expect(codes()).toEqual([])
  })

  it('nor in a village with nowhere at all to send anyone, which is silent by right', () => {
    simulate(600, { bank: null, upstream: null, downstream: null, stone: null, digSites: [] })
    expect(codes()).toEqual([])
  })

  it('nor with a single villager, who has nobody to speak to', () => {
    simulate(600, fullGeography(), { count: 1 })
    expect(codes()).toEqual([])
  })

  it('FIRES when a village that could speak has said nothing for the stated window', () => {
    // Whatever the future cause — this is the caller holding every villager, so
    // nothing can be cast — the alarm names it rather than letting the teaching
    // die quietly.
    const people = villagers(4).map((p) => ({ ...p, free: false }))
    const view: ErrandView = { villagers: people, geography: fullGeography() }
    const state = createAdultErrands(4, CFG)
    const rand = mulberry32(5)
    for (let t = 0; t < CFG.silenceSeconds + 5; t += 0.5) stepAdultErrands(state, view, 0.5, CFG, rand)
    expect(codes().join(' ')).toContain('errands-silent')
  })

  it('re-arms: it goes quiet again as soon as the village speaks again', () => {
    const people = villagers(4).map((p) => ({ ...p, free: false }))
    const view: ErrandView = { villagers: people, geography: fullGeography() }
    const state = createAdultErrands(4, CFG)
    const rand = mulberry32(5)
    for (let t = 0; t < CFG.silenceSeconds + 5; t += 0.5) stepAdultErrands(state, view, 0.5, CFG, rand)
    expect(codes().join(' ')).toContain('errands-silent')
    // The village is let go: it stages again, and the counter is back to nothing.
    for (const p of people) p.free = true
    let said = null
    for (let t = 0; t < 60 && !said; t += 0.5) said = stepAdultErrands(state, view, 0.5, CFG, rand)
    expect(said).not.toBeNull()
    expect(state.silence).toBeLessThan(1)
  })
})
