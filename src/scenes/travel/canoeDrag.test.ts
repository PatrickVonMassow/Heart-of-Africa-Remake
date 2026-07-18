// Dragged-canoe behaviour matrix (design.md §7/§11): trailer following,
// obstacle clearance (stones, animals, village edges), and the terrain-lying
// pose across ground profiles — the hull must never bury an end in a rise,
// float over a dip, or be dragged through a solid obstacle.
import { describe, it, expect } from 'vitest'
import {
  updateTrailPoint,
  canoeDragPose,
  CANOE_TRAIL_FAR,
  CANOE_END_RADIUS,
  CANOE_GRIP_HEIGHT,
  CANOE_REST_LIFT,
  CANOE_DRAG_LEN,
  CANOE_PITCH_MIN,
  CANOE_PITCH_MAX,
  CANOE_ROLL_MAX,
  type TrailPoint,
} from './canoeDrag'

/** Far-end height (relative to the player root) reconstructed from a pose. */
function farEndHeight(pose: { centreY: number; pitch: number }): number {
  // The centre sits mid-hull; the far end lies half the drag length further
  // along the pitched axis (negative pitch lowers the trailing end).
  return pose.centreY + (CANOE_DRAG_LEN / 2) * Math.tan(pose.pitch)
}

describe('updateTrailPoint (trailer following)', () => {
  it('trails at the rope distance straight behind on a straight walk', () => {
    let t: TrailPoint | null = null
    for (let step = 0; step < 40; step++) {
      t = updateTrailPoint(0, step * 0.2, t, 0, [])
      expect(Math.hypot(t.x - 0, t.z - step * 0.2)).toBeCloseTo(CANOE_TRAIL_FAR, 6)
    }
    // Walking +z with heading 0: the trail settles straight behind (-z side).
    expect(t?.x ?? 99).toBeCloseTo(0, 4)
    expect((t?.z ?? 99) - 39 * 0.2).toBeCloseTo(-CANOE_TRAIL_FAR, 4)
  })

  it('swings smoothly around a corner instead of snapping with the heading', () => {
    let t: TrailPoint | null = null
    // Walk east, then turn north; record the swing.
    for (let i = 0; i < 30; i++) t = updateTrailPoint(i * 0.2, 0, t, Math.PI / 2, [])
    const beforeTurn = { ...(t as TrailPoint) }
    const yawBefore = Math.atan2((t as TrailPoint).x - 29 * 0.2, (t as TrailPoint).z - 0)
    let px = 29 * 0.2
    let pz = 0
    let maxStepSwing = 0
    let prevYaw = yawBefore
    for (let i = 1; i <= 30; i++) {
      pz = i * 0.2
      t = updateTrailPoint(px, pz, t, 0, [])
      const yaw = Math.atan2((t as TrailPoint).x - px, (t as TrailPoint).z - pz)
      let d = yaw - prevYaw
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      maxStepSwing = Math.max(maxStepSwing, Math.abs(d))
      prevYaw = yaw
    }
    // The trail moved (it follows), but never snapped a large angle per step.
    expect(Math.hypot((t as TrailPoint).x - beforeTurn.x, (t as TrailPoint).z - beforeTurn.z)).toBeGreaterThan(0.5)
    expect(maxStepSwing).toBeLessThan(0.4)
  })

  it('keeps the far end clear of a stone it is dragged past', () => {
    const stone: [number, number, number] = [0.6, -1.5, 0.7]
    let t: TrailPoint | null = null
    for (let i = 0; i < 60; i++) {
      t = updateTrailPoint(0, 2 - i * 0.15, t, Math.PI, [stone])
      const d = Math.hypot((t as TrailPoint).x - stone[0], (t as TrailPoint).z - stone[1])
      expect(d).toBeGreaterThanOrEqual(stone[2] + CANOE_END_RADIUS - 1e-6)
    }
  })

  it('keeps clear of an animal standing on the towed path', () => {
    const animal: [number, number, number] = [-0.4, -3, 0.75] // a zebra body
    let t: TrailPoint | null = null
    for (let i = 0; i < 60; i++) {
      t = updateTrailPoint(0, -i * 0.12, t, 0, [animal])
      const d = Math.hypot((t as TrailPoint).x - animal[0], (t as TrailPoint).z - animal[1])
      expect(d).toBeGreaterThanOrEqual(animal[2] + CANOE_END_RADIUS - 1e-6)
    }
  })

  it('keeps clear of a settlement edge (the hull never pokes into the huts)', () => {
    const village: [number, number, number] = [1.2, -6, 1.6]
    let t: TrailPoint | null = null
    for (let i = 0; i < 80; i++) {
      t = updateTrailPoint(0, -i * 0.1, t, 0, [village])
      const d = Math.hypot((t as TrailPoint).x - village[0], (t as TrailPoint).z - village[1])
      expect(d).toBeGreaterThanOrEqual(village[2] + CANOE_END_RADIUS - 1e-6)
    }
  })

  it('recovers a coincident trail point without NaN', () => {
    const t = updateTrailPoint(3, 3, { x: 3, z: 3 }, 1.2, [])
    expect(Number.isFinite(t.x) && Number.isFinite(t.z)).toBe(true)
    expect(Math.hypot(t.x - 3, t.z - 3)).toBeCloseTo(CANOE_TRAIL_FAR, 6)
  })

  // Bank-adjacent drags (user-reported clipping): the hull must never pierce
  // the rendered water sheet — the rope swings to land, or shortens on a spit.
  describe('water-edge rule', () => {
    // A straight bank: everything east of x = 1 is water.
    const bankAt1 = (x: number) => x > 1

    it('walking along a bank swings the hull to the land side at full rope length', () => {
      let t: TrailPoint | null = null
      // Walk north 0.6 units from the bank; the naive trail would stay behind
      // on land — so drag INTO a bend: walk diagonally toward the water, the
      // unconstrained trailer would cross x=1.
      for (let i = 0; i < 50; i++) {
        const px = Math.min(0.9, -2 + i * 0.12)
        const pz = i * 0.12
        t = updateTrailPoint(px, pz, t, 0, [], bankAt1)
        expect(bankAt1((t as TrailPoint).x)).toBe(false) // never in the water
        // Rope stays at full length while rotation suffices.
        expect(Math.hypot((t as TrailPoint).x - px, (t as TrailPoint).z - pz)).toBeCloseTo(CANOE_TRAIL_FAR, 6)
      }
    })

    it('turning waterward keeps the hull on land instead of piercing the sheet', () => {
      // Force the previous trail straight toward the water from a bank-side
      // player: the deflection must rotate it back to land.
      const t = updateTrailPoint(0.9, 0, { x: 0.9 + CANOE_TRAIL_FAR, z: 0 }, -Math.PI / 2, [], bankAt1)
      expect(bankAt1(t.x)).toBe(false)
      expect(Math.hypot(t.x - 0.9, t.z - 0)).toBeCloseTo(CANOE_TRAIL_FAR, 6)
    })

    it('on a spit narrower than the rope the hull pulls in toward the player', () => {
      // Water everywhere beyond 1.2 units of the player: no full-length
      // rotation lands, so the rope shortens (the player stands on land).
      const pond = (x: number, z: number) => Math.hypot(x, z) > 1.2
      const t = updateTrailPoint(0, 0, { x: 0, z: -CANOE_TRAIL_FAR }, 0, [], pond)
      expect(pond(t.x, t.z)).toBe(false)
      expect(Math.hypot(t.x, t.z)).toBeLessThan(1.2)
      expect(Math.hypot(t.x, t.z)).toBeGreaterThan(0.4) // still dragged behind, not on the boots
    })

    it('with water on every side even at the shortest rope, the hull rests on the player tile', () => {
      // A razor-thin peninsula: no rotation and no shortening ever clears the
      // water. The hull must fall back onto the player's OWN tile (dry by
      // definition while dragging) rather than being left afloat at the far
      // trail point — the invariant is that the hull never pierces the sheet.
      const allWater = () => true
      const t = updateTrailPoint(0, 0, { x: 0, z: -CANOE_TRAIL_FAR }, 0, [], allWater)
      expect(t.x).toBe(0)
      expect(t.z).toBe(0) // the player position, not the far water point (0, -FAR)
    })

    it('without water contact the predicate changes nothing', () => {
      const dry = () => false
      let a: TrailPoint | null = null
      let b: TrailPoint | null = null
      for (let i = 0; i < 20; i++) {
        a = updateTrailPoint(0, i * 0.2, a, 0, [])
        b = updateTrailPoint(0, i * 0.2, b, 0, [], dry)
      }
      expect((b as TrailPoint).x).toBeCloseTo((a as TrailPoint).x, 10)
      expect((b as TrailPoint).z).toBeCloseTo((a as TrailPoint).z, 10)
    })
  })
})

