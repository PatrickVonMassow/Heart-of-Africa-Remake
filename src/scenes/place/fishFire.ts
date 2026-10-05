// THE FISHERMEN'S FIRE (work-order 1245, design.md §13.4).
//
// What becomes of the catch, as the user laid it out on 30.09.2026: a CARRIER
// fetches the full basket from the landing to the fishers' OWN fire near the
// bank (not the village fire pit, whose vignettes stay untouched), guts the
// fish there and walks straight back with the emptied basket; a GRILLER grills
// the gutted fish over the embers, turns them, and lays them on a SMOKING RACK
// beside the fire; the rack stays at a roughly constant fill because each time
// he lays fresh fish on a full rack he packs the driest into a STORAGE BASKET;
// and every few minutes the village's two POUNDING WOMEN, whose mortar stands
// back from the fire toward the village, finish their strokes, walk together
// to the rack, each take a fish, eat it there and walk back to take up their
// alternating pounding again (point 1282). Nobody here says a word.
//
// THE TIMING (user: "niemand zu lange auf den anderen wartet"). The carrier's
// round is the boat's round: he guts for as long as it takes the boat to come
// round again, less his two walks and his handling and a short lead, so he is
// back at the bank a little before the full basket is set down. Waiting is the
// fallback, never the plan (`fishFire.test.ts` measures both sides).
//
// Pure logic: the scene draws what this decides.

import { balance, VILLAGER_MOTION } from '../../config/balance'
import {
  basketAt,
  carrierSetsDownAtFire,
  carrierSwaps,
  carrierTakesUpAtFire,
  createBasketRing,
  fullOnBank,
  gutOneAtFire,
  type BasketRing,
} from './fishBaskets'
import {
  advancePounding,
  createPoundingDuo,
  pounderStands,
  type MortarConfig,
  type PounderStand,
  type PoundingDuo,
} from './mortarPounding'
import type { BankPoint, PlaceRiverBank } from './riverBank'
import { yawOf, type CanoeLane } from './villagerCanoe'

type FireConfig = typeof balance.villageLife.fishFire

/** A stand a figure works from, and the way it faces there. */
export interface FisheryStand extends BankPoint {
  yaw: number
}

/** Where everything of the fishers' fire stands, derived from the bank. */
export interface FisherySites {
  fire: BankPoint
  /** The smoking rack, beside the fire on its upstream side. */
  rack: BankPoint
  /** The storage basket beside the rack. */
  storage: BankPoint
  /** The board the carrier guts the fish on, beside the fire. */
  board: BankPoint
  /** Where the full basket is set down at the fire. */
  fireBasket: BankPoint
  carrierAtFire: FisheryStand
  carrierAtBank: FisheryStand
  griller: FisheryStand
  /** The village's one mortar outside the middle, where the pounding pair
   *  works between their visits to the rack (point 1282; it is the spot the
   *  fish eater's mortar of work-order 1251 stood on). */
  duoMortar: BankPoint
  /** The turn of the mortar's frame (`Pounder`'s yaw): the pair stands across
   *  it on the line square to their walk, so both walk side by side and
   *  neither passes the mortar. */
  duoYaw: number
  /** Each woman's stand at the mortar (`pounderStands`). */
  duoStands: PounderStand[]
  /** Each woman's stand at the rack, side by side, facing the water. */
  duoAtRack: FisheryStand[]
  /** Where the basket stands at the landing (`CanoeLane.basketSpot`). */
  basketSpot: BankPoint
}

/**
 * The fire's sites at a bank: the fire `fireBack` metres upstream of the
 * landing and `fireInland` metres inland of the top of the bank, the rest
 * placed round it. Its route to the landing is a few metres of bank far
 * downstream of the children's stretch, so it never crosses their game.
 */
