// The villager gesture state machine (point 479). Everything the point makes
// VERIFIABLE without a browser lives here: the duration is bounded, one figure
// never runs two gestures at once, the pose returns to rest, and each of the
// four gestures actually moves — and moves differently from the other three.
//
// The arm maths is checked against a REAL `THREE.Object3D` rather than against a
// second hand-written formula: `armDirection` claims to mirror three.js' `YXZ`
// Euler composition, and a claim like that is only worth the cross-check that
// proves the renderer and the module can never drift apart.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import {
  GESTURE_BLEND,
  GESTURE_DURATIONS,
  GESTURE_KINDS,
  REST_POSE,
  advanceGesture,
  aimAt,
  armAim,
  armDirection,
  gestureArm,
  gestureEnvelope,
  gesturePose,
  isGesturing,
  poseDistanceFromRest,
  restGesture,
  startGesture,
  type GestureKind,
  type GestureState,
} from './gesture'

/** Run a gesture forward in fixed steps, collecting every state it passes. */
function run(start: GestureState, dt: number, steps: number): GestureState[] {
  const seen: GestureState[] = [start]
  let s = start
  for (let i = 0; i < steps; i++) {
    s = advanceGesture(s, dt)
    seen.push(s)
  }
  return seen
}

describe('a gesture is BOUNDED — it can never become a state a figure sits in', () => {
  it('every kind has a positive, finite duration', () => {
    for (const kind of GESTURE_KINDS) {
      expect(GESTURE_DURATIONS[kind], kind).toBeGreaterThan(0)
      expect(Number.isFinite(GESTURE_DURATIONS[kind]), kind).toBe(true)
    }
  })

  it('each kind is back at rest once its own duration is spent', () => {
    for (const kind of GESTURE_KINDS) {
      const d = GESTURE_DURATIONS[kind]
      const states = run(startGesture(kind), d / 40, 41)
      expect(states[states.length - 1].kind, kind).toBeNull()
      expect(isGesturing(states[states.length - 1]), kind).toBe(false)
    }
  })

  it('a single overlong frame ends it too — no leftover gesture after a stall', () => {
    for (const kind of GESTURE_KINDS) {
      expect(advanceGesture(startGesture(kind), 60).kind, kind).toBeNull()
    }
  })

  it('it stays running right up to the last instant before the duration', () => {
    for (const kind of GESTURE_KINDS) {
      const d = GESTURE_DURATIONS[kind]
      const almost = advanceGesture(startGesture(kind), d - 0.001)
      expect(almost.kind, kind).toBe(kind)
      expect(advanceGesture(almost, 0.002).kind, kind).toBeNull()
    }
  })

  it('advancing rest does nothing at all (the same object comes back)', () => {
    const rest = restGesture()
    expect(advanceGesture(rest, 0.5)).toBe(rest)
  })

  it('a negative or non-finite delta never runs the clock backwards', () => {
    const s = advanceGesture(startGesture('point'), 0.5)
    expect(advanceGesture(s, -1).t).toBeCloseTo(s.t, 10)
    expect(advanceGesture(s, Number.NaN).t).toBeCloseTo(s.t, 10)
  })

  it('an explicit duration is honoured, a nonsense one falls back to the kind default', () => {
    expect(startGesture('point', { duration: 5 }).duration).toBe(5)
    expect(startGesture('point', { duration: 0 }).duration).toBe(GESTURE_DURATIONS.point)
    expect(startGesture('point', { duration: -3 }).duration).toBe(GESTURE_DURATIONS.point)
    expect(startGesture('point', { duration: Number.NaN }).duration).toBe(GESTURE_DURATIONS.point)
  })
})

describe('ONE gesture per figure — a second one replaces, never joins', () => {
  it('starting while another runs discards the first whole', () => {
    let s = advanceGesture(startGesture('beckon', { bearing: 1 }), 0.6)
    expect(s.kind).toBe('beckon')
    s = startGesture('refuse', { bearing: -0.4 })
    expect(s.kind).toBe('refuse')
    expect(s.t).toBe(0)
    expect(s.duration).toBe(GESTURE_DURATIONS.refuse)
    expect(s.bearing).toBe(-0.4)
  })

  it('the state carries exactly one kind at every instant of every gesture', () => {
    for (const kind of GESTURE_KINDS) {
      for (const s of run(startGesture(kind), 0.05, 80)) {
        expect(s.kind === null || s.kind === kind, `${kind} at t=${s.t}`).toBe(true)
      }
    }
  })

  it('the pose is a pure function of the state — same state, same pose', () => {
    const s = advanceGesture(startGesture('indicate', { bearing: 0.8 }), 1.0)
    expect(gesturePose(s)).toEqual(gesturePose({ ...s }))
  })
})

