// Water-edge placement rules (design.md §11/§19): channels stay clear of
// solid dressing, reeds hug the waterline, and drinkers walk only to the
// bank — a bather one small wade past it, never mid-channel.
import { describe, it, expect } from 'vitest'
import { RIVER_WIDTH_DEG } from '../../world/terrain'
import {
  inReedBelt,
  solidDressingAllowed,
  drinkWalkDistance,
  CHANNEL_CLEARANCE_DEG,
  BANK_GAP_DEG,
  BATHE_WADE_DEG,
} from './waterEdgeRules'

const WATERLINE = RIVER_WIDTH_DEG - 0.005 // river water reaches to here (terrain cut)

describe('solidDressingAllowed (trees/boulders keep the channel clear)', () => {
  it('rejects water and ocean cells outright', () => {
    expect(solidDressingAllowed('water', 1, 1)).toBe(false)
    expect(solidDressingAllowed('ocean', 1, 1)).toBe(false)
  })

  it('rejects land hard against the river (canopy would reach the ribbon)', () => {
    expect(solidDressingAllowed('desert', RIVER_WIDTH_DEG + 0.01, 1)).toBe(false)
    expect(solidDressingAllowed('savanna', RIVER_WIDTH_DEG + CHANNEL_CLEARANCE_DEG - 0.001, 1)).toBe(false)
  })

  it('allows land clear of the channel', () => {
    expect(solidDressingAllowed('desert', RIVER_WIDTH_DEG + CHANNEL_CLEARANCE_DEG + 0.001, 1)).toBe(true)
    expect(solidDressingAllowed('savanna', 0.5, 1)).toBe(true)
  })

  it('rejects the lake shore band', () => {
    expect(solidDressingAllowed('savanna', 1, 0.04)).toBe(false)
    expect(solidDressingAllowed('savanna', 1, 0.06)).toBe(true)
  })
})

describe('inReedBelt (papyrus hugs the waterline)', () => {
  it('accepts the band around the river waterline, not the mid-channel', () => {
    expect(inReedBelt(RIVER_WIDTH_DEG, 1)).toBe(true) // right at the line
    expect(inReedBelt(0.05, 1)).toBe(false) // near the axis — mid-channel
    expect(inReedBelt(0.0, 1)).toBe(false)
    expect(inReedBelt(RIVER_WIDTH_DEG + 0.1, 1)).toBe(false) // dry land
  })

  it('accepts the lake shore band', () => {
    expect(inReedBelt(1, 0.02)).toBe(true)
    expect(inReedBelt(1, 0.1)).toBe(false)
  })
})

describe('drinkWalkDistance (to the bank, never into the channel)', () => {
  it('a river drinker ends short of the waterline (on the bank)', () => {
    // Spawn distances derive from the (calibratable) waterline so the fixture
    // always starts on land, whatever the river width factor (point 136).
    for (const rd of [WATERLINE + 0.03, WATERLINE + 0.08, WATERLINE + 0.13]) {
      const walk = drinkWalkDistance(rd, 99, false)
      const endAxisDist = rd - walk
      expect(endAxisDist, `rd ${rd}`).toBeGreaterThan(WATERLINE) // still on land
      expect(endAxisDist, `rd ${rd}`).toBeCloseTo(WATERLINE + BANK_GAP_DEG, 6)
    }
  })

  it('a river bather wades a small step past the bank — not mid-channel', () => {
    for (const rd of [WATERLINE + 0.03, WATERLINE + 0.13]) {
      const walk = drinkWalkDistance(rd, 99, true)
      const endAxisDist = rd - walk
      expect(endAxisDist, `rd ${rd}`).toBeLessThan(WATERLINE) // in the water
      expect(endAxisDist, `rd ${rd}`).toBeGreaterThan(WATERLINE / 2) // nowhere near the axis
      expect(endAxisDist).toBeCloseTo(WATERLINE + BANK_GAP_DEG - BATHE_WADE_DEG, 6)
    }
  })

  it('a lake drinker stops on the land side of the shore, a bather just past it', () => {
    const walkDrink = drinkWalkDistance(99, 0.2, false)
    expect(0.2 - walkDrink).toBeCloseTo(BANK_GAP_DEG, 6) // shore-side stop
    const walkBathe = drinkWalkDistance(99, 0.2, true)
    expect(0.2 - walkBathe).toBeCloseTo(BANK_GAP_DEG - BATHE_WADE_DEG, 6) // shallow water
  })

  it('never walks a negative distance (spawn already at the bank)', () => {
    expect(drinkWalkDistance(RIVER_WIDTH_DEG, 99, false)).toBeGreaterThanOrEqual(0)
    expect(drinkWalkDistance(99, 0.005, false)).toBeGreaterThanOrEqual(0)
  })
})
