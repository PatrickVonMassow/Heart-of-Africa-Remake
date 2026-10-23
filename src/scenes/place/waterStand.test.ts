// The water stand as the carrier works at it (work-order 1405): he stands at
// the table, takes the empty jar up while his hand is out at it, and his report
// points from his own shoulder straight at the water just set down.

import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { armAim, armDirection, FILL_CARRY_SIDE, gesturePose, REST_POSE, startGesture } from '../../render/gesture'
import {
  newestJarWater,
  shoulderAim,
  SPARE_JAR_LOCAL,
  standJarLocal,
  standToWorld,
  standYaw,
  tableSpot,
  takeEnvelope,
  takeJarTravel,
  takePose,
  TAKE_GRAB,
  TAKE_REACHED,
} from './waterStand'

const STAND = { x: 4, z: -3 }

describe('the carrier stands at the table', () => {
  it('steps in from his waiting spot to the table edge, on the same bearing', () => {
    const from = { x: STAND.x + 2.4 * Math.cos(0.7), z: STAND.z + 2.4 * Math.sin(0.7) }
    const at = tableSpot(STAND, from)
    expect(Math.hypot(at.x - STAND.x, at.z - STAND.z)).toBeCloseTo(balance.waterStandReach, 9)
    expect(Math.atan2(at.z - STAND.z, at.x - STAND.x)).toBeCloseTo(0.7, 9)
  })

  it('keeps his own spot where the table edge is not standable', () => {
    const from = { x: STAND.x + 2.4, z: STAND.z }
    expect(tableSpot(STAND, from, () => false)).toEqual(from)
  })
})

describe('the stand frame', () => {
  it('turns its front (local +Z) toward the water path foot', () => {
    const foot = { x: STAND.x - 10, z: STAND.z + 5 }
    const yaw = standYaw(STAND, foot)
    const front = standToWorld(STAND, yaw, [0, 0, 1])
    const d = Math.hypot(foot.x - STAND.x, foot.z - STAND.z)
    expect(front.x - STAND.x).toBeCloseTo((foot.x - STAND.x) / d, 9)
    expect(front.z - STAND.z).toBeCloseTo((foot.z - STAND.z) / d, 9)
  })

  it('keeps the empty jar clear of the full row, both on the plank', () => {
    const r = 0.16
    for (let i = 0; i < balance.waterStandCapacity; i++) {
      const [x, , z] = standJarLocal(i)
      expect(Math.hypot(x - SPARE_JAR_LOCAL[0], z - SPARE_JAR_LOCAL[2])).toBeGreaterThanOrEqual(2 * r)
      expect(Math.abs(z) + r).toBeLessThanOrEqual(0.46)
    }
    expect(SPARE_JAR_LOCAL[2] + r).toBeLessThanOrEqual(0.46)
  })

  it('names the newest jar’s water as the last shown slot’s mouth', () => {
    const foot = { x: STAND.x, z: STAND.z + 9 }
    const w = newestJarWater(STAND, foot, 2)
    const [x, y, z] = standJarLocal(1)
    expect(w).toEqual(standToWorld(STAND, standYaw(STAND, foot), [x, y + 0.16, z]))
  })
})

describe('the take', () => {
  it('reaches out first, lifts the jar only while the hand is out, then straightens', () => {
    expect(takeEnvelope(0)).toBe(0)
    expect(takeEnvelope(TAKE_REACHED)).toBe(1)
    expect(takeEnvelope(TAKE_GRAB)).toBe(1)
    expect(takeEnvelope(1)).toBe(0)
    expect(takeJarTravel(TAKE_REACHED)).toBe(0)
    expect(takeJarTravel(TAKE_GRAB)).toBe(1)
    // In flight between plank and hand only while the arm is fully out.
    for (let k = 0; k <= 100; k++) {
      const p = k / 100
      const t = takeJarTravel(p)
      if (t > 0 && t < 1) expect(takeEnvelope(p)).toBe(1)
    }
  })

  it('puts the carrying arm onto the aim at full reach, and leaves it at rest before', () => {
    const aim = { bearing: -0.1, elevation: -0.6 }
    const out = takePose(0.45, aim)
    const arm = out[FILL_CARRY_SIDE]
    const want = armAim(aim.bearing, aim.elevation)
    expect(arm.pitch).toBeCloseTo(want.pitch, 9)
    expect(arm.yaw).toBeCloseTo(want.yaw, 9)
    expect(out.lean).toBeGreaterThan(0)
    expect(takePose(0, aim)[FILL_CARRY_SIDE]).toEqual(REST_POSE[FILL_CARRY_SIDE])
  })
})

describe('the report points at the water', () => {
  const shoulder = { y: 1.05, x: 0.2 }
  // Where the arm's line from its own shoulder passes a target: the closest
  // distance, in world metres.
  const miss = (figure: { x: number; z: number; yaw: number }, target: { x: number; y: number; z: number }) => {
    const a = shoulderAim(figure, target, shoulder)
    const g = gesturePose({ ...startGesture('point', a), t: 1 })
    const arm = g[a.side]
    const local = armDirection(arm)
    // Into the world: the figure's local +X is (cos yaw, -sin yaw), +Z (sin yaw, cos yaw).
    const c = Math.cos(figure.yaw), s = Math.sin(figure.yaw)
    const dir = [local[0] * c + local[2] * s, local[1], -local[0] * s + local[2] * c]
    const lx = a.side === 'left' ? shoulder.x : -shoulder.x
    const from = [figure.x + lx * c, shoulder.y, figure.z - lx * s]
    const v = [target.x - from[0], target.y - from[1], target.z - from[2]]
    const along = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]
    return { off: Math.hypot(v[0] - along * dir[0], v[1] - along * dir[1], v[2] - along * dir[2]), along, side: a.side }
  }

  it('aims the arm’s own line through a jar a metre ahead, which the centre line misses', () => {
    const jar = { x: 0, y: 0.7, z: 1 }
    const figure = { x: 0, z: 0, yaw: 0 }
    const got = miss(figure, jar)
    expect(got.along).toBeGreaterThan(0)
    expect(got.off).toBeLessThan(1e-6)
    // The pointing arm keeps the side it was solved for.
    expect(gesturePose({ ...startGesture('indicate', shoulderAim(figure, jar, shoulder)), t: 2 }).pointHand?.[got.side]).toBeGreaterThan(0)
  })

  it('stays on the jar from any facing', () => {
    for (const yaw of [0.3, -1.2, 2.8]) {
      const figure = { x: 2, z: -1, yaw }
      const jar = { x: 2 + Math.sin(yaw) * 1.1, y: 0.7, z: -1 + Math.cos(yaw) * 1.1 }
      expect(miss(figure, jar).off).toBeLessThan(1e-6)
    }
  })
})