describe('THE POSE RETURNS TO REST — at the start, at the end, and after it', () => {
  it('rest yields exactly the rest pose', () => {
    expect(gesturePose(restGesture())).toEqual({
      left: { ...REST_POSE.left },
      right: { ...REST_POSE.right },
      lean: 0,
      turn: 0,
    })
    expect(poseDistanceFromRest(gesturePose(restGesture()))).toBe(0)
  })

  it('a gesture BEGINS at rest — no snap into the pose', () => {
    for (const kind of GESTURE_KINDS) {
      expect(poseDistanceFromRest(gesturePose(startGesture(kind, { bearing: 1.2 }))), kind).toBeCloseTo(0, 10)
    }
  })

  it('and settles back into rest as it ends, continuously', () => {
    for (const kind of GESTURE_KINDS) {
      const d = GESTURE_DURATIONS[kind]
      const near = { ...startGesture(kind, { bearing: 1.2 }), t: d - 1e-4 }
      expect(poseDistanceFromRest(gesturePose(near)), kind).toBeLessThan(0.01)
      // …and the state after it is rest, so the pose is exactly rest again.
      const after = advanceGesture(near, 1e-3)
      expect(poseDistanceFromRest(gesturePose(after)), kind).toBe(0)
    }
  })

  it('no frame of any gesture jumps: the pose moves smoothly, step to step', () => {
    for (const kind of GESTURE_KINDS) {
      const d = GESTURE_DURATIONS[kind]
      const dt = d / 200
      let prev = gesturePose(startGesture(kind, { bearing: 1.0, elevation: 0.3 }))
      let s = startGesture(kind, { bearing: 1.0, elevation: 0.3 })
      for (let i = 0; i < 200; i++) {
        s = advanceGesture(s, dt)
        const now = gesturePose(s)
        const jump =
          Math.abs(now.left.pitch - prev.left.pitch) +
          Math.abs(now.right.pitch - prev.right.pitch) +
          Math.abs(now.left.yaw - prev.left.yaw) +
          Math.abs(now.right.yaw - prev.right.yaw)
        expect(jump, `${kind} step ${i}`).toBeLessThan(0.5)
        prev = now
      }
    }
  })

  it('the rest pose itself is never mutated by posing', () => {
    const before = JSON.stringify(REST_POSE)
    for (const kind of GESTURE_KINDS) gesturePose({ ...startGesture(kind), t: 1 })
    expect(JSON.stringify(REST_POSE)).toBe(before)
  })

  it('the envelope opens and closes and never leaves the unit range', () => {
    const s = startGesture('beckon')
    expect(gestureEnvelope(s)).toBe(0)
    expect(gestureEnvelope({ ...s, t: s.duration / 2 })).toBeCloseTo(1, 6)
    expect(gestureEnvelope({ ...s, t: s.duration })).toBe(0)
    for (let i = 0; i <= 50; i++) {
      const e = gestureEnvelope({ ...s, t: (i / 50) * s.duration })
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(1)
    }
    expect(gestureEnvelope(restGesture())).toBe(0)
  })

  it('a gesture shorter than the blend still never snaps', () => {
    const s = startGesture('point', { duration: GESTURE_BLEND / 4 })
    for (let i = 0; i <= 20; i++) {
      const e = gestureEnvelope({ ...s, t: (i / 20) * s.duration })
      expect(e).toBeGreaterThanOrEqual(0)
      expect(e).toBeLessThanOrEqual(1)
    }
    expect(gestureEnvelope({ ...s, t: 0 })).toBe(0)
  })
})

