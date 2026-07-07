// Economy (design.md §8/§9/§10): treasure finds as items, bazaar bids with
// regional value factors (arbitrage), ferry passages between ports and
// discovery bounties. This module is pure — the store applies the results.

import { balance } from '../config/balance'
import type { LatLon, Material, RegionId } from '../world/geo'
import { PLACES, REGION_VALUES, regionAt, type PlaceDef } from '../world/geo'
import { isBlocked, sampleTerrain } from '../world/terrain'
import { mulberry32 } from '../world/noise'
import { ELEPHANT_GRAVEYARD, MOUNTAINS, WATERFALLS } from '../world/data/landmarks'
import { LAKES } from '../world/data/lakes'

/** Treasure finds/valuables (design.md §8): the matrix materials plus the statue. */
export type TreasureId = Material | 'statue'

export const TREASURE_IDS: TreasureId[] = ['gold', 'silver', 'emerald', 'copper', 'ivory', 'statue']

/** The statue is precious everywhere; materials follow the region matrix. */
function materialOf(treasure: TreasureId): Material | null {
  return treasure === 'statue' ? null : treasure
}

/** Regional value factor (design.md §8); null = rejected, not traded here. */
export function regionalFactor(treasure: TreasureId, region: RegionId): number | null {
  const m = materialOf(treasure)
  if (m === null) return balance.economy.reveredFactor // statue: coveted everywhere
  const values = REGION_VALUES[region]
  if (values.rejected.includes(m)) return null
  return values.revered.includes(m) ? balance.economy.reveredFactor : 1
}

/**
 * Bazaar bid for an offered treasure (design.md §10): base price × regional
 * factor × sell spread, with a small haggling variance. Null = rejected.
 */
export function treasureBid(treasure: TreasureId, region: RegionId, rand: () => number): number | null {
  const factor = regionalFactor(treasure, region)
  if (factor === null) return null
  const e = balance.economy
  const variance = 1 + (rand() - 0.5) * 2 * e.bidVariance
  return Math.max(1, Math.round(e.treasureBase[treasure] * factor * e.sellSpread * variance))
}

/** Bazaar asking price when buying a treasure; null = not stocked (rejected). */
export function treasureBuyPrice(treasure: TreasureId, region: RegionId): number | null {
  const factor = regionalFactor(treasure, region)
  if (factor === null) return null
  return Math.round(balance.economy.treasureBase[treasure] * factor * balance.economy.buySpread)
}

/** Straight-line distance between two places in degrees (route measure). */
function placeDistanceDeg(a: PlaceDef, b: PlaceDef): number {
  return Math.hypot(a.lat - b.lat, a.lon - b.lon)
}

/** Ferry fare between two ports (design.md §10). */
export function ferryCost(from: PlaceDef, to: PlaceDef): number {
  const e = balance.economy
  return Math.round(e.ferryMinCost + placeDistanceDeg(from, to) * e.ferryCostPerDeg)
}

/** Passage duration in days — much faster than the same route overland. */
export function ferryDays(from: PlaceDef, to: PlaceDef): number {
  const e = balance.economy
  return Math.round(e.ferryMinDays + placeDistanceDeg(from, to) * e.ferryDaysPerDeg)
}

export interface TreasureSite {
  lat: number
  lon: number
  treasure: TreasureId
  dug: boolean
}

/**
 * Buried treasures, placed procedurally per run (design.md §18): one cache
 * per region plus one statue site. Coordinates are rounded to 0.1° like the
 * grave so future hint texts can reference them exactly.
 */
export function generateTreasureSites(seed: number): TreasureSite[] {
  const rand = mulberry32((seed ^ 0x7ea5) >>> 0)
  const sites: TreasureSite[] = []
  const regions: RegionId[] = ['north', 'west', 'central', 'east', 'south']
  const wanted: Array<{ region: RegionId | null; treasure: TreasureId }> = [
    ...regions.map((region) => ({
      region,
      // A material the region does not reject — worth carrying elsewhere.
      treasure: REGION_VALUES[region].revered[Math.floor(rand() * REGION_VALUES[region].revered.length)],
    })),
    { region: null, treasure: 'statue' as TreasureId },
  ]
  for (const w of wanted) {
    for (let i = 0; i < 400; i++) {
      const lat = -34 + rand() * 68
      const lon = -17 + rand() * 68
      if (w.region && regionAt(lat, lon) !== w.region) continue
      const t = sampleTerrain(lat, lon, seed)
      if (t.type === 'water' || isBlocked(t.type, lat, lon)) continue
      // Keep a clear margin to settlements so sites are found by hints, not luck.
      if (PLACES.some((p) => Math.hypot(p.lat - lat, p.lon - lon) < 1)) continue
      sites.push({ lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10, treasure: w.treasure, dug: false })
      break
    }
  }
  return sites
}

export interface LandmarkPoint extends LatLon {
  id: string
}

/** All bounty-relevant landmark positions (design.md §10 discovery bounty). */
export const LANDMARK_POINTS: LandmarkPoint[] = [
  ...MOUNTAINS.map((m) => ({ id: m.id, lat: m.lat, lon: m.lon })),
  ...WATERFALLS.map((w) => ({ id: w.id, lat: w.lat, lon: w.lon })),
  ...LAKES.map((l) => ({ id: l.id, lat: l.center[1], lon: l.center[0] })),
  { id: ELEPHANT_GRAVEYARD.id, lat: ELEPHANT_GRAVEYARD.lat, lon: ELEPHANT_GRAVEYARD.lon },
]

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__economy = {
    regionalFactor, treasureBid, treasureBuyPrice, ferryCost, ferryDays, LANDMARK_POINTS,
  }
}
