// Health & afflictions store transitions (CLAUDE.md §7.1 pt. 22, design.md
// §6/§15). Ports the store-driven asserts of scripts/verify/health.mjs into
// fast jsdom checks: canteen fill drains away from water (faster in the
// desert), empties into thirst then dehydration and health loss, refills at
// fresh water; dehydration onset/recovery; fever/starvation drains and regen;
// medicine cure; sun-blindness heals only outside the desert; the death →
// remains → successor flow. The DOM-bound checks (sunblind veil, defeat
// overlay text, vultures) and the UI-only H-query stay in the Playwright suite.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { balance } from '../config/balance'
import { g, useGame, freshGame, withWorld, terrainAt, COORD } from '../test/store'

withWorld()

beforeEach(() => {
  freshGame()
  balance.randomEventsEnabled = false // deterministic: no hidden per-day rolls
})
afterEach(() => {
  balance.randomEventsEnabled = true
  vi.restoreAllMocks()
})

const journalKeys = () => g().journal.map((e) => (typeof e.text === 'object' ? e.text.key : e.text))
const countKey = (key: string) => journalKeys().filter((k) => k === key).length
/** Advance health `days` days on a terrain in `step`-day ticks (tickHealth). */
const tick = (terrain: string, lat: number, lon: number, days: number, step = 1) => {
  const n = Math.round(days / step)
  for (let i = 0; i < n; i++) g().tickHealth(step, terrain, lat, lon)
}

describe('defaults (design.md §6)', () => {
  it('starts at full health with a full canteen and no afflictions', () => {
    expect(g().health).toBe(100)
    expect(g().canteenFill).toBe(1)
    expect(g().dryDays).toBe(0)
    expect(g().afflictions).toEqual({ fever: false, dehydration: false, sunblind: false, wounds: 0 })
    // Health/canteen balance defaults (design.md §6/§21).
    expect(balance.health.max).toBe(100)
    expect(balance.health.canteenCapacity).toBe(500)
    expect(balance.health.dehydrationOnsetDays).toBe(0.5)
  })
})

describe('canteen and dehydration (design.md §6)', () => {
  it('the canteen drains away from fresh water, faster in the desert', () => {
    expect(terrainAt(...COORD.savanna)).toBe('savanna')
    expect(terrainAt(...COORD.desert)).toBe('desert')

    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 100, foodDays: 500 })
    tick('savanna', ...COORD.savanna, 100)
    const savannaFill = g().canteenFill

    freshGame()
    balance.randomEventsEnabled = false
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 100, foodDays: 500 })
    tick('desert', ...COORD.desert, 100)
    const desertFill = g().canteenFill

    expect(savannaFill).toBeLessThan(1) // it drains away from water
    expect(desertFill).toBeLessThan(savannaFill) // and faster in the desert
  })

  it('an empty canteen builds thirst, then dehydration and health loss', () => {
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 0.001, dryDays: 0, health: 100, foodDays: 300 })
    tick('desert', ...COORD.desert, 6, 0.1)
    expect(g().afflictions.dehydration).toBe(true)
    expect(g().health).toBeLessThan(100)
  })

  it('a short dry stretch does not trigger dehydration; a longer one does, then a canteen recovers it', () => {
    // No canteen: thirst builds directly. A short stretch stays below onset.
    useGame.setState({ health: 100, foodDays: 300, dryDays: 0 })
    tick('desert', ...COORD.desert, 0.3, 0.1)
    expect(g().afflictions.dehydration).toBe(false)
    expect(countKey('journal.dehydrationOn')).toBe(0)

    // Past the onset the affliction sets in and the journal reports the thirst.
    tick('desert', ...COORD.desert, 0.4, 0.1)
    expect(g().afflictions.dehydration).toBe(true)
    expect(g().health).toBeLessThan(100)
    expect(countKey('journal.dehydrationOn')).toBe(1)

    // A canteen (its default fill is a reserve) ends the dehydration.
    g().debugAddEquipment('canteen')
    tick('desert', ...COORD.desert, 0.1, 0.1)
    expect(g().afflictions.dehydration).toBe(false)
    expect(countKey('journal.dehydrationOver')).toBe(1)
  })

  it('fresh water in reach counts as drinking: a lake shore never triggers thirst', () => {
    // Lake Victoria shore (savanna ground, lake within reach): even without a
    // canteen the thirst never builds, so following the water never triggers it.
    const [lat, lon] = [-1.4, 33.9]
    useGame.setState({ equipment: {}, canteenFill: 1, dryDays: 0, health: 100, foodDays: 300 })
    const before = countKey('journal.dehydrationOn')
    tick('savanna', lat, lon, 20, 0.5)
    expect(g().afflictions.dehydration).toBe(false)
    expect(g().dryDays).toBe(0)
    expect(countKey('journal.dehydrationOn')).toBe(before)
  })

  it('fresh water refills the canteen to full', () => {
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 0.2, dryDays: 3 })
    g().tickHealth(0.1, 'water', 0, 0) // drinking at fresh water
    expect(g().canteenFill).toBe(1)
    expect(g().dryDays).toBe(0)
  })
})

