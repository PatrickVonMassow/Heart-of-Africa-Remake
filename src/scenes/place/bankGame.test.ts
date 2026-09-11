// THE CHILDREN'S BANK GAME, REPLAYED (work-order 687).
//
// The spec's own test list, one case each: the phases alternate, the caller
// becomes the first catcher, the direction alternates with the side swap, ROCK
// falls once with nobody arriving and once outside the game altogether, a
// the first arrival is audible, the run and the cycle end exactly as specified,
// no utterance reduces a moving child's pace, and a tagged child holds its
// posture through the readable ending before walking home.
//
// The stage here is a bare one — two rocks 20 m apart on open ground, which is
// the shipped stretch measured in `bankStage.test.ts` — so what these cases pin
// is the ROUND. The settlement's own layout, colliders and crowd are what
// `tagShuffle.test.ts` replays.

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { resetDevAsserts } from '../../systems/devAssert'
import { floorPace } from '../../systems/pursuit'
import { mulberry32 } from '../../world/noise'
import { climbBoulder, looseRock } from './looseRocks'
import { buildLayout } from './layout'
import { playRockFlank } from './playRockSurface'
import { standingClear, WALKER_RADIUS } from './collision'
import {
  bankChildCanSeparate,
  createBankGame,
  insideStrangerBerth,
  otherEnd,
  rockAt,
  stationAt,
  stepBankGame,
  touchReach,
  touchStand,
  TOUCH_GAP,
  wordToward,
  type BankConfig,
  type BankEnd,
  type BankStage,
  type BankState,
  type BankUtterance,
  type BankWorld,
  type ClimbStage,
} from './bankGame'
import { absorbSeparation } from './tagGame'
import {
  addBodies,
  createBodies,
  createInhabitantSet,
  separateGroup,
} from './inhabitantBodies'

const CFG: BankConfig = { ...balance.villageLife.tag, ...balance.villageLife.bankGame }

/**
 * A play rock's drawn flank, as a shape rather than as the shipped mesh: an
 * ellipsoid 1.2 m at its widest, and widest at 0.9 m of its 1.4 m height. That
 * is the property the round depends on and the one the real stone has — narrow
 * where a child stands, broad above it — and stating it here keeps this suite
 * independent of the vertices `playRockSurface.test.ts` measures.
 */
const FLANK_SPAN = 1.2
const FLANK_WIDEST = 0.9
const FLANK_SEMI = 1.05
function testFlank(_end: BankEnd, _bearing: number, y: number): number {
  const t = (y - FLANK_WIDEST) / FLANK_SEMI
  return t <= -1 || t >= 1 ? 0 : FLANK_SPAN * Math.sqrt(1 - t * t)
}

/** Two rocks 20 m apart along x, the water to one side, a boulder in the
 *  children's quarter well away from both. The boulder carries the size a
 *  middling scattered stone has in a shipped village (`looseRock` at instance
 *  scale 0.8), because the climb is played against it. */
const STAGE: BankStage = {
  upstream: { x: -10, z: 0 },
  downstream: { x: 10, z: 0 },
  flank: testFlank,
  water: { x: 0, z: 8 },
  boulder: { ...looseRock([2, -22, 0.8]) },
  roam: { x: 0, z: -22, radius: 8 },
}

/** Open ground: nothing blocks, nothing is occupied, nobody is carried. */
function openWorld(stranger?: { x: number; z: number; radius: number }): BankWorld {
  return {
    radius: 60,
    centerX: 0,
    centerZ: 0,
    childRadius: 0.3,
    blocked: () => false,
    nudge: (x, z) => ({ x, z, found: true }),
    stranger: stranger ?? null,
  }
}

interface Log {
  said: BankUtterance[]
  phases: string[]
  /** The state as it stood when each utterance fell. */
  when: Array<{
    u: BankUtterance
    phase: string
    arrivals: number
    direction: string | null
    cycle: number
    /** WHERE THE SPEAKER WAS AND HOW HIGH IT STOOD when the word fell, never a
     *  flag saying it was climbing (work-order 1080). The flag was what let a
     *  child hovering 2.2 m from the stone pass as a child climbing it. */
    climb: ClimbStage
    speakerX: number
    speakerZ: number
    lift: number
  }>
}

/** Runs the group for `seconds` and records what it said and did. */
function replay(
  seconds: number,
  options: { seed?: number; count?: number; world?: BankWorld; cfg?: BankConfig; stage?: BankStage } = {},
): { s: BankState; log: Log } {
  const cfg = options.cfg ?? CFG
  const stage = options.stage ?? STAGE
  const count = options.count ?? balance.villageLife.tag.childCount
  const rand = mulberry32(options.seed ?? 7)
  const spots = Array.from({ length: count }, (_, i) => ({
    x: stage.roam.x + Math.cos((i / count) * Math.PI * 2) * 2.4,
    z: stage.roam.z + Math.sin((i / count) * Math.PI * 2) * 2.4,
  }))
  const s = createBankGame(spots, rand, cfg)
  const world = options.world ?? openWorld()
  const log: Log = { said: [], phases: [], when: [] }
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    const before = s.phase
    const u = stepBankGame(s, dt, cfg, stage, world, rand)
    if (s.phase !== before || log.phases.length === 0) log.phases.push(s.phase)
    if (u) {
      log.said.push(u)
      log.when.push({
        u,
        phase: s.phase,
        arrivals: s.children.filter((c) => c.arrived).length,
        direction: s.direction,
        cycle: s.cycles,
        climb: s.children[u.speaker]?.climb ?? 'none',
        speakerX: s.children[u.speaker]?.x ?? NaN,
        speakerZ: s.children[u.speaker]?.z ?? NaN,
        lift: s.children[u.speaker]?.lift ?? 0,
      })
    }
  }
  return { s, log }
}

/**
 * SEVERAL SEEDS, NOT ONE. Which child calls, who is caught and how many runs a
 * cycle holds all fall out of the group's own random stream, so a property of
 * THE ROUND — "ROCK is called once with nobody arriving", "a cycle with two runs
 * alternates its direction" — is asked of a handful of groups rather than of the
 * one that happened to be seeded first. A case that needed a particular seed to
 * see its property would be pinning that seed, not the game.
 */
const SEEDS = [7, 13, 21, 42, 99]

/** Plane distance between two spots. */
function dist(a: { x: number; z: number }, b: { x: number; z: number }): number {
  return Math.hypot(a.x - b.x, a.z - b.z)
}

/** The same replay over every seed, with the logs concatenated. */
function replayAll(
  seconds: number,
  options: { world?: BankWorld; count?: number; cfg?: BankConfig } = {},
) {
  const runs = SEEDS.map((seed) => replay(seconds, { ...options, seed }))
  return {
    runs,
    log: {
      said: runs.flatMap((r) => r.log.said),
      phases: runs.flatMap((r) => r.log.phases),
      when: runs.flatMap((r) => r.log.when),
    } as Log,
  }
}

