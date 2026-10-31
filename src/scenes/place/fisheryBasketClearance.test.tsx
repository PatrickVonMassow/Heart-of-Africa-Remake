// @vitest-environment node
// The basket clears the head of the man who holds it (user report "head in the
// basket"): the net man squatting at the beached dugout had his head inside the
// basket, which stood at a height of its own while he crouched and leaned to the
// hull. Over the whole hand-over at the landing — step ashore, bend to take the
// empty basket, hold it at the bow while it fills, bend to set it down, step
// back aboard — no part of the head is inside the basket, and over the
// carrier's swap bend the basket rests on the crown at most 2 mm in, measured on
// the drawn (glTF) body's head vertices. The net-man case also samples the low
// preset's primitive figure.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { applyFigurePose, type FigureLimbs } from '../../render/figurePose'
import { REST_POSE, type FigurePose } from '../../render/gesture'
import { PRIMITIVE_HEAD_RADIUS, primitiveLayout } from '../../render/figureWalk'
import { FIGURE_LIMBS } from '../../render/figures'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { createBasketRing, FISH_BASKET, type BasketRing } from './fishBaskets'
import { carrierWalkPose, copyPose, netManAshore, netManBasketAt, placeNetMan } from './fisheryPoses'
import { PLACE_RADIUS } from './layout'
import { crownIn, type FigureLook } from './placeFigureContext'
import { buildRiverBank } from './riverBank'
import { SkinnedFigure } from './skinnedFigure'
import { canoeLane, createCanoe, stepCanoe, type CanoeState } from './villagerCanoe'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#2a3a6a', '#8a4a2a', '#c2b090']
const DT = 1 / 30
/** How far every head point stays outside the basket (m). */
const MARGIN = 0.03
const flat = () => 0

