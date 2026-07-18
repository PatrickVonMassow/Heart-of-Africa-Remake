// Procedural settlement layout (design.md §2.6/§4.1/§18): the pure data —
// walkable radius, functional buildings, dwellings, fences, paths, flora
// slots, rocks, pen, errand points and the collider set — extracted from the
// scene so the HUD (place plan on the map, point 79) and pure layout tests
// can build it without three.

import { placeById } from '../../world/geo'
import { mulberry32 } from '../../world/noise'
import { REGION_PLACE_STYLES, VILLAGE_PLANS } from './regionStyles'
import { PORT_TALKERS, VILLAGE_SPOTS } from './lifeSpots'
import { boxCollider, nudgeToFree, WALKER_RADIUS, type Collider } from './collision'
import { windingPoints, laneSlots, closestOnPolyline, bendAround, type LaneSlot } from './lanePlan'
import type { BuildingType } from '../../state/ui'

export const PLACE_RADIUS = 28 // walkable radius in meters; leaving it exits the place

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
  interactives: Interactive[]
  dwellings: DwellingDef[]
  fences: FenceDef[]
  paths: PathDef[]
  flora: Array<{ x: number; z: number; h: number }>
  /** Scattered boulders (solid, part of the collision set). */
  rocks: Array<[number, number, number]>
  /** Livestock pen (kraal layouts). */
  pen: { x: number; z: number; r: number } | null
  /** Points walkers visit on their errands. */
  errands: Array<[number, number]>
  /** Solid-object colliders (design.md §2: collision inside settlements). */
  colliders: Collider[]
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

