// Store save/load (CLAUDE.md §7.1 pt. 28/5, design.md §18). Ports the
// store-driven asserts of saveload.mjs and checkpoint.mjs (window.__game
// actions/state + localStorage) into fast jsdom checks: one snapshot per port
// visit, the placeholder cap, loading a specific/older visit, the successor on
// the latest snapshot, the legacy single-slot migration, and the listCheckpoints
// row shape. The LoadMenu overlay rendering (table rows/columns/health word) is
// DOM-only and stays in the Playwright E2E; the underlying data is asserted here
// via the exported listCheckpoints().
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { listCheckpoints, type CheckpointMeta } from './store'
import { g, freshGame, withWorld } from '../test/store'

withWorld()

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls
})
afterEach(() => {
  balance.randomEventsEnabled = true
  vi.restoreAllMocks()
})

// localStorage keys mirror the store's (non-exported) constants
// (CHECKPOINTS_KEY / LEGACY_CHECKPOINT_KEY, ~store.ts:281/284); the cap
// MAX_CHECKPOINTS (~store.ts:286) is likewise internal.
const CHECKPOINTS_KEY = 'hoa-checkpoints-v1'
const LEGACY_CHECKPOINT_KEY = 'hoa-checkpoint-v2'
const MAX_CHECKPOINTS = 25

/** Debug-settable snapshot fields (mirrors store debugSet's Pick). */
type DebugPatch = { money?: number; foodDays?: number; day?: number; health?: number }

/** Leave the current place, optionally set distinctive state, then enter a port
 *  (design.md §18: entering a port saves a checkpoint for that visit). */
function visitPort(id: string, patch?: DebugPatch): void {
  if (g().mode === 'place') g().leavePlace()
  if (patch) g().debugSet(patch)
  g().enterPlace(id)
}

describe('one snapshot per port visit (design.md §18)', () => {
  it('a fresh game starts with no checkpoints', () => {
    // freshGame() clears localStorage and newGame() saves nothing.
    expect(listCheckpoints()).toHaveLength(0)
  })

  it('visiting two different ports yields two snapshots', () => {
    visitPort('cairo', { money: 250 }) // visit 1: default money
    visitPort('zanzibar', { money: 500, health: 30 }) // visit 2: 500 $, poor health
    expect(listCheckpoints()).toHaveLength(2)
  })

  it('re-entering the same port still records each visit separately', () => {
    visitPort('cairo', { money: 100 })
    visitPort('cairo', { money: 200 })
    const rows = listCheckpoints()
    expect(rows).toHaveLength(2)
    expect(rows.map((r) => r.money)).toEqual([100, 200])
  })
})

describe('placeholder cap keeps only the most recent (MAX_CHECKPOINTS)', () => {
  it('caps the stored snapshots and drops the oldest', () => {
    const visits = MAX_CHECKPOINTS + 5 // 30 visits, cap 25 → keep visits 5..29
    for (let i = 0; i < visits; i++) visitPort('cairo', { money: 300 + i })
    const rows = listCheckpoints()
    expect(rows).toHaveLength(MAX_CHECKPOINTS)
    // The newest are retained, the oldest fall away: first kept = visit 5.
    expect(rows[0].money).toBe(300 + (visits - MAX_CHECKPOINTS))
    expect(rows[MAX_CHECKPOINTS - 1].money).toBe(300 + visits - 1)
  })
})