describe('the children`s game at the bank (point 687)', () => {
  it('brings five children to the village round', () => {
    expect(balance.villageLife.tag.childCount).toBe(5)
  })

  it('runs the cycle in order: roam, gather, runs with their swaps, parting, roam again', () => {
    const { s, log } = replay(400)
    expect(s.cycles).toBeGreaterThan(0)
    expect(log.phases[0]).toBe('roam')
    // Every transition is one the state machine allows — no phase reached from
    // one it may not follow.
    const allowed: Record<string, string[]> = {
      roam: ['gather'],
      gather: ['run'],
      run: ['regroup', 'part'],
      regroup: ['run'],
      part: ['roam'],
    }
    for (let i = 1; i < log.phases.length; i++) {
      expect(allowed[log.phases[i - 1]]).toContain(log.phases[i])
    }
    // And a whole cycle really came round: roam → … → part → roam.
    expect(log.phases.filter((p) => p === 'roam').length).toBeGreaterThan(1)
    expect(log.phases).toContain('part')
  })

  it('makes the child who calls RIVER the first catcher', () => {
    const { log } = replay(400)
    const calls = log.said.filter((u) => u.moment === 'call')
    expect(calls.length).toBeGreaterThan(0)
    for (const call of calls) {
      expect(call.concept).toBe('RIVER')
      expect(call.at).toBe('water')
    }
    // Replayed step by step, the caller holds the catcher's role the moment the
    // cycle opens — the round hands it to nobody else first.
    const rand = mulberry32(7)
    const spots = Array.from({ length: 4 }, (_, i) => ({
      x: STAGE.roam.x + Math.cos((i / 4) * Math.PI * 2) * 2.4,
      z: STAGE.roam.z + Math.sin((i / 4) * Math.PI * 2) * 2.4,
    }))
    const s = createBankGame(spots, rand, CFG)
    const world = openWorld()
    let opened = false
    for (let t = 0; t < 400 && !opened; t += 1 / 60) {
      const before = s.phase
      stepBankGame(s, 1 / 60, CFG, STAGE, world, rand)
      if (before === 'roam' && s.phase === 'gather') {
        opened = true
        expect(s.caller).toBeGreaterThanOrEqual(0)
        expect(s.children[s.caller].role).toBe('catcher')
        expect(s.children.filter((c) => c.role === 'catcher')).toHaveLength(1)
      }
    }
    expect(opened).toBe(true)
  })

  it('alternates the announced direction with the side swap', () => {
    const cfg: BankConfig = {
      ...CFG,
      roamSeconds: 0.1,
      roamSpread: 0,
      gatherSeconds: 0.1,
      runSeconds: 0.1,
      regroupSeconds: 0.1,
      partSeconds: 0.1,
      utteranceGapSeconds: 0,
      catchDistance: -1,
    }
    const { runs, log } = replayAll(30, { cfg })
    const announced = log.said.filter((u) => u.moment === 'announce').map((u) => u.concept)
    expect(announced.length).toBeGreaterThan(2)
    // Inside ONE cycle the sides swap every run, so the word alternates by
    // construction. Group by the round's cycle count rather than by another
    // utterance: a simultaneous word may be omitted, never used as bookkeeping.
    const cycles: string[][] = []
    for (const run of runs) {
      const byCycle = new Map<number, string[]>()
      for (const w of run.log.when) {
        if (w.u.moment !== 'announce') continue
        const cycle = byCycle.get(w.cycle) ?? []
        cycle.push(w.u.concept)
        byCycle.set(w.cycle, cycle)
      }
      cycles.push(...byCycle.values())
    }
    const multi = cycles.filter((c) => c.length > 1)
    expect(multi.length).toBeGreaterThan(0)
    for (const cycle of multi) {
      for (let i = 1; i < cycle.length; i++) expect(cycle[i]).not.toBe(cycle[i - 1])
    }
  })

  it('calls ROCK once with nobody arriving, and once outside the game altogether', () => {
    const { log } = replayAll(600)
    const rock = log.when.filter((w) => w.u.concept === 'ROCK')
    expect(rock.length).toBeGreaterThan(2)
    // THE TAP: at the start of a run, at the catcher's own rock, with not one
    // child having arrived anywhere.
    const taps = rock.filter((w) => w.u.moment === 'tap')
    expect(taps.length).toBeGreaterThan(0)
    for (const tap of taps) {
      expect(tap.arrivals).toBe(0)
      expect(tap.u.at).toBe('rock')
    }
    // THE BOULDER: while the group ROAMS, at a stone that is no part of the game.
    const boulders = rock.filter((w) => w.u.moment === 'boulder')
    expect(boulders.length).toBeGreaterThan(0)
    for (const b of boulders) {
      expect(b.phase).toBe('roam')
      expect(b.u.at).toBe('boulder')
      // ON the stone, not beside it: standing on its top, at its height.
      expect(b.climb).toBe('top')
      expect(Math.hypot(b.speakerX - STAGE.boulder.x, b.speakerZ - STAGE.boulder.z)).toBeLessThan(1e-6)
      expect(b.lift).toBeCloseTo(STAGE.boulder.height, 6)
      // Aimed at the stone it is standing on — its rim, on the side it climbed
      // from, so the point has a direction instead of running down through the
      // child's own feet.
      expect(Math.hypot(b.u.aim.x - STAGE.boulder.x, b.u.aim.z - STAGE.boulder.z)).toBeCloseTo(
        STAGE.boulder.radius,
        6,
      )
      expect(b.u.aim.y).toBeCloseTo(STAGE.boulder.height, 6)
      // …and it is nowhere near either play rock, so it cannot be read as one.
      for (const end of ['upstream', 'downstream'] as const) {
        const r = rockAt(STAGE, end)
        expect(Math.hypot(b.u.aim.x - r.x, b.u.aim.z - r.z)).toBeGreaterThan(10)
      }
    }
    // And ROCK is called on ARRIVAL too, which is the reading the two guards
    // above exist to keep from being the only one.
    const arrivals = replayAll(600, { cfg: { ...CFG, utteranceGapSeconds: 0 } }).log.when
      .filter((w) => w.u.moment === 'arrival')
    expect(arrivals.length).toBeGreaterThan(0)
    // The boulder is named at most once per roaming phase — a child that stood
    // at it would otherwise chant.
    const roams = log.phases.filter((p) => p === 'roam').length
    expect(boulders.length).toBeLessThanOrEqual(roams)
  })

  it('does not leave roaming until the ordinary boulder has been climbed and named', () => {
    const cfg: BankConfig = {
      ...CFG,
      roamSeconds: 0.1,
      roamSpread: 0,
      roamGoalSeconds: 0.05,
      utteranceGapSeconds: 0,
    }
    const { log } = replay(120, { seed: 23, cfg })
    let guarded = false
    let calls = 0
    for (const u of log.said) {
      if (u.moment === 'boulder') guarded = true
      if (u.moment !== 'call') continue
      calls++
      expect(guarded).toBe(true)
      guarded = false
    }
    expect(calls).toBeGreaterThan(1)
  })

  it('opens a cycle after the boulder approach proves unreachable', () => {
    const cfg: BankConfig = {
      ...CFG,
      roamSeconds: 0.1,
      roamSpread: 0,
      roamGoalSeconds: 0.2,
      utteranceGapSeconds: 0,
    }
    // An unbroken wall leaves the children free on its west side and the
    // boulder sealed more than one reach beyond it on the east. This is the
    // world's real obstacle predicate, so `drive` exhausts its deflection
    // choices instead of a test double merely refusing the destination.
    const world: BankWorld = {
      ...openWorld(),
      blocked: (x) => x > -1,
      nudge: (x, z) => ({ x, z, found: false }),
    }
    const rand = mulberry32(29)
    const s = createBankGame(
      [
        { x: -4, z: -23 },
        { x: -5, z: -22 },
        { x: -4, z: -21 },
      ],
      rand,
      cfg,
    )
    const said: BankUtterance[] = []
    let openedAt = 0
    for (let t = 0; t < 10 && s.phase === 'roam'; t += 1 / 60) {
      const u = stepBankGame(s, 1 / 60, cfg, STAGE, world, rand)
      if (u) said.push(u)
      openedAt = s.clock
    }

    expect(s.phase).toBe('gather')
    expect(openedAt).toBeGreaterThan(cfg.roamSeconds)
    expect(s.namedBoulder).toBe(false)
    expect(s.abandonedBoulder).toBe(true)
    expect(said.some((u) => u.moment === 'boulder')).toBe(false)
    expect(said.some((u) => u.moment === 'call')).toBe(true)
  })

  it('tries another child when only the nearest boulder route is blocked', () => {
    const cfg: BankConfig = {
      ...CFG,
      roamSeconds: 0.1,
      roamSpread: 0,
      roamGoalSeconds: 0.2,
      utteranceGapSeconds: 0,
    }
    // Child 0 starts nearest to the boulder but west of an unbroken wall. Child
    // 1 is a little farther away on the boulder's east side, where its own
    // approach is open. The first failure must therefore yield the job, not the
    // entire phase guard.
    const world: BankWorld = {
      ...openWorld(),
      blocked: (x) => x > -0.25 && x < 0.25,
      nudge: (x, z) => ({ x, z, found: false }),
    }
    const rand = mulberry32(30)
    const s = createBankGame(
      [
        { x: -1, z: -22 },
        { x: 5.2, z: -22 },
        { x: -4, z: -22 },
      ],
      rand,
      cfg,
    )
    let boulder: BankUtterance | null = null
    for (let t = 0; t < 10 && !boulder; t += 1 / 60) {
      const u = stepBankGame(s, 1 / 60, cfg, STAGE, world, rand)
      if (u?.moment === 'boulder') boulder = u
    }

    expect(s.failedClimbers).toEqual([0])
    expect(boulder?.speaker).toBe(1)
    expect(s.namedBoulder).toBe(true)
    expect(s.abandonedBoulder).toBe(false)
  })

  it('holds everybody at the rocks while the catcher`s tap is seen', () => {
    const cfg: BankConfig = { ...CFG, roamSeconds: 0.1, roamSpread: 0, utteranceGapSeconds: 5 }
    const rand = mulberry32(31)
    const spots = Array.from({ length: 4 }, (_, i) => ({
      x: STAGE.roam.x + i * 1.2,
      z: STAGE.roam.z,
    }))
    const s = createBankGame(spots, rand, cfg)
    const world = openWorld()
    let tap: BankUtterance | null = null

    for (let t = 0; t < 60 && !tap; t += 1 / 60) {
      const u = stepBankGame(s, 1 / 60, cfg, STAGE, world, rand)
      if (u?.moment === 'tap') tap = u
    }

    expect(tap?.concept).toBe('ROCK')
    expect(s.phase).toBe('run')
    expect(s.phaseFor).toBe(cfg.runSeconds)
    expect(s.children.every((c) => !c.arrived)).toBe(true)
    const atTap = s.children.map((c) => ({ x: c.x, z: c.z }))
    let heldFor = 0
    while (s.tapFor > 0) {
      stepBankGame(s, 1 / 60, cfg, STAGE, world, rand)
      heldFor += 1 / 60
      s.children.forEach((c, i) => {
        expect(c.x).toBeCloseTo(atTap[i].x, 9)
        expect(c.z).toBeCloseTo(atTap[i].z, 9)
        expect(c.held).toBe(true)
        expect(c.pace).toBe(0)
      })
    }
    expect(heldFor).toBeGreaterThanOrEqual(cfg.tapPauseSeconds)
    expect(s.phaseFor).toBe(cfg.runSeconds)
  })

  it('drops the parting call and walks from the bank toward the roaming quarter', () => {
    const { log } = replayAll(600)
    expect(log.said.every((u) => !('moment' in u) || (u.moment as string) !== 'parting')).toBe(true)

    const rand = mulberry32(32)
    const s = createBankGame([STAGE.downstream, STAGE.upstream], rand, CFG)
    s.phase = 'run'
    s.phaseFor = CFG.runSeconds
    s.direction = 'UPSTREAM'
    s.runsThisCycle = 1
    s.children[0].role = 'catcher'
    s.children[1].role = 'out'
    s.children[1].crouched = true
    stepBankGame(s, 1 / 60, CFG, STAGE, openWorld(), rand)
    expect(s.phase).toBe('part')
    expect(s.children[1].crouched).toBe(true)
    const before = s.children.map((c) => Math.hypot(c.x - STAGE.roam.x, c.z - STAGE.roam.z))
    const ending = s.children.map((c) => ({ x: c.x, z: c.z }))
    let heldFor = 0
    while (s.endFor > 0) {
      stepBankGame(s, 1 / 60, CFG, STAGE, openWorld(), rand)
      heldFor += 1 / 60
      if (s.endFor > 0) {
        expect(s.children[1].crouched).toBe(true)
        s.children.forEach((c, i) => {
          expect(c.x).toBeCloseTo(ending[i].x, 9)
          expect(c.z).toBeCloseTo(ending[i].z, 9)
          expect(c.held).toBe(true)
        })
      }
    }
    expect(heldFor).toBeGreaterThanOrEqual(CFG.endPauseSeconds)
    expect(s.children[1].crouched).toBe(false)
    for (let t = 0; t < 1; t += 1 / 60) stepBankGame(s, 1 / 60, CFG, STAGE, openWorld(), rand)
    s.children.forEach((c, i) => {
      expect(c.crouched).toBe(false)
      expect(Math.hypot(c.x - STAGE.roam.x, c.z - STAGE.roam.z)).toBeLessThan(before[i])
    })
  })

  it('lets a typical first run tag one or two children and bring the rest home', () => {
    const rand = mulberry32(7)
    const spots = [
      stationAt(STAGE, 'downstream', 0, CFG),
      ...Array.from({ length: 4 }, (_, i) => stationAt(STAGE, 'upstream', i, CFG)),
    ]
    const s = createBankGame(spots, rand, CFG)
    s.phase = 'run'
    s.phaseFor = CFG.runSeconds
    s.from = 'upstream'
    s.direction = 'DOWNSTREAM'
    s.runsThisCycle = 1
    s.children[0].role = 'catcher'
    for (let i = 1; i < s.children.length; i++) s.children[i].role = 'runner'
    const arrived = new Set<number>()
    while (s.phase === 'run') {
      stepBankGame(s, 1 / 60, CFG, STAGE, openWorld(), rand)
      s.children.forEach((c, i) => { if (c.arrived) arrived.add(i) })
    }
    expect(s.tags).toBeGreaterThanOrEqual(1)
    expect(s.tags).toBeLessThanOrEqual(2)
    // The last arrival can close the run in its own frame and is reset by
    // `endRun` before this outside sampler sees it. The surviving roles and the
    // unspent backstop prove that every untagged runner reached the rock.
    expect(s.phaseFor).toBeGreaterThan(0)
    expect(s.children.filter((c) => c.role === 'runner')).toHaveLength(4 - s.tags)
    expect(arrived.size).toBeGreaterThanOrEqual(4 - s.tags - 1)
  })

  it('always speaks the first arrival even inside the ordinary utterance gap', () => {
    const rand = mulberry32(33)
    const s = createBankGame([STAGE.upstream, STAGE.downstream], rand, CFG)
    s.phase = 'run'
    s.phaseFor = CFG.runSeconds
    s.from = 'upstream'
    s.direction = 'DOWNSTREAM'
    s.runsThisCycle = 1
    s.sinceSaid = 0
    s.children[0].role = 'catcher'
    s.children[1].role = 'runner'
    Object.assign(s.children[1], touchStand(STAGE, 'downstream')!)
    let arrival: BankUtterance | null = null
    for (let k = 0; k < 120 && !arrival; k++) {
      arrival = stepBankGame(s, 1 / 60, CFG, STAGE, openWorld(), rand)
    }
    expect(arrival?.moment).toBe('arrival')
    expect(arrival?.speaker).toBe(1)
    expect(s.arrivalSpoken).toBe(true)
  })

  it('ends a run when every runner has arrived or been tagged, and the cycle when none is free', () => {
    const { runs: all, log } = replayAll(600)
    expect(all.reduce((n, r) => n + r.s.runs, 0)).toBeGreaterThan(2)
    // A parting only ever follows a run in which nobody survived free — the
    // state machine reaches `part` from `run` and from nowhere else.
    const toPart: string[] = []
    for (let i = 1; i < log.phases.length; i++) {
      if (log.phases[i] === 'part') toPart.push(log.phases[i - 1])
    }
    expect(toPart.length).toBeGreaterThan(0)
    for (const from of toPart) expect(from).toBe('run')

    // Stepped by hand: one runner touches the far rock while the backstop still
    // has almost all its time left. The empty-free-runner guard must close the
    // run on that frame; deleting that half of `stepRun`'s exit condition leaves
    // this state in `run` and fails the phase assertion below.
    const rand = mulberry32(11)
    const game = createBankGame([STAGE.upstream, STAGE.downstream], rand, CFG)
    const world = openWorld()
    game.phase = 'run'
    game.phaseFor = CFG.runSeconds
    game.from = 'upstream'
    game.direction = 'DOWNSTREAM'
    game.runsThisCycle = 1
    game.children[0].role = 'catcher'
    game.children[1].role = 'runner'

    stepBankGame(game, 1 / 60, CFG, STAGE, world, rand)

    expect(game.phase).toBe('regroup')
    expect(game.phaseFor).toBe(CFG.regroupSeconds)
  })

  it('ends a cycle after one run per child even when nobody is ever tagged', () => {
    const cfg: BankConfig = {
      ...CFG,
      roamSeconds: 0.1,
      roamSpread: 0,
      gatherSeconds: 0.1,
      runSeconds: 0.1,
      regroupSeconds: 0.1,
      partSeconds: 0.1,
      catchDistance: -1,
    }
    const { s, log } = replay(30, { seed: 17, cfg })

    expect(s.tags).toBe(0)
    expect(s.cycles).toBeGreaterThan(0)
    expect(log.phases).toContain('part')
    expect(log.phases.filter((phase) => phase === 'roam').length).toBeGreaterThan(1)
    expect(s.runs).toBeGreaterThanOrEqual(s.children.length)
  })

  it('holds the arrival on its flank and leaves the boulder naming on top of its stone', () => {
    const cfg: BankConfig = { ...CFG, utteranceGapSeconds: 0 }
    const world = openWorld()
    const runRand = mulberry32(3)
    const run = createBankGame([STAGE.upstream, touchStand(STAGE, 'downstream')!], runRand, cfg)
    run.phase = 'run'
    run.phaseFor = cfg.runSeconds
    run.from = 'upstream'
    run.direction = 'DOWNSTREAM'
    run.children[0].role = 'catcher'
    run.children[1].role = 'runner'
    let arrival: BankUtterance | null = null
    for (let k = 0; k < 120 && !arrival; k++) {
      arrival = stepBankGame(run, 1 / 60, cfg, STAGE, world, runRand)
    }
    expect(arrival?.moment).toBe('arrival')
    expect(arrival?.speaker).toBe(1)
    expect(run.children[1].pace).toBe(0)
    expect(run.children[1].held).toBe(true)

    // Reviewed, unchanged: the off-game ROCK is spoken on top of its boulder.
    const roamRand = mulberry32(5)
    const roam = createBankGame([STAGE.boulder], roamRand, cfg)
    let boulder: BankUtterance | null = null
    let beforeHeld = false
    for (let t = 0; t < 10 && !boulder; t += 1 / 60) {
      beforeHeld = roam.children[0].climb === 'up'
      boulder = stepBankGame(roam, 1 / 60, cfg, STAGE, world, roamRand)
    }
    expect(boulder?.moment).toBe('boulder')
    expect(boulder?.speaker).toBe(0)
    // Already up the stone on the frame BEFORE the word — the word did not put
    // it there and did not stop it.
    expect(beforeHeld).toBe(true)
    expect(roam.children[0].climb).toBe('top')
    expect(roam.children[0].pace).toBe(0)
    const after = stepBankGame(roam, 1 / 60, cfg, STAGE, world, roamRand)
    expect(after).toBe(null)
    expect(roam.children[0].climb).toBe('top')
  })

  it('does not step down into ground somebody took while it stood up there', () => {
    // Found by the cross-vendor review of 09.09.2026: the descent returned to the
    // foot it came up from without asking whether that ground was still free.
    // The hold is seconds long and the stone stands in the village, so the
    // traveller can walk right up to it — and the child then climbed down inside
    // him.
    const b = STAGE.boulder
    for (const seed of SEEDS) {
      const rand = mulberry32(seed)
      const s = createBankGame([{ x: b.x - 4, z: b.z + 3 }], rand, CFG)
      const c = s.children[0]
      let world = openWorld()
      let planted = false
      let followed = false
      let landed: { x: number; z: number } | null = null
      let biggestStep = 0
      for (let t = 0; t < 60 && !landed; t += 1 / 60) {
        const wasUp = c.climb !== 'none'
        const from = { x: c.x, z: c.z }
        stepBankGame(s, 1 / 60, CFG, STAGE, world, rand)
        if (c.climb === 'down') biggestStep = Math.max(biggestStep, Math.hypot(c.x - from.x, c.z - from.z))
        // The moment it is up on the stone, the traveller takes the exact spot it
        // climbed from and stays there.
        if (c.climb === 'top' && !planted) {
          planted = true
          world = openWorld({ x: c.footX, z: c.footZ, radius: 0.35 })
        }
        // …and then he FOLLOWS it: the second round of the same review found that
        // a landing chosen when the hold ended was never looked at again, so a
        // traveller who stepped onto it during the descent had the child set down
        // inside him. He moves onto the new foot halfway down.
        if (c.climb === 'down' && c.climbFor > CFG.climbSinkSeconds * 0.85 && !followed) {
          followed = true
          world = openWorld({ x: c.footX, z: c.footZ, radius: 0.35 })
        }
        if (wasUp && c.climb === 'none') landed = { x: c.x, z: c.z }
      }
      expect(planted).toBe(true)
      expect(followed).toBe(true)
      expect(landed).not.toBeNull()
      // It came down somewhere else, and clear of him.
      expect(insideStrangerBerth(world, CFG, landed!.x, landed!.z)).toBe(false)
      // AND IT WALKED DOWN rather than jumping. The traveller arrives at
      // nine tenths of the way down, which is where a descent read as a fraction
      // of the whole moved the child nine tenths of the way to the new foot in
      // one frame; a step that size is a teleport a hand's breadth above the
      // ground. Bounded by the round's own walking pace, generously.
      expect(biggestStep).toBeLessThan((CFG.walkPace * 3) / 60)
      // …and still at the stone, not carried off across the village.
      const out = Math.hypot(landed!.x - b.x, landed!.z - b.z)
      expect(out).toBeGreaterThan(b.radius)
      expect(out).toBeLessThan(b.radius + world.childRadius + CFG.climbApproach + 0.2)
    }
  })

  it('never opens the cycle out from under a child still standing on the stone', () => {
    // The word falls at the TOP of the climb, and by then the roaming phase's own
    // clock has usually run out — so the cycle was free to open on the very frame
    // the boulder was named, and `openCycle` put the climber back on the ground
    // mid-hold. What the player got was ROCK spoken by a child already walking
    // away from a rock he never saw it on. Replayed at a roaming phase far
    // shorter than the climb, which is the case that made it visible.
    const cfg: BankConfig = { ...CFG, roamSeconds: 0.1, roamSpread: 0 }
    const world = openWorld()
    const b = STAGE.boulder
    for (const seed of SEEDS) {
      const rand = mulberry32(seed)
      const s = createBankGame([{ x: b.x - 4, z: b.z + 3 }], rand, cfg)
      const c = s.children[0]
      let sawTop = false
      let leftRoamWhileUp = false
      let heldFor = 0
      for (let t = 0; t < 60; t += 1 / 60) {
        stepBankGame(s, 1 / 60, cfg, STAGE, world, rand)
        if (c.climb === 'top') {
          sawTop = true
          heldFor += 1 / 60
        }
        if (s.phase !== 'roam' && c.climb !== 'none') leftRoamWhileUp = true
        if (sawTop && s.phase !== 'roam') break
      }
      expect(sawTop).toBe(true)
      expect(leftRoamWhileUp).toBe(false)
      // …and the hold it got was its own full length, not whatever was left of a
      // phase that had already expired.
      expect(heldFor).toBeGreaterThan(cfg.climbHoldSeconds - 0.05)
    }
  })

  // THE CLIMB ITSELF (work-order 1080). What shipped before this point was a
  // flag: `climbing` went true for 0.35 s while the child stood 2.2 m from the
  // boulder's centre and the view lifted it 0.32 m where it stood. Every
  // assertion the round had was about the UTTERANCE — that it fell, in the
  // roaming phase, aimed at the boulder — so the picture could be nothing at all
  // and the suite stayed green. These are about the CHILD: where it walks, where
  // it ends up, how high, and for how long.
  it('walks the climber onto the stone, holds it up there and brings it down again', () => {
    const world = openWorld()
    const b = STAGE.boulder
    for (const seed of SEEDS) {
      const rand = mulberry32(seed)
      // One child, well clear of the stone, so the whole approach is played.
      const s = createBankGame([{ x: b.x - 6, z: b.z + 4 }], rand, CFG)
      const c = s.children[0]
      let approachStop = Infinity
      let onStoneSeconds = 0
      let atTopSeconds = 0
      let highest = 0
      let farthestWhileUp = 0
      let cameDown = false
      let footAt: { x: number; z: number } | null = null
      for (let t = 0; t < 120; t += 1 / 60) {
        const wasUp = c.climb !== 'none'
        stepBankGame(s, 1 / 60, CFG, STAGE, world, rand)
        if (!wasUp && c.climb === 'up') {
          // The approach ENDED here: outside the stone's own collider, close
          // enough that what follows is a step and not a leap.
          approachStop = Math.hypot(c.x - b.x, c.z - b.z)
          footAt = { x: c.footX, z: c.footZ }
        }
        if (c.climb !== 'none') {
          onStoneSeconds += 1 / 60
          if (c.climb === 'top') atTopSeconds += 1 / 60
          highest = Math.max(highest, c.lift)
          farthestWhileUp = Math.max(farthestWhileUp, Math.hypot(c.x - b.x, c.z - b.z))
        } else if (wasUp) {
          cameDown = true
          // Back on the ground, at the foot it climbed from.
          expect(c.lift).toBe(0)
          expect(Math.hypot(c.x - footAt!.x, c.z - footAt!.z)).toBeLessThan(1e-6)
          break
        }
      }
      // It walked to the stone rather than stopping a stride short of nothing:
      // the old approach ended at `reachDistance` (2.2 m) from the CENTRE.
      expect(approachStop).toBeGreaterThan(b.radius)
      expect(approachStop).toBeLessThan(b.radius + world.childRadius + CFG.climbApproach + 0.2)
      expect(approachStop).toBeLessThan(CFG.reachDistance)
      // It stood ON the top, not beside it, and never wandered off it.
      expect(highest).toBeCloseTo(b.height, 6)
      expect(farthestWhileUp).toBeLessThan(approachStop + 1e-6)
      // And it was up there long enough to be SEEN. The whole climb is the rise,
      // the hold and the descent; the shipped pose lasted 0.35 s.
      expect(atTopSeconds).toBeGreaterThan(CFG.climbHoldSeconds - 0.05)
      expect(onStoneSeconds).toBeGreaterThan(
        CFG.climbRiseSeconds + CFG.climbHoldSeconds + CFG.climbSinkSeconds - 0.1,
      )
      expect(onStoneSeconds).toBeLessThan(
        CFG.climbRiseSeconds + CFG.climbHoldSeconds + CFG.climbSinkSeconds + 0.1,
      )
      expect(cameDown).toBe(true)
      // Nobody may shove it off the stone while it is up there.
      expect(bankChildCanSeparate({ ...c, climb: 'top' } as typeof c)).toBe(false)
    }
  })

  it('holds a tagged child in its posture, and moves it only between runs', () => {
    let crouchedFrames = 0
    let movedWhileCrouched = 0
    let walkedAfterOut = 0
    for (const seed of SEEDS) {
    const rand = mulberry32(seed)
    const spots = Array.from({ length: 5 }, (_, i) => ({ x: STAGE.roam.x + i * 1.1, z: STAGE.roam.z }))
    const s = createBankGame(spots, rand, CFG)
    const world = openWorld()
    const set = createInhabitantSet()
    const bodies = createBodies(s.children.length, { scale: 0.55 })
    addBodies(set, bodies)
    const at = s.children.map((c) => ({ x: c.x, z: c.z }))
    const wasOut = s.children.map(() => false)
    // A child is judged on the frames it was ALREADY crouched at the start of:
    // the frame it is caught in it was still running, and it was running that
    // is caught.
    let was = s.children.map(() => false)
    for (let t = 0; t < 600; t += 1 / 60) {
      const before = was
      const walkedBefore = s.children.map((c) => c.walked)
      stepBankGame(s, 1 / 60, CFG, STAGE, world, rand)
      // The scene's integration order: write every body, separate the group,
      // then absorb the resolved positions. Crouched children remain in the set
      // as obstacles, but are not candidates for movement themselves.
      bodies.forEach((body, i) => {
        body.x = s.children[i].x
        body.z = s.children[i].z
      })
      separateGroup(
        set,
        bodies.filter((_, i) => bankChildCanSeparate(s.children[i])),
        1 / 60,
        balance.villageLife.separation,
        world,
      )
      bodies.forEach((body, i) => absorbSeparation(s.children[i], body))
      was = s.children.map((c) => c.crouched)
      s.children.forEach((c, i) => {
        const moved = Math.hypot(c.x - at[i].x, c.z - at[i].z)
        if (c.crouched) {
          wasOut[i] = true
          // It stands where it was tagged: no pace, and it is HELD, which is the
          // reading rather than a stall.
          expect(c.pace).toBe(0)
          expect(c.held).toBe(true)
          expect(s.phase === 'run' || (s.phase === 'part' && s.endFor > 0)).toBe(true)
          if (before[i]) {
            crouchedFrames++
            if (moved > 1e-9) movedWhileCrouched++
          }
        }
        // …and once the readable ending is over, the same child walks home.
        if (wasOut[i] && !c.crouched && s.phase !== 'run' && c.walked > walkedBefore[i]) {
          walkedAfterOut++
        }
        at[i] = { x: c.x, z: c.z }
      })
    }
    }
    expect(crouchedFrames).toBeGreaterThan(60)
    expect(movedWhileCrouched).toBe(0)
    expect(walkedAfterOut).toBeGreaterThan(0)
  })

  it('walks round the traveller instead of stopping the game, and gives him the wider berth', () => {
    // The stranger stands in the middle of the lane, squarely on the line the
    // runners take. The game must go on, and nobody may come nearer than a
    // villager's body plus the extra berth.
    const stranger = { x: 0, z: 0, radius: 0.35 }
    const world = openWorld(stranger)
    const { runs: blocked, log } = replayAll(600, { world })
    expect(blocked.reduce((n, r) => n + r.s.runs, 0)).toBeGreaterThan(2)
    expect(log.said.some((u) => u.moment === 'arrival')).toBe(true)
    // …and the same replays without him produce a game too, so the case is
    // measuring the swerve rather than a settlement that never plays.
    const { runs: open } = replayAll(600)
    expect(open.reduce((n, r) => n + r.s.runs, 0)).toBeGreaterThan(2)
  })

  it('keeps its distance from the stranger frame by frame', () => {
    const stranger = { x: 0, z: 0, radius: 0.35 }
    const world = openWorld(stranger)
    const rand = mulberry32(13)
    const spots = Array.from({ length: 4 }, (_, i) => ({ x: STAGE.roam.x + i * 1.2, z: STAGE.roam.z }))
    const s = createBankGame(spots, rand, CFG)
    let nearest = Infinity
    for (let t = 0; t < 600; t += 1 / 60) {
      stepBankGame(s, 1 / 60, CFG, STAGE, world, rand)
      for (const c of s.children) nearest = Math.min(nearest, Math.hypot(c.x - stranger.x, c.z - stranger.z))
    }
    // A villager gets the two body radii; the stranger gets the calibratable
    // extra on top. Removing `strangerBerth` from the obstacle predicate makes
    // this measured extra clearance collapse to zero and fails here.
    const villagerBerth = stranger.radius + world.childRadius
    expect(nearest - villagerBerth).toBeGreaterThanOrEqual(CFG.strangerBerth - 1e-6)
    // …and they really did come past him: a group that never left its quarter
    // would clear him trivially.
    expect(nearest).toBeLessThan((villagerBerth + CFG.strangerBerth) * 4)
  })

  it('speaks one utterance at a time, with the constant gap between two', () => {
    const rand = mulberry32(21)
    const spots = Array.from({ length: 4 }, (_, i) => ({ x: STAGE.roam.x + i * 1.2, z: STAGE.roam.z }))
    const s = createBankGame(spots, rand, CFG)
    const world = openWorld()
    let last = -Infinity
    let closest = Infinity
    let count = 0
    for (let t = 0; t < 600; t += 1 / 60) {
      const u = stepBankGame(s, 1 / 60, CFG, STAGE, world, rand)
      if (!u) continue
      count++
      if (Number.isFinite(last)) closest = Math.min(closest, s.clock - last)
      last = s.clock
    }
    expect(count).toBeGreaterThan(10)
    expect(closest).toBeGreaterThanOrEqual(CFG.utteranceGapSeconds - 1e-6)
  })

  it('holds still for a dt of zero or less, and for a group of none', () => {
    const rand = mulberry32(1)
    const s = createBankGame([{ x: 0, z: 0 }], rand, CFG)
    const world = openWorld()
    expect(stepBankGame(s, 0, CFG, STAGE, world, rand)).toBeNull()
    expect(stepBankGame(s, -1, CFG, STAGE, world, rand)).toBeNull()
    expect(s.clock).toBe(0)
    const empty = createBankGame([], rand, CFG)
    expect(stepBankGame(empty, 1 / 60, CFG, STAGE, world, rand)).toBeNull()
  })

  it('names the ends and their stations the way the round reads them', () => {
    expect(otherEnd('upstream')).toBe('downstream')
    expect(otherEnd('downstream')).toBe('upstream')
    // Running TO the upstream rock is UPSTREAM; the mirror the other way.
    expect(wordToward('upstream')).toBe('UPSTREAM')
    expect(wordToward('downstream')).toBe('DOWNSTREAM')
    expect(rockAt(STAGE, 'upstream')).toEqual(STAGE.upstream)
    // A station stands off its rock on the side facing the other one, so nobody
    // waits with the stone between him and the run.
    const st = stationAt(STAGE, 'upstream', 1, CFG)
    expect(st.x).toBeGreaterThan(STAGE.upstream.x)
    expect(Math.hypot(st.x - STAGE.upstream.x, st.z - STAGE.upstream.z)).toBeGreaterThan(CFG.standOff - 1e-6)
    // Slots fan sideways and then stack back, so a group of four is a line.
    const a = stationAt(STAGE, 'upstream', 0, CFG)
    const b = stationAt(STAGE, 'upstream', 2, CFG)
    expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(CFG.stationSpacing)
  })

})

