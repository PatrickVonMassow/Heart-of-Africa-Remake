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
import { balance } from '../../config/balance'
import { PLACES, latLonToWorld, worldToLatLon, type PlaceDef } from '../../world/geo'
import { sampleTerrain, type TerrainType } from '../../world/terrain'
import { lakeDistance, riverDistance } from '../../world/geoIndex'
import { LAKES } from '../../world/data/lakes'
import { ELEPHANT_GRAVEYARD, MOUNTAINS, WATERFALLS } from '../../world/data/landmarks'
import { moveAxes, onKeyPress } from '../../systems/input'
import { RiversAndLakes } from './Rivers'
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
import { Climate } from './Climate'
import { RegionBorders } from './RegionBorders'
import { Wildlife } from './Wildlife'
import { CSMShadowNode } from 'three/addons/csm/CSMShadowNode.js'

const CHUNK_SIZE = 24 // world units
const CHUNK_RADIUS = 6 // chunks kept around the player in each direction
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
  geo.setIndex(indices)
  return geo
}

/**
 * Terrain material (design.md §3): biome vertex tint over splatted tileable
 * PBR ground textures (scripts/generate-terrain-textures.mjs), with detail
 * normal maps and bi-planar rock on steep slopes.
 */
function createTerrainMaterial(): THREE.MeshStandardNodeMaterial {
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
  mat.colorNode = vertexColor().mul(albedo.mul(2.6))

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
  return mat
}

function TerrainChunks() {
  const seed = useGame((s) => s.seed)
  const cache = useRef(new Map<string, THREE.BufferGeometry>())
  const [active, setActive] = useState<string[]>([])
  const lastCenter = useRef<string | null>(null)
  const material = useMemo(() => createTerrainMaterial(), [])

  // Reset the cache when a new run (seed) starts.
  useEffect(() => {
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
        return <mesh key={key} geometry={geo} material={material} receiveShadow />
      })}
    </>
  )
}

/** Animated water surface at sea level, following the player. */
function WaterPlane() {
  const ref = useRef<THREE.Mesh>(null)
  const { material, offset } = useMemo(() => createWaterMaterial(), [])
  useFrame(() => {
    const pos = useGame.getState().pos
    if (ref.current) {
      ref.current.position.set(pos.x, 0, pos.z)
      offset.value.set(pos.x, -pos.z) // plane local Y maps to world -Z
    }
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]} material={material}>
      {/* Larger than the fog far distance, so its edge is never visible. */}
      <planeGeometry args={[CHUNK_SIZE * 30, CHUNK_SIZE * 30, 180, 180]} />
    </mesh>
  )
}

/**
 * Sun light tracking the player, with cascaded shadow maps (design.md §2):
 * high resolution near the camera, softer/coarser further out.
 */
