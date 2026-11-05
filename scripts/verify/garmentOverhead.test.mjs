import { describe, it, expect } from 'vitest'
import { overheadCamera, OVERHEAD_PITCH_DEG } from './garmentOverhead.mjs'

describe('overheadCamera', () => {
  it('keeps the line-of-sight distance and the look-down angle', () => {
    for (const dist of [3, 7]) {
      const c = overheadCamera(dist, 0.47)
      expect(Math.hypot(c.horiz, c.eyeY - 0.47)).toBeCloseTo(dist, 9)
      expect(Math.atan2(c.eyeY - 0.47, c.horiz)).toBeCloseTo(-c.pitch, 9)
    }
  })

  it('looks down steeply (55-70 deg) and stands above the eye height', () => {
    expect(OVERHEAD_PITCH_DEG).toBeGreaterThanOrEqual(55)
    expect(OVERHEAD_PITCH_DEG).toBeLessThanOrEqual(70)
    const c = overheadCamera(3, 0.47)
    expect(c.pitch).toBeCloseTo((-60 * Math.PI) / 180, 9)
    expect(c.horiz).toBeCloseTo(1.5, 9)
    expect(c.eyeY).toBeGreaterThan(1.5)
  })

  it('rejects a non-positive distance or a flat/vertical angle', () => {
    expect(() => overheadCamera(0, 0)).toThrow(RangeError)
    expect(() => overheadCamera(3, 0, 0)).toThrow(RangeError)
    expect(() => overheadCamera(3, 0, 90)).toThrow(RangeError)
  })
})