export function fisherySites(
  bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'fx' | 'fz' | 'walkEdge'>,
  lane: Pick<CanoeLane, 'basketSpot'>,
  laneEnd: number = balance.villageLife.canoe.laneEnd,
  cfg: FireConfig = balance.villageLife.fishFire,
  mortarCfg: MortarConfig = balance.villageLife.mortar,
): FisherySites {
  const on = (s: number, out: number): BankPoint => ({ x: bank.nx * out + bank.fx * s, z: bank.nz * out + bank.fz * s })
  const fs = laneEnd - cfg.fireBack
  const fo = bank.walkEdge - cfg.fireInland
  const toWater = yawOf(bank.nx, bank.nz)
  const stand = (s: number, out: number, yaw: number): FisheryStand => ({ ...on(s, out), yaw })
  const fire = on(fs, fo)
  const rack = on(fs - 2.3, fo + 0.2)
  const board = on(fs + 1.5, fo + 0.3)
  // The mortar stands back from the rack toward the settlement's middle,
  // along the rack's own bearing, and `duoMortarOffset` to the side of it.
  const r = Math.hypot(rack.x, rack.z)
  const k = Math.max(0, (r - cfg.duoHomeBack) / r)
  const home = { x: rack.x * k, z: rack.z * k }
  const toRack = Math.hypot(rack.x - home.x, rack.z - home.z) || 1
  const mortar = {
    x: home.x + ((rack.z - home.z) / toRack) * cfg.duoMortarOffset,
    z: home.z - ((rack.x - home.x) / toRack) * cfg.duoMortarOffset,
  }
  // The pair's frame: its z axis square to the walk from the mortar to the
  // rack, so the two stand side by side to that walk.
  const dl = Math.hypot(rack.x - mortar.x, rack.z - mortar.z) || 1
  const px = (rack.z - mortar.z) / dl
  const pz = -(rack.x - mortar.x) / dl
  const duoYaw = Math.atan2(px, pz)
  const duoStands = pounderStands(mortar.x, mortar.z, duoYaw, mortarCfg)
  // Side by side along the bank before the rack, each on the side her stand
  // at the mortar lies, so the two walks run beside each other.
  const duoAtRack = duoStands.map((p) => {
    const side = (p.x - mortar.x) * bank.fx + (p.z - mortar.z) * bank.fz >= 0 ? 1 : -1
    return stand(fs - 2.3 + side * cfg.duoRackGap / 2, fo - 0.75, toWater)
  })
  return {
    fire,
    rack,
    storage: on(fs - 3.7, fo - 0.4),
    board,
    // Beside the kneeling carrier, not under him.
    fireBasket: on(fs + 2.4, fo - 0.35),
    carrierAtFire: stand(fs + 1.5, fo - 0.55, toWater),
    carrierAtBank: stand(
      lane.basketSpot.x * bank.fx + lane.basketSpot.z * bank.fz - 0.2,
      lane.basketSpot.x * bank.nx + lane.basketSpot.z * bank.nz - 0.85,
      toWater,
    ),
    // Kneeling just clear of the hearth's ring of stones (radius 1 m).
    griller: stand(fs, fo - 1.4, toWater),
    duoMortar: mortar,
    duoYaw,
    duoStands,
    duoAtRack,
    basketSpot: lane.basketSpot,
  }
}

export type CarrierPhase = 'toBank' | 'waitBank' | 'swap' | 'toFire' | 'gut'

export interface FishCarrier {
  phase: CarrierPhase
  clock: number
  x: number
  z: number
  yaw: number
  /** Metres walked, for the stride. */
  walked: number
  /** This round's gutting time, set when he reaches the fire. */
  gutSeconds: number
  /** Fish in this basket when he set it down, and how many are gutted. */
  gutOf: number
  gutted: number
  /** Seconds waited at the bank this round, and every finished round's wait. */
  waiting: number
  waits: number[]
}

export type GrillerAction = 'tend' | 'take' | 'turn' | 'lay' | 'pack'

export interface GrillingFish {
  /** Seconds over the embers. */
  t: number
  turned: boolean
}

export interface FishGriller {
  action: GrillerAction
  clock: number
  x: number
  z: number
  yaw: number
  /** Which grill slot the current action works on. */
  slot: number
}

export interface FishFireState {
  carrier: FishCarrier
  griller: FishGriller
  /** The pounding pair, who come to the rack to eat (point 1282). */
  duo: PoundingDuo
  /** Gutted fish on the board, waiting for the griller. */
  board: number
  /** Fish over the embers. */
  grill: GrillingFish[]
  /** The smoking rack: each fish's seconds on it (its dryness). */
  rack: number[]
  /** Smoked fish packed away in the storage basket. */
  storage: number
  /** Every fish that ever went onto the rack, for the read-back. */
  smoked: number
  /** Every fish eaten. */
  eaten: number
  /** Fish laid on the rack without having been turned (should stay 0). */
  unturned: number
}

/**
 * The fire as it starts: the carrier at the fire with `gutLeft` fish still to
 * gut out of his basket, due back at the bank `untilFull` seconds from now (the
 * boat's first full basket); the rack filled and two fish on the grill.
 */
