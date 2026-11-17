// What the Giza plateau's people do (work-order "Giza activity", docs/
// giza-1890.md §4): the same handful of figures as GIZA_AMBIENT, no more, now
// in a few small parties — a guide leads a tourist and his hired camel between
// monument viewpoints, the dragoman walks the lady round the southern pyramids,
// the cameleer leads and tends his camel, the donkey-boy walks his donkey. At a
// viewpoint the tourist stops and looks at the monument while the guide turns
// to him; a handler at a tending stop turns to his animal.
//
// Pure data: no three.js, no scene. A pose is a function of time, so the same
// routine runs in Vitest. Every way runs on free sand clear of the monuments
// (validated in gizaActivity.test.ts); the settlement collision push-out is
// applied on top, so no body can stand inside a pyramid or the Sphinx.

import { GIZA_ACTIVITY } from '../../config/balance'
import { resolveMove, WALKER_RADIUS, type CircleCollider, type Collider } from './collision'
import { GIZA_AMBIENT, GIZA_PYRAMIDS, GIZA_SPHINX, gizaColliders } from './gizaSite'

/** A stop on a party's way: where the leader stands, what the party looks at,
 *  and what kind of stop it is (its pause comes from GIZA_ACTIVITY). */
export interface GizaStop {
  x: number
  z: number
  kind: 'view' | 'tend' | 'pass'
  /** What the visitors look at while stopped (a monument); unused on 'pass'. */
  look?: { x: number; z: number }
}

/** One party: a leader (index into GIZA_AMBIENT) and those who walk with him. */
export interface GizaParty {
  leader: number
  companions: ReadonlyArray<{ index: number; mount: boolean; side: 1 | -1 }>
  pace: keyof typeof GIZA_ACTIVITY.pace
  /** Closed loop of stops; stop 0 is the leader's GIZA_AMBIENT anchor. */
  route: readonly GizaStop[]
  /** Where in its cycle the party starts (s), so the parties never move in step. */
  offset: number
}

const pyramid = (id: string) => {
  const p = GIZA_PYRAMIDS.find((q) => q.id === id)!
  return { x: p.x, z: p.z }
}
const KHUFU = pyramid('khufu')
const KHAFRE = pyramid('khafre')
const MENKAURE = pyramid('menkaure')
const SPHINX = { x: GIZA_SPHINX.x, z: GIZA_SPHINX.z }

/** The plateau's parties. Every GIZA_AMBIENT figure belongs to exactly one. */
export const GIZA_PARTIES: readonly GizaParty[] = [
  // The guide with the tourist man and his hired camel: Khafre from the
  // approach, the Sphinx from the south and from the front (east), Khufu.
  {
    leader: 0,
    companions: [
      { index: 1, mount: false, side: -1 },
      { index: 2, mount: true, side: 1 },
    ],
    pace: 'stroll',
    route: [
      { x: 12, z: 50, kind: 'view', look: KHAFRE },
      { x: 28, z: 34, kind: 'view', look: SPHINX },
      { x: 52, z: 24, kind: 'view', look: SPHINX },
      { x: 50, z: 8, kind: 'pass' },
      { x: 24, z: 2, kind: 'view', look: KHUFU },
      { x: 13, z: 10, kind: 'pass' },
      { x: 12, z: 30, kind: 'view', look: KHAFRE },
    ],
    offset: 0,
  },
  // The dragoman with the lady: Khufu from the approach, Khafre, Menkaure —
  // a short round of the approach between the donkey's ground (west) and the
  // cameleer's (north-east), so the parties seldom meet.
  {
    leader: 8,
    companions: [{ index: 7, mount: false, side: 1 }],
    pace: 'stroll',
    route: [
      { x: 16, z: 58, kind: 'view', look: KHUFU },
      { x: 6, z: 48, kind: 'view', look: KHAFRE },
      { x: 0, z: 56, kind: 'view', look: MENKAURE },
      { x: 10, z: 60, kind: 'pass' },
    ],
    offset: 4,
  },
  // The cameleer leads his camel round the approach and sees to it.
  {
    leader: 3,
    companions: [{ index: 4, mount: true, side: 1 }],
    pace: 'camel',
    route: [
      { x: 4, z: 64, kind: 'tend' },
      { x: 8, z: 76, kind: 'pass' },
      { x: 30, z: 74, kind: 'tend' },
      { x: 34, z: 62, kind: 'pass' },
    ],
    offset: 2,
  },
  // The donkey-boy walks his donkey below Menkaure and back, west of the
  // dragoman's round.
  {
    leader: 5,
    companions: [{ index: 6, mount: true, side: -1 }],
    pace: 'donkey',
    route: [
      { x: -10, z: 60, kind: 'tend' },
      { x: -11, z: 45, kind: 'tend' },
      { x: -5, z: 46, kind: 'pass' },
      { x: -6, z: 56, kind: 'tend' },
    ],
    offset: 6,
  },
]

