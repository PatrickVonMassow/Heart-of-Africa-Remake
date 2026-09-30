// THE FISHERMEN'S FIRE (work-order 1245, design.md §13.4).
//
// What becomes of the catch, as the user laid it out on 30.09.2026: a CARRIER
// fetches the full basket from the landing to the fishers' OWN fire near the
// bank (not the village fire pit, whose vignettes stay untouched), guts the
// fish there and walks straight back with the emptied basket; a GRILLER grills
// the gutted fish over the embers, turns them, and lays them on a SMOKING RACK
// beside the fire; the rack stays at a roughly constant fill because each time
// he lays fresh fish on a full rack he packs the driest into a STORAGE BASKET;
// and every few minutes an EATER comes to the rack, takes one fish, eats it on
// the spot and goes back. Nobody here says a word.
//
// THE TIMING (user: "niemand zu lange auf den anderen wartet"). The carrier's
// round is the boat's round: he guts for as long as it takes the boat to come
// round again, less his two walks and his handling and a short lead, so he is
// back at the bank a little before the full basket is set down. Waiting is the
// fallback, never the plan (`fishFire.test.ts` measures both sides).
//
// Pure logic: the scene draws what this decides.

import { balance } from '../../config/balance'
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
  eaterAtRack: FisheryStand
  eaterHome: FisheryStand
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
): FisherySites {
  const on = (s: number, out: number): BankPoint => ({ x: bank.nx * out + bank.fx * s, z: bank.nz * out + bank.fz * s })
  const fs = laneEnd - cfg.fireBack
  const fo = bank.walkEdge - cfg.fireInland
  const toWater = yawOf(bank.nx, bank.nz)
  const stand = (s: number, out: number, yaw: number): FisheryStand => ({ ...on(s, out), yaw })
  const fire = on(fs, fo)
  const rack = on(fs - 2.3, fo + 0.2)
  const board = on(fs + 1.5, fo + 0.3)
  // The eater comes from the village: back from the rack toward the
  // settlement's middle, along the rack's own bearing.
  const r = Math.hypot(rack.x, rack.z)
  const k = Math.max(0, (r - cfg.eaterHomeBack) / r)
  const home = { x: rack.x * k, z: rack.z * k }
  const faceRack = yawOf(rack.x - home.x, rack.z - home.z)
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
    eaterAtRack: stand(fs - 2.3, fo - 0.75, toWater),
    eaterHome: { ...home, yaw: faceRack },
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

export type EaterPhase = 'home' | 'toRack' | 'take' | 'eat' | 'back'

export interface FishEater {
  phase: EaterPhase
  clock: number
  x: number
  z: number
  yaw: number
  walked: number
  /** Seconds until he next comes to the rack (while at home). */
  next: number
  /** How much of his fish is left, 1 whole to 0 eaten. */
  fish: number
  /** Visits made. */
  visits: number
}

export interface FishFireState {
  carrier: FishCarrier
  griller: FishGriller
  eater: FishEater
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
    eater: {
      phase: 'home',
      clock: 0,
      ...sites.eaterHome,
      walked: 0,
      next: cfg.eaterIntervalSeconds * (0.3 + 0.4 * rand()),
      fish: 0,
      visits: 0,
    },
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
 * Advances the fire by `dt`. `round` is the boat's expected round in seconds
 * (`canoeCycleSeconds`), which the carrier's gutting is timed against.
 */
export function stepFishFire(
  state: FishFireState,
  sites: FisherySites,
  ring: BasketRing,
  dt: number,
  round: number,
  cfg: FireConfig = balance.villageLife.fishFire,
  rand: () => number = Math.random,
): void {
  stepCarrier(state, sites, ring, dt, round, cfg)
  stepGriller(state, sites, dt, cfg)
  stepEater(state, sites, dt, cfg, rand)
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

function stepEater(state: FishFireState, sites: FisherySites, dt: number, cfg: FireConfig, rand: () => number): void {
  const e = state.eater
  e.clock += dt
  switch (e.phase) {
    case 'home':
      e.next -= dt
      if (e.next <= 0) {
        if (state.rack.length > 0) {
          e.phase = 'toRack'
          e.clock = 0
        } else e.next = cfg.eaterIntervalSeconds * 0.25
      }
      break
    case 'toRack':
      if (walkTo(e, sites.eaterAtRack, cfg.eaterPace, dt)) {
        e.yaw = sites.eaterAtRack.yaw
        e.phase = 'take'
        e.clock = 0
      }
      break
    case 'take':
      if (e.clock >= cfg.takeSeconds / 2 && e.fish === 0) {
        // The driest fish, taken off the rack by hand.
        let oldest = -1
        for (let i = 0; i < state.rack.length; i++) if (oldest < 0 || state.rack[i] > state.rack[oldest]) oldest = i
        if (oldest >= 0) {
          state.rack.splice(oldest, 1)
          e.fish = 1
        }
      }
      if (e.clock >= cfg.takeSeconds) {
        e.phase = e.fish > 0 ? 'eat' : 'back'
        e.clock = 0
      }
      break
    case 'eat':
      e.fish = Math.max(0, 1 - e.clock / cfg.eatSeconds)
      if (e.clock >= cfg.eatSeconds) {
        e.fish = 0
        e.visits++
        state.eaten++
        e.phase = 'back'
        e.clock = 0
      }
      break
    case 'back':
      if (walkTo(e, sites.eaterHome, cfg.eaterPace, dt)) {
        e.yaw = sites.eaterHome.yaw
        e.phase = 'home'
        e.clock = 0
        e.next = cfg.eaterIntervalSeconds * (1 + cfg.eaterIntervalSpread * (2 * rand() - 1))
      }
      break
  }
}

/** Where his hand is in a bite: 0 at the fish held low, 1 at the mouth. */
export function biteLift(eater: Pick<FishEater, 'phase' | 'clock'>, cfg: FireConfig = balance.villageLife.fishFire): number {
  if (eater.phase !== 'eat') return 0
  const f = (eater.clock / cfg.biteSeconds) % 1
  return Math.sin(Math.PI * Math.min(1, f / 0.6)) * (f < 0.6 ? 1 : 0)
}