describe('all four gestures READ — each moves, and each moves differently', () => {
  const midPose = (kind: GestureKind, bearing = 0.9) => {
    const s = startGesture(kind, { bearing, elevation: 0.1 })
    return gesturePose({ ...s, t: s.duration / 2 })
  }

  it('every kind is visibly away from rest at its middle', () => {
    for (const kind of GESTURE_KINDS) {
      expect(poseDistanceFromRest(midPose(kind)), kind).toBeGreaterThan(0.5)
    }
  })

  it('no two kinds show the same pose', () => {
    for (let i = 0; i < GESTURE_KINDS.length; i++) {
      for (let j = i + 1; j < GESTURE_KINDS.length; j++) {
        const a = midPose(GESTURE_KINDS[i])
        const b = midPose(GESTURE_KINDS[j])
        expect(JSON.stringify(a), `${GESTURE_KINDS[i]} vs ${GESTURE_KINDS[j]}`).not.toBe(JSON.stringify(b))
      }
    }
  })

  it('a REFUSE raises BOTH arms; the aimed gestures raise only the near one', () => {
    const refuse = midPose('refuse')
    expect(refuse.left.pitch).toBeLessThan(-0.5)
    expect(refuse.right.pitch).toBeLessThan(-0.5)
    // …and shakes the trunk, which is what makes it read as "no".
    const shaken = [0.2, 0.4, 0.6, 0.8].map((u) => {
      const s = startGesture('refuse')
      return gesturePose({ ...s, t: u * s.duration }).turn
    })
    expect(Math.max(...shaken.map(Math.abs))).toBeGreaterThan(0.15)
    expect(Math.min(...shaken)).toBeLessThan(0)
    expect(Math.max(...shaken)).toBeGreaterThan(0)

    for (const kind of ['beckon', 'point', 'indicate'] as GestureKind[]) {
      const p = midPose(kind, 0.9) // bearing to the figure's LEFT
      expect(p.left.pitch, kind).toBeLessThan(-0.5)
      expect(p.right.pitch, kind).toBeCloseTo(REST_POSE.right.pitch, 6)
    }
  })

  it('a BECKON scoops — the raised arm swings back and forth more than once', () => {
    const s = startGesture('beckon')
    const pitches = Array.from({ length: 41 }, (_, i) => gesturePose({ ...s, t: (i / 40) * s.duration }).left.pitch)
    let turns = 0
    for (let i = 2; i < pitches.length; i++) {
      const a = pitches[i - 1] - pitches[i - 2]
      const b = pitches[i] - pitches[i - 1]
      if (a * b < 0) turns++
    }
    expect(turns).toBeGreaterThanOrEqual(3)
  })

  it('a POINT holds one aim while an INDICATE travels onto its bearing', () => {
    const bearing = 1.0
    const yaws = (kind: GestureKind) => {
      const s = startGesture(kind, { bearing })
      return [0.25, 0.5, 0.75].map((u) => gesturePose({ ...s, t: u * s.duration }).left.yaw)
    }
    const pointYaws = yaws('point')
    expect(Math.abs(pointYaws[2] - pointYaws[0])).toBeLessThan(0.02)
    const indicateYaws = yaws('indicate')
    expect(indicateYaws[2] - indicateYaws[0]).toBeGreaterThan(0.3)
    // …and it arrives at the bearing rather than overshooting past it.
    expect(indicateYaws[2]).toBeLessThanOrEqual(bearing + 1e-6)
  })

  it('a BECKON leans in and a REFUSE leans away — point 351 reads posture the same way', () => {
    expect(midPose('beckon').lean).toBeGreaterThan(0)
    expect(midPose('refuse').lean).toBeLessThan(0)
  })
})

describe('the gesturing arm is the NEAR one', () => {
  it('a bearing to the figure\'s left takes the left arm, and the mirror the right', () => {
    expect(gestureArm(0.9)).toBe('left')
    expect(gestureArm(-0.9)).toBe('right')
    expect(gestureArm(0)).toBe('left') // straight ahead: either, pinned for determinism
  })

  it('the choice mirrors exactly across straight ahead', () => {
    for (let b = 0.05; b < Math.PI; b += 0.17) {
      expect(gestureArm(b), `${b}`).not.toBe(gestureArm(-b))
    }
  })
})

