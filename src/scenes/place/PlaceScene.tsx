// First-person place view (design.md §2): walkable port/village with
// enterable trade buildings, chief hut audience and a villager NPC.
// Building *positions and looks* are procedural per run (design.md §18);
// which buildings exist is fixed per place kind. Visuals: TSL sky dome and
// noise materials, sun shadows, detailed buildings, palms and scatter props.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import { useGame } from '../../state/store'
import { useUi, type BuildingType } from '../../state/ui'
import { balance } from '../../config/balance'
import { placeById } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { mulberry32 } from '../../world/noise'
import { isKeyDown, onKeyPress } from '../../systems/input'
import { SkyDome } from '../../render/sky'
import { PORT_SKY, VILLAGE_SKY } from '../../render/skyPresets'
import { createGroundMaterial, createNoisyMaterial } from '../../render/materials'
import { buildAcacia, buildBush, buildGrassTuft, buildJungleTree, buildPalm, buildRock } from '../../render/flora'
import { REGION_PLACE_STYLES, type RegionPlaceStyle } from './regionStyles'
import { PlaceLife } from './PlaceLife'
import { PORT_TALKERS, VILLAGE_SPOTS } from './lifeSpots'
import { boxCollider, resolveMove, type Collider } from './collision'
import { getStrings, useStrings } from '../../i18n'

const PLACE_RADIUS = 28 // walkable radius in meters; leaving it exits the place
const INTERACT_RADIUS = 4.5
const PLAYER_RADIUS = 0.35 // collision radius of player and inhabitants
const EYE_HEIGHT = 1.5 // first-person camera height in meters

/** Sun direction shared by the sky dome disc and the shadow light. */
const SUN_DIR: [number, number, number] = [0.52, 0.68, 0.34]

interface Interactive {
  type: BuildingType | 'villager' | 'exit'
  pos: [number, number]
}

/** Display label of an interactive in the current language. */
function interactiveLabel(strings: ReturnType<typeof getStrings>, type: Interactive['type']): string {
  if (type === 'villager') return strings.labels.talkToElder
  if (type === 'exit') return strings.labels.leavePlace
  return strings.buildings[type]
}

/** Non-enterable dwellings and outbuildings (design.md §2 lively settlements). */
export type DwellingKind = 'hut' | 'box' | 'granary' | 'tent' | 'warehouse' | 'stall' | 'shed' | 'tower'

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

interface PathDef {
  points: Array<[number, number]>
  width: number
}

interface FenceDef {
  kind: 'thorn' | 'woven' | 'stone'
  /** Sequential post positions; panels orient toward the next post. */
  posts: Array<[number, number]>
}

