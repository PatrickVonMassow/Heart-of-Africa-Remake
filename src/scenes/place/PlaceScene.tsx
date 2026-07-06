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
import { mulberry32 } from '../../world/noise'
import { isKeyDown, onKeyPress } from '../../systems/input'
import { PORT_SKY, VILLAGE_SKY, SkyDome } from '../../render/sky'
import { createGroundMaterial, createNoisyMaterial } from '../../render/materials'
import { buildAcacia, buildBush, buildGrassTuft, buildJungleTree, buildPalm, buildRock } from '../../render/flora'
import { REGION_PLACE_STYLES, type RegionPlaceStyle } from './regionStyles'
import { PlaceLife } from './PlaceLife'

const PLACE_RADIUS = 28 // walkable radius in meters; leaving it exits the place
const INTERACT_RADIUS = 4.5

/** Sun direction shared by the sky dome disc and the shadow light. */
const SUN_DIR: [number, number, number] = [0.52, 0.68, 0.34]

interface Interactive {
  type: BuildingType | 'villager' | 'exit'
  label: string
  pos: [number, number]
}

const BUILDING_LABELS: Record<BuildingType, string> = {
  shop: 'Laden',
  weapons: 'Waffenhütte',
  tools: 'Geräte-Hütte',
  market: 'Markthütte',
  chief: 'Chefhütte',
}

interface PlaceLayout {
  interactives: Interactive[]
  decoHuts: Array<{ x: number; z: number; r: number; h: number }>
  palms: Array<{ x: number; z: number; h: number }>
}

/** Procedural layout per run+place: positions jittered from a seeded PRNG. */
function buildLayout(placeId: string, seed: number): PlaceLayout {
  const place = placeById(placeId)
  let hash = 0
  for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const rand = mulberry32((seed ^ hash) >>> 0)
  const jitter = (v: number, amount: number) => v + (rand() - 0.5) * amount

  const interactives: Interactive[] = []
  if (place.kind === 'port') {
    const types: BuildingType[] = ['shop', 'weapons', 'tools', 'market']
    types.forEach((t, i) => {
      // Diagonal placement keeps the southern spawn corridor free.
      const angle = Math.PI / 4 + (i / types.length) * Math.PI * 2 + (rand() - 0.5) * 0.4
      const r = 11 + rand() * 4
      interactives.push({
        type: t,
        label: BUILDING_LABELS[t],
        pos: [Math.cos(angle) * r, Math.sin(angle) * r],
      })
    })
  } else {
    interactives.push({ type: 'chief', label: BUILDING_LABELS.chief, pos: [jitter(0, 4), jitter(-13, 3)] })
    interactives.push({ type: 'villager', label: 'Mit dem Alten sprechen', pos: [jitter(4, 3), jitter(-4, 2)] })
  }
  interactives.push({ type: 'exit', label: 'Ort verlassen', pos: [0, 24] })

  // Keep the southern spawn corridor (x≈0, z>6) and interactives clear.
  const isFree = (x: number, z: number, margin: number) => {
    if (Math.abs(x) < 5 && z > 5) return false
    if (Math.hypot(x, z - 18) < 7) return false
    return interactives.every((it) => Math.hypot(x - it.pos[0], z - it.pos[1]) > margin)
  }

  const decoHuts: PlaceLayout['decoHuts'] = []
  const count = place.kind === 'port' ? 7 : 6
  for (let i = 0; i < count * 4 && decoHuts.length < count; i++) {
    const angle = rand() * Math.PI * 2
    const r = 15 + rand() * 8
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (!isFree(x, z, 6)) continue
    decoHuts.push({ x, z, r: 1.6 + rand() * 0.8, h: 2 + rand() * 0.8 })
  }

  const palms: PlaceLayout['palms'] = []
  for (let i = 0; i < 32 && palms.length < 8; i++) {
    const angle = rand() * Math.PI * 2
    const r = 8 + rand() * 18
    const x = Math.cos(angle) * r
    const z = Math.sin(angle) * r
    if (!isFree(x, z, 4)) continue
    palms.push({ x, z, h: 3 + rand() * 2 })
  }

  return { interactives, decoHuts, palms }
}

// --- Shared procedural materials (created once per mount) --------------------

function usePlaceMaterials(isPort: boolean, style: RegionPlaceStyle) {
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
    const ground = isPort
      ? createGroundMaterial('#dcc99c', '#c4ad7c', '#b59a6b')
      : createGroundMaterial(...style.ground)
    return { plaster, plasterDark, mud, thatch, wood, ground }
  }, [isPort, style])
}

type PlaceMaterials = ReturnType<typeof usePlaceMaterials>

// --- Scenery pieces -----------------------------------------------------------

function PortBuilding({ item, mats, variant }: { item: Interactive; mats: PlaceMaterials; variant: number }) {
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
        <div className="map-label">{item.label}</div>
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
  chief = false,
}: {
  x: number
  z: number
  r: number
  h: number
  label?: string
  mats: PlaceMaterials
  style: RegionPlaceStyle
  chief?: boolean
}) {
  // Door faces the place center.
  const facing = Math.atan2(x, z) + Math.PI
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
        <div className="map-label">Alter Mann</div>
      </Html>
    </group>
  )
}