describe('the arm maths matches what three.js actually draws', () => {
  it('armDirection reproduces a real Object3D with YXZ order', () => {
    const obj = new THREE.Object3D()
    obj.rotation.order = 'YXZ'
    const v = new THREE.Vector3()
    for (const pose of [
      { pitch: 0, yaw: 0, roll: 0 },
      { pitch: -Math.PI / 2, yaw: 0, roll: 0 },
      { pitch: -1.2, yaw: 0.7, roll: -0.3 },
      { pitch: -2.1, yaw: -1.4, roll: 0.45 },
      { pitch: 0.4, yaw: 2.2, roll: 0.9 },
    ]) {
      obj.rotation.set(pose.pitch, pose.yaw, pose.roll)
      obj.updateMatrixWorld(true)
      v.set(0, -1, 0).applyMatrix4(obj.matrixWorld)
      const [x, y, z] = armDirection(pose)
      expect(x, `x @ ${JSON.stringify(pose)}`).toBeCloseTo(v.x, 10)
      expect(y, `y @ ${JSON.stringify(pose)}`).toBeCloseTo(v.y, 10)
      expect(z, `z @ ${JSON.stringify(pose)}`).toBeCloseTo(v.z, 10)
    }
  })

  it('armAim really aims: the arm direction IS the (bearing, elevation) asked for', () => {
    for (const bearing of [-2.4, -1.0, 0, 0.6, 1.9]) {
      for (const elevation of [-0.7, -0.1, 0, 0.35, 1.1]) {
        const [x, y, z] = armDirection(armAim(bearing, elevation))
        expect(y, `y @ ${bearing}/${elevation}`).toBeCloseTo(Math.sin(elevation), 10)
        expect(x, `x @ ${bearing}/${elevation}`).toBeCloseTo(Math.cos(elevation) * Math.sin(bearing), 10)
        expect(z, `z @ ${bearing}/${elevation}`).toBeCloseTo(Math.cos(elevation) * Math.cos(bearing), 10)
      }
    }
  })

  it('a rest arm hangs down — the limb reads as an arm, not as a raised one', () => {
    for (const a of [REST_POSE.left, REST_POSE.right]) {
      const [, y] = armDirection(a)
      expect(y).toBeLessThan(-0.85)
    }
    // …and each hangs out to its OWN side, so the two never overlap.
    expect(armDirection(REST_POSE.left)[0]).toBeGreaterThan(0)
    expect(armDirection(REST_POSE.right)[0]).toBeLessThan(0)
  })
})

describe('aiming a gesture at something in the world', () => {
  it('straight ahead is bearing zero, whichever way the figure faces', () => {
    expect(aimAt({ x: 0, z: 0, yaw: 0 }, { x: 0, y: 0.8, z: 5 }, 0.8).bearing).toBeCloseTo(0, 10)
    expect(aimAt({ x: 0, z: 0, yaw: Math.PI / 2 }, { x: 5, y: 0.8, z: 0 }, 0.8).bearing).toBeCloseTo(0, 10)
    expect(aimAt({ x: 0, z: 0, yaw: Math.PI }, { x: 0, y: 0.8, z: -5 }, 0.8).bearing).toBeCloseTo(0, 10)
  })

  it('a target on the figure\'s left gives a positive bearing (its left arm)', () => {
    // Facing +z, the figure's LEFT is local +x — right = forward x up = −x.
    const left = aimAt({ x: 0, z: 0, yaw: 0 }, { x: 5, y: 0.8, z: 0 }, 0.8)
    expect(left.bearing).toBeCloseTo(Math.PI / 2, 10)
    expect(gestureArm(left.bearing)).toBe('left')
    const right = aimAt({ x: 0, z: 0, yaw: 0 }, { x: -5, y: 0.8, z: 0 }, 0.8)
    expect(gestureArm(right.bearing)).toBe('right')
  })

  it('the aim rides the figure: turning it turns the bearing with it', () => {
    const target = { x: 4, y: 0.8, z: 0 }
    const a = aimAt({ x: 0, z: 0, yaw: 0 }, target, 0.8).bearing
    const b = aimAt({ x: 0, z: 0, yaw: Math.PI / 2 }, target, 0.8).bearing
    expect(a - b).toBeCloseTo(Math.PI / 2, 10)
  })

  it('elevation follows the target height against the shoulder', () => {
    expect(aimAt({ x: 0, z: 0, yaw: 0 }, { x: 0, y: 0.8, z: 4 }, 0.8).elevation).toBeCloseTo(0, 10)
    expect(aimAt({ x: 0, z: 0, yaw: 0 }, { x: 0, y: 4.8, z: 4 }, 0.8).elevation).toBeCloseTo(Math.PI / 4, 10)
    expect(aimAt({ x: 0, z: 0, yaw: 0 }, { x: 0, y: 0, z: 4 }, 0.8).elevation).toBeLessThan(0)
  })

  it('a target the figure stands on does not blow the elevation up', () => {
    const a = aimAt({ x: 2, z: 2, yaw: 0 }, { x: 2, y: 0, z: 2 }, 0.8)
    expect(Number.isFinite(a.bearing)).toBe(true)
    expect(Number.isFinite(a.elevation)).toBe(true)
  })
})