interface PlaceLayout {
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
function buildLayout(placeId: string, seed: number): PlaceLayout {
  const place = placeById(placeId)
  const style = REGION_PLACE_STYLES[place.region]
  let hash = 0
  for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const rand = mulberry32((seed ^ hash) >>> 0)
  const jitter = (v: number, amount: number) => v + (rand() - 0.5) * amount

  // Settlement size mirrors real ~1890 importance (design.md §4.1): major
  // cities are markedly larger, with more blocks and a wider walkable area.
  const size = place.kind === 'port' ? (place.size ?? 2) : 1
  const ext = place.kind === 'port' ? (size - 1) * 7 : 0
  const radius = place.kind === 'port' ? 24 + size * 4 : PLACE_RADIUS

  const interactives: Interactive[] = []
  if (place.kind === 'port') {
    // Ports carry the full trade roster incl. bazaar and travel agency (§9).
    const types: BuildingType[] = ['shop', 'weapons', 'tools', 'market', 'bazaar', 'agency']
    types.forEach((t, i) => {
      // Diagonal placement keeps the southern spawn corridor free.
      const angle = Math.PI / 4 + (i / types.length) * Math.PI * 2 + (rand() - 0.5) * 0.4
      const r = 11 + rand() * 4
      interactives.push({ type: t, pos: [Math.cos(angle) * r, Math.sin(angle) * r] })
    })
  } else {
    interactives.push({ type: 'chief', pos: [jitter(0, 4), jitter(-13, 3)] })
    interactives.push({ type: 'villager', pos: [jitter(4, 3), jitter(-4, 2)] })
  }
  interactives.push({ type: 'exit', pos: [0, radius - 4] })

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
    return dwellings.every((d) => Math.hypot(x - d.x, z - d.z) > margin * 0.55 + d.r)
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
    const d: DwellingDef = {
      kind,
      x,
      z,
      rot,
      r,
      h,
      floors,
      door: [x + Math.sin(rot) * (r + 0.5), z + Math.cos(rot) * (r + 0.5)],
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
      if (it.type === 'exit') continue
      // Spur from each functional building toward the nearest street axis.
      const toMain: [number, number] = [0, it.pos[1]]
      const toCross: [number, number] = [it.pos[0], 3]
      const target = Math.abs(it.pos[0]) < Math.abs(it.pos[1] - 3) ? toMain : toCross
      paths.push({ points: [it.pos, target], width: 1.4 })
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
    // Warehouses at the ends of the cross street (two in bigger towns).
    if (isFree(-16.5, 7.5, 4)) addDwelling('warehouse', -16.5, 7.5, Math.PI, 4.2, 3)
    if (size >= 2 && isFree(16.8, 7.8, 4)) addDwelling('warehouse', 16.8, 7.8, Math.PI, 4.2, 3)
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
    if (it.type === 'exit') {
      colliders.push({ x: it.pos[0] - 1.5, z: it.pos[1], r: 0.24 })
      colliders.push({ x: it.pos[0] + 1.5, z: it.pos[1], r: 0.24 })
    } else if (it.type === 'villager') {
      colliders.push({ x: it.pos[0], z: it.pos[1], r: 0.45 })
    } else if (place.kind === 'port') {
      // Must match PortBuilding's variant rotation (variant = interactive index).
      const rot = ((i * 137) % 40) / 100 - 0.2
      colliders.push(boxCollider(it.pos[0], it.pos[1], 2.5, 2.0, rot))
    } else {
      colliders.push({ x: it.pos[0], z: it.pos[1], r: 3.35 }) // chief hut
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

// --- Shared procedural materials (created once per mount) --------------------

/** Half-extent (world units) the path mask canvas spans around the origin. */
const PATH_MASK_EXTENT = 44

/** Renders the path polylines into a soft grayscale mask (canvas texture). */
function usePathTexture(paths: PathDef[] | null): THREE.CanvasTexture | null {
  return useMemo(() => {
    if (!paths || paths.length === 0) return null
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#000'
    ctx.fillRect(0, 0, size, size)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    const toPx = (v: number) => ((v + PATH_MASK_EXTENT) / (PATH_MASK_EXTENT * 2)) * size
    // Two passes: wide soft verge, narrow trodden core.
    for (const pass of [
      { scale: 2.1, alpha: 0.55, blur: 8 },
      { scale: 1.05, alpha: 1.0, blur: 1 },
    ]) {
      ctx.strokeStyle = `rgba(255,255,255,${pass.alpha})`
      ctx.shadowColor = '#fff'
      ctx.shadowBlur = pass.blur
      for (const p of paths) {
        ctx.lineWidth = ((p.width * pass.scale) / (PATH_MASK_EXTENT * 2)) * size
        ctx.beginPath()
        ctx.moveTo(toPx(p.points[0][0]), toPx(p.points[0][1]))
        for (const [x, z] of p.points.slice(1)) ctx.lineTo(toPx(x), toPx(z))
        ctx.stroke()
      }
    }
    const tex = new THREE.CanvasTexture(canvas)
    tex.flipY = false
    return tex
  }, [paths])
}

function usePlaceMaterials(isPort: boolean, style: RegionPlaceStyle, pathTex: THREE.Texture | null) {
  return useMemo(() => {
    const plaster = createNoisyMaterial({ base: '#e6d9b4', alt: '#c6b488', scale: 0.6 })
    const plasterDark = createNoisyMaterial({ base: '#d3c294', alt: '#ab9668', scale: 0.7 })
    const mud = createNoisyMaterial({ base: style.hutWall.base, alt: style.hutWall.alt, scale: 0.9 })
    const thatch = createNoisyMaterial({
      base: style.hutThatch.base,
      alt: style.hutThatch.alt,
      scale: [2.2, 7, 2.2],
      octaves: 3,
    })
    const wood = createNoisyMaterial({ base: '#7a5a32', alt: '#573e1f', scale: [1.2, 4, 1.2], roughness: 0.85 })
    const cloth = createNoisyMaterial({ base: '#d9cdb0', alt: '#b8ab8a', scale: 1.4, roughness: 0.9 })
    const pathOpts = pathTex
      ? { mask: pathTex, color: isPort ? '#bfa070' : style.pathColor, extent: PATH_MASK_EXTENT }
      : undefined
    const ground = isPort
      ? createGroundMaterial('#dcc99c', '#c4ad7c', '#b59a6b', pathOpts)
      : createGroundMaterial(style.ground[0], style.ground[1], style.ground[2], pathOpts)
    return { plaster, plasterDark, mud, thatch, wood, cloth, ground }
  }, [isPort, style, pathTex])
}

type PlaceMaterials = ReturnType<typeof usePlaceMaterials>

// --- Scenery pieces -----------------------------------------------------------

function PortBuilding({ item, mats, variant }: { item: Interactive; mats: PlaceMaterials; variant: number }) {
  const t = useStrings()
  const rot = ((variant * 137) % 40) / 100 - 0.2
  return (
    <group position={[item.pos[0], 0, item.pos[1]]} rotation={[0, rot, 0]}>
      {/* Walls */}
      <mesh position={[0, 1.6, 0]} castShadow receiveShadow material={variant % 2 ? mats.plaster : mats.plasterDark}>
        <boxGeometry args={[5, 3.2, 4]} />
      </mesh>
      {/* Corner pilasters */}
      {[
        [-2.45, -1.95],
        [2.45, -1.95],
        [-2.45, 1.95],
        [2.45, 1.95],
      ].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.6, pz]} castShadow material={mats.plasterDark}>
          <boxGeometry args={[0.35, 3.2, 0.35]} />
        </mesh>
      ))}
      {/* Roof slab and parapet */}
      <mesh position={[0, 3.3, 0]} castShadow material={mats.wood}>
        <boxGeometry args={[5.4, 0.2, 4.4]} />
      </mesh>
      {[
        [0, -2.1, 5.4, 0.25],
        [0, 2.1, 5.4, 0.25],
        [-2.6, 0, 0.25, 3.9],
        [2.6, 0, 0.25, 3.9],
      ].map(([px, pz, w, d], i) => (
        <mesh key={`p${i}`} position={[px, 3.55, pz]} castShadow material={variant % 2 ? mats.plaster : mats.plasterDark}>
          <boxGeometry args={[w, 0.3, d]} />
        </mesh>
      ))}
      {/* Door with frame and step */}
      <mesh position={[0, 1.05, 2.02]} material={mats.wood} castShadow>
        <boxGeometry args={[1.3, 2.1, 0.12]} />
      </mesh>
      <mesh position={[0, 1.0, 2.08]}>
        <boxGeometry args={[1.0, 1.9, 0.06]} />
        <meshStandardMaterial color="#3d2c16" roughness={0.9} />
      </mesh>
      <mesh position={[0, 0.08, 2.35]} receiveShadow material={mats.plasterDark}>
        <boxGeometry args={[1.6, 0.16, 0.7]} />
      </mesh>
      {/* Windows */}
      {[-1.6, 1.6].map((wx) => (
        <group key={wx} position={[wx, 1.9, 2.01]}>
          <mesh material={mats.wood}>
            <boxGeometry args={[0.75, 0.95, 0.08]} />
          </mesh>
          <mesh position={[0, 0, 0.03]}>
            <boxGeometry args={[0.55, 0.75, 0.06]} />
            <meshStandardMaterial color="#2c2317" roughness={0.7} />
          </mesh>
        </group>
      ))}
      {/* Awning over the door on two poles */}
      <mesh position={[0, 2.55, 2.75]} rotation={[0.28, 0, 0]} castShadow>
        <boxGeometry args={[2.1, 0.06, 1.5]} />
        <meshStandardMaterial color={variant % 2 ? '#b6552e' : '#8c6b3a'} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {[-0.9, 0.9].map((px) => (
        <mesh key={px} position={[px, 1.15, 3.4]} castShadow material={mats.wood}>
          <cylinderGeometry args={[0.05, 0.06, 2.3, 6]} />
        </mesh>
      ))}
      {/* Cargo beside the building */}
      <mesh position={[2.9, 0.35, 1.4]} rotation={[0, 0.4, 0]} castShadow material={mats.wood}>
        <boxGeometry args={[0.7, 0.7, 0.7]} />
      </mesh>
      <mesh position={[3.3, 0.3, 0.5]} castShadow>
        <cylinderGeometry args={[0.32, 0.36, 0.75, 10]} />
        <meshStandardMaterial color="#6e4f2a" roughness={0.85} />
      </mesh>
      <Html center position={[0, 4.4, 0]} distanceFactor={18}>
        <div className="map-label">{interactiveLabel(t, item.type)}</div>
      </Html>
    </group>
  )
}