let asset: VillagerAsset
beforeAll(async () => {
  // The real bank needs the DEM, whose loader draws into a 2D canvas: the node
  // environment (which the glTF body needs) is given just enough of one, for
  // the load only.
  const g = globalThis as unknown as { HTMLCanvasElement?: unknown; document?: unknown }
  class Canvas {
    width = 0
    height = 0
    getContext(): unknown {
      return null
    }
  }
  g.HTMLCanvasElement = Canvas
  g.document = { createElement: () => new Canvas() }
  try {
    await setupGeodata()
  } finally {
    delete g.HTMLCanvasElement
    delete g.document
  }
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

// A bone-transformed vertex is the bones' world position under the mesh's bind
// inverse; undoing that inverse (whatever frame it was last refreshed in) gives
// the world position the bones put it at.
const toWorld = new THREE.Matrix4()

/** How deep a point is inside the basket standing at `at` (> 0 inside, m). */
function inside(p: THREE.Vector3, at: { x: number; y: number; z: number }): number {
  const { radius, height } = FISH_BASKET
  const h = p.y - at.y
  const k = Math.min(1, Math.max(0, h / height))
  const r = radius * (0.78 + 0.22 * k)
  const radial = r - Math.hypot(p.x - at.x, p.z - at.z)
  return Math.min(radial, h, height - h)
}

/** One frame of the hand-over: the net man's state and whether he holds a basket. */
interface Frame {
  nm: CanoeState['netMan']
  holding: boolean
}

/** The landing's whole unload on the real dugout, frame by frame. */
function unloadFrames(): Frame[] {
  const bank = buildRiverBank(PLACES.find((p) => p.id === 'bambara-village')!, PLACE_RADIUS)!
  const lane = canoeLane(bank)
  const state = createCanoe(lane)
  const ring: BasketRing = createBasketRing(0)
  const view = { say: () => 'said' as const, obeyDelay: () => 2.2 }
  const cfg = balance.villageLife.canoe
  for (let i = 0; i < 40000 && state.phase !== 'unload'; i++) stepCanoe(state, lane, ring, view, 0.05, cfg, () => 0.5)
  expect(state.phase).toBe('unload')
  const frames: Frame[] = []
  for (let i = 0; i < 4000 && state.phase === 'unload'; i++) {
    stepCanoe(state, lane, ring, view, DT, cfg, () => 0.5)
    frames.push({ nm: { ...state.netMan }, holding: ring.baskets.some((b) => b.at === 'netman') })
  }
  return frames
}

describe('the basket the net man holds at the landing', () => {
  it('clears his head through the whole hand-over, on the drawn body and the primitive', async () => {
    const frames = unloadFrames()
    // the cycle really bends, holds and bends again with the basket in his hands
    expect(frames.filter((f) => f.holding).length).toBeGreaterThan(30)
    expect(Math.max(...frames.filter((f) => f.holding).map((f) => f.nm.reach))).toBeGreaterThan(0.95)
    expect(frames.some((f) => f.holding && f.nm.reach === 0)).toBe(true)
    expect(frames.every((f) => !f.holding || !f.nm.inBoat)).toBe(true)

    const look: FigureLook = { peopleId: 'bambara', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, palette: PALETTE, radial: 16, villager: asset }
    const outer = new THREE.Group()
    const now = { frame: frames[0] }
    function Stage() {
      const pose = useRef<FigurePose | null>({ ...REST_POSE })
      const limbs = useRef<FigureLimbs | null>(null)
      const kneels = useRef(false)
      const squat = useRef(1)
      useFrame(() => {
        const { nm, holding } = now.frame
        placeNetMan(outer, nm, 0, flat, kneels, squat)
        if (!nm.inBoat && pose.current) {
          copyPose(pose.current, netManAshore(nm.reach, holding).pose)
          applyFigurePose(limbs.current, pose.current)
        }
      })
      return (
        <primitive object={outer}>
          <SkinnedFigure look={look} cloth={PALETTE[0]} scale={1} sex="male" age="adult" identityKey="net-man-basket" pose={pose} limbs={limbs} kneeling={kneels} squat={squat} />
        </primitive>
      )
    }
    const root = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
    await act(async () => root.render(<Stage />))
    const mesh = outer.getObjectByName('figure-body') as THREE.SkinnedMesh
    const headIndex = mesh.skeleton.bones.findIndex((b) => b.name === 'bone-head')
    expect(headIndex).toBeGreaterThanOrEqual(0)
    const pos = mesh.geometry.attributes.position
    const si = mesh.geometry.attributes.skinIndex
    const sw = mesh.geometry.attributes.skinWeight
    const headVerts: number[] = []
    for (let i = 0; i < pos.count; i++) {
      let w = 0
      for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === headIndex) w += sw.getComponent(i, c)
      if (w >= 0.5) headVerts.push(i)
    }
    expect(headVerts.length).toBeGreaterThan(20)

    const v = new THREE.Vector3()
    let worstDrawn = -Infinity
    let worstPrimitive = -Infinity
    let checked = 0
    let t = 0
    for (const frame of frames) {
      now.frame = frame
      act(() => advance((t += DT)))
      if (!frame.holding) continue
      checked++
      const at = netManBasketAt(frame.nm, flat)
      // never into the ground
      expect(at.y).toBeGreaterThanOrEqual(0)
      outer.updateWorldMatrix(true, true)
      for (const i of headVerts) {
        v.fromBufferAttribute(pos, i)
        mesh.applyBoneTransform(i, v)
        v.applyMatrix4(toWorld.copy(mesh.bindMatrixInverse).invert())
        worstDrawn = Math.max(worstDrawn, inside(v, at))
      }
      // The primitive: a round head on the trunk leaning about the ground
      // (no legs), the figure squashed by the squat (placeFigure.tsx).
      const { lean } = netManAshore(frame.nm.reach, true).pose
      const lay = primitiveLayout(0, false, FIGURE_LIMBS)
      const squash = outer.scale.y
      const cy = lay.headY * Math.cos(lean) * squash
      const cz = lay.headY * Math.sin(lean)
      for (let a = 0; a < 16; a++) {
        for (let b = -4; b <= 4; b++) {
          const phi = (a / 16) * Math.PI * 2
          const th = (b / 4) * (Math.PI / 2)
          const lx = PRIMITIVE_HEAD_RADIUS * Math.cos(th) * Math.sin(phi)
          const lz = cz + PRIMITIVE_HEAD_RADIUS * Math.cos(th) * Math.cos(phi)
          v.set(lx, cy + PRIMITIVE_HEAD_RADIUS * Math.sin(th), lz)
          v.applyAxisAngle(new THREE.Vector3(0, 1, 0), frame.nm.yaw).add(new THREE.Vector3(frame.nm.x, 0, frame.nm.z))
          worstPrimitive = Math.max(worstPrimitive, inside(v, at))
        }
      }
    }
    await act(async () => root.unmount())
    expect(checked).toBeGreaterThan(30)
    expect(worstDrawn).toBeLessThan(-MARGIN)
    expect(worstPrimitive).toBeLessThan(-MARGIN)
  })
})

describe('the basket the carrier swaps at the bank', () => {
  it('stays clear of his head through the whole swap bend', async () => {
    const look: FigureLook = { peopleId: 'bambara', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, palette: PALETTE, radial: 16, villager: asset }
    const outer = new THREE.Group()
    const lift = balance.villageLife.fishFire.liftSeconds
    const now = { clock: 0, phase: 'waitBank' }
    function Stage() {
      const pose = useRef<FigurePose | null>({ ...REST_POSE })
      const limbs = useRef<FigureLimbs | null>(null)
      useFrame(() => {
        if (!pose.current) return
        copyPose(pose.current, carrierWalkPose(now.phase, now.clock, lift))
        applyFigurePose(limbs.current, pose.current)
      })
      return (
        <primitive object={outer}>
          <SkinnedFigure look={look} cloth={PALETTE[0]} scale={1} sex="male" age="adult" identityKey="carrier-basket" pose={pose} limbs={limbs} />
        </primitive>
      )
    }
    const root = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
    await act(async () => root.render(<Stage />))
    const mesh = outer.getObjectByName('figure-body') as THREE.SkinnedMesh
    const headIndex = mesh.skeleton.bones.findIndex((b) => b.name === 'bone-head')
    const pos = mesh.geometry.attributes.position
    const si = mesh.geometry.attributes.skinIndex
    const sw = mesh.geometry.attributes.skinWeight
    const v = new THREE.Vector3()
    // The basket rides and tilts with his crown as RiverFishery places it (crownIn);
    // the head is measured in the basket's own frame.
    const crown = new THREE.Vector3()
    const turn = new THREE.Quaternion()
    const origin = { x: 0, y: 0, z: 0 }
    let worst = -Infinity
    let t = 0
    // a second carrying at the bank, then the whole swap, then carrying on
    const steps = Math.ceil(lift / DT)
    for (let k = -30; k <= steps + 30; k++) {
      now.phase = k < 0 ? 'waitBank' : k <= steps ? 'swap' : 'toFire'
      now.clock = Math.max(0, Math.min(lift, k * DT))
      act(() => advance((t += DT)))
      outer.updateWorldMatrix(true, true)
      expect(crownIn(outer, null, crown, turn)).toBe(true)
      turn.invert()
      for (let i = 0; i < pos.count; i++) {
        let w = 0
        for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === headIndex) w += sw.getComponent(i, c)
        if (w < 0.5) continue
        v.fromBufferAttribute(pos, i)
        mesh.applyBoneTransform(i, v)
        v.applyMatrix4(toWorld.copy(mesh.bindMatrixInverse).invert())
        worst = Math.max(worst, inside(v.sub(crown).applyQuaternion(turn), origin))
      }
    }
    await act(async () => root.unmount())
    // The basket rests on the crown: contact, never more than 2 mm into the head.
    expect(worst).toBeLessThan(0.002)
  })
})
