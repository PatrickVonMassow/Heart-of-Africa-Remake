// THE FISHERMEN'S FIRE AND THE TWO BASKETS (work-order 1245 items 4-6): the
// boat and the fire run together over many rounds, and what the user asked for
// is measured on the run — two baskets that never become more or get lost,
// neither side waiting long, a rack at a steady fill, and the pounding pair
// eating at it every few minutes (point 1282).

import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { insidePlace } from './boundary'
import { standingClear, WALKER_RADIUS } from './collision'
import { sharedLayout } from './layoutHarness'
import { PLACE_RADIUS } from './layout'
import { buildRiverBank, standsOnGroundPlate } from './riverBank'
import { basketRingViolation } from './fishBaskets'
import {
  createFishFire,
  createFisheryRing,
  fisherySites,
  gutSecondsFor,
  stepFishFire,
  stepPoundingDuo,
  walkSeconds,
} from './fishFire'
import { canoeCycleSeconds, canoeLane, canoeRangeGap, createCanoe, stepCanoe, type CanoeWord } from './villagerCanoe'
import { mulberry32 } from '../../world/noise'
import { fisheryStaticColliders } from './fisheryColliders'
import { fireHasCookShelter } from '../../systems/cookShelter'

beforeAll(setupGeodata)

const canoeCfg = balance.villageLife.canoe
const cfg = balance.villageLife.fishFire
const OBEY = 2.2
const RIVER_VILLAGES = PLACES.filter((p) => p.kind === 'village' && buildRiverBank(p, PLACE_RADIUS)).map((p) => p.id)

/** Seconds from the canoe's start to its first full basket on the bank. */
function untilFirstFull(): number {
  const span = canoeCfg.laneEnd - canoeCfg.laneStart
  const fish = (canoeCfg.catchMin + canoeCfg.catchMax) / 2
  return span / canoeCfg.upstreamSpeed + OBEY + canoeCfg.turnSeconds + span / canoeCfg.downstreamSpeed +
    canoeCfg.haulSeconds + canoeCfg.landSeconds + 2 * canoeCfg.stepSeconds + 2 * canoeCfg.liftSeconds + fish * canoeCfg.fillSecondsPerFish
}

/** The boat and the fire together, for `rounds` of the boat. */
function simulate(options: { village?: string; rounds?: number; seed?: number; held?: (word: CanoeWord, t: number) => boolean } = {}) {
  const village = options.village ?? 'bambara-village'
  const bank = buildRiverBank(PLACES.find((p) => p.id === village)!, PLACE_RADIUS)!
  const lane = canoeLane(bank)
  const sites = fisherySites(bank, lane)
  const rand = mulberry32(options.seed ?? 1245)
  const ring = createFisheryRing()
  const canoe = createCanoe(lane)
  const fire = createFishFire(sites, ring, untilFirstFull(), cfg, rand)
  const round = canoeCycleSeconds(canoeCfg, undefined, OBEY)
  const dt = 0.05
  let t = 0
  const rackSeen: number[] = []
  const duoStarts: number[] = []
  let lastDuo = fire.duo.phase
  let caught = 0
  let lastRound = 0
  const roundWaits: number[] = []
  let boatWaitAt = 0
  while (canoe.rounds < (options.rounds ?? 12) && t < 3600 * 3) {
    const beforeHaul = canoe.phase
    stepCanoe(
      canoe,
      lane,
      ring,
      { say: (w) => (options.held?.(w, t) ? 'held' : 'said'), obeyDelay: () => OBEY },
      dt,
      canoeCfg,
      rand,
    )
    if (beforeHaul === 'down' && canoe.phase === 'haul') caught += canoe.catch
    stepFishFire(fire, sites, ring, dt, round, cfg)
    stepPoundingDuo(fire, sites, dt, cfg, rand)
    t += dt
    expect(basketRingViolation(ring)).toBeNull()
    if (canoe.rounds !== lastRound) {
      roundWaits.push(canoe.basketWait - boatWaitAt)
      boatWaitAt = canoe.basketWait
      lastRound = canoe.rounds
    }
    if (t > round * 2) rackSeen.push(fire.rack.length)
    if (fire.duo.phase === 'settle' && lastDuo === 'pound') duoStarts.push(t)
    lastDuo = fire.duo.phase
  }
  return { bank, lane, sites, ring, canoe, fire, t, rackSeen, duoStarts, caught, round, roundWaits }
}

