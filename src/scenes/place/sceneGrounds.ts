// The grounds a village's scenes play on, as the boundary sees them
// (work-order 1252): each one a disc enclosing its whole extent, so
// `boundary.ts` can keep `balance.observerMargin` of walkable room around it.
// EVERY ground with a performer belongs here (work-order 1273): the fishers'
// fire with its eater's mortar, the fixed vignettes (pounder, drummer, talkers,
// well, the village fire) and the market hut, not only the teaching scenes.
// Pure data, derived from the finished layout — never a second position.

import type { ObservedGround } from './boundary'
import { BANK_PLAY_LANE_HALF, type BankPoint } from './riverBank'
import { stationGround, type LoomStation } from './loom'
import { digLocalToWorld, DIG_RIM_DISTANCE, spoilCentre, SPOIL_RADIUS_X } from './placeGround'
import { digFurnitureFootprints } from './digSiteAppearance'
import { WALKER_RADIUS } from './collision'
import { JOIN_STAND_OFF } from './adultWork'
import { balance } from '../../config/balance'
import type { FisherySites } from './fishFire'
import { VILLAGE_SPOTS } from './lifeSpots'

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
  /** The market hut and its door, where the settlement has one. */
  market: { pos: readonly [number, number]; door: readonly [number, number] } | null
  /** The fishers' fire and its stands, where the village has a bank. */
  fishery: FisherySites | null
  /** The village cooking fire; the fixed vignettes play round it. */
  fire: readonly [number, number]
  hasWell: boolean
}

/** Drawn reach of the fishers' props about their site (m): the hearth's ring of
 *  stones and the spit, the smoking rack's frame, the small baskets and board. */
export const FISH_HEARTH_REACH = 1
export const FISH_RACK_REACH = 0.7
export const FISH_SMALL_PROP_REACH = 0.4
/** The eater's mortar (`RiverFishery`'s base, 0.26 m). */
export const FISH_MORTAR_REACH = 0.26
/** The market hut's own body (`interactiveCircleRadius('market')`'s floor). */
export const MARKET_HUT_REACH = 2.9

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
  // The market hut with its door.
  if (src.market) {
    const [mx, mz] = src.market.pos
    out.push(enclose(mx, mz, [{ x: mx, z: mz, r: MARKET_HUT_REACH }, { x: src.market.door[0], z: src.market.door[1], r: WALKER_RADIUS }]))
  }
  // The fishers: the grilling, smoking and eating spot round their fire, the
  // eater's mortar he pounds at between visits, and the basket at the landing.
  if (src.fishery) out.push(...fisheryGrounds(src.fishery))
  // The fixed vignettes of the village middle.
  out.push(...vignetteGrounds(src.fire, src.hasWell))
  return out
}

/** The fishers' grounds, each a disc enclosing its props and figures. */
export function fisheryGrounds(s: FisherySites): ObservedGround[] {
  const w = WALKER_RADIUS
  return [
    enclose(s.fire.x, s.fire.z, [
      { ...s.fire, r: FISH_HEARTH_REACH },
      { ...s.rack, r: FISH_RACK_REACH },
      { ...s.storage, r: FISH_SMALL_PROP_REACH },
      { ...s.board, r: FISH_SMALL_PROP_REACH },
      { ...s.fireBasket, r: FISH_SMALL_PROP_REACH },
      { ...s.carrierAtFire, r: w },
      { ...s.griller, r: w },
      { ...s.eaterAtRack, r: w },
    ]),
    enclose(s.eaterHome.x, s.eaterHome.z, [{ ...s.eaterHome, r: w }, { ...s.eaterMortar, r: FISH_MORTAR_REACH }]),
    enclose(s.basketSpot.x, s.basketSpot.z, [{ ...s.basketSpot, r: FISH_SMALL_PROP_REACH }, { ...s.carrierAtBank, r: w }]),
  ]
}

/** The fixed vignettes (`lifeSpots.ts`): pounder, drummer, talkers, the well
 *  with its carrier's stop, and the fire with its cook, tender and carrier. */
function vignetteGrounds(fire: readonly [number, number], hasWell: boolean): ObservedGround[] {
  const w = WALKER_RADIUS
  const at = ([x, z]: readonly [number, number], r: number) => ({ x, z, r })
  const { pounder, drummer, talkers, well } = VILLAGE_SPOTS
  const out = [
    { x: pounder[0], z: pounder[1], r: 0.55 + 2 * w },
    { x: drummer[0], z: drummer[1], r: 0.8 + w },
    enclose(talkers[0], talkers[1], [at(talkers, 0.85), ...[-0.5, 0.5].map((dx) => ({ x: talkers[0] + dx, z: talkers[1], r: w }))]),
    enclose(fire[0], fire[1], [at(fire, 1.3), ...[[1.2, 1], [-1.3, -0.7], [0.7, 1.8]].map(([dx, dz]) => ({ x: fire[0] + dx, z: fire[1] + dz, r: w }))]),
  ]
  if (hasWell) out.push(enclose(well[0], well[1], [at(well, 0.75), { x: well[0] - 1.1, z: well[1], r: w }]))
  return out
}
