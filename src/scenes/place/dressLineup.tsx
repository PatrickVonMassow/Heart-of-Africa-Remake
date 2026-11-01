// DEV-ONLY staging for the picture evidence of the villager dress (work-order
// "villager dress"), like the small herd staged beside the player for the
// animal models (1284): `window.__dressLineup({x, z, yaw})` stands one villager
// of every sex and age group in a row at that spot, drawn through the real
// `Figure` with this settlement's look; `only` (e.g. ['male-youth', 'male-elder'])
// stands just those; `window.__dressLineup(null)` clears it.
//
// Forced figures (garment rebuild, "Picture acceptance"): `figures` replaces
// the row by explicit ones (dressLineupSpec.ts) — sex, age, build, the whole
// outfit as (form, wear) pairs, and a clip. A walk or run starts `lead` metres
// (default: two seconds of its pace) behind its place in the row and walks
// through it; `at` freezes life (`__placeFreezeLife`) the frame the first
// figure carrying it reaches that clip time, once its clip is fully in.
// `window.__dressLineup.state()` reads where every figure is and whether the
// lineup froze. Nothing renders in a production build.

import { useContext, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three/webgpu'
import { CHILD_FIGURE_SCALE } from '../../render/figures'
import { REST_POSE, type FigurePose } from '../../render/gesture'
import { stanceOf } from '../../render/villagerClipPose'
import type { VillagerAsset } from '../../render/villagerAsset'
import type { AgeGroup, Sex } from '../../systems/appearance'
import { crossedPhase, LINEUP_CLIP_SPEED, midSwing, resolveOutfit, type LineupAt, type LineupClip, type LineupFigure } from './dressLineupSpec'
import { isLifeFrozen } from './lifeFreeze'
import { usePlaceGround } from './PlaceGroundContext'
import { FigureLookContext, type FigureWork } from './placeFigureContext'
import { Figure } from './placeFigure'

/** Left to right: children, the young, the married, the old — women first. */
const LINEUP: ReadonlyArray<{ sex: Sex; age: AgeGroup }> = [
  { sex: 'female', age: 'child' },
  { sex: 'male', age: 'child' },
  { sex: 'female', age: 'youth' },
  { sex: 'male', age: 'youth' },
  { sex: 'female', age: 'adult' },
  { sex: 'male', age: 'adult' },
  { sex: 'female', age: 'elder' },
  { sex: 'male', age: 'elder' },
]
const SPACING = 0.9
/** Seconds a moving figure walks before its clip time may freeze it. */
const WARM_SECONDS = 2

interface Spot {
  x: number
  z: number
  yaw: number
  only?: string[]
  figures?: LineupFigure[]
  lead?: number
}

interface Clock {
  gait: number
  idle: number
  dig: number
  weight: number
  speed: number
}

/** The clip phase `at` names, on this asset's clips. */
function targetPhase(asset: VillagerAsset | null, clip: LineupClip, at: LineupAt): number | null {
  if (typeof at === 'number') return at
  const c = asset?.clips[clip === 'run' ? 'jog' : clip]
  if (!c) return null
  if (typeof at === 'object') return c.duration > 0 ? (c.times[Math.min(at.frame, c.times.length - 1)] ?? 0) / c.duration : 0
  return midSwing(stanceOf(c, at === 'cross-L' ? 'L' : 'R'))
}

function clockOf(g: THREE.Object3D | null): Clock | null {
  let hit: Clock | null = null
  g?.traverse((o) => {
    if (!hit && o.userData.clipClock) hit = o.userData.clipClock as Clock
  })
  return hit
}

export function DressLineup({ cloth }: { cloth: readonly string[] }) {
  const [at, setAt] = useState<Spot | null>(null)
  const [gen, setGen] = useState(0)
  const groundHeight = usePlaceGround()
  const look = useContext(FigureLookContext)
  const groups = useRef<Array<THREE.Group | null>>([])
  const run = useRef({ elapsed: 0, frozen: false, held: null as null | { index: number; phase: number }, prev: [] as number[], walked: [] as number[] })
  useEffect(() => {
    if (!import.meta.env.DEV) return
    const w = window as unknown as Record<string, unknown>
    const set = (spot: Spot | null) => {
      const r = run.current
      if (r.frozen) (w.__placeFreezeLife as ((on: boolean) => void) | undefined)?.(false)
      run.current = { elapsed: 0, frozen: false, held: null, prev: [], walked: [] }
      setAt(spot)
      setGen((n) => n + 1)
    }
    set.state = () => ({
      frozen: run.current.frozen,
      held: run.current.held,
      figures: groups.current.map((g) => {
        if (!g) return null
        // the figure's own meshes: a sight line ending on one of them sees it
        const meshes: string[] = []
        g.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) meshes.push(o.uuid)
        })
        return { x: g.position.x, y: g.position.y, z: g.position.z, clock: clockOf(g), meshes }
      }),
    })
    w.__dressLineup = set
    return () => {
      delete w.__dressLineup
    }
  }, [])

  // The row: each figure's sex, age, scale, outfit, clip and track.
  const row = useMemo(() => {
    if (!at) return []
    const people = at.figures ?? LINEUP.filter((c) => !at.only || at.only.includes(`${c.sex}-${c.age}`))
    const right = [Math.cos(at.yaw), -Math.sin(at.yaw)]
    const ahead = [Math.sin(at.yaw), Math.cos(at.yaw)]
    return people.map((c, i, all) => {
      const f = c as Partial<LineupFigure> & { sex: Sex; age: AgeGroup }
      const off = (i - (all.length - 1) / 2) * SPACING
      const scale = f.age === 'child' ? CHILD_FIGURE_SCALE : 1
      const clip = f.clip ?? 'idle'
      const speed = LINEUP_CLIP_SPEED[clip] * scale
      const lead = speed > 0 ? (at.lead ?? speed * WARM_SECONDS) : 0
      const fc = cloth[i % cloth.length]
      const asset = look?.villager ?? null
      const phase = f.at !== undefined ? targetPhase(asset, clip, f.at) : null
      const dig = asset?.clips.dig
      const work: RefObject<FigureWork> | undefined =
        clip === 'dig' ? { current: { dig: true, tool: true, digT: phase !== null && dig ? phase * dig.duration : undefined } } : undefined
      const pose: RefObject<FigurePose | null> | undefined =
        f.headYaw !== undefined ? { current: { ...REST_POSE, gaze: { yaw: f.headYaw, pitch: 0, turn: 0 } } } : undefined
      return {
        ...f,
        scale,
        clip,
        speed,
        cloth: fc,
        dress: f.garments ? resolveOutfit(f.garments, look?.peopleId ?? null, fc) : undefined,
        start: [at.x + right[0] * off - ahead[0] * lead, at.z + right[1] * off - ahead[1] * lead] as const,
        ahead,
        phase,
        work,
        pose,
      }
    })
  }, [at, cloth, look])

  useFrame((_, rawDt) => {
    if (!import.meta.env.DEV || !at || isLifeFrozen()) return
    const dt = Math.min(rawDt, 0.1)
    const r = run.current
    r.elapsed += dt
    row.forEach((f, i) => {
      const g = groups.current[i]
      if (!g) return
      r.walked[i] = (r.walked[i] ?? 0) + f.speed * dt
      const x = f.start[0] + f.ahead[0] * r.walked[i]
      const z = f.start[1] + f.ahead[1] * r.walked[i]
      g.position.set(x, groundHeight(x, z), z)
    })
    // The clip time: the first figure carrying one, once its clip is fully in.
    const i = row.findIndex((f) => f.phase !== null)
    if (i < 0 || r.frozen) return
    const f = row[i]
    const c = clockOf(groups.current[i])
    if (!c) return
    const moving = f.clip === 'walk' || f.clip === 'run'
    const now = moving ? c.gait : c.idle
    const prev = r.prev[i]
    r.prev[i] = now
    const ready = f.clip === 'dig' ? c.dig >= 1 : moving ? r.elapsed >= WARM_SECONDS && c.weight >= 0.999 : r.elapsed >= 0.5
    if (!ready) return
    if (f.clip === 'dig' || (prev !== undefined && crossedPhase(prev, now, f.phase!))) {
      r.frozen = true
      r.held = { index: i, phase: f.clip === 'dig' ? f.phase! : now }
      ;(window as unknown as { __placeFreezeLife?: (on: boolean) => void }).__placeFreezeLife?.(true)
    }
  })

  if (!import.meta.env.DEV || !at) return null
  return (
    <group name="dress-lineup">
      {row.map((f, i) => (
        <group
          key={`${gen}-${i}`}
          ref={(g) => {
            groups.current[i] = g
          }}
          name={`dress-lineup-${f.sex}-${f.age}`}
          position={[f.start[0], groundHeight(f.start[0], f.start[1]), f.start[1]]}
          rotation={[0, at.yaw, 0]}
        >
          <Figure cloth={f.cloth} sex={f.sex} age={f.age} scale={f.scale} legs dress={f.dress} build={f.build} work={f.work} pose={f.pose} />
        </group>
      ))}
    </group>
  )
}
