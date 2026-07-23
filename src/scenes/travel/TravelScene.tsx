// Bird's-eye travel view (design.md §2): 3D terrain around the player,
// top-down oriented movement, camera following from above. Visuals: TSL sky
// dome, sun with soft shadows, animated ocean, instanced biome vegetation.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import {
  attribute,
  float,
  mix,
  mx_fractal_noise_float,
  normalMap,
  normalWorldGeometry,
  positionWorld,
  smoothstep,
  texture,
  vec2,
  vec3,
  vec4,
  vertexColor,
} from 'three/tsl'
import { useGame } from '../../state/store'
import { useUi } from '../../state/ui'
import { balance, START_YEAR } from '../../config/balance'
import { PLACES, latLonToWorld, worldToLatLon, type PlaceDef } from '../../world/geo'
import { settlementEnterCandidate, shouldEnterSettlement } from './settlementEntry'
import { sampleTerrain, type TerrainType } from '../../world/terrain'
import { REFINE_RING_MAX, chunkNeedsRefine, refinedSegments } from './terrainLod'
import { drainChunkQueue, orderChunkJobs, planChunkWindow, predictedNextCenter, type ChunkJob } from './terrainQueue'
import { lakeDistance, riverDistance } from '../../world/geoIndex'
import { LAKES } from '../../world/data/lakes'
import { CULTURAL_LANDMARKS, ELEPHANT_GRAVEYARD, MOUNTAINS, NATURAL_SITES, WATERFALLS } from '../../world/data/landmarks'
import { consumeTouchLook, consumeTouchPinch, moveAxes, onKeyPress } from '../../systems/input'
import { resolveTravelMove } from '../../systems/movement'
import { CURRENT_WEATHER, nileFloodAt, okavangoFloodAt, seasonalSnowAt, sunDimFactor } from '../../systems/season'
import { crownCollapse, drynessFromTint, FLORA_COLOR_LIFT, groundSprout, seasonTintNode, wetGroundColor, wetGroundRoughness } from '../../render/seasonTint'
import { seasonalSnowNode, setSeasonalSnow } from '../../render/seasonalSnow'
import { NILE_FLOOD } from './waterSurface'
import { RiversAndLakes } from './Rivers'
import { waterSurfaceY } from './waterSurface'
import { seasonFieldGreens, seasonFieldTintAt, seasonFieldTintAttrNode, seasonFieldTintNode, seasonFieldUV, updateSeasonField } from '../../render/seasonField'
import { capturePanorama, hasPanoramaCapture } from './panoramaCapture'
import {
  updateTrailPoint,
  canoeDragPose,
  CANOE_TRAIL_FAR,
  CANOE_DRAG_LEN,
  type TrailPoint,
} from './canoeDrag'
import { inReedBelt, solidDressingAllowed } from './waterEdgeRules'
import { chunkOffsetsByDistance, FLORA_FOG, floraAmortiseMaxStep, floraChunkRange, floraFillBatchSize, floraInSpawnCircle, floraShouldRebuild, floraSpawnRadius } from './floraStreaming'
import { farTerrainColor } from './farColor'
import { TRAVELLER_PACK } from '../../render/figures'
import { getStrings, useStrings } from '../../i18n'
import { SkyDome } from '../../render/sky'
import { TRAVEL_SKY } from '../../render/skyPresets'
import { createWaterMaterial } from '../../render/water'
import {
  buildAcacia,
  buildBaobab,
  buildBush,
  buildDeadTree,
  buildJungleTree,
  buildKopje,
  buildPalm,
  buildPapyrus,
  buildRock,
  buildTermiteMound,
  splitFoliage,
} from '../../render/flora'
import { buildElephant } from '../../render/fauna'
import { buildMeroePyramids, buildGizaPyramids, buildStoneCity, buildRockChurches, buildCoastalRuins,
  buildStelae,
  buildCastles,
  buildCliffDwellings,
  buildCrater,
  buildVolcano,
  buildDelta,
  buildDeltaWater,
  buildWetland,
} from '../../render/landmarks'
import { mulberry32, hashChunk } from '../../world/noise'
import { PERF, maxFrameMs, recordBurst, recordFrame, resetPerf } from './perfProbe'
import { Climate } from './Climate'
import { setFrameVisibilityTest } from './frameVisibility'
import { RegionBorders } from './RegionBorders'
import { Wildlife } from './Wildlife'
import { collidableAnimalsNear } from './wildlifeCollision'
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js'

const CHUNK_SIZE = 24 // world units
const CHUNK_RADIUS = 6 // chunks kept around the player in each direction (terrain LOD)

// World positions of every settlement marker, precomputed once for the
// per-frame enter-candidate test (design.md §2.3, settlementEnterCandidate).
const PLACE_WORLD_POSITIONS = PLACES.map((p) => {
  const w = latLonToWorld(p.lat, p.lon)
  return { id: p.id, x: w.x, z: w.z }
})
// Flora streaming rules (point 164) live in floraStreaming.ts so they are
// unit-testable; the render loop below consumes them.
// Beyond this debug-zoom factor the chunk-bound dressing (trees, rocks …)
// hides: it only ever covers a bounded radius, which would read as a dark
// dressed island on the far-terrain sheet (design.md §21.4). Kept at/below
// what FLORA_RANGE_MAX covers so the streaming edge never enters view.
const VEGETATION_HIDE_ZOOM = 2.5
const CAMERA_OFFSET = { y: 42, z: 24 }
const SKIRT_DROP = 1.6 // vertical skirt hiding cracks between LOD levels

// The LOD segment rules (base resolution per ring plus the near-ring quality
// doubling for coastal and mountainous chunks) live in terrainLod.ts so they
// are unit-testable (terrainShading.test.ts).

// The coast/mountain refine probes live in terrainLod.ts (point 209), memoised
// per chunk there so a crossing never re-probes long-known ground
// (docs/perf-driving-hitches.md).

/** Sun direction shared by the sky dome disc and the shadow light. */
const SUN_DIR: [number, number, number] = [0.5, 0.62, 0.38]

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

/**
 * Morph one chunk edge onto the coarser neighbour's anchor polyline so the two
 * adjacent LOD chunks share an IDENTICAL boundary curve — no T-junction crack
 * (point 220). `anchorH` holds the neighbour-resolution edge samples (length
 * `edgeSeg + 1`, corners included); each of this chunk's `segments + 1` edge
 * vertices is placed by linear interpolation between the two bracketing
 * anchors, so every fine vertex lands exactly on the coarse chord. When
 * `edgeSeg === segments` (neighbour equal or finer) the result is the identity.
 * The field the anchors sample (`sampleTerrain`) is deterministic per (lat,lon),
 * so both sides compute bit-identical edges and meet flush.
 */
// Pure helper extracted for unit testing (terrainShading.test.ts); not a component.
// eslint-disable-next-line react/only-export-components
export function stitchedEdgeHeights(anchorH: ArrayLike<number>, segments: number): Float32Array {
  const edgeSeg = anchorH.length - 1
  const out = new Float32Array(segments + 1)
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * edgeSeg
    let j = Math.floor(t)
    if (j >= edgeSeg) j = edgeSeg - 1
    const frac = t - j
    out[i] = anchorH[j] * (1 - frac) + anchorH[j + 1] * frac
  }
  return out
}

/**
 * Build one terrain chunk with smooth, seam-free normals: heights are sampled
 * with a one-vertex margin ring and normals derived by central differences,
 * so neighboring chunks agree exactly at their shared edges. Each shared edge
 * is additionally stitched to the coarser neighbour's resolution (edgeSegs,
 * point 220) so a fine chunk meeting a coarse one has no T-junction gap; a
 * dropped skirt still backs the seam against any residual hairline.
 */
// Exported for the seam-agreement unit test (terrainShading.test.ts); not a component.
// eslint-disable-next-line react/only-export-components
export function buildChunkGeometry(
  cx: number,
  cz: number,
  seed: number,
  segments: number,
  edgeSegs: readonly [number, number, number, number] = [segments, segments, segments, segments],
): THREE.BufferGeometry {
  const n = segments + 1
  const step = CHUNK_SIZE / segments
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE

  const skirtCount = 4 * n
  const total = n * n + skirtCount
  const positions = new Float32Array(total * 3)
  const normals = new Float32Array(total * 3)
  const colors = new Float32Array(total * 3)
  const splats = new Float32Array(total * 4)
  // Planar uv matching the material's top projection (world xz * 0.5): the
  // normal-map TBN derives from uv screen derivatives, so without a real uv
  // attribute the tangent basis degenerates (and every material build warns).
  const uvs = new Float32Array(total * 2)
  // The season field's texture coordinate (point 151): baked per vertex, so
  // ground tint/collapse follow THIS spot's climate, not the player's.
  const seasonUVs = new Float32Array(total * 2)

  // Height grid including a margin ring for normal computation.
  const m = n + 2
  const heights = new Float32Array(m * m)
  for (let iz = 0; iz < m; iz++) {
    for (let ix = 0; ix < m; ix++) {
      const x = x0 + (ix - 1) * step
      const z = z0 + (iz - 1) * step
      const { lat, lon } = worldToLatLon(x, z)
      const s = sampleTerrain(lat, lon, seed)
      heights[iz * m + ix] = s.height
      if (ix >= 1 && ix <= n && iz >= 1 && iz <= n) {
        const vi = (iz - 1) * n + (ix - 1)
        colors[vi * 3] = s.color[0]
        colors[vi * 3 + 1] = s.color[1]
        colors[vi * 3 + 2] = s.color[2]
        splats[vi * 4] = s.splat[0]
        splats[vi * 4 + 1] = s.splat[1]
        splats[vi * 4 + 2] = s.splat[2]
        splats[vi * 4 + 3] = s.splat[3]
      }
    }
  }

  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const vi = iz * n + ix
      positions[vi * 3] = x0 + ix * step
      positions[vi * 3 + 1] = heights[(iz + 1) * m + (ix + 1)]
      positions[vi * 3 + 2] = z0 + iz * step
      uvs[vi * 2] = (x0 + ix * step) * 0.5
      uvs[vi * 2 + 1] = (z0 + iz * step) * 0.5
      {
        const g = worldToLatLon(x0 + ix * step, z0 + iz * step)
        const [su, svv] = seasonFieldUV(g.lat, g.lon)
        seasonUVs[vi * 2] = su
        seasonUVs[vi * 2 + 1] = svv
      }
      const hl = heights[(iz + 1) * m + ix]
      const hr = heights[(iz + 1) * m + (ix + 2)]
      const hd = heights[iz * m + (ix + 1)]
      const hu = heights[(iz + 2) * m + (ix + 1)]
      const nx = hl - hr
      const nz = hd - hu
      const ny = 2 * step
      const inv = 1 / Math.hypot(nx, ny, nz)
      normals[vi * 3] = nx * inv
      normals[vi * 3 + 1] = ny * inv
      normals[vi * 3 + 2] = nz * inv
    }
  }

  // Edge index for edge e (0 north/-z, 1 south/+z, 2 west/-x, 3 east/+x) at
  // along-edge position i (0..segments). Shared by the seam stitch and the
  // skirt below.
  const edgeIndex = (e: number, i: number): number => {
    switch (e) {
      case 0: return i // north edge (iz = 0)
      case 1: return (n - 1) * n + i // south edge
      case 2: return i * n // west edge
      default: return i * n + (n - 1) // east edge
    }
  }

  // Seam stitch (point 220): where a neighbour meshes coarser than this chunk
  // (edgeSegs[e] < segments), snap this edge's vertices onto the neighbour's
  // anchor polyline so both chunks share one identical boundary curve — the
  // T-junction that the SKIRT_DROP skirt could not always hide once the
  // point-230 mountain doubling put a 112-seg chunk beside a 28/56-seg one.
  // Only the FINER side morphs (the coarser side has edgeSeg === segments, an
  // identity); both compute the same deterministic anchors and meet flush.
  for (let e = 0; e < 4; e++) {
    const edgeSeg = edgeSegs[e]
    if (edgeSeg >= segments) continue
    const anchorH = new Float32Array(edgeSeg + 1)
    for (let j = 0; j <= edgeSeg; j++) {
      const f = (j / edgeSeg) * CHUNK_SIZE
      let x: number
      let z: number
      switch (e) {
        case 0: x = x0 + f; z = z0; break
        case 1: x = x0 + f; z = z0 + CHUNK_SIZE; break
        case 2: x = x0; z = z0 + f; break
        default: x = x0 + CHUNK_SIZE; z = z0 + f; break
      }
      const { lat, lon } = worldToLatLon(x, z)
      anchorH[j] = sampleTerrain(lat, lon, seed).height
    }
    const stitched = stitchedEdgeHeights(anchorH, segments)
    for (let i = 0; i <= segments; i++) {
      positions[edgeIndex(e, i) * 3 + 1] = stitched[i]
    }
  }

  // Preallocated index buffer (docs/perf-driving-hitches.md): the former
  // number[] push built ~37k-150k elements of GC garbage per chunk — the
  // largest single allocation of the crossing burst.
  const indexArray = new Uint32Array(segments * segments * 6 + 4 * (n - 1) * 6)
  let ii = 0
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * n + ix
      const b = a + 1
      const c = a + n
      const d = c + 1
      indexArray[ii++] = a
      indexArray[ii++] = c
      indexArray[ii++] = b
      indexArray[ii++] = b
      indexArray[ii++] = c
      indexArray[ii++] = d
    }
  }

  // Skirt: duplicate the (now stitched) border vertices, dropped by SKIRT_DROP.
  // The terrain material renders double-sided, so winding does not matter here.
  let sv = n * n
  for (let e = 0; e < 4; e++) {
    const base = sv
    for (let i = 0; i < n; i++) {
      const src = edgeIndex(e, i)
      positions[sv * 3] = positions[src * 3]
      positions[sv * 3 + 1] = positions[src * 3 + 1] - SKIRT_DROP
      positions[sv * 3 + 2] = positions[src * 3 + 2]
      normals[sv * 3] = normals[src * 3]
      normals[sv * 3 + 1] = normals[src * 3 + 1]
      normals[sv * 3 + 2] = normals[src * 3 + 2]
      colors[sv * 3] = colors[src * 3]
      colors[sv * 3 + 1] = colors[src * 3 + 1]
      colors[sv * 3 + 2] = colors[src * 3 + 2]
      for (let k = 0; k < 4; k++) splats[sv * 4 + k] = splats[src * 4 + k]
      uvs[sv * 2] = uvs[src * 2]
      uvs[sv * 2 + 1] = uvs[src * 2 + 1]
      seasonUVs[sv * 2] = seasonUVs[src * 2]
      seasonUVs[sv * 2 + 1] = seasonUVs[src * 2 + 1]
      sv++
    }
    for (let i = 0; i < n - 1; i++) {
      const a = edgeIndex(e, i)
      const b = edgeIndex(e, i + 1)
      indexArray[ii++] = a
      indexArray[ii++] = b
      indexArray[ii++] = base + i
      indexArray[ii++] = b
      indexArray[ii++] = base + i + 1
      indexArray[ii++] = base + i
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('splat', new THREE.BufferAttribute(splats, 4))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setAttribute('seasonUV', new THREE.BufferAttribute(seasonUVs, 2))
  const indices = new THREE.BufferAttribute(indexArray, 1)
  geo.setIndex(indices)
  return geo
}

/**
 * Terrain material (design.md §3): biome vertex tint over splatted tileable
 * PBR ground textures (scripts/generate-terrain-textures.mjs), with detail
 * normal maps and bi-planar rock on steep slopes.
 */
// The season tint curves live in render/seasonTint.ts so the settlement
// scene shares them (point 143). THIS scene samples the per-position season
// FIELD (render/seasonField.ts, point 151) through baked seasonUV
// attributes; only the place scene still drives the single SEASON_TINT_U
// uniform — one place, one greenness, correct there.

// Travel materials are MODULE singletons (point 96): a remounted travel scene
// must reuse the same material instances, or the renderer builds ~100 fresh
// programs per visit cycle and the first draw after leavePlace() links them
// synchronously (~7-10 s main-thread freeze, CDP-profiled).
let terrainMaterialCache: THREE.MeshStandardNodeMaterial | null = null
let waterHandleCache: ReturnType<typeof createWaterMaterial> | null = null
const FAR_TERRAIN_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 })
const BONE_MATERIAL = new THREE.MeshStandardMaterial({ color: '#c7bda6', roughness: 1, vertexColors: false })
const IVORY_MATERIAL = new THREE.MeshStandardMaterial({ color: '#e9dec6', roughness: 0.65 })
const LANDMARK_MATERIAL = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 })

