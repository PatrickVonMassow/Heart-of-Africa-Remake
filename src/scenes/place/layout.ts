// Procedural settlement layout (design.md §2.6/§4.1/§18): the pure data —
// walkable radius, functional buildings, dwellings, fences, paths, flora
// slots, rocks, pen, errand points and the collider set — extracted from the
// scene so the HUD (place plan on the map, point 79) and pure layout tests
// can build it without three.

import { placeById } from '../../world/geo'
import { mulberry32 } from '../../world/noise'
import { REGION_PLACE_STYLES } from './regionStyles'
import { PORT_TALKERS, VILLAGE_SPOTS } from './lifeSpots'
import { boxCollider, type Collider } from './collision'
import type { BuildingType } from '../../state/ui'

export const PLACE_RADIUS = 28 // walkable radius in meters; leaving it exits the place

export interface Interactive {
  type: BuildingType | 'villager'
  pos: [number, number]
  /** World-space point in front of the entrance door; touching it opens the building. */
  door?: [number, number]
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
  if (place.kind === 'port') {
    // Ports carry the full trade roster incl. bazaar and travel agency (§9).
    const types: BuildingType[] = ['shop', 'weapons', 'tools', 'market', 'bazaar', 'agency']
    types.forEach((t, i) => {
      // Diagonal placement keeps the southern spawn corridor free.
      const angle = Math.PI / 4 + (i / types.length) * Math.PI * 2 + (rand() - 0.5) * 0.4
      const r = 11 + rand() * 4
      const x = Math.cos(angle) * r
      const z = Math.sin(angle) * r
      // Must match PortBuilding's variant rotation (variant = interactive index);
      // the door sits on local +Z just outside the box collider (hz 2.0).
      const rot = ((i * 137) % 40) / 100 - 0.2
      interactives.push({ type: t, pos: [x, z], door: [x + Math.sin(rot) * 2.55, z + Math.cos(rot) * 2.55] })
    })
  } else {
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
    const marketPos: [number, number] = [jitter(-6, 2), jitter(-6, 2)]
    interactives.push({ type: 'market', pos: marketPos, door: hutDoor(marketPos) })
    interactives.push({ type: 'villager', pos: [jitter(4, 3), jitter(-4, 2)] })
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
  const isFree = (x: number, z: number, margin: number) => {
    if (Math.abs(x) < 4.5 && z > 5) return false
    if (Math.hypot(x, z - 18) < 6) return false
    if (!lifeSpots.every(([sx, sz]) => Math.hypot(x - sx, z - sz) > margin * 0.6 + 1)) return false
    if (!interactives.every((it) => Math.hypot(x - it.pos[0], z - it.pos[1]) > margin)) return false
    // Keep the entrance-door approach of each functional building clear so it
    // stays reachable (design.md §2 collision inside settlements).
    if (!interactives.every((it) => !it.door || Math.hypot(x - it.door[0], z - it.door[1]) > 2.2)) return false
    // Keep every dwelling's entrance-door approach clear too, so a later object
    // never seals an earlier hut's door (design.md §2, point 6 reachability).
    if (!dwellings.every((d) => Math.hypot(x - d.door[0], z - d.door[1]) > 1.7)) return false
    return dwellings.every((d) => Math.hypot(x - d.x, z - d.z) > margin * 0.55 + d.r)
  }

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
  ): DwellingDef => {
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
    // Street grid: main street south→plaza→north, cross street east–west.
    paths.push({ points: [[0, radius - 2], [0, 3], [0, -16 - ext]], width: 3 })
    paths.push({ points: [[-20 - ext, 3], [20 + ext, 3]], width: 2.2 })
    for (const it of interactives) {
      // Spur from each functional building toward the nearest street axis.
      const toMain: [number, number] = [0, it.pos[1]]
      const toCross: [number, number] = [it.pos[0], 3]
      const target = Math.abs(it.pos[0]) < Math.abs(it.pos[1] - 3) ? toMain : toCross
      paths.push({ points: [it.pos, target], width: 1.4 })
    }

    // Timbuktu's Djinguereber mosque (design.md §4.4): the authentic 1327
    // Sudano-Sahelian mud landmark. Placed BEFORE the dwelling rows so the
    // procedural fabric grows around it (isFree checks earlier dwellings),
    // which guarantees the landmark a spot in every run.
    if (placeId === 'timbuktu') {
      for (const [mx, mz] of [
        [-13.5, -7.5],
        [13.5, -8.5],
        [-14.5, 12.5],
        [14.5, 13.5],
      ] as const) {
        if (!isFree(mx, mz, 6)) continue
        addDwelling('mosque', mx, mz, faceTo(mx, mz, 0, 3), 3.6, 4.6)
        break
      }
    }

    // Dense adobe town: rows of houses flanking both streets.
    for (const sx of [-6.8, 6.8]) {
      for (let z = -13 - ext; z <= 21 + ext; z += 4.6) {
        const x = jitter(sx, 1.6)
        const zz = jitter(z, 1.6)
        if (!isFree(x, zz, 4.6)) continue
        const floors = rand() < 0.3 ? 2 : 1
        addDwelling('box', x, zz, faceTo(x, zz, 0, zz) + (rand() - 0.5) * 0.15, 1.8 + rand() * 0.5, 2.3 + (floors - 1) * 1.8, floors)
      }
    }
    for (const sz of size >= 3 ? [-2.8, 9.2, 16.4] : [-2.8, 9.2]) {
      for (let x = -19 - ext; x <= 19 + ext; x += 5.4) {
        if (Math.abs(x) < 9) continue
        const xx = jitter(x, 1.8)
        const zz = jitter(sz, 1.4)
        if (!isFree(xx, zz, 4.6)) continue
        const floors = rand() < 0.22 ? 2 : 1
        addDwelling('box', xx, zz, faceTo(xx, zz, xx, 3) + (rand() - 0.5) * 0.15, 1.7 + rand() * 0.5, 2.2 + (floors - 1) * 1.8, floors)
      }
    }
    // Warehouses at the ends of the cross street (two in bigger towns). The
    // wide margin keeps their long boxes clear of the functional buildings
    // (overlapping colliders would wedge the player at shared corners).
    if (isFree(-16.5, 7.5, 8)) addDwelling('warehouse', -16.5, 7.5, Math.PI, 4.2, 3)
    if (size >= 2 && isFree(16.8, 7.8, 8)) addDwelling('warehouse', 16.8, 7.8, Math.PI, 4.2, 3)
    // Major cities get a landmark tower on the skyline (design.md §4.1).
    if (size >= 3 && isFree(-11.5, -8.5, 4)) addDwelling('tower', -11.5, -8.5, 0, 1.1, 7)
    // Market stalls and tents around the market building.
    const market = interactives.find((it) => it.type === 'market')
    if (market) {
      for (let i = 0; i < 2 + size * 2; i++) {
        const a = rand() * Math.PI * 2
        const r = 4.5 + rand() * 2.5
        const x = market.pos[0] + Math.cos(a) * r
        const z = market.pos[1] + Math.sin(a) * r
        if (!isFree(x, z, 3.2)) continue
        addDwelling(i % 2 ? 'stall' : 'tent', x, z, rand() * Math.PI * 2, 1.3, 1.9)
      }
      errands.push([market.pos[0], market.pos[1] + 3.2])
    }
    errands.push([0, 3], [jitter(-3, 2), jitter(0, 2)], [jitter(3, 2), jitter(6, 2)])
  } else {
    // Common village paths: plaza→exit, plaza→chief, plaza→fire pit.
    const chief = interactives[0]
    paths.push({ points: [center, [0, 24]], width: 2.2 })
    paths.push({ points: [center, [chief.pos[0], chief.pos[1] + 3.4]], width: 1.6 })
    paths.push({ points: [center, [-3.5, 2.5]], width: 1.1 })
    errands.push([-2.2, 3.4], [jitter(1.5, 2), jitter(4, 2)], [chief.pos[0], chief.pos[1] + 4])

    const southGap: [number, number] = [Math.PI / 2, 0.55] // spawn corridor
    const chiefGap: [number, number] = [-Math.PI / 2, 0.5]

    if (style.villageLayout === 'kraal') {
      // Manyatta: dome huts on a ring inside a thorn fence, cattle pen center.
      const R = 15.5
      const n = style.dwellingCount + 4
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + 0.12
        if (Math.abs(((a - southGap[0] + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.6) continue
        if (Math.abs(((a - chiefGap[0] + Math.PI * 3) % (Math.PI * 2)) - Math.PI) < 0.55) continue
        const x = jitter(Math.cos(a) * R, 1.4)
        const z = jitter(Math.sin(a) * R, 1.4)
        if (!isFree(x, z, 3.4)) continue
        const d = addDwelling('hut', x, z, faceTo(x, z, 0, 0), 1.5 + rand() * 0.4, 1.5 + rand() * 0.3)
        if (dwellings.length % 2 === 0) paths.push({ points: [center, d.door], width: 1.0 })
      }
      fences.push({ kind: 'thorn', posts: fenceRing(0, 0.5, R + 4, 1.25, [[southGap[0], 0.3], [chiefGap[0], 0.22]]) })
      pen = { x: 6.8, z: 2.2, r: 3.4 }
      fences.push({ kind: 'woven', posts: fenceRing(pen.x, pen.z, pen.r, 0.85, [[Math.PI, 0.35]]) })
      errands.push([pen.x - pen.r - 0.8, pen.z])
    } else if (style.villageLayout === 'lanes') {
      // Desert town: adobe houses along two lanes crossing the main path.
      paths.push({ points: [[-14, -4.5], [14, -4.5]], width: 1.6 })
      for (const sx of [-5.2, 5.2]) {
        for (let z = -10; z <= 15; z += 4.4) {
          const x = jitter(sx, 1.3)
          const zz = jitter(z, 1.4)
          if (!isFree(x, zz, 3.8)) continue
          const floors = rand() < 0.18 ? 2 : 1
          addDwelling('box', x, zz, faceTo(x, zz, 0, zz) + (rand() - 0.5) * 0.2, 1.6 + rand() * 0.4, 2.1 + (floors - 1) * 1.7, floors)
        }
      }
      for (const sz of [-8.2, -0.8]) {
        for (let x = -15; x <= 15; x += 5) {
          if (Math.abs(x) < 8) continue
          const xx = jitter(x, 1.6)
          const zz = jitter(sz, 1.2)
          if (!isFree(xx, zz, 3.8)) continue
          addDwelling('box', xx, zz, faceTo(xx, zz, xx, -4.5) + (rand() - 0.5) * 0.2, 1.5 + rand() * 0.4, 2.0)
        }
      }
      errands.push([jitter(-9, 3), -4.5], [jitter(9, 3), -4.5])
    } else {
      // Family compounds: hut clusters with fences and granaries.
      const baseAngles = [0.1, 2.3, 3.35, 4.15, 5.5]
      const compounds = Math.min(4 + (rand() < 0.5 ? 1 : 0), baseAngles.length)
      for (let c = 0; c < compounds; c++) {
        const a = baseAngles[c] + (rand() - 0.5) * 0.3
        const cr = 13.5 + rand() * 4
        const cx = Math.cos(a) * cr
        const cz = Math.sin(a) * cr
        const huts = 2 + Math.floor(rand() * 2)
        for (let i = 0; i < huts; i++) {
          const ha = a + Math.PI + ((i - (huts - 1) / 2) * 1.1 + (rand() - 0.5) * 0.3)
          const x = cx + Math.cos(ha) * (3.4 + rand() * 1.2)
          const z = cz + Math.sin(ha) * (3.4 + rand() * 1.2)
          if (!isFree(x, z, 3.2)) continue
          addDwelling('hut', x, z, faceTo(x, z, cx, cz), 1.5 + rand() * 0.5, 1.9 + rand() * 0.5)
        }
        if (style.granaries && isFree(cx + 2, cz + 2, 2.2)) {
          addDwelling('granary', cx + 2, cz + 2, faceTo(cx + 2, cz + 2, cx, cz), 0.85, 1.1)
        }
        if (style.fence !== 'none') {
          // Fence around the compound, opening toward the plaza.
          const openingAngle = Math.atan2(-cz, -cx)
          fences.push({
            kind: style.fence === 'stone' ? 'stone' : 'woven',
            posts: fenceRing(cx, cz, 6.2, style.fence === 'stone' ? 1.0 : 0.9, [[openingAngle, 0.7]]),
          })
        }
        paths.push({ points: [center, [cx, cz]], width: 1.3 })
        if (c < 2) errands.push([cx, cz])
      }
      // A shed and a drying rack scattered between the compounds.
      for (let i = 0; i < 6 && dwellings.filter((d) => d.kind === 'shed').length < 2; i++) {
        const a = rand() * Math.PI * 2
        const r = 9 + rand() * 8
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        if (!isFree(x, z, 3)) continue
        addDwelling('shed', x, z, rand() * Math.PI * 2, 1.1, 1.4)
      }
    }
  }

  const flora: PlaceLayout['flora'] = []
  for (let i = 0; i < 48 && flora.length < 9; i++) {
    const angle = rand() * Math.PI * 2
    const r = 8 + rand() * 18
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (!isFree(x, z, 3.5)) continue
    flora.push({ x, z, h: 3 + rand() * 2 })
  }

  const rocks: PlaceLayout['rocks'] = []
  for (let i = 0; i < 40 && rocks.length < 14; i++) {
    const a = rand() * Math.PI * 2
    const r = 6 + rand() * (radius + 6)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    if (!isFree(x, z, 2)) continue
    rocks.push([x, z, 0.3 + rand() * 0.7])
  }

  // --- Collision set: every solid object becomes one or more circles ------
  const colliders: Collider[] = []
  interactives.forEach((it, i) => {
    if (it.type === 'villager') {
      colliders.push({ x: it.pos[0], z: it.pos[1], r: 0.45 })
    } else if (place.kind === 'port') {
      // Must match PortBuilding's variant rotation (variant = interactive index).
      const rot = ((i * 137) % 40) / 100 - 0.2
      colliders.push(boxCollider(it.pos[0], it.pos[1], 2.5, 2.0, rot))
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

  return { radius, interactives, dwellings, fences, paths, flora, rocks, pen, errands, colliders }
}