describe('afflictions, drains and regeneration (design.md §6/§15)', () => {
  it('fever drains health, and medicine cures it and is consumed', () => {
    g().debugAddEquipment('canteen') // keep dehydration out of this check
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 80, foodDays: 300 })
    g().debugSetAffliction('fever', true)
    tick('savanna', ...COORD.savanna, 2)
    expect(g().health).toBeLessThan(80)

    g().debugAddEquipment('medicine')
    const medBefore = g().equipment.medicine ?? 0
    g().useMedicine()
    expect(g().afflictions.fever).toBe(false)
    expect(g().equipment.medicine).toBe(medBefore - 1)
    expect(journalKeys()).toContain('journal.medicineUsed')
  })

  it('medicine also cures wounds', () => {
    g().debugAddEquipment('medicine')
    g().debugSetAffliction('wounds', 2)
    g().useMedicine()
    expect(g().afflictions.wounds).toBe(0)
  })

  it('starvation drains health while foodDays is zero', () => {
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 100, foodDays: 0 })
    tick('savanna', ...COORD.savanna, 1)
    expect(g().health).toBeLessThan(100)
  })

  it('health regenerates while fed and affliction-free', () => {
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 50, foodDays: 30 })
    tick('savanna', ...COORD.savanna, 3)
    expect(g().health).toBeGreaterThan(50)
  })

  it('a light wound heals on its own while fed (no medicine needed)', () => {
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 100, foodDays: 300 })
    g().debugSetAffliction('wounds', 1)
    // Past woundHealLightDays (6) of fed travel the wound closes by itself.
    tick('savanna', ...COORD.savanna, 7)
    expect(g().afflictions.wounds).toBe(0)
    expect(journalKeys()).toContain('journal.woundHealed')
    expect(g().health).toBeGreaterThan(0) // the light drain never came close to killing
    // And with the wound gone, health regenerates again.
    const h = g().health
    tick('savanna', ...COORD.savanna, 2)
    expect(g().health).toBeGreaterThan(h)
  })

  it('a severe wound eases to a light one, then closes (staged healing)', () => {
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 100, foodDays: 300 })
    g().debugSetAffliction('wounds', 2)
    tick('savanna', ...COORD.savanna, 11) // past woundHealSevereDays (10)
    expect(g().afflictions.wounds).toBe(1)
    expect(journalKeys()).toContain('journal.woundEased')
    tick('savanna', ...COORD.savanna, 7) // past woundHealLightDays (6)
    expect(g().afflictions.wounds).toBe(0)
    expect(journalKeys()).toContain('journal.woundHealed')
  })

  it('wounds do not heal while starving', () => {
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 100, foodDays: 0 })
    g().debugSetAffliction('wounds', 1)
    tick('savanna', ...COORD.savanna, 8)
    expect(g().afflictions.wounds).toBe(1) // no rations, no mending
  })

  it('sun blindness heals only outside the desert', () => {
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 100, foodDays: 300 })
    g().debugSetAffliction('sunblind', true)
    // In the desert it does not heal (only the veil, DOM-side, is skipped here).
    tick('desert', ...COORD.desert, 3)
    expect(g().afflictions.sunblind).toBe(true)
    // Outside the desert it recovers past sunblindRecoveryDays and reports it.
    tick('savanna', ...COORD.savanna, 4)
    expect(g().afflictions.sunblind).toBe(false)
    expect(journalKeys()).toContain('journal.sunblindOver')
  })
})

describe('death and successor (design.md §15/§18)', () => {
  it('zero health loses the expedition with a cause, and the journal falls silent', () => {
    g().debugAddEquipment('canteen') // isolate the wounds drain from dehydration
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 3, foodDays: 300 })
    g().debugSetAffliction('wounds', 2) // severe wounds → fatal drain
    const before = g().journal.length
    g().tickHealth(1, 'savanna', ...COORD.savanna)
    expect(g().defeat).toBe('death')
    expect(g().deathCause).toBe('wounds')
    expect(g().journalOpen).toBe(false)
    expect(g().journal.length).toBe(before) // no new entry — the remains report takes over
  })

  it('a successor continues from the last checkpoint with its health, minus the day penalty', () => {
    // Checkpoint a known state (a port visit saves one; here directly).
    useGame.setState({ health: 70, foodDays: 40, day: 200 })
    g().saveCheckpoint()
    const checkpointDay = g().day
    g().leavePlace()

    // Die in the field.
    g().debugAddEquipment('canteen')
    useGame.setState({ canteenFill: 1, dryDays: 0, health: 2, foodDays: 300 })
    g().debugSetAffliction('wounds', 2)
    g().tickHealth(1, 'savanna', ...COORD.savanna)
    expect(g().defeat).toBe('death')

    // The successor resumes from the checkpoint.
    expect(g().successorTakeOver()).toBe(true)
    expect(g().defeat).toBeNull()
    expect(g().placeId).toBe('cairo')
    expect(g().health).toBe(70)
    expect(g().day).toBe(checkpointDay + balance.deadline.successorDayPenalty)
    expect(journalKeys()).toContain('journal.successor')
  })
})
