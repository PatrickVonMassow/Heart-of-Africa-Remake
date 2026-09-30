// THE FISHERMEN'S DUGOUT (work-order 1237, rebuilt by 1245; design.md §13.4).
//
// At a riverside village two men work a drift net from one dugout on a lane of
// their own, downstream of the children's bank game. The Niger's Bozo/Somono
// river people of 1890 are the regional reference; the Bambara village keeps
// its own lect. One is the PADDLER, aft; the other the NET MAN, forward.
//
// EVERY WORD HAS AN ADDRESSEE AND A CONSEQUENCE (user 30.09.2026: a boatman
// commenting on his own work is the rejected faux pas). Both direction words
// come from the net man and are said to the paddler, and each is followed by
// the paddler's visibly changed action:
//  - up:       the paddler paddles hard, close in where the current is weakest;
//              the net man sits with the folded net before him;
//  - callDown: at the upstream end the net man says DOWNSTREAM to the paddler;
//  - turn:     the paddler stops paddling and swings the bow out into the
//              current, and the net man pays the net out;
//  - down:     the net man holds the net in the water (a line of floats on the
//              surface), the paddler only steers;
//  - haul:     at the downstream end both men haul the net into the hull
//              together, and the catch comes up in it;
//  - land:     the bow is run onto the sand at the landing;
//  - unload:   the net man steps ashore, takes the EMPTY basket standing there,
//              the paddler hands the fish over from the hull, and the FULL
//              basket is set back on the bank (`fishBaskets.ts`);
//  - callUp:   the net man, back aboard, says UPSTREAM to the paddler;
//  - launch:   the paddler takes up hard strokes again and pushes off.
// They never leave their range and never despawn. The words stay in the CALL
// register (user: "Beim Rufen bleiben passt").
//
// Pure logic: the scene draws and speaks what this decides.

import { balance } from '../../config/balance'
import {
  basketAt,
  emptyOnBank,
  netmanFillsOne,
  netmanSetsDown,
  netmanTakesEmpty,
  type BasketRing,
} from './fishBaskets'
import type { BankPoint, PlaceRiverBank } from './riverBank'

type CanoeConfig = typeof balance.villageLife.canoe

export type CanoePhase = 'up' | 'callDown' | 'turn' | 'down' | 'haul' | 'land' | 'unload' | 'callUp' | 'launch'
export type CanoeWord = 'UPSTREAM' | 'DOWNSTREAM'

/** The phases in the order one cycle runs them. */
export const CANOE_PHASES: readonly CanoePhase[] = ['up', 'callDown', 'turn', 'down', 'haul', 'land', 'unload', 'callUp', 'launch']

/** What the paddler's arms are doing — the visible answer to each word. */
export type PaddlerAction = 'hard' | 'hold' | 'swing' | 'steer' | 'haul' | 'hand'
/** What the net man is doing. */
export type NetManAction = 'sit' | 'speak' | 'payOut' | 'holdNet' | 'haul' | 'ashore'

/** The lane and the landing, in the settlement's own frame. */
export interface CanoeLane {
  /** The bank frame: normal toward the water, and DOWNSTREAM along it. */
  nx: number
  nz: number
  fx: number
  fz: number
  /** Along-bank position measured from: the settlement's bank normal (s = 0). */
  origin: number
  /** Distance of the lane from the settlement centre along the normal. */
  out: number
  /** Where the waterline lies along the normal. */
  waterline: number
  /** The lane's two ends. */
  start: BankPoint
  end: BankPoint
  /** Where the canoe's centre rests while its bow is on the sand. */
  berth: BankPoint
  /** Where the basket stands on the bank beside the bow. */
  basketSpot: BankPoint
  /** Where the net man stands ashore to work at the bow. */
  ashore: BankPoint
}

/** How far the bow runs up onto the sand past the waterline, in metres. */
const BOW_ON_SAND = 0.4
/** Where the basket stands: this far upstream of the bow, and this far inland
 *  of the top of the bank's slope. */
const BASKET_ALONG = -1.1
const BASKET_INLAND = 0.3
/** Where the net man stands ashore: between the bow and the basket. */
const ASHORE_ALONG = -0.55
/** How far aft of the canoe's centre the paddler kneels, and how far forward
 *  of it the net man. */
export const CANOE_PADDLER_AFT = 1.6
export const CANOE_NETMAN_FORE = 1.2

