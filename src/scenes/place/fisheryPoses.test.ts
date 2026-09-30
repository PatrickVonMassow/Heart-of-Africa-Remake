// The carrier's pose never writes into the shared head-carry template
// (work-order 1245, cross-vendor review): carry → swap → carry leaves the
// template as it was, and the carrier's own pose returns to it.
import { describe, expect, it } from 'vitest'
import { carrierWalkPose, copyPose, ownPose } from './fisheryPoses'
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
