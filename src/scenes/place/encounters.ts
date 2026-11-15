// The inhabitants take notice of each other (design.md §19.10): two walkers
// whose paths cross stop, face each other, bow and go on; a meeting may pass
// the head load from one to the other; and the fire gathers more than its lone
// tender. This module is the pure decision layer — partner choice, the meeting
// window, the pair cooldown, the exactly-once handover and the gathering slots.
// `Walkers` in PlaceLife.tsx carries the figures; nothing here touches a scene.

export interface EncounterTuning {
  radius: number
  meetSeconds: number
  pairCooldownSeconds: number
  walkerRestSeconds: number
  meetChance: number
  handoverChance: number
  doorClearance: number
}

/** One walker as the encounters see it. `available` is the caller's verdict
 *  on the errand itself: out and walking a lane, not paused, not on a door
 *  segment, not indoors. */
export interface EncounterWalker {
  x: number
  z: number
  available: boolean
  carries: boolean
}

export interface Meeting {
  a: number
  b: number
  /** Seconds the window still holds. */
  remaining: number
  total: number
  /** The carrier giving its load, when this meeting is a handover. */
  giver: number | null
  /** Set once the load has changed owner — never twice. */
  handed: boolean
}

export interface EncounterBoard {
  meetings: Meeting[]
  /** Pair key → seconds until that pair may meet again. */
  pairCooldown: Map<string, number>
  /** Walker → seconds until it may meet anyone again. */
  rest: Map<number, number>
}

export type EncounterEvent =
  | { kind: 'meet'; a: number; b: number; handover: boolean }
  | { kind: 'handover'; from: number; to: number }
  | { kind: 'part'; a: number; b: number }

export interface EncounterWorld {
  /** True where a figure may stand (outside every collider). */
  standClear: (x: number, z: number) => boolean
  doorways: ReadonlyArray<readonly [number, number]>
}

export function createEncounterBoard(): EncounterBoard {
  return { meetings: [], pairCooldown: new Map(), rest: new Map() }
}

export function pairKey(a: number, b: number): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

export function meetingOf(board: EncounterBoard, i: number): Meeting | null {
  return board.meetings.find((m) => m.a === i || m.b === i) ?? null
}

/** Where a figure may stop for a meeting: on free ground and clear of every
 *  doorway, so a greeting never stands in a collider or blocks an entrance. */
export function meetingSpotOk(x: number, z: number, world: EncounterWorld, tuning: Pick<EncounterTuning, 'doorClearance'>): boolean {
  if (!world.standClear(x, z)) return false
  return world.doorways.every(([dx, dz]) => Math.hypot(x - dx, z - dz) >= tuning.doorClearance)
}

/** The nearest walker `i` may meet now, or null: available, within the radius,
 *  not already in an encounter, not resting, not on cooldown with `i`, and both
 *  standing spots free (never inside a building, never in a doorway). */
export function choosePartner(
  walkers: readonly EncounterWalker[],
  i: number,
  board: EncounterBoard,
  world: EncounterWorld,
  tuning: EncounterTuning,
): number | null {
  const me = walkers[i]
  if (!me || !me.available || meetingOf(board, i) || (board.rest.get(i) ?? 0) > 0) return null
  if (!meetingSpotOk(me.x, me.z, world, tuning)) return null
  let best: number | null = null
  let bestD = Infinity
  walkers.forEach((w, j) => {
    if (j === i || !w.available || meetingOf(board, j) || (board.rest.get(j) ?? 0) > 0) return
    if ((board.pairCooldown.get(pairKey(i, j)) ?? 0) > 0) return
    const d = Math.hypot(w.x - me.x, w.z - me.z)
    if (d > tuning.radius || d >= bestD) return
    if (!meetingSpotOk(w.x, w.z, world, tuning)) return
    best = j
    bestD = d
  })
  return best
}

/**
 * Moves the load from `from` to `to` — only when the giver carries and the
 * receiver does not, so the load always has exactly one carrier. Returns
 * whether it moved.
 */
export function handOver(loads: boolean[], from: number, to: number): boolean {
  if (from === to || !loads[from] || loads[to]) return false
  loads[from] = false
  loads[to] = true
  return true
}

/** The meeting's share of its window that has passed (0 … 1). */
export function meetingProgress(m: Meeting): number {
  return m.total > 0 ? Math.min(1, Math.max(0, 1 - m.remaining / m.total)) : 1
}

/** The greeting bow: a lean that rises and settles inside the first half of the
 *  window, so the pair stand upright again before they part. */
