// THE FISHERS' SCENE IS SOLID (point 1275, design.md §2 "solid props are
// impenetrable"): the fire with its grill, the smoking rack, the storage
// basket, the gutting board, the kneeling griller and — where the people roof
// their cook-fire — the four posts of the cook-shelter go into the settlement's
// collision set like every hut and dig site. The figures that MOVE (the
// carrier, the net man ashore, the pounding pair) and the dugout follow their
// own positions each frame through a small live list the traveller resolves
// against, and the walking villagers meet them through the shared inhabitant
// bodies. The fishers themselves are scripted and never resolve, so their own
// walks stay theirs.
//
// The sizes are the DRAWN ones (`FISHERY_PROPS`, read by `RiverFishery` too),
// plus the calibratable stand-off `balance.villageLife.fishFire.colliderMargin`.

import { balance } from '../../config/balance'
import { boxCollider, type Collider } from './collision'
import type { FishFireState, FisherySites } from './fishFire'
import type { PlaceRiverBank } from './riverBank'
import { yawOf, type CanoeState } from './villagerCanoe'

type FireConfig = typeof balance.villageLife.fishFire
type CanoeConfig = typeof balance.villageLife.canoe

/** The drawn sizes of the fishers' props (m), shared by the scene and its colliders. */
export const FISHERY_PROPS = {
  /** The hearth disc, the ring its stones lie on and one stone's radius. */
  hearthR: 0.8,
  stoneRing: 0.85,
  stoneR: 0.15,
  /** The grill's two forked posts: their offset from the hearth's middle along
   *  the fire's local z, their radius at the foot and their height. */
  grillPostOffset: 0.95,
  grillPostR: 0.035,
  /** The smoking rack's posts (local ±x, ±z), and its rails' length along x. */
  rackPostX: 0.5,
  rackPostZ: 0.35,
  rackRail: 1.15,
  /** The storage basket's rim radius. */
  storageR: 0.3,
  /** The gutting board (local x × z). */
  boardX: 0.9,
  boardZ: 0.4,
} as const

/** The fire group's yaw: its local z runs along the bank (downstream). */
export function fisheryAlong(bank: Pick<PlaceRiverBank, 'fx' | 'fz'>): number {
  return yawOf(bank.fx, bank.fz)
}

/** The four cook-shelter posts round the fishers' fire, in world placement. */
export function fisheryShelterPosts(
  sites: Pick<FisherySites, 'fire'>,
  along: number,
  cfg: Pick<FireConfig, 'shelterPostR'> = balance.villageLife.fishFire,
): Array<{ x: number; z: number }> {
  const p = cfg.shelterPostR
  const sin = Math.sin(along)
  const cos = Math.cos(along)
  return [
    [p, p],
    [p, -p],
    [-p, p],
    [-p, -p],
  ].map(([lx, lz]) => ({ x: sites.fire.x + cos * lx + sin * lz, z: sites.fire.z - sin * lx + cos * lz }))
}

/** The radius of one cook-shelter post's collider (the drawn foot plus the stand-off). */
export const SHELTER_POST_RADIUS = 0.1

/**
 * Every fixed solid of the fishers' scene: the fire (hearth, stones and the
 * grill's forked posts in one circle), the rack and the board as boxes turned
 * like their drawings, the storage basket, the griller kneeling at his fire,
 * and the four shelter posts where `sheltered`.
 */