/** Where a figure is and which way it faces (yaw: atan2(dx, dz), the
 *  villagers' convention); `moving` while its party walks. */
export interface GizaPose {
  x: number
  z: number
  yaw: number
  moving: boolean
}

/** The collision radius a figure of the plateau stands with (m). */
export function gizaBodyRadius(index: number): number {
  const role = GIZA_AMBIENT[index]?.role
  if (role === 'camel') return GIZA_ACTIVITY.bodyRadius.camel
  if (role === 'donkey') return GIZA_ACTIVITY.bodyRadius.donkey
  return WALKER_RADIUS
}

/** A stop's pause (s): its kind's pause with a fixed per-stop spread. */
export function stopPause(stop: GizaStop, i: number): number {
  const base = GIZA_ACTIVITY.pause[stop.kind]
  // A fixed fraction per stop (golden-ratio sequence), no randomness.
  const f = (i * 0.618034 + 0.25) % 1
  return base * (1 + GIZA_ACTIVITY.pauseSpread * f)
}

interface Leg {
  x: number
  z: number
  dx: number
  dz: number
  len: number
  /** Arc length at the leg's start. */
  s0: number
}

function legsOf(route: readonly GizaStop[]): { legs: Leg[]; total: number } {
  const legs: Leg[] = []
  let s = 0
  route.forEach((a, i) => {
    const b = route[(i + 1) % route.length]
    const len = Math.hypot(b.x - a.x, b.z - a.z)
    legs.push({ x: a.x, z: a.z, dx: (b.x - a.x) / len, dz: (b.z - a.z) / len, len, s0: s })
    s += len
  })
  return { legs, total: s }
}

/** The point and heading at arc length `s` along the closed way. */
function atArc(legs: readonly Leg[], total: number, s: number): { x: number; z: number; yaw: number } {
  const w = ((s % total) + total) % total
  let leg = legs[legs.length - 1]
  for (const l of legs) {
    if (w < l.s0 + l.len) {
      leg = l
      break
    }
  }
  const d = w - leg.s0
  return { x: leg.x + leg.dx * d, z: leg.z + leg.dz * d, yaw: Math.atan2(leg.dx, leg.dz) }
}

/** One cycle of a party's way: how long it lasts and, at a time, where along
 *  the way the leader is and at which stop he stands (null while walking). */
export function partyCycle(party: GizaParty): { period: number; arcAt: (t: number) => { s: number; stop: number | null } } {
  const { legs } = legsOf(party.route)
  const pace = GIZA_ACTIVITY.pace[party.pace]
  const pauses = party.route.map((st, i) => stopPause(st, i))
  const period = legs.reduce((sum, l, i) => sum + pauses[i] + l.len / pace, 0)
  const arcAt = (t: number) => {
    let r = (((t + party.offset) % period) + period) % period
    for (let i = 0; i < legs.length; i++) {
      if (r < pauses[i]) return { s: legs[i].s0, stop: party.route[i].kind === 'pass' ? null : i }
      r -= pauses[i]
      const walk = legs[i].len / pace
      if (r < walk) return { s: legs[i].s0 + r * pace, stop: null }
      r -= walk
    }
    return { s: 0, stop: 0 }
  }
  return { period, arcAt }
}