// The water plane's geometry, shared across mounts (point 96): larger than
// the fog far distance so its edge is never visible.
const WATER_PLANE_GEOMETRY = new THREE.PlaneGeometry(CHUNK_SIZE * 30, CHUNK_SIZE * 30, 180, 180)

// Seed-independent elephant-graveyard geometries (point 96), built lazily once.
let graveyardGeoCache: { elephantGeo: THREE.BufferGeometry; tuskGeo: THREE.BufferGeometry; ribGeo: THREE.BufferGeometry } | null = null
function getGraveyardGeos() {
  if (graveyardGeoCache) return graveyardGeoCache
  const tuskGeo = new THREE.ConeGeometry(0.1, 1.3, 6)
  tuskGeo.rotateZ(Math.PI / 2)
  const ribGeo = new THREE.CylinderGeometry(0.05, 0.06, 1.0, 5)
  ribGeo.rotateZ(Math.PI / 2)
  graveyardGeoCache = { elephantGeo: buildElephant(), tuskGeo, ribGeo }
  return graveyardGeoCache
}
function createTerrainMaterial(): THREE.MeshStandardNodeMaterial {
  if (terrainMaterialCache) return terrainMaterialCache
  const base = import.meta.env.BASE_URL
  const loader = new THREE.TextureLoader()
  const load = (name: string, srgb: boolean) => {
    const t = loader.load(`${base}geodata/tex/${name}.png`)
    t.wrapS = THREE.RepeatWrapping
    t.wrapT = THREE.RepeatWrapping
    if (srgb) t.colorSpace = THREE.SRGBColorSpace
    return t
  }
  const albedos = [load('sand_a', true), load('grass_a', true), load('rock_a', true), load('forest_a', true)]
  const normalsTex = [load('sand_n', false), load('grass_n', false), load('rock_n', false), load('forest_n', false)]

  const mat = new THREE.MeshStandardNodeMaterial()
  mat.metalness = 0
  mat.side = THREE.DoubleSide // skirts + steep slopes
  mat.vertexColors = false

  // Cast: the TSL typings do not carry the attribute's vec4 type through.
  const w = attribute('splat', 'vec4') as unknown as ReturnType<typeof vec4>

  const uvTop = positionWorld.xz.mul(0.5)

  let albedo = texture(albedos[0], uvTop).rgb.mul(w.x)
  albedo = albedo.add(texture(albedos[1], uvTop).rgb.mul(w.y))
  albedo = albedo.add(texture(albedos[2], uvTop).rgb.mul(w.z))
  albedo = albedo.add(texture(albedos[3], uvTop).rgb.mul(w.w))

  // Steep slopes turn rocky; bi-planar side projection avoids stretching.
  const ny = normalWorldGeometry.y
  const slopeW = smoothstep(float(0.86), float(0.62), ny)
  const nx = normalWorldGeometry.x.abs()
  const nz = normalWorldGeometry.z.abs()
  const sideBlend = nx.div(nx.add(nz).add(1e-4))
  const rockZY = texture(albedos[2], positionWorld.zy.mul(0.5)).rgb
  const rockXY = texture(albedos[2], positionWorld.xy.mul(0.5)).rgb
  albedo = mix(albedo, mix(rockXY, rockZY, sideBlend), slopeW)

  // Vertex tint carries biome/region hue; boost recenters the mid-gray
  // detail albedo around 1.0.
  // Ground tint by the GROUND's own position (point 151): the chunk vertices
  // carry seasonUV into the shared field — never the player's tint.
  mat.colorNode = seasonalSnowNode(seasonTintNode(vertexColor().rgb, seasonFieldTintNode()).mul(albedo.mul(2.6)))

  // Blended detail normal map (top projection).
  let nrm = texture(normalsTex[0], uvTop).rgb.mul(w.x)
  nrm = nrm.add(texture(normalsTex[1], uvTop).rgb.mul(w.y))
  nrm = nrm.add(texture(normalsTex[2], uvTop).rgb.mul(w.z.add(slopeW)))
  nrm = nrm.add(texture(normalsTex[3], uvTop).rgb.mul(w.w))
  mat.normalNode = normalMap(vec4(nrm, 1), vec2(0.55, 0.55))

  // Per-material roughness, pulled toward a wet sheen as the rain soaks the
  // ground (design.md §19.13, point 225 — shared GROUND_WET_U uniform).
  mat.roughnessNode = wetGroundRoughness(w.dot(vec4(0.95, 0.92, 0.85, 0.9)))

  // Large-scale brightness variation keeps distant terrain from tiling.
  const macro = mx_fractal_noise_float(vec3(positionWorld.xz.mul(0.05), 1.0), 3).mul(0.5).add(0.5)
  // Rain darkens the terrain toward damp (point 225), applied last over the tint,
  // splat albedo and macro variation so the whole ground reads wet together.
  mat.colorNode = wetGroundColor(mat.colorNode.mul(macro.mul(0.3).add(0.85)))
  terrainMaterialCache = mat
  return mat
}

// The chunk-geometry cache is MODULE state (point 96): under the travel
// scene's dispose={null} a per-mount cache would leak every visited chunk's
// GPU buffers on each place visit; the module cache instead REUSES them on
// re-entry (no rebuild either). Seed-keyed — a new run disposes and restarts.
const chunkGeometryCache = new Map<string, THREE.BufferGeometry>()
let chunkCacheSeed: number | null = null
// Latest BUILT geometry key per chunk `cx,cz` (any resolution): while a merely
// re-keyed chunk (its LOD or a neighbour's stitch resolution changed) waits in
// the build queue, its previous geometry keeps drawing as a stand-in — a stale
// LOD for a few frames is invisible, a hole is not
// (docs/perf-driving-hitches.md).
const chunkLatestKey = new Map<string, string>()

// Per-frame terrain build budget (ms): the queue drains until the budget is
// spent, at least one chunk per frame so it always progresses. A refined
// 112-seg chunk can overshoot on its own — its build is atomic; splitting it
// into a Web Worker is the documented follow-up (docs/perf-driving-hitches.md).
const TERRAIN_BUILD_BUDGET_MS = 5
// Prefetch lookahead (wu): once the drive heading puts a point this far ahead
// into the next chunk, that window's builds start early, so the crossing
// usually finds its chunks already built.
const PREFETCH_LOOKAHEAD = CHUNK_SIZE / 2

function TerrainChunks() {
  const seed = useGame((s) => s.seed)
  const cache = useRef(chunkGeometryCache)
  const [active, setActive] = useState<string[]>([])
  const activeSig = useRef('')
  const lastCenter = useRef<string | null>(null)
  const material = useMemo(() => createTerrainMaterial(), [])
  // Budgeted build queue (docs/perf-driving-hitches.md): the boundary crossing
  // used to build every changed chunk of the window synchronously in one frame
  // (~40-60 geometries, the tallest driving hitch). It now enqueues the missing
  // builds and the loop below drains a few per frame; stand-ins cover re-keyed
  // chunks meanwhile (chunkLatestKey above).
  const queueRef = useRef<ChunkJob[]>([])
  const desiredRef = useRef<ChunkJob[]>([])
  const prefetchRef = useRef<{ center: string; keys: Set<string>; queue: ChunkJob[] } | null>(null)
  const prevPos = useRef<{ x: number; z: number } | null>(null)

  // Reset the cache when a new run (seed) starts — NOT on remount.
  useEffect(() => {
    if (chunkCacheSeed === seed) return
    chunkCacheSeed = seed
    cache.current.forEach((g) => g.dispose())
    cache.current.clear()
    chunkLatestKey.clear()
    lastCenter.current = null
    queueRef.current = []
    desiredRef.current = []
    prefetchRef.current = null
    activeSig.current = ''
    setActive([])
  }, [seed])

  useFrame(() => {
    const t0 = performance.now()
    const pos = useGame.getState().pos
    const cx = Math.floor(pos.x / CHUNK_SIZE)
    const cz = Math.floor(pos.z / CHUNK_SIZE)
    const center = chunkKey(cx, cz)
    let worked = false

    // Plan the window around a centre: segment count per offset, memoized so
    // the seam stitch can read a chunk's four neighbours (some just outside
    // the render window) cheaply. Near-ring quality doubling (terrainLod.ts):
    // coast-crossing chunks (point 209 — the smooth vector shoreline must not
    // re-quantize to mesh steps) and mountainous chunks (the smooth bicubic
    // relief must not fold into polyline facets) share one capped doubling
    // behind the persistent per-chunk probe memo.
    const planWindow = (ccx: number, ccz: number): ChunkJob[] => {
      const segsCache = new Map<string, number>()
      const segsAt = (dx: number, dz: number): number => {
        const k = `${dx},${dz}`
        const hit = segsCache.get(k)
        if (hit !== undefined) return hit
        const ring = Math.max(Math.abs(dx), Math.abs(dz))
        const refine = ring <= REFINE_RING_MAX && chunkNeedsRefine(ccx + dx, ccz + dz)
        const s = refinedSegments(ring, refine)
        segsCache.set(k, s)
        return s
      }
      return planChunkWindow(ccx, ccz, CHUNK_RADIUS, segsAt)
    }
    const hasStandIn = (chunk: string): boolean => {
      const k = chunkLatestKey.get(chunk)
      return k !== undefined && cache.current.has(k)
    }
    const buildJob = (job: ChunkJob): void => {
      if (cache.current.has(job.key)) return
      cache.current.set(job.key, buildChunkGeometry(job.cx, job.cz, seed, job.segments, job.edgeSegs))
      chunkLatestKey.set(job.chunk, job.key)
    }

    if (center !== lastCenter.current) {
      const prevCenter = lastCenter.current
      lastCenter.current = center
      const jobs = planWindow(cx, cz)
      desiredRef.current = jobs
      prefetchRef.current = null // superseded by the real crossing
      const missing = jobs.filter((j) => !cache.current.has(j.key))
      // A one-chunk step is the DRIVING case: spread the builds over the
      // coming frames (stand-ins cover meanwhile, and the prefetch has usually
      // built ahead already). Any larger jump — teleport, scene entry, first
      // frame — builds synchronously as before: no stand-ins exist there, and
      // a progressive fill would show holes.
      const [pcx, pcz] = prevCenter === null ? [NaN, NaN] : prevCenter.split(',').map(Number)
      const adjacent = prevCenter !== null && Math.max(Math.abs(cx - pcx), Math.abs(cz - pcz)) === 1
      if (adjacent) {
        queueRef.current = orderChunkJobs(missing, hasStandIn)
      } else {
        for (const job of missing) buildJob(job)
        queueRef.current = []
      }
      worked = true
    } else if (queueRef.current.length === 0 && prevPos.current !== null) {
      // Idle between crossings: prefetch the predicted next window along the
      // drive heading so the crossing finds its chunks already built.
      const predicted = predictedNextCenter(pos, prevPos.current, CHUNK_SIZE, PREFETCH_LOOKAHEAD)
      if (predicted !== null) {
        const pKey = chunkKey(predicted.cx, predicted.cz)
        if (prefetchRef.current?.center !== pKey) {
          const jobs = planWindow(predicted.cx, predicted.cz)
          prefetchRef.current = {
            center: pKey,
            keys: new Set(jobs.map((j) => j.key)),
            queue: orderChunkJobs(jobs.filter((j) => !cache.current.has(j.key)), hasStandIn),
          }
        }
      }
    }
    prevPos.current = { x: pos.x, z: pos.z }

    // Drain under the frame budget: the current window first (it fills real
    // gaps), then the prefetch queue.
    const q = queueRef.current.length > 0 ? queueRef.current : prefetchRef.current?.queue
    if (q !== undefined && q.length > 0) {
      drainChunkQueue(q, TERRAIN_BUILD_BUDGET_MS, () => performance.now(), buildJob)
      worked = true
    }

    if (worked) {
      // Resolve the drawn set: the desired key where built, else the chunk's
      // latest older geometry (a stale LOD beats a hole; a never-built chunk
      // waits at the queue front — it has hole priority).
      const resolved: string[] = []
      for (const job of desiredRef.current) {
        if (cache.current.has(job.key)) {
          resolved.push(job.key)
        } else {
          const fallback = chunkLatestKey.get(job.chunk)
          if (fallback !== undefined && cache.current.has(fallback)) resolved.push(fallback)
        }
      }
      const sig = resolved.join('|')
      if (sig !== activeSig.current) {
        activeSig.current = sig
        // Bound the cache: drop geometries neither drawn nor about to be
        // needed (desired still queued, or prefetched for the next window).
        if (cache.current.size > 700) {
          const keep = new Set(resolved)
          for (const job of desiredRef.current) keep.add(job.key)
          if (prefetchRef.current !== null) for (const k of prefetchRef.current.keys) keep.add(k)
          for (const [key, geo] of cache.current) {
            if (!keep.has(key)) {
              geo.dispose()
              cache.current.delete(key)
            }
          }
          for (const [chunk, key] of chunkLatestKey) {
            if (!cache.current.has(key)) chunkLatestKey.delete(chunk)
          }
        }
        setActive(resolved)
      }
      if (import.meta.env.DEV) recordBurst(PERF.terrain, performance.now() - t0)
    }
  })

  return (
    <>
      {active.map((key) => {
        const geo = cache.current.get(key)
        if (!geo) return null
        return <mesh key={key} geometry={geo} material={material} receiveShadow dispose={null} />
      })}
    </>
  )
}