export function fisheryStaticColliders(
  sites: FisherySites,
  bank: Pick<PlaceRiverBank, 'fx' | 'fz'>,
  sheltered: boolean,
  cfg: Pick<FireConfig, 'shelterPostR' | 'colliderMargin' | 'figureBodyR'> = balance.villageLife.fishFire,
): Collider[] {
  const m = cfg.colliderMargin
  const along = fisheryAlong(bank)
  const P = FISHERY_PROPS
  const fireR = Math.max(P.stoneRing + P.stoneR, P.grillPostOffset + P.grillPostR)
  const out: Collider[] = [
    { x: sites.fire.x, z: sites.fire.z, r: fireR + m },
    boxCollider(sites.rack.x, sites.rack.z, P.rackRail / 2, P.rackPostZ, along + Math.PI / 2, m),
    { x: sites.storage.x, z: sites.storage.z, r: P.storageR + m },
    boxCollider(sites.board.x, sites.board.z, P.boardX / 2, P.boardZ / 2, along, m),
    { x: sites.griller.x, z: sites.griller.z, r: cfg.figureBodyR },
  ]
  if (sheltered) {
    for (const post of fisheryShelterPosts(sites, along, cfg)) out.push({ x: post.x, z: post.z, r: SHELTER_POST_RADIUS + m })
  }
  return out
}

/** The live colliders of the fishers who move: one slot per mover, rewritten in place. */
export interface FisheryMovers {
  /** The dugout: a capsule along its keel, the two men inside it. */
  hull: Collider & { kind: 'segment' }
  netMan: Collider & { kind?: 'circle' }
  carrier: Collider & { kind?: 'circle' }
  women: Array<Collider & { kind?: 'circle' }>
}

/** The movers' collider slots, positioned once by `placeFisheryMovers`. */
export function createFisheryMovers(women: number): FisheryMovers {
  return {
    hull: { kind: 'segment', x1: 0, z1: 0, x2: 0, z2: 0, r: 0 },
    netMan: { x: 0, z: 0, r: 0 },
    carrier: { x: 0, z: 0, r: 0 },
    women: Array.from({ length: women }, () => ({ x: 0, z: 0, r: 0 })),
  }
}

/**
 * Writes where each mover is now and returns the colliders that count this
 * frame: the hull always, the net man only while he stands ashore (in the
 * boat the hull holds him), the carrier and both pounding women always.
 */
export function placeFisheryMovers(
  movers: FisheryMovers,
  canoe: Pick<CanoeState, 'x' | 'z' | 'yaw' | 'netMan'>,
  fire: Pick<FishFireState, 'carrier' | 'duo'>,
  canoeCfg: Pick<CanoeConfig, 'hullLength' | 'hullBeam'> = balance.villageLife.canoe,
  cfg: Pick<FireConfig, 'colliderMargin' | 'figureBodyR'> = balance.villageLife.fishFire,
  into: Collider[] = [],
): Collider[] {
  into.length = 0
  const beam = canoeCfg.hullBeam / 2
  // The capsule's caps are the hull's rounded ends: its axis stops a beam short.
  const reach = Math.max(0, canoeCfg.hullLength / 2 - beam)
  const sx = Math.sin(canoe.yaw)
  const cz = Math.cos(canoe.yaw)
  const h = movers.hull
  h.x1 = canoe.x - sx * reach
  h.z1 = canoe.z - cz * reach
  h.x2 = canoe.x + sx * reach
  h.z2 = canoe.z + cz * reach
  h.r = beam + cfg.colliderMargin
  into.push(h)
  const body = (c: { x: number; z: number; r: number }, at: { x: number; z: number }) => {
    c.x = at.x
    c.z = at.z
    c.r = cfg.figureBodyR
    into.push(c)
  }
  if (!canoe.netMan.inBoat) body(movers.netMan, canoe.netMan)
  body(movers.carrier, fire.carrier)
  fire.duo.women.forEach((w, i) => {
    if (movers.women[i]) body(movers.women[i], w)
  })
  return into
}

/**
 * The fishers' movers the traveller resolves against this frame (written by
 * `RiverFishery` while it is mounted, emptied when it goes) — the same shape as
 * the chief's standing spot in `chiefPresence.ts`.
 */
export const fisheryLiveColliders: Collider[] = []

/** The settlement's collider set with the fishers' movers added, if any stand. */
export function withFisheryMovers(colliders: Collider[]): Collider[] {
  return fisheryLiveColliders.length ? [...colliders, ...fisheryLiveColliders] : colliders
}
