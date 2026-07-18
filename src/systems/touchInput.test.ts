// Touch-input math (CLAUDE.md §7.1 pt. 30, point 84): virtual-stick vector
// with dead zone + diagonal clamp, pinch ratio, and the engagement latch.
import { describe, it, expect } from 'vitest'
import { stickVector, pinchRatio, createEngageLatch } from './touchInput'

const R = 60
const DZ = 8

describe('stickVector', () => {
  it('reads zero inside the dead zone', () => {
    expect(stickVector(0, 0, R, DZ)).toEqual({ x: 0, y: 0 })
    expect(stickVector(5, 0, R, DZ)).toEqual({ x: 0, y: 0 })
  })

  it('the dead-zone edge itself is still dead (inclusive), just past it is not', () => {
    // len === DZ is caught by the `<=` guard.
    expect(stickVector(DZ, 0, R, DZ)).toEqual({ x: 0, y: 0 })
    expect(stickVector(DZ + 0.001, 0, R, DZ).x).toBeGreaterThan(0)
  })

  it('drags up = forward (y positive), down = backward', () => {
    const up = stickVector(0, -R, R, DZ) // screen −y
    expect(up.y).toBeCloseTo(1, 6)
    expect(up.x).toBeCloseTo(0, 6)
    const down = stickVector(0, R, R, DZ)
    expect(down.y).toBeCloseTo(-1, 6)
  })

  it('drags right = strafe right (x positive)', () => {
    const right = stickVector(R, 0, R, DZ)
    expect(right.x).toBeCloseTo(1, 6)
    expect(right.y).toBeCloseTo(0, 6)
  })

  it('never exceeds magnitude 1, so a diagonal is not faster than a straight push', () => {
    // Full-radius diagonal push.
    const diag = stickVector(R, -R, R, DZ)
    expect(Math.hypot(diag.x, diag.y)).toBeLessThanOrEqual(1 + 1e-9)
    // And a beyond-radius drag is still clamped to 1.
    const far = stickVector(R * 3, -R * 3, R, DZ)
    expect(Math.hypot(far.x, far.y)).toBeCloseTo(1, 6)
  })

  it('rescales smoothly from the dead-zone edge (just past DZ is near zero)', () => {
    const justPast = stickVector(DZ + 0.5, 0, R, DZ)
    expect(justPast.x).toBeGreaterThan(0)
    expect(justPast.x).toBeLessThan(0.05)
  })
})

describe('pinchRatio', () => {
  it('spreading fingers apart zooms in (ratio < 1)', () => {
    expect(pinchRatio(100, 200)).toBeCloseTo(0.5, 6)
  })

  it('pinching fingers together zooms out (ratio > 1)', () => {
    expect(pinchRatio(200, 100)).toBeCloseTo(2, 6)
  })

  it('is inert (1) for a degenerate distance', () => {
    expect(pinchRatio(0, 100)).toBe(1)
    expect(pinchRatio(100, 0)).toBe(1)
  })
})

describe('createEngageLatch', () => {
  it('arms only on the first engage and never disarms', () => {
    const latch = createEngageLatch()
    expect(latch.engaged()).toBe(false)
    expect(latch.engage()).toBe(true) // first
    expect(latch.engaged()).toBe(true)
    expect(latch.engage()).toBe(false) // subsequent
    expect(latch.engage()).toBe(false)
    expect(latch.engaged()).toBe(true)
  })
})
