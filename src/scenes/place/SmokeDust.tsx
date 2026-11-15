// Smoke over the village fire and dust under a walker's feet (design.md §19.10):
// a handful of soft camera-facing billboards each, the grass fire's smoke-puff
// pattern (src/scenes/travel/grassFireMaterials.ts). The shape rules are pure
// (smokeDust.ts); this file only draws them. Materials and geometry are MODULE
// singletons (point 96): a fresh material per mount would relink the programs.

import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three/webgpu'
import { attribute, float, hash, instanceIndex, mix, mx_fractal_noise_float, smoothstep, time, uniform, uv, vec2, vec3 } from 'three/tsl'
import { balance } from '../../config/balance'
import { DETAIL_LEVELS, QUALITY_PRESETS } from '../../config/quality'
import { shelteredGroundWetnessAt } from '../../render/shelterWetness'
import { useUi, effectiveFireSmokePuffs, effectiveWalkerDustPuffs } from '../../state/ui'
import { rainAmount } from '../../systems/season'
import { shelteredFireRainFactor } from '../../systems/cookShelter'
import { usePlaceGround } from './PlaceGroundContext'
import { isLifeFrozen } from './lifeFreeze'
import { dustPuff, dustRises, plumeAge, plumePuff } from './smokeDust'
import { dustSources, type DustFoot } from './dustFeet'

type FloatNode = ReturnType<typeof float>

const SMOKE_MAX = Math.max(...DETAIL_LEVELS.map((l) => QUALITY_PRESETS[l].fireSmokePuffs))
const DUST_MAX = Math.max(...DETAIL_LEVELS.map((l) => QUALITY_PRESETS[l].walkerDustPuffs))

/** Height (m above the pit) the column leaves the flame from. */
const SMOKE_BASE_Y = 0.6

/** Peak opacity, driven per frame from balance so a debug edit lands live. */
const SMOKE_OPACITY_U = uniform(0)
const DUST_OPACITY_U = uniform(0)

function puffGeometry(capacity: number): { geo: THREE.PlaneGeometry; fade: THREE.InstancedBufferAttribute } {
  const geo = new THREE.PlaneGeometry(1, 1)
  const fade = new THREE.InstancedBufferAttribute(new Float32Array(capacity), 1)
  fade.setUsage(THREE.DynamicDrawUsage)
  geo.setAttribute('puffFade', fade)
  return { geo, fade }
}

/** A soft round puff with a slowly churning noise edge; `core`→`rim` colour. */
function softPuffMaterial(core: THREE.Color, rim: THREE.Color, peak: typeof SMOKE_OPACITY_U, churn: number): THREE.MeshBasicNodeMaterial {
  const m = new THREE.MeshBasicNodeMaterial()
  m.transparent = true
  m.depthWrite = false
  m.side = THREE.DoubleSide
  const seed = hash(instanceIndex.toFloat().mul(4.77).add(2.1)).mul(30) as unknown as FloatNode
  const p = uv()
  const d = p.sub(vec2(0.5, 0.5)).length().mul(2)
  const n = mx_fractal_noise_float(vec3(p.mul(2.2).add(seed), time.mul(churn)), 2) as unknown as FloatNode
  const puff = float(1).sub(smoothstep(float(0.2), float(1.0), d.add(n.mul(0.25))))
  const fade = attribute('puffFade', 'float') as unknown as FloatNode
  m.colorNode = mix(vec3(core.r, core.g, core.b), vec3(rim.r, rim.g, rim.b), d)
  m.opacityNode = puff.mul(n.mul(0.25).add(0.75)).mul(fade).mul(peak).clamp(0, 1)
  return m
}

const smoke = puffGeometry(SMOKE_MAX)
const dust = puffGeometry(DUST_MAX)
// Wood smoke: a cool pale grey, a touch darker in its core.
const smokeMat = softPuffMaterial(new THREE.Color(0.44, 0.44, 0.46), new THREE.Color(0.66, 0.66, 0.68), SMOKE_OPACITY_U, 0.15)
// Dry-earth dust: a warm, light tan.
const dustMat = softPuffMaterial(new THREE.Color(0.6, 0.5, 0.37), new THREE.Color(0.74, 0.64, 0.5), DUST_OPACITY_U, 0.6)

/**
 * The thin smoke column over the village fire, inside the FirePit group (local
 * origin = the pit). It follows the SAME rain factor as the flame: thinner and
 * shorter under rain, gone when the yard fire is out (`out`).
 */