/** Animated water surface at sea level, following the player. */
function WaterPlane() {
  const ref = useRef<THREE.Mesh>(null)
  const { material, offset, calm, planeScale } = useMemo(() => (waterHandleCache ??= createWaterMaterial()), [])
  useFrame(() => {
    const pos = useGame.getState().pos
    const zoom = useUi.getState().travelZoom
    if (ref.current) {
      ref.current.position.set(pos.x, 0, pos.z)
      // In the debug zoom range the plane grows with the view so the sea
      // reaches the horizon at the whole-continent zoom; the wave field calms
      // to glass out there — crests, foam and glints alias into speckle noise
      // at that distance (design.md §21).
      const s = Math.max(1, zoom / 2)
      ref.current.scale.setScalar(s)
      // The shader reconstructs world XZ as local * scale + offset; feed it
      // the same scale, or the bathymetry drifts against the land while the
      // player walks in the zoomed view.
      planeScale.value = s
      calm.value = Math.min(1, Math.max(0, (zoom - 1) / 0.6))
      offset.value.set(pos.x, -pos.z) // plane local Y maps to world -Z
    }
  })
  // Dev hook for the headless verification (CLAUDE.md §7.2): the shader's
  // scale uniform must track the mesh scale.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__water = {
      planeScale: () => planeScale.value,
      meshScale: () => ref.current?.scale.x ?? 0,
    }
    return () => {
      delete w.__water
    }
  }, [planeScale])
  return (
    // Geometry and material are module singletons; the whole element opts out
    // of auto-dispose (point 96).
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} geometry={WATER_PLANE_GEOMETRY} material={material} dispose={null} />
  )
}

/**
 * Whole-continent far terrain for the debug zoom range (design.md §21): a
 * single coarse vertex-colored sheet over Africa's bounding box, built lazily
 * the first time the view zooms past the default distance and shown only
 * there. It sits slightly below the detailed chunks, which keep drawing on
 * top around the traveller; at that camera height the coarse relief and the
 * biome colors read as a map of the whole continent.
 */
const FAR_TERRAIN = { x0: -220, x1: 560, z0: -400, z1: 390, step: 2.5 }

function buildFarTerrainGeometry(seed: number): THREE.BufferGeometry {
  const nx = Math.round((FAR_TERRAIN.x1 - FAR_TERRAIN.x0) / FAR_TERRAIN.step) + 1
  const nz = Math.round((FAR_TERRAIN.z1 - FAR_TERRAIN.z0) / FAR_TERRAIN.step) + 1
  const positions = new Float32Array(nx * nz * 3)
  const colors = new Float32Array(nx * nz * 3)
  for (let iz = 0; iz < nz; iz++) {
    for (let ix = 0; ix < nx; ix++) {
      const vi = iz * nx + ix
      const x = FAR_TERRAIN.x0 + ix * FAR_TERRAIN.step
      const z = FAR_TERRAIN.z0 + iz * FAR_TERRAIN.step
      const { lat, lon } = worldToLatLon(x, z)
      const s = sampleTerrain(lat, lon, seed)
      positions[vi * 3] = x
      // Land is clamped to clear the sea-level water plane even after the
      // sheet's -0.4 sink — with margin, or the grazing view angle tears the
      // coast into depth-precision stripes; water cells keep their carved
      // height (inland rivers stay visible, the sea sinks under the plane).
      positions[vi * 3 + 1] =
        s.type === 'ocean' || s.type === 'water' ? s.height : Math.max(s.height, 1.2)
      positions[vi * 3 + 2] = z
      // Bake the chunks' mean ground-texture response into the vertex color
      // (farColor.ts), so the sheet does not read as a pale frame around the
      // detailed chunk rectangle in the mid-zoom range.
      const c = farTerrainColor(s.color, s.splat)
      colors[vi * 3] = c[0]
      colors[vi * 3 + 1] = c[1]
      colors[vi * 3 + 2] = c[2]
    }
  }
  const indices: number[] = []
  for (let iz = 0; iz < nz - 1; iz++) {
    for (let ix = 0; ix < nx - 1; ix++) {
      const a = iz * nx + ix
      const b = a + 1
      const c = a + nx
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

function FarTerrain() {
  const seed = useGame((s) => s.seed)
  const zoom = useUi((s) => s.travelZoom)
  const [geo, setGeo] = useState<THREE.BufferGeometry | null>(null)
  const material = FAR_TERRAIN_MATERIAL

  // Reset on a new game (the biome warp is seeded).
  useEffect(() => {
    setGeo(null)
  }, [seed])
  useEffect(() => {
    if (zoom <= 1 || geo) return
    // Build once, lazily: only the debug zoom range ever shows the sheet.
    setGeo(buildFarTerrainGeometry(seed))
  }, [zoom, geo, seed])
  useEffect(() => {
    return () => {
      geo?.dispose()
    }
  }, [geo])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__farTerrain = {
      built: () => geo !== null,
      vertices: () => (geo ? (geo.getAttribute('position')?.count ?? 0) : 0),
      visible: () => geo !== null && useUi.getState().travelZoom > 1,
    }
    return () => {
      delete w.__farTerrain
    }
  }, [geo])

  if (!geo || zoom <= 1) return null
  // Sunk a little below the detailed chunks so they stay on top around the
  // traveller without z-fighting; at continent distance the offset (and the
  // slightly fattened coastline it causes) is imperceptible.
  return <mesh geometry={geo} material={material} position={[0, -0.4, 0]} frustumCulled={false} dispose={null} />
}

/**
 * Sun light tracking the player, with cascaded shadow maps (design.md §2):
 * high resolution near the camera, softer/coarser further out.
 */
// The sun light, its target and the CSM shadow node are MODULE singletons
// (point 96): a fresh CSMShadowNode per mount sits in every material's lights
// graph, changes every pipeline cache key and forces the renderer to re-link
// the whole travel program set on the first draw after leavePlace().
const TRAVEL_HEMI_LIGHT = new THREE.HemisphereLight('#bdd7e8', '#8a7a55', 0.85)

// CSMShadowNode.setup() creates fresh reference nodes on every lights-graph
// rebuild, which renames its cascade uniform buffer in the GENERATED code of
// every shadow-receiving material — so a travel remount produced ~80 byte-new
// shader sources and the renderer re-linked them all synchronously (the point
// 96 freeze). Memoizing the setup keeps the node graph — and therefore the
// generated source — stable, and the code-keyed program cache hits instead.
class StableCSMShadowNode extends CSMShadowNode {
  private stableSetup: ReturnType<CSMShadowNode['setup']> = null
  setup(builder: Parameters<CSMShadowNode['setup']>[0]): ReturnType<CSMShadowNode['setup']> {
    this.stableSetup ??= super.setup(builder)
    return this.stableSetup
  }
}

const SUN_BASE_INTENSITY = 2.4
let sunSingleton: { light: THREE.DirectionalLight; target: THREE.Object3D } | null = null
function getSun() {
  if (sunSingleton) return sunSingleton
  const light = new THREE.DirectionalLight('#fff1da', SUN_BASE_INTENSITY)
  light.castShadow = true
  light.shadow.mapSize.set(2048, 2048)
  light.shadow.camera.near = 10
  light.shadow.camera.far = 400
  light.shadow.bias = -0.0004
  const target = new THREE.Object3D()
  light.target = target
  const csm = new StableCSMShadowNode(light, { cascades: 3, maxFar: 240, mode: 'practical' })
  csm.fade = true
  ;(light.shadow as unknown as { shadowNode: unknown }).shadowNode = csm
  sunSingleton = { light, target }
  return sunSingleton
}

function Sun() {
  const { light, target } = getSun()
  // The touch quality preset (point 84) halves the shadow-map resolution.
  const shadowMapHalf = useUi((s) => s.shadowMapHalf)
  const shadowSize = shadowMapHalf ? 1024 : 2048

  // A mapSize change only takes effect once the existing shadow render target
  // is freed, so three rebuilds it at the new resolution.
  useEffect(() => {
    if (light.shadow.mapSize.x === shadowSize) return
    light.shadow.mapSize.set(shadowSize, shadowSize)
    const map = light.shadow.map
    if (map) {
      map.dispose()
      light.shadow.map = null as unknown as typeof map
    }
  }, [light, shadowSize])

  useFrame(() => {
    const pos = useGame.getState().pos
    light.position.set(pos.x + SUN_DIR[0] * 130, SUN_DIR[1] * 130, pos.z + SUN_DIR[2] * 130)
    target.position.set(pos.x, 0, pos.z)
    // Overcast dims the sun with the season (design.md §19, point 120c). The
    // wetness is Climate's per-frame scratch — one derivation for the whole
    // scene, not a second one here.
    light.intensity = SUN_BASE_INTENSITY * sunDimFactor(CURRENT_WEATHER.wetness, balance.season.weatherStrength)
      // The harmattan pall conceals the sun (Dobson 1781) — a modest extra dim.
      * (1 - CURRENT_WEATHER.dust * 0.25 * Math.min(1, Math.max(0, balance.season.weatherStrength)))
      // Lightning flash (point 166): a bright additive burst over the dimmed storm
      // light — brief (Climate decays it in <300 ms) so it reads as a bolt.
      + SUN_BASE_INTENSITY * CURRENT_WEATHER.flash * 2
  })
  return (
    <>
      <primitive object={target} dispose={null} />
      <primitive object={light} dispose={null} />
    </>
  )
}

// --- Instanced biome vegetation ---------------------------------------------

type Species =
  | 'acacia'
  | 'jungle'
  | 'palm'
  | 'bush'
  | 'rock'
  | 'baobab'
  | 'termite'
  | 'deadtree'
  | 'papyrus'
  | 'kopje'
const SPECIES: Species[] = [
  'acacia', 'jungle', 'palm', 'bush', 'rock',
  'baobab', 'termite', 'deadtree', 'papyrus', 'kopje',
]
const MAX_INSTANCES: Record<Species, number> = {
  acacia: 1600,
  jungle: 2600,
  palm: 700,
  bush: 1800,
  rock: 900,
  baobab: 260,
  termite: 620,
  deadtree: 380,
  papyrus: 1100,
  kopje: 300,
}
const CANDIDATES_PER_CHUNK = 22
// The dry-season deformation is baked into the INSTANCE MATRICES (point 175), not
// a per-instance vertex-shader attribute (which raced on WebGPU). CROWN species
// split into a trunk mesh (plain matrix) + a crown mesh whose matrix carries the
// bare-branch collapse; GROUND species (foliage class 2) fold the sprout scale
// into their single plant matrix; the rest never deform.
const CROWN_SPECIES: ReadonlySet<Species> = new Set<Species>(['acacia', 'jungle', 'palm', 'baobab'])
const GROUND_SPECIES: ReadonlySet<Species> = new Set<Species>(['bush', 'papyrus'])

/**
 * Species choice per terrain type; roll decides density. Region/period
 * flavor (design.md §19): baobabs, termite mounds and kopjes in the
 * savanna, dead trees at the desert edge, papyrus along rivers and lakes.
 */
function pickSpecies(type: TerrainType, roll: number, nearWater: boolean): Species | null {
  // Reed belts follow the water regardless of the biome (Nile, lakes).
  if (nearWater && type !== 'ocean' && roll < 0.55) return 'papyrus'
  switch (type) {
    case 'jungle':
      return roll < 0.8 ? 'jungle' : roll < 0.9 ? 'bush' : null
    case 'savanna':
      if (roll < 0.3) return 'acacia'
      if (roll < 0.62) return 'bush'
      if (roll < 0.68) return 'rock'
      if (roll < 0.71) return 'baobab'
      if (roll < 0.79) return 'termite'
      if (roll < 0.82) return 'kopje'
      if (roll < 0.85) return 'deadtree'
      return null
    case 'desert':
      return roll < 0.07 ? 'rock' : roll < 0.13 ? 'bush' : roll < 0.16 ? 'deadtree' : null
    case 'mountain':
      return roll < 0.34 ? 'rock' : roll < 0.42 ? 'bush' : roll < 0.46 ? 'kopje' : null
    case 'coast':
      return roll < 0.3 ? 'palm' : null
    default:
      return null
  }
}

// Large, solid dressing the traveller collides with (design.md §19): trees and
// boulder piles, by their horizontal footprint radius (before per-instance
// scale). Bushes, reeds, termite mounds and loose rocks stay passable.
const COLLIDABLE_FLORA: Partial<Record<Species, number>> = {
  acacia: 0.4,
  jungle: 0.5,
  palm: 0.32,
  baobab: 0.7,
  kopje: 1.0,
}

interface PlacedFlora {
  species: Species
  x: number
  z: number
  height: number
  /** Per-instance hash for rotation AND scale — the collider radius derives
   *  from the same value, so its circle matches the drawn footprint. */
  r4: number
  /** Per-instance roll for the render's non-uniform y-scale. */
  roll: number
}

/**
 * The single flora placement decision (design.md §2.6, point 129): given a
 * chunk candidate, returns the instance the RENDERER draws there, or null.
 * Both the Vegetation renderer and `collidableFloraNear` call this, so a plant
 * that is not drawn (suppressed near water by `solidDressingAllowed`, above the
 * snow line, or beside a settlement) can never leave a phantom collider —
 * the invisible-wall bug of point 129, where the collision used different
 * placement logic than the render. The instance-cap overflow is the only
 * render-only concern the collider skips.
 */
// Exported for the placement-cache equality test (floraPlacementCache.test.ts);
// not a component.
// eslint-disable-next-line react/only-export-components
export function placedFloraAt(ccx: number, ccz: number, i: number, seed: number): PlacedFlora | null {
  const rx = hashChunk(ccx, ccz, i * 4, seed)
  const rz = hashChunk(ccx, ccz, i * 4 + 1, seed)
  const roll = hashChunk(ccx, ccz, i * 4 + 2, seed)
  const x = (ccx + rx) * CHUNK_SIZE
  const z = (ccz + rz) * CHUNK_SIZE
  const ll = worldToLatLon(x, z)
  const s = sampleTerrain(ll.lat, ll.lon, seed)
  if (s.height <= 0.05) return null
  // The river-distance query cap MUST exceed the reed belt's outer edge
  // (RIVER_WIDTH_DEG + 0.045) and the solid-dressing clearance
  // (RIVER_WIDTH_DEG + 0.06). The point-136 river widening pushed
  // RIVER_WIDTH_DEG to ~0.27, so the old cap of 0.3 landed INSIDE both bands:
  // far-from-river points read as "in the reed belt" (papyrus everywhere) and
  // "too close to a channel" (all trees suppressed) — the render went
  // reed-only and the collider (with its own, uncapped logic) kept phantom
  // tree circles: the point-129 invisible walls. 0.45 is the module's own
  // internal cap and clears both bands with headroom.
  const rd = riverDistance(ll.lat, ll.lon, 0.45)
  const lsd = lakeDistance(ll.lat, ll.lon, 0.1)
  const nearWater = s.height > 0.05 && inReedBelt(rd, lsd)
  const species = pickSpecies(s.type, roll, nearWater)
  if (!species) return null
  // The renderer's exact suppression rules, kept in lockstep (point 129):
  if (species !== 'papyrus' && !solidDressingAllowed(s.type, rd, lsd)) return null
  if (species === 'rock' && s.type === 'mountain' && s.height > 6.5) return null // snow line
  for (const p of PLACES) {
    const w = latLonToWorld(p.lat, p.lon)
    if (Math.hypot(x - w.x, z - w.z) < 4) return null
  }
  const r4 = hashChunk(ccx, ccz, i * 4 + 3, seed)
  return { species, x, z, height: s.height, r4, roll }
}

// Per-chunk placement cache (docs/perf-driving-hitches.md): the placement
// decision is deterministic per (chunk, candidate, seed) and calendar-
// independent (the season tint is read separately at bake time), so the
// every-16-wu rescan of ~841 chunks only computes the chunks it has never
// decided — the rest are lookups. The render fill AND the collider read the
// SAME cached arrays, which keeps the point-129 render/collider lockstep by
// construction: one decision, one storage. Seed-keyed like the terrain chunk
// cache; bounded by evicting chunks far outside the current scan square.
const floraChunkCache = new Map<string, ReadonlyArray<PlacedFlora>>()
let floraChunkCacheSeed: number | null = null
let floraPlacementComputeCount = 0
const FLORA_CHUNK_CACHE_MAX = 4096

/** Every placed plant of one chunk, in candidate order (the fill's insertion
 *  order — the buffer-cap drop order must not change), cached per chunk. */
// Exported for the placement-cache tests (floraPlacementCache.test.ts).
// eslint-disable-next-line react/only-export-components
export function placedFloraChunk(ccx: number, ccz: number, seed: number): ReadonlyArray<PlacedFlora> {
  if (floraChunkCacheSeed !== seed) {
    floraChunkCacheSeed = seed
    floraChunkCache.clear()
  }
  const key = `${ccx},${ccz}`
  const hit = floraChunkCache.get(key)
  if (hit) return hit
  floraPlacementComputeCount += 1
  const placed: PlacedFlora[] = []
  for (let i = 0; i < CANDIDATES_PER_CHUNK; i++) {
    const p = placedFloraAt(ccx, ccz, i, seed)
    if (p) placed.push(p)
  }
  floraChunkCache.set(key, placed)
  return placed
}

/** How many chunk placement scans have actually computed (cache misses) — the
 *  test/probe witness that a rescan recomputes only the genuinely new chunks. */
// eslint-disable-next-line react/only-export-components
export function floraPlacementComputes(): number {
  return floraPlacementComputeCount
}

function evictFloraChunkCache(cx: number, cz: number, range: number): void {
  if (floraChunkCache.size <= FLORA_CHUNK_CACHE_MAX) return
  for (const key of floraChunkCache.keys()) {
    const comma = key.indexOf(',')
    const dx = Number(key.slice(0, comma)) - cx
    const dz = Number(key.slice(comma + 1)) - cz
    if (Math.max(Math.abs(dx), Math.abs(dz)) > range + 2) floraChunkCache.delete(key)
  }
}

/**
 * Collidable dressing near a point as circles `[x, z, radius]` — derived from
 * the SAME placement the renderer draws (`placedFloraChunk`, one shared cache
 * over `placedFloraAt`), so a suppressed or unrendered plant never leaves a
 * phantom collider, and restricted to the player's chunk neighbourhood and the
 * LARGE collidable species only (small or sparse dressing never blocks — "no
 * getting stuck on a blade of grass", user decision, point 129).
 */
function collidableFloraNear(px: number, pz: number, seed: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  const pcx = Math.floor(px / CHUNK_SIZE)
  const pcz = Math.floor(pz / CHUNK_SIZE)
  const QUERY = 3 // only dressing this close can block the traveller
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      for (const placed of placedFloraChunk(pcx + dx, pcz + dz, seed)) {
        const baseR = COLLIDABLE_FLORA[placed.species]
        if (baseR === undefined) continue
        if (Math.abs(placed.x - px) > QUERY + 1.2 || Math.abs(placed.z - pz) > QUERY + 1.2) continue
        out.push([placed.x, placed.z, baseR * (0.75 + placed.r4 * 0.55)])
      }
    }
  }
  return out
}

