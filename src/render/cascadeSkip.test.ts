// Skipping the sun-shadow cascades no visible pixel samples (point 1524).
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { cascadesInUse, deepestGroundDepth, updateCascadeSkip } from './cascadeSkip'
import { CAMERA_OFFSET, TRAVEL_CAMERA_FOV_DEG, followAt, followPose, southReachShift } from '../scenes/travel/followCamera'
import { balance } from '../config/balance'
import { DEFAULT_TRAVEL_ZOOM } from '../state/ui'

/** The travel CSM's measured practical breaks (0.1..240, three cascades). */
const BREAKS = [0.1696, 0.3707, 1]

function travelCamera(zoom: number, aspect: number): THREE.PerspectiveCamera {
  const cam = new THREE.PerspectiveCamera(TRAVEL_CAMERA_FOV_DEG, aspect, 0.1, 2000)
  const shift = southReachShift(CAMERA_OFFSET, TRAVEL_CAMERA_FOV_DEG, balance.travelCameraFollow.southReachCompensation)
  const pose = followPose(followAt(0, 0, zoom), CAMERA_OFFSET, shift)
  cam.position.set(...pose.position)
  cam.lookAt(...pose.target)
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()
  return cam
}

function csmStub() {
  return { breaks: [...BREAKS], maxFar: 240, lights: BREAKS.map(() => ({ shadow: { autoUpdate: true } })) }
}

describe('shadow cascade skip', () => {
  it('keeps every cascade the fade margin can reach', () => {
    expect(cascadesInUse(BREAKS, 0.05, 0)).toBe(1)
    // Cascade 1 is sampled from b - b²/8 below its start (the CSM fade margin).
    const from1 = BREAKS[0] - 0.125 * BREAKS[0] ** 2
    expect(cascadesInUse(BREAKS, from1 - 1e-4, 0)).toBe(1)
    expect(cascadesInUse(BREAKS, from1 + 1e-4, 0)).toBe(2)
    expect(cascadesInUse(BREAKS, 0.9, 0)).toBe(3)
    expect(cascadesInUse(BREAKS, Infinity, 0)).toBe(3)
    // The safety share skips later.
    expect(cascadesInUse(BREAKS, from1 * 0.95, 0.1)).toBe(2)
  })

  it('reads the deepest visible ground of a camera looking down, Infinity at the horizon', () => {
    const cam = travelCamera(DEFAULT_TRAVEL_ZOOM, 16 / 9)
    const d0 = deepestGroundDepth(cam, 0)
    expect(d0).toBeGreaterThan(10)
    expect(deepestGroundDepth(cam, -5)).toBeGreaterThan(d0)
    const level = new THREE.PerspectiveCamera(50, 1, 0.1, 100)
    level.lookAt(0, 0, -1)
    level.updateMatrixWorld()
    expect(deepestGroundDepth(level, -1)).toBe(Infinity)
  })

  it('renders only the near cascade at the default zoom on every screen shape, and keeps all when zoomed far out', () => {
    for (const aspect of [4 / 3, 16 / 9, 2752 / 1152, 32 / 9]) {
      const csm = csmStub()
      const inUse = updateCascadeSkip(csm, travelCamera(DEFAULT_TRAVEL_ZOOM, aspect), 0)
      // The view reaches ~36 units deep; cascade 1 is sampled from ~40.
      expect(inUse).toBe(1)
      expect(csm.lights.map((l) => l.shadow.autoUpdate)).toEqual([0, 1, 2].map((i) => i < inUse))
    }
    const far = csmStub()
    expect(updateCascadeSkip(far, travelCamera(8, 16 / 9), 0)).toBe(3)
    expect(far.lights.every((l) => l.shadow.autoUpdate)).toBe(true)
  })

  it('renders every cascade when switched off', () => {
    const csm = csmStub()
    const was = balance.shadowCascadeSkip.enabled
    balance.shadowCascadeSkip.enabled = false
    try {
      expect(updateCascadeSkip(csm, travelCamera(DEFAULT_TRAVEL_ZOOM, 16 / 9), 0)).toBe(3)
    } finally {
      balance.shadowCascadeSkip.enabled = was
    }
  })
})