function VillageHut({
  x,
  z,
  r,
  h,
  label,
  mats,
  style,
  rot,
  chief = false,
}: {
  x: number
  z: number
  r: number
  h: number
  label?: string
  mats: PlaceMaterials
  style: RegionPlaceStyle
  /** Yaw of the door; defaults to facing the place center. */
  rot?: number
  chief?: boolean
}) {
  const facing = rot ?? Math.atan2(x, z) + Math.PI
  // Raised floor in the humid Congo basin (design.md §2 region-typical builds).
  const base = style.stilts ? 0.55 : 0
  const wallH = style.roof === 'dome' ? h * 0.55 : h
  return (
    <group position={[x, 0, z]} rotation={[0, facing, 0]}>
      {style.stilts && (
        <>
          {Array.from({ length: 7 }, (_, i) => {
            const a = (i / 7) * Math.PI * 2
            return (
              <mesh key={i} position={[Math.cos(a) * r * 0.85, base / 2, Math.sin(a) * r * 0.85]} castShadow material={mats.wood}>
                <cylinderGeometry args={[0.09, 0.11, base, 5]} />
              </mesh>
            )
          })}
          <mesh position={[0, base, 0]} castShadow receiveShadow material={mats.wood}>
            <cylinderGeometry args={[r * 1.15, r * 1.15, 0.12, 12]} />
          </mesh>
          {/* Short log ramp up to the door */}
          <mesh position={[0, base / 2, r * 1.15]} rotation={[0.55, 0, 0]} castShadow material={mats.wood}>
            <boxGeometry args={[r * 0.5, 0.08, base * 2.1]} />
          </mesh>
        </>
      )}
      {/* Wall */}
      <mesh position={[0, base + wallH / 2, 0]} castShadow receiveShadow material={mats.mud}>
        <cylinderGeometry args={[r, r * 1.06, wallH, 12]} />
      </mesh>
      {/* Roof per region style */}
      {style.roof === 'flat' ? (
        <>
          <mesh position={[0, base + wallH + 0.09, 0]} castShadow material={mats.thatch}>
            <cylinderGeometry args={[r * 1.12, r * 1.12, 0.18, 12]} />
          </mesh>
          {/* Parapet ring */}
          <mesh position={[0, base + wallH + 0.28, 0]} castShadow material={mats.mud}>
            <cylinderGeometry args={[r * 1.05, r * 1.05, 0.22, 12, 1, true]} />
          </mesh>
        </>
      ) : style.roof === 'dome' ? (
        <mesh position={[0, base + wallH, 0]} castShadow material={mats.thatch}>
          <sphereGeometry args={[r * 1.18, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        </mesh>
      ) : (
        <>
          <mesh position={[0, base + wallH + r * (style.roof === 'tallCone' ? 0.8 : 0.5), 0]} castShadow material={mats.thatch}>
            <coneGeometry args={[r * 1.45, r * (style.roof === 'tallCone' ? 1.95 : 1.25), 12]} />
          </mesh>
          <mesh position={[0, base + wallH + r * (style.roof === 'tallCone' ? 1.85 : 1.12), 0]} castShadow material={mats.thatch}>
            <sphereGeometry args={[r * 0.14, 6, 5]} />
          </mesh>
        </>
      )}
      {/* Door opening */}
      <mesh position={[0, base + wallH * 0.36, r * 0.99]}>
        <boxGeometry args={[r * 0.55, wallH * 0.72, 0.12]} />
        <meshStandardMaterial color="#332412" roughness={0.95} />
      </mesh>
      {/* Painted band */}
      <mesh position={[0, base + wallH * 0.8, 0]}>
        <cylinderGeometry args={[r * 1.005, r * 1.005, wallH * 0.09, 12, 1, true]} />
        <meshStandardMaterial color={chief ? '#8c2f22' : style.bandColor} roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {chief && (
        <>
          {/* Entrance poles with horns */}
          {[-0.7, 0.7].map((px) => (
            <group key={px} position={[px * r, 0, r * 1.25]}>
              <mesh position={[0, 1.1, 0]} castShadow material={mats.wood}>
                <cylinderGeometry args={[0.07, 0.09, 2.2, 6]} />
              </mesh>
              <mesh position={[0, 2.25, 0]} rotation={[0, 0, px < 0 ? 0.5 : -0.5]} castShadow>
                <coneGeometry args={[0.07, 0.5, 5]} />
                <meshStandardMaterial color="#e8ddc8" roughness={0.6} />
              </mesh>
            </group>
          ))}
          {/* Shield by the door */}
          <mesh position={[r * 0.75, 1.0, r * 0.92]} rotation={[0.1, 0, 0]} castShadow>
            <cylinderGeometry args={[0.45, 0.45, 0.08, 12]} />
            <meshStandardMaterial color="#a33b28" roughness={0.85} />
          </mesh>
        </>
      )}
      {label && (
        <Html center position={[0, h + r * 1.4 + 0.8, 0]} distanceFactor={18}>
          <div className="map-label">{label}</div>
        </Html>
      )}
    </group>
  )
}

function Villager({ item, style }: { item: Interactive; style: RegionPlaceStyle }) {
  const t = useStrings()
  const robe = style.cloth[0]
  const shoulder = style.cloth[1 % style.cloth.length]
  return (
    <group position={[item.pos[0], 0, item.pos[1]]}>
      {/* Robe */}
      <mesh position={[0, 0.62, 0]} castShadow>
        <coneGeometry args={[0.42, 1.25, 10]} />
        <meshStandardMaterial color={robe} roughness={0.95} />
      </mesh>
      {/* Torso and shoulder cloth */}
      <mesh position={[0, 1.28, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.28, 0.5, 8]} />
        <meshStandardMaterial color={shoulder} roughness={0.95} />
      </mesh>
      {/* Head with gray hair */}
      <mesh position={[0, 1.68, 0]} castShadow>
        <sphereGeometry args={[0.2, 12, 10]} />
        <meshStandardMaterial color="#5c3317" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.8, 0]}>
        <sphereGeometry args={[0.19, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2.6]} />
        <meshStandardMaterial color="#cfc8bd" roughness={1} />
      </mesh>
      {/* Walking staff */}
      <mesh position={[0.38, 0.95, 0.05]} rotation={[0, 0, -0.08]} castShadow>
        <cylinderGeometry args={[0.03, 0.04, 1.9, 6]} />
        <meshStandardMaterial color="#5f4526" roughness={0.9} />
      </mesh>
      <mesh position={[0.4, 1.92, 0.05]}>
        <sphereGeometry args={[0.06, 6, 5]} />
        <meshStandardMaterial color="#4a3018" roughness={0.9} />
      </mesh>
      <Html center position={[0, 2.3, 0]} distanceFactor={14}>
        <div className="map-label">{t.labels.oldMan}</div>
      </Html>
    </group>
  )
}