function ExitGate({ item, mats }: { item: Interactive; mats: PlaceMaterials }) {
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
        <div className="map-label">Ort verlassen</div>
      </Html>
    </group>
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

/** Seeded ground scatter: grass tufts and stones (visual only). */
function GroundScatter({
  placeId,
  seed,
  isPort,
  grassFactor = 1,
}: {
  placeId: string
  seed: number
  isPort: boolean
  grassFactor?: number
}) {
  const { tufts, rocks } = useMemo(() => {
    let hash = 0
    for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
    const rand = mulberry32(((seed ^ hash) + 977) >>> 0)
    const tufts: Array<[number, number, number]> = []
    const rocks: Array<[number, number, number]> = []
    const tuftCount = Math.round((isPort ? 30 : 70) * grassFactor)
    for (let i = 0; i < tuftCount; i++) {
      const a = rand() * Math.PI * 2
      const r = 4 + rand() * (PLACE_RADIUS + 8)
      tufts.push([Math.cos(a) * r, Math.sin(a) * r, 0.55 + rand() * 0.55])
    }
    for (let i = 0; i < 16; i++) {
      const a = rand() * Math.PI * 2
      const r = 6 + rand() * (PLACE_RADIUS + 6)
      rocks.push([Math.cos(a) * r, Math.sin(a) * r, 0.3 + rand() * 0.7])
    }
    return { tufts, rocks }
  }, [placeId, seed, isPort, grassFactor])

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
      <instancedMesh ref={rockMesh} args={[rockGeo, material, 16]} castShadow receiveShadow />
    </>
  )
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
  const mats = usePlaceMaterials(!!isPort, style)
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

  // Reset position when the place changes.
  useEffect(() => {
    player.current = { x: 0, z: 18, yaw: 0 }
  }, [placeId])

  // Dev-only hooks for the headless Playwright verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placePlayer = player.current
    w.__placeLayout = layout
    return () => {
      delete w.__placePlayer
      delete w.__placeLayout
    }
  }, [layout])

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
        player.current.yaw -= e.movementX * 0.0022
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
        setDialog({ kind: 'audience' })
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
        p.x += dx
        p.z += dz
        const r = Math.hypot(p.x, p.z)
        if (r > PLACE_RADIUS) {
          useGame.getState().leavePlace()
          return
        }
      }
    }

    camera.position.set(p.x, 1.7, p.z)
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
    const prompt = near ? `E — ${near.label}` : null
    if (useUi.getState().prompt !== prompt) setPrompt(prompt)
  })

  if (!place || !layout) return null
  const sky = isPort ? PORT_SKY : VILLAGE_SKY

  return (
    <>
      <color attach="background" args={[sky.horizon]} />
      <fog attach="fog" args={[sky.horizon, 38, 110]} />
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

      {/* Ground disc with procedural mottling */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow material={mats.ground}>
        <circleGeometry args={[PLACE_RADIUS + 14, 48]} />
      </mesh>

      {layout.interactives.map((it, i) => {
        if (it.type === 'villager') return <Villager key={i} item={it} style={style} />
        if (it.type === 'exit') return <ExitGate key={i} item={it} mats={mats} />
        if (isPort) return <PortBuilding key={i} item={it} mats={mats} variant={i} />
        // Chief hut: larger village hut with regalia.
        return (
          <VillageHut key={i} x={it.pos[0]} z={it.pos[1]} r={3} h={3} label={it.label} mats={mats} style={style} chief />
        )
      })}

      {layout.decoHuts.map((h, i) =>
        isPort ? (
          <group key={i} position={[h.x, 0, h.z]} rotation={[0, (i * 73) % 4, 0]}>
            <mesh position={[0, h.h / 2, 0]} castShadow receiveShadow material={i % 2 ? mats.plaster : mats.plasterDark}>
              <boxGeometry args={[h.r * 2, h.h, h.r * 1.8]} />
            </mesh>
            <mesh position={[0, h.h + 0.08, 0]} castShadow material={mats.wood}>
              <boxGeometry args={[h.r * 2.2, 0.16, h.r * 2]} />
            </mesh>
            <mesh position={[0, h.h * 0.35, h.r * 0.91]}>
              <boxGeometry args={[0.8, h.h * 0.7, 0.08]} />
              <meshStandardMaterial color="#3d2c16" roughness={0.9} />
            </mesh>
          </group>
        ) : (
          <VillageHut key={i} x={h.x} z={h.z} r={h.r} h={h.h} mats={mats} style={style} />
        ),
      )}

      {!isPort && <FirePit x={-3.5} z={2.5} />}

      <PlaceFlora slots={layout.palms} style={isPort ? REGION_PLACE_STYLES.north : style} material={floraMaterial} geos={floraGeos} />

      <GroundScatter placeId={place.id} seed={seed} isPort={!!isPort} grassFactor={style.grass} />

      <PlaceLife
        kind={isPort ? 'port' : 'village'}
        seed={seed}
        placeId={place.id}
        style={style}
        buildings={layout.interactives.filter((it) => it.type !== 'exit' && it.type !== 'villager').map((it) => it.pos)}
        firePos={[-3.5, 2.5]}
      />
    </>
  )
}
