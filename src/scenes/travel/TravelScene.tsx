// Bird's-eye travel view (design.md §2): 3D terrain around the player,
// top-down oriented movement, camera following from above.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import * as THREE from 'three/webgpu'
import { useGame } from '../../state/store'
import { useUi } from '../../state/ui'
import { balance } from '../../config/balance'
import { PLACES, latLonToWorld, worldToLatLon, type PlaceDef } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { moveAxes, onKeyPress } from '../../systems/input'

const CHUNK_SIZE = 24 // world units
const CHUNK_SEGMENTS = 24
const CHUNK_RADIUS = 3 // chunks kept around the player in each direction

function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`
}

/** Build one terrain chunk as absolute-positioned geometry with vertex colors. */
function buildChunkGeometry(cx: number, cz: number, seed: number): THREE.BufferGeometry {
  const n = CHUNK_SEGMENTS + 1
  const step = CHUNK_SIZE / CHUNK_SEGMENTS
  const positions = new Float32Array(n * n * 3)
  const colors = new Float32Array(n * n * 3)
  const x0 = cx * CHUNK_SIZE
  const z0 = cz * CHUNK_SIZE

  let i = 0
  for (let iz = 0; iz < n; iz++) {
    for (let ix = 0; ix < n; ix++) {
      const x = x0 + ix * step
      const z = z0 + iz * step
      const { lat, lon } = worldToLatLon(x, z)
      const s = sampleTerrain(lat, lon, seed)
      positions[i * 3] = x
      positions[i * 3 + 1] = s.height
      positions[i * 3 + 2] = z
      colors[i * 3] = s.color[0]
      colors[i * 3 + 1] = s.color[1]
      colors[i * 3 + 2] = s.color[2]
      i++
    }
  }

  const indices: number[] = []
  for (let iz = 0; iz < CHUNK_SEGMENTS; iz++) {
    for (let ix = 0; ix < CHUNK_SEGMENTS; ix++) {
      const a = iz * n + ix
      const b = a + 1
      const c = a + n
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

function TerrainChunks() {
  const seed = useGame((s) => s.seed)
  const cache = useRef(new Map<string, THREE.BufferGeometry>())
  const [active, setActive] = useState<string[]>([])
  const lastCenter = useRef<string | null>(null)

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
        const key = chunkKey(cx + dx, cz + dz)
        keys.push(key)
        if (!cache.current.has(key)) {
          cache.current.set(key, buildChunkGeometry(cx + dx, cz + dz, seed))
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
        return (
          <mesh key={key} geometry={geo}>
            <meshStandardMaterial vertexColors flatShading />
          </mesh>
        )
      })}
    </>
  )
}

/** Water surface at sea level, following the player. */
function WaterPlane() {
  const ref = useRef<THREE.Mesh>(null)
  useFrame(() => {
    const pos = useGame.getState().pos
    if (ref.current) ref.current.position.set(pos.x, 0, pos.z)
  })
  return (
    <mesh ref={ref} rotation={[-Math.PI / 2, 0, 0]}>
      <planeGeometry args={[CHUNK_SIZE * 10, CHUNK_SIZE * 10]} />
      <meshStandardMaterial color="#2a6d9c" transparent opacity={0.88} />
    </mesh>
  )
}

function PlaceMarker({ place }: { place: PlaceDef }) {
  const seed = useGame((s) => s.seed)
  const p = latLonToWorld(place.lat, place.lon)
  const y = useMemo(() => Math.max(0.2, sampleTerrain(place.lat, place.lon, seed).height), [place, seed])
  const isPort = place.kind === 'port'
  return (
    <group position={[p.x, y, p.z]}>
      {isPort ? (
        <>
          <mesh position={[0, 0.6, 0]}>
            <boxGeometry args={[1.8, 1.2, 1.8]} />
            <meshStandardMaterial color="#d8cba8" />
          </mesh>
          <mesh position={[0, 1.5, 0]}>
            <boxGeometry args={[1.2, 0.6, 1.2]} />
            <meshStandardMaterial color="#b09a6a" />
          </mesh>
        </>
      ) : (
        <>
          <mesh position={[0, 0.4, 0]}>
            <cylinderGeometry args={[0.8, 0.9, 0.8, 8]} />
            <meshStandardMaterial color="#a3743c" />
          </mesh>
          <mesh position={[0, 1.05, 0]}>
            <coneGeometry args={[1.05, 0.7, 8]} />
            <meshStandardMaterial color="#8a6f45" />
          </mesh>
        </>
      )}
      <Html center position={[0, 2.6, 0]} distanceFactor={60}>
        <div className="map-label">{place.name}</div>
      </Html>
    </group>
  )
}

/** Debug-only marker for the hidden grave position. */
function GraveMarker() {
  const grave = useGame((s) => s.graveLatLon)
  const seed = useGame((s) => s.seed)
  useGame((s) => s.balanceVersion) // re-render when debug toggles change
  const p = latLonToWorld(grave.lat, grave.lon)
  const y = Math.max(0.2, sampleTerrain(grave.lat, grave.lon, seed).height)
  if (!balance.showHiddenObjects) return null
  return (
    <group position={[p.x, y + 0.5, p.z]}>
      <mesh rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[2.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
      <mesh rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[2.4, 0.4, 0.4]} />
        <meshStandardMaterial color="#c0392b" />
      </mesh>
      <Html center position={[0, 1.6, 0]} distanceFactor={60}>
        <div className="map-label">Grab (Debug)</div>
      </Html>
    </group>
  )
}

function Player() {
  const ref = useRef<THREE.Group>(null)
  useFrame(() => {
    const s = useGame.getState()
    if (!ref.current) return
    const ll = worldToLatLon(s.pos.x, s.pos.z)
    const t = sampleTerrain(ll.lat, ll.lon, s.seed)
    ref.current.position.set(s.pos.x, Math.max(0, t.height), s.pos.z)
  })
  return (
    <group ref={ref}>
      <mesh position={[0, 0.55, 0]}>
        <capsuleGeometry args={[0.28, 0.6, 4, 10]} />
        <meshStandardMaterial color="#8d5524" />
      </mesh>
      <mesh position={[0, 1.25, 0]}>
        <sphereGeometry args={[0.24, 12, 10]} />
        <meshStandardMaterial color="#e8c8a0" />
      </mesh>
      <mesh position={[0, 1.45, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.08, 12]} />
        <meshStandardMaterial color="#d9c9a3" />
      </mesh>
    </group>
  )
}

export function TravelScene() {
  const camera = useThree((s) => s.camera)
  const nearPlaceRef = useRef<PlaceDef | null>(null)
  const setPrompt = useUi((s) => s.setPrompt)

  // Interaction keys: E enters a nearby place, G digs.
  useEffect(() => {
    const offE = onKeyPress('KeyE', () => {
      const p = nearPlaceRef.current
      if (p && !useUi.getState().dialog) useGame.getState().enterPlace(p.id)
    })
    const offG = onKeyPress('KeyG', () => {
      if (!useUi.getState().dialog) useGame.getState().dig()
    })
    return () => {
      offE()
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

    // Camera follows from above with a slight tilt.
    const pos = useGame.getState().pos
    camera.position.lerp(new THREE.Vector3(pos.x, 42, pos.z + 24), 0.12)
    camera.lookAt(pos.x, 0, pos.z)

    // Proximity prompt for entering places / digging.
    let near: PlaceDef | null = null
    for (const p of PLACES) {
      const w = latLonToWorld(p.lat, p.lon)
      if (Math.hypot(pos.x - w.x, pos.z - w.z) <= balance.placeEnterRadius) {
        near = p
        break
      }
    }
    nearPlaceRef.current = near
    const prompt = near
      ? `E — ${near.name} betreten`
      : s.handItem === 'shovel'
        ? 'G — Hier graben'
        : null
    if (useUi.getState().prompt !== prompt) setPrompt(prompt)
  })

  return (
    <>
      <color attach="background" args={['#cfe3ee']} />
      <fog attach="fog" args={['#cfe3ee', 90, 240]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[60, 90, 30]} intensity={2.0} />
      <TerrainChunks />
      <WaterPlane />
      {PLACES.map((p) => (
        <PlaceMarker key={p.id} place={p} />
      ))}
      <GraveMarker />
      <Player />
    </>
  )
}
