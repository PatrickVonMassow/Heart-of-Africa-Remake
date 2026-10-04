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
  const dir = d > 1e-6 ? toT.clone().divideScalar(d) : new THREE.Vector3(0, -1, 0)
  const reached = d <= a + b && d >= Math.abs(a - b)
  if (!reached) return { upper: dir.clone(), fore: dir.clone(), reached: false }
  const cosA = Math.min(1, Math.max(-1, (a * a + d * d - b * b) / (2 * a * d)))
  const sinA = Math.sqrt(1 - cosA * cosA)
  const side = pole.clone().addScaledVector(dir, -pole.dot(dir))
  if (side.lengthSq() < 1e-10) side.set(0, 0, -1).addScaledVector(dir, -dir.z)
  side.normalize()
  const upper = dir.clone().multiplyScalar(cosA).addScaledVector(side, sinA).normalize()
  const elbow = s.clone().addScaledVector(upper, a)
  const fore = t.clone().sub(elbow).normalize()
  return { upper, fore, reached: true }
}

/** The extra forward chest lean (rad) that brings `t` within `reach` of a
 *  shoulder at `s` when the chest pivots about `pivot`; 0 when it already is
 *  or when the target is not a reachable contact in front (see the limits). */
export function contactLean(s: THREE.Vector3, t: THREE.Vector3, reach: number, pivot: THREE.Vector3, forward: THREE.Vector3): number {
  const d = s.distanceTo(t)
  if (d <= reach) return 0
  if (d - reach > CONTACT_LEAN_REACH) return 0
  if (t.clone().sub(pivot).dot(forward) <= 0) return 0
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

const DOWN = new THREE.Vector3(0, -1, 0)

/** The local quaternion that turns a bone hanging along −y onto `dir`, given
 *  as a direction in its PARENT's world orientation `parentWorld`. */
export function hangToward(dir: THREE.Vector3, parentWorld: THREE.Quaternion, out = new THREE.Quaternion()): THREE.Quaternion {
  const local = dir.clone().applyQuaternion(parentWorld.clone().invert()).normalize()
  return out.setFromUnitVectors(DOWN, local)
}
