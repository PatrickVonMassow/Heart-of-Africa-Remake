// Ambient life in places (design.md §19 "village and market life", §2 bustle):
// villagers cooking and weaving, playing children and goats in villages;
// porters and traders in the wealthier ports. Inhabitants interact with each
// other and with the props: pairs stand in conversation, a fire tender stokes
// the fire, food is fetched from the huts and cooked over it, grain is
// pounded in a mortar, a drummer plays, and water is carried from the well.
// Pure animation, no mechanics.

import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { mulberry32 } from '../../world/noise'
import { buildGoat } from '../../render/fauna'
import { TESSELLATION } from '../../render/figures'
import type { RegionPlaceStyle } from './regionStyles'
import { resolveMove, type Collider } from './collision'
import { PORT_TALKERS, VILLAGE_SPOTS } from './lifeSpots'

/** Collision radius of inhabitants (matches the player's). */
const NPC_RADIUS = 0.3

/** Simple primitive human figure; `kneel` folds it down for sitting work. */
function Figure({
  cloth,
  skin = '#5c3317',
  scale = 1,
  kneel = false,
}: {
  cloth: string
  skin?: string
  scale?: number
  kneel?: boolean
}) {
  const bodyH = kneel ? 0.55 : 1.0
  return (
    <group scale={[scale, scale * (kneel ? 0.75 : 1), scale]}>
      <mesh position={[0, bodyH * 0.5, 0]} castShadow>
        <coneGeometry args={[0.32, bodyH, TESSELLATION.figureBody]} />
        <meshStandardMaterial color={cloth} roughness={0.95} />
      </mesh>
      <mesh position={[0, bodyH + 0.18, 0]} castShadow>
        <sphereGeometry args={[0.16, ...TESSELLATION.figureHead]} />
        <meshStandardMaterial color={skin} roughness={0.85} />
      </mesh>
    </group>
  )
}

/** Kneeling cook with a three-stick pot beside the village fire. */
function Cook({ x, z, cloth }: { x: number; z: number; cloth: string }) {
  return (
    <group position={[x, 0, z]} rotation={[0, Math.PI / 3, 0]}>
      <Figure cloth={cloth} kneel />
      {/* Tripod with pot over the embers */}
      <group position={[0.85, 0, -0.4]}>
        {[0, 1, 2].map((i) => {
          const a = (i / 3) * Math.PI * 2
          return (
            <mesh
              key={i}
              position={[Math.cos(a) * 0.22, 0.35, Math.sin(a) * 0.22]}
              rotation={[Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4]}
              castShadow
            >
              <cylinderGeometry args={[0.02, 0.02, 0.75, 4]} />
              <meshStandardMaterial color="#4a3018" roughness={0.95} />
            </mesh>
          )
        })}
        <mesh position={[0, 0.42, 0]} castShadow>
          <sphereGeometry args={[0.17, ...TESSELLATION.goods, 0, Math.PI * 2, 0, Math.PI / 1.6]} />
          <meshStandardMaterial color="#2c2622" roughness={0.7} />
        </mesh>
      </group>
    </group>
  )
}

