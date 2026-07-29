// Vertical first-person look (design.md §17.5, point 392): the pitch state, its
// clamp, both input paths into it, and the fixed order the walking bob composes
// with it. Pure — no browser, no three.js scene.
import { describe, it, expect } from 'vitest'
import {
  PAD_LOOK_RATE,
  PITCH_LIMIT_CEILING_DEG,
  applyPitch,
  mousePitchDelta,
  padPitchDelta,
  pitchLimit,
  placeCameraPose,
} from './lookPitch'
import { balance } from '../config/balance'

const LIMIT = balance.lookPitchLimitDeg
const deg = (rad: number) => (rad * 180) / Math.PI

describe('pitch clamp (design.md §17.5)', () => {
  it('stops short of straight up and straight down', () => {
    expect(LIMIT).toBeGreaterThan(60) // a usable look, not a token tilt
    expect(LIMIT).toBeLessThan(90) // never vertical: the world must not roll over
    expect(deg(pitchLimit(LIMIT))).toBeCloseTo(LIMIT, 10)
  })

  it('caps a mis-calibrated debug value structurally', () => {
    // The debug menu edits the clamp (§21.2); a typo there must not hand the
    // player a camera that can pass the pole.
    expect(deg(pitchLimit(180))).toBe(PITCH_LIMIT_CEILING_DEG)
    expect(deg(pitchLimit(90))).toBe(PITCH_LIMIT_CEILING_DEG)
    expect(PITCH_LIMIT_CEILING_DEG).toBeLessThan(90)
    expect(pitchLimit(-30)).toBe(0) // a negative clamp pins the view, never inverts it
  })

  it('clamps at both ends and cannot be pushed past them by any input sequence', () => {
    const limit = pitchLimit(LIMIT)
    for (const step of [0.001, 0.05, 0.4, 3, 1e6, -0.001, -0.4, -1e6]) {
      let pitch = 0
      // Enough repeats to drive PAST the clamp from either side, however small
      // the step — the point is that it stops there, not that it gets there.
      const repeats = Math.ceil(limit / Math.abs(step)) + 20
      for (let i = 0; i < repeats; i++) {
        pitch = applyPitch(pitch, step, LIMIT)
        expect(pitch).toBeLessThanOrEqual(limit)
        expect(pitch).toBeGreaterThanOrEqual(-limit)
      }
      expect(Math.abs(pitch)).toBeCloseTo(limit, 10) // and it does REACH the limit
    }
  })

  it('survives a hostile input sequence — alternating, huge and non-finite', () => {
    const limit = pitchLimit(LIMIT)
    let pitch = 0
    const deltas = [1e9, -1e9, Number.MAX_VALUE, -Number.MAX_VALUE, Infinity, -Infinity, NaN, 0.3, -0.7]
    for (let i = 0; i < 200; i++) {
      pitch = applyPitch(pitch, deltas[i % deltas.length], LIMIT)
      expect(Number.isFinite(pitch)).toBe(true)
      expect(Math.abs(pitch)).toBeLessThanOrEqual(limit + 1e-12)
    }
  })

  it('leaves the pitch untouched in the clamped middle', () => {
    expect(applyPitch(0.2, 0.1, LIMIT)).toBeCloseTo(0.3, 12)
    expect(applyPitch(0.2, -0.5, LIMIT)).toBeCloseTo(-0.3, 12)
  })
})

describe('mouse pitch (design.md §17.5, inverted by default)', () => {
  it('accumulates at the same sensitivity as the yaw', () => {
    // 100 px of mouse travel = 100 × mouseSensitivity radians, the exact gain
    // the horizontal look applies to movementX.
    const d = mousePitchDelta(100, balance.mouseSensitivity, true)
    expect(Math.abs(d)).toBeCloseTo(100 * balance.mouseSensitivity, 12)
    // And it is linear: ten 10-px moves land where one 100-px move does.
    let pitch = 0
    for (let i = 0; i < 10; i++) pitch = applyPitch(pitch, mousePitchDelta(10, balance.mouseSensitivity, true), LIMIT)
    expect(pitch).toBeCloseTo(applyPitch(0, d, LIMIT), 12)
  })

  it('looks DOWN when the mouse is pushed forward, UP when pulled back (the default)', () => {
    // Browser convention: mouse pushed away from the user = movementY negative.
    expect(mousePitchDelta(-40, balance.mouseSensitivity, true)).toBeLessThan(0) // forward → down
    expect(mousePitchDelta(40, balance.mouseSensitivity, true)).toBeGreaterThan(0) // back → up
  })

  it('flips exactly and only the vertical sense when the inversion is switched off', () => {
    for (const movementY of [-60, -1, 1, 60]) {
      const inverted = mousePitchDelta(movementY, balance.mouseSensitivity, true)
      const plain = mousePitchDelta(movementY, balance.mouseSensitivity, false)
      expect(plain).toBeCloseTo(-inverted, 12)
    }
  })
})