export function FireSmoke({ rainRef, sheltered, out }: { rainRef: MutableRefObject<number>; sheltered: boolean; out: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null)
  const puffs = useUi(effectiveFireSmokePuffs)
  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const scl = useMemo(() => new THREE.Vector3(), [])
  const parentQ = useMemo(() => new THREE.Quaternion(), [])
  const q = useMemo(() => new THREE.Quaternion(), [])
  useFrame(({ camera, clock }) => {
    const m = mesh.current
    if (!m) return
    const t = balance.fireSmoke
    SMOKE_OPACITY_U.value = Math.min(1, Math.max(0, t.opacity))
    const weather = out ? 0 : shelteredFireRainFactor(rainAmount(rainRef.current, balance.season.weatherStrength), sheltered)
    const n = Math.min(SMOKE_MAX, Math.max(0, puffs))
    m.visible = weather > 0 && n > 0
    if (!m.visible) return
    // Billboards face the camera in world space; undo the pit group's rotation.
    m.parent?.getWorldQuaternion(parentQ)
    q.copy(parentQ).invert().multiply(camera.quaternion)
    const shape = { ...t, opacity: 1 }
    for (let i = 0; i < n; i++) {
      const p = plumePuff(plumeAge(i, n, clock.elapsedTime, t.life), weather, shape)
      pos.set(p.x, SMOKE_BASE_Y + p.y, p.z)
      scl.set(p.size, p.size, 1)
      mtx.compose(pos, q, scl)
      m.setMatrixAt(i, mtx)
      smoke.fade.setX(i, p.opacity)
    }
    m.count = n
    m.instanceMatrix.needsUpdate = true
    smoke.fade.needsUpdate = true
  })
  return <instancedMesh ref={mesh} name="village-fire-smoke" args={[smoke.geo, smokeMat, SMOKE_MAX]} frustumCulled={false} renderOrder={2} />
}

interface DustPuffState {
  x: number
  y: number
  z: number
  age: number
}

/**
 * The dust puffs walkers kick up: one every `spacing` metres walked, at the
 * foot, only where the ground there is dry (the season's ground wetness shaped
 * by the shelter mask, so a roofed patch may stay dusty in the rain).
 */
export function WalkerDust() {
  const groundHeight = usePlaceGround()
  const mesh = useRef<THREE.InstancedMesh>(null)
  const pool = useUi(effectiveWalkerDustPuffs)
  const puffs = useRef<DustPuffState[]>([])
  const next = useRef(0)
  const walked = useRef(new WeakMap<DustFoot, { x: number; z: number; d: number }>())
  const stats = useRef({ spawned: 0, suppressed: 0 })
  const mtx = useMemo(() => new THREE.Matrix4(), [])
  const pos = useMemo(() => new THREE.Vector3(), [])
  const scl = useMemo(() => new THREE.Vector3(), [])

  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    w.__placeDust = () => ({
      ...stats.current,
      puffs: puffs.current.filter((p) => p.age < 1).map((p) => ({ x: p.x, y: p.y, z: p.z, age: p.age })),
    })
    return () => {
      delete w.__placeDust
    }
  }, [])

  useFrame(({ camera }, rawDt) => {
    const m = mesh.current
    if (!m) return
    const t = balance.walkerDust
    DUST_OPACITY_U.value = Math.min(1, Math.max(0, t.opacity))
    const cap = Math.min(DUST_MAX, Math.max(0, pool))
    if (puffs.current.length > cap) puffs.current.length = cap
    if (!isLifeFrozen()) {
      const dt = Math.min(rawDt, 0.1)
      for (const p of puffs.current) p.age += dt / Math.max(0.05, t.life)
      for (const read of dustSources) {
        for (const f of read()) {
          const prev = walked.current.get(f)
          const walking = f.mode === 'walk' && f.pause <= 0
          if (!prev || !walking) {
            walked.current.set(f, { x: f.x, z: f.z, d: 0 })
            continue
          }
          const step = Math.hypot(f.x - prev.x, f.z - prev.z)
          prev.x = f.x
          prev.z = f.z
          // A jump (a nudge to free ground) is no stride.
          prev.d = step > 2 ? 0 : prev.d + step
          if (prev.d < Math.max(0.1, t.spacing)) continue
          prev.d = 0
          if (cap === 0) continue
          if (!dustRises(shelteredGroundWetnessAt(f.x, f.z), t)) {
            stats.current.suppressed++
            continue
          }
          const puff = { x: f.x, y: groundHeight(f.x, f.z), z: f.z, age: 0 }
          if (puffs.current.length < cap) puffs.current.push(puff)
          else puffs.current[next.current % cap] = puff
          next.current = (next.current + 1) % Math.max(1, cap)
          stats.current.spawned++
        }
      }
    }
    let n = 0
    for (const p of puffs.current) {
      if (p.age >= 1) continue
      const d = dustPuff(p.age, { ...t, opacity: 1 })
      pos.set(p.x, p.y + d.size * 0.4 + d.lift, p.z)
      scl.set(d.size, d.size, 1)
      mtx.compose(pos, camera.quaternion, scl)
      m.setMatrixAt(n, mtx)
      dust.fade.setX(n, d.opacity)
      n++
    }
    m.visible = n > 0
    m.count = n
    m.instanceMatrix.needsUpdate = true
    dust.fade.needsUpdate = true
  })
  return <instancedMesh ref={mesh} name="walker-dust" args={[dust.geo, dustMat, DUST_MAX]} frustumCulled={false} renderOrder={2} />
}