export function createFishFire(
  sites: FisherySites,
  ring: BasketRing,
  untilFull: number,
  cfg: FireConfig = balance.villageLife.fishFire,
  rand: () => number = Math.random,
): FishFireState {
  carrierSetsDownAtFire(ring)
  const b = basketAt(ring, 'fire')
  const gutOf = b?.fish ?? 0
  const walk = walkSeconds(sites, cfg)
  const carrier: FishCarrier = {
    phase: 'gut',
    clock: 0,
    ...sites.carrierAtFire,
    walked: 0,
    // The gut phase charges a set-down lift before and a take-up lift after.
    gutSeconds: Math.max(0, untilFull - cfg.carrierLeadSeconds - walk - 2 * cfg.liftSeconds),
    gutOf,
    gutted: 0,
    waiting: 0,
    waits: [],
  }
  return {
    carrier,
    griller: { action: 'tend', clock: 0, ...sites.griller, slot: -1 },
    duo: createPoundingDuo(sites.duoStands, cfg.duoIntervalSeconds * (0.3 + 0.4 * rand())),
    board: 0,
    grill: [
      { t: cfg.grillSeconds * 0.2, turned: false },
      { t: cfg.grillSeconds * 0.65, turned: true },
    ],
    // Dried for different lengths: the oldest hangs there longest.
    rack: Array.from({ length: cfg.rackFill }, (_, i) => (cfg.rackFill - i) * 60),
    storage: cfg.storageStart,
    smoked: 0,
    eaten: 0,
    unturned: 0,
  }
}

/** The ring the fire starts with: one empty basket on the bank, the other at
 *  the fire holding the rest of the last catch. */
export function createFisheryRing(cfg: FireConfig = balance.villageLife.fishFire): BasketRing {
  return createBasketRing(cfg.startFish)
}

/** Seconds of one walk between the fire and the bank. */
export function walkSeconds(sites: FisherySites, cfg: FireConfig = balance.villageLife.fishFire): number {
  return Math.hypot(sites.carrierAtBank.x - sites.carrierAtFire.x, sites.carrierAtBank.z - sites.carrierAtFire.z) / cfg.carrierPace
}

/**
 * How long the carrier guts at the fire for a boat round of `round` seconds:
 * the round, less his two walks, his three lifts (set down at the fire, take
 * up there, the swap at the bank) and his lead — never less than a minimum per
 * fish, so a short round still reads as gutting.
 */
export function gutSecondsFor(round: number, fish: number, sites: FisherySites, cfg: FireConfig = balance.villageLife.fishFire): number {
  const plan = round - 2 * walkSeconds(sites, cfg) - 3 * cfg.liftSeconds - cfg.carrierLeadSeconds
  return Math.max(fish * cfg.gutMinSecondsPerFish, plan)
}

/** Walks a figure toward `to` at `pace`; true once there. */
function walkTo(f: { x: number; z: number; yaw: number; walked: number }, to: BankPoint, pace: number, dt: number): boolean {
  const dx = to.x - f.x
  const dz = to.z - f.z
  const d = Math.hypot(dx, dz)
  const step = pace * dt
  if (d <= step || d < 1e-6) {
    f.walked += d
    f.x = to.x
    f.z = to.z
    return true
  }
  f.x += (dx / d) * step
  f.z += (dz / d) * step
  f.yaw = yawOf(dx, dz)
  f.walked += step
  return false
}

/**
 * Advances the fire by `dt` — the boat's people, the griller and the rack; the
 * pounding pair is `stepPoundingDuo`'s, so the scene's life freeze can hold
 * them at their mortar on its own. `round` is the boat's expected round in seconds
 * (`canoeCycleSeconds`), which the carrier's gutting is timed against.
 */
export function stepFishFire(
  state: FishFireState,
  sites: FisherySites,
  ring: BasketRing,
  dt: number,
  round: number,
  cfg: FireConfig = balance.villageLife.fishFire,
): void {
  stepCarrier(state, sites, ring, dt, round, cfg)
  stepGriller(state, sites, dt, cfg)
  for (let i = 0; i < state.rack.length; i++) state.rack[i] += dt
}

