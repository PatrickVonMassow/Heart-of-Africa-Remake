// The inhabitants notice the traveller (design.md §19.10): a pure predicate
// that decides WHO glances (radius, per-inhabitant cooldown, a settlement-wide
// cap, exemptions) and the bounded facing step that turns a figure toward the
// player and back. No React, no three.js: PlaceLife only wires it in.
import { balance } from '../../config/balance'
import { turnToward } from './animalSpots'

export type NoticeConfig = Readonly<typeof balance.villageLife.notice>

/** One inhabitant's notice state, kept across frames by its id. */
export interface NoticeEntry {
  /** Seconds the current glance still holds; > 0 means glancing. */
  glance: number
  /** Seconds before this inhabitant may start another glance. */
  cooldown: number
  /** Facing to return to once the glance ends; null when nothing to return. */
  rest: number | null
  /** Unit vector from the traveller to the inhabitant at the glance's start. */
  awayX: number
  awayZ: number
  /** Where it stood last frame, for its own speed (a walker keeps walking). */
  lastX: number
  lastZ: number
}

/** Every inhabitant of one settlement, so the cap counts them all. */
export interface NoticeBoard {
  entries: Map<string, NoticeEntry>
}

export interface Traveller {
  active: boolean
  x: number
  z: number
}

export interface NoticeOptions {
  /** A drama or errand that must not be interrupted: no glance, and a running one ends. */
  exempt?: boolean
  /** Children stare a moment longer. */
  child?: boolean
}

export function createNoticeBoard(): NoticeBoard {
  return { entries: new Map() }
}

/** The settlement's own board; PlaceLife clears it when a place opens. */
export const placeNoticeBoard: NoticeBoard = createNoticeBoard()

/** How many inhabitants are glancing right now. */
export function glancingCount(board: NoticeBoard): number {
  let n = 0
  for (const e of board.entries.values()) if (e.glance > 0) n++
  return n
}

/**
 * Advance inhabitant `id` by `dt` and decide whether it glances: only inside
 * `cfg.radius`, never while its cooldown runs, never while it moves faster than
 * `cfg.childMaxSpeed` (it is walking an errand or running a chase), never when
 * exempt, and never past `cfg.maxAtOnce` glancing at once. Called once per
 * inhabitant per frame. Returns the entry; `entry.glance > 0` means glancing.
 */
export function noticeStep(
  board: NoticeBoard,
  id: string,
  at: { x: number; z: number },
  player: Traveller,
  options: NoticeOptions,
  cfg: NoticeConfig,
  dt: number,
): NoticeEntry {
  let e = board.entries.get(id)
  if (!e) {
    e = { glance: 0, cooldown: 0, rest: null, awayX: 0, awayZ: 0, lastX: at.x, lastZ: at.z }
    board.entries.set(id, e)
  }
  const speed = dt > 0 ? Math.hypot(at.x - e.lastX, at.z - e.lastZ) / dt : 0
  e.lastX = at.x
  e.lastZ = at.z
  e.glance = Math.max(0, e.glance - dt)
  e.cooldown = Math.max(0, e.cooldown - dt)
  // Exempt, gone, or moving on its own errand: the glance ends and its own
  // steering owns the facing again, with nothing to turn back to.
  if (options.exempt || !player.active || speed > cfg.childMaxSpeed) {
    e.glance = 0
    e.rest = null
    return e
  }
  if (e.glance > 0 || e.cooldown > 0) return e
  const dx = at.x - player.x
  const dz = at.z - player.z
  const d = Math.hypot(dx, dz)
  if (d > cfg.radius || d < 1e-6) return e
  if (glancingCount(board) >= cfg.maxAtOnce) return e
  e.glance = cfg.glanceSeconds * (options.child ? cfg.childFactor : 1)
  e.cooldown = e.glance + cfg.cooldownSeconds
  e.awayX = dx / d
  e.awayZ = dz / d
  return e
}

/** Bearing from `at` to the traveller, in the figures' atan2(dx, dz) yaw convention. */
export function bearingTo(at: { x: number; z: number }, player: Traveller): number {
  return Math.atan2(player.x - at.x, player.z - at.z)
}

/**
 * The facing this frame: while glancing a step of at most `maxStep` toward the
 * traveller, remembering the facing it left; afterwards a step of at most
 * `maxStep` back to `rest` (that remembered facing when none is given). Never a
 * snap: the result differs from `current` by at most `maxStep`.
 */
export function glanceYaw(
  e: NoticeEntry,
  current: number,
  at: { x: number; z: number },
  player: Traveller,
  maxStep: number,
  rest?: number,
): number {
  if (e.glance > 0) {
    if (e.rest === null) e.rest = current
    return turnToward(current, bearingTo(at, player), maxStep)
  }
  const back = rest ?? e.rest
  if (back === null) return current
  const next = turnToward(current, back, maxStep)
  if (next === back) e.rest = null
  return next
}

/** True while the figure is still turned away from its own facing by the glance. */
export function glanceActive(e: NoticeEntry): boolean {
  return e.glance > 0 || e.rest !== null
}

/** The goat's shy weight (0 … 1), eased so the step away takes `goatShySeconds`. */
export function shyWeight(weight: number, glancing: boolean, cfg: NoticeConfig, dt: number): number {
  const target = glancing ? 1 : 0
  const rate = dt / Math.max(1e-3, cfg.goatShySeconds)
  return weight < target ? Math.min(target, weight + rate) : Math.max(target, weight - rate)
}
