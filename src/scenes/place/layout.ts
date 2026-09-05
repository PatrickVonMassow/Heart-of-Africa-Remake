// Procedural settlement layout (design.md §2.6/§4.1/§18): the pure data —
// walkable radius, functional buildings, dwellings, fences, paths, flora
// slots, rocks, pen, errand points and the collider set — extracted from the
// scene so the HUD (place plan on the map, point 79) and pure layout tests
// can build it without three.

import { placeById } from '../../world/geo'
import { mulberry32 } from '../../world/noise'
import { REGION_PLACE_STYLES, VILLAGE_PLANS, type RegionPlaceStyle } from './regionStyles'
import { PORT_TALKERS, VILLAGE_SPOTS, childPlayGround, villageAdultStations, type PlayGround } from './lifeSpots'
import { boxCollider, nudgeToFree, spawnPointFree, standingClear, PLAYER_RADIUS, WALKER_RADIUS, type Collider } from './collision'
import { CHIEF_HUT, MARKET_HUT, dwellingRoofProfile, hutRoofProfile, roofStandOff } from './roofClearance'
import { windingPoints, laneSlots, closestOnPolyline, bendAround, type LaneSlot } from './lanePlan'
import { buildGizaLayout } from './gizaSite'
import { ROCK_FOOTPRINT_UNITS } from '../../world/communicationRock'
import {
  BANK_FADE_ANGLE,
  BANK_PLAY_LANE_HALF,
  bankPlayRocks,
  bankWaterFoot,
  buildRiverBank,
  inBankPlayLane,
  settleBankPoints,
  standsOnGroundPlate,
  type BankPoint,
  type PlaceRiverBank,
} from './riverBank'
import { balance } from '../../config/balance'
import { WORK_ARRIVE_RADIUS } from './adultWork'
import { devAssert } from '../../systems/devAssert'
import type { BuildingType } from '../../state/ui'

export const PLACE_RADIUS = 28 // walkable radius in meters; leaving it exits the place

/** How far inside the southern edge a settlement drops the arriving traveller. */
export const SPAWN_INSET = 10

export interface Interactive {
  type: BuildingType | 'villager'
  pos: [number, number]
  /** World-space point in front of the entrance door; touching it opens the building. */
  door?: [number, number]
  /** Yaw of the building (port trade houses front their lane with the door side). */
  rot?: number
}

/** Non-enterable dwellings and outbuildings (design.md §2 lively settlements). */
export type DwellingKind = 'hut' | 'box' | 'granary' | 'tent' | 'warehouse' | 'stall' | 'shed' | 'tower' | 'mosque'

export interface DwellingDef {
  x: number
  z: number
  /** Yaw; the door faces along local +Z after rotation. */
  rot: number
  kind: DwellingKind
  /** Footprint half-extent. */
  r: number
  /** Wall height. */
  h: number
  floors: number
  /** World-space door position (walkers enter/leave here). */
  door: [number, number]
}

export interface PathDef {
  points: Array<[number, number]>
  width: number
}

export interface FenceDef {
  kind: 'thorn' | 'woven' | 'stone'
  /** Sequential post positions; panels orient toward the next post. */
  posts: Array<[number, number]>
}

export interface PlaceLayout {
  /** Walkable radius; leaving it exits the place (larger for big cities). */
  radius: number
  /** Distance south of the centre at which the traveller arrives, facing north
   *  (design.md §2.3). Normally just inside the walkable edge; an open-plain
   *  monument site keeps its own approach distance, so a disc widened for the
   *  desert does not push the arrival away from the monuments (point 390). */
  spawnZ: number
  interactives: Interactive[]
  dwellings: DwellingDef[]
  fences: FenceDef[]
  paths: PathDef[]
  flora: Array<{ x: number; z: number; h: number }>
  /** Scattered boulders (solid, part of the collision set). */
  rocks: Array<[number, number, number]>
  /**
   * Ground work in a village (work-order point 483): a store pit being sunk, a
   * post hole beside the lane, a patch of earth turned over. They are where the
   * adults teach the word for digging, so they are LAYOUT data — the villager
   * digs at exactly the spot the scene draws the turned earth, and no second,
   * drifting position can exist. Empty in ports.
   *
   * They stand where such work belongs and NOT on the open central ground
   * (work-order 688): a store pit at a compound edge, a post hole beside a lane,
   * a turned patch at the edge of the worked ground. Digging in the middle of
   * the village square is what made the old picture read as meaningless.
   */
  digSites: Array<{ x: number; z: number; kind: 'pit' | 'postHole' | 'patch' }>
  /**
   * The walkable river bank (work-order 482), where the settlement stands on a
   * river: which way the water lies, which way it runs, and the three points on
   * the bank a villager can be sent to. Null everywhere else. It is what makes
   * the walkable region something other than a circle — see `./boundary`.
   */
  bank: PlaceRiverBank | null
  /**
   * The two PLAY ROCKS of the children's bank game (work-order 687): one at the
   * upstream end of their stretch, one at the downstream end, in the teaching
   * stone's own size so a runner at one end can see the one he is running to.
   * They are LAYOUT data for the same reason the teaching stone is — the run
   * ends where the scene draws the rock, and no second position may exist. Null
   * in every settlement without a bank.
   */
  playRocks: { upstream: BankPoint; downstream: BankPoint; r: number; scale: number } | null
  /**
   * The village's WATER PATH (work-order 688): the lane its water carriers walk
   * between the settlement and the river. `head` is the point in the village
   * where the path leaves the built ground — where both carriers speak, one
   * setting out with an empty jar and one arriving with a full one — and `foot`
   * is where it meets the bank, upstream of and clear of the children's stretch.
   * Null in every settlement without a bank.
   */
  waterPath: { head: BankPoint; foot: BankPoint } | null
  /**
   * The children's roaming quarter (work-order 481.4): where the group plays
   * between two cycles of its bank game, and how far it roams. It is layout data
   * since work-order 688, because the adults' own teaching places — the dig
   * sites — are placed clear of it, and a quarter derived a second time in the
   * scene would be a second quarter. Null outside villages.
   *
   * `balance.villageLife.tag.playRadius` is read when the layout is built, so an
   * edit takes effect on the next visit rather than mid-scene — the same rule
   * `adultErrands.villagerCount` already follows.
   */
  playGround: PlayGround | null
  /**
   * The settlement's WAY OUT (work-order 688): the bearing, in place radians, of
   * the one crossing of the boundary that is kept free of loose dressing, so a
   * person can walk out over the edge band without stepping around a bush or a
   * boulder. It is chosen from what the BUILT fabric already leaves open — the
   * huts, the compound fences and the lanes are never moved for it — and the
   * scattered flora and rocks that fall in it are dropped. Null where no bearing
   * is open.
   */
  wayOut: number | null
  /** Livestock pen (kraal layouts). */
  pen: { x: number; z: number; r: number } | null
  /** Points walkers visit on their errands. */
  errands: Array<[number, number]>
  /** Solid-object colliders (design.md §2: collision inside settlements). */
  colliders: Collider[]
}

/**
 * The play rocks' footprint, in metres — ~2.4 m across, the size the stage was
 * measured at in work-order 687, against the 0.3-1.0 scale of the scattered
 * rock dressing. It is the collider radius AND the drawn block's half-width,
 * because the two are one object (points 129/378).
 */
export const PLAY_ROCK_RADIUS = 1.2

/**
 * The instance scale that gives `buildPlayRock` that footprint. Its detail-1
 * mesh uses the same native footprint as the upstream erratic but lies on a
 * broad base; the collider remains derived from the drawn radius.
 */
export const PLAY_ROCK_SCALE = PLAY_ROCK_RADIUS / ROCK_FOOTPRINT_UNITS

/**
 * Radius of a patch of ground work (work-order point 483), in metres: the pit
 * or the turned earth the villager stands in. Big enough to read as dug ground
 * from across the village, small enough to keep out of the lanes.
 */
export const DIG_SITE_RADIUS = 0.9

/**
 * Radius of the OPEN CENTRAL GROUND of a village (work-order 688): the middle
 * the fire, the pounder, the drummer and the talking pair share, and where the
 * settlement's own traffic crosses. Nothing is dug here — a store pit sunk on
 * the village square is the picture the user read as meaningless on 13.08.2026.
 * It reaches just past the pounder (7.1 m out) and the talkers (7.2 m).
 */
export const CENTRAL_GROUND_RADIUS = 9

/** How near a dig site must stand to the thing whose work it is — a compound
 *  wall for the store pit, a lane edge for the post hole. Two paces: near
 *  enough that the eye joins the two, far enough that the digger still fits
 *  between them. */
export const DIG_SITE_ANCHOR_REACH = 3.5

/** Where the WORKED GROUND begins, as a fraction of the walkable radius: the
 *  turned patch lies out here, past the last compound rather than between
 *  them. */
export const DIG_SITE_FIELD_BAND = 0.62

/** How wide the settlement's WAY OUT is kept, measured from its axis (work-order
 *  688): far enough that a walker crosses the boundary without stepping around
 *  anything, and that the give-way band on the ground is read against bare
 *  earth rather than against a bush. Calibratable. */
export const WAY_OUT_HALF_WIDTH = 4

/** How far the way out reaches INSIDE the boundary, and how far OUTSIDE it: the
 *  stretch a walker leaving the place actually covers. */
export const WAY_OUT_INNER = 9
export const WAY_OUT_OUTER = 6

/** How many bearings the way out is looked for on — one every two degrees, which
 *  is finer than the half-width it is looking for. */
const WAY_OUT_BEARINGS = 180

/** Where the WATER PATH's head stands: on the bank's own bearing, out past the
 *  compound ring (7-14 m, work-order 604) at the edge of the built ground. It
 *  is the point both water carriers speak at, so it has to be a place the
 *  player can stand among the village and hear — not a spot on the open plain
 *  and not the middle of the square. */
export const WATER_PATH_HEAD_RADIUS = 15

/** The radii the head is tried at, the nominal one first: a dense plan can leave
 *  that exact ring occupied, and a step in or out costs the picture nothing.
 *
 *  The ladder was five rungs wide while the walk was tested against the
 *  dwellings as circles. Tested against the fabric AS DRAWN — boxes at their
 *  corners, fence panels, posts — five rungs left four of fifteen river villages
 *  with no head at all, so it steps half a metre at a time now. The first clear
 *  run still wins, and a candidate whose own head is occupied dies on the first
 *  sample, so the finer ladder costs little. */
export const WATER_PATH_HEAD_RADII = [
  15, 14.5, 15.5, 14, 16, 13.5, 16.5, 13, 17, 12.5, 17.5, 12, 18, 11.5, 18.5, 11, 19, 19.5, 20, 20.5, 21,
] as const

/** How far to either side of the water's own bearing the head may be swept, in
 *  degrees, to find a straight walk that clears the settlement's buildings. */
export const WATER_PATH_HEAD_SWEEP = 60

/** Width of the water path, in metres: a walked footpath, narrower than the
 *  village's own lanes. */
export const WATER_PATH_WIDTH = 1.6

/** Where a village's cooking fire burns (design.md §19.10) — the collider here
 *  and the `FirePit` the scene draws read the same spot. */
export const VILLAGE_FIRE: [number, number] = [-3.5, 2.5]

/**
 * Circular collider radius of a dwelling — the wall body it is drawn with,
 * WIDENED where the building's own roof overhang would otherwise let the camera
 * into it (work-order 349). `null` for the rectangular kinds, which collide as
 * oriented boxes and carry no low overhang.
 */
const DWELLING_BODY: Partial<Record<DwellingKind, (d: DwellingDef) => number>> = {
  hut: (d) => d.r + 0.3,
  granary: () => 1.2,
  tent: (d) => d.r * 1.3,
  stall: () => 1.35,
  shed: (d) => d.r + 0.35,
  tower: (d) => d.r + 0.4,
}

export function dwellingCircleRadius(d: DwellingDef, style: RegionPlaceStyle): number | null {
  const body = DWELLING_BODY[d.kind]
  if (!body) return null
  return Math.max(body(d), dwellingRoofStandOff(d, style))
}

