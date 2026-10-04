import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { armAim, REST_POSE } from './gesture'
import {
  unsquashHead,
  CONTACT_LEAN_MAX,
  contactLean,
  gestureArmEuler,
  hangToward,
  HANGING_ROLL_KEEP,
  kneelLegs,
  solveTwoBone,
} from './figureRig'

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z)

describe('two-bone IK puts the hand on the target', () => {
  it('reaches a target in range with the elbow bent toward the pole', () => {
    const s = v(0.17, 1.1, 0)
    const t = v(0.2, 0.75, 0.3)
    const { upper, fore, reached } = solveTwoBone(s, t, 0.23, 0.27, v(0.5, -0.4, -1))
    expect(reached).toBe(true)
    const hand = s.clone().addScaledVector(upper, 0.23).addScaledVector(fore, 0.27)
    expect(hand.distanceTo(t)).toBeLessThan(1e-6)
    // The elbow sits behind the straight shoulder-to-hand line (pole is back).
    const elbow = s.clone().addScaledVector(upper, 0.23)
    expect(elbow.z).toBeLessThan(s.z + (t.z - s.z) * ((elbow.y - s.y) / (t.y - s.y)))
  })

  it('reaches a target in range that lies straight along the pole', () => {
    const s = v(0, 0, 0)
    const t = v(0, 0, 0.3)
    const { upper, fore, reached } = solveTwoBone(s, t, 0.2, 0.2, v(0, 0, -1))
    expect(reached).toBe(true)
    const hand = s.clone().addScaledVector(upper, 0.2).addScaledVector(fore, 0.2)
    expect(hand.distanceTo(t)).toBeLessThan(1e-6)
  })

  it('a target on the shoulder itself folds the arm flat, never NaN', () => {
    const { upper, fore, reached } = solveTwoBone(v(0, 0, 0), v(0, 0, 0), 0.2, 0.2, v(0, 0, -1))
    expect(reached).toBe(true)
    for (const c of [upper.x, upper.y, upper.z, fore.x, fore.y, fore.z]) expect(Number.isFinite(c)).toBe(true)
    expect(upper.clone().add(fore).length()).toBeLessThan(1e-9)
  })

  it('inside the inner limit the arm folds flat, continuous with the boundary', () => {
    const s = v(0, 0, 0)
    const hand = (d: number) => {
      const r = solveTwoBone(s, v(0, -d, 0), 0.23, 0.27, v(0, 0, -1))
      return s.clone().addScaledVector(r.upper, 0.23).addScaledVector(r.fore, 0.27)
    }
    // the inner limit is |0.23 − 0.27| = 0.04: just outside and just inside
    // put the hand at the same place, not half a metre apart
    expect(hand(0.0401).distanceTo(hand(0.039))).toBeLessThan(0.005)
    expect(hand(0.02).length()).toBeCloseTo(0.04, 6)
  })

  it('points straight at a target out of reach', () => {
    const r = solveTwoBone(v(0, 1, 0), v(0, 1, 2), 0.2, 0.2, v(0, 0, -1))
    expect(r.reached).toBe(false)
    expect(r.upper.z).toBeCloseTo(1)
  })
})

describe('the contact lean', () => {
  const pivot = v(0, 0.7, 0)
  const fwd = v(0, 0, 1)
  it('leans in just enough for a target just out of reach in front', () => {
    const s = v(0.17, 1.1, 0)
    const t = v(0.17, 0.75, 0.45)
    const lean = contactLean(s, t, 0.5, pivot, fwd)
    expect(lean).toBeGreaterThan(0)
    expect(lean).toBeLessThanOrEqual(CONTACT_LEAN_MAX)
  })
  it('never leans for a target behind, in reach, or far beyond a contact', () => {
    expect(contactLean(v(0.17, 1.1, 0), v(0.17, 0.75, -0.45), 0.5, pivot, fwd)).toBe(0)
    expect(contactLean(v(0.17, 1.1, 0), v(0.17, 0.8, 0.2), 0.5, pivot, fwd)).toBe(0)
    expect(contactLean(v(0.17, 1.1, 0), v(0.17, 1.1, 2), 0.5, pivot, fwd)).toBe(0)
  })
})