function ExitGate({ item, mats }: { item: Interactive; mats: PlaceMaterials }) {
  const t = useStrings()
  return (
    <group position={[item.pos[0], 0, item.pos[1]]}>
      {[-1.5, 1.5].map((px) => (
        <group key={px} position={[px, 0, 0]}>
          <mesh position={[0, 1.3, 0]} castShadow material={mats.wood}>
            <cylinderGeometry args={[0.14, 0.18, 2.6, 7]} />
          </mesh>
          {/* Carved rings */}
          {[0.8, 1.5, 2.1].map((py) => (
            <mesh key={py} position={[0, py, 0]} castShadow>
              <torusGeometry args={[0.17, 0.035, 6, 10]} />
              <meshStandardMaterial color="#3f2d16" roughness={0.9} />
            </mesh>
          ))}
        </group>
      ))}
      <mesh position={[0, 2.65, 0]} castShadow material={mats.wood}>
        <boxGeometry args={[3.5, 0.22, 0.26]} />
      </mesh>
      {/* Hanging charm */}
      <mesh position={[0, 2.25, 0]}>
        <coneGeometry args={[0.09, 0.35, 5]} />
        <meshStandardMaterial color="#e8ddc8" roughness={0.7} />
      </mesh>
      <Html center position={[0, 3.2, 0]} distanceFactor={18}>
        <div className="map-label">{t.labels.leavePlace}</div>
      </Html>
    </group>
  )
}

// --- Non-enterable dwellings and outbuildings (design.md §2 lively settlements) ----

/** Rectangular adobe/plaster house with flat roof; door on local +Z. */
function BoxHouse({ d, mats, variant }: { d: DwellingDef; mats: PlaceMaterials; variant: number }) {
  const w = d.r * 2
  const depth = d.r * 1.75
  const wall = variant % 3 === 0 ? mats.plasterDark : variant % 3 === 1 ? mats.plaster : mats.mud
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow receiveShadow material={wall}>
        <boxGeometry args={[w, d.h, depth]} />
      </mesh>
      {/* Flat roof with parapet */}
      <mesh position={[0, d.h + 0.07, 0]} castShadow material={mats.wood}>
        <boxGeometry args={[w + 0.24, 0.14, depth + 0.24]} />
      </mesh>
      {[
        [0, depth / 2, w + 0.24, 0.16],
        [0, -depth / 2, w + 0.24, 0.16],
        [-w / 2, 0, 0.16, depth],
        [w / 2, 0, 0.16, depth],
      ].map(([px, pz, sw, sd], i) => (
        <mesh key={i} position={[px, d.h + 0.26, pz]} castShadow material={wall}>
          <boxGeometry args={[sw, 0.26, sd]} />
        </mesh>
      ))}
      {/* Closed door (not enterable) */}
      <mesh position={[0, 0.8, depth / 2 + 0.02]}>
        <boxGeometry args={[0.85, 1.6, 0.07]} />
        <meshStandardMaterial color="#4a3520" roughness={0.95} />
      </mesh>
      {/* Small windows: ground floor beside the door, upper floor if any */}
      <mesh position={[w * 0.28, 1.35, depth / 2 + 0.02]}>
        <boxGeometry args={[0.4, 0.45, 0.06]} />
        <meshStandardMaterial color="#2c2317" roughness={0.8} />
      </mesh>
      {d.floors > 1 &&
        [-w * 0.24, w * 0.24].map((wx) => (
          <mesh key={wx} position={[wx, d.h - 0.85, depth / 2 + 0.02]}>
            <boxGeometry args={[0.42, 0.5, 0.06]} />
            <meshStandardMaterial color="#2c2317" roughness={0.8} />
          </mesh>
        ))}
      {/* Roof beams poking out of the facade (adobe look) */}
      {[-w * 0.32, 0, w * 0.32].map((wx) => (
        <mesh key={`b${wx}`} position={[wx, d.h - 0.18, depth / 2 + 0.12]} rotation={[Math.PI / 2, 0, 0]} castShadow material={mats.wood}>
          <cylinderGeometry args={[0.05, 0.05, 0.3, 5]} />
        </mesh>
      ))}
    </group>
  )
}