// The vegetation InstancedMeshes are MODULE singletons (point 96): a fresh
// InstancedMesh per mount creates a fresh internal instance-matrix buffer
// node whose generated uniform name differs, so every remount produced
// byte-new shader sources for the whole dressing set and re-linked them
// synchronously after leavePlace().
// The base mesh per species (trunk/props for crown species, the whole plant
// otherwise) plus a crown mesh for the CROWN_SPECIES whose instance matrix bears
// the dry-season collapse (point 175).
interface VegetationMeshes {
  base: Record<Species, THREE.InstancedMesh>
  crown: Partial<Record<Species, THREE.InstancedMesh>>
}
let vegetationMeshCache: VegetationMeshes | null = null
function getVegetationMeshes(): VegetationMeshes {
  if (vegetationMeshCache) return vegetationMeshCache
  const geometries: Record<Species, THREE.BufferGeometry> = {
    acacia: buildAcacia(),
    jungle: buildJungleTree(),
    palm: buildPalm(false),
    bush: buildBush(),
    rock: buildRock(),
    baobab: buildBaobab(),
    termite: buildTermiteMound(),
    deadtree: buildDeadTree(),
    papyrus: buildPapyrus(),
    kopje: buildKopje(),
  }
  // Season tint (design.md §19.13, point 120d): only the FOLIAGE follows the
  // season — a greenness mask keeps rocks, trunks and termite mounds out of
  // it. §19.9's colors sit between the seasons: the rains deepen the green,
  // the dry season bleaches it toward straw.
  const material = new THREE.MeshStandardNodeMaterial()
  material.roughness = 0.92
  material.vertexColors = true
  // Season COLOUR by the PLANT's own position (point 151): a per-instance
  // seasonTint the CPU bakes at each rebuild, recoloured per vertex here. The
  // dry-season DEFORMATION is NOT a positionNode any more (point 175): reading
  // that per-instance attribute in the vertex stage raced its rebuild re-upload
  // on the WebGPU backend and jittered the crowns. The collapse now rides the
  // crown mesh's INSTANCE MATRIX (the stable transform path); only the colour,
  // whose per-instance re-upload race is imperceptible, still keys on the attribute.
  // Brightness lift (point 206): the GROUND multiplies its albedo by 2.6 (line
  // ~329) but the flora never got the matching lift, and the crown greens are
  // intrinsically dark (~6-18% luminance) — under the filmic tone mapping the
  // trees read as NEAR-BLACK silhouettes even on their sunlit tops (the first
  // find of the point-203 visual sweep, user-confirmed a bug). The shared
  // FLORA_COLOR_LIFT (1.9, gated with the crown colours in flora.test.ts)
  // keeps the crowns a step darker than the boosted ground so they still read
  // as foliage. The Central reopen's remaining darkness was the JUNGLE crown
  // palette itself (sRGB->linear trap, fixed in buildJungleTree), not this lift.
  material.colorNode = seasonTintNode(vertexColor().rgb, seasonFieldTintAttrNode()).mul(FLORA_COLOR_LIFT)
  const base = {} as Record<Species, THREE.InstancedMesh>
  const crown: Partial<Record<Species, THREE.InstancedMesh>> = {}
  const makeMesh = (geo: THREE.BufferGeometry, cap: number): THREE.InstancedMesh => {
    const mesh = new THREE.InstancedMesh(geo, material, cap)
    // One baked field-tint value per instance, written where the matrices are.
    mesh.geometry.setAttribute('seasonTint', new THREE.InstancedBufferAttribute(new Float32Array(cap), 1))
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.count = 0
    return mesh
  }
  for (const sp of SPECIES) {
    const cap = MAX_INSTANCES[sp]
    if (CROWN_SPECIES.has(sp)) {
      // Trunk stays put; the crown rides its own collapse matrix (point 175).
      const parts = splitFoliage(geometries[sp])
      geometries[sp].dispose()
      base[sp] = makeMesh(parts.base, cap)
      crown[sp] = makeMesh(parts.crown, cap)
    } else {
      base[sp] = makeMesh(geometries[sp], cap)
    }
  }
  vegetationMeshCache = { base, crown }
  return vegetationMeshCache
}

// --- Amortised, double-buffered flora fill (docs/perf-driving-hitches.md) ----
// The every-16-wu rebuild used to run its whole 841-chunk scan and matrix bake
// in one frame. A movement-step rebuild now fills SCRATCH buffers over a few
// frames (floraFillBatchSize bounds them) and swaps the completed result into
// the instance buffers atomically — the previously completed circle keeps
// drawing during the fill, and by floraStreaming's margin bound its edge stays
// beyond the fog-visible ground the whole time (points 164/171 no-pop).

interface FloraScratch {
  base: Float32Array
  crown: Float32Array | null
  tint: Float32Array
}
// Module singletons like the meshes (point 96): allocated once at the caps;
// fills never overlap (one fill at a time, restarted on a new trigger).
let floraScratchCache: Record<Species, FloraScratch> | null = null
function getFloraScratch(): Record<Species, FloraScratch> {
  if (floraScratchCache) return floraScratchCache
  const out = {} as Record<Species, FloraScratch>
  for (const sp of SPECIES) {
    out[sp] = {
      base: new Float32Array(MAX_INSTANCES[sp] * 16),
      crown: CROWN_SPECIES.has(sp) ? new Float32Array(MAX_INSTANCES[sp] * 16) : null,
      tint: new Float32Array(MAX_INSTANCES[sp]),
    }
  }
  floraScratchCache = out
  return out
}

interface FloraFill {
  /** The fill's anchor — the player position at fill START (the hysteresis
   *  anchor too, so movement during the fill counts against the margin). */
  anchorX: number
  anchorZ: number
  spawnR: number
  cx: number
  cz: number
  range: number
  offsets: ReadonlyArray<readonly [number, number]>
  next: number
  batch: number
  counts: Record<Species, number>
  collapseEnabled: boolean
}

const FILL_MTX = new THREE.Matrix4()
const FILL_CROWN_MTX = new THREE.Matrix4()
const FILL_CROWN_LOCAL = new THREE.Matrix4()
const FILL_QUAT = new THREE.Quaternion()
const FILL_UP = new THREE.Vector3(0, 1, 0)
const FILL_SCL = new THREE.Vector3()
const FILL_POS = new THREE.Vector3()

function zeroSpeciesCounts(): Record<Species, number> {
  return {
    acacia: 0, jungle: 0, palm: 0, bush: 0, rock: 0,
    baobab: 0, termite: 0, deadtree: 0, papyrus: 0, kopje: 0,
  }
}

/** Process up to `limit` chunk offsets of the fill into the scratch buffers. */
function stepFloraFill(fill: FloraFill, seed: number, limit: number): void {
  const scratch = getFloraScratch()
  let processed = 0
  while (fill.next < fill.offsets.length && processed < limit) {
    const [dx, dz] = fill.offsets[fill.next]
    fill.next += 1
    processed += 1
    // ONE placement decision shared with collidableFloraNear (point 129):
    // whatever is not placed here also carries no collider.
    for (const placed of placedFloraChunk(fill.cx + dx, fill.cz + dz, seed)) {
      const { species, x, z, height, r4, roll } = placed
      // Circular streaming edge at fog far + margin (points 164/171): a plant
      // beyond it is not drawn, so the edge sits in the fog, out of sight.
      if (!floraInSpawnCircle(x, z, fill.anchorX, fill.anchorZ, fill.spawnR)) continue
      const idx = fill.counts[species]
      if (idx >= MAX_INSTANCES[species]) continue
      // This plant's own dry-season state (points 151/175): its field tint
      // drives both the baked colour and — on the CPU here, never a
      // vertex-shader attribute — the matrix-borne deformation, gated by the
      // debug toggle. dryness 0 leaves the plant at its full shape.
      const ll = worldToLatLon(x, z)
      const tintV = seasonFieldTintAt(ll.lat, ll.lon)
      const dryness = fill.collapseEnabled ? drynessFromTint(tintV) : 0
      FILL_QUAT.setFromAxisAngle(FILL_UP, r4 * Math.PI * 2)
      const sc = 0.75 + r4 * 0.55
      const yf = 0.85 + roll * 0.3
      // Ground flora (bush/papyrus, foliage class 2) sprouts from the soil: its
      // whole matrix scale withdraws toward the base in the dry season.
      const sprout = GROUND_SPECIES.has(species) ? groundSprout(dryness) : 1
      FILL_SCL.set(sc * sprout, sc * yf * sprout, sc * sprout)
      FILL_POS.set(x, height, z)
      FILL_MTX.compose(FILL_POS, FILL_QUAT, FILL_SCL)
      const s = scratch[species]
      FILL_MTX.toArray(s.base, idx * 16)
      s.tint[idx] = tintV
      if (s.crown) {
        // Bare branches (point 144) via the matrix (point 175): the crown
        // shrinks x/z toward the trunk axis and drops in y — Scale(shrink,1,
        // shrink) then a y-drop in the plant's local frame (plant × collapse).
        const { shrink, drop } = crownCollapse(dryness)
        FILL_CROWN_LOCAL.makeScale(shrink, 1, shrink)
        FILL_CROWN_LOCAL.elements[13] = -drop
        FILL_CROWN_MTX.multiplyMatrices(FILL_MTX, FILL_CROWN_LOCAL)
        FILL_CROWN_MTX.toArray(s.crown, idx * 16)
      }
      fill.counts[species] = idx + 1
    }
  }
}

/** Copy the completed scratch fill into the live instance buffers — one atomic
 *  swap, one GPU re-upload, never a partially filled circle on screen. */
function swapFloraFill(fill: FloraFill, meshes: VegetationMeshes): void {
  const scratch = getFloraScratch()
  for (const sp of SPECIES) {
    const nInst = fill.counts[sp]
    const s = scratch[sp]
    const apply = (mesh: THREE.InstancedMesh, source: Float32Array) => {
      ;(mesh.instanceMatrix.array as Float32Array).set(source.subarray(0, nInst * 16))
      mesh.count = nInst
      mesh.instanceMatrix.needsUpdate = true
      const tintAttr = mesh.geometry.getAttribute('seasonTint') as THREE.InstancedBufferAttribute
      ;(tintAttr.array as Float32Array).set(s.tint.subarray(0, nInst))
      tintAttr.needsUpdate = true
    }
    apply(meshes.base[sp], s.base)
    const crownMesh = meshes.crown[sp]
    if (crownMesh && s.crown) apply(crownMesh, s.crown)
  }
  evictFloraChunkCache(fill.cx, fill.cz, fill.range)
}