const shapes = new Map<GizaParty, { legs: Leg[]; total: number; arcAt: (t: number) => { s: number; stop: number | null } }>()

/** Every party member's slot at time `t` (s), before collision and turning. */
function partyPoses(party: GizaParty, t: number, out: Map<number, GizaPose>): void {
  let shape = shapes.get(party)
  if (!shape) shapes.set(party, (shape = { ...legsOf(party.route), arcAt: partyCycle(party).arcAt }))
  const { legs, total } = shape
  const { s, stop } = shape.arcAt(t)
  const moving = stop === null
  const lead = atArc(legs, total, s)
  const members = party.companions.map((c) => {
    const lag = c.mount ? GIZA_ACTIVITY.lag.mount : GIZA_ACTIVITY.lag.companion
    const side = (c.mount ? GIZA_ACTIVITY.side.mount : GIZA_ACTIVITY.side.companion) * c.side
    const p = atArc(legs, total, s - lag)
    // The heading the body keeps beside the way: the chord over a short window
    // of the way around its trailing point, which turns smoothly through a
    // corner (the way's own heading flips there, and the sideways offset with
    // it would jump the body — a jump drops the stride, figureWalk).
    const a = atArc(legs, total, s - lag - GIZA_ACTIVITY.turnWindow)
    const b = atArc(legs, total, s - lag + GIZA_ACTIVITY.turnWindow)
    const chord = Math.hypot(b.x - a.x, b.z - a.z)
    const ux = chord > 1e-6 ? (b.x - a.x) / chord : Math.sin(p.yaw)
    const uz = chord > 1e-6 ? (b.z - a.z) / chord : Math.cos(p.yaw)
    // The right of a heading (ux, uz) is (uz, −ux) in this convention.
    let x = p.x + uz * side
    let z = p.z - ux * side
    // A sharp corner's cut brings the trailing body in toward the leader: it
    // keeps a gap (the lead rope's length, the tourist's step aside).
    const gap = lag * 0.8
    const d = Math.hypot(x - lead.x, z - lead.z)
    if (d < gap && d > 1e-6) {
      x = lead.x + ((x - lead.x) * gap) / d
      z = lead.z + ((z - lead.z) * gap) / d
    }
    return { c, x, z, yaw: Math.atan2(ux, uz) }
  })
  let leadYaw = lead.yaw
  if (!moving && members.length > 0) {
    // Stopped: the leader turns to the one he walks with (to talk, or to see
    // to the animal).
    leadYaw = Math.atan2(members[0].x - lead.x, members[0].z - lead.z)
  }
  out.set(party.leader, { x: lead.x, z: lead.z, yaw: leadYaw, moving })
  const look = stop !== null ? party.route[stop].look : undefined
  for (const m of members) {
    // A visitor at a viewpoint looks at the monument; a mount keeps its heading.
    const yaw = !moving && look && !m.c.mount ? Math.atan2(look.x - m.x, look.z - m.z) : m.yaw
    out.set(m.c.index, { x: m.x, z: m.z, yaw, moving })
  }
}

let colliderCache: Collider[] | null = null
const plateauColliders = () => (colliderCache ??= gizaColliders())

/**
 * Every plateau figure's SLOT at time `t` (s), indexed like GIZA_AMBIENT: where
 * the way puts it and which way it should face. A leader walks exactly here; a
 * companion follows its slot at a bounded pace (`stepGizaActivity`). Each
 * position is pushed out of the monument colliders (the settlement collision
 * the villagers use), so no slot lies in a monument.
 */
export function gizaActivityAt(t: number, colliders: Collider[] = plateauColliders()): GizaPose[] {
  const poses = new Map<number, GizaPose>()
  for (const party of GIZA_PARTIES) partyPoses(party, t, poses)
  return GIZA_AMBIENT.map((a, i) => {
    const p = poses.get(i) ?? { x: a.x, z: a.z, yaw: 0, moving: false }
    const [x, z] = resolveMove(colliders, p.x, p.z, gizaBodyRadius(i))
    return { ...p, x, z }
  })
}

