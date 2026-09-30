// The carrier's pose never writes into the shared head-carry template
// (work-order 1245, cross-vendor review): carry → swap → carry leaves the
// template as it was, and the carrier's own pose returns to it.
import { describe, expect, it } from 'vitest'
import { Euler, Vector3 } from 'three/webgpu'
import { carrierWalkPose, copyPose, netFishRotation, ownPose } from './fisheryPoses'
import { HEAD_CARRY_POSE } from './placeFigureContext'

describe('the carrier’s pose', () => {
  it('carries, bends for the swap and carries again without touching the shared template', () => {
    const before = JSON.stringify(HEAD_CARRY_POSE.current)
    const mine = ownPose(HEAD_CARRY_POSE.current)
    expect(mine).not.toBe(HEAD_CARRY_POSE.current)
    for (const [phase, clock] of [['toBank', 0], ['swap', 0.2], ['swap', 0.4], ['toFire', 0]] as const) {
      copyPose(mine, carrierWalkPose(phase, clock, 0.8))
    }
    expect(JSON.stringify(HEAD_CARRY_POSE.current)).toBe(before)
    expect(JSON.stringify(mine)).toBe(before)
    expect(mine.left).not.toBe(HEAD_CARRY_POSE.current.left)
  })
})

describe('a fish caught in the net at the gunwale', () => {
  it('hangs head down (head +Z, tail −Z in the fish mesh) through all its thrashing', () => {
    for (const shoreSide of [-1, 1]) {
      for (let i = 0; i < 8; i++) {
        for (let t = 0; t < 4; t += 0.05) {
          const e = new Euler(...netFishRotation(t, i, shoreSide))
          const head = new Vector3(0, 0, 0.5).applyEuler(e)
          const tail = new Vector3(0, 0, -0.5).applyEuler(e)
          expect(head.y).toBeLessThan(tail.y - 0.5)
        }
      }
    }
  })
})