function Vegetation() {
  const seed = useGame((s) => s.seed)
  const meshes = getVegetationMeshes()
  const lastBuild = useRef<{ x: number; z: number; fogFar: number } | null>(null)
  const hiddenRef = useRef(false)
  // Counts actual streaming rebuilds (point 171): a real rebuild signal for the
  // verify — the drawn COUNT is buffer-saturated and stable at a wide zoom, so
  // it cannot tell whether the flora followed the player.
  const rebuildCountRef = useRef(0)
  // The dry-season deformation is baked into the matrices at each rebuild
  // (point 175), so flipping the debug collapse toggle forces one re-bake.
  const lastCollapseRef = useRef(true)
  // The in-progress amortised fill (docs/perf-driving-hitches.md), if any.
  const fillRef = useRef<FloraFill | null>(null)

  useEffect(() => {
    lastBuild.current = null // force rebuild on new run
    fillRef.current = null
  }, [seed])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__vegetation = {
      visible: () => !hiddenRef.current,
      rebuilds: () => rebuildCountRef.current,
      // The collidable dressing the traveller is actually tested against, so a
      // blocked step can be traced to the circle that blocks it.
      obstaclesNear: (x: number, z: number) => collidableFloraNear(x, z, useGame.getState().seed),
      // Every flora instance the RENDERER draws near a point (point 129): the
      // phantom-collider invariant asserts collidableFloraNear is a subset of
      // this, so a suppressed/unrendered plant can never block.
      renderedNear: (x: number, z: number) => {
        const seed = useGame.getState().seed
        const pcx = Math.floor(x / CHUNK_SIZE)
        const pcz = Math.floor(z / CHUNK_SIZE)
        const drawn: Array<{ x: number; z: number; species: Species }> = []
        for (let dz = -1; dz <= 1; dz++)
          for (let dx = -1; dx <= 1; dx++)
            for (const placed of placedFloraChunk(pcx + dx, pcz + dz, seed))
              drawn.push({ x: placed.x, z: placed.z, species: placed.species })
        return drawn
      },
      // The field's tint at the traveller (point 151) — the scene has no
      // global tint any more; checks read the value where the player stands.
      seasonTint: () => {
        const p = useGame.getState().pos
        return seasonFieldTintAt(-p.z / 10, p.x / 10)
      },
      // Fixed-position field reads for the point-151 witness (via the app
      // graph — a dynamic import would get a fresh module whose field is
      // untouched, the HMR trap).
      seasonTintAt: (lat: number, lon: number) => seasonFieldTintAt(lat, lon),
      seasonGreens: () => seasonFieldGreens(),
      // The (x,z) of every instance the mesh is DRAWING for a species right now
      // (point 164): the driven-stability check diffs this across chunk crosses
      // — an in-view plant that disappears and reappears would be the jump.
      drawnTranslations: (species: Species) => {
        const m = meshes.base[species]
        const arr = m.instanceMatrix.array as Float32Array
        const out: Array<[number, number]> = []
        for (let k = 0; k < m.count; k++) out.push([arr[k * 16 + 12], arr[k * 16 + 14]])
        return out
      },
      // The matrix-borne crown collapse (point 175): the x-scale ratio crown/base
      // per drawn instance equals `shrink` (1 - dryness*0.6). min < 1 means the
      // crown is collapsed (dry), ~1 means full (wet). Confirms the collapse is
      // actually applied to the crown mesh — headless can prove the wiring even
      // though the WebGPU jitter it fixes cannot be reproduced. null when the
      // species has no crown mesh or nothing is drawn.
      crownCollapse: (species: Species): { min: number; max: number; count: number } | null => {
        const cm = meshes.crown[species]
        const bm = meshes.base[species]
        if (!cm || cm.count === 0) return null
        const c = cm.instanceMatrix.array as Float32Array
        const b = bm.instanceMatrix.array as Float32Array
        let min = Infinity
        let max = -Infinity
        for (let k = 0; k < cm.count; k++) {
          const cx = Math.hypot(c[k * 16], c[k * 16 + 1], c[k * 16 + 2])
          const bx = Math.hypot(b[k * 16], b[k * 16 + 1], b[k * 16 + 2])
          const r = bx > 0 ? cx / bx : 1
          if (r < min) min = r
          if (r > max) max = r
        }
        return { min, max, count: cm.count }
      },
    }
    return () => {
      delete w.__vegetation
    }
  }, [meshes])

  useFrame(() => {
    // The foliage follows the season (design.md §19.13): neutral at the
    // half-way point, straw when dry, deepened green in the rains. Strength 0
    // pins it to neutral. Blended slowly like the fog, so a forced season
    // fades in rather than snapping.
    //
    // Driven by the RELATIVE greenness, not by CURRENT_WEATHER's absolute
    // wetness. The absolute reading is capped at each zone's own peak, so
    // outside the Congo it never approached 1 and the ground stayed straw all
    // year — the East African plains reached 8% green at the height of their
    // long rains. The Serengeti greens completely on less water than the Congo;
    // vegetation asks "how wet for HERE". See floraGreennessAt.
    {
      const s = useGame.getState()
      // The season field (point 151): every slot's greenness follows the
      // calendar (lerped) and the ground/vegetation sample it per POSITION —
      // the old player-position uniform made the whole scene's flora slide
      // while walking a wetness gradient.
      updateSeasonField(
        s.day, START_YEAR,
        useUi.getState().seasonWetnessOverride,
        Math.min(1, Math.max(0, balance.season.weatherStrength)),
      )
      // The Nile flood (point 138): one CPU source for the ribbon rise and the
      // canoe float height. Blended like the tint, so a debug month jump makes
      // the river rise over a moment rather than snap.
      const floodTarget = nileFloodAt(s.day, START_YEAR) * balance.season.nileFloodRise
      NILE_FLOOD.rise += (floodTarget - NILE_FLOOD.rise) * 0.02
      // Seasonal snow on the two real massifs (point 141): Atlas Nov-Apr,
      // Drakensberg Jun-Aug. Colour-only; permanent ice is baked in terrain.ts.
      const strength = Math.min(1, Math.max(0, balance.season.weatherStrength))
      setSeasonalSnow(
        seasonalSnowAt(s.day, 'atlas', START_YEAR) * strength,
        seasonalSnowAt(s.day, 'drakensberg', START_YEAR) * strength,
      )
    }
    // In the far debug zoom the dressing hides (bounded radius); the
    // far-terrain sheet carries the look out there.
    const zoom = useUi.getState().travelZoom
    const hide = zoom > VEGETATION_HIDE_ZOOM
    if (hide !== hiddenRef.current) {
      hiddenRef.current = hide
      for (const sp of SPECIES) {
        meshes.base[sp].visible = !hide
        const cm = meshes.crown[sp]
        if (cm) cm.visible = !hide
      }
    }
    if (hide) return
    const pos = useGame.getState().pos
    // Flipping the collapse toggle (point 175) re-bakes the matrices next tick.
    const collapseEnabled = useUi.getState().seasonCollapseEnabled
    if (collapseEnabled !== lastCollapseRef.current) {
      lastCollapseRef.current = collapseEnabled
      lastBuild.current = null
    }
    // Streaming with a rebuild hysteresis (points 164 + 171): the drawn edge is
    // a circle sized to the SEASON-FREE fog far (point 175: FLORA_FOG, not the
    // per-frame-lerped TRAVEL_FOG) — the dry-season max visible limit plus a
    // reserve, so it always sits in dense fog beyond anything the player can see.
    // A rebuild fires only once the player has moved the hysteresis step or the
    // ZOOM/region changed the far, NOT on the season's per-frame fog drift — that
    // per-frame rebuild re-uploaded the seasonTint buffer and raced the crown
    // collapse on WebGPU ("jumping trees").
    const fogFar = FLORA_FOG.far
    const t0 = performance.now()
    let worked = false
    if (floraShouldRebuild(pos, lastBuild.current, fogFar)) {
      // Amortised vs synchronous (docs/perf-driving-hitches.md): the plain
      // DRIVING step spreads the refill across a bounded few frames — the
      // completed old circle keeps drawing meanwhile and, by the margin bound
      // in floraStreaming.test.ts, still covers everything the fog shows. A
      // radius change (zoom/region fog), a run's first build, a remount and
      // any long jump swap synchronously as before: there the old circle no
      // longer covers (or does not exist).
      const last = lastBuild.current
      const amortise =
        last !== null &&
        Math.abs(floraSpawnRadius(fogFar) - floraSpawnRadius(last.fogFar)) < 1 &&
        Math.hypot(pos.x - last.x, pos.z - last.z) <= floraAmortiseMaxStep()
      // Anchor at fill START (the hysteresis anchor too): movement during the
      // fill counts against FLORA_SPAWN_MARGIN, not against a stale origin.
      lastBuild.current = { x: pos.x, z: pos.z, fogFar }
      rebuildCountRef.current++
      const rC = floraChunkRange(fogFar, CHUNK_SIZE)
      // Nearest-chunk-first (point 171): when a species' instance buffer
      // fills, the plants dropped are the FARTHEST ones, so the drawn edge
      // stays a fogged circle, not a ragged chunk-order boundary.
      const offsets = chunkOffsetsByDistance(rC)
      const fill: FloraFill = {
        anchorX: pos.x,
        anchorZ: pos.z,
        spawnR: floraSpawnRadius(fogFar),
        cx: Math.floor(pos.x / CHUNK_SIZE),
        cz: Math.floor(pos.z / CHUNK_SIZE),
        range: rC,
        offsets,
        next: 0,
        batch: floraFillBatchSize(offsets.length),
        counts: zeroSpeciesCounts(),
        collapseEnabled,
      }
      fillRef.current = fill
      if (!amortise) {
        stepFloraFill(fill, seed, Infinity)
        swapFloraFill(fill, meshes)
        fillRef.current = null
      }
      worked = true
    }
    // Advance the in-progress fill by one bounded batch per frame; swap the
    // completed result in atomically (double-buffered — the drawn circle
    // never regresses mid-fill).
    const fill = fillRef.current
    if (fill) {
      stepFloraFill(fill, seed, fill.batch)
      if (fill.next >= fill.offsets.length) {
        swapFloraFill(fill, meshes)
        fillRef.current = null
      }
      worked = true
    }
    if (worked && import.meta.env.DEV) recordBurst(PERF.flora, performance.now() - t0)
  })

  return (
    <>
      {SPECIES.map((sp) => (
        <primitive key={sp} object={meshes.base[sp]} dispose={null} />
      ))}
      {SPECIES.filter((sp) => meshes.crown[sp]).map((sp) => (
        <primitive key={`${sp}-crown`} object={meshes.crown[sp]!} dispose={null} />
      ))}
    </>
  )
}

// --- Places, landmarks, player ----------------------------------------------

