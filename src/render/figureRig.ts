// Carrying the settlement's existing poses onto the skinned body (work-order
// "villager dress", final state 6).
//
// Every pose in the game — the drummer, the fishers, the weaver, the pounding
// women, the FigureLimbs pivots the vignettes write — is stated for the
// PRIMITIVE figure: shoulder pivots low on a cone, a straight arm 0.44 body
// heights long, and the contact solvers (rockTouch, mortarPounding, loomWork)
// place a hand on a stone, a pestle or a shuttle through that geometry to the
// centimetre. A human body has its shoulders higher and its arm jointed, so the
// angles alone would put every hand somewhere else.
//
// So the skinned figure keeps the primitive's pivots as an invisible VIRTUAL
// rig the poses are written onto, unchanged, and this module turns that into
// bones: an arm whose pose is a CONTACT (the vignette wrote it) takes its hand
// to where the primitive's hand is, by two-bone IK with the elbow bent back and
// out — leaning the chest a little forward when the hand is just out of reach in
// front — and an arm that only GESTURES (pointing, at rest) keeps the pose's
// direction, with the primitive's wide resting splay narrowed to a human one.

import * as THREE from 'three/webgpu'
import type { ArmPose } from './gesture'

/** How much of the primitive's resting outward roll a hanging arm keeps: the
 *  cone needed 0.46 rad to clear its own flank; a body's arm hangs nearly
 *  plumb, clearing chest and hip by a hand's breadth (a third of it held the
 *  hands out from the thighs like a mannequin's). */
export const HANGING_ROLL_KEEP = 0.18
/** The most the chest may lean forward to bring a contact into reach (rad). */
export const CONTACT_LEAN_MAX = 0.5
/** The deepest contact crouch (rad of knee flex per joint): a full squat at
 *  the water's edge, feet on the ground. */
export const CROUCH_MAX = 1.1
/**
 * The contact crouch: the smallest knee flex (0.1 rad steps up to CROUCH_MAX)
 * at which `shortAt(c)` — the hand's shortfall with the hips dropped for that
 * flex — is no longer positive. When no flex brings the hand into reach, the
 * flex that comes closest, and standing unless a deeper one gains more than
 * CROUCH_GAIN_MIN: a hand no crouch can reach is no reason to squat. Always
 * searched from standing (c = 0), so the same contact gives the same crouch
 * every frame.
 */
export function contactCrouch(shortAt: (c: number) => number): number {
  let best = 0
  let bestShort = Infinity
  for (let k = 0; k <= Math.round(CROUCH_MAX * 10); k++) {
    const c = k / 10
    const short = shortAt(c)
    if (short <= 0) return c
    if (short < bestShort - CROUCH_GAIN_MIN) {
      best = c
      bestShort = short
    }
  }
  return best
}

/** The least shortfall (figure units) a deeper crouch must make up, short of
 *  reach, to be taken over a shallower one. Calibratable. */
export const CROUCH_GAIN_MIN = 0.02

/** The largest shortfall (figure units) the lean may make up; a hand further
 *  out than this was a gesture, not a contact, and keeps its direction. */
export const CONTACT_LEAN_REACH = 0.18

/**
 * The FK local rotation of an upper-arm bone for a primitive arm pose: the same
 * Euler (YXZ) with the outward roll narrowed while the arm hangs, blending back
 * to the full pose as the arm rises (a pointing arm keeps its exact aim).
 */
export function gestureArmEuler(a: ArmPose, out = new THREE.Euler()): THREE.Euler {
  const rise = Math.min(1, Math.max(0, (Math.abs(a.pitch) - 0.3) / 0.6))
  const keep = HANGING_ROLL_KEEP + (1 - HANGING_ROLL_KEEP) * rise
  return out.set(a.pitch, a.yaw, a.roll * keep, 'YXZ')
}

