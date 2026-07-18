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
import { sampleTerrain, type TerrainType } from '../../world/terrain'
import { lakeDistance, riverDistance } from '../../world/geoIndex'
import { LAKES } from '../../world/data/lakes'
import { CULTURAL_LANDMARKS, ELEPHANT_GRAVEYARD, MOUNTAINS, NATURAL_SITES, WATERFALLS } from '../../world/data/landmarks'
import { consumeTouchLook, consumeTouchPinch, moveAxes, onKeyPress } from '../../systems/input'
import { resolveTravelMove } from '../../systems/movement'
import { CURRENT_WEATHER, nileFloodAt, okavangoFloodAt, seasonalSnowAt, sunDimFactor } from '../../systems/season'
import { seasonFoliagePosition, seasonTintNode } from '../../render/seasonTint'
import { seasonalSnowNode, setSeasonalSnow } from '../../render/seasonalSnow'
import { NILE_FLOOD } from './waterSurface'
import { RiversAndLakes } from './Rivers'
import { waterSurfaceY } from './waterSurface'
import { seasonFieldGreens, seasonFieldTintAt, seasonFieldTintNode, seasonFieldUV, updateSeasonField } from '../../render/seasonField'
import { capturePanorama, hasPanoramaCapture } from './panoramaCapture'
import {
  updateTrailPoint,
  canoeDragPose,
  CANOE_TRAIL_FAR,
  CANOE_DRAG_LEN,
  type TrailPoint,
} from './canoeDrag'
import { inReedBelt, solidDressingAllowed } from './waterEdgeRules'
import { chunkOffsetsByDistance, floraChunkRange, floraInSpawnCircle, floraShouldRebuild, floraSpawnRadius } from './floraStreaming'
import { farTerrainColor } from './farColor'
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
import { Climate, TRAVEL_FOG } from './Climate'
import { setFrameVisibilityTest } from './frameVisibility'
import { RegionBorders } from './RegionBorders'
import { Wildlife } from './Wildlife'
import { collidableAnimalsNear } from './wildlifeCollision'
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js'

const CHUNK_SIZE = 24 // world units
const CHUNK_RADIUS = 6 // chunks kept around the player in each direction (terrain LOD)
// Flora streaming rules (point 164) live in floraStreaming.ts so they are
// unit-testable; the render loop below consumes them.
// Beyond this debug-zoom factor the chunk-bound dressing (trees, rocks …)
// hides: it only ever covers a bounded radius, which would read as a dark
// dressed island on the far-terrain sheet (design.md §21.4). Kept at/below
// what FLORA_RANGE_MAX covers so the streaming edge never enters view.
const VEGETATION_HIDE_ZOOM = 2.5
const CAMERA_OFFSET = { y: 42, z: 24 }
const SKIRT_DROP = 1.6 // vertical skirt hiding cracks between LOD levels

/** LOD: mesh resolution per chunk by Chebyshev ring distance. */
function lodSegments(ring: number): number {
  return ring <= 2 ? 56 : ring <= 4 ? 28 : 20
}

/** Sun direction shared by the sky dome disc and the shadow light. */
const SUN_DIR: [number, number, number] = [0.5, 0.62, 0.38]

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

/**
 * Build one terrain chunk with smooth, seam-free normals: heights are sampled
 * with a one-vertex margin ring and normals derived by central differences,
 * so neighboring chunks agree exactly at their shared edges. A dropped skirt
 * around each chunk hides cracks between different LOD levels.
 */