describe('the two baskets (work-order 1245 item 4)', () => {
  it('stay exactly two, never lost, and every fish is accounted for', () => {
    const { ring, canoe, fire, caught } = simulate({ rounds: 15 })
    expect(ring.baskets).toHaveLength(2)
    expect(new Set(ring.baskets.map((b) => b.id))).toEqual(new Set([0, 1]))
    // Caught fish all end somewhere: in the hull, a basket, on the board, the
    // grill, the rack, the storage basket or eaten. (The fire began with its
    // own `startFish` in a basket and a filled rack, which count in too.)
    const inBaskets = ring.baskets.reduce((n, b) => n + b.fish, 0)
    const start = cfg.startFish + 2 + cfg.rackFill + cfg.storageStart
    const now = canoe.inHull + inBaskets + fire.board + fire.grill.length + fire.rack.length + fire.storage + fire.eaten + fire.duo.women.filter((w) => w.fish > 0).length
    expect(now).toBe(caught + start)
  })

  it('circulate: each basket is filled at the bank and carried to the fire in turn', () => {
    const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const sites = fisherySites(bank, lane)
    const ring = createFisheryRing()
    const canoe = createCanoe(lane)
    const rand = mulberry32(7)
    const fire = createFishFire(sites, ring, untilFirstFull(), cfg, rand)
    const round = canoeCycleSeconds(canoeCfg, undefined, OBEY)
    const carried: number[] = []
    let lastCarried: number | null = null
    for (let i = 0; i < 40 * 60 * 20 && carried.length < 8; i++) {
      stepCanoe(canoe, lane, ring, { say: () => 'said', obeyDelay: () => OBEY }, 0.05, canoeCfg, rand)
      stepFishFire(fire, sites, ring, 0.05, round, cfg)
      const held = ring.baskets.find((b) => b.at === 'carrier' && b.fish > 0)
      if (held && held.id !== lastCarried) carried.push(held.id)
      lastCarried = held?.id ?? null
    }
    expect(carried.length).toBeGreaterThanOrEqual(6)
    // Alternating: 0, 1, 0, 1 ... — the rotation, not one basket shuttling.
    for (let i = 1; i < carried.length; i++) expect(carried[i]).not.toBe(carried[i - 1])
  })
})

describe('the timing: nobody waits long for the other (work-order 1245 item 4)', () => {
  it.each(RIVER_VILLAGES)('%s: the carrier and the boat each wait at most the budget per round on average', (village) => {
    const { fire, roundWaits } = simulate({ village, rounds: 14 })
    const waits = fire.carrier.waits.slice(1) // the first round starts mid-way
    expect(waits.length).toBeGreaterThanOrEqual(10)
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
    expect(mean(waits)).toBeLessThanOrEqual(cfg.waitBudgetSeconds)
    expect(mean(roundWaits)).toBeLessThanOrEqual(cfg.waitBudgetSeconds)
    // Waiting is the fallback, never the plan: the carrier does not stand at the
    // bank for a whole unload most rounds, and the boat hardly ever waits.
    expect(cfg.waitBudgetSeconds).toBe(15)
    expect(roundWaits.filter((w) => w > 0.5).length).toBeLessThanOrEqual(1)
  })

  it('holds when the floor keeps some words waiting', () => {
    // A third of the words held for five seconds before they are said.
    let heldUntil = -1
    let n = 0
    const { fire, roundWaits, canoe } = simulate({
      rounds: 12,
      held: (_w, t) => {
        if (heldUntil < 0 || t > heldUntil + 20) {
          heldUntil = n++ % 3 === 0 ? t + 5 : t
        }
        return t < heldUntil
      },
    })
    // The rounds really ran — a word held for ever would stall the boat and
    // leave the averages below over empty samples.
    expect(canoe.rounds).toBe(12)
    expect(fire.carrier.waits.length).toBeGreaterThanOrEqual(10)
    expect(roundWaits.length).toBe(12)
    const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length
    expect(mean(fire.carrier.waits.slice(1))).toBeLessThanOrEqual(cfg.waitBudgetSeconds)
    expect(mean(roundWaits)).toBeLessThanOrEqual(cfg.waitBudgetSeconds)
  })

  it('the carrier is first back at the bank the planned lead before the first full basket', () => {
    const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const sites = fisherySites(bank, lane)
    const ring = createFisheryRing()
    const untilFull = 140
    const fire = createFishFire(sites, ring, untilFull, cfg, mulberry32(3))
    const dt = 0.05
    let t = 0
    while (fire.carrier.phase !== 'waitBank' && t < 400) {
      stepFishFire(fire, sites, ring, dt, 139, cfg)
      t += dt
    }
    expect(t).toBeCloseTo(untilFull - cfg.carrierLeadSeconds, 0)
  })

  it('gutting fills the gap, and never falls below a readable minimum per fish', () => {
    const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const sites = fisherySites(bank, lane)
    const round = canoeCycleSeconds(canoeCfg, undefined, OBEY)
    const g = gutSecondsFor(round, 6, sites)
    expect(g + 2 * walkSeconds(sites) + 3 * cfg.liftSeconds + cfg.carrierLeadSeconds).toBeCloseTo(round, 6)
    expect(gutSecondsFor(10, 6, sites)).toBe(6 * cfg.gutMinSecondsPerFish)
  })
})