/** Stand-off this dwelling's own ROOF demands, 0 where its rim hangs clear. */
export function dwellingRoofStandOff(d: DwellingDef, style: RegionPlaceStyle): number {
  return roofStandOff(dwellingRoofProfile(d, style))
}

/** The same rule for the two enterable round huts (design.md §9): the collider
 *  is the hut body unless its roof rim hangs into the camera's reach. */
export function interactiveCircleRadius(type: BuildingType | 'villager', style: RegionPlaceStyle): number {
  if (type === 'villager') return 0.45
  const hut = type === 'market' ? MARKET_HUT : CHIEF_HUT
  return Math.max(type === 'market' ? 2.9 : 3.35, roofStandOff(hutRoofProfile(style.roof, hut.r, hut.h, style.stilts)))
}

/** Interact radius for the elder/villager Space use key (design.md §2.3). */
export const INTERACT_RADIUS = 4.5

/** How far beside his own door the chief stands once he has come out
 *  (design.md §12): clear of the door point the traveller uses, and clear of
 *  the hut's own collider, so he is met face to face rather than walked into. */
export const CHIEF_STAND_OFFSET = 1.6

/**
 * Where the chief stands once the use key has brought him out of his hut
 * (design.md §12): one step out of the doorway and to the side of it, facing
 * the open ground his drummer sits on. Pure geometry off the hut's own door,
 * so the figure the picture shows and the door the key is pressed at can never
 * describe different spots.
 */
export function chiefStandingSpot(it: Interactive): [number, number] {
  const door = it.door ?? it.pos
  const dx = door[0] - it.pos[0]
  const dz = door[1] - it.pos[1]
  const len = Math.hypot(dx, dz) || 1
  const nx = dx / len
  const nz = dz / len
  return [door[0] + nz * CHIEF_STAND_OFFSET, door[1] - nx * CHIEF_STAND_OFFSET]
}
/**
 * Door proximity that arms the Space use key at a functional building — merely
 * walking into the door no longer enters; the discrete press does (design.md §2.3).
 */
export const DOOR_TRIGGER_RADIUS = 1.2

/**
 * The nearest actionable interactive for the Space use key (design.md §2.3):
 * the elder/villager within the interact radius, or the functional building at
 * whose door the traveller stands, whichever is closer — null when none is in
 * reach. A PURE function of the layout and the LIVE player position, so the key
 * press can act on where the traveller IS NOW rather than on the last rendered
 * frame's candidate: a synchronous keydown after a teleport or a fast step used
 * to read a frame-lagged `nearRef` and open the previously-near building.
 */
export function nearestActionable(
  layout: PlaceLayout | null,
  x: number,
  z: number,
): Interactive | null {
  if (!layout) return null
  let near: Interactive | null = null
  let best = Infinity
  for (const it of layout.interactives) {
    if (it.type === 'villager') {
      const d = Math.hypot(x - it.pos[0], z - it.pos[1])
      if (d <= INTERACT_RADIUS && d < best) {
        best = d
        near = it
      }
    } else if (it.door) {
      const d = Math.hypot(x - it.door[0], z - it.door[1])
      if (d <= DOOR_TRIGGER_RADIUS && d < best) {
        best = d
        near = it
      }
    }
  }
  return near
}

/** Half-thickness of the drawn fence run, per material. */
const FENCE_PANEL_RADIUS: Record<FenceDef['kind'], number> = { thorn: 0.6, stone: 0.5, woven: 0.42 }

/**
 * The Sahel family compound's palisade (work-order 604). Three lengths, all in
 * metres: the smallest ring drawn, the walkable gap the wall keeps from the
 * roofs it encloses, and the lane between two neighbouring compounds. They exist
 * because a gap NARROWER than the traveller is a trap rather than a tight spot —
 * he can be pressed into it and cannot walk out — so the wall never grows through
 * a hut and two walls never cross. The lane is 2.5 m, not the traveller's bare
 * diameter: an inhabitant is routed to the river on a 0.55 m nav grid, and a
 * passage only just wide enough leaves that grid too few free cells to find.
 */
export const COMPOUND_RING_MIN = 6.2
export const COMPOUND_WALL_GAP = 0.9
export const COMPOUND_RING_CORRIDOR = 2.5

/** Neighbouring posts further apart than this multiple of the ring's own post
 *  spacing span a GATE the renderer leaves open — they are never joined. Posts
 *  sit evenly along the arc, so the smallest neighbour distance is the spacing
 *  itself and a gate always skips at least one post (≥ 2× the spacing). */
const FENCE_PANEL_SPAN_FACTOR = 1.5

/** One DRAWN fence panel: where it stands and which way it faces. */
export interface FencePanel {
  kind: FenceDef['kind']
  x: number
  z: number
  /** Yaw, oriented toward the next post along the run. */
  rot: number
}

/**
 * The fence panels the renderer INSTANCES, as pure data (work-order 583).
 *
 * It lives here, beside `fenceColliders`, because the two are one run seen
 * twice: one panel per post, one collider per post. They drifted once — the
 * scene's instance buffer carried a FIXED capacity (160) while the Bambara
 * compound's five woven rings ask for 167, so the last seven panels were never
 * drawn while their colliders stood, and the player met a wall in open sand
 * seven panels long. A buffer sized from THIS list cannot truncate, and a test
 * can count both without a browser.
 */
export function fencePanels(fences: FenceDef[]): FencePanel[] {
  const out: FencePanel[] = []
  for (const f of fences) {
    for (let i = 0; i < f.posts.length; i++) {
      const [x, z] = f.posts[i]
      const [nx, nz] = f.posts[(i + 1) % f.posts.length]
      out.push({ kind: f.kind, x, z, rot: Math.atan2(nx - x, nz - z) + Math.PI / 2 })
    }
  }
  return out
}

/**
 * The collider run of one fence, DERIVED from the posts the renderer draws
 * (points 129/378/413): a capsule per drawn panel, i.e. per pair of neighbouring
 * posts, so the blocked band matches the continuous woven/stone/thorn wall in
 * the picture. One circle per post left a chain of dots whose blocked band
 * pinched at every midpoint and whose contact normal pointed away from a post
 * instead of away from the wall.
 */
export function fenceColliders(f: FenceDef): Collider[] {
  const r = FENCE_PANEL_RADIUS[f.kind]
  const n = f.posts.length
  if (n === 0) return []
  if (n === 1) return [{ x: f.posts[0][0], z: f.posts[0][1], r }]
  let spacing = Infinity
  for (let i = 0; i < n; i++) {
    const a = f.posts[i]
    const b = f.posts[(i + 1) % n]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (d > 1e-6 && d < spacing) spacing = d
  }
  const maxSpan = spacing * FENCE_PANEL_SPAN_FACTOR
  const out: Collider[] = []
  for (let i = 0; i < n; i++) {
    const a = f.posts[i]
    const b = f.posts[(i + 1) % n]
    const d = Math.hypot(b[0] - a[0], b[1] - a[1])
    if (d <= maxSpan) out.push({ kind: 'segment', x1: a[0], z1: a[1], x2: b[0], z2: b[1], r })
    // Across a gate the renderer still draws this post's own short panel, but
    // nothing that bridges the opening — so the post stays a circle and the
    // gate stays walkable.
    else out.push({ x: a[0], z: a[1], r })
  }
  return out
}

/** Fence posts along a circular arc, skipping given gap angles. */
function fenceRing(
  cx: number,
  cz: number,
  radius: number,
  step: number,
  gaps: Array<[number, number]>,
): Array<[number, number]> {
  const posts: Array<[number, number]> = []
  const n = Math.max(8, Math.round((Math.PI * 2 * radius) / step))
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    if (gaps.some(([g, half]) => Math.abs(((a - g + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < half)) continue
    posts.push([cx + Math.cos(a) * radius, cz + Math.sin(a) * radius])
  }
  return posts
}

/**
 * Procedural layout per run+place (design.md §18): the settlement pattern
 * follows the region (lanes / compound clusters / kraal ring), with far more
 * non-enterable dwellings and outbuildings than functional buildings, a
 * path network and fences (design.md §2 "Lively, densely built settlements").
 */
/** Whether a point lies on a lane (within its width) — the footstep-surface
 *  classification (point 97): on a lane reads as a firmer stone/clay path, off
 *  it as softer open ground. */
export function isOnLane(x: number, z: number, paths: PathDef[]): boolean {
  return paths.some((p) => closestOnPolyline(p.points, x, z).dist < p.width / 2)
}

/**
 * The settlement's BUILT FABRIC: where its dwellings and its functional
 * buildings stand (point 524). One list rather than two, because the children's
 * play ground is kept against the BUILDINGS and does not care which of them a
 * player may enter — a chief's hut is as much a wall behind a chase as a
 * granary. The villager markers are not buildings and stay out.
 */
export function builtFabric(layout: PlaceLayout): Array<[number, number]> {
  return fabricOf(layout.dwellings, layout.interactives)
}

/** The same list from the two parts it is made of, so `buildLayout` can ask for
 *  it before there is a `PlaceLayout` to ask about. */
function fabricOf(
  dwellings: readonly DwellingDef[],
  interactives: readonly Interactive[],
): Array<[number, number]> {
  return [
    ...dwellings.map((d) => [d.x, d.z] as [number, number]),
    ...interactives.filter((it) => it.type !== 'villager').map((it) => it.pos),
  ]
}

/**
 * THE SETTLEMENT'S WAY OUT (work-order 688). Loose dressing used to be scattered
 * over the whole ground, the boundary ring included, and whether a walker could
 * cross that ring anywhere without squeezing past a boulder was left to the
 * draw. Measured at the Bambara village, seed 42: of 180 bearings exactly ONE
 * was open before this point rearranged the village, and none after it — the
 * rearrangement consumed the last gap, and the edge band could no longer be read
 * against bare ground anywhere on the ring.
 *
 * So the way out is CHOSEN rather than hoped for: the widest crossing the BUILT
 * fabric leaves open — nothing built is moved for it — and the scatter then
 * keeps off it. Bearings pointing at the water are skipped, because a way out
 * over the bank is a way into the river.
 *
 * Returns the bearing, or null where the fabric itself leaves no crossing.
 */
export function pickWayOut(
  colliders: readonly Collider[],
  radius: number,
  bank: PlaceRiverBank | null,
): number | null {
  /** How much room a corridor point has beyond what it needs, in metres. */
  const clearanceAt = (ax: number, az: number): number => {
    let worst = Infinity
    const gap = (x: number, z: number, need: number) => {
      const room = Math.hypot(x - ax, z - az) - need
      if (room < worst) worst = room
    }
    for (const c of colliders) {
      if (c.kind === 'segment') {
        gap(c.x1, c.z1, WAY_OUT_HALF_WIDTH)
        gap(c.x2, c.z2, WAY_OUT_HALF_WIDTH)
      } else if (c.kind === 'box') {
        gap(c.x, c.z, Math.hypot(c.hx, c.hz) + WAY_OUT_HALF_WIDTH)
      } else {
        gap(c.x, c.z, c.r + WAY_OUT_HALF_WIDTH)
      }
    }
    return worst
  }
  let best: number | null = null
  let bestRoom = 0
  for (let i = 0; i < WAY_OUT_BEARINGS; i++) {
    const b = (i / WAY_OUT_BEARINGS) * Math.PI * 2
    // Not over the water: the bank's own arc is where the ground stops being
    // ground, and the shore already carries the children's stretch and the
    // water path.
    if (bank && Math.cos(b) * bank.nx + Math.sin(b) * bank.nz > Math.cos(BANK_FADE_ANGLE)) continue
    let room = Infinity
    for (let d = radius - WAY_OUT_INNER; d <= radius + WAY_OUT_OUTER; d += 1.5) {
      room = Math.min(room, clearanceAt(Math.cos(b) * d, Math.sin(b) * d))
      if (room <= bestRoom) break
    }
    if (room > bestRoom) {
      bestRoom = room
      best = b
    }
  }
  return best
}

/**
 * Whether a loose object of body radius `bodyR` would stand in the way out.
 *
 * The corridor is a CAPSULE, not a rectangle: it is kept clear of everything
 * within the half-width of any point ON the axis, its two ends included. A flat
 * cut at the ends let a boulder sit two metres short of the inner end and still
 * come within reach of the point measured there — three villages went on
 * reporting a blocked crossing at exactly `radius - WAY_OUT_INNER`.
 */
export function onWayOut(wayOut: number | null, radius: number, x: number, z: number, bodyR: number): boolean {
  if (wayOut === null) return false
  const along = Math.cos(wayOut) * x + Math.sin(wayOut) * z
  const across = -Math.sin(wayOut) * x + Math.cos(wayOut) * z
  const inner = radius - WAY_OUT_INNER
  const outer = radius + WAY_OUT_OUTER
  const overshoot = along < inner ? inner - along : along > outer ? along - outer : 0
  return Math.hypot(overshoot, across) < WAY_OUT_HALF_WIDTH + bodyR
}

/** How far a collider reaches from the point that stands for it — its own
 *  radius, a box's half-diagonal, a panel's half-length plus its radius. Always
 *  an OVER-estimate, because it is used to throw colliders away. */
function colliderReach(c: Collider): number {
  if (c.kind === 'segment') return Math.hypot(c.x2 - c.x1, c.z2 - c.z1) / 2 + c.r
  if (c.kind === 'box') return Math.hypot(c.hx, c.hz)
  return c.r
}

/** The point that stands for a collider in a distance test. */
function colliderAt(c: Collider): { x: number; z: number } {
  return c.kind === 'segment' ? { x: (c.x1 + c.x2) / 2, z: (c.z1 + c.z2) / 2 } : { x: c.x, z: c.z }
}

/**
 * The colliders that could possibly meet a walk from (ax,az) to (bx,bz) by a
 * body of radius `radius`.
 *
 * A CULL, NOT A TEST: it keeps everything within its own reach of the corridor
 * and throws away only what cannot be touched, so `standingClear` over the
 * result answers exactly what it answers over the whole set. It exists because
 * the water path's sweep asks that question for every candidate head at 0.1 m
 * steps — measured at the Bambara village, 159 of the 217 ms one `buildLayout`
 * took, and a settlement layout is built while the player walks into the place.
 */
function collidersNearRun(
  colliders: readonly Collider[],
  ax: number,
  az: number,
  bx: number,
  bz: number,
  radius: number,
): Collider[] {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  const out: Collider[] = []
  for (const c of colliders) {
    const p = colliderAt(c)
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / len2))
    const d = Math.hypot(p.x - (ax + dx * t), p.z - (az + dz * t))
    if (d <= radius + colliderReach(c)) out.push(c)
  }
  return out
}