/**
 * Two-bone IK: from shoulder `s` toward target `t` with an upper arm `a` and a
 * forearm `b`, the elbow bent toward `pole`. Returns the upper-arm and forearm
 * DIRECTIONS (unit, same space as the inputs) and whether `t` was in reach;
 * out of reach, the arm points straight at it.
 */
export function solveTwoBone(
  s: THREE.Vector3,
  t: THREE.Vector3,
  a: number,
  b: number,
  pole: THREE.Vector3,
): { upper: THREE.Vector3; fore: THREE.Vector3; reached: boolean } {
  const toT = t.clone().sub(s)
  const d = toT.length()
  // A target on the shoulder itself has no direction: fold toward the pole.
  const dir = d > 1e-6 ? toT.clone().divideScalar(d) : pole.lengthSq() > 1e-12 ? pole.clone().normalize() : new THREE.Vector3(0, -1, 0)
  const reached = d <= a + b && d >= Math.abs(a - b) - 1e-9
  if (d > a + b) return { upper: dir.clone(), fore: dir.clone(), reached: false }
  if (d < Math.abs(a - b) + 1e-9) {
    // Inside the inner limit: the arm folds flat, the hand as near as it can
    // come (|a − b| along the reach) — continuous with the boundary, never a
    // jump to a straight arm.
    const longUpper = a >= b
    return { upper: longUpper ? dir.clone() : dir.clone().negate(), fore: longUpper ? dir.clone().negate() : dir.clone(), reached }
  }
  const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)))
  const sinA = Math.sqrt(1 - cosA * cosA)
  const side = pole.clone().addScaledVector(dir, -pole.dot(dir))
  if (side.lengthSq() < 1e-10) {
    // The pole lies along the reach: bend toward whichever axis is least
    // aligned with it, projected off the reach (v − (v·d)d).
    const ax = Math.abs(dir.x) < 0.6 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0)
    side.copy(ax).addScaledVector(dir, -ax.dot(dir))
  }
  side.normalize()
  const upper = dir.clone().multiplyScalar(cosA).addScaledVector(side, sinA).normalize()
  const elbow = s.clone().addScaledVector(upper, a)
  const fore = t.clone().sub(elbow).normalize()
  return { upper, fore, reached: true }
}

/** Whether `t` is a contact a forward lean should make up: out of `reach` of
 *  the shoulder at `s`, but by no more than `CONTACT_LEAN_REACH`, and in front
 *  of `pivot`. Asked apart from `contactLean` because a body that bends over
 *  several segments may reach what the one-pivot lean cannot. */
export function contactWantsLean(s: THREE.Vector3, t: THREE.Vector3, reach: number, pivot: THREE.Vector3, forward: THREE.Vector3): boolean {
  const d = s.distanceTo(t)
  if (d <= reach) return false
  if (d - reach > CONTACT_LEAN_REACH) return false
  return t.clone().sub(pivot).dot(forward) > 0
}

/** The extra forward chest lean (rad) that brings `t` within `reach` of a
 *  shoulder at `s` when the chest pivots about `pivot`; 0 when it already is
 *  or when the target is not a reachable contact in front (see the limits). */
export function contactLean(s: THREE.Vector3, t: THREE.Vector3, reach: number, pivot: THREE.Vector3, forward: THREE.Vector3): number {
  if (!contactWantsLean(s, t, reach, pivot, forward)) return 0
  const axis = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), forward).normalize()
  const q = new THREE.Quaternion()
  const p = new THREE.Vector3()
  for (let lean = 0.05; lean <= CONTACT_LEAN_MAX + 1e-9; lean += 0.05) {
    q.setFromAxisAngle(axis, lean)
    p.copy(s).sub(pivot).applyQuaternion(q).add(pivot)
    if (p.distanceTo(t) <= reach) return lean
  }
  return 0
}

/** The kneeling leg pose (sitting back toward the heels, knees on the ground):
 *  thigh pitched forward by `thigh` rad, the shin laid back along the ground,
 *  the foot extending it; and the hip height that puts the knee on the ground. */