describe('loadCheckpoint restores a specific visit (design.md §18)', () => {
  it('loads the exact money/food/day/placeId/health of the chosen visit', () => {
    visitPort('cairo', { money: 200, foodDays: 30, day: 5, health: 80 })
    visitPort('zanzibar', { money: 500, foodDays: 20, day: 40, health: 30 })

    expect(g().loadCheckpoint(0)).toBe(true)
    expect(g().placeId).toBe('cairo')
    expect(g().money).toBe(200)
    expect(g().foodDays).toBe(30)
    expect(g().day).toBe(5)
    expect(g().health).toBe(80)
    expect(g().mode).toBe('place')

    expect(g().loadCheckpoint(1)).toBe(true)
    expect(g().placeId).toBe('zanzibar')
    expect(g().money).toBe(500)
    expect(g().foodDays).toBe(20)
    expect(g().day).toBe(40)
    expect(g().health).toBe(30)
  })

  it('resuming an older visit restores that older state, not the latest', () => {
    visitPort('cairo', { money: 250 })
    visitPort('zanzibar', { money: 500 })
    // Pick the older (Cairo) visit — index 0.
    expect(g().loadCheckpoint(0)).toBe(true)
    expect(g().placeId).toBe('cairo')
    expect(g().money).toBe(250)
    expect(g().money).not.toBe(500)
  })

  it('a third port visit is loadable as its own row', () => {
    visitPort('cairo', { money: 100 })
    visitPort('zanzibar', { money: 200 })
    visitPort('capetown', { money: 300 })
    expect(listCheckpoints()).toHaveLength(3)
    expect(g().loadCheckpoint(2)).toBe(true)
    expect(g().placeId).toBe('capetown')
    expect(g().money).toBe(300)
  })

  it('loadCheckpoint on empty storage returns false', () => {
    expect(g().loadCheckpoint()).toBe(false)
    expect(g().loadCheckpoint(0)).toBe(false)
  })
})

describe('successor resumes from the latest snapshot (design.md §18/§24)', () => {
  it('successorTakeOver loads the most recent visit', () => {
    visitPort('cairo', { money: 200, day: 10 })
    visitPort('zanzibar', { money: 500, day: 20 })
    const day0 = 20
    expect(g().successorTakeOver()).toBe(true)
    expect(g().placeId).toBe('zanzibar') // latest visit, not Cairo
    expect(g().money).toBe(500)
    // The successor loses the configured number of days (design.md §24).
    expect(g().day).toBe(day0 + balance.deadline.successorDayPenalty)
  })

  it('successorTakeOver on empty storage returns false', () => {
    expect(g().successorTakeOver()).toBe(false)
  })
})

describe('legacy single-slot checkpoint migrates as one row (design.md §18)', () => {
  it('a lone LEGACY_CHECKPOINT_KEY snapshot lists and loads as one visit', () => {
    // Produce a valid snapshot, then relocate it to the legacy single slot.
    visitPort('cairo', { money: 321 })
    const raw = localStorage.getItem(CHECKPOINTS_KEY)
    const snaps = JSON.parse(raw ?? '[]') as unknown[]
    localStorage.removeItem(CHECKPOINTS_KEY)
    localStorage.setItem(LEGACY_CHECKPOINT_KEY, JSON.stringify(snaps[0]))

    const rows = listCheckpoints()
    expect(rows).toHaveLength(1)
    expect(rows[0].placeId).toBe('cairo')
    expect(rows[0].money).toBe(321)

    // The migrated snapshot still loads.
    expect(g().loadCheckpoint()).toBe(true)
    expect(g().placeId).toBe('cairo')
    expect(g().money).toBe(321)
  })
})

describe('listCheckpoints row shape (design.md §18 table columns)', () => {
  it('returns one row per visit with port/day/money/foodDays/gifts/health', () => {
    visitPort('cairo', { money: 250, foodDays: 35, day: 0, health: 100 })
    visitPort('zanzibar', { money: 480, foodDays: 12, day: 33, health: 45 })

    const rows: CheckpointMeta[] = listCheckpoints()
    expect(rows).toHaveLength(2)

    const [first, second] = rows
    // Every documented column is present with the expected value.
    expect(first).toMatchObject({
      index: 0,
      placeId: 'cairo',
      day: 0,
      money: 250,
      foodDays: 35,
      health: 100,
    })
    expect(second).toMatchObject({
      index: 1,
      placeId: 'zanzibar',
      day: 33,
      money: 480,
      foodDays: 12,
      health: 45,
    })
    // Gifts flow through as a numeric total (start = 2 copper trinkets).
    expect(typeof first.gifts).toBe('number')
    expect(first.gifts).toBe(2)
    expect(second.gifts).toBe(2)
  })
})
