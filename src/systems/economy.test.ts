// Pure trade-economy logic (CLAUDE.md §7.1 pt. 25, design.md §8/§9/§10). Ported
// from the window.__economy / window.__balance pure asserts of
// scripts/verify/economy.mjs — same coverage, no browser. Store-driven bazaar
// and ferry flows live in the store test.
import { describe, it, expect } from 'vitest'
import { balance } from '../config/balance'
import {
  PLACES, REGION_VALUES, regionAt,
  type PlaceDef, type RegionId,
} from '../world/geo'
import { isBlocked, sampleTerrain } from '../world/terrain'
import { withWorld } from '../test/store'
import {
  regionalFactor, treasureBid, treasureBuyPrice, ferryCost, ferryDays,
  generateTreasureSites, LANDMARK_POINTS, TREASURE_IDS,
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

describe('bazaar haggling band (design.md §10)', () => {
  it('the bid stays within ±bidVariance of the rand-0.5 mean', () => {
    const e = balance.economy
    // The bid is base × factor × sellSpread × (1 + (rand-0.5)·2·bidVariance),
    // so rand 0/1 are the extremes of the ±bidVariance haggling band.
    const raw = e.treasureBase.gold * e.reveredFactor * e.sellSpread
    const mean = treasureBid('gold', 'north', () => 0.5)!
    const low = treasureBid('gold', 'north', () => 0)!
    const high = treasureBid('gold', 'north', () => 1)!
    expect(mean).toBe(Math.round(raw))
    expect(low).toBe(Math.max(1, Math.round(raw * (1 - e.bidVariance))))
    expect(high).toBe(Math.max(1, Math.round(raw * (1 + e.bidVariance))))
    expect(low).toBeLessThan(mean)
    expect(high).toBeGreaterThan(mean)
  })

  it('the buy price still tops the highest bid for a neutral material', () => {
    // copper is neutral in the north (factor 1): buy is 1.25×base, the best
    // possible bid only 0.85×1.15×base — the spread holds even without reverence.
    const buy = treasureBuyPrice('copper', 'north')
    const topBid = treasureBid('copper', 'north', () => 1)
    expect(buy).not.toBeNull()
    expect(topBid).not.toBeNull()
    expect(buy!).toBeGreaterThan(topBid!)
  })
})

describe('ferry symmetry (design.md §10)', () => {
  it.each([
    ['cairo', 'zanzibar'],
    ['capetown', 'lagos'],
    ['tangier', 'berbera'],
    ['boma', 'khartoum'],
  ])('the fare and duration are route-symmetric (%s ↔ %s)', (a, b) => {
    expect(ferryCost(port(a), port(b))).toBe(ferryCost(port(b), port(a)))
    expect(ferryDays(port(a), port(b))).toBe(ferryDays(port(b), port(a)))
  })
})

describe('regionalFactor matrix (design.md §8)', () => {
  const REGIONS: RegionId[] = ['north', 'west', 'central', 'east', 'south']
  const cases = REGIONS.flatMap((region) => TREASURE_IDS.map((treasure) => ({ region, treasure })))
  it.each(cases)('$treasure in $region follows the value matrix', ({ region, treasure }) => {
    const f = regionalFactor(treasure, region)
    if (treasure === 'statue') {
      // The statue is coveted everywhere, never rejected.
      expect(f).toBe(balance.economy.reveredFactor)
      return
    }
    const v = REGION_VALUES[region]
    if (v.rejected.includes(treasure)) expect(f).toBeNull()
    else if (v.revered.includes(treasure)) expect(f).toBe(balance.economy.reveredFactor)
    else expect(f).toBe(1)
  })
})

describe('generateTreasureSites invariants (design.md §18)', () => {
  // Needs the real DEM so terrain classification (land/water) is authentic.
  withWorld()
  const SEED = 12345
  const REGIONS: RegionId[] = ['north', 'west', 'central', 'east', 'south']
  // Rounding to 0.1° happens after the ≥1° clearance check, so a rounded coord
  // can shift by up to Math.hypot(0.05, 0.05) ≈ 0.0707° in either bound.
  const ROUND_SLACK = Math.hypot(0.05, 0.05)

  it('the five regional caches sit inside their region on non-water land', () => {
    const regional = generateTreasureSites(SEED).slice(0, 5) // regions in fixed order; statue is last
    regional.forEach((s, i) => {
      expect(regionAt(s.lat, s.lon)).toBe(REGIONS[i])
      const t = sampleTerrain(s.lat, s.lon, SEED)
      expect(t.type).not.toBe('water')
      expect(isBlocked(t.type, s.lat, s.lon)).toBe(false)
    })
  })

  it('every site keeps clear of settlements and rounds to 0.1°', () => {
    for (const s of generateTreasureSites(SEED)) {
      expect(s.lat).toBe(Math.round(s.lat * 10) / 10)
      expect(s.lon).toBe(Math.round(s.lon * 10) / 10)
      for (const p of PLACES) {
        expect(Math.hypot(p.lat - s.lat, p.lon - s.lon)).toBeGreaterThanOrEqual(1 - ROUND_SLACK)
      }
    }
  })
})
