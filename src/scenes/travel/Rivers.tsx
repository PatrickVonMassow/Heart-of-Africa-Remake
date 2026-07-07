// River and lake surfaces for the travel view (design.md §2/§11): the water
// follows the terrain's height profile. Rivers are ribbon meshes laid into
// the carved beds with monotonically descending surface heights, a calm
// surface (no wave field), edge foam and a visible downstream current that
// speeds up at rapids; the five waterfall landmarks get white cascades with
// plunge-pool foam, and rivers rising in open land get a spring marker.
// Lakes are flat polygon surfaces at their local shore height.

import { useEffect, useMemo } from 'react'
import * as THREE from 'three/webgpu'
import {
  attribute,
  color,
  float,
  max,
  min,
  mix,
  mx_fractal_noise_float,
  positionLocal,
  smoothstep,
  time,
  uv,
  vec3,
} from 'three/tsl'
import { useGame } from '../../state/store'
import { latLonToWorld } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { lakeContains } from '../../world/hydro'
import { RIVERS_DATA } from '../../world/data/rivers'
import { LAKES } from '../../world/data/lakes'
import { WATERFALLS } from '../../world/data/landmarks'

const STEP_DEG = 0.08 // sampling step along a river (0.8 world units)
const HALF_WIDTH = 1.35 // ribbon half width in world units
const SURFACE_LIFT = 0.3 // water surface above the carved bed centerline

interface FallDef {
  x: number
  z: number
  yTop: number
  yBottom: number
  yaw: number
}

interface SpringDef {
  x: number
  z: number
  y: number
}

/** Densified river centerlines with world positions and arc lengths. */
function densifyRiver(points: Array<[number, number]>): Array<{ lat: number; lon: number }> {
  const out: Array<{ lat: number; lon: number }> = []
  for (let s = 0; s < points.length - 1; s++) {
    const [lon0, lat0] = points[s]
    const [lon1, lat1] = points[s + 1]
    const steps = Math.max(1, Math.round(Math.hypot(lon1 - lon0, lat1 - lat0) / STEP_DEG))
    for (let i = 0; i < steps; i++) {
      out.push({ lat: lat0 + ((lat1 - lat0) * i) / steps, lon: lon0 + ((lon1 - lon0) * i) / steps })
    }
  }
  out.push({ lat: points[points.length - 1][1], lon: points[points.length - 1][0] })
  return out
}

