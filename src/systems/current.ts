// The river current as it acts on the traveller (design.md §11/§11.3): the
// passive downstream drift and the swim speed it competes with. Both live here
// as ONE formula, because the balance between them is a gameplay INVARIANT
// (point 316): wherever the drift beats the swim speed inside water fenced in
// by impassable ocean, the traveller is softlocked. The store applies these
// values while travelling, and the sea-mouth escapability sweep measures the
// same ones — so a calibration change can never make the sweep test a
// different world than the one the player swims in.

import { balance } from '../config/balance'
import { UNITS_PER_DEGREE } from '../world/geo'
import { riverFlow } from '../world/geoIndex'
import { WATERFALLS } from '../world/data/landmarks'

/** Terrain cost of a water tile — swum, or paddled with the canoe (design.md §11). */
export function waterTravelCost(hasCanoe: boolean): number {
  return hasCanoe ? balance.terrainCost.water / balance.canoeSpeedup : balance.terrainCost.water
}

/**
 * How fast the traveller moves under his OWN power on water, in degrees per
 * second — the same speed the overland move derives from the water terrain
 * cost, converted out of world units so it compares directly with the drift.
 */
export function swimSpeedDegPerSecond(hasCanoe = false): number {
  const speed = balance.travelSpeed / Math.max(0.25, waterTravelCost(hasCanoe))
  return speed / UNITS_PER_DEGREE
}

/** The waterfall boost on the current at a point (design.md §11/§4.4). */
export function waterfallBoostAt(lat: number, lon: number): number {
  let boost = 1
  for (const wf of WATERFALLS) {
    const d = Math.hypot(lat - wf.lat, lon - wf.lon)
    if (d < balance.currentWaterfallRadius) {
      boost = Math.max(boost, 1 + (balance.currentWaterfallBoost - 1) * (1 - d / balance.currentWaterfallRadius))
    }
  }
  return boost
}

/**
 * The passive current drift at a point, in degrees per second (design.md §11):
 * the nearest river's downstream direction times its strength, boosted near a
 * waterfall and scaled by how much the traveller is at the water's mercy — a
 * canoe rides the current under control, a swimmer is carried by it. Zero off
 * the rivers, and zero in a sea mouth's slack water (world/riverMouths.ts).
 */
export function currentDriftDegPerSecond(lat: number, lon: number, hasCanoe: boolean): { lat: number; lon: number } {
  const flow = riverFlow(lat, lon)
  if (flow.strength <= 0) return { lat: 0, lon: 0 }
  const susceptibility = hasCanoe ? 0.5 : 1.6
  const speed = flow.strength * balance.currentDrift * waterfallBoostAt(lat, lon) * susceptibility
  return { lat: flow.dirLat * speed, lon: flow.dirLon * speed }
}