/** Turn a heading toward a target at a bounded rate (rad/s), the short way. */
export function turnToward(yaw: number, target: number, dt: number, rate: number = GIZA_ACTIVITY.turnRate): number {
  const lag = Math.atan2(Math.sin(target - yaw), Math.cos(target - yaw))
  return yaw + Math.max(-rate * dt, Math.min(rate * dt, lag))
}

/** The plateau's live figures: the simulated clock (a whole number of
 *  GIZA_ACTIVITY.step), elapsed time not yet simulated, and every figure's pose. */
export interface GizaActivity {
  t: number
  /** Elapsed time carried to the next frame, under one step (s). */
  pending: number
  poses: GizaPose[]
}

/** Each figure's party pace (m/s), indexed like GIZA_AMBIENT. */
const PACE = GIZA_AMBIENT.map((_, i) => {
  const party = GIZA_PARTIES.find((p) => p.leader === i || p.companions.some((c) => c.index === i))
  return party ? GIZA_ACTIVITY.pace[party.pace] : 0
})

/** The plateau's figures standing in their slots at time `t0` (s). */
export function startGizaActivity(t0 = 0): GizaActivity {
  return { t: t0, pending: 0, poses: gizaActivityAt(t0).map((p) => ({ ...p })) }
}

/** Rounding slack when the carried time is compared with a whole step. */
const STEP_SLACK = 1e-9

/**
 * Advance the plateau by `dt` (s) of elapsed time, in fixed substeps of
 * GIZA_ACTIVITY.step (the remainder is carried to the next call), so the same
 * elapsed time gives the same poses whatever the frame cadence. Mutates `state`.
 */
export function stepGizaActivity(state: GizaActivity, dt: number, colliders: Collider[] = plateauColliders()): void {
  const h = GIZA_ACTIVITY.step
  state.pending += Math.max(0, dt)
  while (state.pending >= h - STEP_SLACK) {
    state.pending -= h
    substep(state, h, colliders)
  }
}

/**
 * One fixed substep: every figure follows its slot no faster than its party's
 * pace × `catchUp` (a leader walks exactly on it; a companion swings round a
 * corner by walking, never by a jump, which would drop the stride,
 * figureWalk). Each move is the settlement collision's swept move against the
 * monuments AND the other bodies where they stand, so no body crosses into a
 * monument or into another body; every heading turns at a bounded rate.
 */
function substep(state: GizaActivity, dt: number, colliders: Collider[]): void {
  state.t += dt
  const slots = gizaActivityAt(state.t, colliders)
  const bodies: CircleCollider[] = state.poses.map((p, i) => ({ x: p.x, z: p.z, r: gizaBodyRadius(i) }))
  slots.forEach((slot, i) => {
    const cur = state.poses[i]
    const pace = PACE[i]
    let tx = slot.x
    let tz = slot.z
    const d = Math.hypot(tx - cur.x, tz - cur.z)
    const cap = pace * GIZA_ACTIVITY.catchUp * dt
    if (d > cap) {
      tx = cur.x + ((tx - cur.x) * cap) / d
      tz = cur.z + ((tz - cur.z) * cap) / d
    }
    const others = bodies.filter((_, j) => j !== i)
    const [x, z] = resolveMove([...colliders, ...others], tx, tz, gizaBodyRadius(i), [cur.x, cur.z])
    bodies[i].x = x
    bodies[i].z = z
    // Facing: a body still catching up faces where it goes; otherwise the
    // slot's heading (the way, the monument, the one he walks with).
    const walked = Math.hypot(x - cur.x, z - cur.z)
    const behind = Math.hypot(slot.x - x, slot.z - z)
    const want = walked > pace * dt * 0.5 && behind > 0.2 ? Math.atan2(x - cur.x, z - cur.z) : slot.yaw
    state.poses[i] = { x, z, yaw: turnToward(cur.yaw, want, dt), moving: slot.moving }
  })
}
