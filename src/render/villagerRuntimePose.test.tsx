// @vitest-environment node
// THE RUNTIME-POSE EXPORTER (natural villager motion, concept step 1): the
// glTF villager posed by the game's OWN code — SkinnedFigure mounted through
// react-three-fiber's reconciler, its frame callback driven frame by frame —
// for eight subjects (walk, turn, run, dig, pick-up, point, port-city chaser,
// river-bank caught child). A stage component plays the caller's part the way
// PlaceLife.tsx does (it moves, turns and squashes the figure's group and
// writes the pose after the figure's own frame), using the same exported pose
// functions. Nothing here changes a pose: it records one.
//
// Per recorded frame: the figure group's root transform INCLUDING its scale
// (the jar fill's y-squash), the chain down to the skeleton, every bone's local
// translation, rotation and scale, the active morph weights, every bone's
// world matrix (what the Python round-trip check must reproduce,
// scripts/villager/gamepath.py) and the shovel's world matrix.
//
// With VILLAGER_RUNTIME_POSES=<path> the export is written there as JSON
// (scripts/villager/build.mjs runs this file before the sheets and the
// penetration step); without it only the checks below run.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import { appearanceFor, type AgeGroup, type Sex } from '../systems/appearance'
import { applyFigurePose, type FigureLimbs } from './figurePose'
import { CHILD_FIGURE_SCALE } from './figures'
import {
  advanceGesture,
  digPose,
  fillPose,
  fillSquat,
  gestureEnvelope,
  gesturePose,
  REST_POSE,
  restGesture,
  startGesture,
  TOUCH_LEAN,
  type ArmSide,
  type FigurePose,
  type GestureState,
} from './gesture'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { garmentMeshName, gltfLayerGeometry, gltfPerson } from './villagerFigureBody'
import { figureIdentity } from '../scenes/place/figureIdentity'
import type { FigureLook, FigureWork } from '../scenes/place/placeFigureContext'
import { easeDigWeight, mixDigPose } from '../scenes/place/shovelHold'
import { SkinnedFigure } from '../scenes/place/skinnedFigure'
import { bankFigurePose, easeWeight, grabAim, newTagBodyWeights, steerGrab, tagFigurePose, type GrabAim, type TagBodyWeights } from '../scenes/place/tagGame'
import { VILLAGER_POSE } from '../config/balance'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const DT = 1 / 60
const TAG = balance.villageLife.tag
const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']

/** What a stage's caller writes each frame (PlaceLife.tsx's part). */
interface Caller {
  root: THREE.Group
  pose: FigurePose
  gesture: GestureState
  work: FigureWork
  squat: { current: number }
  /** Seconds since the subject began. */
  t: number
  mem: Record<string, number | string | null>
  /** The glTF body's tag weights and level grab (natural-villager-motion steps 15/16). */
  body: { weights: TagBodyWeights; aim: GrabAim | null }
}

interface Subject {
  id: string
  title: string
  sex: Sex
  age: AgeGroup
  scale: number
  peopleId: string
  /** Seconds simulated, and the window [from, to] recorded as `frames` frames. */
  seconds: number
  from: number
  to: number
  frames: number
  /** Sheet cameras: 'side', 'front' or an azimuth in degrees. */
  views: Array<'side' | 'front' | number>
  elevation?: number
  drive: (c: Caller, dt: number) => void
}

const yawStep = (from: number, to: number, rate: number, dt: number) => from + Math.max(-rate * dt, Math.min(rate * dt, to - from))

