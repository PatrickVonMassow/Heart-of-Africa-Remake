// THE CHILDREN'S BANK GAME, REPLAYED (work-order 687).
//
// The spec's own test list, one case each: the phases alternate, the caller
// becomes the first catcher, the direction alternates with the side swap, ROCK
// falls once with nobody arriving and once outside the game altogether, a
// direction word falls once with no rock as its target, the run and the cycle
// end exactly as item 3 says, no utterance reduces a playing child's pace, and a
// tagged child holds its posture and moves only between runs.
//
// The stage here is a bare one — two rocks 20 m apart on open ground, which is
// the shipped stretch measured in `bankStage.test.ts` — so what these cases pin
// is the ROUND. The settlement's own layout, colliders and crowd are what
// `tagShuffle.test.ts` replays.

import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { floorPace } from '../../systems/pursuit'
import { mulberry32 } from '../../world/noise'
import {
  bankChildCanSeparate,
  createBankGame,
  otherEnd,
  rockAt,
  stationAt,
  stepBankGame,
  wordToward,
  type BankConfig,
  type BankStage,
  type BankState,
  type BankUtterance,
  type BankWorld,
} from './bankGame'
import { absorbSeparation } from './tagGame'
import {
  addBodies,
  createBodies,
  createInhabitantSet,
  separateGroup,
} from './inhabitantBodies'

const CFG: BankConfig = { ...balance.villageLife.tag, ...balance.villageLife.bankGame }

/** Two rocks 20 m apart along x, the water to one side, a boulder in the
 *  children's quarter well away from both. */
const STAGE: BankStage = {
  upstream: { x: -10, z: 0 },
  downstream: { x: 10, z: 0 },
  water: { x: 0, z: 8 },
  boulder: { x: 2, z: -22 },
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
    climbing: boolean
  }>
}

/** Runs the group for `seconds` and records what it said and did. */
function replay(
  seconds: number,
  options: { seed?: number; count?: number; world?: BankWorld; cfg?: BankConfig } = {},
): { s: BankState; log: Log } {
  const cfg = options.cfg ?? CFG
  const count = options.count ?? 4
  const rand = mulberry32(options.seed ?? 7)
  const spots = Array.from({ length: count }, (_, i) => ({
    x: STAGE.roam.x + Math.cos((i / count) * Math.PI * 2) * 2.4,
    z: STAGE.roam.z + Math.sin((i / count) * Math.PI * 2) * 2.4,
  }))
  const s = createBankGame(spots, rand, cfg)
  const world = options.world ?? openWorld()
  const log: Log = { said: [], phases: [], when: [] }
  const dt = 1 / 60
  for (let t = 0; t < seconds; t += dt) {
    const before = s.phase
    const u = stepBankGame(s, dt, cfg, STAGE, world, rand)
    if (s.phase !== before || log.phases.length === 0) log.phases.push(s.phase)
    if (u) {
      log.said.push(u)
      log.when.push({
        u,
        phase: s.phase,
        arrivals: s.children.filter((c) => c.arrived).length,
        direction: s.direction,
        cycle: s.cycles,
        climbing: s.children[u.speaker]?.climbing ?? false,
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
      expect(b.climbing).toBe(true)
      expect(Math.hypot(b.u.aim.x - STAGE.boulder!.x, b.u.aim.z - STAGE.boulder!.z)).toBeLessThan(1e-6)
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

  it('emits the catcher`s tap on the exact frame the run opens', () => {
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
  })

  it('says a direction word once per cycle with no rock as its target', () => {
    const { log } = replayAll(600)
    const partings = log.said.filter((u) => u.moment === 'parting')
    expect(partings.length).toBeGreaterThan(0)
    const stretch = Math.hypot(
      STAGE.upstream.x - STAGE.downstream.x,
      STAGE.upstream.z - STAGE.downstream.z,
    )
    for (const p of partings) {
      expect(p.concept === 'UPSTREAM' || p.concept === 'DOWNSTREAM').toBe(true)
      expect(p.at).toBe('bank')
      // Its aim lies down the bank, clear of BOTH rocks by half the stretch —
      // it is not a rock the child is pointing at.
      for (const end of ['upstream', 'downstream'] as const) {
        const r = rockAt(STAGE, end)
        expect(Math.hypot(p.aim.x - r.x, p.aim.z - r.z)).toBeGreaterThan(stretch / 2)
      }
    }
    // …and it is the OPPOSITE of the run that just ended.
    for (const run of replayAll(600).runs) {
      const order = run.log.said.filter((u) => u.moment === 'announce' || u.moment === 'parting')
      for (let i = 1; i < order.length; i++) {
        if (order[i].moment !== 'parting') continue
        expect(order[i].concept).not.toBe(order[i - 1].concept)
      }
    }
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

  it('keeps a moving speaker at the round`s commanded pace while it speaks', () => {
    const cfg: BankConfig = { ...CFG, utteranceGapSeconds: 0 }
    const world = openWorld()

    // Put one runner at the far rock so this exact step is both its arrival and
    // its utterance, independent of a replay seed.
    const runRand = mulberry32(3)
    const run = createBankGame([STAGE.upstream, STAGE.downstream], runRand, cfg)
    run.phase = 'run'
    run.phaseFor = cfg.runSeconds
    run.from = 'upstream'
    run.direction = 'DOWNSTREAM'
    run.children[0].role = 'catcher'
    run.children[1].role = 'runner'
    const arrival = stepBankGame(run, 1 / 60, cfg, STAGE, world, runRand)
    expect(arrival?.moment).toBe('arrival')
    expect(arrival?.speaker).toBe(1)
    // Mutating `say` to hold its speaker or zero its pace fails these exact
    // action-frame checks; they do not compare the value with itself.
    expect(run.children[1].pace).toBeGreaterThanOrEqual(floorPace(cfg))
    expect(run.children[1].held).toBe(false)

    // Likewise, start the chosen climber on the ordinary boulder: ROCK and the
    // commanded walking pace must coexist on this frame.
    const roamRand = mulberry32(5)
    const roam = createBankGame([STAGE.boulder], roamRand, cfg)
    const boulder = stepBankGame(roam, 1 / 60, cfg, STAGE, world, roamRand)
    expect(boulder?.moment).toBe('boulder')
    expect(boulder?.speaker).toBe(0)
    expect(roam.children[0].pace).toBe(cfg.walkPace)
    expect(roam.children[0].held).toBe(false)
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
          expect(s.phase).toBe('run')
          if (before[i]) {
            crouchedFrames++
            if (moved > 1e-9) movedWhileCrouched++
          }
        }
        // …and once the run is over, the same child walks to the catchers' side.
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
