// THE VILLAGER'S DUGOUT CANOE (work-order 1237, design.md §13.4).
//
// At a riverside village a local fisherman paddles a dugout on a lane of his
// own BESIDE the children's bank game: a second picture of UPSTREAM and
// DOWNSTREAM, told by a body working against the current and then riding it.
// The Niger's Bozo/Somono river people of 1890 are the regional reference.
//
// SIDE BY SIDE, NOT TOGETHER (user 29.09.2026). The lane lies downstream of the
// children's stretch and far enough from it that the player can stand where he
// sees either the game or the boat: no standing place hears the SPOKEN words of
// both. Only his call — a call, not speech — carries into the children's zone.
//
// THE CYCLE, and why each leg looks the way it does:
//  - up:     kneeling, paddling hard, close in where the current is weakest;
//  - turn:   at the upstream end the bow swings out into the current;
//  - down:   carried by the current, steering strokes only;
//  - land:   at the downstream end the bow is run onto the sand;
//  - trap:   he steps out and checks his fish trap at the waterline;
//  - launch: he pushes off and heads upstream again.
// Once per leg, shortly after the canoe is visibly under way, he CALLS the
// direction word of his heading. He never leaves the range and never despawns.
//
// Pure logic: the scene draws and speaks what this decides.

import { balance } from '../../config/balance'
import type { BankPoint, PlaceRiverBank } from './riverBank'

type CanoeConfig = typeof balance.villageLife.canoe

export type CanoePhase = 'up' | 'turn' | 'down' | 'land' | 'trap' | 'launch'
export type CanoeWord = 'UPSTREAM' | 'DOWNSTREAM'

/** The phases in the order one cycle runs them. */
export const CANOE_PHASES: readonly CanoePhase[] = ['up', 'turn', 'down', 'land', 'trap', 'launch']

/** The lane and the landing, in the settlement's own frame. */
export interface CanoeLane {
  /** The bank frame: normal toward the water, and DOWNSTREAM along it. */
  nx: number
  nz: number
  fx: number
  fz: number
  /** Along-bank position of the children's stretch centre — s = 0. */
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
  /** The fish trap at the waterline, and where he crouches to check it. */
  trap: BankPoint
  checkStand: BankPoint
}

/** How far the bow runs up onto the sand past the waterline, in metres. */
const BOW_ON_SAND = 0.4
/** How far downstream of the bow the trap is set, and how far out. */
const TRAP_ALONG = 1.3
const TRAP_OUT = 0.35
/** How far inland of the trap he crouches to reach it. */
const CHECK_INLAND = 0.55
/** How far aft of the canoe's centre he kneels. */
export const CANOE_SEAT_AFT = 0.6

/** A point `s` along the bank from the stretch centre, `out` along the normal. */
function at(lane: Pick<CanoeLane, 'nx' | 'nz' | 'fx' | 'fz' | 'origin'>, s: number, out: number): BankPoint {
  const along = lane.origin + s
  return { x: lane.nx * out + lane.fx * along, z: lane.nz * out + lane.fz * along }
}

/**
 * The canoe's lane at a village bank. `s` is measured DOWNSTREAM from the
 * centre of the children's stretch — the midpoint of the two stretch points —
 * so the lane moves with the stretch wherever the settled bank puts it.
 */
export function canoeLane(
  bank: Pick<PlaceRiverBank, 'nx' | 'nz' | 'fx' | 'fz' | 'distance' | 'upstream' | 'downstream'>,
  cfg: CanoeConfig = balance.villageLife.canoe,
): CanoeLane {
  const mid = { x: (bank.upstream.x + bank.downstream.x) / 2, z: (bank.upstream.z + bank.downstream.z) / 2 }
  const frame = { nx: bank.nx, nz: bank.nz, fx: bank.fx, fz: bank.fz, origin: mid.x * bank.fx + mid.z * bank.fz }
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
    trap: at(frame, cfg.laneEnd + TRAP_ALONG, bank.distance + TRAP_OUT),
    checkStand: at(frame, cfg.laneEnd + TRAP_ALONG, bank.distance + TRAP_OUT - CHECK_INLAND),
  }
}

/** A point on the lane itself, `s` downstream of the stretch centre. */
export function lanePoint(lane: CanoeLane, s: number): BankPoint {
  return at(lane, s, lane.out)
}