describe('canoeDragPose (terrain-lying hull)', () => {
  const T: TrailPoint = { x: 0, z: -CANOE_TRAIL_FAR }

  it('lies level-ish on flat ground: grip up, tail resting', () => {
    const p = canoeDragPose(0, 0, 5, T, 5, 5, 5)
    expect(p.pitch).toBeLessThan(0) // tail down toward the ground
    expect(p.pitch).toBeGreaterThan(-0.3)
    expect(p.roll).toBeCloseTo(0, 6)
    expect(farEndHeight(p)).toBeCloseTo(CANOE_REST_LIFT, 3) // resting, not buried
  })

  it('follows the tail ground across moderate profiles (no burying, no floating)', () => {
    for (const rise of [-0.6, -0.3, -0.1, 0.1, 0.3, 0.6]) {
      const p = canoeDragPose(0, 0, 5, T, 5 + rise, 5 + rise, 5 + rise)
      // The far end rests just above its OWN ground height, whatever the slope.
      expect(farEndHeight(p), `rise ${rise}`).toBeCloseTo(rise + CANOE_REST_LIFT, 3)
      expect(p.pitch).toBeGreaterThanOrEqual(CANOE_PITCH_MIN)
      expect(p.pitch).toBeLessThanOrEqual(CANOE_PITCH_MAX)
    }
  })

  it('a rise behind lifts the tail (uphill drag) instead of burying it', () => {
    const p = canoeDragPose(0, 0, 5, T, 5.7, 5.7, 5.7)
    expect(p.pitch).toBeGreaterThan(0)
    expect(farEndHeight(p)).toBeCloseTo(0.7 + CANOE_REST_LIFT, 3)
  })

  it('clamps the pitch on extreme cliffs (never flips)', () => {
    const down = canoeDragPose(0, 0, 5, T, 1, 1, 1) // 4-unit drop behind
    expect(down.pitch).toBe(CANOE_PITCH_MIN)
    const up = canoeDragPose(0, 0, 5, T, 9, 9, 9) // 4-unit wall behind
    expect(up.pitch).toBe(CANOE_PITCH_MAX)
  })

  it('rolls with a cross-slope and clamps at the limit', () => {
    const left = canoeDragPose(0, 0, 5, T, 5, 5.4, 5)
    const right = canoeDragPose(0, 0, 5, T, 5, 5, 5.4)
    expect(left.roll).toBeGreaterThan(0.1)
    expect(right.roll).toBeLessThan(-0.1)
    expect(Math.sign(left.roll)).not.toBe(Math.sign(right.roll))
    const extreme = canoeDragPose(0, 0, 5, T, 5, 9, 1)
    expect(Math.abs(extreme.roll)).toBeLessThanOrEqual(CANOE_ROLL_MAX)
  })

  it('never sinks the grip end: the near end stays at hand height', () => {
    for (const rise of [-1, 0, 1]) {
      const p = canoeDragPose(0, 0, 5, T, 5 + rise, 5 + rise, 5 + rise)
      const nearEnd = p.centreY - (CANOE_DRAG_LEN / 2) * Math.tan(p.pitch)
      if (p.pitch > CANOE_PITCH_MIN && p.pitch < CANOE_PITCH_MAX) {
        expect(nearEnd, `rise ${rise}`).toBeCloseTo(CANOE_GRIP_HEIGHT, 3)
      }
    }
  })

  it('clamps a negative groundAtTrail to 0 — a deep pit poses identically to flat ground (point 173)', () => {
    // Only groundAtTrail feeds Math.max(0, ·); groundLeft/Right are unclamped
    // and unrelated to this rule, so they are held fixed (but non-trivial) to
    // isolate the clamp.
    const atZero = canoeDragPose(0, 0, 5, T, 0, 3, 3)
    for (const g of [-1e-6, -0.5, -100]) {
      expect(canoeDragPose(0, 0, 5, T, g, 3, 3)).toEqual(atZero)
    }
  })

  it('yaws the hull toward the trail point', () => {
    const east = canoeDragPose(0, 0, 5, { x: CANOE_TRAIL_FAR, z: 0 }, 5, 5, 5)
    expect(east.centreX).toBeGreaterThan(0)
    expect(Math.abs(east.centreZ)).toBeLessThan(1e-6)
    const north = canoeDragPose(0, 0, 5, { x: 0, z: CANOE_TRAIL_FAR }, 5, 5, 5)
    expect(north.centreZ).toBeGreaterThan(0)
  })
})
