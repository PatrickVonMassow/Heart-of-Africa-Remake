import { describe, expect, it } from 'vitest'
import { PerspectiveCamera } from 'three/webgpu'
import { speechPan } from '../../communication/speaking'
import { speechBearing } from './speechBearing'

describe('the speaker in the live camera frame', () => {
  it('uses camera position and orientation for ahead, side and rear speakers', () => {
    const camera = new PerspectiveCamera()
    camera.position.set(12, 2, 8)
    camera.rotation.set(-0.3, Math.PI / 2, 0, 'YXZ')
    expect(speechBearing(camera, { x: 9, z: 8 })).toBeCloseTo(0)
    expect(speechBearing(camera, { x: 12, z: 5 })).toBeCloseTo(Math.PI / 2)
    expect(speechBearing(camera, { x: 12, z: 11 })).toBeCloseTo(-Math.PI / 2)
    expect(speechPan(speechBearing(camera, { x: 15, z: 11 }))).toBeLessThan(0)
    expect(speechPan(speechBearing(camera, { x: 15, z: 5 }))).toBeGreaterThan(0)
  })

  it('samples a newly turned camera and centres a coincident speaker', () => {
    const camera = new PerspectiveCamera()
    const speaker = { x: 3, z: 0 }
    expect(speechPan(speechBearing(camera, speaker))).toBeGreaterThan(0)
    camera.rotation.y = -Math.PI / 2
    expect(speechPan(speechBearing(camera, speaker))).toBeCloseTo(0)
    expect(speechPan(speechBearing(camera, { x: 0, z: 0 }))).toBe(0)
  })
})