function Sun() {
  const lightRef = useRef<THREE.DirectionalLight>(null)
  const targetRef = useRef<THREE.Object3D>(null)

  // Attach the CSM shadow node once the light exists.
  useEffect(() => {
    const light = lightRef.current
    if (!light) return
    const csm = new CSMShadowNode(light, { cascades: 3, maxFar: 240, mode: 'practical' })
    csm.fade = true
    ;(light.shadow as unknown as { shadowNode: unknown }).shadowNode = csm
    return () => {
      ;(light.shadow as unknown as { shadowNode: unknown }).shadowNode = null
    }
  }, [])

  useFrame(() => {
    const pos = useGame.getState().pos
    const l = lightRef.current
    const t = targetRef.current
    if (!l || !t) return
    l.position.set(pos.x + SUN_DIR[0] * 130, SUN_DIR[1] * 130, pos.z + SUN_DIR[2] * 130)
    t.position.set(pos.x, 0, pos.z)
    l.target = t
  })
  return (
    <>
      <object3D ref={targetRef} />
      <directionalLight
        ref={lightRef}
        castShadow
        color="#fff1da"
        intensity={2.4}
        shadow-mapSize={[2048, 2048]}
        shadow-camera-near={10}
        shadow-camera-far={400}
        shadow-bias={-0.0004}
      />
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

/** Deterministic hash of chunk coords + index + seed to [0, 1). */
function hash(cx: number, cz: number, i: number, seed: number): number {
  let h = seed >>> 0
  h = Math.imul(h ^ cx, 0x85ebca6b)
  h = Math.imul(h ^ cz, 0xc2b2ae35)
  h = Math.imul(h ^ i, 0x27d4eb2f)
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

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

function Vegetation() {
  const seed = useGame((s) => s.seed)
  const meshRefs = useRef<Partial<Record<Species, THREE.InstancedMesh>>>({})
  const lastCenter = useRef<string | null>(null)

  const geometries = useMemo<Record<Species, THREE.BufferGeometry>>(
    () => ({
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
    }),
    [],
  )
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }),
    [],
  )

  useEffect(() => {
    lastCenter.current = null // force rebuild on new run
  }, [seed])

  useFrame(() => {
    const pos = useGame.getState().pos
    const cx = Math.floor(pos.x / CHUNK_SIZE)
    const cz = Math.floor(pos.z / CHUNK_SIZE)
    const center = chunkKey(cx, cz)
    if (center === lastCenter.current) return
    lastCenter.current = center

    const counts: Record<Species, number> = {
      acacia: 0, jungle: 0, palm: 0, bush: 0, rock: 0,
      baobab: 0, termite: 0, deadtree: 0, papyrus: 0, kopje: 0,
    }
    const mtx = new THREE.Matrix4()
    const quat = new THREE.Quaternion()
    const up = new THREE.Vector3(0, 1, 0)
    const scl = new THREE.Vector3()

    for (let dz = -CHUNK_RADIUS; dz <= CHUNK_RADIUS; dz++) {
      for (let dx = -CHUNK_RADIUS; dx <= CHUNK_RADIUS; dx++) {
        const ccx = cx + dx
        const ccz = cz + dz
        for (let i = 0; i < CANDIDATES_PER_CHUNK; i++) {
          const rx = hash(ccx, ccz, i * 4, seed)
          const rz = hash(ccx, ccz, i * 4 + 1, seed)
          const roll = hash(ccx, ccz, i * 4 + 2, seed)
          const x = (ccx + rx) * CHUNK_SIZE
          const z = (ccz + rz) * CHUNK_SIZE
          const ll = worldToLatLon(x, z)
          const s = sampleTerrain(ll.lat, ll.lon, seed)
          // Reed belts: within ~0.05° of a river centerline or lake shore.
          const nearWater =
            s.height > 0.05 &&
            (riverDistance(ll.lat, ll.lon, 0.08) < 0.05 || lakeDistance(ll.lat, ll.lon, 0.08) < 0.04)
          const species = pickSpecies(s.type, roll, nearWater)
          if (!species || s.height <= 0.05) continue
          if (species === 'rock' && s.type === 'mountain' && s.height > 6.5) continue // snow line
          // Keep place surroundings clear so markers stay readable.
          let blockedByPlace = false
          for (const p of PLACES) {
            const w = latLonToWorld(p.lat, p.lon)
            if (Math.hypot(x - w.x, z - w.z) < 4) {
              blockedByPlace = true
              break
            }
          }
          if (blockedByPlace) continue
          const idx = counts[species]
          if (idx >= MAX_INSTANCES[species]) continue
          const r4 = hash(ccx, ccz, i * 4 + 3, seed)
          quat.setFromAxisAngle(up, r4 * Math.PI * 2)
          const sc = 0.75 + r4 * 0.55
          scl.set(sc, sc * (0.85 + roll * 0.3), sc)
          mtx.compose(new THREE.Vector3(x, s.height, z), quat, scl)
          meshRefs.current[species]?.setMatrixAt(idx, mtx)
          counts[species] = idx + 1
        }
      }
    }

    for (const sp of SPECIES) {
      const mesh = meshRefs.current[sp]
      if (!mesh) continue
      mesh.count = counts[sp]
      mesh.instanceMatrix.needsUpdate = true
    }
  })

  return (
    <>
      {SPECIES.map((sp) => (
        <instancedMesh
          key={sp}
          ref={(el) => {
            meshRefs.current[sp] = el ?? undefined
          }}
          args={[geometries[sp], material, MAX_INSTANCES[sp]]}
          castShadow
          receiveShadow
          frustumCulled={false}
        />
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

function PlaceMarker({ place }: { place: PlaceDef }) {
  const t = useStrings()
  const seed = useGame((s) => s.seed)
  const p = latLonToWorld(place.lat, place.lon)
  const y = useMemo(() => Math.max(0.2, sampleTerrain(place.lat, place.lon, seed).height), [place, seed])
  return (
    <group position={[p.x, y, p.z]}>
      {place.kind === 'port' ? <PortMarker /> : <VillageMarker />}
      <Html center position={[0, 2.9, 0]} distanceFactor={60}>
        <div className="map-label">{t.places[place.id]}</div>
      </Html>
    </group>
  )
}

/** Atlas-style labels for the named landmarks (design.md §4.4). */
function LandmarkLabels() {
  const t = useStrings()
  const seed = useGame((s) => s.seed)
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
    return [...lakes, ...mountains, ...falls, graveyard]
  }, [seed, t])
  return (
    <>
      {items.map((it) => {
        const p = latLonToWorld(it.lat, it.lon)
        return (
          <Html key={it.key} center position={[p.x, it.y, p.z]} distanceFactor={60}>
            <div className={`map-label landmark${it.water ? ' water-label' : ''}`}>{it.name}</div>
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
function Player() {
  const ref = useRef<THREE.Group>(null)
  const inner = useRef<THREE.Group>(null)
  const heading = useRef(0)
  const last = useRef<{ x: number; z: number } | null>(null)
  const walkTime = useRef(0)

  useFrame((_, dt) => {
    const s = useGame.getState()
    if (!ref.current) return
    const ll = worldToLatLon(s.pos.x, s.pos.z)
    const t = sampleTerrain(ll.lat, ll.lon, s.seed)
    ref.current.position.set(s.pos.x, Math.max(0, t.height), s.pos.z)

    // Face the movement direction; bob gently while walking.
    const prev = last.current
    if (prev) {
      const dx = s.pos.x - prev.x
      const dz = s.pos.z - prev.z
      const moving = Math.hypot(dx, dz) > 0.001
      if (moving) {
        const target = Math.atan2(dx, dz)
        let diff = target - heading.current
        while (diff > Math.PI) diff -= Math.PI * 2
        while (diff < -Math.PI) diff += Math.PI * 2
        heading.current += diff * Math.min(1, dt * 10)
        walkTime.current += dt
      }
      if (inner.current) {
        inner.current.rotation.y = heading.current
        inner.current.position.y = moving ? Math.abs(Math.sin(walkTime.current * 9)) * 0.08 : 0
      }
    }
    last.current = { x: s.pos.x, z: s.pos.z }
  })

  return (
    <group ref={ref}>
      <group ref={inner}>
        {/* Legs */}
        <mesh position={[-0.11, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.09, 0.44, 6]} />
          <meshStandardMaterial color="#6e5a3a" roughness={0.9} />
        </mesh>
        <mesh position={[0.11, 0.22, 0]} castShadow>
          <cylinderGeometry args={[0.08, 0.09, 0.44, 6]} />
          <meshStandardMaterial color="#6e5a3a" roughness={0.9} />
        </mesh>
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
  // previous first-person pose).
  useEffect(() => {
    const pos = useGame.getState().pos
    const zoom = useUi.getState().travelZoom
    camera.position.set(pos.x, CAMERA_OFFSET.y * zoom, pos.z + CAMERA_OFFSET.z * zoom)
    camera.lookAt(pos.x, 0, pos.z)
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
    return () => window.removeEventListener('wheel', onWheel)
  }, [])

  // Interaction key: G digs. Places are entered by walking into them (below).
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

    // Movement: screen up = north (-z).
    if (!useUi.getState().dialog && !s.journalOpen) {
      const a = moveAxes()
      if (a.x !== 0 || a.y !== 0) s.moveTravel(a.x, -a.y, dt)
    }

    // Camera follows from above with a slight tilt; the zoom factor scales
    // the offset while the wheel zoom is unlocked (debug menu).
    const pos = useGame.getState().pos
    const zoom = useUi.getState().travelZoom
    camera.position.lerp(new THREE.Vector3(pos.x, CAMERA_OFFSET.y * zoom, pos.z + CAMERA_OFFSET.z * zoom), 0.12)
    camera.lookAt(pos.x, 0, pos.z)

    // Walking into a place enters it (design.md §2): no key press. The latch
    // prevents an immediate re-entry after leaving (leavePlace drops the player
    // just outside the radius); it re-arms once the player is clear again.
    let near: PlaceDef | null = null
    for (const p of PLACES) {
      const w = latLonToWorld(p.lat, p.lon)
      if (Math.hypot(pos.x - w.x, pos.z - w.z) <= balance.placeEnterRadius) {
        near = p
        break
      }
    }
    if (near && enterLatchRef.current !== near.id) {
      enterLatchRef.current = near.id
      if (!useUi.getState().dialog) {
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
    const prompt = nearCamp
      ? strings.prompts.openCamp
      : s.handItem === 'shovel'
        ? strings.prompts.digHere
        : null
    if (useUi.getState().prompt !== prompt) setPrompt(prompt)
  })

  return (
    <>
      <SkyDome preset={TRAVEL_SKY} sunDirection={SUN_DIR} />
      <Climate />
      <hemisphereLight args={['#bdd7e8', '#8a7a55', 0.85]} />
      <Sun />
      <TerrainChunks />
      <RiversAndLakes />
      <RegionBorders />
      <WaterPlane />
      <Vegetation />
      <Wildlife />
      {PLACES.map((p) => (
        <PlaceMarker key={p.id} place={p} />
      ))}
      <LandmarkLabels />
      <CampMarkers />
      <GraveMarker />
      <Player />
    </>
  )
}