function PortMarker() {
  return (
    <group>
      {/* Main trading house with a flat roof */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <boxGeometry args={[2.0, 1.4, 1.5]} />
        <meshStandardMaterial color="#e8dcbc" roughness={0.85} />
      </mesh>
      <mesh position={[0, 1.48, 0]} castShadow>
        <boxGeometry args={[2.2, 0.16, 1.7]} />
        <meshStandardMaterial color="#a8875a" roughness={0.9} />
      </mesh>
      {/* Annex */}
      <mesh position={[1.5, 0.5, 0.4]} castShadow>
        <boxGeometry args={[1.1, 1.0, 1.0]} />
        <meshStandardMaterial color="#dccf9f" roughness={0.85} />
      </mesh>
      {/* Watch tower with dome */}
      <mesh position={[-1.35, 1.2, 0.35]} castShadow>
        <cylinderGeometry args={[0.26, 0.32, 2.4, 8]} />
        <meshStandardMaterial color="#e0d3ae" roughness={0.85} />
      </mesh>
      <mesh position={[-1.35, 2.5, 0.35]} castShadow>
        <sphereGeometry args={[0.32, 10, 8]} />
        <meshStandardMaterial color="#b07840" roughness={0.6} metalness={0.2} />
      </mesh>
      {/* Flag */}
      <mesh position={[0.9, 2.1, -0.5]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.4, 5]} />
        <meshStandardMaterial color="#6b5230" />
      </mesh>
      <mesh position={[1.12, 2.6, -0.5]} castShadow>
        <boxGeometry args={[0.42, 0.26, 0.02]} />
        <meshStandardMaterial color="#b03a2e" side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

function VillageMarker() {
  const huts: Array<[number, number, number]> = [
    [0, -0.2, 0.72],
    [-0.95, 0.5, 0.5],
    [0.95, 0.55, 0.52],
  ]
  return (
    <group>
      {huts.map(([hx, hz, r], i) => (
        <group key={i} position={[hx, 0, hz]}>
          <mesh position={[0, r * 0.5, 0]} castShadow>
            <cylinderGeometry args={[r, r * 1.06, r, 9]} />
            <meshStandardMaterial color="#b0803f" roughness={0.95} />
          </mesh>
          <mesh position={[0, r + r * 0.42, 0]} castShadow>
            <coneGeometry args={[r * 1.4, r * 1.05, 9]} />
            <meshStandardMaterial color="#8f7340" roughness={1} />
          </mesh>
        </group>
      ))}
    </group>
  )
}

/**
 * Panorama capture on settlement APPROACH (design.md §2.5, point 81): a few
 * strides before the enter radius, the travel scene renders the 360° horizon
 * band from the settlement's position — proactively, because once placeId is
 * set React switches the scene before another frame runs. The capture is
 * cached per place+seed, so entering finds it ready.
 */
const CAPTURE_APPROACH_RING = 4 // world units beyond the enter radius

function PanoramaCaptureTrigger() {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  useFrame(() => {
    const s = useGame.getState()
    if (s.placeId) return
    const ring = balance.placeEnterRadius + CAPTURE_APPROACH_RING
    for (const p of PLACES) {
      const w = latLonToWorld(p.lat, p.lon)
      if (Math.hypot(w.x - s.pos.x, w.z - s.pos.z) > ring) continue
      if (hasPanoramaCapture(p.id, s.seed)) return
      const h = Math.max(0, sampleTerrain(p.lat, p.lon, s.seed).height)
      // DEV probe (point 90 verification): a loud magenta pillar injected at
      // a known offset for exactly this capture — the place scene then
      // proves the band's compass orientation seed-independently.
      let probe: THREE.Mesh | null = null
      if (import.meta.env.DEV) {
        const off = (window as unknown as Record<string, { dx: number; dz: number } | undefined>).__panoProbeOffset
        if (off) {
          probe = new THREE.Mesh(
            new THREE.BoxGeometry(2, 8, 2),
            new THREE.MeshBasicMaterial({ color: '#ff00ff' }),
          )
          probe.position.set(w.x + off.dx, h + 4, w.z + off.dz)
          ;(scene as unknown as THREE.Scene).add(probe)
        }
      }
      // Low camera: near landmarks (Giza at Cairo) must rise ABOVE the
      // horizon line to survive onto the horizon cylinder.
      capturePanorama(
        gl as unknown as THREE.WebGPURenderer,
        scene as unknown as THREE.Scene,
        { x: w.x, y: h + 1.2, z: w.z },
        p.id,
        s.seed,
        ['traveller-root', `place-marker-${p.id}`, 'travel-sky', 'travel-climate', 'travel-dressing', 'travel-markers'],
      )
      if (probe) {
        ;(scene as unknown as THREE.Scene).remove(probe)
        probe.geometry.dispose()
        ;(probe.material as THREE.Material).dispose()
      }
      return
    }
  })
  return null
}

function PlaceMarker({ place }: { place: PlaceDef }) {
  const t = useStrings()
  const seed = useGame((s) => s.seed)
  // A place's name is revealed only once it has been visited (design.md §17);
  // until then it shows a question mark.
  const discovered = useGame((s) => s.visitedPlaces.includes(place.id))
  // While the traveller stands within this settlement's enter radius, the
  // "Space to enter" hint takes over and the name-label is hidden (design.md §2.3).
  const enterHintShown = useUi((s) => s.enterPlaceId === place.id)
  const p = latLonToWorld(place.lat, place.lon)
  const y = useMemo(() => Math.max(0.2, sampleTerrain(place.lat, place.lon, seed).height), [place, seed])
  return (
    <group position={[p.x, y, p.z]} name={`place-marker-${place.id}`}>
      {place.kind === 'port' ? <PortMarker /> : <VillageMarker />}
      {!enterHintShown && (
        <Html center position={[0, 2.9, 0]} distanceFactor={60}>
          <div className={`map-label${discovered ? '' : ' undiscovered'}`}>{discovered ? t.places[place.id] : '?'}</div>
        </Html>
      )}
    </group>
  )
}

/** Atlas-style labels for the named landmarks (design.md §4.4). */
function LandmarkLabels() {
  const t = useStrings()
  const seed = useGame((s) => s.seed)
  // A landmark's name is revealed only once it has been sighted (design.md §17,
  // the same "seen" set that earns its discovery bounty); until then: "?".
  const seen = useGame((s) => s.landmarksSeen)
  const items = useMemo(() => {
    const lakes = LAKES.map((l) => ({
      key: l.id,
      name: t.landmarks[l.id],
      lat: l.center[1],
      lon: l.center[0],
      y: 0.4,
      water: true,
    }))
    const mountains = MOUNTAINS.map((m) => ({
      key: m.id,
      name: t.landmarks[m.id],
      lat: m.lat,
      lon: m.lon,
      y: Math.max(0.5, sampleTerrain(m.lat, m.lon, seed).height) + 1.2,
      water: false,
    }))
    const falls = WATERFALLS.map((w) => ({
      key: w.id,
      name: t.landmarks[w.id],
      lat: w.lat,
      lon: w.lon,
      y: 1.0,
      water: true,
    }))
    const g = ELEPHANT_GRAVEYARD
    const graveyard = {
      key: g.id,
      name: t.landmarks[g.id],
      lat: g.lat,
      lon: g.lon,
      y: Math.max(0.5, sampleTerrain(g.lat, g.lon, seed).height) + 0.8,
      water: false,
    }
    const cultural = CULTURAL_LANDMARKS.map((c) => ({
      key: c.id,
      name: t.landmarks[c.id],
      lat: c.lat,
      lon: c.lon,
      y: Math.max(0.5, sampleTerrain(c.lat, c.lon, seed).height) + 1.0,
      water: false,
    }))
    // Natural point-landmarks (design.md §4.4): delta and wetland read as
    // water features (water-label styling like the lakes).
    const natural = NATURAL_SITES.map((n) => ({
      key: n.id,
      name: t.landmarks[n.id],
      lat: n.lat,
      lon: n.lon,
      y: Math.max(0.5, sampleTerrain(n.lat, n.lon, seed).height) + 1.0,
      water: n.kind === 'delta' || n.kind === 'wetland',
    }))
    return [...lakes, ...mountains, ...falls, graveyard, ...cultural, ...natural]
  }, [seed, t])
  return (
    <>
      {items.map((it) => {
        const p = latLonToWorld(it.lat, it.lon)
        const discovered = seen.includes(it.key)
        return (
          <Html key={it.key} center position={[p.x, it.y, p.z]} distanceFactor={60}>
            <div className={`map-label landmark${it.water ? ' water-label' : ''}${discovered ? '' : ' undiscovered'}`}>
              {discovered ? it.name : '?'}
            </div>
          </Html>
        )
      })}
    </>
  )
}

/** Free camps (design.md §6): an X of lashed poles marks each pitched camp. */
function CampMarkers() {
  const t = useStrings()
  const camps = useGame((s) => s.freeCamps)
  const seed = useGame((s) => s.seed)
  return (
    <>
      {camps.map((c) => {
        const p = latLonToWorld(c.lat, c.lon)
        const y = Math.max(0.2, sampleTerrain(c.lat, c.lon, seed).height)
        return (
          <group key={c.id} position={[p.x, y + 0.4, p.z]}>
            <mesh rotation={[0, 0, Math.PI / 4]} castShadow>
              <cylinderGeometry args={[0.09, 0.09, 2.0, 6]} />
              <meshStandardMaterial color="#7c5a34" roughness={0.95} />
            </mesh>
            <mesh rotation={[0, 0, -Math.PI / 4]} castShadow>
              <cylinderGeometry args={[0.09, 0.09, 2.0, 6]} />
              <meshStandardMaterial color="#7c5a34" roughness={0.95} />
            </mesh>
            <Html center position={[0, 1.5, 0]} distanceFactor={60}>
              <div className="map-label">{t.labels.camp}</div>
            </Html>
          </group>
        )
      })}
    </>
  )
}

/** Red debug cross with a label, used for the hidden objects (design.md §21). */
function HiddenCross({ lat, lon, label, scale = 1 }: { lat: number; lon: number; label: string; scale?: number }) {
  const seed = useGame((s) => s.seed)
  const p = latLonToWorld(lat, lon)
  const y = Math.max(0.2, sampleTerrain(lat, lon, seed).height)
  return (
    <group position={[p.x, y + 0.5, p.z]} scale={scale}>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[2.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[2.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
      <Html center position={[0, 1.6, 0]} distanceFactor={60}>
        <div className="map-label">{label}</div>
      </Html>
    </group>
  )
}

/**
 * Elephant graveyard (design.md §4.4/§19): the site is recognizable from afar
 * by a field of fallen, bleached elephant carcasses and scattered ivory tusks
 * and bones over a bone-strewn patch of ground. Layout is seeded per run.
 */
function ElephantGraveyard() {
  const seed = useGame((s) => s.seed)
  const layout = useMemo(() => {
    const g = ELEPHANT_GRAVEYARD
    const center = latLonToWorld(g.lat, g.lon)
    const groundY = Math.max(0.2, sampleTerrain(g.lat, g.lon, seed).height)
    const rand = mulberry32((seed ^ 0x51ef4a2d) >>> 0)
    const carcasses = Array.from({ length: 8 }, () => {
      const a = rand() * Math.PI * 2
      const r = 1 + rand() * 4.5
      return {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        yaw: rand() * Math.PI * 2,
        roll: (rand() < 0.5 ? 1 : -1) * (Math.PI / 2 + (rand() - 0.5) * 0.35),
        s: 0.85 + rand() * 0.45,
      }
    })
    const scatter = (n: number) =>
      Array.from({ length: n }, () => {
        const a = rand() * Math.PI * 2
        const r = rand() * 6.5
        return { x: Math.cos(a) * r, z: Math.sin(a) * r, rot: rand() * Math.PI * 2, tilt: (rand() - 0.5) * 0.5, s: 0.6 + rand() * 0.7 }
      })
    return { center, groundY, carcasses, tusks: scatter(22), bones: scatter(16) }
  }, [seed])

  // Seed-independent geometries from the module cache (point 96): a per-mount
  // useMemo would leak a fresh set on every place visit under dispose={null}.
  const { elephantGeo, tuskGeo, ribGeo } = getGraveyardGeos()
  // Bleached carcass/bone material (flat, ignores the elephant's vertex colors).
  const boneMat = BONE_MATERIAL
  const ivoryMat = IVORY_MATERIAL

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__graveyard = {
      carcasses: layout.carcasses.length,
      tusks: layout.tusks.length,
      bones: layout.bones.length,
      x: layout.center.x,
      z: layout.center.z,
    }
    return () => {
      delete w.__graveyard
    }
  }, [layout])

  return (
    <group position={[layout.center.x, layout.groundY, layout.center.z]}>
      {/* Bone-strewn pale ground patch. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} receiveShadow>
        <circleGeometry args={[8, 28]} />
        <meshStandardMaterial color="#b9ad90" roughness={1} />
      </mesh>
      {/* Fallen, bleached elephant carcasses lying on their sides. */}
      {layout.carcasses.map((c, i) => (
        <group key={`c${i}`} position={[c.x, 0, c.z]} rotation={[0, c.yaw, 0]}>
          <group position={[0, 0.8 * c.s, 0]} rotation={[0, 0, c.roll]} scale={c.s}>
            <mesh geometry={elephantGeo} material={boneMat} castShadow dispose={null} />
          </group>
        </group>
      ))}
      {/* Scattered ivory tusks. */}
      {layout.tusks.map((t, i) => (
        <mesh
          key={`t${i}`}
          geometry={tuskGeo}
          material={ivoryMat}
          position={[t.x, 0.12 * t.s, t.z]}
          rotation={[t.tilt, t.rot, 0]}
          scale={t.s}
          castShadow
          dispose={null}
        />
      ))}
      {/* Scattered rib bones. */}
      {layout.bones.map((b, i) => (
        <mesh key={`b${i}`} geometry={ribGeo} material={boneMat} position={[b.x, 0.08 * b.s, b.z]} rotation={[0, b.rot, 0]} scale={b.s} castShadow dispose={null} />
      ))}
    </group>
  )
}

/**
 * Built cultural landmarks (design.md §4.4): the pyramids of Meroë, Great
 * Zimbabwe, the rock-hewn churches of Lalibela, the coastal ruins of Kilwa,
 * the stelae of Aksum, the Gondarine castles and the Bandiagara cliff
 * dwellings, each placed at its real ~1890 position with a per-run yaw
 * jitter. Achievements of African civilisations — the discovery journal
 * (§16) carries that framing.
 */
function CulturalLandmarks() {
  const seed = useGame((s) => s.seed)
  const geos = useMemo(
    () => ({
      pyramids: buildMeroePyramids(),
      'giza-pyramids': buildGizaPyramids(),
      'stone-city': buildStoneCity(),
      'rock-churches': buildRockChurches(),
      'coastal-ruins': buildCoastalRuins(),
      stelae: buildStelae(),
      castles: buildCastles(),
      'cliff-dwellings': buildCliffDwellings(),
    }),
    [],
  )
  const material = LANDMARK_MATERIAL
  const items = useMemo(
    () =>
      CULTURAL_LANDMARKS.map((c, i) => {
        const w = latLonToWorld(c.lat, c.lon)
        const y = Math.max(0.2, sampleTerrain(c.lat, c.lon, seed).height)
        // Seeded per-run, per-site yaw so orientation varies between
        // playthroughs — except Giza: its row diagonal (Khufu NE) and the
        // east-facing Sphinx are real geography the geometry encodes, and the
        // west-bank footprint clearance assumes the unrotated extent.
        const yaw = c.kind === 'giza-pyramids' ? 0 : mulberry32((seed ^ (0x9e3779b1 * (i + 1))) >>> 0)() * Math.PI * 2
        return { id: c.id, kind: c.kind, x: w.x, z: w.z, y, yaw }
      }),
    [seed],
  )

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__culturalLandmarks = { count: items.length, ids: items.map((it) => it.id) }
    return () => {
      delete w.__culturalLandmarks
    }
  }, [items])

  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose())
    },
    [geos, material],
  )

  return (
    <>
      {items.map((it) => (
        <mesh
          key={it.id}
          geometry={geos[it.kind]}
          material={material}
          position={[it.x, it.y, it.z]}
          rotation={[0, it.yaw, 0]}
          castShadow
          receiveShadow
          dispose={null}
        />
      ))}
    </>
  )
}

/**
 * Natural point-landmarks (design.md §4.4): the Ngorongoro crater, the
 * smoking Ol Doinyo Lengai, the Okavango delta and the Sudd — mirroring
 * CulturalLandmarks exactly (shared vertex-color material, per-run yaw,
 * disposal, DEV hook).
 */
function NaturalSites() {
  const seed = useGame((s) => s.seed)
  const geos = useMemo(
    () => ({
      crater: buildCrater(),
      volcano: buildVolcano(),
      delta: buildDelta(),
      deltaWater: buildDeltaWater(),
      wetland: buildWetland(),
    }),
    [],
  )
  const material = LANDMARK_MATERIAL
  const items = useMemo(
    () =>
      NATURAL_SITES.map((n, i) => {
        const w = latLonToWorld(n.lat, n.lon)
        const y = Math.max(0.2, sampleTerrain(n.lat, n.lon, seed).height)
        // Seeded per-run, per-site yaw so orientation varies between playthroughs.
        let yaw = mulberry32((seed ^ (0x85ebca6b * (i + 1))) >>> 0)() * Math.PI * 2
        if (n.id === 'sudd') {
          // The marsh reaches TOWARD its river (point 189): the build's +z axis
          // is the riverward tongue, so aim it at the nearest channel sample —
          // a random yaw left the swamp reading as a pond detached from the
          // White Nile (the user report). Probe a small ring for the direction.
          let best = Infinity
          for (let k = 0; k < 16; k++) {
            const ang = (k / 16) * Math.PI * 2
            const pll = worldToLatLon(w.x + Math.sin(ang) * 3, w.z + Math.cos(ang) * 3)
            const rd = riverDistance(pll.lat, pll.lon, 1.2)
            if (rd < best) {
              best = rd
              yaw = ang
            }
          }
        }
        return { id: n.id, kind: n.kind, x: w.x, z: w.z, y, yaw }
      }),
    [seed],
  )

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__naturalSites = {
      count: items.length,
      ids: items.map((it) => it.id),
      // Point 139 — read through the app graph (the HMR fresh-instance trap).
      deltaFlood: () => deltaFlood.current,
      deltaWaterScale: () => deltaWaterRef.current?.scale.x ?? null,
    }
    return () => {
      delete w.__naturalSites
    }
  }, [items])

  useEffect(
    () => () => {
      Object.values(geos).forEach((g) => g.dispose())
    },
    [geos, material],
  )

  // The Okavango inversion (point 139): the delta's water fan swells to its
  // peak in the LOCAL dry season (Jun-Aug) and shrinks when Botswana's own
  // rains fall — the Angolan flood pulse arriving half a year late. Scaled at
  // OBJECT level (whole mesh, affine): safe where per-vertex mask displacement
  // is not (the bare-branches shards, point 144).
  const deltaWaterRef = useRef<THREE.Mesh>(null)
  const deltaFlood = useRef(0)
  useFrame(() => {
    const m = deltaWaterRef.current
    if (!m) return
    const target = okavangoFloodAt(useGame.getState().day, START_YEAR)
    deltaFlood.current += (target - deltaFlood.current) * 0.02
    const sc = 0.7 + deltaFlood.current * 0.55 // 0.7 at low water .. 1.25 at the July peak
    m.scale.set(sc, 1, sc)
  })

  return (
    <>
      {items.map((it) => (
        <group key={it.id} position={[it.x, it.y, it.z]} rotation={[0, it.yaw, 0]}>
          <mesh geometry={geos[it.kind]} material={material} castShadow receiveShadow dispose={null} />
          {it.kind === 'delta' && (
            <mesh
              ref={deltaWaterRef}
              geometry={geos.deltaWater}
              material={material}
              receiveShadow
              dispose={null}
            />
          )}
        </group>
      ))}
    </>
  )
}