/**
 * THE LONG-RUN SPEECH ALARM (point 589), which moved here with the words. It
 * used to watch the situation catalogue, and the five-word rebuild deleted that
 * catalogue and left the alarm — and its debug slider — watching a producer that
 * could no longer produce anything at all. The bank round is what speaks now, so
 * the window is judged against the round's own longest legitimate quiet spell.
 */
describe('the round is watched for going silent (point 589)', () => {
  beforeEach(() => {
    resetDevAsserts()
  })
  afterEach(() => {
    resetDevAsserts()
  })

  const codes = () =>
    ((window as unknown as { __assertLog?: Array<{ code: string }> }).__assertLog ?? []).map(
      (e) => e.code,
    )

  it('stays quiet over a healthy group, well past its own window', () => {
    replayAll(CFG.roundSilenceSeconds + 60)
    expect(codes()).toEqual([])
  })

  it('never fires on a group of one, who has nobody to play the round with', () => {
    replay(CFG.roundSilenceSeconds * 2, { count: 1 })
    expect(codes()).toEqual([])
  })

  it('FIRES when a group that could play says nothing for its window', () => {
    // A round the phases can never carry forward: every child is held where it
    // stands, so no rock is ever reached, no call is ever made, and only the
    // RESULT — nothing said — catches it. The timers all keep running.
    const frozen: BankWorld = {
      ...openWorld(),
      blocked: () => true,
      nudge: (x, z) => ({ x, z, found: false }),
    }
    const cfg: BankConfig = { ...CFG, roundSilenceSeconds: 30 }
    replay(cfg.roundSilenceSeconds + 20, { cfg, world: frozen })
    expect(codes().join(' ')).toContain('bank-speech-silent')
  })

  it('counts the round it watched — the window is not simply never armed', () => {
    const { s } = replay(180)
    expect(s.speech.produced).toBeGreaterThan(1)
    expect(s.speech.silence).toBeLessThanOrEqual(CFG.roundSilenceSeconds)
  })
})