describe('the griller, the rack and the pounding pair (work-order 1245 items 5 and 6, point 1282)', () => {
  it('keeps the rack at a roughly constant fill, packing the driest into the storage basket', () => {
    const { rackSeen, fire } = simulate({ rounds: 15 })
    expect(rackSeen.length).toBeGreaterThan(1000)
    for (const n of rackSeen) {
      // Lowest just after the pounding pair has taken a fish each.
      expect(n).toBeGreaterThanOrEqual(cfg.rackFill - 1 - balance.villageLife.mortar.pounders)
      expect(n).toBeLessThanOrEqual(cfg.rackFill)
    }
    expect(fire.storage).toBeGreaterThan(cfg.storageStart)
    expect(fire.smoked).toBeGreaterThan(50)
    // Every fish was turned on the embers before it went on the rack.
    expect(fire.unturned).toBe(0)
    // The board never backs up: the griller keeps pace with the catch.
    expect(fire.board).toBeLessThanOrEqual(canoeCfg.catchMax)
  })

  it('the pair comes every few minutes, each takes one fish, eats it and they go back', () => {
    const { duoStarts, fire, t } = simulate({ rounds: 15 })
    expect(duoStarts.length).toBeGreaterThanOrEqual(3)
    // Two fish a visit: one for each woman.
    expect(fire.eaten).toBe(2 * fire.duo.visits)
    expect(fire.duo.visits).toBeGreaterThanOrEqual(Math.floor(t / (cfg.duoIntervalSeconds * (1 + cfg.duoIntervalSpread) + 80)))
    for (let i = 1; i < duoStarts.length; i++) {
      const gap = duoStarts[i] - duoStarts[i - 1]
      // Their interval, plus the walk there and back and the eating itself.
      expect(gap).toBeGreaterThanOrEqual(cfg.duoIntervalSeconds * (1 - cfg.duoIntervalSpread) + cfg.eatSeconds)
      expect(gap).toBeLessThanOrEqual(cfg.duoIntervalSeconds * (1 + cfg.duoIntervalSpread) + cfg.eatSeconds + 60)
    }
    // Every few minutes, as asked: two to five minutes between visits.
    expect(cfg.duoIntervalSeconds).toBeGreaterThanOrEqual(120)
    expect(cfg.duoIntervalSeconds).toBeLessThanOrEqual(300)
  })
})