describe('gestures keep their aim; the resting arm hangs like a person’s', () => {
  it('a pointing arm (raised) keeps its exact Euler', () => {
    const a = armAim(0.4, 0.3)
    const e = gestureArmEuler(a)
    expect([e.x, e.y, e.z]).toEqual([a.pitch, a.yaw, a.roll])
    expect(e.order).toBe('YXZ')
  })
  it('the primitive’s wide resting splay is narrowed', () => {
    const e = gestureArmEuler(REST_POSE.left)
    expect(e.z).toBeCloseTo(REST_POSE.left.roll * HANGING_ROLL_KEEP)
  })
  it('hangToward turns a hanging bone onto a direction in its parent’s frame', () => {
    const parent = new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), 0.7)
    const dir = v(0.3, -0.5, 0.8).normalize()
    const q = hangToward(dir, parent)
    const world = v(0, -1, 0).applyQuaternion(q).applyQuaternion(parent)
    expect(world.distanceTo(dir)).toBeLessThan(1e-6)
  })
})

describe('kneeling', () => {
  it('lays the shin back along the ground with the knee down', () => {
    const k = kneelLegs(0.31, 0.036)
    expect(k.thigh).toBeLessThan(0)
    // Thigh forward by |thigh|, shin turned back by thigh + 90°: horizontal.
    expect(k.thigh + k.shin).toBeCloseTo(Math.PI / 2)
    expect(k.hipY).toBeCloseTo(0.036 + 0.31 * Math.cos(-k.thigh))
  })
})

describe('the head stays round through a squat', () => {
  it('a squashed, leaning, stooped chain leaves the head unsheared', () => {
    const squash = new THREE.Group()
    squash.scale.set(1, 0.7, 1)
    const chain = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone(), new THREE.Bone()]
    chain[1].rotation.set(0.35, 0.4, 0) // the lean and the turn
    chain[2].rotation.set(0.42, 0, 0) // the elder's stoop
    chain[3].rotation.set(-0.19, 0, 0)
    const head = new THREE.Bone()
    squash.add(chain[0])
    chain.forEach((b, i) => i > 0 && chain[i - 1].add(b))
    chain[3].add(head)
    unsquashHead(head, chain, 0.7)
    squash.updateMatrixWorld(true)
    // a unit sphere on the head stays a unit sphere: every axis keeps length 1
    // and they stay perpendicular
    const e = head.matrixWorld.elements
    const ax = [v(e[0], e[1], e[2]), v(e[4], e[5], e[6]), v(e[8], e[9], e[10])]
    for (const a of ax) expect(a.length()).toBeCloseTo(1, 6)
    expect(ax[0].dot(ax[1])).toBeCloseTo(0, 6)
    expect(ax[1].dot(ax[2])).toBeCloseTo(0, 6)
    // no snap at the threshold: a barely squashed head is oriented like an
    // unsquashed one
    unsquashHead(head, chain, 0.999)
    const nearly = head.quaternion.clone()
    unsquashHead(head, chain, 1)
    expect(nearly.angleTo(head.quaternion)).toBeLessThan(0.02)
    // and no squat leaves it untouched
    expect(head.scale.y).toBe(1)
    expect(head.quaternion.equals(new THREE.Quaternion())).toBe(true)
  })
})

describe('the squat correction keeps the head facing where the body turns', () => {
  it('a chain turned 90° about y keeps that turn on the squashed head', () => {
    const squash = new THREE.Group()
    squash.scale.set(1, 0.9, 1)
    const chain = [new THREE.Bone(), new THREE.Bone(), new THREE.Bone(), new THREE.Bone()]
    chain[1].rotation.set(0, Math.PI / 2, 0)
    chain[2].rotation.set(0.3, 0, 0)
    const head = new THREE.Bone()
    squash.add(chain[0])
    chain.forEach((b, i) => i > 0 && chain[i - 1].add(b))
    chain[3].add(head)
    unsquashHead(head, chain, 0.9)
    squash.updateMatrixWorld(true)
    const e = head.matrixWorld.elements
    // the head's forward (+z) points where the turned body faces (+x), level
    const fwd = v(e[8], e[9], e[10]).normalize()
    expect(fwd.x).toBeCloseTo(1, 5)
    expect(Math.abs(fwd.y)).toBeLessThan(1e-5)
  })
})
