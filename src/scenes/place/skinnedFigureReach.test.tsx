// @vitest-environment node
// A pose's explicit hand reach (FigurePose.reach, natural-villager-motion step
// 15) is one continuous curve through k = 1: the glTF hand lands in the same
// place at 1 − ε, 1 and 1 + ε. (k = 1 used to return the primitive's virtual
// hand while its neighbours measured the drawn arm, and a reach just past the
// arm fell to the unsolved fallback, so a reach easing through 1 jumped.) A
// side the pose leaves out keeps the virtual hand.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { applyFigurePose, type FigureLimbs } from '../../render/figurePose'
import { CHILD_FIGURE_SCALE } from '../../render/figures'
import { armAim, REST_POSE, type FigurePose } from '../../render/gesture'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

/** The drawn right hand, in the figure group's frame, after the same frames of
 *  a child running at the tag sprint with its right arm readied at reach `k`
 *  (running, as the chaser does: a standing contact out of reach crouches). */
async function handAt(k: number | undefined) {
  return (await figureAt(k === undefined ? { left: undefined } : { right: k })).hand
}

/** The drawn right hand and head after those frames, for any pose reach. */
async function figureAt(reach: FigurePose['reach']) {
  const look: FigureLook = {
    peopleId: 'swahili',
    drivers: { coldness: 0, harmattan: 0, karif: 0 },
    year: 1890,
    palette: PALETTE,
    radial: 16,
    villager: asset,
  }
  const shown: FigurePose = {
    left: { ...REST_POSE.left },
    right: armAim(-0.1, -0.55),
    lean: 0,
    turn: 0,
    reach,
  }
  const group = new THREE.Group()
  function Stage() {
    const pose = useRef<FigurePose | null>({ ...shown })
    const limbs = useRef<FigureLimbs | null>(null)
    useFrame((_, dt) => {
      group.position.z += balance.villageLife.tag.sprintSpeed * dt
      pose.current = { ...shown }
      applyFigurePose(limbs.current, pose.current)
    })
    return (
      <primitive object={group}>
        <SkinnedFigure look={look} cloth={PALETTE[0]} scale={CHILD_FIGURE_SCALE} sex="female" age="child" identityKey="reach-probe" pose={pose} limbs={limbs} />
      </primitive>
    )
  }
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(<Stage />))
  for (let f = 1; f <= 30; f++) act(() => advance(f / 60))
  group.updateMatrixWorld(true)
  const mesh = group.getObjectByName('figure-body') as THREE.SkinnedMesh
  const hand = mesh.skeleton.bones[asset.bones.indexOf('hand.R')]
  const at = group.worldToLocal(hand.getWorldPosition(new THREE.Vector3()))
  const head = group.worldToLocal(mesh.skeleton.bones[asset.bones.indexOf('head')].getWorldPosition(new THREE.Vector3()))
  await act(async () => root.unmount())
  return { hand: at, head }
}

describe('a pose reach through k = 1', () => {
  it('puts the drawn hand in the same place just below, at and just above 1', async () => {
    const eps = 1e-3
    const below = await handAt(1 - eps)
    const one = await handAt(1)
    const above = await handAt(1 + eps)
    expect(below.distanceTo(one)).toBeLessThan(0.005)
    expect(above.distanceTo(one)).toBeLessThan(0.005)
    // the curve's own end differs from the virtual hand a side left out keeps:
    // the case the old k = 1 shortcut confused
    const virtual = await handAt(undefined)
    expect(virtual.distanceTo(one)).toBeGreaterThan(0.01)
  }, 60_000)
})

// A blend between a lunging and a plain reach (mixPose through an arm
// handover) carries the lunge as a share: the trunk's lean-in eases with it
// instead of switching off and back on at the blend's ends.
describe('a lunge share eases the contact lean-in', () => {
  it('leans the head forward in proportion between share 0 and 1, with no step at either end', async () => {
    // just past the straight arm: a lean the trunk can make brings the hand on
    const k = 1.02
    const z = async (lunge: number) => (await figureAt({ right: k, lunge })).head.z
    const none = await z(0)
    const tiny = await z(0.01)
    const half = await z(0.5)
    const full = await z(1)
    expect(full - none).toBeGreaterThan(0.02)
    expect(Math.abs(tiny - none)).toBeLessThan(0.05 * (full - none))
    expect(half).toBeGreaterThan(none + 0.2 * (full - none))
    expect(half).toBeLessThan(none + 0.8 * (full - none))
    expect(Math.abs((await z(0.99)) - full)).toBeLessThan(0.05 * (full - none))
  }, 120_000)
})