/** Debug-only markers for hidden objects: grave and treasure caches (§21). */
function GraveMarker() {
  const t = useStrings()
  const grave = useGame((s) => s.graveLatLon)
  const sites = useGame((s) => s.treasureSites)
  useGame((s) => s.balanceVersion) // re-render when debug toggles change
  if (!balance.showHiddenObjects) return null
  return (
    <>
      <HiddenCross lat={grave.lat} lon={grave.lon} label={t.labels.graveDebug} />
      {sites.filter((s) => !s.dug).map((s, i) => (
        <HiddenCross key={i} lat={s.lat} lon={s.lon} label={t.treasures[s.treasure]} scale={0.7} />
      ))}
    </>
  )
}

/** The expedition leader: khaki outfit, pith helmet, backpack. */
// The explorer sits this much lower when seated in the canoe, so torso and
// head clear the gunwale while the (hidden) legs would fold into the hull.
const CANOE_SEAT_DROP = 0.28
// The hull's lowest point sits below the boat origin by ~0.25 (its draft); this
// constant places that point just above the water surface, so the surface never
// shows up through the open hull and floods the canoe (design.md §7).
const CANOE_HULL_CLEARANCE = 0.29
// How far the swimming figure hangs under the rendered water surface
// (point 152, design.md §11.3) — chest-deep: legs submerged, head clear.
const SWIM_IMMERSION = 0.35

/** The dugout hull + gunwale rim, reused by the ridden and the dragged canoe. */
function CanoeHull() {
  return (
    <>
      {/* Hull: an elongated open bowl. */}
      <mesh position={[0, -0.02, 0]} scale={[0.72, 0.46, 2.15]} castShadow receiveShadow>
        <sphereGeometry args={[0.5, 16, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2]} />
        <meshStandardMaterial color="#5a3f28" roughness={0.85} side={THREE.DoubleSide} />
      </mesh>
      {/* Solid floor across the hull interior: reads as the canoe's bottom and
          keeps the ground (on land) or the water plane (on rivers) from showing
          up through the open hull. */}
      <mesh position={[0, -0.08, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[0.68, 2.0, 1]} receiveShadow>
        <circleGeometry args={[0.5, 24]} />
        <meshStandardMaterial color="#4a3420" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      {/* Gunwale rim — the boat's outline reads clearly from the bird's eye. */}
      <mesh position={[0, 0.05, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[0.74, 2.18, 1]} castShadow>
        <torusGeometry args={[0.5, 0.045, 8, 24]} />
        <meshStandardMaterial color="#7a5836" roughness={0.8} />
      </mesh>
    </>
  )
}

/** A canoe paddle: a shaft with a flat blade, reused by the ridden and the
 *  stowed (dragged) canoe. */
function CanoePaddle() {
  return (
    <>
      <mesh castShadow>
        <cylinderGeometry args={[0.028, 0.028, 0.7, 6]} />
        <meshStandardMaterial color="#8a6a3e" roughness={0.9} />
      </mesh>
      <mesh position={[0, -0.44, 0]} castShadow>
        <boxGeometry args={[0.12, 0.3, 0.02]} />
        <meshStandardMaterial color="#8a6a3e" roughness={0.9} />
      </mesh>
    </>
  )
}

function Player() {
  const ref = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const boat = useRef<THREE.Group>(null)
  const carry = useRef<THREE.Group>(null)
  const legs = useRef<THREE.Group>(null)
  const paddle = useRef<THREE.Group>(null)
  const woundLight = useRef<THREE.Group>(null)
  const woundSevere = useRef<THREE.Group>(null)
  const heading = useRef(0)
  const last = useRef<{ x: number; z: number } | null>(null)
  const walkTime = useRef(0)
  const bobTime = useRef(0)
  const wasCanoeing = useRef<boolean | null>(null)
  const wasCarrying = useRef<boolean | null>(null)
  const wasWounds = useRef<number | null>(null)
  const trailRef = useRef<TrailPoint | null>(null)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    return () => {
      delete (window as unknown as Record<string, unknown>).__player
    }
  }, [])

  useFrame((_, dt) => {
    const s = useGame.getState()
    if (!ref.current) return
    const ll = worldToLatLon(s.pos.x, s.pos.z)
    const t = sampleTerrain(ll.lat, ll.lon, s.seed)
    ref.current.position.set(s.pos.x, Math.max(0, t.height), s.pos.z)

    // With a canoe in the pack (possession-based, like the HUD canoe glow):
    // on water the explorer rides it, on land he drags it along behind him
    // (design.md §7/§11).
    const hasCanoe = (s.equipment.canoe ?? 0) > 0
    const onWater = t.type === 'water' || t.type === 'ocean'
    const canoeing = hasCanoe && onWater
    const carrying = hasCanoe && !onWater
    bobTime.current += dt

    // Face the movement direction; bob gently while walking.
    const prev = last.current
    let moving = false
    if (prev) {
      const dx = s.pos.x - prev.x
      const dz = s.pos.z - prev.z
      moving = Math.hypot(dx, dz) > 0.001
      if (moving) {
        const target = Math.atan2(dx, dz)
        let diff = target - heading.current
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        heading.current += diff * Math.min(1, dt * 10)
        walkTime.current += dt
      }
    }

    // Float the canoe on the rendered water surface (waterSurface.ts): the
    // river ribbon is flat across its width at the AXIS bed height and the
    // lake sheet at the lake-wide bedMax, so the float height comes from that
    // same construction — the local bed under the hull can lie far lower
    // where the relief slopes across the channel, and floating on it sank
    // the hull under the ribbon (design.md §7/§11.3). The sea plane sits at
    // ~0 and covers everything else; river proximity (not terrain type)
    // detects the ribbon, so a mouth cell misclassified as ocean keeps the
    // lift.
    const refY = Math.max(0, t.height)
    // Query the surface whenever the traveller is ON water — riding or
    // swimming (point 152): the swimmer floats on the SAME rendered surface
    // the canoe rides. Lake Edward made the old terrain-height walk plain:
    // its sheet spans the lake-wide bedMax high above the carved rift bed,
    // so the figure walked the bottom, readable through the water.
    const surfaceY = onWater ? (waterSurfaceY(ll.lat, ll.lon, s.seed, t.height) ?? 0) : 0
    const boatBaseY = surfaceY - refY + CANOE_HULL_CLEARANCE
    // Chest-deep: the figure hangs this far under the surface while swimming.
    const swimBaseY = surfaceY - refY - SWIM_IMMERSION

    if (inner.current) {
      inner.current.rotation.y = heading.current
      if (canoeing) {
        // Sit into the hull, lifted to the water surface; a slow rock replaces the bob.
        inner.current.position.y = boatBaseY - CANOE_SEAT_DROP + Math.sin(bobTime.current * 1.7) * 0.03
      } else if (onWater) {
        // Swimming (design.md §11.3): on the surface, a slow swim bob —
        // never the walk bounce, and never the bed underneath.
        inner.current.position.y = swimBaseY + Math.sin(bobTime.current * 2.1) * 0.05
      } else {
        inner.current.position.y = moving ? Math.abs(Math.sin(walkTime.current * 9)) * 0.08 : 0
      }
    }
    if (boat.current) {
      boat.current.rotation.y = heading.current
      boat.current.position.y = boatBaseY + Math.sin(bobTime.current * 1.7) * 0.03
    }
    // A gentle, one-sided paddle stroke while riding.
    if (paddle.current) paddle.current.rotation.x = 0.35 + Math.sin(bobTime.current * 3.2) * 0.4

    // Dragged canoe (design.md §7/§11): a trailer behind the walked path,
    // swung clear of stones, trees, animals and settlement edges, lying on
    // the terrain (pitch to the tail's ground, roll on cross-slopes).
    if (carrying && carry.current) {
      const obstacles = collidableFloraNear(s.pos.x, s.pos.z, s.seed)
      for (const a of collidableAnimalsNear(s.pos.x, s.pos.z, CANOE_TRAIL_FAR + 2)) obstacles.push(a)
      for (const p of PLACES) {
        const w = latLonToWorld(p.lat, p.lon)
        if (Math.hypot(w.x - s.pos.x, w.z - s.pos.z) < CANOE_TRAIL_FAR + 4) obstacles.push([w.x, w.z, 1.6])
      }
      // The rendered water sheet is a hard bound for the dragged hull: the
      // trailer swings to land rather than piercing a river/lake surface or
      // the sea at a bank (user-reported clipping).
      const isWater = (x: number, z: number) => {
        const g = worldToLatLon(x, z)
        const t = sampleTerrain(g.lat, g.lon, s.seed)
        return t.type === 'ocean' || waterSurfaceY(g.lat, g.lon, s.seed, t.height) !== null
      }
      const trail = updateTrailPoint(s.pos.x, s.pos.z, trailRef.current, heading.current, obstacles, isWater)
      trailRef.current = trail
      const groundAt = (x: number, z: number) => {
        const g = worldToLatLon(x, z)
        return Math.max(0, sampleTerrain(g.lat, g.lon, s.seed).height)
      }
      const dLen = Math.hypot(trail.x - s.pos.x, trail.z - s.pos.z) || 1
      const pdx = -(trail.z - s.pos.z) / dLen
      const pdz = (trail.x - s.pos.x) / dLen
      const gT = groundAt(trail.x, trail.z)
      const gL = groundAt(trail.x + pdx * 0.7, trail.z + pdz * 0.7)
      const gR = groundAt(trail.x - pdx * 0.7, trail.z - pdz * 0.7)
      const pose = canoeDragPose(s.pos.x, s.pos.z, refY, trail, gT, gL, gR)
      carry.current.rotation.order = 'YXZ'
      carry.current.position.set(pose.centreX, pose.centreY, pose.centreZ)
      carry.current.rotation.set(pose.pitch, pose.yaw, pose.roll)
      if (import.meta.env.DEV) {
        const w = window as unknown as Record<string, Record<string, unknown>>
        if (w.__player) {
          w.__player.drag = {
            x: trail.x,
            z: trail.z,
            ground: gT,
            farY: refY + pose.centreY + (CANOE_DRAG_LEN / 2) * Math.tan(pose.pitch),
            pitch: pose.pitch,
            roll: pose.roll,
          }
        }
      }
    } else if (!carrying) {
      trailRef.current = null
    }

    // Wounds show on the figure, scaling with severity (design.md §6/§16).
    const wounds = s.afflictions.wounds
    if (wasCanoeing.current !== canoeing || wasCarrying.current !== carrying || wasWounds.current !== wounds) {
      wasCanoeing.current = canoeing
      wasCarrying.current = carrying
      wasWounds.current = wounds
      if (boat.current) boat.current.visible = canoeing
      if (carry.current) carry.current.visible = carrying
      if (legs.current) legs.current.visible = !canoeing
      if (woundLight.current) woundLight.current.visible = wounds >= 1
      if (woundSevere.current) woundSevere.current.visible = wounds >= 2
    }
    if (import.meta.env.DEV) {
      // Merged EVERY frame, not inside the change gate above: the gate only
      // fires when canoe/carry/wound state FLIPS, so a check that jumped the
      // player (e.g. onto Lake Edward, point 152) read a stale snapshot from
      // wherever the last flip happened. Object.assign, not replacement —
      // the drag block earlier in this frame writes __player.drag and a
      // fresh object every frame would drop it.
      const w = window as unknown as { __player?: Record<string, unknown> }
      w.__player = Object.assign(w.__player ?? {}, {
        canoeing,
        carrying,
        wounds,
        // Point 152: the swim float, checkable — the figure's local lift
        // and the surface/ground samples it derives from.
        swimming: onWater && !canoeing,
        figureLocalY: inner.current?.position.y ?? 0,
        surfaceY,
        refY,
      })
    }
    last.current = { x: s.pos.x, z: s.pos.z }
  })

  return (
    <group ref={ref} name="traveller-root">
      {/* Ridden dugout, shown only while travelling water (toggled in useFrame). */}
      <group ref={boat} visible={false}>
        <CanoeHull />
        {/* Paddle held to the right, dipping with the stroke. */}
        <group ref={paddle} position={[0.34, 0.16, 0.05]}>
          <mesh position={[0, 0, 0.34]} rotation={[0.32, 0, 0]} castShadow>
            <cylinderGeometry args={[0.028, 0.028, 0.7, 6]} />
            <meshStandardMaterial color="#8a6a3e" roughness={0.9} />
          </mesh>
          <mesh position={[0, -0.16, 0.62]} rotation={[0.32, 0, 0]} castShadow>
            <boxGeometry args={[0.12, 0.02, 0.3]} />
            <meshStandardMaterial color="#8a6a3e" roughness={0.9} />
          </mesh>
        </group>
      </group>
      {/* Dragged canoe on land: a trailer following the walked path around
          obstacles, lying on the terrain behind the figure (posed per frame
          from canoeDrag.ts — child of the root, not of the yawing figure). */}
      <group ref={carry} visible={false}>
        <CanoeHull />
        {/* Paddle stowed lengthwise inside the hull. */}
        <group position={[0.09, 0.0, 0.1]} rotation={[Math.PI / 2, 0, 0.05]}>
          <CanoePaddle />
        </group>
      </group>
      <group ref={inner}>
        {/* Legs (hidden inside the hull while canoeing). */}
        <group ref={legs}>
          <mesh position={[-0.11, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.09, 0.44, 6]} />
            <meshStandardMaterial color="#6e5a3a" roughness={0.9} />
          </mesh>
          <mesh position={[0.11, 0.22, 0]} castShadow>
            <cylinderGeometry args={[0.08, 0.09, 0.44, 6]} />
            <meshStandardMaterial color="#6e5a3a" roughness={0.9} />
          </mesh>
        </group>
        {/* Torso (khaki jacket) */}
        <mesh position={[0, 0.66, 0]} castShadow>
          <boxGeometry args={[0.44, 0.52, 0.28]} />
          <meshStandardMaterial color="#c4ac72" roughness={0.9} />
        </mesh>
        {/* Belt */}
        <mesh position={[0, 0.45, 0]} castShadow>
          <boxGeometry args={[0.46, 0.07, 0.3]} />
          <meshStandardMaterial color="#4e3a20" roughness={0.8} />
        </mesh>
        {/* Arms */}
        <mesh position={[-0.28, 0.68, 0]} rotation={[0, 0, 0.15]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.46, 6]} />
          <meshStandardMaterial color="#c4ac72" roughness={0.9} />
        </mesh>
        <mesh position={[0.28, 0.68, 0]} rotation={[0, 0, -0.15]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.46, 6]} />
          <meshStandardMaterial color="#c4ac72" roughness={0.9} />
        </mesh>
        {/* Head */}
        <mesh position={[0, 1.06, 0]} castShadow>
          <sphereGeometry args={[0.17, 12, 10]} />
          <meshStandardMaterial color="#e8c39a" roughness={0.8} />
        </mesh>
        {/* Pith helmet: crown + brim */}
        <mesh position={[0, 1.19, 0]} castShadow>
          <sphereGeometry args={[0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#ddd0a8" roughness={0.85} />
        </mesh>
        <mesh position={[0, 1.17, 0]} castShadow>
          <cylinderGeometry args={[0.29, 0.29, 0.035, 14]} />
          <meshStandardMaterial color="#d0c298" roughness={0.85} />
        </mesh>
        {/* Backpack — on the BACK (local -z; +z is the heading, see TRAVELLER_PACK). */}
        <mesh position={[...TRAVELLER_PACK.offset]} castShadow>
          <boxGeometry args={[...TRAVELLER_PACK.size]} />
          <meshStandardMaterial color="#7c5a34" roughness={0.95} />
        </mesh>
        {/* Wounds show on the figure (design.md §6), toggled in useFrame. From
            the steep bird's-eye the crown and shoulders are what read, so the
            marks sit there. Light: a bandage strap over the helmet with a blood
            spot. Severe: the strap runs red and blood soaks both shoulders. */}
        <group ref={woundLight} visible={false}>
          {/* Bandage strap over the crown of the helmet (visible from above). */}
          <mesh position={[0, 1.26, 0]} castShadow>
            <boxGeometry args={[0.13, 0.05, 0.46]} />
            <meshStandardMaterial color="#ece6d6" roughness={1} />
          </mesh>
          {/* Blood soaking through the strap. */}
          <mesh position={[0, 1.30, 0.1]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.06, 12]} />
            <meshStandardMaterial color="#a01c1c" roughness={0.8} side={THREE.DoubleSide} />
          </mesh>
        </group>
        <group ref={woundSevere} visible={false}>
          {/* The head strap runs red when the wound is severe. */}
          <mesh position={[0, 1.27, 0]}>
            <boxGeometry args={[0.14, 0.055, 0.48]} />
            <meshStandardMaterial color="#8a1717" roughness={0.85} />
          </mesh>
          {/* Blood soaking both shoulders (top-facing, reads from above). */}
          <mesh position={[-0.2, 0.9, 0.02]}>
            <sphereGeometry args={[0.13, 12, 8]} />
            <meshStandardMaterial color="#8a1717" roughness={0.85} />
          </mesh>
          <mesh position={[0.2, 0.9, 0.02]}>
            <sphereGeometry args={[0.11, 12, 8]} />
            <meshStandardMaterial color="#7a1414" roughness={0.85} />
          </mesh>
        </group>
      </group>
    </group>
  )
}