/** Raised granary: mud body on stilt legs with a thatch cap. */
function Granary({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      {[
        [-0.5, -0.5],
        [0.5, -0.5],
        [-0.5, 0.5],
        [0.5, 0.5],
      ].map(([lx, lz], i) => (
        <mesh key={i} position={[lx, 0.32, lz]} castShadow material={mats.wood}>
          <cylinderGeometry args={[0.07, 0.09, 0.64, 5]} />
        </mesh>
      ))}
      <mesh position={[0, 0.64 + d.h / 2, 0]} castShadow material={mats.mud}>
        <cylinderGeometry args={[d.r, d.r * 1.1, d.h, 10]} />
      </mesh>
      <mesh position={[0, 0.64 + d.h + d.r * 0.42, 0]} castShadow material={mats.thatch}>
        <coneGeometry args={[d.r * 1.35, d.r * 1.05, 10]} />
      </mesh>
      {/* Small filling hatch */}
      <mesh position={[0, 0.64 + d.h * 0.75, d.r * 0.95]}>
        <boxGeometry args={[0.35, 0.35, 0.08]} />
        <meshStandardMaterial color="#3d2c16" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Canvas tent (ports: traders passing through). */
function Tent({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow material={mats.cloth}>
        <coneGeometry args={[d.r * 1.25, d.h, 8]} />
      </mesh>
      <mesh position={[0, d.h + 0.12, 0]} castShadow material={mats.wood}>
        <cylinderGeometry args={[0.03, 0.03, 0.45, 5]} />
      </mesh>
      {/* Dark entrance flap */}
      <mesh position={[0, 0.55, d.r * 0.82]} rotation={[0.22, 0, 0]}>
        <boxGeometry args={[0.55, 1.05, 0.06]} />
        <meshStandardMaterial color="#3a3226" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Long harbor warehouse with a wide gate. */
function Warehouse({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  const w = d.r * 2
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow receiveShadow material={mats.plasterDark}>
        <boxGeometry args={[w, d.h, 4.6]} />
      </mesh>
      <mesh position={[0, d.h + 0.08, 0]} castShadow material={mats.wood}>
        <boxGeometry args={[w + 0.3, 0.16, 4.9]} />
      </mesh>
      {/* Wide gate */}
      <mesh position={[0, 1.1, 2.32]}>
        <boxGeometry args={[2.4, 2.2, 0.08]} />
        <meshStandardMaterial color="#4a3520" roughness={0.95} />
      </mesh>
      {[-w * 0.32, w * 0.32].map((wx) => (
        <mesh key={wx} position={[wx, d.h - 0.7, 2.32]}>
          <boxGeometry args={[0.5, 0.45, 0.06]} />
          <meshStandardMaterial color="#2c2317" roughness={0.8} />
        </mesh>
      ))}
      {/* Barrels along the wall */}
      {[-w * 0.28, -w * 0.12, w * 0.2].map((wx, i) => (
        <mesh key={`f${i}`} position={[wx, 0.36, 2.75]} castShadow>
          <cylinderGeometry args={[0.3, 0.34, 0.72, 9]} />
          <meshStandardMaterial color="#6e4f2a" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/** Market stall: poles, cloth roof, counter with goods. */
function Stall({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      {[
        [-1.1, -0.8],
        [1.1, -0.8],
        [-1.1, 0.8],
        [1.1, 0.8],
      ].map(([px, pz], i) => (
        <mesh key={i} position={[px, 1.0, pz]} castShadow material={mats.wood}>
          <cylinderGeometry args={[0.05, 0.06, 2.0, 5]} />
        </mesh>
      ))}
      <mesh position={[0, 2.05, 0]} rotation={[0.14, 0, 0]} castShadow material={mats.cloth}>
        <boxGeometry args={[2.6, 0.06, 2.0]} />
      </mesh>
      {/* Counter with goods */}
      <mesh position={[0, 0.55, 0.55]} castShadow material={mats.wood}>
        <boxGeometry args={[2.2, 0.5, 0.7]} />
      </mesh>
      <mesh position={[-0.6, 0.95, 0.55]} castShadow>
        <boxGeometry args={[0.5, 0.3, 0.4]} />
        <meshStandardMaterial color="#8a6a3a" roughness={0.9} />
      </mesh>
      <mesh position={[0.5, 0.95, 0.55]} castShadow>
        <sphereGeometry args={[0.28, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshStandardMaterial color="#a3702e" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Landmark tower of a major city (design.md §4.1): shaft, gallery, dome. */
function Tower({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow receiveShadow material={mats.plaster}>
        <cylinderGeometry args={[d.r * 0.75, d.r, d.h, 10]} />
      </mesh>
      {/* Gallery ring */}
      <mesh position={[0, d.h + 0.12, 0]} castShadow material={mats.plasterDark}>
        <cylinderGeometry args={[d.r * 1.05, d.r * 1.05, 0.3, 10]} />
      </mesh>
      {/* Upper stage and dome */}
      <mesh position={[0, d.h + 0.8, 0]} castShadow material={mats.plaster}>
        <cylinderGeometry args={[d.r * 0.55, d.r * 0.62, 1.15, 9]} />
      </mesh>
      <mesh position={[0, d.h + 1.65, 0]} castShadow>
        <sphereGeometry args={[d.r * 0.55, 9, 7]} />
        <meshStandardMaterial color="#8f9573" roughness={0.5} metalness={0.35} />
      </mesh>
    </group>
  )
}

/** Small utility shed with a slanted roof and a wood pile. */
function Shed({ d, mats }: { d: DwellingDef; mats: PlaceMaterials }) {
  return (
    <group position={[d.x, 0, d.z]} rotation={[0, d.rot, 0]}>
      <mesh position={[0, d.h / 2, 0]} castShadow receiveShadow material={mats.wood}>
        <boxGeometry args={[d.r * 2, d.h, d.r * 1.6]} />
      </mesh>
      <mesh position={[0, d.h + 0.1, 0]} rotation={[0.16, 0, 0]} castShadow material={mats.thatch}>
        <boxGeometry args={[d.r * 2.3, 0.12, d.r * 2]} />
      </mesh>
      {/* Wood pile */}
      {[0, 1, 2].map((i) => (
        <mesh
          key={i}
          position={[d.r + 0.45, 0.14 + i * 0.17, (i % 2) * 0.1 - 0.05]}
          rotation={[0, 0.2, Math.PI / 2]}
          castShadow
          material={mats.wood}
        >
          <cylinderGeometry args={[0.08, 0.09, 1.1, 5]} />
        </mesh>
      ))}
    </group>
  )
}

/** Dispatch a dwelling to its regional building component. */
function Dwelling({ d, mats, style, variant }: { d: DwellingDef; mats: PlaceMaterials; style: RegionPlaceStyle; variant: number }) {
  switch (d.kind) {
    case 'hut':
      return <VillageHut x={d.x} z={d.z} r={d.r} h={d.h} rot={d.rot} mats={mats} style={style} />
    case 'box':
      return <BoxHouse d={d} mats={mats} variant={variant} />
    case 'granary':
      return <Granary d={d} mats={mats} />
    case 'tent':
      return <Tent d={d} mats={mats} />
    case 'warehouse':
      return <Warehouse d={d} mats={mats} />
    case 'stall':
      return <Stall d={d} mats={mats} />
    case 'tower':
      return <Tower d={d} mats={mats} />
    default:
      return <Shed d={d} mats={mats} />
  }
}

/** Instanced fences: thorn-bush kraal rings, woven panels, dry-stone walls. */
function Fences({ fences, mats }: { fences: FenceDef[]; mats: PlaceMaterials }) {
  const bushGeo = useMemo(() => buildBush(), [])
  const panelGeo = useMemo(() => new THREE.BoxGeometry(0.82, 0.95, 0.07), [])
  const stoneGeo = useMemo(() => new THREE.BoxGeometry(0.9, 0.5, 0.34), [])
  const thornMat = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, color: '#a8845a', roughness: 1 }),
    [],
  )
  const stoneMat = useMemo(() => new THREE.MeshStandardMaterial({ color: '#8d8478', roughness: 1 }), [])

  const { thorn, woven, stone } = useMemo(() => {
    const out = { thorn: [] as Array<[number, number, number]>, woven: [] as Array<[number, number, number]>, stone: [] as Array<[number, number, number]> }
    for (const f of fences) {
      for (let i = 0; i < f.posts.length; i++) {
        const [x, z] = f.posts[i]
        const [nx, nz] = f.posts[(i + 1) % f.posts.length]
        const rot = Math.atan2(nx - x, nz - z) + Math.PI / 2
        out[f.kind].push([x, z, rot])
      }
    }
    return out
  }, [fences])

  const thornRef = useRef<THREE.InstancedMesh>(null)
  const wovenRef = useRef<THREE.InstancedMesh>(null)
  const stoneRef = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mtx = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const fill = (mesh: THREE.InstancedMesh | null, list: Array<[number, number, number]>, y: number, scale: (i: number) => THREE.Vector3) => {
      if (!mesh) return
      list.forEach(([x, z, rot], i) => {
        quat.setFromAxisAngle(up, rot)
        mtx.compose(new THREE.Vector3(x, y, z), quat, scale(i))
        mesh.setMatrixAt(i, mtx)
      })
      mesh.count = list.length
      mesh.instanceMatrix.needsUpdate = true
    }
    fill(thornRef.current, thorn, 0, (i) => new THREE.Vector3(1.5, 1.3 + ((i * 37) % 10) / 18, 1.5))
    fill(wovenRef.current, woven, 0.48, () => new THREE.Vector3(1, 1, 1))
    fill(stoneRef.current, stone, 0.24, (i) => new THREE.Vector3(1, 0.85 + ((i * 53) % 10) / 25, 1))
  }, [thorn, woven, stone])

  return (
    <>
      <instancedMesh ref={thornRef} args={[bushGeo, thornMat, 220]} castShadow receiveShadow />
      <instancedMesh ref={wovenRef} args={[panelGeo, mats.thatch, 160]} castShadow receiveShadow />
      <instancedMesh ref={stoneRef} args={[stoneGeo, stoneMat, 160]} castShadow receiveShadow />
    </>
  )
}

type FloraSpecies = 'palm' | 'acacia' | 'jungle' | 'bush'

/** Pick the species for a flora slot from the region's weight mix. */
function pickFlora(style: RegionPlaceStyle, t: number): FloraSpecies {
  const { palm, acacia, jungle } = style.flora
  if (t < palm) return 'palm'
  if (t < palm + acacia) return 'acacia'
  if (t < palm + acacia + jungle) return 'jungle'
  return 'bush'
}

// First-person plants reuse the travel-scale geometries, scaled up to
// walkable proportions.
const FLORA_SCALE: Record<FloraSpecies, number> = { palm: 1, acacia: 2.1, jungle: 1.7, bush: 2.4 }

function PlaceFlora({
  slots,
  style,
  material,
  geos,
}: {
  slots: Array<{ x: number; z: number; h: number }>
  style: RegionPlaceStyle
  material: THREE.Material
  geos: Record<FloraSpecies, THREE.BufferGeometry>
}) {
  return (
    <>
      {slots.map((t, i) => {
        const species = pickFlora(style, ((i * 0.37 + t.h * 0.11) % 1 + 1) % 1)
        const s = (t.h / 4.4) * FLORA_SCALE[species]
        return (
          <mesh
            key={i}
            geometry={geos[species]}
            material={material}
            position={[t.x, 0, t.z]}
            rotation={[0, (t.x * 7 + t.z * 13) % 6, 0]}
            scale={[s, s, s]}
            castShadow
          />
        )
      })}
    </>
  )
}

/** Village campfire: stone ring, logs, emissive flame, flickering light. */
function FirePit({ x, z }: { x: number; z: number }) {
  const light = useRef<THREE.PointLight>(null)
  useFrame(({ clock }) => {
    if (light.current) {
      const t = clock.elapsedTime
      light.current.intensity = 14 + Math.sin(t * 9) * 2.5 + Math.sin(t * 23.7) * 1.5
    }
  })
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, 0.02, 0]} receiveShadow>
        <cylinderGeometry args={[0.9, 0.9, 0.05, 14]} />
        <meshStandardMaterial color="#3a3128" roughness={1} />
      </mesh>
      {Array.from({ length: 7 }, (_, i) => {
        const a = (i / 7) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.95, 0.12, Math.sin(a) * 0.95]} castShadow>
            <dodecahedronGeometry args={[0.16, 0]} />
            <meshStandardMaterial color="#79706a" roughness={1} />
          </mesh>
        )
      })}
      {[0.5, -0.6].map((ry, i) => (
        <mesh key={i} position={[0, 0.14, 0]} rotation={[0.08, ry, 0]} castShadow>
          <cylinderGeometry args={[0.07, 0.08, 1.1, 6]} />
          <meshStandardMaterial color="#4a3018" roughness={1} />
        </mesh>
      ))}
      <mesh position={[0, 0.42, 0]}>
        <coneGeometry args={[0.3, 0.75, 8]} />
        <meshStandardMaterial color="#ff9a2e" emissive="#ff6a00" emissiveIntensity={2.4} roughness={0.4} />
      </mesh>
      <pointLight ref={light} position={[0, 1.1, 0]} color="#ffab4a" distance={14} decay={2} castShadow={false} />
    </group>
  )
}

/** Seeded ground scatter: grass tufts (walkable) plus the layout's solid rocks. */
function GroundScatter({
  placeId,
  seed,
  isPort,
  grassFactor = 1,
  rocks,
  radius,
}: {
  placeId: string
  seed: number
  isPort: boolean
  grassFactor?: number
  rocks: Array<[number, number, number]>
  radius: number
}) {
  const tufts = useMemo(() => {
    let hash = 0
    for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
    const rand = mulberry32(((seed ^ hash) + 977) >>> 0)
    const tufts: Array<[number, number, number]> = []
    const tuftCount = Math.round((isPort ? 30 : 70) * grassFactor)
    for (let i = 0; i < tuftCount; i++) {
      const a = rand() * Math.PI * 2
      const r = 4 + rand() * (radius + 8)
      tufts.push([Math.cos(a) * r, Math.sin(a) * r, 0.55 + rand() * 0.55])
    }
    return tufts
  }, [placeId, seed, isPort, grassFactor, radius])

  const tuftGeo = useMemo(() => buildGrassTuft(), [])
  const rockGeo = useMemo(() => buildRock(), [])
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }), [])
  const tuftMesh = useRef<THREE.InstancedMesh>(null)
  const rockMesh = useRef<THREE.InstancedMesh>(null)

  useEffect(() => {
    const mtx = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    tufts.forEach(([x, z, s], i) => {
      quat.setFromAxisAngle(up, x * 3 + z)
      mtx.compose(new THREE.Vector3(x, 0, z), quat, new THREE.Vector3(s, s, s))
      tuftMesh.current?.setMatrixAt(i, mtx)
    })
    rocks.forEach(([x, z, s], i) => {
      quat.setFromAxisAngle(up, z * 5 + x)
      mtx.compose(new THREE.Vector3(x, 0, z), quat, new THREE.Vector3(s, s, s))
      rockMesh.current?.setMatrixAt(i, mtx)
    })
    if (tuftMesh.current) {
      tuftMesh.current.count = tufts.length
      tuftMesh.current.instanceMatrix.needsUpdate = true
    }
    if (rockMesh.current) {
      rockMesh.current.count = rocks.length
      rockMesh.current.instanceMatrix.needsUpdate = true
    }
  }, [tufts, rocks])

  return (
    <>
      <instancedMesh ref={tuftMesh} args={[tuftGeo, material, 96]} receiveShadow />
      <instancedMesh ref={rockMesh} args={[rockGeo, material, 20]} castShadow receiveShadow />
    </>
  )
}