/** A point `s` along the bank from the frame's origin, `out` along the normal. */
function at(lane: Pick<CanoeLane, 'nx' | 'nz' | 'fx' | 'fz' | 'origin'>, s: number, out: number): BankPoint {
  const along = lane.origin + s
  return { x: lane.nx * out + lane.fx * along, z: lane.nz * out + lane.fz * along }
}

/**
 * The canoe's lane at a village bank. `s` is measured DOWNSTREAM from the
 * settlement's bank normal (work-order 1245 — it used to be the stretch's
 * centre, which has moved about 28 m upstream of the normal since).
 */
export function canoeLane(
  bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'fx' | 'fz' | 'distance' | 'walkEdge'>,
  cfg: CanoeConfig = balance.villageLife.canoe,
): CanoeLane {
  const frame = { nx: bank.nx, nz: bank.nz, fx: bank.fx, fz: bank.fz, origin: 0 }
  const out = bank.distance + cfg.laneOut
  // The bow on the sand, pointing inland: the hull's centre lies half a hull
  // out from the bow tip.
  const bowTip = bank.distance - BOW_ON_SAND
  return {
    ...frame,
    out,
    waterline: bank.distance,
    start: at(frame, cfg.laneStart, out),
    end: at(frame, cfg.laneEnd, out),
    berth: at(frame, cfg.laneEnd, bowTip + cfg.hullLength / 2),
    basketSpot: at(frame, cfg.laneEnd + BASKET_ALONG, bank.walkEdge - BASKET_INLAND),
    ashore: at(frame, cfg.laneEnd + ASHORE_ALONG, (bank.walkEdge + bowTip) / 2),
  }
}

/** A point on the lane itself, `s` downstream of the bank normal. */
export function lanePoint(lane: CanoeLane, s: number): BankPoint {
  return at(lane, s, lane.out)
}

/** Closest distance between two segments in the plane. */
export function segmentGap(a: BankPoint, b: BankPoint, c: BankPoint, d: BankPoint): number {
  const toSeg = (p: BankPoint, q0: BankPoint, q1: BankPoint) => {
    const dx = q1.x - q0.x
    const dz = q1.z - q0.z
    const len2 = dx * dx + dz * dz
    const t = len2 > 1e-12 ? Math.max(0, Math.min(1, ((p.x - q0.x) * dx + (p.z - q0.z) * dz) / len2)) : 0
    return Math.hypot(p.x - (q0.x + dx * t), p.z - (q0.z + dz * t))
  }
  // Two segments in a plane that do not cross are closest at an endpoint.
  const cross = (o: BankPoint, p: BankPoint, q: BankPoint) => (p.x - o.x) * (q.z - o.z) - (p.z - o.z) * (q.x - o.x)
  const d1 = cross(a, b, c)
  const d2 = cross(a, b, d)
  const d3 = cross(c, d, a)
  const d4 = cross(c, d, b)
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0
  return Math.min(toSeg(a, c, d), toSeg(b, c, d), toSeg(c, a, b), toSeg(d, a, b))
}

/**
 * The least distance between the canoe's range — the lane, the run in to the
 * landing, and where the net man stands ashore — and a segment `c`–`d` (a
 * point when the two coincide). The words fall on the lane's ends and at the
 * landing, and the whole range is where the two men are seen.
 */
export function canoeRangeGap(lane: CanoeLane, c: BankPoint, d: BankPoint = c): number {
  return Math.min(
    segmentGap(lane.start, lane.end, c, d),
    segmentGap(lane.end, lane.berth, c, d),
    segmentGap(lane.ashore, lane.basketSpot, c, d),
  )
}

/** The least distance between the canoe's range and the children's stretch —
 *  the running lane between the two play rocks. */
export function canoeStretchGap(lane: CanoeLane, rocks: { upstream: BankPoint; downstream: BankPoint }): number {
  return canoeRangeGap(lane, rocks.upstream, rocks.downstream)
}

/** The yaw that turns a figure's or the hull's local +Z onto a heading. */
export function yawOf(x: number, z: number): number {
  return Math.atan2(x, z)
}

/** Wraps an angle to (−π, π]. */
export function wrapAngle(a: number): number {
  let r = a % (Math.PI * 2)
  if (r > Math.PI) r -= Math.PI * 2
  if (r <= -Math.PI) r += Math.PI * 2
  return r
}

/** Smooth ease over 0..1. */
function ease(t: number): number {
  const u = Math.max(0, Math.min(1, t))
  return u * u * (3 - 2 * u)
}