describe('gamepad pitch (design.md §17.5 — the same path, not a second one)', () => {
  it('feeds the very same clamped state as the mouse', () => {
    const dt = 1 / 60
    let padPitch = 0
    for (let i = 0; i < 2000; i++) padPitch = applyPitch(padPitch, padPitchDelta(-1, dt, true), LIMIT)
    expect(padPitch).toBeCloseTo(-pitchLimit(LIMIT), 10) // stick forward → look down, clamped
    let mousePitch = 0
    for (let i = 0; i < 2000; i++) mousePitch = applyPitch(mousePitch, mousePitchDelta(-50, balance.mouseSensitivity, true), LIMIT)
    expect(mousePitch).toBeCloseTo(-pitchLimit(LIMIT), 10) // identical resting state
  })

  it('turns at the yaw rate and obeys the same inversion flag', () => {
    expect(Math.abs(padPitchDelta(1, 1, true))).toBeCloseTo(PAD_LOOK_RATE, 12)
    expect(padPitchDelta(0.5, 0.5, false)).toBeCloseTo(-padPitchDelta(0.5, 0.5, true), 12)
    expect(padPitchDelta(0, 1, true)).toBe(0) // a centred stick never drifts the view
  })
})

describe('camera pose composition (point 392: bob and pitch in a fixed order)', () => {
  const EYE = 1.5

  it('keeps the bob a POSITION offset and the pitch a ROTATION', () => {
    const flat = placeCameraPose(3, -4, EYE, 0.7, 0, 0.02, 0.03, 0.05)
    const pitched = placeCameraPose(3, -4, EYE, 0.7, -1.2, 0.02, 0.03, 0.05)
    // The pitch never moves the head: the same standpoint and the same bob.
    expect(pitched.position).toEqual(flat.position)
    expect(pitched.rotation).toEqual([-1.2, 0.7, 0.02])
    // 'YXZ' order — pitch first in the tuple, yaw second, roll last.
    expect(flat.rotation).toEqual([0, 0.7, 0.02])
  })

  it('swings the lateral bob with the yaw alone, never with the pitch', () => {
    const yaw = 1.1
    const a = placeCameraPose(0, 0, EYE, yaw, 0, 0, 0.1, 0.25)
    const b = placeCameraPose(0, 0, EYE, yaw, pitchLimit(LIMIT), 0, 0.1, 0.25)
    expect(b.position).toEqual(a.position)
    // The offset lies on the camera's right axis (cos yaw, -sin yaw).
    expect(a.position[0]).toBeCloseTo(Math.cos(yaw) * 0.25, 12)
    expect(a.position[2]).toBeCloseTo(-Math.sin(yaw) * 0.25, 12)
    expect(a.position[1]).toBeCloseTo(EYE + 0.1, 12)
  })

  it('settles at exactly the eye height with no bob, at any pitch', () => {
    for (const pitch of [-pitchLimit(LIMIT), -0.4, 0, 0.4, pitchLimit(LIMIT)]) {
      const pose = placeCameraPose(2, 5, EYE, 0.3, pitch, 0, 0, 0)
      expect(pose.position).toEqual([2, EYE, 5])
    }
  })
})

describe('near plane against the wall clearance (§7.1 pt 16, from every pitch)', () => {
  it('keeps the whole near plane inside the collision clearance whatever the view does', () => {
    // The camera's near plane is a RECTANGLE; rotating it (yaw, pitch or roll)
    // sweeps the sphere through its corners. That sphere's radius is
    // orientation-free, so if it fits inside the clearance the collision keeps,
    // no pitch — looking up at a wall from close included — can push a corner
    // through a wall face and show the inside of a building.
    const near = 0.1 // App.tsx camera
    const fovDeg = 50
    const aspect = 21 / 9 // wider than any shipped viewport → the largest corner
    const halfH = near * Math.tan((fovDeg / 2) * (Math.PI / 180))
    const halfW = halfH * aspect
    const cornerRadius = Math.hypot(near, halfW, halfH)
    // PLAYER_RADIUS (0.35) plus the boxCollider wall margin (0.15).
    const clearance = 0.35 + 0.15
    expect(cornerRadius).toBeLessThan(clearance)
  })
})
