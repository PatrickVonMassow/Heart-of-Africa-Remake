import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import {
  bowLean,
  choosePartner,
  createEncounterBoard,
  facingYaw,
  gatheringSlots,
  handOver,
  meetingOf,
  pairKey,
  stepEncounters,
  type EncounterTuning,
  type EncounterWalker,
  type EncounterWorld,
} from './encounters'

const tuning: EncounterTuning = { ...balance.villageLife.encounters, meetChance: 1, handoverChance: 1 }
const open: EncounterWorld = { standClear: () => true, doorways: [] }
const walker = (x: number, z: number, over: Partial<EncounterWalker> = {}): EncounterWalker => ({ x, z, available: true, carries: false, ...over })
const always = () => 0

describe('partner choice', () => {
  it('takes the nearest available walker within the radius', () => {
    const ws = [walker(0, 0), walker(1.8, 0), walker(1, 0), walker(9, 0)]
    expect(choosePartner(ws, 0, createEncounterBoard(), open, tuning)).toBe(2)
  })

  it('never takes one beyond the radius, unavailable or inside a building', () => {
    const board = createEncounterBoard()
    expect(choosePartner([walker(0, 0), walker(tuning.radius + 0.1, 0)], 0, board, open, tuning)).toBeNull()
    expect(choosePartner([walker(0, 0), walker(1, 0, { available: false })], 0, board, open, tuning)).toBeNull()
    const hut: EncounterWorld = { standClear: (x) => x < 0.5, doorways: [] }
    expect(choosePartner([walker(0, 0), walker(1, 0)], 0, board, hut, tuning)).toBeNull()
  })

  it('never takes one already in an encounter', () => {
    const board = createEncounterBoard()
    board.meetings.push({ a: 1, b: 2, remaining: 3, total: 4, giver: null, handed: false })
    expect(choosePartner([walker(0, 0), walker(0.5, 0), walker(0.6, 0)], 0, board, open, tuning)).toBeNull()
  })

  it('refuses a meeting in a doorway', () => {
    const door: EncounterWorld = { standClear: () => true, doorways: [[1, 0]] }
    expect(choosePartner([walker(0, 0), walker(1, 0)], 0, createEncounterBoard(), door, tuning)).toBeNull()
  })
})

describe('the meeting window', () => {
  it('expires deterministically and the cooldown blocks an immediate repeat', () => {
    const board = createEncounterBoard()
    const ws = [walker(0, 0), walker(1, 0)]
    const loads = [false, false]
    const first = stepEncounters(board, ws, loads, open, tuning, 0.1, always)
    expect(first).toEqual([{ kind: 'meet', a: 0, b: 1, handover: false }])
    expect(meetingOf(board, 1)).not.toBeNull()
    let parted = false
    let t = 0
    while (t < tuning.meetSeconds + 0.2) {
      const ev = stepEncounters(board, ws, loads, open, tuning, 0.1, always)
      t += 0.1
      if (ev.some((e) => e.kind === 'part')) {
        parted = true
        break
      }
    }
    expect(parted).toBe(true)
    expect(t).toBeCloseTo(tuning.meetSeconds, 5)
    expect(board.meetings).toHaveLength(0)
    expect(board.pairCooldown.get(pairKey(0, 1))).toBeGreaterThan(0)
    // Still side by side, yet no second meeting begins.
    expect(stepEncounters(board, ws, loads, open, tuning, 0.1, always).filter((e) => e.kind === 'meet')).toHaveLength(0)
  })

  it('a refused roll cools the pair down too, so a crossing is decided once', () => {
    const board = createEncounterBoard()
    const ev = stepEncounters(board, [walker(0, 0), walker(1, 0)], [false, false], open, { ...tuning, meetChance: 0.5 }, 0.1, () => 0.99)
    expect(ev).toHaveLength(0)
    expect(board.pairCooldown.get(pairKey(0, 1))).toBeGreaterThan(0)
  })

  it('the bow rises and settles before the pair parts', () => {
    const m = { a: 0, b: 1, remaining: 4, total: 4, giver: null, handed: false }
    expect(bowLean(m, 0.2)).toBe(0)
    m.remaining = 4 * (1 - 0.325)
    expect(bowLean(m, 0.2)).toBeCloseTo(0.2, 5)
    m.remaining = 1
    expect(bowLean(m, 0.2)).toBe(0)
  })

  it('facing yaws point at each other', () => {
    const a = { x: 0, z: 0 }
    const b = { x: 1, z: 1 }
    const diff = facingYaw(a, b) - facingYaw(b, a)
    expect(Math.abs(Math.abs(diff) - Math.PI)).toBeLessThan(1e-9)
  })
})

describe('the handover', () => {
  it('moves the load exactly once: source empty, target carrying', () => {
    const loads = [true, false]
    expect(handOver(loads, 0, 1)).toBe(true)
    expect(loads).toEqual([false, true])
    expect(handOver(loads, 0, 1)).toBe(false)
    expect(loads).toEqual([false, true])
  })

  it('never makes two carriers or none', () => {
    const both = [true, true]
    expect(handOver(both, 0, 1)).toBe(false)
    expect(both).toEqual([true, true])
    const none = [false, false]
    expect(handOver(none, 0, 1)).toBe(false)
    expect(none).toEqual([false, false])
  })

  it('a handover meeting passes the load once across the whole window', () => {
    const board = createEncounterBoard()
    const ws = [walker(0, 0), walker(1, 0)]
    const loads = [true, false]
    const events = []
    for (let t = 0; t < tuning.meetSeconds + 0.5; t += 0.1) events.push(...stepEncounters(board, ws, loads, open, tuning, 0.1, always))
    expect(events.filter((e) => e.kind === 'handover')).toEqual([{ kind: 'handover', from: 0, to: 1 }])
    expect(loads).toEqual([false, true])
  })

  it('no handover is planned when both or neither carry', () => {
    const board = createEncounterBoard()
    const ev = stepEncounters(board, [walker(0, 0), walker(1, 0)], [true, true], open, tuning, 0.1, always)
    expect(ev[0]).toMatchObject({ kind: 'meet', handover: false })
  })
})

describe('the fire gathering', () => {
  it('places companions on free ground, facing the fire, clear of the fixed figures', () => {
    const fire = [0, 0] as const
    const tender = [-1.3, -0.7] as const
    const slots = gatheringSlots(fire, 2, { ring: 1.5, avoid: [tender], avoidRadius: 0.9, standClear: (x) => x > -1.4, startAngle: 0 })
    expect(slots).toHaveLength(2)
    for (const s of slots) {
      expect(Math.hypot(s.x, s.z)).toBeCloseTo(1.5, 5)
      expect(Math.hypot(s.x - tender[0], s.z - tender[1])).toBeGreaterThanOrEqual(0.9)
      expect(s.x).toBeGreaterThan(-1.4)
      expect(Math.abs(facingYaw(s, { x: 0, z: 0 }) - s.yaw)).toBeLessThan(1e-9)
    }
    expect(Math.hypot(slots[0].x - slots[1].x, slots[0].z - slots[1].z)).toBeGreaterThanOrEqual(0.9)
  })

  it('gives fewer where the ground is crowded, never one in a collider', () => {
    expect(gatheringSlots([0, 0], 2, { ring: 1.5, avoid: [], avoidRadius: 0.9, standClear: () => false, startAngle: 0 })).toEqual([])
  })
})
