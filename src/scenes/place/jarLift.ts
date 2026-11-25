// The filled jar LIFTED from the hand onto the head: the fill ends with the
// jar hanging in the carrier's hand at his hip, and the walk back carries it
// on his crown. Between the two the jar travels up from where the hand holds
// it to where it rests on the head, over `balance.waterJarLiftSeconds`, while
// the steadying hand rises with it (SkinnedFigure's `headLift`) — never a pop
// between the two carry poses. Pure timing plus one transform write, so both
// are asserted without a renderer.

import * as THREE from 'three/webgpu'
import { balance } from '../../config/balance'
import type { AdultCarry } from './adultWork'

const smooth = (v: number) => {
  const t = Math.min(1, Math.max(0, v))
  return t * t * (3 - 2 * t)
}

/** The lift's clock for this frame: started (0) in the frame the jar turns
 *  full, run on by `dt`, and gone (null) once it is on the head or the jar is. */
export function stepJarLift(seconds: number | null, carry: AdultCarry, before: AdultCarry, dt: number): number | null {
  if (carry !== 'fullJar') return null
  if (before !== 'fullJar') return 0
  if (seconds === null) return null
  const next = seconds + Math.max(0, dt)
  return next >= balance.waterJarLiftSeconds ? null : next
}

/** How far the jar has come up (0: in the hand, 1: on the head), eased at
 *  both ends so it leaves the hand and settles on the crown without a jolt. */
export function jarLiftShare(seconds: number | null): number {
  if (seconds === null) return 1
  return smooth(seconds / Math.max(1e-6, balance.waterJarLiftSeconds))
}

/** The head jar's resting transform on the crown (its parent's frame). */
export interface JarRest {
  position: THREE.Vector3
  quaternion: THREE.Quaternion
}

const _anchor = new THREE.Vector3()
const _q = new THREE.Quaternion()
const _parentQ = new THREE.Quaternion()
const _hang = new THREE.Vector3()
const _localQ = new THREE.Quaternion()
const ease = (v: number) => smooth(v)

/**
 * Writes the head jar's transform for this share of the lift. `hand` is the
 * empty jar's mount in the hand (posed this frame): at 0 the full jar is
 * exactly where that one hangs. On the way it hangs from the same hand by the
 * same grip but turned upright, as a carried jar is, whatever the wrist does,
 * and from `settleFrom` of the lift on it settles onto `rest` on the crown. At
 * 1 it is the rest. A body whose hand rises with the jar lets the hand carry it
 * most of the way (LIFT_SETTLE); one without (the primitive, which balances its
 * load hands-free) passes 0, so the jar rises from the hand over the whole lift.
 */
export function placeLiftedJar(jar: THREE.Object3D, hand: THREE.Object3D, share: number, rest: JarRest, settleFrom = LIFT_SETTLE): void {
  const parent = jar.parent
  const mount = hand.parent
  if (share >= 1 || !parent || !mount) {
    jar.position.copy(rest.position)
    jar.quaternion.copy(rest.quaternion)
    return
  }
  parent.updateWorldMatrix(true, false)
  mount.updateWorldMatrix(true, false)
  parent.getWorldQuaternion(_parentQ).invert()
  // the hand's grip on the jar, into the crown's frame
  mount.getWorldPosition(_anchor)
  parent.worldToLocal(_anchor)
  mount.getWorldQuaternion(_q).premultiply(_parentQ)
  // the jar as it hangs in the hand, and that grip in the jar's own frame
  _localQ.copy(_q).multiply(hand.quaternion)
  _hang.copy(hand.position).applyQuaternion(_localQ.clone().invert().multiply(_q))
  // upright early, before the wrist turns with the rising arm
  jar.quaternion.slerpQuaternions(_localQ, rest.quaternion, ease(share / LIFT_UPRIGHT))
  jar.position.copy(_hang).applyQuaternion(jar.quaternion).add(_anchor)
  jar.position.lerp(rest.position, ease((share - settleFrom) / (1 - settleFrom)))
}

/** The share of the lift by which the jar stands upright in the hand. */
const LIFT_UPRIGHT = 0.3
/** The share of the lift after which the jar settles from the lifting hand onto the crown. */
export const LIFT_SETTLE = 0.6
