import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { armAim, REST_POSE } from './gesture'
import {
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