export function kneelLegs(thighLen: number, calfR: number): { thigh: number; shin: number; foot: number; hipY: number } {
  const thigh = 0.9
  return { thigh: -thigh, shin: Math.PI / 2 + thigh, foot: Math.PI / 2, hipY: calfR + thighLen * Math.cos(thigh) }
}

/**
 * Keep the head round through the caller's vertical squash `s` (work-order
 * 1085, as on the primitive figure). The squash sits ABOVE the bones, and the
 * chain from hips to neck is rotated by the lean and the stoop, so a y-scale
 * on the head alone shears it. The head's world linear part is
 * `diag(1,s,1) · Q · R · S` (Q the chain's rotation); with `R = Q⁻¹` and
 * `S = diag(1,1/s,1)` it is the identity — a counter-rotation and a stretch.
 * Reads and writes `head`'s quaternion (its own turn composed in: left as it
 * is at no squash) and writes its scale; `chain` is hips → neck, in order.
 */
export function unsquashHead(head: THREE.Object3D, chain: readonly THREE.Object3D[], s: number): void {
  const k = s > 0.01 ? s : 1
  // The counter-rotation fades in over the first SQUASH_BLEND of the squash,
  // so the head never snaps between orientations at the threshold; inside
  // that band the residual shear is at most a few percent of the squash.
  const f = Math.min(1, Math.abs(1 - k) / SQUASH_BLEND)
  const q = new THREE.Quaternion()
  for (const b of chain) q.multiply(b.quaternion)
  // Keep the chain's TURN (its twist about y): a rotation about y commutes
  // with the y-squash, so only the rest — lean and stoop — must be undone.
  // With R = Q⁻¹·T the head's world part is diag(1,s,1)·T·diag(1,1/s,1) = T.
  // The head's own turn (the clip's, the gaze's) is composed in: its world
  // twist is kept, and at no squash its local turn is left exactly as it is.
  const world = q.clone().multiply(head.quaternion)
  const twist = new THREE.Quaternion(0, world.y, 0, world.w)
  if (twist.lengthSq() < 1e-12) twist.identity()
  else twist.normalize()
  head.quaternion.slerp(q.invert().multiply(twist), f)
  head.scale.set(1, 1 / k, 1)
}
/** The squash over which the head's counter-rotation fades in. */
export const SQUASH_BLEND = 0.08

const DOWN = new THREE.Vector3(0, -1, 0)

/** The local quaternion that turns a bone hanging along −y onto `dir`, given
 *  as a direction in its PARENT's world orientation `parentWorld`. */
export function hangToward(dir: THREE.Vector3, parentWorld: THREE.Quaternion, out = new THREE.Quaternion()): THREE.Quaternion {
  const local = dir.clone().applyQuaternion(parentWorld.clone().invert()).normalize()
  return out.setFromUnitVectors(DOWN, local)
}

/**
 * The palm's normal in the LEFT hand bone's own frame on the hanging rest
 * (+x the hand's outside, +z forward); the right hand mirrors x. The glTF
 * hand's is measured off public/models/villager.glb — its flattest axis,
 * signed by the way its `grip` morph curls the fingers (pinned by
 * scenes/place/steadyingPalm.test.tsx) — and faces the thigh and a little
 * back; the code-built hand is a paddle flat across z, taken as facing back
 * to match.
 */
export const PALM_NORMAL = {
  gltf: [-0.85, 0.19, -0.49],
  code: [0, 0, -1],
} as const satisfies Record<string, readonly [number, number, number]>

/** The palm normal of one hand (`side` +1 left, −1 right) in its bone's frame. */
export function palmNormal(body: keyof typeof PALM_NORMAL, side: 1 | -1, out = new THREE.Vector3()): THREE.Vector3 {
  const [x, y, z] = PALM_NORMAL[body]
  return out.set(side * x, y, z).normalize()
}

const _palmD = new THREE.Vector3()
const _palmQ = new THREE.Quaternion()