/** One of the two men: where he is and which way he faces. */
export interface CanoeMan {
  x: number
  z: number
  yaw: number
}

/** The net man, who also steps ashore at the landing. */
export interface CanoeNetMan extends CanoeMan {
  /** Kneeling in the hull, or standing on the bank at the bow. */
  inBoat: boolean
  /** 0 upright, 1 bent right down (lifting or setting the basket). */
  reach: number
  action: NetManAction
}

/** Where a word stands: owed and waiting for the floor, spoken and being
 *  obeyed, or passed over (the floor never gave it, or it may not be said). */
export interface CanoeWordState {
  word: CanoeWord
  state: 'owed' | 'said' | 'passed'
  /** Seconds it has waited for the floor. */
  waited: number
  /** Seconds left before the paddler acts on it. */
  obeyIn: number
}

export interface CanoeState {
  phase: CanoePhase
  /** Seconds spent in the current phase (the unload's clock stands while the
   *  men wait for an empty basket). */
  clock: number
  /** Along-bank position of the hull's centre on the lane (lane phases). */
  s: number
  x: number
  z: number
  /** The hull's yaw (local +Z is the bow). */
  yaw: number
  /** Paddle strokes so far, fractional: the stroke picture reads its phase. */
  stroke: number
  paddlerAction: PaddlerAction
  paddler: CanoeMan
  netMan: CanoeNetMan
  /** How far the net is out: 0 folded in the hull, 1 paid right out. */
  net: number
  /** This haul's catch, drawn when the haul begins. */
  catch: number
  /** Fish come up in the net so far this haul (flapping at the gunwale). */
  landed: number
  /** Fish lying in the hull. */
  inHull: number
  /** The word of this call phase, while there is one. */
  word: CanoeWordState | null
  /** Every word spoken, for the dev read-back. */
  calls: number
  lastCall: CanoeWord | null
  /** Seconds the boat has stood at the landing for want of an empty basket. */
  basketWait: number
  /** Landings completed. */
  rounds: number
}

/** What the scene lets the canoe do this step. */
export interface CanoeView {
  /**
   * Asks for the net man's word to the paddler: `said` when it is spoken now,
   * `held` while the settlement's floor keeps it waiting, `silent` when it may
   * not be said at all (the listener has not heard ROCK yet, as at the bank).
   */
  say: (word: CanoeWord) => 'said' | 'held' | 'silent'
  /** A word given up unspoken: the floor forgets it. */
  drop?: () => void
  /** Seconds from the grant to the act the word orders (`instructionDelay`). */
  obeyDelay: (word: CanoeWord) => number
}

/** The two men on their seats, facing the bow. */
function seatMen(state: CanoeState): void {
  const sx = Math.sin(state.yaw)
  const sz = Math.cos(state.yaw)
  state.paddler.x = state.x - sx * CANOE_PADDLER_AFT
  state.paddler.z = state.z - sz * CANOE_PADDLER_AFT
  state.paddler.yaw = state.yaw
  state.netMan.x = state.x + sx * CANOE_NETMAN_FORE
  state.netMan.z = state.z + sz * CANOE_NETMAN_FORE
  state.netMan.yaw = state.yaw
  state.netMan.inBoat = true
  state.netMan.reach = 0
}

/** The canoe as it starts: at the downstream end, just pushed off upstream. */
export function createCanoe(lane: CanoeLane, cfg: CanoeConfig = balance.villageLife.canoe): CanoeState {
  const state: CanoeState = {
    phase: 'up',
    clock: 0,
    s: cfg.laneEnd,
    x: lane.end.x,
    z: lane.end.z,
    yaw: yawOf(-lane.fx, -lane.fz),
    stroke: 0,
    paddlerAction: 'hard',
    paddler: { x: 0, z: 0, yaw: 0 },
    netMan: { x: 0, z: 0, yaw: 0, inBoat: true, reach: 0, action: 'sit' },
    net: 0,
    catch: 0,
    landed: 0,
    inHull: 0,
    word: null,
    calls: 0,
    lastCall: null,
    basketWait: 0,
    rounds: 0,
  }
  seatMen(state)
  return state
}

/** The paddler's action as each phase opens, so the step a word is obeyed on
 *  already shows the answer to it. */
const OPENING_ACTION: Record<CanoePhase, PaddlerAction> = {
  up: 'hard', callDown: 'hold', turn: 'swing', down: 'steer', haul: 'haul', land: 'hard', unload: 'hold', callUp: 'hold', launch: 'hard',
}