/** Weaver working at a simple standing loom. */
function Weaver({ x, z, cloth, weave }: { x: number; z: number; cloth: string; weave: string }) {
  const facing = Math.atan2(-x, -z)
  return (
    <group position={[x, 0, z]} rotation={[0, facing, 0]}>
      {/* Loom frame */}
      {[-0.55, 0.55].map((px) => (
        <mesh key={px} position={[px, 0.75, 0]} castShadow>
          <cylinderGeometry args={[0.035, 0.045, 1.5, 5]} />
          <meshStandardMaterial color="#5f4526" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 1.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.03, 0.03, 1.25, 5]} />
        <meshStandardMaterial color="#5f4526" roughness={0.95} />
      </mesh>
      {/* Half-finished cloth */}
      <mesh position={[0, 1.0, 0]} castShadow>
        <boxGeometry args={[0.95, 0.85, 0.03]} />
        <meshStandardMaterial color={weave} roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <group position={[0, 0, 0.55]}>
        <Figure cloth={cloth} />
      </group>
    </group>
  )
}

/** Two children chasing each other in a circle. */
function Kids({ x, z, cloth, colliders }: { x: number; z: number; cloth: string[]; colliders: Collider[] }) {
  const refs = useRef<Array<THREE.Group | null>>([])
  // Each kid's current position, eased toward the circling target so it slides
  // smoothly along any obstacle instead of sticking at the absolute circle point
  // and then jumping once the point clears the obstacle.
  const pos = useRef<Array<{ x: number; z: number } | null>>([null, null])
  useFrame((state, dt) => {
    const t = state.clock.elapsedTime
    refs.current.forEach((g, i) => {
      if (!g) return
      const a = t * 1.4 + i * Math.PI
      const tx = x + Math.cos(a) * 2.2
      const tz = z + Math.sin(a) * 2.2
      let p = pos.current[i]
      if (!p) {
        p = { x: tx, z: tz }
        pos.current[i] = p
      }
      const k = Math.min(1, dt * 3.5)
      const [px, pz] = resolveMove(colliders, p.x + (tx - p.x) * k, p.z + (tz - p.z) * k, NPC_RADIUS)
      const dx = px - p.x
      const dz = pz - p.z
      p.x = px
      p.z = pz
      g.position.set(px, Math.abs(Math.sin(t * 6 + i)) * 0.12, pz)
      if (Math.hypot(dx, dz) > 1e-4) g.rotation.y = Math.atan2(dx, dz)
    })
  })
  return (
    <>
      {[0, 1].map((i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Figure cloth={cloth[i % cloth.length]} scale={0.55} />
        </group>
      ))}
    </>
  )
}

/** Goats drifting around, grazing — inside the pen when one exists. */
function Goats({ seed, count, pen, colliders }: { seed: number; count: number; pen: PenDef | null; colliders: Collider[] }) {
  const geo = useMemo(() => buildGoat(), [])
  const material = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 }),
    [],
  )
  const anchors = useMemo(() => {
    const rand = mulberry32((seed + 31337) >>> 0)
    return Array.from({ length: count }, () => {
      const a = rand() * Math.PI * 2
      if (pen) {
        const r = rand() * (pen.r - 1.6)
        return { x: pen.x + Math.cos(a) * r, z: pen.z + Math.sin(a) * r, phase: rand() * Math.PI * 2, amp: 0.6 }
      }
      const r = 9 + rand() * 12
      return { x: Math.cos(a) * r, z: Math.sin(a) * r, phase: rand() * Math.PI * 2, amp: 1.5 }
    })
  }, [seed, count, pen])
  const refs = useRef<Array<THREE.Group | null>>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    refs.current.forEach((g, i) => {
      const a = anchors[i]
      if (!g || !a) return
      const wob = Math.sin(t * 0.2 + a.phase)
      const [px, pz] = resolveMove(colliders, a.x + wob * a.amp, a.z + Math.cos(t * 0.17 + a.phase) * a.amp, NPC_RADIUS)
      g.position.set(px, 0, pz)
      g.rotation.y = a.phase + wob * 0.6
    })
  })
  return (
    <>
      {anchors.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <mesh geometry={geo} material={material} castShadow />
        </group>
      ))}
    </>
  )
}

