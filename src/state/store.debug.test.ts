// Debug loadout store actions (CLAUDE.md §7.1 pt. 20, design.md §21). Ports the
// F3 full-loadout and F4 canoe-toggle store asserts of settings.mjs into jsdom
// store tests. The debug-menu UI controls are covered by DebugMenu.test.tsx.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { balance } from '../config/balance'
import { EQUIPMENT_IDS } from './store'
import { g, freshGame } from '../test/store'

const capacityDefault = balance.inventoryCapacity

beforeEach(() => {
  freshGame()
})
afterEach(() => {
  balance.inventoryCapacity = capacityDefault // debugFullLoadout raises it to fit
})

describe('F3 full loadout (design.md §21)', () => {
  it('grants all gear/treasures, 100000 money/food/gifts, full health, no afflictions', () => {
    g().debugFullLoadout()
    expect(g().money).toBe(100000)
    expect(g().foodDays).toBe(100000)
    expect(g().health).toBe(balance.health.max)
    expect(g().canteenFill).toBe(1)
    for (const e of EQUIPMENT_IDS) expect(g().equipment[e] ?? 0).toBeGreaterThanOrEqual(1)
    expect(g().afflictions.fever).toBe(false)
    expect(g().afflictions.wounds).toBe(0)
    // The inventory capacity is raised to fit the flood of gifts.
    expect(balance.inventoryCapacity).toBeGreaterThanOrEqual(100000)
  })
})

describe('F4 canoe toggle (design.md §21)', () => {
  it('toggles the canoe in and out of the pack', () => {
    const had = (g().equipment.canoe ?? 0) > 0
    g().debugToggleCanoe()
    expect((g().equipment.canoe ?? 0) > 0).toBe(!had)
    g().debugToggleCanoe()
    expect((g().equipment.canoe ?? 0) > 0).toBe(had)
  })
})