describe('the tapping child`s hand is ON the stone it names (work-order 1065)', () => {
  it('speaks the tap only from a spot its hand reaches the drawn flank from', () => {
    for (const seed of SEEDS) {
      const { log } = replay(220, { seed })
      const taps = log.when.filter((w) => w.u.moment === 'tap')
      expect(taps.length).toBeGreaterThan(0)
      for (const tap of taps) {
        // The rock the tap names is the one the run is TOWARDS, which is the
        // one the speaker is standing at.
        const end: BankEnd = tap.direction === 'UPSTREAM' ? 'upstream' : 'downstream'
        const spoke = { x: tap.speakerX, z: tap.speakerZ }
        const reach = touchReach(STAGE, end, spoke)!
        expect(reach).not.toBeNull()
        expect(Math.abs(reach.gap)).toBeLessThanOrEqual(TOUCH_GAP)
        // ...and that is much nearer than the waiting station it used to hold.
        expect(dist(spoke, rockAt(STAGE, end))).toBeLessThan(CFG.standOff - 1)
      }
    }
  })

  it('carries the touch, its solved arm and the whole tap interval as its hold', () => {
    const { log } = replay(220, { seed: SEEDS[0] })
    const taps = log.said.filter((u) => u.moment === 'tap')
    expect(taps.length).toBeGreaterThan(0)
    for (const tap of taps) {
      expect(tap.gesture).toBe('touch')
      expect(tap.hold).toBe(CFG.tapPauseSeconds)
      // Straight ahead: a figure lays its hand on what it faces.
      expect(tap.arm?.bearing).toBe(0)
      expect(tap.arm?.elevation).toBeGreaterThan(0)
      // The aim's height is where the hand meets the stone, not a nominal 0.6.
      expect(tap.aim.y).toBeGreaterThan(0.2)
      expect(tap.aim.y).toBeLessThan(0.8)
    }
  })

  it('opens the run SILENTLY where the stone cannot be reached, rather than tapping the air', () => {
    // A stage whose stones present no flank at all: nothing to lay a hand on.
    const unreachable: BankStage = { ...STAGE, flank: () => 0 }
    const { log, s } = replay(220, { seed: SEEDS[0], stage: unreachable })
    expect(log.said.filter((u) => u.moment === 'tap')).toHaveLength(0)
    // ...and the game goes on: runs are still played and the other words fall.
    expect(s.runs).toBeGreaterThan(0)
    expect(log.said.filter((u) => u.moment === 'announce').length).toBeGreaterThan(0)
  })

  it('sends ONE child to the stone and leaves the rest at their stations', () => {
    const { s } = replay(70, { seed: SEEDS[0] })
    if (s.phase !== 'gather' && s.phase !== 'regroup') return
    const near = s.children.filter((c, i) => {
      const end = otherEnd(s.from)
      return i !== s.tapper && dist(c, rockAt(STAGE, end)) < CFG.standOff - 0.5
    })
    expect(near).toHaveLength(0)
  })
})