/** Porters carrying crates between the port buildings and the plaza. */
function Porters({
  seed,
  stops,
  cloth,
  colliders,
  count = 3,
}: {
  seed: number
  stops: Array<[number, number]>
  cloth: string[]
  colliders: Collider[]
  count?: number
}) {
  const routes = useMemo(() => {
    const rand = mulberry32((seed + 4711) >>> 0)
    const n = Math.min(count, Math.max(1, stops.length))
    return Array.from({ length: n }, (_, i) => {
      const a = stops[i % stops.length]
      // Routes lead across the central plaza so the bustle stays in view.
      const px = (rand() - 0.5) * 7
      const pz = (rand() - 0.5) * 7
      const toCenter = Math.hypot(a[0], a[1]) || 1
      return {
        ax: a[0] * (1 - 3.2 / toCenter),
        az: a[1] * (1 - 3.2 / toCenter),
        bx: px,
        bz: pz,
        phase: rand() * Math.PI * 2,
        speed: 0.55 + rand() * 0.2,
      }
    })
  }, [seed, stops, count])
  const refs = useRef<Array<THREE.Group | null>>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    refs.current.forEach((g, i) => {
      const r = routes[i]
      if (!g || !r) return
      // Ping-pong along the route; solid objects push the porter aside.
      const u = (Math.sin(t * r.speed + r.phase) + 1) / 2
      const x = r.ax + (r.bx - r.ax) * u
      const z = r.az + (r.bz - r.az) * u
      const dir = Math.cos(t * r.speed + r.phase) >= 0 ? 1 : -1
      const [px, pz] = resolveMove(colliders, x, z, NPC_RADIUS)
      g.position.set(px, Math.abs(Math.sin(t * 5 + r.phase)) * 0.05, pz)
      g.rotation.y = Math.atan2((r.bx - r.ax) * dir, (r.bz - r.az) * dir)
    })
  })
  return (
    <>
      {routes.map((_, i) => (
        <group
          key={i}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Figure cloth={cloth[i % cloth.length]} />
          {/* Carried crate */}
          <mesh position={[0, 1.05, 0.3]} castShadow>
            <boxGeometry args={[0.45, 0.35, 0.35]} />
            <meshStandardMaterial color="#7a5a32" roughness={0.9} />
          </mesh>
        </group>
      ))}
    </>
  )
}

/** Two inhabitants standing together in conversation, gesturing. */
function Talkers({ x, z, cloth }: { x: number; z: number; cloth: string[] }) {
  const a = useRef<THREE.Group>(null)
  const b = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    // Alternating gestures: slight turns and nods toward each other.
    if (a.current) {
      a.current.rotation.y = Math.PI / 2 + Math.sin(t * 1.15) * 0.18
      a.current.position.y = Math.max(0, Math.sin(t * 2.3)) * 0.03
    }
    if (b.current) {
      b.current.rotation.y = -Math.PI / 2 + Math.sin(t * 1.15 + Math.PI) * 0.18
      b.current.position.y = Math.max(0, Math.sin(t * 2.3 + Math.PI)) * 0.03
    }
  })
  return (
    <group position={[x, 0, z]}>
      <group ref={a} position={[-0.5, 0, 0]}>
        <Figure cloth={cloth[0]} />
      </group>
      <group ref={b} position={[0.5, 0, 0]}>
        <Figure cloth={cloth[1 % cloth.length]} />
      </group>
    </group>
  )
}

/** Grain pounding: mortar and a rising, falling pestle (period staple). */
function Pounder({ x, z, cloth }: { x: number; z: number; cloth: string }) {
  const pestle = useRef<THREE.Mesh>(null)
  const body = useRef<THREE.Group>(null)
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    const stroke = Math.abs(Math.sin(t * 2.4))
    if (pestle.current) pestle.current.position.y = 1.05 + stroke * 0.38
    if (body.current) body.current.position.y = -stroke * 0.06
  })
  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(-x, -z), 0]}>
      <group ref={body} position={[0, 0, -0.55]}>
        <Figure cloth={cloth} />
      </group>
      {/* Mortar */}
      <mesh position={[0, 0.21, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.26, 0.42, TESSELLATION.mortar]} />
        <meshStandardMaterial color="#5f4526" roughness={0.95} />
      </mesh>
      {/* Pestle */}
      <mesh ref={pestle} position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.045, 0.055, 1.05, TESSELLATION.pestle]} />
        <meshStandardMaterial color="#7a5a32" roughness={0.9} />
      </mesh>
    </group>
  )
}

/** Drummer beating a hide drum — the audible village drums made visible. */
function Drummer({ x, z, cloth }: { x: number; z: number; cloth: string }) {
  const hands = useRef<Array<THREE.Mesh | null>>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * 4.2 // matches the drum-bar tempo roughly
    hands.current.forEach((h, i) => {
      if (h) h.position.y = 0.78 + Math.max(0, Math.sin(t + i * Math.PI)) * 0.16
    })
  })
  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(-x + 3.5, -z + 2.5), 0]}>
      <Figure cloth={cloth} />
      {/* Drum */}
      <mesh position={[0, 0.34, 0.48]} castShadow>
        <cylinderGeometry args={[0.26, 0.2, 0.66, 9]} />
        <meshStandardMaterial color="#8a5a30" roughness={0.9} />
      </mesh>
      {[-0.14, 0.14].map((hx, i) => (
        <mesh
          key={hx}
          ref={(el) => {
            hands.current[i] = el
          }}
          position={[hx, 0.78, 0.42]}
          castShadow
        >
          <sphereGeometry args={[0.07, ...TESSELLATION.figureHand]} />
          <meshStandardMaterial color="#5c3317" roughness={0.85} />
        </mesh>
      ))}
    </group>
  )
}