/** The eight subjects. Paces and timings: see each `drive`. */
const SUBJECTS: Subject[] = [
  {
    // a villager walking straight ahead at 1.0 units/s (~1.3 m/s)
    id: 'walk',
    title: 'walk: adult man, 1.0 u/s',
    sex: 'male',
    age: 'adult',
    scale: 1,
    peopleId: 'swahili',
    seconds: 2.7,
    from: 1.5,
    to: 2.6,
    frames: 12,
    views: ['side', 'front'],
    drive: (c, dt) => {
      c.root.position.z += 1.0 * dt
      c.pose = REST_POSE
    },
  },
  {
    // standing, then a quarter turn to the left at the tag round's turn rate
    id: 'turn',
    title: 'turn: adult man, 90° standing turn',
    sex: 'male',
    age: 'adult',
    scale: 1,
    peopleId: 'swahili',
    seconds: 1.6,
    from: 0.2,
    to: 1.5,
    frames: 12,
    views: ['front', 35],
    elevation: 25,
    drive: (c, dt) => {
      if (c.t > 0.3) c.root.rotation.y = yawStep(c.root.rotation.y, Math.PI / 2, TAG.turnRate, dt)
      c.pose = REST_POSE
    },
  },
  {
    // a run at 3.0 units/s (the sprint clip's band)
    id: 'run',
    title: 'run: adult man, 3.0 u/s',
    sex: 'male',
    age: 'adult',
    scale: 1,
    peopleId: 'swahili',
    seconds: 2.4,
    from: 1.5,
    to: 2.2,
    frames: 10,
    views: ['side', 'front'],
    drive: (c, dt) => {
      c.root.position.z += 3.0 * dt
      c.pose = REST_POSE
    },
  },
  {
    // digging on the spot (PlaceLife: work.dig, the dig pose eased in by easeDigWeight)
    id: 'dig',
    title: 'dig: adult man, one 2.4 s stroke',
    sex: 'male',
    age: 'adult',
    scale: 1,
    peopleId: 'swahili',
    seconds: 3.4,
    from: 0.9,
    to: 3.3,
    frames: 12,
    views: ['side', 35],
    drive: (c, dt) => {
      c.work.dig = true
      c.work.tool = true
      const k = easeDigWeight((c.mem.digK as number) ?? 0, true, dt)
      c.mem.digK = k
      c.mem.dug = ((c.mem.dug as number) ?? 0) + dt
      c.pose = mixDigPose(gesturePose(c.gesture), digPose(c.mem.dug as number, 0), k)
    },
  },
  {
    // the jar fill at the water (adultWork 'fill', PlaceLife: fillPose + the group's y-squash)
    id: 'pickup',
    title: 'pick-up: adult woman, jar fill',
    sex: 'female',
    age: 'adult',
    scale: 1,
    peopleId: 'baganda',
    seconds: 0.2 + balance.bankFillSeconds + 0.2,
    from: 0.1,
    to: 0.2 + balance.bankFillSeconds + 0.1,
    frames: 12,
    views: ['side', 35],
    drive: (c) => {
      const p = c.t < 0.2 ? null : Math.min(1, (c.t - 0.2) / balance.bankFillSeconds)
      c.work.tool = false
      c.pose = p === null ? REST_POSE : fillPose(p)
      const squash = p === null ? 1 : fillSquat(p)
      c.root.scale.set(1, squash, 1)
      c.squat.current = squash
    },
  },
  {
    // a pointing gesture to the figure's left, a little raised
    id: 'point',
    title: 'point: adult man, bearing 0.6 rad',
    sex: 'male',
    age: 'adult',
    scale: 1,
    peopleId: 'swahili',
    seconds: 2.4,
    from: 0.2,
    to: 2.3,
    frames: 12,
    views: ['front', 35],
    drive: (c, dt) => {
      if (c.t >= 0.2 && c.mem.started === undefined) {
        c.gesture = startGesture('point', { bearing: 0.6, elevation: 0.15 })
        c.mem.started = 1
      } else c.gesture = advanceGesture(c.gesture, dt)
      c.pose = gesturePose(c.gesture)
    },
  },
  {
    // the port-city tag chaser: a child at the sprint speed closing on a quarry
    // running ahead and a little to the left; inside the prepare distance the
    // readied arm, inside the commit distance the grab (steerGrab/grabAim, and
    // the glTF body's level grab) as PlaceLife steers it, up to the catch distance
    id: 'chaser',
    title: 'chaser: port-city tag, child at 3.4 u/s',
    sex: 'male',
    age: 'child',
    scale: CHILD_FIGURE_SCALE,
    peopleId: 'swahili',
    seconds: 2.5,
    from: 0.8,
    to: 2.45,
    frames: 12,
    views: ['side', 35],
    drive: (c, dt) => {
      const speed = TAG.sprintSpeed
      c.root.position.z += speed * dt
      const q = { x: 0.35, z: 3.2 + 2.3 * c.t }
      const me = { x: c.root.position.x, z: c.root.position.z, facing: c.root.rotation.y }
      const lean = ((c.mem.lean as number) ?? 0) + (TAG.leanAtSprint - ((c.mem.lean as number) ?? 0)) * Math.min(1, dt * 4)
      c.mem.lean = lean
      c.gesture = advanceGesture(c.gesture, dt)
      const gap = Math.hypot(q.x - me.x, q.z - me.z)
      const limit = TAG.gazeTurnMax
      const gaze = Math.max(-limit, Math.min(limit, Math.atan2(q.x - me.x, q.z - me.z) - me.facing))
      const w = c.body.weights
      const CH = VILLAGER_POSE.tagChaser
      if (gap <= TAG.commitDistance && gap > TAG.catchDistance) {
        const aim = grabAim(me, q, Math.max(lean, TOUCH_LEAN), CHILD_FIGURE_SCALE, TAG.gazeTurnMax, (c.mem.side as ArmSide | null) ?? null)
        c.mem.side = aim.side
        c.mem.turn = aim.turn
        c.body.aim = grabAim(me, q, Math.min(lean, CH.leanMax), CHILD_FIGURE_SCALE, TAG.gazeTurnMax, w.side, { elevation: CH.reachElevation, reachMax: CH.reachMax })
        w.side = c.body.aim.side
        c.gesture = steerGrab(c.gesture, aim)
      } else c.gesture = steerGrab(c.gesture, null)
      if (c.gesture.kind !== 'touch') c.body.aim = null
      w.prepare = easeWeight(w.prepare, gap <= CH.prepareDistance, CH.prepareSeconds, dt)
      w.reach = easeWeight(w.reach, !!c.body.aim, CH.prepareSeconds, dt)
      const bearing = Math.atan2(q.x - me.x, q.z - me.z) - me.facing
      if (w.prepare <= 0 && w.reach <= 0 && !c.body.aim) w.side = null
      else w.side ??= bearing >= 0 ? 'left' : 'right'
      const reach = c.gesture.kind === 'touch' ? gestureEnvelope(c.gesture) : 0
      const turn = ((c.mem.turn as number) ?? 0) * reach + gaze * (1 - reach)
      c.pose = tagFigurePose('chaser', gesturePose(c.gesture), gestureEnvelope(c.gesture), lean, turn, TAG, { weights: w, aim: c.body.aim, bearing })
    },
  },
  {
    // a river-bank round's caught child (bankFigurePose, slumped from 0.4 s on,
    // the glTF body's hold eased in), standing
    id: 'caught',
    title: 'caught child: river-bank round',
    sex: 'female',
    age: 'child',
    scale: CHILD_FIGURE_SCALE,
    peopleId: 'baganda',
    seconds: 1.6,
    from: 0.2,
    to: 1.5,
    frames: 10,
    views: ['side', 'front'],
    drive: (c, dt) => {
      const w = c.body.weights
      w.slump = easeWeight(w.slump, c.t >= 0.4, VILLAGER_POSE.caughtSlump.settleSeconds, dt)
      c.pose = bankFigurePose(c.t >= 0.4, gesturePose(c.gesture), 0, TAG, w.slump)
    },
  },
]

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const trs = (o: THREE.Object3D) => ({ p: o.position.toArray(), q: o.quaternion.toArray(), s: o.scale.toArray() })

