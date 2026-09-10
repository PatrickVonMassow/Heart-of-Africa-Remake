// The pose has to land on the pivots that carry it, and on the right ones. The
// mapping used to be inline in the scene, where nothing measured it: a swapped
// arm or a lean written onto the wrong axis would have posed every figure in
// the game wrongly and shown up only as a picture nobody could explain.

import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { applyFigurePose, restingArmRefs, type FigureLimbs } from './figurePose'
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
    const touch = startGesture('touch', { bearing: 0, elevation: -0.4, duration: 1.5 })
    applyFigurePose(limbs, gesturePose(touch))
    expect(limbs.arms[0]!.rotation.x).not.toBeCloseTo(REST_POSE.left.pitch, 2)
  })
})

describe('restingArmRefs', () => {
  const REST_ARMS = [REST_POSE.left, REST_POSE.right] as const

  it('publishes a newly born pivot and puts it at rest, in the pose order', () => {
    const arms: Array<THREE.Group | null> = []
    const refs = restingArmRefs(arms, REST_ARMS)
    const left = new THREE.Group()
    const right = new THREE.Group()
    refs[0](left)
    refs[1](right)
    expect(arms[0]).toBe(left)
    expect(arms[1]).toBe(right)
    // `YXZ`, or a bearing would spin a hanging limb about its own axis instead
    // of swinging a raised one.
    expect(left.rotation.order).toBe('YXZ')
    expect(left.rotation.x).toBeCloseTo(REST_POSE.left.pitch, 6)
    expect(left.rotation.z).toBeCloseTo(REST_POSE.left.roll, 6)
    expect(right.rotation.x).toBeCloseTo(REST_POSE.right.pitch, 6)
  })

  it('NEVER returns a pivot it has already seen to rest (work-order 1065)', () => {
    // THE DEFECT THIS EXISTS FOR. The callback used to be written inline in the
    // figure's JSX, so React handed it a NEW function every render and
    // re-attached it — and re-attaching meant re-resting. Measured 10.09.2026 on
    // WebGL 2: the tapping child's hand 61 cm off the stone it was naming, for
    // one frame of a nine-second hold, its touch pose written and a rest pose
    // drawn. A re-attach must therefore publish the pivot and touch nothing else.
    const arms: Array<THREE.Group | null> = []
    const refs = restingArmRefs(arms, REST_ARMS)
    const left = new THREE.Group()
    refs[0](left)
    const touch = gesturePose(startGesture('touch', { bearing: 0, elevation: -0.4, duration: 9 }))
    applyFigurePose({ arms: [left, null], trunk: null }, touch)
    const posed = left.rotation.x
    expect(posed).not.toBeCloseTo(REST_POSE.left.pitch, 2)

    // React detaching and re-attaching the same pivot, twice over.
    refs[0](null)
    refs[0](left)
    refs[0](left)
    expect(left.rotation.x).toBeCloseTo(posed, 6)
    expect(arms[0]).toBe(left)
  })

  it('still rests a pivot that REPLACES an earlier one', () => {
    // A genuine remount is not a re-render: the new pivot has never been posed,
    // and it starts where every unposed arm starts.
    const arms: Array<THREE.Group | null> = []
    const refs = restingArmRefs(arms, REST_ARMS)
    const first = new THREE.Group()
    refs[0](first)
    applyFigurePose({ arms: [first, null], trunk: null }, gesturePose(startGesture('point')))
    refs[0](null)
    const second = new THREE.Group()
    refs[0](second)
    expect(arms[0]).toBe(second)
    expect(second.rotation.order).toBe('YXZ')
    expect(second.rotation.x).toBeCloseTo(REST_POSE.left.pitch, 6)
  })
})