/** Fire tender kneeling at the fire pit, stoking the embers with a stick. */
function FireTender({ x, z, cloth }: { x: number; z: number; cloth: string }) {
  const stick = useRef<THREE.Mesh>(null)
  useFrame(({ clock }) => {
    if (stick.current) stick.current.rotation.x = 0.85 + Math.sin(clock.elapsedTime * 1.6) * 0.12
  })
  return (
    <group position={[x, 0, z]} rotation={[0, Math.atan2(-3.5 - x, 2.5 - z), 0]}>
      <Figure cloth={cloth} kneel />
      <mesh ref={stick} position={[0.2, 0.5, 0.35]} castShadow>
        <cylinderGeometry args={[0.025, 0.03, 1.15, 4]} />
        <meshStandardMaterial color="#4a3018" roughness={0.95} />
      </mesh>
    </group>
  )
}

/** Village well: stone ring with a wooden frame and bucket. */
function Well({ x, z }: { x: number; z: number }) {
  return (
    <group position={[x, 0, z]}>
      {Array.from({ length: 9 }, (_, i) => {
        const a = (i / 9) * Math.PI * 2
        return (
          <mesh key={i} position={[Math.cos(a) * 0.55, 0.18, Math.sin(a) * 0.55]} castShadow>
            <dodecahedronGeometry args={[0.19, 0]} />
            <meshStandardMaterial color="#8d8478" roughness={1} />
          </mesh>
        )
      })}
      <mesh position={[0, 0.05, 0]}>
        <cylinderGeometry args={[0.48, 0.48, 0.08, 12]} />
        <meshStandardMaterial color="#28516b" roughness={0.3} />
      </mesh>
      {[-0.6, 0.6].map((px) => (
        <mesh key={px} position={[px, 0.75, 0]} castShadow>
          <cylinderGeometry args={[0.05, 0.06, 1.5, 5]} />
          <meshStandardMaterial color="#5f4526" roughness={0.95} />
        </mesh>
      ))}
      <mesh position={[0, 1.45, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.04, 0.04, 1.3, 5]} />
        <meshStandardMaterial color="#5f4526" roughness={0.95} />
      </mesh>
      {/* Bucket on the rope */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <cylinderGeometry args={[0.11, 0.09, 0.18, 7]} />
        <meshStandardMaterial color="#6e4f2a" roughness={0.9} />
      </mesh>
    </group>
  )
}

/**
 * Task loop (design.md §19): an inhabitant steps out of its dwelling,
 * carries something to a fixed target (food bundle to the fire, jar to the
 * well), kneels there working, and returns home. Door segments skip
 * collision like the Walkers.
 */
function TaskWalker({
  home,
  target,
  cloth,
  carry,
  colliders,
  startDelay,
}: {
  home: HomeDef
  target: [number, number]
  cloth: string
  carry: 'bundle' | 'jar'
  colliders: Collider[]
  startDelay: number
}) {
  const standing = useRef<THREE.Group>(null)
  const kneeling = useRef<THREE.Group>(null)
  const state = useRef({
    mode: 'inside' as 'inside' | 'go' | 'work' | 'back',
    seg: 0,
    x: home.x,
    z: home.z,
    yaw: 0,
    timer: startDelay,
  })

  useFrame((_, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const s = state.current
    const stand = standing.current
    const kneel = kneeling.current
    if (!stand || !kneel) return

    const route =
      s.mode === 'back'
        ? [target, home.door, [home.x, home.z] as [number, number]]
        : [[home.x, home.z] as [number, number], home.door, target]

    if (s.mode === 'inside') {
      stand.visible = false
      kneel.visible = false
      s.timer -= dt
      if (s.timer <= 0) {
        s.mode = 'go'
        s.seg = 0
        s.x = home.x
        s.z = home.z
      }
      return
    }
    if (s.mode === 'work') {
      stand.visible = false
      kneel.visible = true
      kneel.position.set(s.x, 0, s.z)
      kneel.rotation.y = s.yaw
      s.timer -= dt
      if (s.timer <= 0) {
        s.mode = 'back'
        s.seg = 0
      }
      return
    }

    stand.visible = true
    kneel.visible = false
    const tgt = route[s.seg + 1]
    if (!tgt) {
      if (s.mode === 'go') {
        s.mode = 'work'
        s.timer = 5 + Math.random() * 5
      } else {
        s.mode = 'inside'
        s.timer = 10 + Math.random() * 16
      }
      return
    }
    const dx = tgt[0] - s.x
    const dz = tgt[1] - s.z
    const d = Math.hypot(dx, dz)
    const step = 1.2 * dt
    // The home leg (center ↔ door) passes through the own dwelling.
    const throughDoor = s.mode === 'go' ? s.seg === 0 : s.seg === route.length - 2
    if (d <= step + (throughDoor ? 0.08 : 0.3)) {
      s.seg++
    } else if (throughDoor) {
      s.x += (dx / d) * step
      s.z += (dz / d) * step
      s.yaw = Math.atan2(dx, dz)
    } else {
      const [nx, nz] = resolveMove(colliders, s.x + (dx / d) * step, s.z + (dz / d) * step, NPC_RADIUS)
      if (Math.hypot(nx - s.x, nz - s.z) < step * 0.25) s.seg++ // blocked: skip ahead
      s.x = nx
      s.z = nz
      s.yaw = Math.atan2(dx, dz)
    }
    stand.position.set(s.x, 0, s.z)
    stand.rotation.y = s.yaw
  })

  return (
    <>
      <group ref={standing} visible={false}>
        <Figure cloth={cloth} />
        {carry === 'bundle' ? (
          <mesh position={[0, 1.42, 0]} castShadow>
            <boxGeometry args={[0.38, 0.22, 0.3]} />
            <meshStandardMaterial color="#a3702e" roughness={0.95} />
          </mesh>
        ) : (
          <mesh position={[0, 1.5, 0]} castShadow>
            <cylinderGeometry args={[0.12, 0.16, 0.32, 8]} />
            <meshStandardMaterial color="#8a5a30" roughness={0.9} />
          </mesh>
        )}
      </group>
      <group ref={kneeling} visible={false}>
        <Figure cloth={cloth} kneel />
      </group>
    </>
  )
}

export interface HomeDef {
  x: number
  z: number
  door: [number, number]
}

export interface PenDef {
  x: number
  z: number
  r: number
}

interface WalkerState {
  mode: 'inside' | 'walk'
  route: Array<[number, number]>
  seg: number
  pause: number
  timer: number
  x: number
  z: number
  yaw: number
  /** Seconds of blocked movement; skips the waypoint when it grows. */
  stuck: number
}

/**
 * Inhabitants with a simple daily routine (design.md §2 lively settlements):
 * they step out of their dwelling through its entrance door, walk the paths
 * to an errand point, linger, walk back, press against the door and slip
 * inside, where they stay until the next outing. On the two door segments
 * (home center ↔ door) collision is skipped — the door is the one deliberate
 * opening in the otherwise impenetrable building (design.md §2).
 */
function Walkers({
  seed,
  homes,
  errands,
  cloth,
  count,
  colliders,
}: {
  seed: number
  homes: HomeDef[]
  errands: Array<[number, number]>
  cloth: string[]
  count: number
  colliders: Collider[]
}) {
  const defs = useMemo(() => {
    const rand = mulberry32((seed + 60601) >>> 0)
    const n = Math.min(count, homes.length)
    return Array.from({ length: n }, (_, i) => ({
      home: homes[Math.floor(rand() * homes.length)],
      cloth: cloth[i % cloth.length],
      speed: 1.05 + rand() * 0.5,
      startDelay: 1 + rand() * 9,
      carries: rand() < 0.4,
    }))
  }, [seed, homes, cloth, count])

  const states = useRef<WalkerState[]>([])
  if (states.current.length !== defs.length) {
    states.current = defs.map((d) => ({
      mode: 'inside' as const,
      route: [],
      seg: 0,
      pause: 0,
      timer: d.startDelay,
      x: d.home.x,
      z: d.home.z,
      yaw: 0,
      stuck: 0,
    }))
  }
  const refs = useRef<Array<THREE.Group | null>>([])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeWalkers = { states: states.current, homes: defs.map((d) => d.home) }
    return () => {
      delete w.__placeWalkers
    }
  }, [defs])

  useFrame(({ clock }, rawDt) => {
    const dt = Math.min(rawDt, 0.1)
    const t = clock.elapsedTime
    defs.forEach((def, i) => {
      const s = states.current[i]
      const g = refs.current[i]
      if (!s || !g) return

      if (s.mode === 'inside') {
        // Invisible while at home; step out through the door when done.
        g.visible = false
        s.timer -= dt
        if (s.timer <= 0) {
          const e = errands.length > 0 ? errands[Math.floor(Math.random() * errands.length)] : ([0, 2] as [number, number])
          // Route via a plaza-side midpoint, so walkers follow the lanes.
          const mid: [number, number] = [e[0] * 0.4 + (Math.random() - 0.5) * 2.5, e[1] * 0.4 + 1 + (Math.random() - 0.5) * 2.5]
          // Start and end inside the dwelling: out through the door, back
          // in through the door (design.md §2).
          const inside: [number, number] = [def.home.x, def.home.z]
          s.route = [inside, def.home.door, mid, [e[0], e[1]], mid, def.home.door, inside]
          s.seg = 0
          s.pause = 0
          s.x = inside[0]
          s.z = inside[1]
          s.mode = 'walk'
        }
        return
      }

      g.visible = true
      if (s.pause > 0) {
        // Linger at the errand: slight idle sway, no bob.
        s.pause -= dt
        g.position.set(s.x, 0, s.z)
        g.rotation.y = s.yaw + Math.sin(t * 0.6 + i) * 0.35
        return
      }

      const target = s.route[s.seg + 1]
      if (!target) {
        // Fully inside the dwelling: disappear until the next outing.
        s.mode = 'inside'
        s.timer = 7 + Math.random() * 14
        return
      }
      const dx = target[0] - s.x
      const dz = target[1] - s.z
      const d = Math.hypot(dx, dz)
      const step = def.speed * dt
      // Door segments (home center ↔ door) pass through the own dwelling:
      // no collision there, the walker slips through the entrance door.
      const throughDoor = s.seg === 0 || s.seg === s.route.length - 2
      if (d <= step + (throughDoor ? 0.08 : 0.35)) {
        // Close enough (the exact point may sit inside a collider).
        s.seg++
        s.stuck = 0
        if (s.seg === 3) s.pause = 2.5 + Math.random() * 4 // linger at the errand
      } else if (throughDoor) {
        s.x += (dx / d) * step
        s.z += (dz / d) * step
        s.yaw = Math.atan2(dx, dz)
      } else {
        // Solid objects block inhabitants too; slide along and skip the
        // waypoint if blocked for too long (design.md §2 collision).
        const [nx, nz] = resolveMove(colliders, s.x + (dx / d) * step, s.z + (dz / d) * step, NPC_RADIUS)
        const moved = Math.hypot(nx - s.x, nz - s.z)
        s.x = nx
        s.z = nz
        s.yaw = Math.atan2(dx, dz)
        if (moved < step * 0.3) {
          s.stuck += dt
          if (s.stuck > 1.4) {
            s.seg++
            s.stuck = 0
          }
        } else {
          s.stuck = 0
        }
      }
      g.position.set(s.x, Math.abs(Math.sin(t * 6.5 + i * 2)) * 0.05, s.z)
      g.rotation.y = s.yaw
    })
  })

  return (
    <>
      {defs.map((def, i) => (
        <group
          key={i}
          visible={false}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Figure cloth={def.cloth} />
          {/* Some carry a basket or bundle on the head */}
          {def.carries && (
            <mesh position={[0, 1.42, 0]} castShadow>
              <cylinderGeometry args={[0.22, 0.16, 0.18, 8]} />
              <meshStandardMaterial color="#a3702e" roughness={0.95} />
            </mesh>
          )}
        </group>
      ))}
    </>
  )
}