interface Recorded {
  t: number
  root: ReturnType<typeof trs>
  /** Local transforms from the root down to the skeleton: the figure's own group, the skinned mesh. */
  chain: Array<ReturnType<typeof trs> & { name: string }>
  bones: Array<ReturnType<typeof trs>>
  world: number[][]
  /** The person's baked morphs, and the live (hand) morphs the mesh draws, by name. */
  morph: { influences: Record<string, number>; mesh: Record<string, number> }
  tool: { visible: boolean; matrix: number[] } | null
}

/** Mount one subject's figure through the game's reconciler and run it, recording its window. */
async function play(s: Subject) {
  const id = figureIdentity(s.id, s.scale, s.sex, s.age)
  const look: FigureLook = {
    peopleId: s.peopleId,
    drivers: { coldness: 0, harmattan: 0, karif: 0 },
    year: 1890,
    palette: PALETTE,
    radial: 16,
    villager: asset,
  }
  const person = gltfPerson(asset, id.sex, id.age, id.build)
  const garments = appearanceFor({ peopleId: s.peopleId, sex: id.sex, age: id.age, drivers: look.drivers, year: look.year, cloth: PALETTE[0], palette: PALETTE, pick: id.pick })
    .filter((l) => gltfLayerGeometry(asset, person, l))
    .map(garmentMeshName)
  const caller: Caller = {
    root: new THREE.Group(),
    pose: REST_POSE,
    gesture: restGesture(),
    work: { dig: false, tool: false },
    squat: { current: 1 },
    t: 0,
    mem: {},
    body: { weights: newTagBodyWeights(), aim: null },
  }
  function Stage() {
    const pose = useRef<FigurePose | null>({ ...REST_POSE })
    const limbs = useRef<FigureLimbs | null>(null)
    const work = useRef<FigureWork>(caller.work)
    // the caller's frame runs after the figure's (a parent's useFrame subscribes
    // after its children's), as PlaceLife's does
    useFrame((_, dt) => {
      s.drive(caller, dt)
      pose.current = { ...caller.pose }
      applyFigurePose(limbs.current, pose.current)
    })
    return (
      <primitive object={caller.root}>
        <SkinnedFigure look={look} cloth={PALETTE[0]} scale={s.scale} sex={s.sex} age={s.age} identityKey={s.id} pose={pose} limbs={limbs} squat={caller.squat} work={work} />
      </primitive>
    )
  }
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(<Stage />))
  const mesh = caller.root.getObjectByName('figure-body') as THREE.SkinnedMesh
  const tool = caller.root.getObjectByName('digging-tool') ?? null
  const chainNodes: THREE.Object3D[] = []
  for (let o: THREE.Object3D | null = mesh; o && o !== caller.root; o = o.parent) chainNodes.unshift(o)
  const bones = mesh.skeleton.bones
  const want = Array.from({ length: s.frames }, (_, k) => s.from + ((s.to - s.from) * k) / (s.frames - 1))
  const frames: Recorded[] = []
  const steps = Math.round(s.seconds / DT)
  for (let k = 1; k <= steps; k++) {
    caller.t = k * DT
    act(() => advance(k * DT))
    const due = want.findIndex((w) => Math.abs(w - caller.t) < DT / 2 + 1e-9 && !frames.some((f) => f.t === w))
    if (due < 0 || frames.length > due) continue
    caller.root.updateMatrixWorld(true)
    frames.push({
      t: want[due],
      root: trs(caller.root),
      chain: chainNodes.map((o) => ({ name: o.name || o.type, ...trs(o) })),
      bones: bones.map(trs),
      world: bones.map((b) => b.matrixWorld.toArray()),
      morph: {
        influences: { ...person.frame.influences },
        mesh: Object.fromEntries(Object.entries(mesh.morphTargetDictionary ?? {}).map(([n, i]) => [n, mesh.morphTargetInfluences?.[i] ?? 0])),
      },
      tool: tool ? { visible: tool.visible, matrix: tool.matrixWorld.toArray() } : null,
    })
  }
  await act(async () => root.unmount())
  return {
    id: s.id,
    title: s.title,
    views: s.views,
    elevation: s.elevation ?? 0,
    identity: { sex: id.sex, age: id.age, build: id.build, scale: s.scale },
    person: { scale: person.frame.scale, sole: person.frame.sole, rest: Array.from(person.rest) },
    garments,
    frames,
  }
}