describe('where the fire stands (work-order 1245 item 4)', () => {
  const SEEDS = [7, 42, 4711, 1425108822]
  it.each(RIVER_VILLAGES.flatMap((id) => SEEDS.map((seed) => [id, seed] as const)))(
    '%s @%i: every stand is walkable flat ground, and the walks between them are clear',
    (id, seed) => {
      const layout = sharedLayout(id, seed)
      const bank = layout.bank!
      const lane = canoeLane(bank)
      const sites = fisherySites(bank, lane)
      // The village's solids, without the fishers' own (point 1275): those are
      // the scene asked about here, and its figures stand at them by design.
      const own = fisheryStaticColliders(sites, bank, fireHasCookShelter(PLACES.find((p) => p.id === id)!.peopleId))
      const others = layout.colliders.filter((c) => !own.some((o) => JSON.stringify(o) === JSON.stringify(c)))
      expect(others.length, 'the fishers\' colliders are all in the set').toBe(layout.colliders.length - own.length)
      const stands = {
        carrierAtFire: sites.carrierAtFire,
        carrierAtBank: sites.carrierAtBank,
        griller: sites.griller,
        duoMortar: sites.duoMortar,
        ...Object.fromEntries(sites.duoStands.map((p, i) => [`duoStand${i}`, p])),
        ...Object.fromEntries(sites.duoAtRack.map((p, i) => [`duoAtRack${i}`, p])),
        fire: sites.fire,
        rack: sites.rack,
        storage: sites.storage,
      }
      for (const [name, p] of Object.entries(stands)) {
        expect(insidePlace(layout, p.x, p.z, 2 * WALKER_RADIUS), `${name} inside`).toBe(true)
        expect(standsOnGroundPlate(bank, p.x, p.z, WALKER_RADIUS), `${name} on the plate`).toBe(true)
        expect(standingClear(others, p.x, p.z, WALKER_RADIUS), `${name} clear`).toBe(true)
      }
      // The carrier's and both pounding women's walks cross nothing solid: the
      // fishers' own solids count too, except one a walk's end stands at by design.
      const walks = [[sites.carrierAtFire, sites.carrierAtBank], ...sites.duoStands.map((p, i) => [p, sites.duoAtRack[i]])] as const
      for (const [a, b] of walks) {
        const path = [...others, ...own.filter((c) => standingClear([c], a.x, a.z, WALKER_RADIUS) && standingClear([c], b.x, b.z, WALKER_RADIUS))]
        for (let k = 0; k <= 40; k++) {
          const x = a.x + (b.x - a.x) * (k / 40)
          const z = a.z + (b.z - a.z) * (k / 40)
          expect(standingClear(path, x, z, WALKER_RADIUS), `walk ${k}`).toBe(true)
          expect(insidePlace(layout, x, z, WALKER_RADIUS)).toBe(true)
        }
      }
      // Far from the children's game: the route never crosses their stretch.
      expect(canoeRangeGap(lane, layout.playRocks!.upstream, layout.playRocks!.downstream)).toBeGreaterThanOrEqual(canoeCfg.stretchGapMin)
      const alongOf = (p: { x: number; z: number }) => p.x * bank.fx + p.z * bank.fz
      for (const p of Object.values(stands)) expect(alongOf(p)).toBeGreaterThan(alongOf(layout.playRocks!.downstream) + 20)
    },
  )
})

describe('nothing at the fire stands inside anything else (work-order 1245)', () => {
  it.each(RIVER_VILLAGES)('%s: figures, baskets, the hearth, the rack and the board keep apart', (id) => {
    const bank = buildRiverBank(PLACES.find((p) => p.id === id)!, PLACE_RADIUS)!
    const lane = canoeLane(bank)
    const s = fisherySites(bank, lane)
    // Footprints: a figure 0.3 m, a basket 0.26 m, the hearth with its stones
    // 1.0 m, the rack 0.6 m round its middle, the board 0.5 m, storage 0.3 m.
    const bodies: Array<[string, { x: number; z: number }, number]> = [
      ['carrierAtFire', s.carrierAtFire, 0.3],
      ['griller', s.griller, 0.3],
      ...s.duoAtRack.map((p, i): [string, { x: number; z: number }, number] => [`duoAtRack${i}`, p, 0.3]),
      ['carrierAtBank', s.carrierAtBank, 0.3],
      ['fireBasket', s.fireBasket, 0.26],
      ['basketSpot', s.basketSpot, 0.26],
      ['ashore', lane.ashore, 0.3],
      ['fire', s.fire, 1.0],
      ['rack', s.rack, 0.6],
      ['board', s.board, 0.45],
      ['storage', s.storage, 0.3],
      ...s.duoStands.map((p, i): [string, { x: number; z: number }, number] => [`duoStand${i}`, p, 0.3]),
      ['duoMortar', s.duoMortar, balance.villageLife.mortar.footRadius],
    ]
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const [an, a, ar] = bodies[i]
        const [bn, b, br] = bodies[j]
        // The carrier works AT his board: he may touch it, never stand in it.
        // The pounding women stand AT their mortar, as at the village one.
        const atMortar = an.startsWith('duoStand') && bn === 'duoMortar'
        const allowed = (an === 'carrierAtFire' && bn === 'board') ? 0.2 : atMortar ? ar : 0
        expect(Math.hypot(a.x - b.x, a.z - b.z) + allowed, `${an} / ${bn}`).toBeGreaterThanOrEqual(ar + br)
      }
    }
  })
})