/**
 * The roll (rad, in (−π, π]) that turns a hand's palm toward `toward`: a turn
 * about the hand bone's own axis (local +y; the bone hangs along −y), so the
 * hand stays where the arm solve put it and only rolls. `parentWorld` is the
 * orientation of the hand's parent (the forearm) and `toward` a direction,
 * both in one common frame; `palm` is the palm normal in the hand's frame
 * (`palmNormal`). 0 when `toward` runs along the hand's axis.
 *
 * The roll is taken within half a turn of `center`, so its one unavoidable
 * cut (a full turn is the same roll) sits opposite it: a caller that splits
 * the roll over two joints passes the roll its pose needs (`palmRollCenter`),
 * and the split is continuous over every roll that pose reaches.
 */
export function palmRollAngle(parentWorld: THREE.Quaternion, palm: THREE.Vector3, toward: THREE.Vector3, center = 0): number {
  const d = _palmD.copy(toward).applyQuaternion(_palmQ.copy(parentWorld).invert())
  if (Math.hypot(d.x, d.z) < 1e-9 || Math.hypot(palm.x, palm.z) < 1e-9) return 0
  // a turn about +y by θ carries the azimuth atan2(x, z) to atan2(x, z) + θ
  const a = Math.atan2(d.x, d.z) - Math.atan2(palm.x, palm.z) - center
  const turn = 2 * Math.PI
  return center + a - turn * Math.ceil((a - Math.PI) / turn)
}

/** `palmRollAngle` as the hand's local quaternion. */
export function palmRoll(parentWorld: THREE.Quaternion, palm: THREE.Vector3, toward: THREE.Vector3, out = new THREE.Quaternion()): THREE.Quaternion {
  return out.setFromAxisAngle(UP, palmRollAngle(parentWorld, palm, toward))
}

/** The roll (rad) a steadying hand on a head load needs, measured on the
 *  mounted figure (scenes/place/steadyingPalm.test.tsx): about 1.9 on the
 *  code-built body and 2.3–3.5 on the glTF one, the left hand's negative and
 *  the right's mirrored. The split roll's cut lies half a turn from it. A
 *  pose constant, calibratable. */
export const PALM_ROLL_CENTER = 2.5

/** The steadying roll's centre for one hand (`side` +1 left, −1 right). */
export const palmRollCenter = (side: 1 | -1): number => -side * PALM_ROLL_CENTER
const UP = new THREE.Vector3(0, 1, 0)

/** The share of a palm roll the forearm takes about its own axis, the wrist
 *  the rest: the turn spread along the forearm as a real one pronates, so
 *  neither the elbow's nor the wrist's skin wrings (the bodies have no twist
 *  bones). A pose constant, calibratable. */
export const FOREARM_ROLL_SHARE = 0.5

// ---- the distributed lean and the gaze (natural-villager-motion step 9) ------

/** The three spine segments a trunk lean is shared over, pelvis up. */
export const LEAN_BONES = ['spine', 'spine1', 'chest'] as const
export type LeanBone = (typeof LEAN_BONES)[number]

/**
 * A trunk lean `pitch` (rad, + leaning in) and turn `yaw` (rad) shared over
 * the spine segments by `shares` (VILLAGER_POSE.leanShares): per bone the
 * local delta (pitch about its x, then yaw about its y) that sums to the whole.
 */
export function distributeLean(
  pitch: number,
  yaw: number,
  shares: Readonly<Record<LeanBone, number>>,
): Record<LeanBone, { pitch: number; yaw: number }> {
  const out = {} as Record<LeanBone, { pitch: number; yaw: number }>
  for (const b of LEAN_BONES) out[b] = { pitch: pitch * shares[b], yaw: yaw * shares[b] }
  return out
}

/** A gaze held on a direction: its yaw and pitch (rad) relative to the
 *  heading (+z, +y up), damped toward what it wants. */