/** Side of one bucket of `colliderBuckets`, in metres. Wide enough that a
 *  settlement fills a few dozen buckets, narrow enough that one holds a handful
 *  of bodies. */
const COLLIDER_BUCKET = 8

const NO_COLLIDERS: Collider[] = []

/**
 * A bucket index over a settlement's colliders, for a query of at most
 * `reach` metres.
 *
 * Every collider is filed in each bucket its own reach plus `reach` touches, so
 * asking the bucket a point falls in returns EVERY collider that could overlap a
 * body of that radius there — the answer is the whole set's answer, over a
 * handful of bodies instead of a hundred and sixty.
 *
 * It is here for the children's quarter: that search samples discs at 64
 * bearings and asks whether a child could stand at each sample, which was a full
 * scan of the settlement per sample — measured at the Bambara village, 58 of the
 * 217 ms one `buildLayout` took, and the layout is built while the player walks
 * into the place.
 */
function colliderBuckets(colliders: readonly Collider[], reach: number): (x: number, z: number) => Collider[] {
  const buckets = new Map<string, Collider[]>()
  for (const c of colliders) {
    const p = colliderAt(c)
    const r = colliderReach(c) + reach
    const x0 = Math.floor((p.x - r) / COLLIDER_BUCKET)
    const x1 = Math.floor((p.x + r) / COLLIDER_BUCKET)
    const z0 = Math.floor((p.z - r) / COLLIDER_BUCKET)
    const z1 = Math.floor((p.z + r) / COLLIDER_BUCKET)
    for (let ix = x0; ix <= x1; ix++) {
      for (let iz = z0; iz <= z1; iz++) {
        const key = `${ix},${iz}`
        const list = buckets.get(key)
        if (list) list.push(c)
        else buckets.set(key, [c])
      }
    }
  }
  return (x, z) =>
    buckets.get(`${Math.floor(x / COLLIDER_BUCKET)},${Math.floor(z / COLLIDER_BUCKET)}`) ?? NO_COLLIDERS
}

