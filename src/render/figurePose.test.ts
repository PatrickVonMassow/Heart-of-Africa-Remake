// The pose has to land on the pivots that carry it, and on the right ones. The
// mapping used to be inline in the scene, where nothing measured it: a swapped
// arm or a lean written onto the wrong axis would have posed every figure in
// the game wrongly and shown up only as a picture nobody could explain.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { applyFigurePose, type FigureLimbs } from './figurePose'
import { REST_POSE, gesturePose, startGesture } from './gesture'

const limbSet = (): FigureLimbs => ({
  arms: [new THREE.Group(), new THREE.Group()],
  trunk: new THREE.Group(),
})

describe('applyFigurePose', () => {
  it('writes each arm onto its own pivot, angles as stated', () => {
    const limbs = limbSet()
    const pose = {
      left: { pitch: -1.2, yaw: 0.3, roll: 0.1 },
      right: { pitch: -0.4, yaw: -0.2, roll: -0.5 },
      lean: 0.5,
      turn: 0.2,
    }
    applyFigurePose(limbs, pose)
    expect(limbs.arms[0]!.rotation.x).toBeCloseTo(-1.2, 6)
    expect(limbs.arms[0]!.rotation.y).toBeCloseTo(0.3, 6)
    expect(limbs.arms[0]!.rotation.z).toBeCloseTo(0.1, 6)
    expect(limbs.arms[1]!.rotation.x).toBeCloseTo(-0.4, 6)
    expect(limbs.arms[1]!.rotation.y).toBeCloseTo(-0.2, 6)
    expect(limbs.arms[1]!.rotation.z).toBeCloseTo(-0.5, 6)
  })

  it('tips the TRUNK with the lean and turns it with the shake, nothing else', () => {
    const limbs = limbSet()
    applyFigurePose(limbs, { ...REST_POSE, lean: 0.5, turn: -0.2 })
    expect(limbs.trunk!.rotation.x).toBeCloseTo(0.5, 6)
    expect(limbs.trunk!.rotation.y).toBeCloseTo(-0.2, 6)
    expect(limbs.trunk!.rotation.z).toBe(0)
  })

  it('survives the frames before the pivots exist', () => {
    expect(() => applyFigurePose(null, REST_POSE)).not.toThrow()
    expect(() => applyFigurePose({ arms: [null, null], trunk: null }, REST_POSE)).not.toThrow()
  })

  it('puts a TOUCH on the pivots at its very first application (work-order 1065)', () => {
    // The tap's whole claim is that the hand is on the stone in the frame the
    // word falls, so the pose the touch begins at must be the posed one — not a
    // rest pose that grows into it over a blend.
    const limbs = limbSet()
    const touch = startGesture('touch', { bearing: 0, elevation: -0.4 }, 1.5)
    applyFigurePose(limbs, gesturePose(touch))
    expect(limbs.arms[0]!.rotation.x).not.toBeCloseTo(REST_POSE.left.pitch, 2)
  })
})