function buildRivers(seed: number): {
  geometry: THREE.BufferGeometry
  falls: FallDef[]
  springs: SpringDef[]
} {
  const positions: number[] = []
  const uvs: number[] = []
  const flows: number[] = []
  const indices: number[] = []
  const falls: FallDef[] = []
  const springs: SpringDef[] = []

  for (const river of RIVERS_DATA) {
    const pts = densifyRiver(river.points)
    const world = pts.map((p) => latLonToWorld(p.lat, p.lon))
    const samples = pts.map((p) => sampleTerrain(p.lat, p.lon, seed))

    // Monotonically descending surface: water never flows uphill.
    const surf: number[] = []
    let level = Infinity
    for (let i = 0; i < pts.length; i++) {
      level = Math.min(level, samples[i].height + SURFACE_LIFT)
      surf.push(Math.max(-0.05, level))
    }

    // Flow speed: base current plus local slope; boosted near the river's
    // waterfall landmarks (visibly faster water, design.md §11).
    const riverFalls = WATERFALLS.filter((w) => w.river === river.id)
    const flowAt = (i: number): number => {
      const prev = surf[Math.max(0, i - 2)]
      const next = surf[Math.min(surf.length - 1, i + 2)]
      let f = 1 + Math.min(2.2, Math.max(0, prev - next) * 2.2)
      for (const w of riverFalls) {
        const fw = latLonToWorld(w.lat, w.lon)
        if (Math.hypot(world[i].x - fw.x, world[i].z - fw.z) < 2.2) f += 2
      }
      return f
    }

    // Waterfall cascades at the landmark positions.
    for (const w of riverFalls) {
      const fw = latLonToWorld(w.lat, w.lon)
      let best = 0
      let bestD = Infinity
      for (let i = 0; i < world.length; i++) {
        const d = Math.hypot(world[i].x - fw.x, world[i].z - fw.z)
        if (d < bestD) {
          bestD = d
          best = i
        }
      }
      const up = Math.max(0, best - 3)
      const down = Math.min(world.length - 1, best + 3)
      falls.push({
        x: world[best].x,
        z: world[best].z,
        yTop: surf[up],
        yBottom: surf[down],
        yaw: Math.atan2(world[down].x - world[up].x, world[down].z - world[up].z),
      })
    }

    // Spring at the source when the river rises in open land (not at a
    // lake outlet or a confluence with another river).
    const src = pts[0]
    const nearOtherRiver = RIVERS_DATA.some(
      (o) =>
        o.id !== river.id &&
        o.points.some(([lon, lat]) => Math.hypot(lon - src.lon, lat - src.lat) < 0.3),
    )
    if (!nearOtherRiver && !lakeContains(src.lat, src.lon)) {
      springs.push({ x: world[0].x, z: world[0].z, y: surf[0] + 0.06 })
    }

    // Ribbon strip; broken where the river runs into the sea.
    let stripStart = -1
    let arc = 0
    for (let i = 0; i < world.length; i++) {
      if (i > 0) arc += Math.hypot(world[i].x - world[i - 1].x, world[i].z - world[i - 1].z)
      if (samples[i].type === 'ocean') {
        stripStart = -1
        continue
      }
      const a = world[Math.max(0, i - 1)]
      const b = world[Math.min(world.length - 1, i + 1)]
      let px = -(b.z - a.z)
      let pz = b.x - a.x
      const inv = HALF_WIDTH / (Math.hypot(px, pz) || 1)
      px *= inv
      pz *= inv
      const vi = positions.length / 3
      positions.push(world[i].x - px, surf[i], world[i].z - pz, world[i].x + px, surf[i], world[i].z + pz)
      uvs.push(arc, 0, arc, 1)
      const f = flowAt(i)
      flows.push(f, f)
      if (stripStart >= 0) indices.push(vi - 2, vi, vi - 1, vi - 1, vi, vi + 1)
      stripStart = i
    }
  }

  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3))
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2))
  geometry.setAttribute('flow', new THREE.BufferAttribute(new Float32Array(flows), 1))
  geometry.setIndex(indices)
  return { geometry, falls, springs }
}

/**
 * River surface material: calm water (only a slight surface shimmer), a
 * visible downstream current from streak noise scrolling along the arc
 * coordinate, foam along the banks and white water where the flow attribute
 * rises (rapids, waterfalls).
 */
function createRiverMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial()
  m.transparent = true
  m.roughness = 0.14
  m.metalness = 0.02
  m.side = THREE.DoubleSide

  const u = uv().x
  const v = uv().y
  // Cast: the TSL typings do not carry the attribute's float type through.
  const flow = attribute('flow', 'float') as unknown as ReturnType<typeof float>


  // Streaks elongated along the flow, scrolling downstream with the current.
  const streak = mx_fractal_noise_float(
    vec3(u.mul(0.55).sub(time.mul(flow).mul(0.5)), v.mul(4.5), 1.0),
    3,
  )
    .mul(0.5)
    .add(0.5)

  const base = mix(color('#2c6285'), color('#4189a4'), streak.mul(0.45))
  const edgeD = min(v, v.oneMinus())
  const bankFoam = smoothstep(float(0.14), float(0.02), edgeD).mul(smoothstep(float(0.35), float(0.7), streak))
  const rapidFoam = smoothstep(float(1.7), float(3.0), flow).mul(smoothstep(float(0.3), float(0.62), streak))
  const foam = max(bankFoam, rapidFoam)
  m.colorNode = mix(base, color('#eef6f7'), foam.mul(0.9))

  // Only slight movement on the surface (design.md §11): a tiny ripple, no
  // wave field.
  const ripple = mx_fractal_noise_float(vec3(u.mul(1.3).sub(time.mul(flow).mul(0.45)), v.mul(3), time.mul(0.1)), 2)
  m.positionNode = positionLocal.add(vec3(0, ripple.mul(0.035), 0))

  m.opacityNode = float(0.9)
  m.roughnessNode = foam.mul(0.6).add(0.12)
  return m
}