function buildChunkGeometry(cx: number, cz: number, seed: number, segments: number): THREE.BufferGeometry {
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

  const indices: number[] = []
  for (let iz = 0; iz < segments; iz++) {
    for (let ix = 0; ix < segments; ix++) {
      const a = iz * n + ix
      const b = a + 1
      const c = a + n
      const d = c + 1
      indices.push(a, c, b, b, c, d)
    }
  }

  // Skirt: duplicate the border vertices, dropped by SKIRT_DROP. The terrain
  // material renders double-sided, so winding does not matter here.
  const edgeIndex = (e: number, i: number): number => {
    switch (e) {
      case 0: return i // north edge (iz = 0)
      case 1: return (n - 1) * n + i // south edge
      case 2: return i * n // west edge
      default: return i * n + (n - 1) // east edge
    }
  }
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
      indices.push(a, b, base + i, b, base + i + 1, base + i)
    }
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3))
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.setAttribute('splat', new THREE.BufferAttribute(splats, 4))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setAttribute('seasonUV', new THREE.BufferAttribute(seasonUVs, 2))
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

  // Per-material roughness.
  mat.roughnessNode = w.dot(vec4(0.95, 0.92, 0.85, 0.9))

  // Large-scale brightness variation keeps distant terrain from tiling.
  const macro = mx_fractal_noise_float(vec3(positionWorld.xz.mul(0.05), 1.0), 3).mul(0.5).add(0.5)
  mat.colorNode = mat.colorNode.mul(macro.mul(0.3).add(0.85))
  terrainMaterialCache = mat
  return mat
}

// The chunk-geometry cache is MODULE state (point 96): under the travel
// scene's dispose={null} a per-mount cache would leak every visited chunk's
// GPU buffers on each place visit; the module cache instead REUSES them on
// re-entry (no rebuild either). Seed-keyed — a new run disposes and restarts.
const chunkGeometryCache = new Map<string, THREE.BufferGeometry>()
let chunkCacheSeed: number | null = null