export interface Gaze {
  yaw: number
  pitch: number
  wantYaw: number
  wantPitch: number
}
export const newGaze = (): Gaze => ({ yaw: 0, pitch: 0, wantYaw: 0, wantPitch: 0 })

export interface GazeLimits {
  yawMax: number
  pitchUp: number
  pitchDown: number
  seconds: number
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))

/**
 * One step of the gaze toward what it wants, frame-rate independent
 * (1 − e^(−dt/τ)), within its limits scaled by `tight` (1, or less under a
 * head load). The wanted yaw is taken the short way round from where the gaze
 * is, then clamped, so a target behind never flips the head from one side to
 * the other.
 */
export function stepGaze(g: Gaze, dt: number, lim: GazeLimits, tight = 1): void {
  const yawMax = lim.yawMax * tight
  const want = Math.min(yawMax, Math.max(-yawMax, g.yaw + wrap(g.wantYaw - g.yaw)))
  const pitch = Math.min(lim.pitchUp * tight, Math.max(-lim.pitchDown * tight, g.wantPitch))
  const k = 1 - Math.exp(-Math.max(0, dt) / Math.max(1e-6, lim.seconds))
  g.yaw += (want - g.yaw) * k
  g.pitch += (pitch - g.pitch) * k
  g.yaw = Math.min(yawMax, Math.max(-yawMax, g.yaw))
  g.pitch = Math.min(lim.pitchUp * tight, Math.max(-lim.pitchDown * tight, g.pitch))
}

/** The unit direction of a gaze's yaw and pitch (+z ahead, +y up). */
export function gazeDirection(yaw: number, pitch: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch))
}

/** A direction's gaze angles (yaw about +y from +z, pitch up). */
export function gazeAngles(d: THREE.Vector3): { yaw: number; pitch: number } {
  const len = d.length() || 1
  return { yaw: Math.atan2(d.x, d.z), pitch: Math.asin(Math.min(1, Math.max(-1, d.y / len))) }
}

const _aw = new THREE.Quaternion()
const _ad = new THREE.Quaternion()
const _af = new THREE.Vector3()
const _ap = new THREE.Quaternion()
const _id = new THREE.Quaternion()

/**
 * Aim the head (+z its face) along `dir` (unit, body frame) over neck and
 * head: the neck takes `neckShare` of the turn, the head the rest, so the face
 * points along `dir` whatever the trunk below does (a lean, a gait's bob), by
 * `weight` (0 leaves both as they are). `chestWorld` is the chest's turn in
 * the body frame; `neck` and `head` are their local turns, written in place.
 */
export function aimHead(chestWorld: THREE.Quaternion, neck: THREE.Quaternion, head: THREE.Quaternion, dir: THREE.Vector3, neckShare: number, weight = 1): void {
  if (weight <= 0) return
  // the head's world turn and face, the shortest turn onto the wanted one
  _aw.copy(chestWorld).multiply(neck).multiply(head)
  _af.set(0, 0, 1).applyQuaternion(_aw)
  _ad.setFromUnitVectors(_af, dir)
  // the neck's share, as a world turn of the neck: local' = P⁻¹ · r · P · local
  const r = _id.identity().slerp(_ad, Math.min(1, neckShare * weight))
  _ap.copy(chestWorld)
  neck.premultiply(_ap).premultiply(r).premultiply(_ap.invert())
  // the head takes the rest
  _aw.copy(chestWorld).multiply(neck).multiply(head)
  _af.set(0, 0, 1).applyQuaternion(_aw)
  const rest = _ad.setFromUnitVectors(_af, dir)
  const total = Math.min(1, weight)
  const neckW = Math.min(1, neckShare * weight)
  // of what is left, the share that brings the whole turn to `weight`
  const k = neckW >= 1 ? 1 : Math.max(0, (total - neckW) / (1 - neckW))
  const r2 = new THREE.Quaternion().slerp(rest, k)
  _ap.copy(chestWorld).multiply(neck)
  head.premultiply(_ap).premultiply(r2).premultiply(_ap.invert())
}