// --- Landscape backdrop --------------------------------------------------------

/**
 * Panorama of the real surroundings (design.md §2): an annulus heightfield
 * sampled from the actual travel terrain around the place's map position, so
 * the first-person view shows the mountains, river courses, lakes and the
 * coast that lie there in the bird's-eye view. Rendered as distant scenery
 * in biome colors; heights are exaggerated to read at person scale.
 */
const BACKDROP_SCALE = 0.005 // degrees of map per place-unit of distance
const BACKDROP_HEIGHT = 30 // vertical exaggeration of the map relief
const BACKDROP_RINGS = 24
const BACKDROP_SEGS = 96

function LandscapeBackdrop({ lat, lon, seed, innerRadius }: { lat: number; lon: number; seed: number; innerRadius: number }) {
  const geometry = useMemo(() => {
    const r0 = innerRadius
    const r1 = 340
    const centerH = sampleTerrain(lat, lon, seed).height
    const positions: number[] = []
    const colors: number[] = []
    const indices: number[] = []
    for (let ri = 0; ri < BACKDROP_RINGS; ri++) {
      // Logarithmic ring spacing: more detail near the settlement.
      const r = r0 * Math.pow(r1 / r0, ri / (BACKDROP_RINGS - 1))
      // The inner rim tucks below the settlement ground and fades upward.
      const taper = Math.min(1, ri / 5)
      for (let si = 0; si < BACKDROP_SEGS; si++) {
        const a = (si / BACKDROP_SEGS) * Math.PI * 2
        const x = Math.cos(a) * r
        const z = Math.sin(a) * r
        const smp = sampleTerrain(lat - z * BACKDROP_SCALE, lon + x * BACKDROP_SCALE, seed)
        const y = Math.max(-6, (smp.height - centerH) * BACKDROP_HEIGHT) * taper - 2
        positions.push(x, y, z)
        colors.push(smp.color[0], smp.color[1], smp.color[2])
      }
    }
    for (let ri = 0; ri < BACKDROP_RINGS - 1; ri++) {
      for (let si = 0; si < BACKDROP_SEGS; si++) {
        const a = ri * BACKDROP_SEGS + si
        const b = ri * BACKDROP_SEGS + ((si + 1) % BACKDROP_SEGS)
        const c = a + BACKDROP_SEGS
        const d = b + BACKDROP_SEGS
        indices.push(a, c, b, b, c, d)
      }
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3))
    geo.setIndex(indices)
    geo.computeVertexNormals()
    return geo
  }, [lat, lon, seed, innerRadius])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }),
    [],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeBackdrop = geometry.attributes.position.count
    return () => {
      delete w.__placeBackdrop
    }
  }, [geometry])

  return <mesh geometry={geometry} material={material} receiveShadow />
}