function stepCarrier(state: FishFireState, sites: FisherySites, ring: BasketRing, dt: number, round: number, cfg: FireConfig): void {
  const c = state.carrier
  c.clock += dt
  switch (c.phase) {
    case 'toBank':
      if (walkTo(c, sites.carrierAtBank, cfg.carrierPace, dt)) {
        c.yaw = sites.carrierAtBank.yaw
        c.phase = 'waitBank'
        c.clock = 0
        c.waiting = 0
      }
      break
    case 'waitBank':
      if (fullOnBank(ring)) {
        c.phase = 'swap'
        c.clock = 0
      } else c.waiting += dt
      break
    case 'swap':
      // Down to set his basket beside the full one and up again with it.
      if (c.clock >= cfg.liftSeconds / 2 && basketAt(ring, 'carrier')?.fish === 0) carrierSwaps(ring)
      if (c.clock >= cfg.liftSeconds) {
        c.waits.push(c.waiting)
        c.phase = 'toFire'
        c.clock = 0
      }
      break
    case 'toFire':
      if (walkTo(c, sites.carrierAtFire, cfg.carrierPace, dt)) {
        c.yaw = sites.carrierAtFire.yaw
        carrierSetsDownAtFire(ring)
        c.gutOf = basketAt(ring, 'fire')?.fish ?? 0
        c.gutted = 0
        c.gutSeconds = gutSecondsFor(round, c.gutOf, sites, cfg)
        c.phase = 'gut'
        c.clock = 0
      }
      break
    case 'gut': {
      // Set down, gut the fish out one by one onto the board, take the
      // emptied basket up again: the whole on this one clock.
      const start = cfg.liftSeconds
      const due = c.gutOf > 0 ? Math.min(c.gutOf, Math.floor(((c.clock - start) / Math.max(1e-6, c.gutSeconds)) * c.gutOf)) : 0
      while (c.gutted < due && gutOneAtFire(ring)) {
        c.gutted++
        state.board++
      }
      if (c.clock >= start + c.gutSeconds) {
        while (gutOneAtFire(ring)) {
          c.gutted++
          state.board++
        }
        if (c.clock >= start + c.gutSeconds + cfg.liftSeconds && carrierTakesUpAtFire(ring)) {
          c.phase = 'toBank'
          c.clock = 0
        }
      }
      break
    }
  }
}

/** The longest frame step the scene takes (its `dt` clamp), held in hand so a
 *  rise started one frame late still ends before the first step. */
const FRAME_CLAMP = 0.1

/**
 * Whether the carrier kneels at the fire (work-order "walking villagers", from
 * point 350): down on arrival, up again BEFORE he walks — the getting-up
 * (`VILLAGER_MOTION.kneelSeconds`) starts that long, and one frame more, before
 * the gut phase can end, so he never rises while he moves off.
 */
export function carrierKneels(c: FishCarrier, cfg: FireConfig = balance.villageLife.fishFire): boolean {
  if (c.phase !== 'gut') return false
  const end = cfg.liftSeconds + c.gutSeconds + cfg.liftSeconds
  return c.clock < end - VILLAGER_MOTION.kneelSeconds - FRAME_CLAMP
}

function stepGriller(state: FishFireState, sites: FisherySites, dt: number, cfg: FireConfig): void {
  const g = state.griller
  for (const f of state.grill) f.t += dt
  g.clock += dt
  g.x = sites.griller.x
  g.z = sites.griller.z
  g.yaw = sites.griller.yaw
  const length = { tend: 0, take: cfg.takeSeconds, turn: cfg.turnSeconds, lay: cfg.laySeconds, pack: cfg.packSeconds }[g.action]
  if (g.action !== 'tend' && g.clock < length) return
  // The action just finished takes effect.
  if (g.action === 'take') state.grill.push({ t: 0, turned: false })
  else if (g.action === 'turn' && state.grill[g.slot]) state.grill[g.slot].turned = true
  else if (g.action === 'pack') {
    // The driest fish off the rack and into the storage basket.
    let oldest = 0
    for (let i = 1; i < state.rack.length; i++) if (state.rack[i] > state.rack[oldest]) oldest = i
    if (state.rack.length) {
      state.rack.splice(oldest, 1)
      state.storage++
    }
  } else if (g.action === 'lay' && state.grill[g.slot]) {
    if (!state.grill[g.slot].turned) state.unturned++
    state.grill.splice(g.slot, 1)
    state.rack.push(0)
    state.smoked++
  }
  // What comes next: a done fish first (packing room for it on a full rack),
  // then a fish due its turn, then a fresh one off the board.
  g.clock = 0
  g.slot = -1
  const done = state.grill.findIndex((f) => f.t >= cfg.grillSeconds && f.turned)
  if (done >= 0) {
    g.slot = done
    g.action = state.rack.length >= cfg.rackFill && g.action !== 'pack' ? 'pack' : 'lay'
    return
  }
  // (A fish is laid only once turned, so a busy moment delays it rather
  // than taking it off the fire half done.)
  const due = state.grill.findIndex((f) => !f.turned && f.t >= cfg.grillSeconds / 2)
  if (due >= 0) {
    g.slot = due
    g.action = 'turn'
    return
  }
  if (state.board > 0 && state.grill.length < cfg.grillSlots) {
    state.board--
    g.action = 'take'
    return
  }
  g.action = 'tend'
}

