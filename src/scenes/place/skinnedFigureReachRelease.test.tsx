// @vitest-environment node
// A pose reach given up eases back into the clips (work-order 1405), but the
// release must end: a later gesture that moves the arm without a reach is a
// contact again, drawn as it would be had no reach come before it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { applyFigurePose, type FigureLimbs } from '../../render/figurePose'
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

const take: FigurePose = { left: { ...REST_POSE.left }, right: armAim(-0.6, -0.4), lean: 0, turn: 0, reach: { right: 0.9 } }
const held: FigurePose = { ...take, reach: undefined }
// the last frame of a take: the arm all but back at rest, the reach still named
const takeEnd: FigurePose = { left: { ...REST_POSE.left }, right: { ...REST_POSE.right, pitch: REST_POSE.right.pitch - 0.05 }, lean: 0, turn: 0, reach: { right: 1 } }
const rest: FigurePose = { left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0, turn: 0 }
const gesture: FigurePose = { left: { ...REST_POSE.left }, right: armAim(-1.3, 0.3), lean: 0, turn: 0 }

/** The drawn right hand, in the figure's frame, after the poses shown in turn
 *  for 120 frames each, and the fastest frame-to-frame move of a jar hung
 *  0.3 m below its hand anchor. */
async function run(poses: FigurePose[]) {
  const look: FigureLook = {
    peopleId: 'swahili',
    drivers: { coldness: 0, harmattan: 0, karif: 0 },
    year: 1890,
    palette: PALETTE,
    radial: 16,
    villager: asset,
  }
  const group = new THREE.Group()
  let frame = 0
  function Stage() {
    const pose = useRef<FigurePose | null>({ ...poses[0] })
    const limbs = useRef<FigureLimbs | null>(null)
    useFrame(() => {
      pose.current = { ...poses[Math.min(poses.length - 1, Math.floor(frame / 120))] }
      applyFigurePose(limbs.current, pose.current)
    })
    return (
      <primitive object={group}>
        <SkinnedFigure look={look} cloth={PALETTE[0]} sex="male" age="adult" identityKey="release-probe" pose={pose} limbs={limbs} />
      </primitive>
    )
  }
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(<Stage />))
  let jarStep = 0
  let lastJar: THREE.Vector3 | null = null
  for (frame = 0; frame < poses.length * 120; frame++) {
    act(() => advance((frame + 1) / 60))
    group.updateMatrixWorld(true)
    const anchor = group.getObjectByName('hand-right')
    if (!anchor) continue
    const jar = group.worldToLocal(anchor.localToWorld(new THREE.Vector3(0, -0.3, 0)))
    if (lastJar) jarStep = Math.max(jarStep, jar.distanceTo(lastJar))
    lastJar = jar
  }
  const mesh = group.getObjectByName('figure-body') as THREE.SkinnedMesh
  const hand = group.worldToLocal(mesh.skeleton.bones[asset.bones.indexOf('hand.R')].getWorldPosition(new THREE.Vector3()))
  await act(async () => root.unmount())
  return { hand, jarStep }
}
const handAfter = async (poses: FigurePose[]) => (await run(poses)).hand

describe('a released pose reach', () => {
  it('gives the arm back to a later contact gesture once the clips hold it', async () => {
    const afterRelease = await handAfter([take, held, gesture])
    const fresh = await handAfter([gesture, gesture, gesture])
    expect(afterRelease.distanceTo(fresh)).toBeLessThan(0.01)
  }, 60_000)

  it('gives it back as well when the gesture comes on the very frame the reach ends', async () => {
    const direct = await handAfter([take, gesture, gesture])
    const fresh = await handAfter([gesture, gesture, gesture])
    expect(direct.distanceTo(fresh)).toBeLessThan(0.01)
  }, 60_000)

  it('lets a jar hung from the hand ride through the end of the release without a swing', async () => {
    const { jarStep } = await run([takeEnd, rest, rest])
    // 0.05 m in a 60 fps frame is 3 m/s, a walking arm's swing at most
    expect(jarStep).toBeLessThan(0.05)
  }, 60_000)
})
