// @vitest-environment node
// The pounding pair eating at the fish rack (point 1450): the bite lifted the
// hand onto the top of the head and read as scratching it. Over the whole eat
// phase, on the drawn (glTF) body of each woman, the eating hand rises to the
// mouth at each bite — never above the mouth band — and comes to the face.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { REST_POSE, type FigurePose } from '../../render/gesture'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { biteLift, type PoundingDuo } from './fishFire'
import { rackPose } from './fisheryPoses'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
const FPS = 30
let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

type Duo = Pick<PoundingDuo, 'phase' | 'clock' | 'women'>
const eating = (clock: number, fish: number): Duo => ({ phase: 'eat', clock, women: [{ fish }, { fish }] as PoundingDuo['women'] })

describe('the pounding pair eating at the fish rack', () => {
  it.each([0, 1])('woman %i brings the fish to her mouth, never over her head', async (woman) => {
    const cfg = balance.villageLife.fishFire
    const look: FigureLook = { peopleId: 'bambara', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, palette: PALETTE, radial: 16, villager: asset }
    const group = new THREE.Group()
    const now = { duo: eating(0, 1) }
    function Stage() {
      const pose = useRef<FigurePose | null>({ ...REST_POSE })
      useFrame(() => {
        pose.current = rackPose(now.duo, woman)
      })
      return (
        <primitive object={group}>
          <SkinnedFigure look={look} cloth={PALETTE[0]} sex="female" age={woman === 0 ? 'adult' : 'youth'} identityKey={`rack-eat-${woman}`} pose={pose} legs />
        </primitive>
      )
    }
    const root = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
    await act(async () => root.render(<Stage />))
    const mesh = group.getObjectByName('figure-body') as THREE.SkinnedMesh
    const headBone = mesh.skeleton.bones.find((b) => b.name === 'bone-head')!
    const hand = group.getObjectByName('hand-left')!
    const crown = group.getObjectByName('figure-crown')!
    const h = new THREE.Vector3()
    const head = new THREE.Vector3()
    const top = new THREE.Vector3()

    let highest = -Infinity
    let overBand = -Infinity
    let peaks = 0
    let farAtPeak = 0
    let frame = 0
    for (; frame < cfg.eatSeconds * FPS; frame++) {
      const clock = frame / FPS
      now.duo = eating(clock, Math.max(1e-3, 1 - clock / cfg.eatSeconds))
      act(() => advance((frame + 1) / FPS))
      group.updateMatrixWorld(true)
      hand.getWorldPosition(h)
      headBone.getWorldPosition(head)
      crown.getWorldPosition(top)
      // The mouth band: from just under the skull's base to under halfway up the head.
      const mouthTop = head.y + 0.45 * (top.y - head.y)
      overBand = Math.max(overBand, h.y - mouthTop)
      highest = Math.max(highest, h.y - (head.y - 0.06))
      if (biteLift(now.duo, cfg, woman) > 0.99) {
        peaks++
        // at the bite the hand is at the face, in front of it, not beside the head
        farAtPeak = Math.max(farAtPeak, Math.abs(h.x - head.x), Math.max(0, head.z - h.z))
      }
    }
    await act(async () => root.unmount())
    expect(peaks).toBeGreaterThan(5)
    // each bite reaches the mouth band ...
    expect(highest).toBeGreaterThan(0)
    // ... and never rises over it
    expect(overBand).toBeLessThan(0)
    expect(farAtPeak).toBeLessThan(0.1)
  }, 120_000)
})