function enter(state: CanoeState, phase: CanoePhase): void {
  state.phase = phase
  state.clock = 0
  state.paddlerAction = OPENING_ACTION[phase]
  state.word = phase === 'callDown' ? fresh('DOWNSTREAM') : phase === 'callUp' ? fresh('UPSTREAM') : null
}

function fresh(word: CanoeWord): CanoeWordState {
  return { word, state: 'owed', waited: 0, obeyIn: 0 }
}

/** The unload's timeline: step ashore, lift the basket, one hand-over per
 *  fish, set the basket down, step back aboard. */
export function unloadSeconds(fish: number, cfg: CanoeConfig = balance.villageLife.canoe): number {
  return 2 * cfg.stepSeconds + 2 * cfg.liftSeconds + fish * cfg.fillSecondsPerFish
}

/**
 * Advances the canoe by `dt` seconds. Returns the word the net man says to the
 * paddler this step, or null. `rand` draws each haul's catch.
 */
export function stepCanoe(
  state: CanoeState,
  lane: CanoeLane,
  ring: BasketRing,
  view: CanoeView,
  dt: number,
  cfg: CanoeConfig = balance.villageLife.canoe,
  rand: () => number = Math.random,
): CanoeWord | null {
  const upYaw = yawOf(-lane.fx, -lane.fz)
  const downYaw = yawOf(lane.fx, lane.fz)
  const outYaw = yawOf(lane.nx, lane.nz)
  const shoreYaw = yawOf(-lane.nx, -lane.nz)
  let said: CanoeWord | null = null

  // The unload stands still while no empty basket waits on the bank: the men
  // wait at the landing rather than conjure one.
  const waitingForBasket = state.phase === 'unload' && state.clock === 0 && !basketAt(ring, 'netman') && !emptyOnBank(ring)
  if (waitingForBasket) state.basketWait += dt
  else state.clock += dt

  switch (state.phase) {
    case 'up': {
      state.s = Math.max(cfg.laneStart, state.s - cfg.upstreamSpeed * dt)
      state.yaw = upYaw
      state.stroke += dt / cfg.strokeSeconds
      state.paddlerAction = 'hard'
      state.netMan.action = 'sit'
      break
    }
    case 'callDown':
    case 'callUp': {
      // Holding the boat where it is with slow strokes until the word is
      // obeyed; the net man turns to the paddler to say it.
      state.stroke += dt / cfg.steerStrokeSeconds
      state.paddlerAction = 'hold'
      state.netMan.action = 'speak'
      said = advanceWord(state, view, dt, cfg)
      break
    }
    case 'turn': {
      // The bow swings OUT into the current: from upstream, through the
      // outward normal, to downstream. The net goes out as it swings.
      const t = ease(state.clock / cfg.turnSeconds)
      const via = wrapAngle(outYaw - upYaw)
      state.yaw = upYaw + via * 2 * t
      state.stroke += dt / cfg.strokeSeconds
      state.paddlerAction = 'swing'
      state.netMan.action = 'payOut'
      state.net = Math.min(1, state.clock / cfg.turnSeconds)
      break
    }
    case 'down': {
      state.s = Math.min(cfg.laneEnd, state.s + cfg.downstreamSpeed * dt)
      state.yaw = downYaw
      state.stroke += dt / cfg.steerStrokeSeconds
      state.paddlerAction = 'steer'
      state.netMan.action = 'holdNet'
      state.net = 1
      break
    }
    case 'haul': {
      // Both men pull hand over hand; the fish come up one by one as the net
      // shortens, and drop into the hull.
      const t = Math.min(1, state.clock / cfg.haulSeconds)
      state.net = 1 - t
      state.stroke += dt / cfg.haulStrokeSeconds
      state.paddlerAction = 'haul'
      state.netMan.action = 'haul'
      const up = Math.min(state.catch, Math.floor(t * (state.catch + 1)))
      while (state.landed < up) {
        state.landed++
        state.inHull++
      }
      break
    }
    case 'land': {
      const t = ease(state.clock / cfg.landSeconds)
      const from = lanePoint(lane, cfg.laneEnd)
      state.x = from.x + (lane.berth.x - from.x) * t
      state.z = from.z + (lane.berth.z - from.z) * t
      state.yaw = downYaw + wrapAngle(shoreYaw - downYaw) * t
      state.stroke += dt / cfg.strokeSeconds
      state.paddlerAction = 'hard'
      state.netMan.action = 'sit'
      state.net = 0
      break
    }
    case 'unload':
      stepUnload(state, lane, ring, cfg)
      break
    case 'launch': {
      const t = ease(state.clock / cfg.launchSeconds)
      const to = lanePoint(lane, cfg.laneEnd)
      state.x = lane.berth.x + (to.x - lane.berth.x) * t
      state.z = lane.berth.z + (to.z - lane.berth.z) * t
      state.yaw = shoreYaw + wrapAngle(upYaw - shoreYaw) * t
      state.stroke += dt / cfg.strokeSeconds
      state.paddlerAction = 'hard'
      state.netMan.action = 'sit'
      break
    }
  }

  if (state.phase === 'up' || state.phase === 'turn' || state.phase === 'down' || state.phase === 'haul') {
    const p = lanePoint(lane, state.s)
    state.x = p.x
    state.z = p.z
  }
  if (state.phase !== 'unload') seatMen(state)
  if (state.phase === 'callDown' || state.phase === 'callUp') {
    // The net man turns round on his seat to the man he is speaking to.
    state.netMan.yaw = state.yaw + Math.PI
  }

  // Phase ends.
  switch (state.phase) {
    case 'up':
      if (state.s <= cfg.laneStart) enter(state, 'callDown')
      break
    case 'callDown':
      if (wordDone(state)) enter(state, 'turn')
      break
    case 'turn':
      if (state.clock >= cfg.turnSeconds) {
        state.yaw = downYaw
        state.net = 1
        enter(state, 'down')
      }
      break
    case 'down':
      if (state.s >= cfg.laneEnd) {
        state.catch = cfg.catchMin + Math.min(cfg.catchMax - cfg.catchMin, Math.floor(rand() * (cfg.catchMax - cfg.catchMin + 1)))
        state.landed = 0
        enter(state, 'haul')
      }
      break
    case 'haul':
      if (state.clock >= cfg.haulSeconds) {
        state.inHull += state.catch - state.landed
        state.landed = state.catch
        state.net = 0
        enter(state, 'land')
      }
      break
    case 'land':
      if (state.clock >= cfg.landSeconds) enter(state, 'unload')
      break
    case 'unload':
      if (state.clock >= unloadSeconds(state.catch, cfg)) {
        state.rounds++
        seatMen(state)
        enter(state, 'callUp')
      }
      break
    case 'callUp':
      if (wordDone(state)) enter(state, 'launch')
      break
    case 'launch':
      if (state.clock >= cfg.launchSeconds) {
        state.s = cfg.laneEnd
        state.yaw = upYaw
        enter(state, 'up')
      }
      break
  }
  return said
}

