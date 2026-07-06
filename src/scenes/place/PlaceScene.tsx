// First-person place view (design.md §2): walkable port/village with
// enterable trade buildings, chief hut audience and a villager NPC.
// Building *positions and looks* are procedural per run (design.md §18);
// which buildings exist is fixed per place kind.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { useGame } from '../../state/store'
import { useUi, type BuildingType } from '../../state/ui'
import { balance } from '../../config/balance'
import { placeById } from '../../world/geo'
import { mulberry32 } from '../../world/noise'
import { isKeyDown, onKeyPress } from '../../systems/input'

const PLACE_RADIUS = 28 // walkable radius in meters; leaving it exits the place
const INTERACT_RADIUS = 4.5

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

function PortBuilding({ item }: { item: Interactive }) {
  return (
    <group position={[item.pos[0], 0, item.pos[1]]}>
      <mesh position={[0, 1.6, 0]}>
        <boxGeometry args={[5, 3.2, 4]} />
        <meshStandardMaterial color="#d8cba8" />
      </mesh>
      <mesh position={[0, 3.4, 0]}>
        <boxGeometry args={[5.4, 0.4, 4.4]} />
        <meshStandardMaterial color="#8a6f45" />
      </mesh>
      {/* Door */}
      <mesh position={[0, 0.9, 2.01]}>
        <boxGeometry args={[1.1, 1.8, 0.1]} />
        <meshStandardMaterial color="#5a4020" />
      </mesh>
      <Html center position={[0, 4.4, 0]} distanceFactor={18}>
        <div className="map-label">{item.label}</div>
      </Html>
    </group>
  )
}

function VillageHut({ x, z, r, h, label }: { x: number; z: number; r: number; h: number; label?: string }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[r, r * 1.05, h, 10]} />
        <meshStandardMaterial color="#b0803f" />
      </mesh>
      <mesh position={[0, h + r * 0.45, 0]}>
        <coneGeometry args={[r * 1.35, r * 1.1, 10]} />
        <meshStandardMaterial color="#8f7340" />
      </mesh>
      {label && (
        <Html center position={[0, h + r * 1.4 + 0.8, 0]} distanceFactor={18}>
          <div className="map-label">{label}</div>
        </Html>
      )}
    </group>
  )
}

function Villager({ item }: { item: Interactive }) {
  return (
    <group position={[item.pos[0], 0, item.pos[1]]}>
      <mesh position={[0, 0.8, 0]}>
        <capsuleGeometry args={[0.3, 0.9, 4, 10]} />
        <meshStandardMaterial color="#7a3b1e" />
      </mesh>
      <mesh position={[0, 1.65, 0]}>
        <sphereGeometry args={[0.24, 12, 10]} />
        <meshStandardMaterial color="#5c3317" />
      </mesh>
      <Html center position={[0, 2.3, 0]} distanceFactor={14}>
        <div className="map-label">Alter Mann</div>
      </Html>
    </group>
  )
}

function Palm({ x, z, h }: { x: number; z: number; h: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[0.12, 0.2, h, 6]} />
        <meshStandardMaterial color="#7a5c30" />
      </mesh>
      <mesh position={[0, h + 0.2, 0]}>
        <sphereGeometry args={[1.1, 8, 6]} />
        <meshStandardMaterial color="#3f6b2a" />
      </mesh>
    </group>
  )
}

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
  const isPort = place.kind === 'port'
  const groundColor = isPort ? '#d9c9a3' : '#c9a878'
  const skyColor = isPort ? '#bfd9e8' : '#d8e4c8'

  return (
    <>
      <color attach="background" args={[skyColor]} />
      <fog attach="fog" args={[skyColor, 30, 90]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[30, 50, 20]} intensity={1.8} />

      {/* Ground disc */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
        <circleGeometry args={[PLACE_RADIUS + 14, 48]} />
        <meshStandardMaterial color={groundColor} />
      </mesh>

      {layout.interactives.map((it, i) => {
        if (it.type === 'villager') return <Villager key={i} item={it} />
        if (it.type === 'exit') {
          return (
            <group key={i} position={[it.pos[0], 0, it.pos[1]]}>
              <mesh position={[-1.4, 1.2, 0]}>
                <cylinderGeometry args={[0.15, 0.15, 2.4, 6]} />
                <meshStandardMaterial color="#7a5c30" />
              </mesh>
              <mesh position={[1.4, 1.2, 0]}>
                <cylinderGeometry args={[0.15, 0.15, 2.4, 6]} />
                <meshStandardMaterial color="#7a5c30" />
              </mesh>
              <mesh position={[0, 2.5, 0]}>
                <boxGeometry args={[3.2, 0.25, 0.25]} />
                <meshStandardMaterial color="#7a5c30" />
              </mesh>
              <Html center position={[0, 3.2, 0]} distanceFactor={18}>
                <div className="map-label">Ort verlassen</div>
              </Html>
            </group>
          )
        }
        if (isPort) return <PortBuilding key={i} item={it} />
        // Chief hut: larger village hut.
        return <VillageHut key={i} x={it.pos[0]} z={it.pos[1]} r={3} h={3} label={it.label} />
      })}

      {layout.decoHuts.map((h, i) =>
        isPort ? (
          <group key={i} position={[h.x, 0, h.z]}>
            <mesh position={[0, h.h / 2, 0]}>
              <boxGeometry args={[h.r * 2, h.h, h.r * 1.8]} />
              <meshStandardMaterial color="#cbbd97" />
            </mesh>
          </group>
        ) : (
          <VillageHut key={i} x={h.x} z={h.z} r={h.r} h={h.h} />
        ),
      )}

      {layout.palms.map((t, i) => (
        <Palm key={i} {...t} />
      ))}
    </>
  )
}