/** Calm lake surface: soft ripple, sky gloss, no current. */
function createLakeMaterial(): THREE.MeshStandardNodeMaterial {
  const m = new THREE.MeshStandardNodeMaterial()
  m.transparent = true
  m.roughness = 0.1
  m.metalness = 0.02
  const wp = positionLocal.xz
  const ripple = mx_fractal_noise_float(vec3(wp.mul(0.3), time.mul(0.08)), 3).mul(0.5).add(0.5)
  m.colorNode = mix(color('#25607f'), color('#3f8fa8'), ripple.mul(0.4))
  m.opacityNode = float(0.92)
  return m
}

/** Flat lake polygon at its local shore height (design.md §2 water). */
function buildLakeSurfaces(seed: number): Array<{ geometry: THREE.BufferGeometry; y: number }> {
  return LAKES.map((lake) => {
    const shape = new THREE.Shape()
    lake.points.forEach(([lon, lat], i) => {
      const w = latLonToWorld(lat, lon)
      if (i === 0) shape.moveTo(w.x, -w.z)
      else shape.lineTo(w.x, -w.z)
    })
    let y = Infinity
    for (const [lon, lat] of lake.points) {
      y = Math.min(y, sampleTerrain(lat, lon, seed).height)
    }
    const geometry = new THREE.ShapeGeometry(shape)
    geometry.rotateX(-Math.PI / 2)
    return { geometry, y: Math.max(-0.05, y - 0.1) }
  })
}

/** White cascade with plunge-pool foam at a waterfall landmark (§4.4). */
function Waterfall({ fall }: { fall: FallDef }) {
  const drop = Math.max(0.8, fall.yTop - fall.yBottom)
  return (
    <group position={[fall.x, 0, fall.z]} rotation={[0, fall.yaw, 0]}>
      {/* Cascade sheet leaning down the flow direction */}
      <mesh position={[0, fall.yBottom + drop / 2, 0]} rotation={[0.22, 0, 0]}>
        <planeGeometry args={[2.4, drop + 0.4]} />
        <meshStandardMaterial color="#f2f9fb" transparent opacity={0.85} roughness={0.4} side={THREE.DoubleSide} />
      </mesh>
      {/* Plunge-pool foam */}
      <mesh position={[0, fall.yBottom + 0.06, 1.1]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[1.5, 18]} />
        <meshStandardMaterial color="#e8f4f6" transparent opacity={0.75} roughness={0.6} />
      </mesh>
      {/* Rising mist */}
      <mesh position={[0, fall.yBottom + drop * 0.45, 0.9]}>
        <sphereGeometry args={[0.9, 8, 6]} />
        <meshStandardMaterial color="#f4fafc" transparent opacity={0.22} roughness={1} depthWrite={false} />
      </mesh>
    </group>
  )
}

/** Spring: a small pool ring where a river rises in open land. */
function Spring({ spring }: { spring: SpringDef }) {
  return (
    <group position={[spring.x, spring.y, spring.z]}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.35, 0.7, 14]} />
        <meshStandardMaterial color="#dff0f2" transparent opacity={0.8} roughness={0.5} side={THREE.DoubleSide} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]}>
        <circleGeometry args={[0.4, 12]} />
        <meshStandardMaterial color="#2c6285" transparent opacity={0.9} roughness={0.2} />
      </mesh>
    </group>
  )
}

export function RiversAndLakes() {
  const seed = useGame((s) => s.seed)
  const { geometry, falls, springs } = useMemo(() => buildRivers(seed), [seed])
  const lakes = useMemo(() => buildLakeSurfaces(seed), [seed])
  const riverMat = useMemo(() => createRiverMaterial(), [])
  const lakeMat = useMemo(() => createLakeMaterial(), [])

  // Dev hook for the headless verification (CLAUDE.md §7.2).
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__rivers = { falls: falls.length, springs: springs.length, lakes: lakes.length }
    return () => {
      delete w.__rivers
    }
  }, [falls, springs, lakes])

  return (
    <>
      <mesh geometry={geometry} material={riverMat} renderOrder={1} />
      {lakes.map((l, i) => (
        <mesh key={i} geometry={l.geometry} material={lakeMat} position={[0, l.y, 0]} renderOrder={1} />
      ))}
      {falls.map((f, i) => (
        <Waterfall key={i} fall={f} />
      ))}
      {springs.map((s, i) => (
        <Spring key={i} spring={s} />
      ))}
    </>
  )
}
