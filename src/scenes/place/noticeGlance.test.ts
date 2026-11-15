import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { bearingTo, createNoticeBoard, glanceYaw, glancingCount, noticeStep, settleYaw, type NoticeConfig } from './noticeGlance'

const CFG: NoticeConfig = { ...balance.villageLife.notice }
const DT = 1 / 60
const PLAYER = { active: true, x: 0, z: 0 }

describe('notice predicate', () => {
  it('fires inside the radius and not outside', () => {
    const board = createNoticeBoard()
    const near = noticeStep(board, 'near', { x: CFG.radius - 0.5, z: 0 }, PLAYER, {}, CFG, DT)
    const far = noticeStep(board, 'far', { x: CFG.radius + 0.5, z: 0 }, PLAYER, {}, CFG, DT)
    expect(near.glance).toBeGreaterThan(0)
    expect(far.glance).toBe(0)
  })

  it('does not fire for an exempt inhabitant, an absent traveller or a fast walker', () => {
    const board = createNoticeBoard()
    expect(noticeStep(board, 'a', { x: 1, z: 0 }, PLAYER, { exempt: true }, CFG, DT).glance).toBe(0)
    expect(noticeStep(board, 'b', { x: 1, z: 0 }, { ...PLAYER, active: false }, {}, CFG, DT).glance).toBe(0)
    noticeStep(board, 'c', { x: 5, z: 0 }, { ...PLAYER, active: false }, {}, CFG, DT)
    expect(noticeStep(board, 'c', { x: 5, z: 0.1 }, PLAYER, {}, CFG, DT).glance).toBe(0)
  })

  it('respects the per-inhabitant cooldown', () => {
    const board = createNoticeBoard()
    const at = { x: 2, z: 0 }
    const e = noticeStep(board, 'x', at, PLAYER, {}, CFG, DT)
    expect(e.glance).toBeCloseTo(CFG.glanceSeconds, 9)
    let t = 0
    let restarted = -1
    while (t < CFG.glanceSeconds + CFG.cooldownSeconds + 1) {
      const wasGlancing = e.glance > 0
      noticeStep(board, 'x', at, PLAYER, {}, CFG, DT)
      t += DT
      if (!wasGlancing && e.glance > 0) { restarted = t; break }
    }
    expect(restarted).toBeGreaterThanOrEqual(CFG.glanceSeconds + CFG.cooldownSeconds - 2 * DT)
  })

  it('children stare longer', () => {
    const board = createNoticeBoard()
    expect(noticeStep(board, 'k', { x: 1, z: 1 }, PLAYER, { child: true }, CFG, DT).glance)
      .toBeCloseTo(CFG.glanceSeconds * CFG.childFactor, 9)
  })

  it('never selects more than the cap', () => {
    const board = createNoticeBoard()
    for (let frame = 0; frame < 600; frame++) {
      for (let i = 0; i < 20; i++) {
        noticeStep(board, `v${i}`, { x: Math.cos(i), z: Math.sin(i) }, PLAYER, {}, CFG, DT)
        expect(glancingCount(board)).toBeLessThanOrEqual(CFG.maxAtOnce)
      }
    }
    expect(CFG.maxAtOnce).toBeGreaterThan(0)
  })

  it('counts a figure still turning back against the cap', () => {
    const board = createNoticeBoard()
    const at = (i: number) => ({ x: Math.cos(i), z: Math.sin(i) })
    const yaws: number[] = []
    let frames = 0
    // Glance until every glance has run out while some are still turning back.
    for (; frames < 6000; frames++) {
      for (let i = 0; i < 20; i++) {
        const e = noticeStep(board, `v${i}`, at(i), PLAYER, {}, CFG, DT)
        // A slow turn, so a figure is still returning after its glance ends.
        yaws[i] = glanceYaw(e, yaws[i] ?? i, at(i), PLAYER, 0.2 * DT, i)
        expect(glancingCount(board)).toBeLessThanOrEqual(CFG.maxAtOnce)
      }
      const returning = [...board.entries.values()].filter((e) => e.glance === 0 && e.rest !== null).length
      if (returning > 0 && frames > CFG.glanceSeconds * 60) break
    }
    expect(frames).toBeLessThan(6000)
  })
})

describe('glance facing', () => {
  it('is a bounded step toward the traveller, never a snap, and returns afterwards', () => {
    const board = createNoticeBoard()
    const at = { x: 3, z: 0 }
    const start = Math.PI / 2 // facing +x, away from the traveller at the origin
    const toward = bearingTo(at, PLAYER)
    const maxStep = 3 * DT
    const e = noticeStep(board, 'g', at, PLAYER, {}, CFG, DT)
    let yaw = start
    const first = glanceYaw(e, yaw, at, PLAYER, maxStep)
    expect(Math.abs(first - yaw)).toBeCloseTo(maxStep, 9)
    let closest = Infinity
    while (e.glance > 0) {
      const next = glanceYaw(e, yaw, at, PLAYER, maxStep)
      expect(Math.abs(Math.atan2(Math.sin(next - yaw), Math.cos(next - yaw)))).toBeLessThanOrEqual(maxStep + 1e-12)
      yaw = next
      closest = Math.min(closest, Math.abs(Math.atan2(Math.sin(toward - yaw), Math.cos(toward - yaw))))
      noticeStep(board, 'g', at, PLAYER, {}, CFG, DT)
    }
    expect(closest).toBeLessThan(1e-9)
    for (let i = 0; i < 600; i++) {
      const next = glanceYaw(e, yaw, at, PLAYER, maxStep)
      expect(Math.abs(Math.atan2(Math.sin(next - yaw), Math.cos(next - yaw)))).toBeLessThanOrEqual(maxStep + 1e-12)
      yaw = next
    }
    expect(yaw).toBeCloseTo(start, 9)
    expect(e.rest).toBeNull()
  })
})

describe('settling back after a glance', () => {
  it('eases a cut-off glance back to the own facing by bounded steps', () => {
    const maxStep = 3 * DT
    let state = { yaw: Math.PI / 2, easing: true }
    let frames = 0
    while (state.easing) {
      const next = settleYaw(state.yaw, 0, state.easing, maxStep)
      expect(Math.abs(next.yaw - state.yaw)).toBeLessThanOrEqual(maxStep + 1e-12)
      state = next
      frames++
    }
    expect(state.yaw).toBe(0)
    expect(frames).toBeGreaterThan(1)
  })

  it('follows the own facing directly when no glance is behind it', () => {
    expect(settleYaw(2, 0.5, false, 0.01)).toEqual({ yaw: 0.5, easing: false })
    expect(settleYaw(undefined, 0.5, true, 0.01)).toEqual({ yaw: 0.5, easing: false })
  })
})