describe('the runtime-pose exporter', () => {
  it('records all eight subjects through the game\'s own figure, and the export is complete', async () => {
    const out: Awaited<ReturnType<typeof play>>[] = []
    for (const s of SUBJECTS) out.push(await play(s))
    expect(out.map((s) => s.id)).toEqual(['walk', 'turn', 'run', 'dig', 'pickup', 'point', 'chaser', 'caught'])
    for (const s of out) {
      const spec = SUBJECTS.find((x) => x.id === s.id)!
      expect(s.frames.length, s.id).toBe(spec.frames)
      for (const f of s.frames) {
        expect(f.bones.length).toBe(asset.bones.length)
        // the locals reproduce three's world matrices (the export misses no transform)
        const m = new THREE.Matrix4().compose(new THREE.Vector3(...f.root.p), new THREE.Quaternion(...f.root.q), new THREE.Vector3(...f.root.s))
        for (const c of f.chain) m.multiply(new THREE.Matrix4().compose(new THREE.Vector3(...c.p), new THREE.Quaternion(...c.q), new THREE.Vector3(...c.s)))
        const world: THREE.Matrix4[] = []
        const depth = (i: number): number => (asset.parents[i] < 0 ? 0 : 1 + depth(asset.parents[i]))
        const order = asset.bones.map((_, i) => i).sort((a, b) => depth(a) - depth(b))
        order.forEach((i) => {
          const par = asset.parents[i]
          const b = f.bones[i]
          const local = new THREE.Matrix4().compose(new THREE.Vector3(...b.p), new THREE.Quaternion(...b.q), new THREE.Vector3(...b.s))
          world[i] = (par < 0 ? m.clone() : world[par].clone()).multiply(local)
          // the whole matrix: a wrong leaf rotation or scale keeps the joint's position
          const want = f.world[i]
          const err = Math.max(...world[i].elements.map((x, k) => Math.abs(x - want[k])))
          expect(err).toBeLessThan(1e-6)
        })
      }
    }
    // the subjects are what they say: the pick-up squashes its group, the dig shows the shovel,
    // the walkers travel, the turn turns
    const by = (id: string) => out.find((s) => s.id === id)!
    expect(Math.min(...by('pickup').frames.map((f) => f.root.s[1]))).toBeLessThan(0.95)
    expect(by('dig').frames.some((f) => f.tool?.visible)).toBe(true)
    const yaw = (q: number[]) => 2 * Math.atan2(q[1], q[3])
    expect(yaw(by('turn').frames.at(-1)!.root.q)).toBeGreaterThan(1.5)
    for (const id of ['walk', 'run', 'chaser']) expect(by(id).frames.at(-1)!.root.p[2] - by(id).frames[0].root.p[2]).toBeGreaterThan(0.5)
    // natural-villager-motion steps 15/16 on the COMPOSED body: the caught
    // child, once settled, stands planted (no foot drift, no squash) with the
    // head bowed; the chaser's face is on its quarry
    const bone = (n: string) => asset.bones.indexOf(n)
    const at = (m: number[]) => new THREE.Vector3(m[12], m[13], m[14])
    const face = (m: number[]) => new THREE.Vector3(m[8], m[9], m[10]).normalize()
    const settled = by('caught').frames.filter((f) => f.t >= 0.4 + VILLAGER_POSE.caughtSlump.settleSeconds + 0.2)
    expect(settled.length).toBeGreaterThan(2)
    for (const foot of ['foot.L', 'foot.R']) {
      const p0 = at(settled[0].world[bone(foot)])
      for (const f of settled) expect(at(f.world[bone(foot)]).distanceTo(p0), foot).toBeLessThan(0.001)
    }
    for (const f of settled) {
      expect(f.root.s).toEqual([1, 1, 1])
      expect(face(f.world[bone('head')]).y).toBeLessThan(-Math.sin(0.2))
    }
    const before = by('caught').frames.find((f) => f.t < 0.4)!
    expect(face(before.world[bone('head')]).y).toBeGreaterThan(-Math.sin(0.15))
    // the chaser strides at its sprint (its legs froze above the old teleport speed)
    // the child chaser at 3.4 u/s and the caught child stay at a child's
    // standing height: no squat (their hips sat at 0.50-0.65 of it in the
    // frozen walk and the CROUCH_MAX fallback). The reference is the caught
    // child standing before its slump, carried to each body's own scale.
    const hipsOf = (id: string) => by(id).frames.map((fr) => at(fr.world[bone('hips')]).y - fr.root.p[1])
    const caughtStanding = by('caught').frames.find((f) => f.t < 0.4)!
    const childStanding = (id: string) => ((at(caughtStanding.world[bone('hips')]).y - caughtStanding.root.p[1]) * by(id).person.scale) / by('caught').person.scale
    expect(Math.min(...hipsOf('chaser')) / childStanding('chaser')).toBeGreaterThan(0.75)
    expect(Math.min(...hipsOf('caught')) / childStanding('caught')).toBeGreaterThan(0.95)
    const feet = by('chaser').frames.map((fr) => at(fr.world[bone('foot.L')]).z - fr.root.p[2])
    expect(Math.max(...feet) - Math.min(...feet)).toBeGreaterThan(0.05)
    // (where the bearing turns slowly: the gaze is damped, 0.18 s)
    for (const fr of by('chaser').frames.filter((x) => x.t >= 1 && x.t <= 1.8)) {
      const head = at(fr.world[bone('head')])
      const want = Math.atan2(0.35 - head.x, 3.2 + 2.3 * fr.t - head.z)
      const f = face(fr.world[bone('head')])
      expect(Math.abs(Math.atan2(f.x, f.z) - want), `chaser t=${fr.t.toFixed(2)}`).toBeLessThan((5 * Math.PI) / 180)
    }
    const path = process.env.VILLAGER_RUNTIME_POSES
    if (path) {
      mkdirSync(dirname(path), { recursive: true })
      writeFileSync(path, JSON.stringify({ version: 1, bones: asset.bones, parents: asset.parents, dt: DT, subjects: out }))
    }
  }, 120_000)
})