/** Closest distance between two segments in the plane. */
function segmentGap(a: BankPoint, b: BankPoint, c: BankPoint, d: BankPoint): number {
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
 * The least distance between the canoe's range and the children's stretch —
 * the running lane between the two play rocks, where the round is played and
 * where its spoken words fall. The range is the lane plus the run in to the
 * landing and the trap, since he speaks nowhere but on the lane, yet is seen
 * everywhere on it.
 */
export function canoeStretchGap(lane: CanoeLane, rocks: { upstream: BankPoint; downstream: BankPoint }): number {
  return Math.min(
    segmentGap(lane.start, lane.end, rocks.upstream, rocks.downstream),
    segmentGap(lane.end, lane.berth, rocks.upstream, rocks.downstream),
    segmentGap(lane.trap, lane.checkStand, rocks.upstream, rocks.downstream),
  )
}

/** The yaw that turns a figure's or the hull's local +Z onto a heading. */
export function yawOf(x: number, z: number): number {
  return Math.atan2(x, z)
}

/** Wraps an angle to (−π, π]. */
function wrap(a: number): number {
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

/** Where the paddler is and how far into the trap check he is bent. */
export interface CanoePaddler {
  x: number
  z: number
  yaw: number
  /** Kneeling in the hull, or out on the bank at the trap. */
  inBoat: boolean
  /** 0 upright/kneeling at rest, 1 fully reached down at the trap. */
  reach: number
}

export interface CanoeState {
  phase: CanoePhase
  /** Seconds spent in the current phase. */
  clock: number
  /** Along-bank position of the hull's centre on the lane (lane phases). */
  s: number
  x: number
  z: number
  /** The hull's yaw (local +Z is the bow). */
  yaw: number
  /** This landing's trap check, drawn when he lands. */
  trapSeconds: number
  /** Whether this leg's call has been made. */
  called: boolean
  /** A call due and not yet granted by the floor. */
  owed: CanoeWord | null
  /** Paddle strokes so far, fractional: the stroke picture reads its phase. */
  stroke: number
  paddler: CanoePaddler
  /** Every call made, for the dev read-back. */
  calls: number
  lastCall: CanoeWord | null
}

/** What the scene lets the canoe do this step. */
export interface CanoeView {
  /** Asks the settlement's floor (and the ROCK-first rule) for the call; true
   *  when the word is spoken now. */
  mayCall: (word: CanoeWord) => boolean
  /** A leg ended with its call still owed: the floor forgets it. */
  drop?: () => void
}

/** The word of a leg: the direction he is heading. */
export function legWord(phase: CanoePhase): CanoeWord | null {
  return phase === 'up' ? 'UPSTREAM' : phase === 'down' ? 'DOWNSTREAM' : null
}

/** Starts the cycle at the downstream end, pushing off upstream. */
export function createCanoe(lane: CanoeLane, cfg: CanoeConfig = balance.villageLife.canoe): CanoeState {
  const state: CanoeState = {
    phase: 'up',
    clock: 0,
    s: cfg.laneEnd,
    x: lane.end.x,
    z: lane.end.z,
    yaw: yawOf(-lane.fx, -lane.fz),
    trapSeconds: cfg.trapMinSeconds,
    called: false,
    owed: null,
    stroke: 0,
    paddler: { x: lane.end.x, z: lane.end.z, yaw: 0, inBoat: true, reach: 0 },
    calls: 0,
    lastCall: null,
  }
  seat(state)
  return state
}

/** Puts the paddler on his seat, kneeling aft of the centre and facing the bow. */
function seat(state: CanoeState): void {
  state.paddler.inBoat = true
  state.paddler.reach = 0
  state.paddler.yaw = state.yaw
  state.paddler.x = state.x - Math.sin(state.yaw) * CANOE_SEAT_AFT
  state.paddler.z = state.z - Math.cos(state.yaw) * CANOE_SEAT_AFT
}

function enter(state: CanoeState, phase: CanoePhase): void {
  state.phase = phase
  state.clock = 0
  state.called = false
  state.owed = null
}

/**
 * Advances the canoe by `dt` seconds. Returns the direction word he calls this
 * step, or null. `rand` draws the trap check's length at each landing.
 */
export function stepCanoe(
  state: CanoeState,
  lane: CanoeLane,
  view: CanoeView,
  dt: number,
  cfg: CanoeConfig = balance.villageLife.canoe,
  rand: () => number = Math.random,
): CanoeWord | null {
  state.clock += dt
  const upYaw = yawOf(-lane.fx, -lane.fz)
  const downYaw = yawOf(lane.fx, lane.fz)
  const outYaw = yawOf(lane.nx, lane.nz)
  const shoreYaw = yawOf(-lane.nx, -lane.nz)
  let said: CanoeWord | null = null

  switch (state.phase) {
    case 'up': {
      state.s = Math.max(cfg.laneStart, state.s - cfg.upstreamSpeed * dt)
      state.yaw = upYaw
      state.stroke += dt / cfg.strokeSeconds
      break
    }
    case 'turn': {
      // The bow swings OUT into the current: from upstream, through the
      // outward normal, to downstream.
      const t = ease(state.clock / cfg.turnSeconds)
      const via = wrap(outYaw - upYaw)
      state.yaw = upYaw + via * 2 * t
      state.stroke += dt / cfg.strokeSeconds
      break
    }
    case 'down': {
      state.s = Math.min(cfg.laneEnd, state.s + cfg.downstreamSpeed * dt)
      state.yaw = downYaw
      state.stroke += dt / cfg.steerStrokeSeconds
      break
    }
    case 'land': {
      const t = ease(state.clock / cfg.landSeconds)
      const from = lanePoint(lane, cfg.laneEnd)
      state.x = from.x + (lane.berth.x - from.x) * t
      state.z = from.z + (lane.berth.z - from.z) * t
      state.yaw = downYaw + wrap(shoreYaw - downYaw) * t
      state.stroke += dt / cfg.strokeSeconds
      break
    }
    case 'trap':
      break
    case 'launch': {
      const t = ease(state.clock / cfg.launchSeconds)
      const to = lanePoint(lane, cfg.laneEnd)
      state.x = lane.berth.x + (to.x - lane.berth.x) * t
      state.z = lane.berth.z + (to.z - lane.berth.z) * t
      state.yaw = shoreYaw + wrap(upYaw - shoreYaw) * t
      state.stroke += dt / cfg.strokeSeconds
      break
    }
  }

  if (state.phase === 'up' || state.phase === 'turn' || state.phase === 'down') {
    const p = lanePoint(lane, state.s)
    state.x = p.x
    state.z = p.z
  }

  // THE CALL: once per leg, shortly after the canoe is visibly under way.
  const word = legWord(state.phase)
  if (word && !state.called && state.clock >= cfg.callDelaySeconds) {
    state.owed = word
    if (view.mayCall(word)) {
      state.called = true
      state.owed = null
      state.calls++
      state.lastCall = word
      said = word
    }
  }

  // The paddler: kneeling on his seat, except while he is out at the trap.
  if (state.phase === 'trap') {
    const step = Math.max(1e-3, cfg.stepSeconds)
    const out = Math.min(1, state.clock / step)
    const back = Math.min(1, Math.max(0, (state.trapSeconds - state.clock) / step))
    const t = ease(Math.min(out, back))
    const seatX = state.x - Math.sin(state.yaw) * CANOE_SEAT_AFT
    const seatZ = state.z - Math.cos(state.yaw) * CANOE_SEAT_AFT
    state.paddler.inBoat = t < 0.5
    state.paddler.x = seatX + (lane.checkStand.x - seatX) * t
    state.paddler.z = seatZ + (lane.checkStand.z - seatZ) * t
    // He turns from his seated heading toward the trap as he steps out, and
    // back as he steps in, so boarding and leaving never snap his heading.
    const trapYaw = yawOf(lane.trap.x - lane.checkStand.x, lane.trap.z - lane.checkStand.z)
    state.paddler.yaw = state.yaw + wrap(trapYaw - state.yaw) * t
    // Down to the trap and up again, a slow haul-and-look while he is there.
    state.paddler.reach = t * (0.75 + 0.25 * Math.sin(state.clock * 1.3))
  } else {
    seat(state)
  }

  // Phase ends.
  const endLeg = (next: CanoePhase) => {
    if (state.owed && view.drop) view.drop()
    enter(state, next)
  }
  switch (state.phase) {
    case 'up':
      if (state.s <= cfg.laneStart) endLeg('turn')
      break
    case 'turn':
      if (state.clock >= cfg.turnSeconds) {
        state.yaw = downYaw
        enter(state, 'down')
      }
      break
    case 'down':
      if (state.s >= cfg.laneEnd) endLeg('land')
      break
    case 'land':
      if (state.clock >= cfg.landSeconds) {
        state.trapSeconds = cfg.trapMinSeconds + rand() * (cfg.trapMaxSeconds - cfg.trapMinSeconds)
        enter(state, 'trap')
      }
      break
    case 'trap':
      if (state.clock >= state.trapSeconds) {
        seat(state)
        enter(state, 'launch')
      }
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

/** One whole cycle's length, with a trap check of `trapSeconds`. */
export function canoeCycleSeconds(cfg: CanoeConfig = balance.villageLife.canoe, trapSeconds = cfg.trapMinSeconds): number {
  const span = cfg.laneEnd - cfg.laneStart
  return span / cfg.upstreamSpeed + cfg.turnSeconds + span / cfg.downstreamSpeed + cfg.landSeconds + trapSeconds + cfg.launchSeconds
}