// --- Scene --------------------------------------------------------------------

export function PlaceScene() {
  const camera = useThree((s) => s.camera)
  const gl = useThree((s) => s.gl)
  const placeId = useGame((s) => s.placeId)
  const seed = useGame((s) => s.seed)
  const setPrompt = useUi((s) => s.setPrompt)
  const setDialog = useUi((s) => s.setDialog)

  const place = placeId ? placeById(placeId) : null
  const layout = useMemo(
    () => (placeId ? buildLayout(placeId, seed) : null),
    [placeId, seed],
  )
  const isPort = place?.kind === 'port'
  const style = REGION_PLACE_STYLES[place?.region ?? 'west']
  const pathTex = usePathTexture(layout?.paths ?? null)
  const mats = usePlaceMaterials(!!isPort, style, pathTex)
  const floraGeos = useMemo<Record<FloraSpecies, THREE.BufferGeometry>>(
    () => ({ palm: buildPalm(true), acacia: buildAcacia(), jungle: buildJungleTree(), bush: buildBush() }),
    [],
  )
  const floraMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  )

  // yaw 0 faces -Z (toward the place center from the southern spawn point).
  const player = useRef({ x: 0, z: 18, yaw: 0 })
  const nearRef = useRef<Interactive | null>(null)

  // Reset position when the place changes (just inside the exit gate).
  useEffect(() => {
    player.current = { x: 0, z: (layout?.radius ?? PLACE_RADIUS) - 10, yaw: 0 }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placeId])

  // Dev-only hooks for the headless Playwright verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placePlayer = player.current
    w.__placeLayout = layout
    w.__placeColliders = layout?.colliders
    w.__placeCamera = camera
    return () => {
      delete w.__placePlayer
      delete w.__placeLayout
      delete w.__placeColliders
      delete w.__placeCamera
    }
  }, [layout, camera])

  // Mouse look via pointer lock on canvas click.
  useEffect(() => {
    const el = gl.domElement
    const onClick = () => {
      if (!useUi.getState().dialog && document.pointerLockElement !== el) {
        el.requestPointerLock()
      }
    }
    const onMove = (e: MouseEvent) => {
      if (document.pointerLockElement === el) {
        player.current.yaw -= e.movementX * balance.mouseSensitivity
      }
    }
    el.addEventListener('click', onClick)
    window.addEventListener('mousemove', onMove)
    return () => {
      el.removeEventListener('click', onClick)
      window.removeEventListener('mousemove', onMove)
      if (document.pointerLockElement === el) document.exitPointerLock()
    }
  }, [gl])

  // Interaction key.
  useEffect(() => {
    const offE = onKeyPress('KeyE', () => {
      const near = nearRef.current
      if (!near || useUi.getState().dialog) return
      const game = useGame.getState()
      if (near.type === 'exit') {
        game.leavePlace()
      } else if (near.type === 'villager') {
        game.talkToVillager()
      } else if (near.type === 'chief') {
        // Standing gates (design.md §12): a visible rifle causes flight and
        // blockade, a robbed region shuns the traveler, hostility lingers.
        const strings = getStrings()
        const place = game.placeId ? placeById(game.placeId) : null
        if (game.handItem === 'rifle') {
          game.setToast(strings.toasts.villagersFlee)
        } else if (place && game.regionRobbed[place.region]) {
          game.setToast(strings.toasts.regionShunned)
        } else if (place && (game.hostileUntil[place.id] ?? 0) > game.day) {
          game.setToast(strings.toasts.chiefHostile)
        } else {
          setDialog({ kind: 'audience' })
          if (document.pointerLockElement) document.exitPointerLock()
        }
      } else if (near.type === 'bazaar' || near.type === 'agency') {
        setDialog({ kind: near.type })
        if (document.pointerLockElement) document.exitPointerLock()
      } else {
        setDialog({ kind: 'trade', building: near.type })
        if (document.pointerLockElement) document.exitPointerLock()
      }
    })
    return () => {
      offE()
      setPrompt(null)
    }
  }, [setDialog, setPrompt])

  useFrame((_, rawDt) => {
    if (!layout) return
    const dt = Math.min(rawDt, 0.1)
    const p = player.current

    if (!useUi.getState().dialog && !useGame.getState().journalOpen) {
      // Q/E-free tank controls: WASD + arrows; ←/→ turn, A/D strafe.
      if (isKeyDown('ArrowLeft')) p.yaw += 2.2 * dt
      if (isKeyDown('ArrowRight')) p.yaw -= 2.2 * dt
      let forward = 0
      let strafe = 0
      if (isKeyDown('KeyW') || isKeyDown('ArrowUp')) forward += 1
      if (isKeyDown('KeyS') || isKeyDown('ArrowDown')) forward -= 1
      if (isKeyDown('KeyA')) strafe -= 1
      if (isKeyDown('KeyD')) strafe += 1
      const len = Math.hypot(forward, strafe)
      if (len > 0) {
        const speed = balance.placeWalkSpeed
        const sin = Math.sin(p.yaw)
        const cos = Math.cos(p.yaw)
        // Forward is -Z rotated by yaw.
        const dx = ((-sin * forward + cos * strafe) / len) * speed * dt
        const dz = ((-cos * forward - sin * strafe) / len) * speed * dt
        // Solid objects are impenetrable; the pushout lets the player slide
        // along walls (design.md §2 collision inside settlements).
        const [rx, rz] = resolveMove(layout.colliders, p.x + dx, p.z + dz, PLAYER_RADIUS)
        p.x = rx
        p.z = rz
        const r = Math.hypot(p.x, p.z)
        if (r > layout.radius) {
          useGame.getState().leavePlace()
          return
        }
      }
    }

    camera.position.set(p.x, EYE_HEIGHT, p.z)
    camera.rotation.set(0, p.yaw, 0, 'YXZ')

    // Interaction proximity.
    let near: Interactive | null = null
    let best = INTERACT_RADIUS
    for (const it of layout.interactives) {
      const d = Math.hypot(p.x - it.pos[0], p.z - it.pos[1])
      if (d < best) {
        best = d
        near = it
      }
    }
    nearRef.current = near
    const strings = getStrings()
    const prompt = near ? strings.prompts.interact(interactiveLabel(strings, near.type)) : null
    if (useUi.getState().prompt !== prompt) setPrompt(prompt)
  })

  if (!place || !layout) return null
  const sky = isPort ? PORT_SKY : VILLAGE_SKY

  return (
    <>
      <color attach="background" args={[sky.horizon]} />
      <fog attach="fog" args={[sky.horizon, 42, 320]} />
      <SkyDome preset={sky} sunDirection={SUN_DIR} radius={400} />
      <hemisphereLight args={[isPort ? '#cfe2ee' : '#d8e2c2', '#8f7a55', 0.8]} />
      <directionalLight
        position={[SUN_DIR[0] * 60, SUN_DIR[1] * 60, SUN_DIR[2] * 60]}
        color="#fff1d8"
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-55}
        shadow-camera-right={55}
        shadow-camera-top={55}
        shadow-camera-bottom={-55}
        shadow-camera-near={5}
        shadow-camera-far={160}
        shadow-bias={-0.0004}
      />

      {/* Real-surroundings panorama behind the settlement (design.md §2) */}
      <LandscapeBackdrop lat={place.lat} lon={place.lon} seed={seed} innerRadius={layout.radius + 12} />

      {/* Ground disc with procedural mottling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow material={mats.ground}>
        <circleGeometry args={[layout.radius + 14, 48]} />
      </mesh>

      {layout.interactives.map((it, i) => {
        if (it.type === 'villager') return <Villager key={i} item={it} style={style} />
        if (it.type === 'exit') return <ExitGate key={i} item={it} mats={mats} />
        if (isPort) return <PortBuilding key={i} item={it} mats={mats} variant={i} />
        // Chief hut: larger village hut with regalia.
        return (
          <VillageHut key={i} x={it.pos[0]} z={it.pos[1]} r={3} h={3} label={interactiveLabel(getStrings(), 'chief')} mats={mats} style={style} chief />
        )
      })}

      {/* Non-enterable dwellings and outbuildings (design.md §2 lively settlements) */}
      {layout.dwellings.map((d, i) => (
        <Dwelling key={i} d={d} mats={mats} style={style} variant={i} />
      ))}

      <Fences fences={layout.fences} mats={mats} />

      {!isPort && <FirePit x={-3.5} z={2.5} />}

      <PlaceFlora slots={layout.flora} style={isPort ? REGION_PLACE_STYLES.north : style} material={floraMaterial} geos={floraGeos} />

      <GroundScatter placeId={place.id} seed={seed} isPort={!!isPort} grassFactor={style.grass} rocks={layout.rocks} radius={layout.radius} />

      <PlaceLife
        kind={isPort ? 'port' : 'village'}
        size={place.size ?? 1}
        seed={seed}
        placeId={place.id}
        style={style}
        buildings={layout.interactives.filter((it) => it.type !== 'exit' && it.type !== 'villager').map((it) => it.pos)}
        firePos={[-3.5, 2.5]}
        homes={layout.dwellings
          .filter((d) => d.kind === 'hut' || d.kind === 'box')
          .map((d) => ({ x: d.x, z: d.z, door: d.door }))}
        errands={layout.errands}
        pen={layout.pen}
        colliders={layout.colliders}
      />
    </>
  )
}
