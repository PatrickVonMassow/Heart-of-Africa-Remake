// The grounds a village's scenes play on, as the boundary sees them
// (work-order 1252): each one a disc enclosing its whole extent, so
// `boundary.ts` can keep `balance.observerMargin` of walkable room around it.
// Pure data, derived from the finished layout — never a second position.

import type { ObservedGround } from './boundary'
import { BANK_PLAY_LANE_HALF, type BankPoint } from './riverBank'
import { stationGround, type LoomStation } from './loom'
import { digLocalToWorld, DIG_RIM_DISTANCE, spoilCentre, SPOIL_RADIUS_X } from './placeGround'
import { digFurnitureFootprints } from './digSiteAppearance'
import { WALKER_RADIUS } from './collision'
import { JOIN_STAND_OFF } from './adultWork'
import { balance } from '../../config/balance'

/** Where the chief's door stands off his hut's centre (`buildLayout`'s
 *  `hutDoor`); he is met there. */
export const CHIEF_DOOR_REACH = 3.9

export interface SceneGroundSource {
  playGround: { x: number; z: number; radius: number } | null
  playRocks: { upstream: BankPoint; downstream: BankPoint; r: number } | null
  digSites: ReadonlyArray<{ x: number; z: number; kind: 'pit' | 'postHole' | 'patch'; rotation?: number }>
  waterPath: { head: BankPoint; foot: BankPoint; fill: BankPoint } | null
  waterStand: BankPoint | null
  loom: LoomStation | null
  /** The chief's hut centre, where the settlement has one. */
  chief: readonly [number, number] | null
}

/** Smallest disc about `centre` that holds every given disc. */
function enclose(cx: number, cz: number, parts: ReadonlyArray<{ x: number; z: number; r: number }>): ObservedGround {
  let r = 0
  for (const p of parts) r = Math.max(r, Math.hypot(p.x - cx, p.z - cz) + p.r)
  return { x: cx, z: cz, r }
}

export function sceneGrounds(src: SceneGroundSource): ObservedGround[] {
  const out: ObservedGround[] = []
  // The children's roaming quarter.
  if (src.playGround) out.push({ x: src.playGround.x, z: src.playGround.z, r: src.playGround.radius })
  // The bank game's stage: both rocks and the lane run between them.
  if (src.playRocks) {
    const { upstream: u, downstream: d } = src.playRocks
    const r = Math.max(src.playRocks.r, BANK_PLAY_LANE_HALF)
    out.push(enclose((u.x + d.x) / 2, (u.z + d.z) / 2, [{ ...u, r }, { ...d, r }]))
  }
  // Adult work: each dig site with its spoil, furniture and the diggers' ring.
  for (const site of src.digSites) {
    const heap = spoilCentre(site)
    const parts = [
      { x: heap.x, z: heap.z, r: SPOIL_RADIUS_X },
      { x: site.x, z: site.z, r: DIG_RIM_DISTANCE + WALKER_RADIUS },
      ...digFurnitureFootprints(site.kind).map((f) => ({ ...digLocalToWorld(site, f.x, f.z), r: f.radius })),
    ]
    out.push(enclose(site.x, site.z, parts))
  }
  // The water errand: the stand with its working ring, and the path's stops.
  if (src.waterStand) out.push({ x: src.waterStand.x, z: src.waterStand.z, r: JOIN_STAND_OFF + WALKER_RADIUS })
  if (src.waterPath) {
    for (const p of [src.waterPath.head, src.waterPath.foot, src.waterPath.fill]) out.push({ x: p.x, z: p.z, r: WALKER_RADIUS })
  }
  // The loom, warp, weaver and helper's walk together.
  if (src.loom) out.push(enclose(src.loom.seat.x, src.loom.seat.z, stationGround(src.loom, balance.villageLife.loom)))
  // The chief's hut and the door he is met at.
  if (src.chief) out.push({ x: src.chief[0], z: src.chief[1], r: CHIEF_DOOR_REACH + WALKER_RADIUS })
  return out
}
