// Balance defaults (CLAUDE.md §7.1 pt. 20, design.md §21). Ports the
// balance-default asserts of settings.mjs (window.__balance) into direct
// imports — same coverage, no browser. Runtime-editability of these fields via
// the debug menu is covered by src/ui/DebugMenu.test.tsx.
import { describe, it, expect } from 'vitest'
import { balance, START_MONEY, START_FOOD_DAYS, START_GIFTS } from './balance'

describe('comfort & control defaults (user calibration)', () => {
  it('mouse, walk, strafe, ambience and travel speed', () => {
    expect(balance.mouseSensitivity).toBe(0.0011)
    expect(balance.placeWalkSpeed).toBe(10)
    expect(balance.placeStrafeFactor).toBe(0.8)
    expect(balance.ambienceVolume).toBe(0.1)
    expect(balance.travelSpeed).toBe(5.6)
  })
})

describe('terrain relief factors (design.md §11)', () => {
  it('canoe speed-up and the jungle/mountain/canoe-land penalties', () => {
    expect(balance.canoeSpeedup).toBe(2)
    expect(balance.junglePenalty).toBeCloseTo(2.3, 5)
    expect(balance.mountainPenalty).toBeCloseTo(1.67, 5)
    expect(balance.canoeLandPenalty).toBe(2.5)
  })
})

describe('canteen and re-entry (design.md §6/§2)', () => {
  it('canteen capacity and the re-entry clearance margin', () => {
    expect(balance.health.canteenCapacity).toBe(500)
    expect(balance.placeReentryMargin).toBe(2)
  })
})

describe('fixed design values (not tunable)', () => {
  it('starting money, provisions and gifts', () => {
    expect(START_MONEY).toBe(250)
    expect(START_FOOD_DAYS).toBe(35)
    expect(START_GIFTS).toBe(2)
  })
})
