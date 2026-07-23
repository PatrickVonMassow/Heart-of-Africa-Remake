// Water-edge placement rules (design.md §11/§19): channels stay clear of
// solid dressing, reeds hug the waterline, and drinkers walk only to the
// bank — a bather one small wade past it, never mid-channel.
import { describe, it, expect } from 'vitest'
import { RIVER_WIDTH_DEG } from '../../world/terrain'
import {
  inReedBelt,
  solidDressingAllowed,
  drinkWalkDistance,
  crocodileNeedsReanchor,
  CHANNEL_CLEARANCE_DEG,
  BANK_GAP_DEG,
  BATHE_WADE_DEG,
} from './waterEdgeRules'
import { crocodileAllowedAt } from './wildlifeBehavior'

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

  it('the channel-clearance edge is exact (point 173 hardening): < blocks, === allows', () => {
    const edge = RIVER_WIDTH_DEG + CHANNEL_CLEARANCE_DEG
    expect(solidDressingAllowed('savanna', edge, 1)).toBe(true) // exactly at the edge: clear
    expect(solidDressingAllowed('savanna', edge - 1e-9, 1)).toBe(false) // a hair short: blocked
  })

  it('the lake shore edge is exact: exactly 0.05 is allowed, a hair under it is blocked', () => {
    expect(solidDressingAllowed('savanna', 1, 0.05)).toBe(true)
    expect(solidDressingAllowed('savanna', 1, 0.05 - 1e-9)).toBe(false)
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

  it('the river band edges are exact (point 173 hardening): > inner, < outer', () => {
    const inner = RIVER_WIDTH_DEG - 0.03
    const outer = RIVER_WIDTH_DEG + 0.045
    expect(inReedBelt(inner, 1)).toBe(false) // exactly at the inner edge: not yet inside
    expect(inReedBelt(inner + 1e-9, 1)).toBe(true) // a hair past it: inside
    expect(inReedBelt(outer, 1)).toBe(false) // exactly at the outer edge: no longer inside
    expect(inReedBelt(outer - 1e-9, 1)).toBe(true) // a hair short of it: inside
  })

  it('the lake shore edge is exact: at 0.04 it is out, a hair under it is in', () => {
    expect(inReedBelt(1, 0.04)).toBe(false)
    expect(inReedBelt(1, 0.04 - 1e-9)).toBe(true)
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

describe('crocodileNeedsReanchor (a resting crocodile must be ON water, design.md §19.16 point 242)', () => {
  it('a crocodile on river/lake water is at home — no re-anchor', () => {
    expect(crocodileNeedsReanchor('water')).toBe(false)
  })

  it('a crocodile beached on any bank/sand/land cell must be re-anchored to water', () => {
    // The point-218 river widening can leave a once-water spawn cell reading as
    // bank/sand, stranding the ambusher flat and exposed — every non-water cell
    // triggers the relocation back to the nearest river/lake water.
    for (const t of ['coast', 'sand', 'desert', 'savanna', 'jungle', 'mountain', 'land']) {
      expect(crocodileNeedsReanchor(t), t).toBe(true)
    }
  })

  it('the ocean is never a crocodile home either — re-anchor away from it', () => {
    expect(crocodileNeedsReanchor('ocean')).toBe(true)
  })

  it('mirrors crocodileAllowedAt: needs-reanchor is the negation of allowed-at', () => {
    for (const t of ['water', 'ocean', 'coast', 'desert', 'savanna', 'jungle', 'mountain']) {
      expect(crocodileNeedsReanchor(t), t).toBe(!crocodileAllowedAt(t))
    }
  })
})