export function bowLean(m: Meeting, peak: number): number {
  const u = meetingProgress(m)
  const a = 0.15
  const b = 0.5
  if (u <= a || u >= b) return 0
  return peak * Math.sin(((u - a) / (b - a)) * Math.PI)
}

/** The heading (rad) that faces from `me` to `other`; forward is +z. */
export function facingYaw(me: { x: number; z: number }, other: { x: number; z: number }): number {
  return Math.atan2(other.x - me.x, other.z - me.z)
}

/** One encounter step: ticks the cooldowns, ends expired windows (both parties
 *  resume, the pair and each walker go on cooldown), hands a load over at the
 *  window's middle, and begins new meetings. Mutates `board` and `loads`. */
export function stepEncounters(
  board: EncounterBoard,
  walkers: readonly EncounterWalker[],
  loads: boolean[],
  world: EncounterWorld,
  tuning: EncounterTuning,
  dt: number,
  rand: () => number,
): EncounterEvent[] {
  const events: EncounterEvent[] = []
  for (const [k, v] of board.pairCooldown) {
    if (v - dt <= 0) board.pairCooldown.delete(k)
    else board.pairCooldown.set(k, v - dt)
  }
  for (const [k, v] of board.rest) {
    if (v - dt <= 0) board.rest.delete(k)
    else board.rest.set(k, v - dt)
  }
  board.meetings = board.meetings.filter((m) => {
    m.remaining -= dt
    if (m.giver !== null && !m.handed && meetingProgress(m) >= 0.5) {
      const to = m.giver === m.a ? m.b : m.a
      m.handed = true
      if (handOver(loads, m.giver, to)) events.push({ kind: 'handover', from: m.giver, to })
    }
    if (m.remaining > 0) return true
    board.pairCooldown.set(pairKey(m.a, m.b), tuning.pairCooldownSeconds)
    board.rest.set(m.a, tuning.walkerRestSeconds)
    board.rest.set(m.b, tuning.walkerRestSeconds)
    events.push({ kind: 'part', a: m.a, b: m.b })
    return false
  })
  for (let i = 0; i < walkers.length; i++) {
    const j = choosePartner(walkers, i, board, world, tuning)
    if (j === null) continue
    // One roll per pair coming into range: a refusal cools the pair down too,
    // so a crossing is decided once rather than re-rolled every frame.
    if (rand() >= tuning.meetChance) {
      board.pairCooldown.set(pairKey(i, j), tuning.pairCooldownSeconds)
      continue
    }
    const oneCarries = loads[i] !== loads[j]
    const giver = oneCarries && rand() < tuning.handoverChance ? (loads[i] ? i : j) : null
    board.meetings.push({ a: i, b: j, remaining: tuning.meetSeconds, total: tuning.meetSeconds, giver, handed: false })
    events.push({ kind: 'meet', a: i, b: j, handover: giver !== null })
  }
  return events
}

export interface GatherSlot {
  x: number
  z: number
  /** Facing the fire. */
  yaw: number
}

/**
 * Standing places for the companions beside the fire tender: on a ring around
 * the fire, on free ground, clear of every fixed figure spot (`avoid`) and of
 * each other. Fewer than asked where the ground is crowded; never one inside a
 * collider.
 */
export function gatheringSlots(
  fire: readonly [number, number],
  count: number,
  opts: {
    ring: number
    avoid: ReadonlyArray<readonly [number, number]>
    avoidRadius: number
    standClear: (x: number, z: number) => boolean
    /** Angle (rad) the search starts from, so the pair sits beside the tender. */
    startAngle: number
    steps?: number
  },
): GatherSlot[] {
  const steps = opts.steps ?? 16
  const out: GatherSlot[] = []
  for (let k = 0; k < steps && out.length < count; k++) {
    // Alternate either side of the start, nearest first.
    const n = Math.ceil(k / 2) * (k % 2 === 1 ? 1 : -1)
    const a = opts.startAngle + (n * 2 * Math.PI) / steps
    const x = fire[0] + Math.sin(a) * opts.ring
    const z = fire[1] + Math.cos(a) * opts.ring
    if (!opts.standClear(x, z)) continue
    const taken = [...opts.avoid, ...out.map((s) => [s.x, s.z] as const)]
    if (taken.some(([ax, az]) => Math.hypot(x - ax, z - az) < opts.avoidRadius)) continue
    out.push({ x, z, yaw: facingYaw({ x, z }, { x: fire[0], z: fire[1] }) })
  }
  return out
}