/**
 * Advances the pounding pair by `dt` (point 1282). At the mortar they pound
 * alternately; when their interval runs out (and the rack holds a fish for
 * each) each finishes the stroke in hand, and they walk TOGETHER to the rack,
 * each takes the driest fish, both eat it there, and they walk back together
 * and take up their pounding again. A woman who arrives first waits for the
 * other, so the pair always moves on as one.
 */
export function stepPoundingDuo(
  state: FishFireState,
  sites: FisherySites,
  dt: number,
  cfg: FireConfig = balance.villageLife.fishFire,
  rand: () => number = Math.random,
  mortarCfg: MortarConfig = balance.villageLife.mortar,
): void {
  const d = state.duo
  d.clock += dt
  const enter = (phase: PoundingDuo['phase']) => {
    d.phase = phase
    d.clock = 0
    for (const w of d.women) w.arrived = false
  }
  const walkAll = (to: readonly FisheryStand[]): boolean => {
    d.women.forEach((w, i) => {
      if (w.arrived) return
      if (walkTo(w, to[i], cfg.duoPace, dt)) {
        w.arrived = true
        w.yaw = to[i].yaw
      }
    })
    return d.women.every((w) => w.arrived)
  }
  switch (d.phase) {
    case 'pound':
      advancePounding(d, dt, mortarCfg)
      d.next -= dt
      if (d.next <= 0) {
        if (state.rack.length >= d.women.length) enter('settle')
        else d.next = cfg.duoIntervalSeconds * 0.25
      }
      break
    case 'settle':
      advancePounding(d, dt, mortarCfg)
      if (d.women.every((w) => w.resting)) enter('toRack')
      break
    case 'toRack':
      if (walkAll(sites.duoAtRack)) enter('take')
      break
    case 'take':
      if (d.clock >= cfg.takeSeconds / 2) {
        for (const w of d.women) {
          if (w.fish > 0) continue
          // The driest fish, taken off the rack by hand.
          let oldest = -1
          for (let i = 0; i < state.rack.length; i++) if (oldest < 0 || state.rack[i] > state.rack[oldest]) oldest = i
          if (oldest < 0) break
          state.rack.splice(oldest, 1)
          w.fish = 1
        }
      }
      if (d.clock >= cfg.takeSeconds) enter(d.women.some((w) => w.fish > 0) ? 'eat' : 'back')
      break
    case 'eat':
      if (d.clock >= cfg.eatSeconds) {
        for (const w of d.women) {
          if (w.fish > 0) state.eaten++
          w.fish = 0
        }
        d.visits++
        enter('back')
      } else for (const w of d.women) if (w.fish > 0) w.fish = Math.max(1e-3, 1 - d.clock / cfg.eatSeconds)
      break
    case 'back':
      if (walkAll(sites.duoStands)) {
        d.phase = 'pound'
        d.clock = 0
        d.poundClock = 0
        d.women.forEach((w) => {
          w.resting = false
          w.arrived = true
        })
        d.next = cfg.duoIntervalSeconds * (1 + cfg.duoIntervalSpread * (2 * rand() - 1))
      }
      break
  }
}

/** What a woman of the pair visibly does: pounding, walking, taking, eating,
 *  or — briefly, when she reached the rack or her stand first — waiting for
 *  the other (work-order 1251: nobody here stands idle). */
export type DuoOccupation = 'pound' | 'walk' | 'take' | 'eat' | 'wait'

export function duoOccupation(duo: PoundingDuo, i: number): DuoOccupation {
  const w = duo.women[i]
  switch (duo.phase) {
    case 'pound':
    case 'settle':
      return 'pound'
    case 'toRack':
    case 'back':
      return w.arrived ? 'wait' : 'walk'
    case 'take':
      return 'take'
    case 'eat':
      return w.fish > 0 ? 'eat' : 'wait'
  }
}

/** Where her hand is in a bite: 0 at the fish held low, 1 at the mouth. */
export function biteLift(duo: Pick<PoundingDuo, 'phase' | 'clock'>, cfg: FireConfig = balance.villageLife.fishFire, woman = 0): number {
  if (duo.phase !== 'eat') return 0
  // The second woman bites a little out of step with the first.
  const f = ((duo.clock + woman * 0.45 * cfg.biteSeconds) / cfg.biteSeconds) % 1
  return Math.sin(Math.PI * Math.min(1, f / 0.6)) * (f < 0.6 ? 1 : 0)
}
