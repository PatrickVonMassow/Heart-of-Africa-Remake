// The water stand as the carrier works at it (work-order 1405): he stands at
// the table, takes the empty jar up while his hand is out at it, and his report
// points from his own shoulder straight at the water just set down.

import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { armAim, armDirection, FILL_CARRY_SIDE, REST_POSE } from '../../render/gesture'
import {
  newestJarWater,
  aimFromShoulder,
  toFigureFrame,
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
    const at = tableSpot(STAND, from)!
    expect(Math.hypot(at.x - STAND.x, at.z - STAND.z)).toBeCloseTo(balance.waterStandReach, 9)
    expect(Math.atan2(at.z - STAND.z, at.x - STAND.x)).toBeCloseTo(0.7, 9)
  })

  it('names no spot where the table edge is not standable', () => {
    const from = { x: STAND.x + 2.4, z: STAND.z }
    expect(tableSpot(STAND, from, () => false)).toBeNull()
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
  // The arm's line from its own shoulder, under a trunk leaning by `lean`,
  // against the target: the closest distance (m).
  const miss = (shoulder: [number, number, number], target: [number, number, number], lean: number) => {
    const a = aimFromShoulder(shoulder, target, lean)
    const d = armDirection(armAim(a.bearing, a.elevation))
    // Rx(lean): the trunk's frame into the figure's.
    const c = Math.cos(lean), s = Math.sin(lean)
    const dir = [d[0], d[1] * c - d[2] * s, d[1] * s + d[2] * c]
    const v = [target[0] - shoulder[0], target[1] - shoulder[1], target[2] - shoulder[2]]
    const along = v[0] * dir[0] + v[1] * dir[1] + v[2] * dir[2]
    return { off: Math.hypot(v[0] - along * dir[0], v[1] - along * dir[1], v[2] - along * dir[2]), along }
  }

  it('aims the arm’s own line through a jar a metre ahead and below', () => {
    const got = miss([0.17, 1.15, 0.03], [0, 0.7, 1], 0)
    expect(got.along).toBeGreaterThan(0)
    expect(got.off).toBeLessThan(1e-9)
  })

  it('takes the trunk’s lean out of the aim', () => {
    for (const lean of [0.03, 0.34]) expect(miss([-0.17, 1.1, 0.05], [0.2, 0.55, 0.9], lean).off).toBeLessThan(1e-9)
  })

  it('reads a world point in the figure’s own frame', () => {
    const yaw = 0.8
    const ahead = toFigureFrame({ x: 1, z: 2, yaw }, { x: 1 + Math.sin(yaw), y: 0.5, z: 2 + Math.cos(yaw) })
    expect(ahead[0]).toBeCloseTo(0, 12)
    expect(ahead[1]).toBe(0.5)
    expect(ahead[2]).toBeCloseTo(1, 12)
  })
})