/** Standing traders on the plaza that slowly look around. */
function Traders({ seed, cloth }: { seed: number; cloth: string[] }) {
  const spots = useMemo(() => {
    const rand = mulberry32((seed + 913) >>> 0)
    return [
      { x: 3 + rand() * 2, z: -4 - rand() * 2, phase: rand() * Math.PI * 2 },
      { x: -4 - rand() * 2, z: -2 - rand() * 2, phase: rand() * Math.PI * 2 },
    ]
  }, [seed])
  const refs = useRef<Array<THREE.Group | null>>([])
  useFrame(({ clock }) => {
    const t = clock.elapsedTime
    refs.current.forEach((g, i) => {
      const s = spots[i]
      if (!g || !s) return
      g.rotation.y = Math.sin(t * 0.4 + s.phase) * 0.8
    })
  })
  return (
    <>
      {spots.map((s, i) => (
        <group
          key={i}
          position={[s.x, 0, s.z]}
          ref={(el) => {
            refs.current[i] = el
          }}
        >
          <Figure cloth={cloth[(i + 1) % cloth.length]} />
        </group>
      ))}
    </>
  )
}

export function PlaceLife({
  kind,
  size = 1,
  seed,
  placeId,
  style,
  buildings,
  firePos,
  homes,
  errands,
  pen,
  colliders,
}: {
  kind: 'port' | 'village'
  /** Settlement size (design.md §4.1): big cities show more bustle. */
  size?: number
  seed: number
  placeId: string
  style: RegionPlaceStyle
  buildings: Array<[number, number]>
  firePos: [number, number]
  homes: HomeDef[]
  errands: Array<[number, number]>
  pen: PenDef | null
  colliders: Collider[]
}) {
  let hash = 0
  for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
  const localSeed = (seed ^ hash) >>> 0

  if (kind === 'port') {
    return (
      <>
        <Porters seed={localSeed} stops={buildings} cloth={style.cloth} colliders={colliders} count={1 + size} />
        <Traders seed={localSeed} cloth={style.cloth} />
        <Talkers x={PORT_TALKERS[0]} z={PORT_TALKERS[1]} cloth={style.cloth} />
        <Walkers seed={localSeed} homes={homes} errands={errands} cloth={style.cloth} count={2 + size * 2} colliders={colliders} />
      </>
    )
  }
  return (
    <>
      <Cook x={firePos[0] + 1.2} z={firePos[1] + 1.0} cloth={style.cloth[0]} />
      <Weaver x={-8.5} z={-7} cloth={style.cloth[1 % style.cloth.length]} weave={style.bandColor} />
      <Kids x={7} z={7.5} cloth={style.cloth} colliders={colliders} />
      <Goats seed={localSeed} count={pen ? 4 : 3} pen={pen} colliders={colliders} />
      <Walkers seed={localSeed} homes={homes} errands={errands} cloth={style.cloth} count={5} colliders={colliders} />
      {/* Inhabitant/prop interactions (design.md §19). */}
      <FireTender x={firePos[0] - 1.3} z={firePos[1] - 0.7} cloth={style.cloth[2 % style.cloth.length]} />
      <Talkers x={VILLAGE_SPOTS.talkers[0]} z={VILLAGE_SPOTS.talkers[1]} cloth={style.cloth} />
      <Pounder x={VILLAGE_SPOTS.pounder[0]} z={VILLAGE_SPOTS.pounder[1]} cloth={style.cloth[0]} />
      <Drummer x={VILLAGE_SPOTS.drummer[0]} z={VILLAGE_SPOTS.drummer[1]} cloth={style.cloth[1 % style.cloth.length]} />
      <Well x={VILLAGE_SPOTS.well[0]} z={VILLAGE_SPOTS.well[1]} />
      {homes.length > 0 && (
        <TaskWalker
          home={homes[0]}
          target={[firePos[0] + 0.7, firePos[1] + 1.8]}
          cloth={style.cloth[0]}
          carry="bundle"
          colliders={colliders}
          startDelay={4}
        />
      )}
      {homes.length > 1 && (
        <TaskWalker
          home={homes[1]}
          target={[VILLAGE_SPOTS.well[0] - 1.1, VILLAGE_SPOTS.well[1]]}
          cloth={style.cloth[1 % style.cloth.length]}
          carry="jar"
          colliders={colliders}
          startDelay={9}
        />
      )}
    </>
  )
}