function TerrainChunks() {
  const seed = useGame((s) => s.seed)
  const cache = useRef(chunkGeometryCache)
  const [active, setActive] = useState<string[]>([])
  const lastCenter = useRef<string | null>(null)
  const material = useMemo(() => createTerrainMaterial(), [])

  // Reset the cache when a new run (seed) starts — NOT on remount.
  useEffect(() => {
    if (chunkCacheSeed === seed) return
    chunkCacheSeed = seed
    cache.current.forEach((g) => g.dispose())
    cache.current.clear()
    lastCenter.current = null
    setActive([])
  }, [seed])

  useFrame(() => {
    const pos = useGame.getState().pos
    const cx = Math.floor(pos.x / CHUNK_SIZE)
    const cz = Math.floor(pos.z / CHUNK_SIZE)
    const center = chunkKey(cx, cz)
    if (center === lastCenter.current) return
    lastCenter.current = center

    const keys: string[] = []
    for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
      for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
        const ring = Math.max(Math.abs(dx), Math.abs(dz))
        const segments = lodSegments(ring)
        const key = `${chunkKey(cx + dx, cz + dz)}:${segments}`
        keys.push(key)
        if (!cache.current.has(key)) {
          cache.current.set(key, buildChunkGeometry(cx + dx, cz + dz, seed, segments))
        }
      }
    }
    // Bound the cache: drop non-active geometries once it grows large.
    if (cache.current.size > 700) {
      const activeSet = new Set(keys)
      for (const [key, geo] of cache.current) {
        if (!activeSet.has(key)) {
          geo.dispose()
          cache.current.delete(key)
        }
      }
    }
    setActive(keys)
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
function placedFloraAt(ccx: number, ccz: number, i: number, seed: number): PlacedFlora | null {
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

/**
 * Collidable dressing near a point as circles `[x, z, radius]` — derived from
 * the SAME placement the renderer draws (`placedFloraAt`), so a suppressed or
 * unrendered plant never leaves a phantom collider, and restricted to the
 * player's chunk neighbourhood and the LARGE collidable species only (small or
 * sparse dressing never blocks — "no getting stuck on a blade of grass",
 * user decision, point 129).
 */
function collidableFloraNear(px: number, pz: number, seed: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  const pcx = Math.floor(px / CHUNK_SIZE)
  const pcz = Math.floor(pz / CHUNK_SIZE)
  const QUERY = 3 // only dressing this close can block the traveller
  for (let dz = -1; dz <= 1; dz++) {
    for (let dx = -1; dx <= 1; dx++) {
      const ccx = pcx + dx
      const ccz = pcz + dz
      for (let i = 0; i < CANDIDATES_PER_CHUNK; i++) {
        const placed = placedFloraAt(ccx, ccz, i, seed)
        if (!placed) continue
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
let vegetationMeshCache: Record<Species, THREE.InstancedMesh> | null = null
function getVegetationMeshes(): Record<Species, THREE.InstancedMesh> {
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
  // Season by the PLANT's own position (point 151): tint and collapse sample
  // the greenness field through the per-instance seasonUV — the old global
  // uniform followed the player and made every crown in view slide while
  // walking a wetness gradient.
  material.colorNode = seasonTintNode(vertexColor().rgb, seasonFieldTintNode())
  // Bare branches (point 144, second attempt): keyed on the baked per-part
  // foliage attribute, never the jittered colour — see seasonFoliagePosition.
  material.positionNode = seasonFoliagePosition(seasonFieldTintNode())
  const out = {} as Record<Species, THREE.InstancedMesh>
  for (const sp of SPECIES) {
    const mesh = new THREE.InstancedMesh(geometries[sp], material, MAX_INSTANCES[sp])
    // One field coordinate per instance, written where the matrices are.
    mesh.geometry.setAttribute(
      'seasonUV',
      new THREE.InstancedBufferAttribute(new Float32Array(MAX_INSTANCES[sp] * 2), 2),
    )
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
    mesh.count = 0
    out[sp] = mesh
  }
  vegetationMeshCache = out
  return out
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

  useEffect(() => {
    lastBuild.current = null // force rebuild on new run
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
            for (let i = 0; i < CANDIDATES_PER_CHUNK; i++) {
              const placed = placedFloraAt(pcx + dx, pcz + dz, i, seed)
              if (placed) drawn.push({ x: placed.x, z: placed.z, species: placed.species })
            }
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
        const m = meshes[species]
        const arr = m.instanceMatrix.array as Float32Array
        const out: Array<[number, number]> = []
        for (let k = 0; k < m.count; k++) out.push([arr[k * 16 + 12], arr[k * 16 + 14]])
        return out
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
        meshes[sp].visible = !hide
      }
    }
    if (hide) return
    const pos = useGame.getState().pos
    // Streaming with a rebuild hysteresis (points 164 + 171): the drawn edge is
    // a circle sized to the FOG far — the definitive visible limit — plus a
    // reserve, so it always sits in dense fog beyond anything the player can
    // see. A rebuild fires only once the player has moved the hysteresis step
    // or the fog far changed (a new region), so a back-and-forth across a chunk
    // boundary no longer re-pops.
    const fogFar = TRAVEL_FOG.far
    if (!floraShouldRebuild(pos, lastBuild.current, fogFar)) return
    lastBuild.current = { x: pos.x, z: pos.z, fogFar }
    rebuildCountRef.current++
    const spawnR = floraSpawnRadius(fogFar)
    const cx = Math.floor(pos.x / CHUNK_SIZE)
    const cz = Math.floor(pos.z / CHUNK_SIZE)
    const rC = floraChunkRange(fogFar, CHUNK_SIZE)

    const counts: Record<Species, number> = {
      acacia: 0, jungle: 0, palm: 0, bush: 0, rock: 0,
      baobab: 0, termite: 0, deadtree: 0, papyrus: 0, kopje: 0,
    }
    const mtx = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const scl = new THREE.Vector3()

    // Nearest-chunk-first (point 171): when a species' instance buffer fills,
    // the plants dropped are the FARTHEST ones, so the drawn edge stays a fogged
    // circle instead of a ragged, chunk-order boundary that would fray in view.
    for (const [dx, dz] of chunkOffsetsByDistance(rC)) {
      const ccx = cx + dx
      const ccz = cz + dz
      for (let i = 0; i < CANDIDATES_PER_CHUNK; i++) {
        // ONE placement decision shared with collidableFloraNear (point 129):
        // whatever is not drawn here also carries no collider.
        const placed = placedFloraAt(ccx, ccz, i, seed)
        if (!placed) continue
        const { species, x, z, height, r4, roll } = placed
        // Circular streaming edge at fog far + margin (points 164/171): a plant
        // beyond it is not drawn, so the edge sits in the fog, out of sight.
        if (!floraInSpawnCircle(x, z, pos.x, pos.z, spawnR)) continue
        const idx = counts[species]
        if (idx >= MAX_INSTANCES[species]) continue
        quat.setFromAxisAngle(up, r4 * Math.PI * 2)
        const sc = 0.75 + r4 * 0.55
        scl.set(sc, sc * (0.85 + roll * 0.3), sc)
        mtx.compose(new THREE.Vector3(x, height, z), quat, scl)
        meshes[species].setMatrixAt(idx, mtx)
        {
          const attr = meshes[species].geometry.getAttribute('seasonUV') as THREE.InstancedBufferAttribute
          const ll = worldToLatLon(x, z)
          const [su, svv] = seasonFieldUV(ll.lat, ll.lon)
          attr.setXY(idx, su, svv)
        }
        counts[species] = idx + 1
      }
    }

    for (const sp of SPECIES) {
      const mesh = meshes[sp]
      mesh.count = counts[sp]
      mesh.instanceMatrix.needsUpdate = true
      ;(mesh.geometry.getAttribute('seasonUV') as THREE.InstancedBufferAttribute).needsUpdate = true
    }
  })

  return (
    <>
      {SPECIES.map((sp) => (
        <primitive key={sp} object={meshes[sp]} dispose={null} />
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
  const p = latLonToWorld(place.lat, place.lon)
  const y = useMemo(() => Math.max(0.2, sampleTerrain(place.lat, place.lon, seed).height), [place, seed])
  return (
    <group position={[p.x, y, p.z]} name={`place-marker-${place.id}`}>
      {place.kind === 'port' ? <PortMarker /> : <VillageMarker />}
      <Html center position={[0, 2.9, 0]} distanceFactor={60}>
        <div className={`map-label${discovered ? '' : ' undiscovered'}`}>{discovered ? t.places[place.id] : '?'}</div>
      </Html>
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
        const yaw = mulberry32((seed ^ (0x85ebca6b * (i + 1))) >>> 0)() * Math.PI * 2
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
        {/* Backpack */}
        <mesh position={[0, 0.72, 0.2]} castShadow>
          <boxGeometry args={[0.32, 0.38, 0.16]} />
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
  // Id of the place currently walked into; blocks re-entry until the player
  // has left its radius again (design.md §2 walk-in entry).
  const enterLatchRef = useRef<string | null>(null)
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

  useFrame((_, rawDt) => {
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

    // Walking into a place enters it (design.md §2): no key press. The latch
    // guards against re-entering the same frame; the store's re-entry
    // suppression (set on leaving) keeps the just-left settlement closed until
    // the traveller has moved clear of it, so walking straight back in does not
    // immediately re-enter.
    let near: PlaceDef | null = null
    for (const p of PLACES) {
      const w = latLonToWorld(p.lat, p.lon)
      if (Math.hypot(pos.x - w.x, pos.z - w.z) <= balance.placeEnterRadius) {
        near = p
        break
      }
    }
    // Do not auto-enter a settlement while travelling water: a riverside village
    // reaches near the channel, and a canoe passage would otherwise drift the
    // traveller in by accident (design.md §2.3). Stepping onto land enters it.
    if (near) {
      const ell = worldToLatLon(pos.x, pos.z)
      if (sampleTerrain(ell.lat, ell.lon, s.seed).type === 'water') near = null
    }
    if (near && near.id === useGame.getState().reentrySuppressedId) {
      // Suppressed until the traveller clears this settlement — do not enter.
    } else if (near && enterLatchRef.current !== near.id) {
      enterLatchRef.current = near.id
      // Do not walk into a settlement once the expedition is over (defeat/
      // victory) — otherwise a dead traveler would still enter and overwrite
      // the checkpoint.
      if (!useUi.getState().dialog && !s.defeat && !s.victory) {
        useGame.getState().enterPlace(near.id)
        return
      }
    } else if (!near && enterLatchRef.current) {
      enterLatchRef.current = null
    }

    const strings = getStrings()
    const ll = worldToLatLon(pos.x, pos.z)
    const nearCamp = s.freeCamps.some(
      (c) => !c.looted && Math.hypot(c.lat - ll.lat, c.lon - ll.lon) <= balance.camps.campRadiusDeg,
    )
    const prompt = nearCamp ? strings.prompts.openCamp : null
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