export function buildLayout(placeId: string, seed: number): PlaceLayout {
  const place = placeById(placeId)
  // Monument sites (design.md §4.4, point 273) are a bare walkable disc with the
  // giant collidable monuments and a handful of ambient anchors — no trade,
  // elder, dwellings, lanes or props. Their fixed layout lives in gizaSite.ts.
  if (place.kind === 'monument') return buildGizaLayout(seed)
  const style = REGION_PLACE_STYLES[place.region]
  let hash = 0
  for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const rand = mulberry32((seed ^ hash) >>> 0)
  const jitter = (v: number, amount: number) => v + (rand() - 0.5) * amount

  // Settlement size mirrors real ~1890 importance (design.md §4.1): major
  // cities are markedly larger, with more blocks and a wider walkable area.
  const size = place.kind === 'port' ? (place.size ?? 2) : 1
  // Ports are markedly larger than villages and scale with ~1890 importance
  // (design.md §4.1, point 6): a wider walkable area and deeper street grid.
  const ext = place.kind === 'port' ? (size - 1) * 10 : 0
  const radius = place.kind === 'port' ? 30 + size * 6 : PLACE_RADIUS
  // The river the settlement stands on (work-order 482), derived from the world
  // model — not seeded, because the geography is the same in every run.
  const bank = buildRiverBank(place, radius)
  // The children's two play rocks (work-order 687), derived from that bank and
  // fixed BEFORE anything loose is scattered, so the dressing grows around the
  // stage instead of into it. See `riverBank.ts` for the numbers and the
  // measurement behind them.
  const playRocks: PlaceLayout['playRocks'] = bank
    ? { ...bankPlayRocks(bank), r: PLAY_ROCK_RADIUS, scale: PLAY_ROCK_SCALE }
    : null
  // THE WATER PATH (work-order 688): the lane the village's water carriers walk.
  // It is laid down HERE, before a single hut is placed, because it is a lane
  // like any other — the plan builds against it, and nothing is put on it.
  //
  // Its foot is `bankWaterFoot`'s landing, upstream of the children's stretch
  // (see riverBank.ts for why upstream). Its head is the point where it leaves
  // the built ground, on the same bearing, at `WATER_PATH_HEAD_RADIUS`: that is
  // where BOTH carriers speak — one setting out with an empty jar, one arriving
  // with a full one — so the word RIVER falls in the VILLAGE and never at the
  // bank, where it would land inside the children's earshot.
  let waterPath: PlaceLayout['waterPath'] = bank
    ? {
        head: { x: bank.nx * WATER_PATH_HEAD_RADIUS, z: bank.nz * WATER_PATH_HEAD_RADIUS },
        foot: bankWaterFoot(bank),
      }
    : null

  const interactives: Interactive[] = []
  if (place.kind === 'village') {
    // Villages carry the chief's hut, the elder and a trading post that
    // barters the baseline goods for gifts (design.md §9/§10).
    const chiefPos: [number, number] = [jitter(0, 4), jitter(-13, 3)]
    // Must match VillageHut's default facing (door toward the place center);
    // the door point sits just outside the hut collider (r 3.35).
    const hutDoor = (p: [number, number]): [number, number] => {
      const facing = Math.atan2(p[0], p[1]) + Math.PI
      return [p[0] + Math.sin(facing) * 3.9, p[1] + Math.cos(facing) * 3.9]
    }
    interactives.push({ type: 'chief', pos: chiefPos, door: hutDoor(chiefPos) })
    // The trading post's spot follows the people's plan (design.md §4.5) so
    // it never sits inside the plan's house band or on its lane.
    const villagePlan = VILLAGE_PLANS[place.peopleId ?? ''] ?? 'compound'
    const marketPos: [number, number] =
      villagePlan === 'riverstrip'
        ? [jitter(7.5, 1.5), jitter(-1, 1.5)]
        : villagePlan === 'street'
          ? [jitter(8, 1), jitter(2, 2)]
          : villagePlan === 'ksar'
            ? [jitter(-8.5, 1), jitter(-3, 2)]
            : [jitter(-6, 2), jitter(-6, 2)]
    // Keep the full window gap (design.md §2.6) to the chief's hut.
    const dChief = Math.hypot(marketPos[0] - chiefPos[0], marketPos[1] - chiefPos[1])
    if (dChief < 7.25) {
      const nx = dChief > 1e-6 ? (marketPos[0] - chiefPos[0]) / dChief : -0.6
      const nz = dChief > 1e-6 ? (marketPos[1] - chiefPos[1]) / dChief : 0.8
      marketPos[0] = chiefPos[0] + nx * 7.25
      marketPos[1] = chiefPos[1] + nz * 7.25
    }
    interactives.push({ type: 'market', pos: marketPos, door: hutDoor(marketPos) })
    // The elder never stands inside a door trigger: talking to him must not
    // pop the chief's or trading post's dialog instead.
    const elderPos: [number, number] = [jitter(4, 3), jitter(-4, 2)]
    for (const door of [hutDoor(chiefPos), hutDoor(marketPos)]) {
      const dE = Math.hypot(elderPos[0] - door[0], elderPos[1] - door[1])
      if (dE < 3.6) {
        const nx = dE > 1e-6 ? (elderPos[0] - door[0]) / dE : 0
        const nz = dE > 1e-6 ? (elderPos[1] - door[1]) / dE : 1
        elderPos[0] = door[0] + nx * 3.6
        elderPos[1] = door[1] + nz * 3.6
      }
    }
    interactives.push({ type: 'villager', pos: elderPos })
  }

  const dwellings: DwellingDef[] = []
  const fences: FenceDef[] = []
  const paths: PathDef[] = []
  const errands: Array<[number, number]> = []
  let pen: PlaceLayout['pen'] = null
  const center: [number, number] = [0, 1.5]

  // Keep the southern spawn corridor (x≈0, z>6), interactives and the
  // life-prop spots (PlaceLife) clear.
  const lifeSpots: Array<[number, number]> =
    place.kind === 'village' ? Object.values(VILLAGE_SPOTS) : [PORT_TALKERS]
  // No solid body may grow THROUGH a fence (work-order 604): where a hut or a
  // shed crosses a palisade, the slot left on either side of the crossing is
  // narrower than a man, and a traveller pressed into it cannot walk out. The
  // clearance is the traveller's own width, so what is left beside the wall is
  // either nothing at all or ground he can walk on.
  const clearOfFences = (x: number, z: number, bodyR: number) =>
    fences.every((f) => standingClear(fenceColliders(f), x, z, bodyR + 2 * PLAYER_RADIUS))

  const isFree = (x: number, z: number, margin: number, ownR = 0) => {
    if (Math.abs(x) < 4.5 && z > 5) return false
    if (Math.hypot(x, z - 18) < 6) return false
    if (!lifeSpots.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > margin * 0.6 + 1)) return false
    // Window clearance also against the functional buildings (their body
    // radius plus the same 0.9 m gap — design.md §2.6).
    if (
      !interactives.every((it) => {
        const rInt = it.type === 'villager' ? 0.45 : place.kind === 'port' ? 3.2 : it.type === 'market' ? 2.9 : 3.35
        return Math.hypot(x - it.pos[0], z - it.pos[1]) > Math.max(margin, ownR + rInt + 0.9)
      })
    )
      return false
    // Keep the entrance-door approach of each functional building clear so it
    // stays reachable (design.md §2 collision inside settlements).
    if (!interactives.every((it) => !it.door || Math.hypot(x - it.door[0], z - it.door[1]) > 2.2)) return false
    // Keep every dwelling's entrance-door approach clear too, so a later object
    // never seals an earlier hut's door (design.md §2, point 6 reachability).
    if (!dwellings.every((d) => Math.hypot(x - d.door[0], z - d.door[1]) > 1.7)) return false
    // NOTHING STANDS ON THE SHORE (work-order 584/585) — the rule itself is
    // `standsOnGroundPlate` in riverBank.ts, which the ground scatter reads too.
    // A body past the top of the bank is drawn on the flat plate over ground that
    // has sloped away under it, and it is a collider in the one stretch the
    // traveller wades through.
    if (!standsOnGroundPlate(bank, x, z, ownR)) return false
    // No body grows THROUGH a fence (work-order 604) — see `clearOfFences`.
    if (!clearOfFences(x, z, ownR)) return false
    // AND NOTHING SOLID STANDS IN THE CHILDREN'S RUNNING LANE (work-order 687,
    // cross-vendor review 29.08.2026). The lane test used to guard the loose
    // dressing alone, so the round's guaranteed-width corridor was guaranteed
    // against flora and boulders and against nothing else: a hut or a compound
    // fence reaching into it would have stood there, and a child would have spent
    // the run phase driving at it. Measured before the rule went in, nothing did
    // — the bank lies where the buildings do not go — which is the reason to
    // MAKE it true rather than to keep relying on it.
    if (inBankPlayLane(playRocks, x, z, ownR)) return false
    // Window clearance (design.md §2.6): no wall pressed against a neighbour —
    // every pair of building bodies keeps at least a 0.9 m free gap.
    return dwellings.every((d) => Math.hypot(x - d.x, z - d.z) > Math.max(margin * 0.55, ownR + 0.9) + d.r)
  }
  // No solid body may stand on a lane (design.md §2.6: buildings FRONT the
  // lanes; the network stays walkable). Door-approach spurs end AT doors, so
  // placement checks run against full segments conservatively.
  const onLane = (x: number, z: number, bodyR: number) =>
    paths.some((p) => closestOnPolyline(p.points, x, z).dist < p.width / 2 + bodyR)


  // Door point just outside a dwelling's front face for a given facing.
  const doorAt = (x: number, z: number, r: number, rot: number): [number, number] => [
    x + Math.sin(rot) * (r + 0.5),
    z + Math.cos(rot) * (r + 0.5),
  ]
  // A door is reachable when it lands inside the walkable area and clear of the
  // functional buildings and other dwellings (its inhabitant/player must be able
  // to stand there — design.md §2, point 6).
  const doorReachable = (dx: number, dz: number): boolean => {
    if (Math.hypot(dx, dz) > radius - 0.5) return false
    if (!interactives.every((it) => Math.hypot(dx - it.pos[0], dz - it.pos[1]) > (it.type === 'villager' ? 0.9 : place.kind === 'port' ? 2.9 : 3.5))) return false
    return dwellings.every((d) => Math.hypot(dx - d.x, dz - d.z) > d.r + 0.8)
  }
  // Orient a dwelling so its door opens onto free space: try the preferred
  // facing first, then rotate outward in small steps until the door is reachable.
  const pickDoorRot = (x: number, z: number, r: number, preferred: number): number => {
    const [px, pz] = doorAt(x, z, r, preferred)
    if (doorReachable(px, pz)) return preferred
    for (let k = 1; k <= 7; k++) {
      for (const rot of [preferred + k * 0.45, preferred - k * 0.45]) {
        const [dx, dz] = doorAt(x, z, r, rot)
        if (doorReachable(dx, dz)) return rot
      }
    }
    return preferred // fallback: no clear facing found, keep the intended one
  }

  const addDwelling = (
    kind: DwellingKind,
    x: number,
    z: number,
    rot: number,
    r: number,
    h: number,
    floors = 1,
  ): DwellingDef | null => {
    // No building corner may reach the walkable edge: the collision resolver
    // must be able to eject the player on the inside (design.md §2.6).
    const cornerR =
      kind === 'warehouse' ? Math.hypot(r, 2.3) : kind === 'box' ? r * 1.33 : kind === 'mosque' ? r * 1.29 : r
    if (Math.hypot(x, z) > radius - cornerR - 1.0) return null
    // The door approach keeps its historical 0.2 m of air outside the collider
    // (work-order 349): where a LOW ROOF pushed that collider out past the wall,
    // the door point travels with it, so the resident still steps out onto free
    // ground instead of into its own hut's stand-off. A roof that hangs clear
    // demands nothing and leaves the door exactly where it always sat.
    const standOff = dwellingRoofStandOff({ kind, x, z, rot, r, h, floors, door: [x, z] }, style)
    // `doorAt` adds the 0.5 m approach itself, so the seat radius carries only
    // the body: the wall, or the roof's stand-off less that same 0.2 m of air.
    const doorSeat = Math.max(r, standOff - 0.3)
    const facing = pickDoorRot(x, z, doorSeat, rot)
    const d: DwellingDef = {
      kind,
      x,
      z,
      rot: facing,
      r,
      h,
      floors,
      door: doorAt(x, z, doorSeat, facing),
    }
    dwellings.push(d)
    return d
  }
  /** Yaw so the door looks from (x,z) toward (tx,tz). */
  const faceTo = (x: number, z: number, tx: number, tz: number) => Math.atan2(tx - x, tz - z)

  if (place.kind === 'port') {
    // Organic lane network (design.md §2.6/§4.5): a winding main lane from
    // the south gate over the plaza northward, a winding cross lane, side
    // alleys with size — explicitly NOT a rectangular grid. Buildings are
    // placed FROM the lanes and front them with their door side.
    const plaza: [number, number] = [0, 3]
    const mainLane: PathDef = {
      points: [
        ...windingPoints(rand, [0, radius - 2], plaza, 1.5, 3),
        ...windingPoints(rand, plaza, [jitter(0, 6), -16 - ext], 2.6, 4).slice(1),
      ],
      width: 3,
    }
    // The cross lane stops short of the walkable edge so its end warehouses
    // stay fully inside the radius (corner clearance).
    const crossHalf = Math.min(20 + ext, radius - 12)
    const crossLane: PathDef = {
      points: windingPoints(rand, [-crossHalf, jitter(3, 3)], [crossHalf, jitter(3, 3)], 2.2, 5),
      width: 2.2,
    }
    paths.push(mainLane, crossLane)
    // A small irregular square where the lanes meet.
    paths.push({
      points: [[jitter(-2.5, 1.5), jitter(2.5, 1)], [jitter(3, 1.5), jitter(3.5, 1)]],
      width: 7,
    })
    const alleys: PathDef[] = []
    const alleyEnds: Array<[number, number]> = [
      [-14 - ext, -12 - ext * 0.6],
      [15 + ext, 14 + ext * 0.5],
    ]
    for (let i = 0; i < size - 1; i++) {
      const from: [number, number] = [jitter(i % 2 ? 6 : -6, 2), jitter(3, 1.5)]
      const alley: PathDef = { points: windingPoints(rand, from, alleyEnds[i % 2], 2.4, 4), width: 1.8 }
      alleys.push(alley)
      paths.push(alley)
    }
    if (size >= 3 && alleys.length > 0) {
      // Major cities widen the first alley's bend into a second small square.
      const mid = alleys[0].points[2]
      paths.push({ points: [[mid[0] - 2, mid[1]], [mid[0] + 2.5, mid[1] + 0.5]], width: 5.5 })
    }

    // The full trade roster (§9) seats on lane slots around the plaza, each
    // house fronting its lane; the door sits on local +Z just outside the
    // box collider (hz 2.0).
    const types: BuildingType[] = ['shop', 'weapons', 'tools', 'market', 'bazaar', 'agency']
    const tradeSlots = [
      ...laneSlots(mainLane.points, 6.5, mainLane.width / 2 + 3.3),
      ...laneSlots(crossLane.points, 6.5, crossLane.width / 2 + 3.3),
    ]
      .filter((s) => {
        const dPlaza = Math.hypot(s.x - plaza[0], s.z - plaza[1])
        if (dPlaza < 7.5 || dPlaza > 22) return false
        if (Math.abs(s.x) < 4.5 && s.z > 5) return false // spawn corridor
        if (Math.hypot(s.x, s.z - 18) < 6) return false // walk-out zone
        // The slot flanks its OWN lane; it must not sit on any other NARROW
        // lane (fronting the open square is fine — it is walkable width).
        return !paths.some((p) => p.width < 6 && closestOnPolyline(p.points, s.x, s.z).dist < p.width / 2 + 3.15)
      })
      .sort(() => rand() - 0.5)
    // Seat all six: prefer generous spacing, then relax toward the window
    // gap floor (box bodies r 3.2 + the 0.9 m clearance) — never a
    // free-floating fallback (every trade house fronts a lane).
    const picked: LaneSlot[] = []
    for (const minGap of [8.5, 7.8, 7.35]) {
      for (const s of tradeSlots) {
        if (picked.length >= types.length) break
        if (!picked.every((p) => Math.hypot(p.x - s.x, p.z - s.z) > minGap)) continue
        picked.push(s)
      }
      if (picked.length >= types.length) break
    }
    types.forEach((t, i) => {
      const s = picked[i]
      interactives.push({
        type: t,
        pos: [s.x, s.z],
        rot: s.faceRot,
        door: [s.x + Math.sin(s.faceRot) * 2.55, s.z + Math.cos(s.faceRot) * 2.55],
      })
    })

    // Timbuktu's Djinguereber mosque (design.md §4.4): the authentic 1327
    // Sudano-Sahelian mud landmark. Placed BEFORE the dwelling rows so the
    // procedural fabric grows around it (isFree checks earlier dwellings),
    // which guarantees the landmark a spot in every run.
    if (placeId === 'timbuktu') {
      // Four preferred spots, then a deterministic golden-angle sweep as the
      // GUARANTEE: some seeds fill all four (23/400 measured), and the
      // landmark must stand in every run (design.md §4.4).
      const preferred: Array<[number, number]> = [
        [-13.5, -7.5],
        [13.5, -8.5],
        [-14.5, 12.5],
        [14.5, 13.5],
      ]
      const spots = [...preferred]
      for (let i = 0; i < 48; i++) {
        const a = 0.7 + i * 2.399963
        const r = 11 + (i % 6) * 1.7
        spots.push([Math.cos(a) * r, Math.sin(a) * r])
      }
      for (const [mx, mz] of spots) {
        if (!isFree(mx, mz, 6, 3.6) || onLane(mx, mz, 3.6)) continue
        // The mosque fronts its nearest lane with the portal, and its own
        // forecourt spur ties the portal into the lane network.
        const foot = paths
          .map((p) => closestOnPolyline(p.points, mx, mz))
          .reduce((a, b) => (a.dist < b.dist ? a : b))
        const m = addDwelling('mosque', mx, mz, faceTo(mx, mz, foot.x, foot.z), 3.6, 4.6)
        if (!m) continue
        paths.push({ points: [m.door, [foot.x, foot.z]], width: 1.6 })
        break
      }
    }

    // Dense adobe fabric: houses line every lane on both sides, each
    // fronting it with its door (no free-floating rows — design.md §2.6).
    for (const lane of [mainLane, crossLane, ...alleys]) {
      for (const s of laneSlots(lane.points, 4.7, lane.width / 2 + 2.75)) {
        const x = jitter(s.x, 0.7)
        const z = jitter(s.z, 0.7)
        const r = 1.7 + rand() * 0.5
        if (!isFree(x, z, 4.6, r) || onLane(x, z, r + 0.15)) continue
        const rot = s.faceRot + (rand() - 0.5) * 0.12
        const [px, pz] = doorAt(x, z, r, rot)
        if (!doorReachable(px, pz)) continue // the door must stay on the lane side
        const floors = rand() < 0.28 ? 2 : 1
        addDwelling('box', x, z, rot, r, 2.3 + (floors - 1) * 1.8, floors)
      }
    }
    // Warehouses close the cross lane's ends, doors onto the lane (two in
    // bigger towns).
    const crossEnds: Array<[number, number][]> = [
      [crossLane.points[1], crossLane.points[0]],
      [crossLane.points[crossLane.points.length - 2], crossLane.points[crossLane.points.length - 1]],
    ]
    for (const [prev, end] of size >= 2 ? crossEnds : [crossEnds[0]]) {
      const len = Math.hypot(end[0] - prev[0], end[1] - prev[1]) || 1
      let x = end[0] + ((end[0] - prev[0]) / len) * 6
      let z = end[1] + ((end[1] - prev[1]) / len) * 6
      // Keep the long box fully inside the walkable radius (corner clearance).
      const d = Math.hypot(x, z)
      if (d > radius - 6.5) {
        x *= (radius - 6.5) / d
        z *= (radius - 6.5) / d
      }
      if (!isFree(x, z, 6.5, 4.2) || onLane(x, z, 4.3)) continue
      addDwelling('warehouse', x, z, Math.atan2(end[0] - x, end[1] - z), 4.2, 3)
    }
    // Major cities get a landmark tower on the skyline (design.md §4.1).
    if (size >= 3 && isFree(-11.5, -8.5, 4, 1.1) && !onLane(-11.5, -8.5, 1.5)) {
      addDwelling('tower', -11.5, -8.5, 0, 1.1, 7)
    }
    // Market stalls and tents around the market building.
    const market = interactives.find((it) => it.type === 'market')
    if (market) {
      for (let i = 0; i < 2 + size * 2; i++) {
        const a = rand() * Math.PI * 2
        const r = 4.5 + rand() * 2.5
        const x = market.pos[0] + Math.cos(a) * r
        const z = market.pos[1] + Math.sin(a) * r
        if (!isFree(x, z, 3.2, 1.35) || onLane(x, z, 1.35)) continue
        addDwelling(i % 2 ? 'stall' : 'tent', x, z, rand() * Math.PI * 2, 1.3, 1.9)
      }
      errands.push([market.pos[0], market.pos[1] + 3.2])
    }
    errands.push([0, 3], [jitter(-3, 2), jitter(0, 2)], [jitter(3, 2), jitter(6, 2)])
  } else {
    // Villages follow their people's period-accurate organising principle
    // (design.md §4.5) — researched against the ~1890 record, not one shared
    // template. Ports alone get the dense organic lane fabric.
    const plan = VILLAGE_PLANS[place.peopleId ?? ''] ?? 'compound'
    const chief = interactives[0]
    // Village lanes bend around the chief hut and trading post instead of
    // running through them; a path that TARGETS a door keeps its endpoint.
    const obstacles = interactives
      .filter((it) => it.type !== 'villager')
      .map((it) => ({ x: it.pos[0], z: it.pos[1], r: it.type === 'market' ? 2.9 : 3.35 }))
    const bendLane = (points: Array<[number, number]>, keepEnds = false): Array<[number, number]> => {
      if (!keepEnds) return bendAround(points, obstacles, 0.8)
      const first = points[0]
      const last = points[points.length - 1]
      const relevant = obstacles.filter((o) => {
        const dEnd = Math.min(
          Math.hypot(first[0] - o.x, first[1] - o.z),
          Math.hypot(last[0] - o.x, last[1] - o.z),
        )
        return dEnd > o.r + 0.2
      })
      return bendAround(points, relevant, 0.8)
    }
    const pushPath = (points: Array<[number, number]>, width: number, keepEnds = false) =>
      paths.push({ points: bendLane(points, keepEnds), width })
    // Common paths: plaza→chief, plaza→fire pit; the street plan replaces
    // the plain exit path with its wide cleared axis.
    if (plan !== 'street') pushPath([center, [0, 24]], 2.2)
    pushPath([center, [chief.pos[0], chief.pos[1] + 3.4]], 1.6, true)
    pushPath([center, [-3.5, 2.5]], 1.1)
    errands.push([-2.2, 3.4], [jitter(1.5, 2), jitter(4, 2)], [chief.pos[0], chief.pos[1] + 4])

    const southGap: [number, number] = [Math.PI / 2, 0.55] // spawn corridor
    const chiefGap: [number, number] = [-Math.PI / 2, 0.5]

    if (plan === 'ring') {
      // Central Cattle Pattern / enkang: huts on a ring around the central
      // cattle enclosure inside the perimeter fence; the chief's great hut
      // already sits opposite the south gate. Thorn rings (enkang) carry
      // extra gates — one per family head.
      const R = 15.5
      const gates: Array<[number, number]> = [[southGap[0], 0.3], [chiefGap[0], 0.22]]
      if (style.fence === 'thorn') gates.push([0.35, 0.2], [Math.PI - 0.4, 0.2])
      const n = style.dwellingCount + 4
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.12
        if (Math.abs(((a - southGap[0] + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.6) continue
        if (Math.abs(((a - chiefGap[0] + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.55) continue
        const x = jitter(Math.cos(a) * R, 1.4)
        const z = jitter(Math.sin(a) * R, 1.4)
        const r = 1.5 + rand() * 0.4
        if (!isFree(x, z, 3.4, r) || onLane(x, z, r)) continue
        const d = addDwelling('hut', x, z, faceTo(x, z, 0, 0), r, 1.5 + rand() * 0.3)
        if (d && dwellings.length % 2 === 0) pushPath([center, d.door], 1.0, true)
      }
      fences.push({
        kind: style.fence === 'none' ? 'thorn' : style.fence,
        posts: fenceRing(0, 0.5, R + 4, 1.25, gates),
      })
      pen = { x: 6.8, z: 2.2, r: 3.4 }
      fences.push({ kind: 'woven', posts: fenceRing(pen.x, pen.z, pen.r, 0.85, [[Math.PI, 0.35]]) })
      errands.push([pen.x - pen.r - 0.8, pen.z])
    } else if (plan === 'street') {
      // Congo-basin street village: ONE cleared, swept axis with two facing
      // house rows in front of the forest wall; a palaver shelter sits at
      // the axis edge. The axis ends before the chief's hut.
      const axisEnd: [number, number] = [chief.pos[0] * 0.4, chief.pos[1] + 5.2]
      const axis: PathDef = { points: bendLane(windingPoints(rand, [0, 26], axisEnd, 1.1, 5), true), width: 7 }
      paths.push(axis)
      for (const s of laneSlots(axis.points, 4.2, axis.width / 2 + 2.2)) {
        const x = jitter(s.x, 0.5)
        const z = jitter(s.z, 0.5)
        const r = 1.3 + rand() * 0.3
        if (!isFree(x, z, 3.4, r) || onLane(x, z, r)) continue
        const [px, pz] = doorAt(x, z, r, s.faceRot)
        if (!doorReachable(px, pz)) continue // every door opens onto the street
        addDwelling('hut', x, z, s.faceRot, r, 1.9 + rand() * 0.5)
      }
      const mid = axis.points[2]
      const shX = mid[0] + (rand() < 0.5 ? -1 : 1) * (axis.width / 2 + 2.1)
      if (isFree(shX, mid[1], 3, 1.4) && !onLane(shX, mid[1], 1.4)) {
        addDwelling('shed', shX, mid[1], faceTo(shX, mid[1], mid[0], mid[1]), 1.4, 1.7)
      }
      errands.push([jitter(0, 2), jitter(10, 4)])
    } else if (plan === 'compound') {
      // Sahel compound cluster: walled family enclosures around the meeting
      // ground, granaries inside, a lane to each compound ENTRANCE.
      // The Bemba cluster the same way but WITHOUT a wall: a stockade is
      // attested for their victims (Mambwe, Lungu), not for Bemba villages
      // themselves (docs/peoples-1890.md §5.1), so none is invented here.
      const walled = style.fence !== 'none' && place.peopleId !== 'bemba'
      // TWO GEOMETRY RULES HOLD THIS PLAN TOGETHER (work-order 604), because the
      // wedge between two colliders is where a traveller is lost:
      //   1. A compound's palisade ENCLOSES its own huts. It used to be a fixed
      //      6.2 m ring while the huts stood up to 5 m out with a 2.5 m roof, so
      //      every second hut grew through its own wall — and the slot between
      //      the hut's body and the wall is narrower than a man, which is a trap,
      //      not a tight spot. The ring is sized from the huts it holds.
      //   2. No two palisades cross. The reported traveller was pressed into
      //      exactly such a crossing of two Bambara compounds: two shallow arcs
      //      running through each other leave a sliver with no free ground in it
      //      at all. The compounds sit evenly around the plaza and each is pushed
      //      outward until its ring keeps a walkable lane from every ring already
      //      standing; one that cannot be seated is left out rather than crossed.
      const requested = 4 + (rand() < 0.7 ? 1 : 0)
      const startAngle = rand() * Math.PI * 2
      const hutBody = (r: number, h: number) =>
        dwellingCircleRadius({ x: 0, z: 0, rot: 0, kind: 'hut', r, h, floors: 1, door: [0, 0] }, style) ?? r
      const placedRings: Array<{ x: number; z: number; a: number; ring: number }> = []
      for (let c = 0; c < requested; c++) {
        const a = startAngle + (c / requested) * Math.PI * 2 + (rand() - 0.5) * 0.1
        // The family's huts, drawn once as offsets from the compound's own centre
        // so the ring can be sized around them and the compound can still move.
        const wanted = 2 + Math.floor(rand() * 2)
        const seats: Array<{ angle: number; dist: number; r: number; h: number }> = []
        for (let t = 0; t < wanted * 12 && seats.length < wanted; t++) {
          const angle = Math.PI + ((t % wanted) - (wanted - 1) / 2) * 1.15 + (rand() - 0.5) * 0.6
          const dist = 2.8 + rand() * 1.6
          const r = 1.35 + rand() * 0.5
          const h = 1.9 + rand() * 0.5
          const dx = Math.cos(angle) * dist
          const dz = Math.sin(angle) * dist
          // Against its own siblings: the global `isFree` cannot see them yet.
          // The SAME window rule it applies (§2.6, a 0.9 m gap between bodies),
          // so a compound is packed no tighter and no looser than the village.
          const fits = seats.every((o) => {
            const od = Math.hypot(Math.cos(o.angle) * o.dist - dx, Math.sin(o.angle) * o.dist - dz)
            return od > Math.max(3.2 * 0.55, r + 0.9) + o.r
          })
          if (fits) seats.push({ angle, dist, r, h })
        }
        // Rule 1: the wall stands clear of every roof it encloses, with room to
        // walk between the two.
        const ring = seats.reduce(
          (m, sIt) => Math.max(m, sIt.dist + hutBody(sIt.r, sIt.h) + FENCE_PANEL_RADIUS.woven + COMPOUND_WALL_GAP),
          COMPOUND_RING_MIN,
        )
        // Rule 2: push outward until the ring clears every ring already standing.
        let cr = 13.5 + rand() * 4
        const clears = (x: number, z: number) =>
          placedRings.every(
            (p) =>
              Math.hypot(x - p.x, z - p.z) >=
              ring + p.ring + 2 * FENCE_PANEL_RADIUS.woven + COMPOUND_RING_CORRIDOR,
          ) &&
          // And clear of the functional buildings: a palisade drawn straight
          // through the chief's hut is the same trap seen from the other side,
          // and it seals the door the audience is held at (design.md §2.6).
          interactives.every((it) => {
            if (it.type === 'villager') return true
            const rInt = interactiveCircleRadius(it.type, style)
            return (
              Math.hypot(x - it.pos[0], z - it.pos[1]) >=
              ring + rInt + FENCE_PANEL_RADIUS.woven + COMPOUND_WALL_GAP
            )
          })
        let cx = Math.cos(a) * cr
        let cz = Math.sin(a) * cr
        for (let tries = 0; tries < 16 && !clears(cx, cz); tries++) {
          cr += 0.5
          cx = Math.cos(a) * cr
          cz = Math.sin(a) * cr
        }
        if (!clears(cx, cz) || cr + ring > PLACE_RADIUS - 2) continue
        placedRings.push({ x: cx, z: cz, a, ring })
        for (const seat of seats) {
          const x = cx + Math.cos(a + seat.angle) * seat.dist
          const z = cz + Math.sin(a + seat.angle) * seat.dist
          if (!isFree(x, z, 3.2, seat.r) || onLane(x, z, seat.r)) continue
          addDwelling('hut', x, z, faceTo(x, z, cx, cz), seat.r, seat.h)
        }
        if (style.granaries && isFree(cx + 2, cz + 2, 2.2, 0.85) && !onLane(cx + 2, cz + 2, 1.2)) {
          addDwelling('granary', cx + 2, cz + 2, faceTo(cx + 2, cz + 2, cx, cz), 0.85, 1.1)
        }
        const openingAngle = Math.atan2(-cz, -cx)
        if (walled) {
          // Fence around the compound, opening toward the plaza.
          fences.push({
            kind: style.fence === 'stone' ? 'stone' : 'woven',
            posts: fenceRing(cx, cz, ring, style.fence === 'stone' ? 1.0 : 0.9, [[openingAngle, 0.7]]),
          })
        }
        const gx = cx + Math.cos(openingAngle) * ring
        const gz = cz + Math.sin(openingAngle) * ring
        pushPath([center, [gx, gz]], 1.3)
        if (c < 2) errands.push([gx, gz])
      }
      // Top up the family huts where the jitter left a compound thin: a hut
      // rejected by a lane, a neighbour or the plaza corridor would otherwise
      // make the whole village read as half-abandoned, and how densely a Sahel
      // compound is built is a design decision (design.md §4.5), not a dice roll.
      const familyHuts = () => dwellings.filter((d) => d.kind === 'hut').length
      const hutTarget = Math.max(7, placedRings.length * 2)
      for (let t = 0; t < 240 && placedRings.length > 0 && familyHuts() < hutTarget; t++) {
        const compound = placedRings[t % placedRings.length]
        const ha = compound.a + Math.PI + (rand() - 0.5) * 3.4
        const r = 1.3 + rand() * 0.6
        const h = 1.9 + rand() * 0.5
        // Inside its own wall like every other hut of the compound.
        const hd = Math.min(3.1 + rand() * 1.9, compound.ring - FENCE_PANEL_RADIUS.woven - COMPOUND_WALL_GAP - hutBody(r, h))
        if (hd < 1.5) continue
        const x = compound.x + Math.cos(ha) * hd
        const z = compound.z + Math.sin(ha) * hd
        if (!isFree(x, z, 3.2, r) || onLane(x, z, r) || !clearOfFences(x, z, hutBody(r, h))) continue
        addDwelling('hut', x, z, faceTo(x, z, compound.x, compound.z), r, h)
      }
      // A shed and a drying rack scattered between the compounds.
      for (let i = 0; i < 6 && dwellings.filter((d) => d.kind === 'shed').length < 2; i++) {
        const a = rand() * Math.PI * 2
        const r = 9 + rand() * 8
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        if (!isFree(x, z, 3, 1.1) || onLane(x, z, 1.45) || !clearOfFences(x, z, 1.45)) continue
        addDwelling('shed', x, z, rand() * Math.PI * 2, 1.1, 1.4)
      }
    } else if (plan === 'scatter') {
      // Dispersed camp: loose family groups of tents/small huts with
      // irregular spacing — no lanes, no shared fence.
      const kind: DwellingKind = place.peopleId === 'tuareg' ? 'tent' : 'hut'
      const groups = 4 + (rand() < 0.5 ? 1 : 0)
      let placed = 0
      for (let g = 0; g < groups; g++) {
        const ga = (g / groups) * Math.PI * 2 + 0.7 + (rand() - 0.5) * 0.5
        const gr = 9.5 + rand() * 8
        const gx = Math.cos(ga) * gr
        const gz = Math.sin(ga) * gr
        const members = 2 + Math.floor(rand() * 3)
        let seated = 0
        for (let t = 0; t < members * 8 && seated < members && placed < style.dwellingCount + 2; t++) {
          const x = jitter(gx, 8)
          const z = jitter(gz, 8)
          const r = kind === 'tent' ? 1.3 : 1.2 + rand() * 0.3
          if (!isFree(x, z, 3.6, r) || onLane(x, z, r)) continue
          addDwelling(kind, x, z, faceTo(x, z, gx, gz) + (rand() - 0.5) * 0.8, r, kind === 'tent' ? 1.6 : 1.5 + rand() * 0.3)
          placed++
          seated++
        }
      }
      if (place.peopleId === 'tuareg') {
        // Thornbrush goat pen at the camp edge.
        pen = { x: -11, z: 9, r: 2.6 }
        fences.push({ kind: 'thorn', posts: fenceRing(pen.x, pen.z, pen.r, 0.9, [[Math.atan2(-pen.z, -pen.x), 0.4]]) })
      }
    } else if (plan === 'ksar') {
      // Fortified Berber block: flat-roofed houses packed on two narrow
      // winding lanes inside a perimeter wall with one south gate; the
      // communal agadir tower rises near the heart of the block.
      const laneA: PathDef = { points: bendLane(windingPoints(rand, [jitter(-5.6, 1), 15], [jitter(-5.2, 1.4), -9.5], 0.9, 4)), width: 1.9 }
      const laneB: PathDef = { points: bendLane(windingPoints(rand, [jitter(5.5, 1), 15], [jitter(5.7, 1.4), -9.5], 0.9, 4)), width: 1.9 }
      const laneC: PathDef = { points: bendLane(windingPoints(rand, [-10, jitter(2, 1)], [10, jitter(1, 1)], 0.7, 3)), width: 1.7 }
      paths.push(laneA, laneB, laneC)
      for (const lane of [laneA, laneB, laneC]) {
        for (const s of laneSlots(lane.points, 3.8, lane.width / 2 + 2.3)) {
          const x = jitter(s.x, 0.4)
          const z = jitter(s.z, 0.4)
          const r = 1.2 + rand() * 0.2
          if (!isFree(x, z, 3.2, r) || onLane(x, z, r)) continue
          const [px, pz] = doorAt(x, z, r, s.faceRot)
          if (!doorReachable(px, pz)) continue
          const floors = rand() < 0.25 ? 2 : 1
          addDwelling('box', x, z, s.faceRot, r, 2.1 + (floors - 1) * 1.7, floors)
        }
      }
      // Fill the block: infill houses between the lanes keep the ksar dense,
      // each fronting its nearest lane.
      for (let t = 0; t < 40 && dwellings.filter((d) => d.kind === 'box').length < 11; t++) {
        const x = (rand() < 0.5 ? -1 : 1) * (2.5 + rand() * 7)
        const z = -8 + rand() * 21
        const r = 1.25 + rand() * 0.25
        if (!isFree(x, z, 3.0, r) || onLane(x, z, r)) continue
        const foot = [laneA, laneB, laneC]
          .map((p) => closestOnPolyline(p.points, x, z))
          .reduce((a, b) => (a.dist < b.dist ? a : b))
        const rot = faceTo(x, z, foot.x, foot.z)
        const [px, pz] = doorAt(x, z, r, rot)
        if (!doorReachable(px, pz)) continue
        addDwelling('box', x, z, rot, r, 2.0 + rand() * 0.3)
      }
      for (const [ax, az] of [[4.2, -2.5], [-4.8, -3.5], [6.5, 3.5]] as const) {
        if (!isFree(ax, az, 3.2, 1.2) || onLane(ax, az, 1.6)) continue
        addDwelling('tower', ax, az, 0, 1.2, 5.5)
        break
      }
      fences.push({ kind: 'stone', posts: fenceRing(0, 0.5, 17.5, 1.0, [[southGap[0], 0.3]]) })
    } else if (plan === 'riverstrip') {
      // Nile strip village: one river-parallel lane with flat-roofed houses
      // banding it on both sides, a short cross alley to the common ground.
      const shore: PathDef = {
        points: bendLane(windingPoints(rand, [-19, jitter(-6, 1.5)], [19, jitter(-5, 1.5)], 1.6, 5)),
        width: 2.4,
      }
      paths.push(shore)
      pushPath([center, [0, -5.5]], 1.8)
      for (const s of laneSlots(shore.points, 4.2, shore.width / 2 + 2.3)) {
        const x = jitter(s.x, 0.5)
        const z = jitter(s.z, 0.5)
        const r = 1.4 + rand() * 0.3
        if (!isFree(x, z, 3.8, r) || onLane(x, z, r)) continue
        const [px, pz] = doorAt(x, z, r, s.faceRot)
        if (!doorReachable(px, pz)) continue
        const floors = rand() < 0.15 ? 2 : 1
        addDwelling('box', x, z, s.faceRot, r, 2.1 + (floors - 1) * 1.7, floors)
      }
      errands.push([jitter(-9, 3), -5.5], [jitter(9, 3), -5.5])
    } else {
      // Swahili coast row: rectangular gable houses in a double row along
      // one sandy shore path under the palms.
      const shore: PathDef = {
        points: bendLane(windingPoints(rand, [-18, jitter(7, 2)], [18, jitter(-3, 2)], 2.0, 5)),
        width: 2.0,
      }
      paths.push(shore)
      for (const s of laneSlots(shore.points, 4.5, shore.width / 2 + 2.5)) {
        const x = jitter(s.x, 0.6)
        const z = jitter(s.z, 0.6)
        const r = 1.5 + rand() * 0.3
        if (!isFree(x, z, 3.8, r) || onLane(x, z, r)) continue
        const [px, pz] = doorAt(x, z, r, s.faceRot)
        if (!doorReachable(px, pz)) continue
        addDwelling('box', x, z, s.faceRot, r, 2.2)
      }
      errands.push([jitter(-8, 3), jitter(5, 2)], [jitter(8, 3), jitter(-1, 2)])
    }
  }

  // THE LOOSE DRESSING KEEPS ITS DISTANCE (work-order 604). A tree and a boulder
  // dropped independently can end up 0.4 m apart, and that slot is narrower than
  // anyone who walks: a villager routed past it is caught in the notch and a
  // traveller pressed into it cannot walk out. Every loose object therefore keeps
  // a walkable gap from every other one — `isFree` covers the buildings, this
  // covers the dressing among itself.
  // A POST STANDING IN A BUILDING IS PULLED (work-order 604). Some plans raise
  // their fence after the dwellings — a Tuareg camp windbreak, a kraal ring — so
  // `isFree` cannot keep the two apart, and a panel that runs through a tent
  // leaves a slot narrower than a man on either side of the crossing. The post is
  // dropped instead: the drawn run and the collider run are cut from the same
  // list, so what is left is an opening beside the building, which is what a
  // fence meeting a wall looks like anyway.
  for (const f of fences) {
    f.posts = f.posts.filter((post) =>
      dwellings.every((d) => {
        const body = dwellingCircleRadius(d, style) ?? d.r + 0.3
        return Math.hypot(post[0] - d.x, post[1] - d.z) > body + FENCE_PANEL_RADIUS[f.kind]
      }),
    )
  }

  // --- Collision set: every solid object becomes one or more circles ------
  const colliders: Collider[] = []
  interactives.forEach((it) => {
    if (it.type === 'villager') {
      colliders.push({ x: it.pos[0], z: it.pos[1], r: 0.45 })
    } else if (place.kind === 'port') {
      // The building's yaw travels in the layout data (it fronts its lane).
      colliders.push(boxCollider(it.pos[0], it.pos[1], 2.5, 2.0, it.rot ?? 0))
    } else {
      // Chief hut and the smaller trading post (both round village huts).
      colliders.push({ x: it.pos[0], z: it.pos[1], r: interactiveCircleRadius(it.type, style) })
    }
  })
  for (const d of dwellings) {
    switch (d.kind) {
      case 'box':
        colliders.push(boxCollider(d.x, d.z, d.r, d.r * 0.875, d.rot))
        break
      case 'warehouse':
        colliders.push(boxCollider(d.x, d.z, d.r, 2.3, d.rot))
        break
      case 'mosque':
        colliders.push(boxCollider(d.x, d.z, d.r, d.r * 0.8, d.rot))
        break
      default:
        // Round bodies: the wall, widened where the roof overhangs low (349).
        colliders.push({ x: d.x, z: d.z, r: dwellingCircleRadius(d, style) ?? d.r + 0.3 })
    }
  }
  for (const f of fences) colliders.push(...fenceColliders(f))
  // The two entries the play rocks occupy are remembered, because the stage they
  // draw is derived from bank points that have not settled yet: once they have,
  // the settled pair is written back into these same slots rather than appended
  // a second time.
  const playRockSlots: number[] = []
  if (playRocks) {
    playRockSlots.push(colliders.length, colliders.length + 1)
    colliders.push({ x: playRocks.upstream.x, z: playRocks.upstream.z, r: playRocks.r })
    colliders.push({ x: playRocks.downstream.x, z: playRocks.downstream.z, r: playRocks.r })
  }
  if (place.kind === 'village') {
    // The fire pit alone (work-order 604). The cook used to carry a collider of
    // her own 1.56 m from the fire's centre, which overlapped the fire's 1.3 m by
    // a finger's breadth — and the notch where two circles cross is narrower than
    // a walker, so an errand villager sent past the fire was caught in it. Her own
    // collider bought nothing: she kneels INSIDE the fire's stand-off (1.3 + the
    // traveller's 0.35), so nobody could reach her spot in the first place.
    colliders.push({ x: VILLAGE_FIRE[0], z: VILLAGE_FIRE[1], r: 1.3 })
    colliders.push({ x: -8.5, z: -7, r: 1.0 }) // weaver's loom
    // Village-life props (design.md §19; positions from PlaceLife).
    colliders.push({ x: VILLAGE_SPOTS.talkers[0], z: VILLAGE_SPOTS.talkers[1], r: 0.85 })
    colliders.push({ x: VILLAGE_SPOTS.pounder[0], z: VILLAGE_SPOTS.pounder[1], r: 0.55 })
    // The drummer sits behind TWO drums now (point 486), so his blob covers the
    // pair the renderer draws, not the single drum it used to be.
    colliders.push({ x: VILLAGE_SPOTS.drummer[0], z: VILLAGE_SPOTS.drummer[1], r: 0.8 })
    colliders.push({ x: VILLAGE_SPOTS.well[0], z: VILLAGE_SPOTS.well[1], r: 0.75 })
  } else {
    colliders.push({ x: PORT_TALKERS[0], z: PORT_TALKERS[1], r: 0.85 }) // chatting pair
  }


  // THE CHILDREN'S ROAMING QUARTER (work-order 481.4, moved here by 688). It is
  // decided from the settlement's BUILT bodies, BEFORE anything loose is
  // scattered and BEFORE the water path is laid, and that order is item 6 of the
  // point: where the three teaching areas cannot all clear each other, THE
  // ADULTS move. The children's words hang on where they stand — at the rocks,
  // at the water — so the quarter is fixed first and the adults' own places, the
  // water path's head and the three work sites, are fitted around it.
  //
  // It is decided in the LAYOUT rather than in the scene because those places are
  // placed against it, and a quarter derived once there and once here would be
  // two quarters (points 129/378). The dressing is then scattered AROUND it, so
  // the chase is watched over open ground rather than between boulders.
  // The fabric as the quarter's search asks about it, bucketed once: the search
  // samples thousands of points and each used to walk the whole collider set.
  const standableAt = colliderBuckets(colliders, WALKER_RADIUS)
  const playGround: PlaceLayout['playGround'] =
    place.kind === 'village'
      ? childPlayGround(
          villageAdultStations(VILLAGE_FIRE),
          Math.max(1, radius - WALKER_RADIUS * 2),
          balance.villageLife.tag.playRadius,
          balance.communication.hearingRadius,
          {
            free: (px, pz) => standingClear(standableAt(px, pz), px, pz, WALKER_RADIUS),
            fabric: fabricOf(dwellings, interactives),
          },
        )
      : null
  /** Whether a body of radius `r` would stand in the children's quarter. */
  const inPlayGround = (x: number, z: number, r: number) =>
    !!playGround && Math.hypot(x - playGround.x, z - playGround.z) < playGround.radius + r
  /**
   * ... or on their WAY DOWN TO THE WATER (work-order 688). The bank round walks
   * the whole group from the quarter to the descent and back again once a cycle,
   * and it walks it steered LOCALLY: work-order 687 took the wedge carve off
   * every bank phase, so nothing but a child's own steering keeps it out of a
   * pocket on that route. The route is therefore kept clear the way the running
   * lane is — one rule, read by every scatter, rather than a carve applied
   * afterwards.
   */
  const onWayToWater = (x: number, z: number, r: number) => {
    if (!playGround || !bank) return false
    const d = closestOnPolyline(
      [[playGround.x, playGround.z], [bank.bank.x, bank.bank.z]],
      x,
      z,
    ).dist
    return d < BANK_PLAY_LANE_HALF + r
  }
  /**
   * ... and whether an ADULT PLACE would stand inside their earshot of it.
   *
   * The margin is the hearing radius PLUS a walker's arrival radius, because
   * what has to stay outside the earshot is not the anchor but the position a
   * man may SPEAK from: he counts as arrived, and his word falls, anywhere
   * within `WORK_ARRIVE_RADIUS` of the place he was sent to. Measuring the
   * anchor alone let a site sitting exactly on the floor put the actual speaker
   * inside the children's earshot (GPT-5.6 Sol, first cross-vendor round, A4).
   */
  const ADULT_SPEECH_MARGIN = balance.communication.hearingRadius + WORK_ARRIVE_RADIUS
  /**
   * How far a spot stands from the NEAREST place a child speaks: the roaming
   * quarter's rim, either play rock, and the descent they gather at.
   *
   * One function for both adult places. The water path's head used to be judged
   * against the roaming quarter ALONE, so an outer head could stand within
   * hearing of children on the bank while the dig sites — judged against all
   * three — could not (GPT-5.6 Sol, confirming round, hearing separation).
   *
   * WHAT IT DOES NOT COVER, AND WHERE THAT IS ANSWERED. These are the three
   * places the children BELONG; they also WALK between two of them, and that
   * walk sweeps most of the village. Keeping the work sites clear of it as well
   * would leave no ground to dig on, so the walk is answered where it happens
   * instead: `adultWork.ts` holds the digging word while a child is in earshot
   * of the speaker, and it falls on a later stroke.
   */
  const toChildren = (x: number, z: number) => {
    let best = Infinity
    if (playGround) best = Math.min(best, Math.hypot(x - playGround.x, z - playGround.z) - playGround.radius)
    for (const p of playRocks ? [playRocks.upstream, playRocks.downstream] : []) {
      best = Math.min(best, Math.hypot(x - p.x, z - p.z))
    }
    if (bank) best = Math.min(best, Math.hypot(x - bank.bank.x, z - bank.bank.z))
    return best
  }
  const inPlayEarshot = (x: number, z: number) => toChildren(x, z) < ADULT_SPEECH_MARGIN

  // THE WATER PATH IS LAID LAST OF ALL THE ADULTS' PLACES (work-order 688). A
  // lane forced through the house band BEFORE the plan costs it a dwelling
  // (measured at nubian-village, seed 42: seven boxes became six), so the track
  // is fitted to the settlement instead: its FOOT is fixed at the water, and its
  // HEAD is swept round the bank's bearing until the straight walk between the
  // two clears every building, the children's running lane AND their roaming
  // quarter's earshot. A carrier's track is a straight worn line, not a lane that
  // bends round three huts, and a straight one is also what reads as a path to
  // the river from inside the village.
  if (waterPath) {
    // THE WALK IS TESTED AGAINST THE FABRIC AS IT IS DRAWN — ALL OF IT. It used
    // to be tested against the dwellings as CIRCLES of radius `d.r`, which a
    // box, a warehouse and a mosque all reach past at their corners, and the
    // compound fences were not in the reckoning at all, so an accepted track
    // could cross a drawn wall. It asks `standingClear` now, over the whole
    // collider set — the same predicate the carrier's own step obeys.
    //
    // AND WHERE THAT LEAVES NO WALK, THERE IS NO PATH, which is this point's own
    // rule: a track drawn through a wall teaches the wrong thing, and no
    // teaching beats a wrong one. Measured over nine villages at six seeds, two
    // layouts pay that price — bambara at 7 and at 1337 — and the village the
    // communication slice is actually played in is not one of them. Work-order
    // 1045 removes the cause rather than the rule: either the track may bend
    // once at the gap, or the compound builder opens a gate where it crosses.
    // TWO CLEARANCES, EACH WITH ITS OWN REASON. Against solid fabric the rule is
    // that the DRAWN track never overlaps it — half the lane's width — and the
    // carrier walking its middle is narrower than that, so nothing further is
    // owed. Against the children's running lane the rule is not overlap but
    // SEPARATION, so a body's width is added: the two teachings have to stay
    // apart, not merely not intersect.
    const drawnHalf = WATER_PATH_WIDTH / 2
    const laneClearance = drawnHalf + WALKER_RADIUS
    const foot = waterPath.foot
    const clearRun = (head: BankPoint) => {
      // AND IT NEVER CROSSES THE CHILDREN'S RUNNING LANE. A carrier walking
      // through the middle of a run would be read as part of the game, and the
      // two teachings have to stay separable. Sampled along the whole walk, not
      // only at its foot: the straight line from the village middle to the water
      // cuts the lane's chord even when both of its ENDS lie clear of it.
      // SAMPLED BY LENGTH, NOT BY A FIXED COUNT. Forty-eight samples over a
      // twenty-metre walk leave gaps of 0.4 m, and a fence post or a box corner
      // that overlaps the lane by less than that slips between two of them
      // (GPT-5.6 Sol, confirming round, path clearance). A step of a tenth of a
      // metre is finer than the thinnest body in the set.
      const runLength = Math.hypot(foot.x - head.x, foot.z - head.z)
      const steps = Math.max(48, Math.ceil(runLength / 0.1))
      // The fabric this walk could possibly meet, once per candidate rather than
      // once per sample: three hundred samples over a settlement's whole collider
      // set, for every bearing of the sweep, was the single most expensive thing
      // in the layout. `collidersNearRun` throws away only what the corridor
      // cannot reach, so the answer is the same one.
      const near = collidersNearRun(colliders, head.x, head.z, foot.x, foot.z, drawnHalf)
      for (let t = 0; t <= steps; t++) {
        const x = head.x + (foot.x - head.x) * (t / steps)
        const z = head.z + (foot.z - head.z) * (t / steps)
        if (inBankPlayLane(playRocks, x, z, laneClearance)) return false
        if (!standingClear(near, x, z, drawnHalf)) return false
      }
      return true
    }
    // Swept from the FOOT's own bearing outward, so the track is the straight
    // walk to the water wherever the plan and the children's lane allow one.
    const base = Math.atan2(foot.z, foot.x)
    // Straight out toward the water first, then to either side in one-degree
    // steps, and at each bearing a little nearer and a little further out — the
    // first head that gives a clear walk wins, so the track stays as near the
    // direct line as the plan and the children's lane allow.
    let head: BankPoint | null = null
    for (let step = 0; step <= WATER_PATH_HEAD_SWEEP && !head; step++) {
      for (const sign of step === 0 ? [1] : [-1, 1]) {
        const a = base + sign * step * (Math.PI / 180)
        for (const r of WATER_PATH_HEAD_RADII) {
          const cand = { x: Math.cos(a) * r, z: Math.sin(a) * r }
          if (!isFree(cand.x, cand.z, 2.0, WALKER_RADIUS)) continue
          // NO ADULT VOICE INSIDE THE CHILDREN'S EARSHOT (item 6): both water
          // carriers speak at the head, so the head keeps the hearing radius from
          // the quarter the children roam.
          if (inPlayEarshot(cand.x, cand.z)) continue
          if (!clearRun(cand)) continue
          head = cand
          break
        }
        if (head) break
      }
    }
    // A settlement that can give no clear walk gives NO water path at all: an
    // adult whose RIVER falls on a track through the children's running lane
    // teaches the wrong thing, and no teaching beats a wrong one. Its adults then
    // keep only their digging, exactly as a village without a river does.
    // Nothing shipped reaches this — `layout.test.ts` sweeps every river village
    // at every seed and finds a head for each.
    if (!head) {
      // MEASURED, NAMED, AND NOT ASSERTED. Two of the swept layouts reach this,
      // and an alarm that fires on a known, filed condition is one its reader
      // learns to skip. `layout.test.ts` names exactly which layouts pay it and
      // points at work-order 1045; a THIRD one appearing is what that case
      // catches.
      waterPath = null
    } else {
      waterPath.head = head
      paths.push({ points: [[head.x, head.z], [foot.x, foot.z]], width: WATER_PATH_WIDTH })
    }
  }

  // THE WAY OUT (work-order 688), read off the BUILT fabric before a single
  // loose object is placed: the huts, the compound fences, the lanes and the
  // functional buildings are all standing by now, and none of them is moved for
  // it. The play rocks are settled onto the bank further down, which the bank's
  // own arc keeps out of the crossing anyway.
  const wayOut = pickWayOut(colliders, radius, bank)
  devAssert(
    wayOut !== null,
    'way-out-missing',
    () => `${place.id}: the built fabric leaves no crossing of the boundary free`,
  )

  const flora: PlaceLayout['flora'] = []
  const rocks: PlaceLayout['rocks'] = []
  // The TRAVELLER's width, not the villager's: he is the wider of the two and
  // the one who cannot be nudged free by the game.
  const dressingGap = 2 * PLAYER_RADIUS
  const clearOfDressing = (x: number, z: number, bodyR: number) =>
    flora.every((t) => Math.hypot(x - t.x, z - t.z) > 0.45 + bodyR + dressingGap) &&
    rocks.every(([rx, rz, rs]) => Math.hypot(x - rx, z - rz) > 0.35 + rs * 0.5 + bodyR + dressingGap) &&
    // AND OUT OF THE CHILDREN'S LANE (work-order 687). A boulder dropped between
    // the two play rocks narrows the running ground the game needs, and the pair
    // themselves are solid: the lane test covers both, because the corridor runs
    // from one rock centre to the other.
    !inBankPlayLane(playRocks, x, z, bodyR) &&
    // AND OUT OF THE CHILDREN'S ROAMING QUARTER (work-order 688). The quarter is
    // fixed before the scatter, so this is a one-way rule and not a circle, and
    // it is what keeps the chase on ground the player can see into — a boulder
    // field the group shuffles between is point 480's own evidence.
    // The walker's own width is added to the body's: a stone excluded by its own
    // radius alone can still sit near enough OUTSIDE the disc to make the rim
    // unstandable, and the openness the quarter was chosen for is measured on
    // ground that is standable (GPT-5.6 Sol, first cross-vendor round, B4).
    !inPlayGround(x, z, bodyR + WALKER_RADIUS) &&
    !onWayToWater(x, z, bodyR)
  for (let i = 0; i < 48 && flora.length < 9; i++) {
    const angle = rand() * Math.PI * 2
    const r = 8 + rand() * 18
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (!isFree(x, z, 3.5) || onLane(x, z, 0.5) || !clearOfDressing(x, z, 0.45)) continue
    flora.push({ x, z, h: 3 + rand() * 2 })
  }

  for (let i = 0; i < 40 && rocks.length < 14; i++) {
    const a = rand() * Math.PI * 2
    const r = 6 + rand() * (radius + 6)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const s = 0.3 + rand() * 0.7
    if (!isFree(x, z, 2) || onLane(x, z, 0.35 + s * 0.5)) continue
    if (!clearOfDressing(x, z, 0.35 + s * 0.5)) continue
    rocks.push([x, z, s])
  }

  // THE CROSSING IS CLEARED (work-order 688), and it is cleared by a FILTER
  // rather than by a rule inside the two loops above. A rejection there would
  // draw the next candidate's height from a different place in the seeded
  // stream, which moves EVERY later object in the settlement: measured at the
  // Bambara village, one refused bush replaced all fourteen boulders, an adult's
  // station with them, and one window of the children's bank game then carried
  // no runner past the traveller at all. Filtering afterwards removes exactly
  // what stands in the way out and leaves the rest of the village where it was.
  for (let i = flora.length - 1; i >= 0; i--)
    if (onWayOut(wayOut, radius, flora[i].x, flora[i].z, 0.45)) flora.splice(i, 1)
  for (let i = rocks.length - 1; i >= 0; i--)
    if (onWayOut(wayOut, radius, rocks[i][0], rocks[i][1], 0.35 + rocks[i][2] * 0.5)) rocks.splice(i, 1)

  // ... and the loose dressing joins them once it has been scattered.
  for (const t of flora) colliders.push({ x: t.x, z: t.z, r: 0.45 })
  for (const [x, z, s] of rocks) colliders.push({ x, z, r: 0.35 + s * 0.5 })

  // NO COLLIDER STANDS AT THE WATER (work-order 584). Work-order 482 had fenced
  // the waterline with an invisible panel so the last step could not carry the
  // traveller out of the settlement; what the player met was a wall in the
  // river, a metre short of the bank the village exists to let him stand at.
  // The rule now lives where the walkable region is defined (`boundary.ts`): he
  // walks down the drawn shore and wades to the depth `riverBank.ts` names, and
  // past it the boundary simply ends, exactly as it does on every other bearing.

  // Every errand target a walker heads for must sit on free ground it can also
  // LEAVE (point 155): a jitter (or a stall/rock beside it) can drop a point
  // into a pocket. Nudge any such point to the nearest usable spot against the
  // full collider set, so no inhabitant walks into a wedge it cannot escape.
  for (let i = 0; i < errands.length; i++) {
    errands[i] = nudgeToFree(colliders, errands[i][0], errands[i][1], WALKER_RADIUS)
  }

  // The bank a villager is SENT to obeys the same rule (point 155): it has to
  // be ground the figure fits on against the full collider set — the water wall
  // and whatever the dressing dropped near the shore included.
  if (bank) {
    // THE PLAY ROCKS ARE OUT OF THE PROBE, and have to be: they are derived from
    // the very endpoints being settled and move with them, so letting them block
    // the search would have an endpoint refuse a step because of a rock that
    // would have taken the same step. Left in, the silent three-metre search can
    // run out without finding free ground that was there all along.
    const staged = new Set(playRockSlots)
    const probe = playRockSlots.length ? colliders.filter((_, i) => !staged.has(i)) : colliders
    settleBankPoints(bank, (x, z) => spawnPointFree(probe, x, z, WALKER_RADIUS))
    // AND THE STAGE FOLLOWS THE BANK IT IS DERIVED FROM. Settling may pull the
    // endpoints inland; the play rocks were computed before it, so trusting them
    // afterwards would leave the round's stage and the villagers' bank as two
    // geometries that agree only by luck. Measured 29.08.2026 the settling moves
    // nothing — every river layout, forty seeds each, zero movement — which is
    // exactly why this is re-derived rather than trusted: a divergence that never
    // happens has no symptom until the day it does, and then it is a player
    // standing between two banks.
    if (playRocks) {
      const settled = bankPlayRocks(bank)
      playRocks.upstream = settled.upstream
      playRocks.downstream = settled.downstream
      colliders[playRockSlots[0]] = { x: settled.upstream.x, z: settled.upstream.z, r: playRocks.r }
      colliders[playRockSlots[1]] = { x: settled.downstream.x, z: settled.downstream.z, r: playRocks.r }
    }
  }

  // The village's ground work (work-order point 483): three patches where
  // villagers dig — a store pit, a post hole and a patch turned over. They are
  // placed like every other loose object (free ground, off the lanes, seeded by
  // the same generator) and they carry NO collider: a shallow pit is walked
  // over, and the villager working it must be able to stand IN it.
  //
  // THEY LEAVE THE MIDDLE (work-order 688). The first placement swept the whole
  // open ground from 5 m out, which put men digging on the village square beside
  // a boulder that stood there for no reason — the picture the user read as
  // meaningless on 13.08.2026. Each kind now stands where its own work belongs:
  // the store pit at a compound edge, the post hole beside a lane, the turned
  // patch out at the edge of the worked ground. All three keep clear of
  // `CENTRAL_GROUND_RADIUS`, the open middle the fire, the pounder and the
  // talkers share.
  const digSites: PlaceLayout['digSites'] = []
  if (place.kind === 'village') {
    /** Distance to the nearest dwelling WALL, or Infinity where none is built. */
    const toCompound = (x: number, z: number) =>
      dwellings.reduce((best, d) => Math.min(best, Math.hypot(x - d.x, z - d.z) - d.r), Infinity)
    /** Distance to the nearest lane EDGE. */
    const toLane = (x: number, z: number) =>
      paths.reduce(
        (best, pth) => Math.min(best, closestOnPolyline(pth.points, x, z).dist - pth.width / 2),
        Infinity,
      )
    // NO ADULT VOICE INSIDE THE CHILDREN'S EARSHOT (work-order 688 item 6). The
    // three teaching areas — the village core, the children's roaming quarter and
    // the stage on the bank — each clear the others by the hearing radius, and
    // where they cannot all fit it is the ADULTS that move: their words hang on
    // what they are DOING (a jar, a stroke of the hoe), the children's on where
    // they are standing. So the dig sites are what gives way here.
    const earshot = ADULT_SPEECH_MARGIN
    /** What each kind of work needs of its spot, beyond the shared rules. */
    const belongs: Record<PlaceLayout['digSites'][number]['kind'], (x: number, z: number) => boolean> = {
      // A store pit is sunk against the wall of the compound it stores for.
      pit: (x, z) => toCompound(x, z) <= DIG_SITE_ANCHOR_REACH,
      // A post hole is dug where the post goes: at the side of a lane.
      postHole: (x, z) => toLane(x, z) <= DIG_SITE_ANCHOR_REACH,
      // Ground is turned at the outer edge of what the village works, past the
      // last compound rather than between them.
      patch: (x, z) => Math.hypot(x, z) >= radius * DIG_SITE_FIELD_BAND,
    }
    const kinds: Array<PlaceLayout['digSites'][number]['kind']> = ['pit', 'postHole', 'patch']
    for (const kind of kinds) {
      // TWO PASSES, AND THE ORDER OF THEM IS THE RULE. The first asks for the
      // spot the work belongs at; the second drops that and takes any spot
      // outside the middle. What is NEVER dropped is the central ground and the
      // children's earshot — those are what the point is about — while the
      // anchor is what a ksar, the densest plan there is, cannot always give:
      // measured at tuareg-village, no ground beside a lane there is both free
      // and outside the middle, and a village short of a work site is worse than
      // a post hole away from its lane.
      for (const anchored of [true, false]) {
        // A deterministic golden-angle sweep over the ground outside the middle.
        for (let i = 0; i < 240 && !digSites.some((s) => s.kind === kind); i++) {
          const a = rand() * Math.PI * 2 + i * 2.399963
          const r = CENTRAL_GROUND_RADIUS + DIG_SITE_RADIUS + (i % 24) * 0.62
          const x = Math.cos(a) * r
          const z = Math.sin(a) * r
          if (!isFree(x, z, 2.4, DIG_SITE_RADIUS) || onLane(x, z, DIG_SITE_RADIUS + 0.4)) continue
          if (digSites.some((s) => Math.hypot(s.x - x, s.z - z) < 3)) continue
          if (!standingClear(colliders, x, z, WALKER_RADIUS)) continue
          if (toChildren(x, z) < earshot) continue
          if (anchored && !belongs[kind](x, z)) continue
          digSites.push({ x, z, kind })
        }
      }
      // A kind the two passes could not place leaves the village short of a work
      // site — and with fewer than two sites the joined dig cannot be shown at
      // all. `layout.test.ts` sweeps every village at every seed and finds all
      // three, so this firing means a plan changed under the rule rather than an
      // ordinary unlucky draw (GPT-5.6 Sol, first cross-vendor round, B3).
      devAssert(
        digSites.some((s) => s.kind === kind),
        'dig-site-missing',
        () => `${place.id}: no ${kind} could be placed outside the middle and clear of the children`,
      )
    }
  }


  return { radius, spawnZ: radius - SPAWN_INSET, interactives, dwellings, fences, paths, flora, rocks, digSites, bank, playRocks, waterPath, playGround, wayOut, pen, errands, colliders }
}