export function buildLayout(placeId: string, seed: number): PlaceLayout {
  const place = placeById(placeId)
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
    const facing = pickDoorRot(x, z, r, rot)
    const d: DwellingDef = {
      kind,
      x,
      z,
      rot: facing,
      r,
      h,
      floors,
      door: doorAt(x, z, r, facing),
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
      const baseAngles = [0.1, 2.3, 3.35, 4.15, 5.5]
      const compounds = Math.min(4 + (rand() < 0.7 ? 1 : 0), baseAngles.length)
      for (let c = 0; c < compounds; c++) {
        const a = baseAngles[c] + (rand() - 0.5) * 0.3
        const cr = 13.5 + rand() * 4
        const cx = Math.cos(a) * cr
        const cz = Math.sin(a) * cr
        const huts = 2 + Math.floor(rand() * 2)
        let seated = 0
        for (let t = 0; t < huts * 6 && seated < huts; t++) {
          const ha = a + Math.PI + ((t % huts) - (huts - 1) / 2) * 1.1 + (rand() - 0.5) * 0.5
          const x = cx + Math.cos(ha) * (3.4 + rand() * 1.6)
          const z = cz + Math.sin(ha) * (3.4 + rand() * 1.6)
          const r = 1.5 + rand() * 0.5
          if (!isFree(x, z, 3.2, r) || onLane(x, z, r)) continue
          addDwelling('hut', x, z, faceTo(x, z, cx, cz), r, 1.9 + rand() * 0.5)
          seated++
        }
        if (style.granaries && isFree(cx + 2, cz + 2, 2.2, 0.85) && !onLane(cx + 2, cz + 2, 1.2)) {
          addDwelling('granary', cx + 2, cz + 2, faceTo(cx + 2, cz + 2, cx, cz), 0.85, 1.1)
        }
        const openingAngle = Math.atan2(-cz, -cx)
        if (style.fence !== 'none') {
          // Fence around the compound, opening toward the plaza.
          fences.push({
            kind: style.fence === 'stone' ? 'stone' : 'woven',
            posts: fenceRing(cx, cz, 6.2, style.fence === 'stone' ? 1.0 : 0.9, [[openingAngle, 0.7]]),
          })
        }
        const gx = cx + Math.cos(openingAngle) * 6.2
        const gz = cz + Math.sin(openingAngle) * 6.2
        pushPath([center, [gx, gz]], 1.3)
        if (c < 2) errands.push([gx, gz])
      }
      // A shed and a drying rack scattered between the compounds.
      for (let i = 0; i < 6 && dwellings.filter((d) => d.kind === 'shed').length < 2; i++) {
        const a = rand() * Math.PI * 2
        const r = 9 + rand() * 8
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        if (!isFree(x, z, 3, 1.1) || onLane(x, z, 1.45)) continue
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

  const flora: PlaceLayout['flora'] = []
  for (let i = 0; i < 48 && flora.length < 9; i++) {
    const angle = rand() * Math.PI * 2
    const r = 8 + rand() * 18
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (!isFree(x, z, 3.5) || onLane(x, z, 0.5)) continue
    flora.push({ x, z, h: 3 + rand() * 2 })
  }

  const rocks: PlaceLayout['rocks'] = []
  for (let i = 0; i < 40 && rocks.length < 14; i++) {
    const a = rand() * Math.PI * 2
    const r = 6 + rand() * (radius + 6)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const s = 0.3 + rand() * 0.7
    if (!isFree(x, z, 2) || onLane(x, z, 0.35 + s * 0.5)) continue
    rocks.push([x, z, s])
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
      colliders.push({ x: it.pos[0], z: it.pos[1], r: it.type === 'market' ? 2.9 : 3.35 })
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
      case 'granary':
        colliders.push({ x: d.x, z: d.z, r: 1.2 })
        break
      case 'tent':
        colliders.push({ x: d.x, z: d.z, r: d.r * 1.3 })
        break
      case 'stall':
        colliders.push({ x: d.x, z: d.z, r: 1.35 })
        break
      case 'shed':
        colliders.push({ x: d.x, z: d.z, r: d.r + 0.35 })
        break
      case 'tower':
        colliders.push({ x: d.x, z: d.z, r: d.r + 0.4 })
        break
      case 'mosque':
        colliders.push(boxCollider(d.x, d.z, d.r, d.r * 0.8, d.rot))
        break
      default:
        colliders.push({ x: d.x, z: d.z, r: d.r + 0.3 }) // round hut
    }
  }
  for (const f of fences) {
    const r = f.kind === 'thorn' ? 0.6 : f.kind === 'stone' ? 0.5 : 0.42
    for (const [x, z] of f.posts) colliders.push({ x, z, r })
  }
  for (const t of flora) colliders.push({ x: t.x, z: t.z, r: 0.45 })
  for (const [x, z, s] of rocks) colliders.push({ x, z, r: 0.35 + s * 0.5 })
  if (place.kind === 'village') {
    colliders.push({ x: -3.5, z: 2.5, r: 1.3 }) // fire pit
    colliders.push({ x: -8.5, z: -7, r: 1.0 }) // weaver's loom
    colliders.push({ x: -3.5 + 1.2, z: 2.5 + 1.0, r: 0.45 }) // cook
    // Village-life props (design.md §19; positions from PlaceLife).
    colliders.push({ x: VILLAGE_SPOTS.talkers[0], z: VILLAGE_SPOTS.talkers[1], r: 0.85 })
    colliders.push({ x: VILLAGE_SPOTS.pounder[0], z: VILLAGE_SPOTS.pounder[1], r: 0.55 })
    colliders.push({ x: VILLAGE_SPOTS.drummer[0], z: VILLAGE_SPOTS.drummer[1], r: 0.5 })
    colliders.push({ x: VILLAGE_SPOTS.well[0], z: VILLAGE_SPOTS.well[1], r: 0.75 })
  } else {
    colliders.push({ x: PORT_TALKERS[0], z: PORT_TALKERS[1], r: 0.85 }) // chatting pair
  }

  // Every errand target a walker heads for must sit on free ground it can also
  // LEAVE (point 155): a jitter (or a stall/rock beside it) can drop a point
  // into a pocket. Nudge any such point to the nearest usable spot against the
  // full collider set, so no inhabitant walks into a wedge it cannot escape.
  for (let i = 0; i < errands.length; i++) {
    errands[i] = nudgeToFree(colliders, errands[i][0], errands[i][1], WALKER_RADIUS)
  }

  return { radius, interactives, dwellings, fences, paths, flora, rocks, pen, errands, colliders }
}