export function TravelScene() {
  const camera = useThree((s) => s.camera)
  const setPrompt = useUi((s) => s.setPrompt)

  // Snap the camera to the follow pose on mount (no visible flight from the
  // previous first-person pose). On unmount the near plane returns to the
  // first-person default — the debug zoom range widens it (depth precision),
  // and the shared camera must never carry that into another scene.
  useEffect(() => {
    const pos = useGame.getState().pos
    const zoom = useUi.getState().travelZoom
    camera.position.set(pos.x, CAMERA_OFFSET.y * zoom, pos.z + CAMERA_OFFSET.z * zoom)
    camera.lookAt(pos.x, 0, pos.z)
    return () => {
      camera.near = 0.1
      camera.updateProjectionMatrix()
    }
  }, [camera])

  // Install the shared frame-visibility test (point 165): the wildlife
  // guarantee-seeders read it to place animals OUTSIDE the rendered frame so
  // nothing pops into view. Projects a ground point via the LIVE camera to NDC
  // (the real frustum, not an assumed 100×zoom radius — the point-172 lesson),
  // with an edge margin so a borderline placement that camera jitter would flip
  // into view counts as on-screen too. Production, not a dev hook.
  useEffect(() => {
    const v = new THREE.Vector3()
    const MARGIN = 0.18 // NDC edge band also treated as on-screen
    setFrameVisibilityTest((x, z) => {
      v.set(x, 0, z).project(camera)
      return v.z < 1 && Math.abs(v.x) <= 1 + MARGIN && Math.abs(v.y) <= 1 + MARGIN
    })
    return () => setFrameVisibilityTest(null)
  }, [camera])

  // Dev hook (point 171): the REAL ground radius the camera covers, by casting
  // the frustum corners/edges to the y=0 plane and taking the farthest hit from
  // the player. This is the measured view radius the flora streaming must clear
  // — not the assumed 100×zoom that let point 164's check pass while plants
  // still popped in sight.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    const ray = new THREE.Raycaster()
    const CORNERS: Array<[number, number]> = [
      [-1, -1], [1, -1], [-1, 1], [1, 1], [0, 1], [0, -1], [-1, 0], [1, 0],
    ]
    const proj = new THREE.Vector3()
    w.__camera = {
      groundViewRadius: () => {
        const p = useGame.getState().pos
        let maxD = 0
        for (const [nx, ny] of CORNERS) {
          ray.setFromCamera(new THREE.Vector2(nx, ny), camera)
          const dy = ray.ray.direction.y
          if (dy >= -1e-6) continue // ray points at or above the horizon
          const t = -ray.ray.origin.y / dy
          if (t <= 0 || !isFinite(t)) continue
          const gx = ray.ray.origin.x + ray.ray.direction.x * t
          const gz = ray.ray.origin.z + ray.ray.direction.z * t
          maxD = Math.max(maxD, Math.hypot(gx - p.x, gz - p.z))
        }
        return maxD
      },
      // Project a ground point (x, y, z) to NDC — the PICTURE-truthful test of
      // what the player sees (point 171): a plant is on screen iff both NDC
      // components are within [-1, 1] and it is in front of the camera (z<1).
      // The real visible extent is the frustum, not the fog far (which clearView
      // pushes to the horizon at a wide zoom), so a pop must be judged on screen,
      // never against a computed radius.
      ndc: (x: number, z: number, y = 0) => {
        proj.set(x, y, z).project(camera)
        return { x: proj.x, y: proj.y, z: proj.z }
      },
      onScreen: (x: number, z: number, y = 0) => {
        proj.set(x, y, z).project(camera)
        return proj.z < 1 && Math.abs(proj.x) <= 1 && Math.abs(proj.y) <= 1
      },
      // True once the bird's-eye camera has caught up to its lerp target (point
      // 177/165): the camera eases toward (pos.x, .y*zoom, pos.z + .z*zoom) at a
      // fixed 0.12/frame — NOT dt-scaled — so its settle is frame-count-bound. A
      // teleport-then-fixed-sleep verification revealed just-seeded off-screen
      // animals purely by the still-moving camera under load; polling this before
      // scanning removes that reveal-by-camera-motion false pop.
      settled: () => {
        const p = useGame.getState().pos
        const zoom = useUi.getState().travelZoom
        return (
          Math.abs(camera.position.x - p.x) < 0.5 &&
          Math.abs(camera.position.z - (p.z + CAMERA_OFFSET.z * zoom)) < 0.5
        )
      },
    }
    return () => {
      delete w.__camera
    }
  }, [camera])

  // Mouse-wheel zoom (design.md §21): always available; zooming out beyond
  // the default distance requires the debug unlock (clamped in setTravelZoom).
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const ui = useUi.getState()
      if (ui.dialog) return
      ui.setTravelZoom(ui.travelZoom * Math.exp(e.deltaY * 0.0009))
    }
    window.addEventListener('wheel', onWheel, { passive: true })
    // Dev-only readiness flag for the headless verification (CLAUDE.md §7.2):
    // the wheel zoom only responds while this travel scene is mounted.
    if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__travelWheelReady = true
    return () => {
      window.removeEventListener('wheel', onWheel)
      if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__travelWheelReady = false
    }
  }, [])

  // DEV attribution probe (docs/perf-driving-hitches.md): the per-burst cost
  // of the terrain/flora streaming work plus a frame-delta ring, for the
  // driven verification and manual profiling of the driving hitches.
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__perf = {
      terrain: PERF.terrain,
      flora: PERF.flora,
      frames: () => PERF.frames.slice(),
      maxFrameMs: (sinceT?: number) => maxFrameMs(sinceT ?? 0),
      now: () => performance.now(),
      reset: resetPerf,
    }
    return () => {
      delete w.__perf
    }
  }, [])

  // Digging is done by clicking the shovel item (design.md §17); the G key
  // remains as a convenience/gamepad binding for digging on the spot.
  useEffect(() => {
    const offG = onKeyPress('KeyG', () => {
      if (!useUi.getState().dialog) useGame.getState().dig()
    })
    return () => {
      offG()
      setPrompt(null)
    }
  }, [setPrompt])

  // Space enters the settlement the traveller stands within (design.md §2.3):
  // movement-based approach, confirmed with the use key — never automatic on
  // reaching the enter radius. The candidate + water guard are computed each
  // frame into ui.enterPlaceId; entering a finished/defeated run is blocked so
  // a dead traveller never overwrites the checkpoint.
  useEffect(() => {
    const off = onKeyPress('Space', () => {
      const ui = useUi.getState()
      const g = useGame.getState()
      const id = ui.enterPlaceId
      const blocked = !!ui.dialog || !!g.defeat || g.victory
      if (id !== null && shouldEnterSettlement(id, true, blocked)) g.enterPlace(id)
    })
    return () => {
      off()
      useUi.getState().setEnterPlaceId(null)
    }
  }, [])

  useFrame((_, rawDt) => {
    if (import.meta.env.DEV) recordFrame(performance.now(), rawDt * 1000)
    const dt = Math.min(rawDt, 0.1)
    const s = useGame.getState()

    // Movement: screen up = north (-z). The open journal (even while it is
    // being read aloud) no longer freezes travel (design.md §16); only a modal
    // dialog blocks movement.
    if (!useUi.getState().dialog) {
      const beforeX = s.pos.x // position before this frame's move (s is the pre-move snapshot)
      const beforeZ = s.pos.z
      const a = moveAxes()
      if (a.x !== 0 || a.y !== 0) s.moveTravel(a.x, -a.y, dt)
      // The river current sweeps the traveller downstream even while idle
      // (design.md §11); moving with it is faster, against it slower.
      s.driftCurrent(dt)

      // Collision with trees and animals (design.md §19): the traveller cannot
      // walk through the large dressing or the wildlife. The swept resolve
      // clamps the move at an obstacle it enters (no tunnelling at speed) and
      // slides along it, so movement never passes through.
      const p = useGame.getState().pos
      const PLAYER_R = 0.5
      const obstacles = collidableFloraNear(p.x, p.z, s.seed)
      const animals = collidableAnimalsNear(p.x, p.z, PLAYER_R + 1.5)
      for (const o of animals) obstacles.push(o)
      if (obstacles.length > 0) {
        const [nx, nz] = resolveTravelMove(beforeX, beforeZ, p.x, p.z, obstacles, PLAYER_R)
        if (nx !== p.x || nz !== p.z) useGame.setState({ pos: { x: nx, z: nz } })
      }
    }

    // Touch pinch drives the bird's-eye zoom through the same clamp/debug gate
    // as the wheel (design.md §17.5/§21.4, point 84); the look-drag is drained
    // and ignored here (there is no yaw in the bird's-eye view).
    if (!useUi.getState().dialog) {
      const pinch = consumeTouchPinch()
      if (pinch !== 1) {
        const ui = useUi.getState()
        ui.setTravelZoom(ui.travelZoom * pinch)
      }
    }
    consumeTouchLook()

    // Camera follows from above with a slight tilt; the zoom factor scales
    // the offset while the wheel zoom is unlocked (debug menu).
    const pos = useGame.getState().pos
    const zoom = useUi.getState().travelZoom
    camera.position.lerp(new THREE.Vector3(pos.x, CAMERA_OFFSET.y * zoom, pos.z + CAMERA_OFFSET.z * zoom), 0.12)
    camera.lookAt(pos.x, 0, pos.z)
    // In the debug zoom range nothing is closer than the zoomed-out camera
    // offset, so the near plane can move out — with near 0.1 the depth buffer
    // resolves only ~1 unit at continental distances and the far sheet's
    // coasts would tear into stripes against the sea plane (design.md §21).
    const nearPlane = zoom > 1 ? 4 : 0.1
    if (camera.near !== nearPlane) {
      camera.near = nearPlane
      camera.updateProjectionMatrix()
    }

    // Settlement entry (design.md §2.3): reaching the enter radius no longer
    // enters on its own — the "Space to enter <name>" hint shows and a Space
    // press (handled above) confirms. A river/lake passage never offers entry:
    // a riverside village reaches near the channel, so a canoe drift must not
    // pull the traveller in (water guard kept from the auto-enter era).
    const ll = worldToLatLon(pos.x, pos.z)
    const onWater = sampleTerrain(ll.lat, ll.lon, s.seed).type === 'water'
    const enterId = settlementEnterCandidate(
      pos.x,
      pos.z,
      PLACE_WORLD_POSITIONS,
      balance.placeEnterRadius,
      onWater,
    )
    if (useUi.getState().enterPlaceId !== enterId) useUi.getState().setEnterPlaceId(enterId)

    const strings = getStrings()
    const nearCamp = s.freeCamps.some(
      (c) => !c.looted && Math.hypot(c.lat - ll.lat, c.lon - ll.lon) <= balance.camps.campRadiusDeg,
    )
    // The enter hint takes precedence over the camp prompt when both are in range.
    const prompt = enterId
      ? strings.prompts.enterPlace(strings.places[enterId])
      : nearCamp
        ? strings.prompts.openCamp
        : null
    if (useUi.getState().prompt !== prompt) setPrompt(prompt)
  })

  return (
    // Disposal is SURGICAL here (point 96): every element that references a
    // module-cached singleton (terrain/water/river materials, the CSM sun,
    // the instanced dressing/wildlife pools, cached geometries) carries its
    // own dispose={null}, so unmounting the travel scene never drops their
    // shader programs from the renderer cache — releasing them made every
    // later leave re-link the whole travel program set synchronously
    // (~7-10 s main-thread freeze, CDP-profiled: getProgramParameter
    // self-time). A blanket dispose={null} on this root is deliberately NOT
    // used: it also spared the ~270 per-mount JSX geometries (player figure,
    // markers, camps, waterfalls …) and leaked them on every place visit.
    // See the leave-transition gate in scripts/verify/polish.mjs.
    <group>
      {/* Named so the panorama capture can hide sky and weather: the band
          keeps alpha-0 sky, and the place scene's own dome shows through. */}
      <group name="travel-sky">
        <SkyDome preset={TRAVEL_SKY} sunDirection={SUN_DIR} />
      </group>
      <group name="travel-climate">
        <Climate />
      </group>
      <primitive object={TRAVEL_HEMI_LIGHT} dispose={null} />
      <Sun />
      <TerrainChunks />
      <FarTerrain />
      <RiversAndLakes />
      <RegionBorders />
      <WaterPlane />
      {/* Named for the panorama capture: the symbolic travel-scale dressing
          (trees the size of hills, animals, markers) would read absurd on
          the person-scale horizon — the capture keeps terrain, water,
          mountains and the built landmarks. */}
      <group name="travel-dressing">
        <Vegetation />
        <Wildlife />
      </group>
      {PLACES.map((p) => (
        <PlaceMarker key={p.id} place={p} />
      ))}
      <PanoramaCaptureTrigger />
      <LandmarkLabels />
      <ElephantGraveyard />
      <CulturalLandmarks />
      <NaturalSites />
      <group name="travel-markers">
        <CampMarkers />
        <GraveMarker />
      </group>
      <Player />
    </group>
  )
}