/** The call phase's word: asked for until spoken, passed over, or given up. */
function advanceWord(state: CanoeState, view: CanoeView, dt: number, cfg: CanoeConfig): CanoeWord | null {
  const w = state.word
  if (!w) return null
  if (w.state === 'said') {
    w.obeyIn -= dt
    return null
  }
  if (w.state === 'passed') return null
  const answer = view.say(w.word)
  if (answer === 'said') {
    w.state = 'said'
    w.obeyIn = view.obeyDelay(w.word)
    state.calls++
    state.lastCall = w.word
    return w.word
  }
  if (answer === 'silent') {
    w.state = 'passed'
    view.drop?.()
    return null
  }
  // Held by the floor: wait, but never for ever — the boat goes on unspoken
  // and the floor forgets the word.
  w.waited += dt
  if (w.waited >= cfg.wordWaitSeconds) {
    w.state = 'passed'
    view.drop?.()
  }
  return null
}

/** Whether the call phase is over: the word obeyed, or passed over. */
function wordDone(state: CanoeState): boolean {
  const w = state.word
  return !w || w.state === 'passed' || (w.state === 'said' && w.obeyIn <= 0)
}

/**
 * The landing's hand-over, on the unload clock: the net man steps ashore to
 * the basket, lifts it, holds it at the bow while the paddler hands the fish
 * over one by one, sets it down full and steps back aboard.
 */
