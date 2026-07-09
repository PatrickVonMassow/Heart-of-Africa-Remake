// Pure trade-economy logic (CLAUDE.md §7.1 pt. 25, design.md §8/§9/§10). Ported
// from the window.__economy / window.__balance pure asserts of
// scripts/verify/economy.mjs — same coverage, no browser. Store-driven bazaar
// and ferry flows live in the store test.
import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import { PLACES, type PlaceDef } from '../world/geo'
import {
  regionalFactor, treasureBid, treasureBuyPrice, ferryCost, ferryDays,
  generateTreasureSites, LANDMARK_POINTS,
} from './economy'

const port = (id: string): PlaceDef => {
  const p = PLACES.find((x) => x.id === id)
  if (!p) throw new Error(`no place ${id}`)
  return p
}

describe('regionalFactor (design.md §8)', () => {
  it('ranks revered > neutral and refuses rejected materials', () => {
    const revered = regionalFactor('gold', 'north')
    const neutral = regionalFactor('gold', 'west')
    expect(revered).not.toBeNull()
    expect(neutral).not.toBeNull()
    expect(revered!).toBeGreaterThan(neutral!)
    expect(regionalFactor('gold', 'central')).toBeNull()
  })

  it('the statue is coveted everywhere', () => {
    expect(regionalFactor('statue', 'central')).toBeGreaterThan(1)
    expect(regionalFactor('statue', 'north')).toBe(balance.economy.reveredFactor)
  })
})

describe('bazaar pricing (design.md §10)', () => {
  it('a rejected material draws no bid', () => {
    expect(treasureBid('gold', 'central', () => 0.5)).toBeNull()
    expect(treasureBuyPrice('gold', 'central')).toBeNull()
  })

  it('the bid applies base × regional factor × sell spread', () => {
    const e = balance.economy
    // rand 0.5 → zero haggling variance, so the price is exactly the formula.
    const expected = Math.max(1, Math.round(e.treasureBase.gold * e.reveredFactor * e.sellSpread))
    expect(treasureBid('gold', 'north', () => 0.5)).toBe(expected)
  })

  it('the buy price applies the buy spread and stays above the bid', () => {
    const e = balance.economy
    expect(treasureBuyPrice('gold', 'north')).toBe(Math.round(e.treasureBase.gold * e.reveredFactor * e.buySpread))
    expect(treasureBuyPrice('gold', 'north')!).toBeGreaterThan(treasureBid('gold', 'north', () => 0.5)!)
  })
})

describe('ferry (design.md §10)', () => {
  it('fare and duration grow with the route distance', () => {
    const from = port('cairo')
    const to = port('zanzibar')
    const dist = Math.hypot(from.lat - to.lat, from.lon - to.lon)
    const e = balance.economy
    expect(ferryCost(from, to)).toBe(Math.round(e.ferryMinCost + dist * e.ferryCostPerDeg))
    expect(ferryDays(from, to)).toBe(Math.round(e.ferryMinDays + dist * e.ferryDaysPerDeg))
    // A far port costs more than a near one.
    const near = PLACES.filter((p) => p.kind === 'port').sort(
      (a, b) => Math.hypot(a.lat - from.lat, a.lon - from.lon) - Math.hypot(b.lat - from.lat, b.lon - from.lon),
    )[1]
    expect(ferryCost(from, to)).toBeGreaterThan(ferryCost(from, near))
  })
})

describe('generateTreasureSites (design.md §18)', () => {
  it('places one cache per region plus one statue site, all on dry land', () => {
    const sites = generateTreasureSites(12345)
    expect(sites.length).toBe(6)
    expect(sites.filter((s) => s.treasure === 'statue').length).toBe(1)
    expect(sites.every((s) => s.dug === false)).toBe(true)
  })

  it('is deterministic for a given seed', () => {
    expect(generateTreasureSites(999)).toEqual(generateTreasureSites(999))
    expect(generateTreasureSites(1)).not.toEqual(generateTreasureSites(2))
  })
})

describe('LANDMARK_POINTS (discovery bounties)', () => {
  it('collects the mountains, waterfalls, lakes and the graveyard', () => {
    expect(LANDMARK_POINTS.length).toBeGreaterThan(5)
    expect(LANDMARK_POINTS.every((p) => typeof p.lat === 'number' && typeof p.lon === 'number')).toBe(true)
    expect(LANDMARK_POINTS.some((p) => p.id === 'kilimanjaro')).toBe(true)
  })
})