describe('arriving runners name the far stone by contact', () => {
  function arriving(spots: Array<{ x: number; z: number }>, cfg = CFG) {
    const rand = mulberry32(33)
    const s = createBankGame([{ x: -20, z: 0 }, ...spots], rand, cfg)
    s.phase = 'run'
    s.phaseFor = cfg.runSeconds
    s.from = 'upstream'
    s.direction = 'DOWNSTREAM'
    s.runsThisCycle = 1
    s.children[0].role = 'catcher'
    s.children[0].madeTag = true
    return { s, rand }
  }

  it('offers every play-rock ROCK with a solved touch at the speaker`s own spot over a Bambara cycle', () => {
    const layout = buildLayout('bambara-village', 3791639114)
    const rocks = layout.playRocks!
    const bank = layout.bank!
    const quarter = layout.playGround!
    const stage: BankStage = {
      upstream: rocks.upstream, downstream: rocks.downstream,
      flank: playRockFlank(rocks),
      water: { x: bank.nx * bank.distance, z: bank.nz * bank.distance },
      boulder: climbBoulder(layout.rocks, quarter, CFG.climbableRockTop)!,
      roam: quarter,
    }
    // Replay the actual stage and drawn rock colliders. Village routing and
    // the live crowd are covered by tagShuffle and the reviewer's browser run.
    const rockColliders = layout.colliders.filter((c) =>
      [rocks.upstream, rocks.downstream].some((r) => dist(c, r) < 0.01))
    const world = { ...openWorld(), radius: 100,
      blocked: (x: number, z: number) => !standingClear(rockColliders, x, z, WALKER_RADIUS),
    }
    const { s, log } = replay(360, { seed: 3791639114, stage, world, cfg: { ...CFG, utteranceGapSeconds: 0 } })
    expect(s.cycles).toBeGreaterThan(0)
    const words = log.when.filter(({ u }) => u.at === 'rock' && u.concept === 'ROCK')
    expect(new Set(words.map(({ u }) => u.moment))).toEqual(new Set(['tap', 'arrival']))
    for (const { u, speakerX: x, speakerZ: z } of words) {
      const end = dist(u.aim, stage.upstream) < 0.01 ? 'upstream' : 'downstream'
      const reach = touchReach(stage, end, { x, z })!
      expect(reach).not.toBeNull()
      expect(Math.abs(reach.gap)).toBeLessThanOrEqual(TOUCH_GAP)
      expect(u.gesture).toBe('touch')
      expect(u.arm).toEqual({ bearing: 0, elevation: reach.elevation })
    }
  })

  it('becomes safe at the old radius, ends the run, then walks the last metre before speaking', () => {
    const { s, rand } = arriving([{ x: 8, z: 0 }])
    const c = s.children[1]
    const first = stepBankGame(s, 1 / 60, CFG, STAGE, openWorld(), rand)
    expect(first).toBeNull()
    expect(s.phase).toBe('regroup')
    expect(s.phaseFor).toBe(CFG.regroupSeconds)
    expect(c.arrival).not.toBeNull()
    expect(dist(c, STAGE.downstream)).toBeGreaterThan(1.8)
    let word: BankUtterance | null = null
    for (let k = 0; k < 600 && !word; k++) word = stepBankGame(s, 1 / 60, CFG, STAGE, openWorld(), rand)
    expect(word?.moment).toBe('arrival')
    expect(Math.abs(touchReach(STAGE, 'downstream', c)!.gap)).toBeLessThanOrEqual(TOUCH_GAP)
    expect(s.tags).toBe(0)
  })

  it('arrives silently when the far flank is blocked', () => {
    const { s, rand } = arriving([{ x: 8, z: 0 }])
    const world = { ...openWorld(), blocked: (x: number, z: number) => dist({ x, z }, STAGE.downstream) < 1.7 }
    const said: BankUtterance[] = []
    for (let k = 0; k < 120; k++) {
      const u = stepBankGame(s, 1 / 60, CFG, STAGE, world, rand)
      if (u) said.push(u)
    }
    expect(s.phase).toBe('regroup')
    expect(s.tags).toBe(0)
    expect(s.children[1].arrival).toBeNull()
    expect(said.filter((u) => u.moment === 'arrival')).toHaveLength(0)
  })

  it.each([0.7, 2.3])('keeps contact for the configured %s seconds across the side swap', (seconds) => {
    const cfg = { ...CFG, arrivalHoldSeconds: seconds }
    const { s, rand } = arriving([{ x: 8, z: 0 }], cfg)
    const c = s.children[1]
    const dt = 1 / 60
    let word: BankUtterance | null = null
    for (let k = 0; k < 600 && !word; k++) word = stepBankGame(s, dt, cfg, STAGE, openWorld(), rand)
    expect(word?.moment).toBe('arrival')
    expect(word?.hold).toBe(seconds)
    expect(c.arrival?.holdFor).toBe(seconds)
    const at = { x: c.x, z: c.z, facing: c.facing }
    let elapsed = 0
    while (c.arrival && elapsed < seconds + 1) {
      expect(bankChildCanSeparate(c)).toBe(false)
      stepBankGame(s, dt, cfg, STAGE, openWorld(), rand)
      elapsed += dt
      if (c.arrival) {
        expect({ x: c.x, z: c.z, facing: c.facing }).toEqual(at)
        expect(c.held).toBe(true)
        expect(c.pace).toBe(0)
      }
    }
    expect(elapsed).toBeGreaterThanOrEqual(seconds)
    expect(elapsed).toBeLessThan(seconds + dt * 3)
    expect(c.arrival).toBeNull()
    expect(bankChildCanSeparate(c)).toBe(true)
  })

  it('reserves distinct stands or waits when several runners arrive together', () => {
    const cfg = { ...CFG, utteranceGapSeconds: 0, catchDistance: -1 }
    const { s, rand } = arriving([{ x: 8, z: -0.7 }, { x: 8, z: 0 }, { x: 8, z: 0.7 }], cfg)
    const spoken = new Set<number>()
    const touched = new Set<number>()
    for (let k = 0; k < 600; k++) {
      const u = stepBankGame(s, 1 / 60, cfg, STAGE, openWorld(), rand)
      if (u?.moment === 'arrival') spoken.add(u.speaker)
      const holding = s.children.filter((c) => c.arrival?.holdFor != null)
      s.children.forEach((c, i) => { if (c.arrival?.holdFor != null) touched.add(i) })
      for (const c of holding) {
        for (const other of s.children) {
          if (other !== c) expect(dist(c, other)).toBeGreaterThanOrEqual(0.6 - 1e-6)
        }
      }
    }
    expect(spoken.size).toBeGreaterThanOrEqual(1)
    expect(touched.size).toBe(3)
  })
})