function stepUnload(state: CanoeState, lane: CanoeLane, ring: BasketRing, cfg: CanoeConfig): void {
  const t = state.clock
  const step = Math.max(1e-3, cfg.stepSeconds)
  const lift = Math.max(1e-3, cfg.liftSeconds)
  const fillEnd = step + lift + state.catch * cfg.fillSecondsPerFish
  const setEnd = fillEnd + lift
  const nm = state.netMan
  const seatX = state.x + Math.sin(state.yaw) * CANOE_NETMAN_FORE
  const seatZ = state.z + Math.cos(state.yaw) * CANOE_NETMAN_FORE
  // Out along his seat → ashore, and back in at the end.
  const outT = ease(Math.min(1, t / step))
  const backT = ease(Math.max(0, (t - setEnd) / step))
  const ashoreT = outT * (1 - backT)
  nm.x = seatX + (lane.ashore.x - seatX) * ashoreT
  nm.z = seatZ + (lane.ashore.z - seatZ) * ashoreT
  nm.inBoat = ashoreT < 0.5
  nm.action = nm.inBoat ? 'sit' : 'ashore'
  const toBasket = yawOf(lane.basketSpot.x - lane.ashore.x, lane.basketSpot.z - lane.ashore.z)
  const toHull = yawOf(state.x - lane.ashore.x, state.z - lane.ashore.z)
  nm.yaw = nm.inBoat ? state.yaw : t < step + lift || t >= fillEnd ? toBasket : toHull
  // Bent down to lift the basket and to set it down again.
  const bend = (from: number) => Math.sin(Math.PI * Math.max(0, Math.min(1, (t - from) / lift)))
  nm.reach = t >= step && t < step + lift ? bend(step) : t >= fillEnd && t < setEnd ? bend(fillEnd) : 0
  // The basket changes hands at the bottom of each bend.
  if (t >= step + lift / 2 && !basketAt(ring, 'netman') && state.inHull > 0 && t < fillEnd) netmanTakesEmpty(ring)
  const handed = Math.max(0, Math.min(state.catch, Math.floor((t - step - lift) / cfg.fillSecondsPerFish)))
  const held = basketAt(ring, 'netman')
  while (held && held.fish < handed && state.inHull > 0) {
    netmanFillsOne(ring)
    state.inHull--
  }
  if (t >= fillEnd + lift / 2 && held) {
    while (state.inHull > 0 && netmanFillsOne(ring)) state.inHull--
    netmanSetsDown(ring)
  }
  state.paddlerAction = t >= step + lift && t < fillEnd ? 'hand' : 'hold'
}

/** One whole cycle's length with a catch of `fish` and every word spoken at
 *  once and obeyed after `obey` seconds. */
export function canoeCycleSeconds(cfg: CanoeConfig = balance.villageLife.canoe, fish = (cfg.catchMin + cfg.catchMax) / 2, obey = 2.2): number {
  const span = cfg.laneEnd - cfg.laneStart
  return (
    span / cfg.upstreamSpeed +
    obey +
    cfg.turnSeconds +
    span / cfg.downstreamSpeed +
    cfg.haulSeconds +
    cfg.landSeconds +
    unloadSeconds(fish, cfg) +
    obey +
    cfg.launchSeconds
  )
}

/**
 * The drift net's float line, as the picture draws it: `count` floats from the
 * net man's hand out into the river and trailing upstream behind the hull,
 * `net` of the way out. Empty while the net is folded.
 */
export function netFloats(state: Pick<CanoeState, 'net' | 'netMan' | 'x' | 'z'>, lane: Pick<CanoeLane, 'nx' | 'nz' | 'fx' | 'fz'>, cfg: CanoeConfig = balance.villageLife.canoe): BankPoint[] {
  if (state.net <= 1e-3) return []
  // The headline leaves the hull's river side level with the net man, at the
  // hull's own distance out — so a bow swung out into the current does not
  // carry the net further out than the water is drawn.
  const along = (state.netMan.x - state.x) * lane.fx + (state.netMan.z - state.z) * lane.fz
  const side = cfg.hullBeam / 2 + 0.25
  const hand = {
    x: state.x + lane.fx * along + lane.nx * side,
    z: state.z + lane.fz * along + lane.nz * side,
  }
  const out: BankPoint[] = []
  const n = Math.max(2, Math.round(cfg.netFloats))
  for (let i = 1; i <= n; i++) {
    const u = (i / n) * state.net
    const across = cfg.netReach * Math.sin((u * Math.PI) / 2)
    const back = cfg.netLength * u * 0.85
    out.push({ x: hand.x + lane.nx * across - lane.fx * back, z: hand.z + lane.nz * across - lane.fz * back })
  }
  return out
}
