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
import { biteLift } from './fishFire'
import type { PoundingDuo } from './mortarPounding'
import { rackPose } from './fisheryPoses'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
const FPS = 30
/** The mouth band, as shares of the drawn head's height over its chin. */
const MOUTH_BAND: [number, number] = [0.12, 0.42]
/** How far the eating hand may be beside the mouth, and ahead of the face (m). */
const MOUTH_SIDE = 0.1
const MOUTH_AHEAD = 0.12
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
    const h = new THREE.Vector3()
    const v = new THREE.Vector3()
    const toWorld = new THREE.Matrix4()
    // The drawn head: the vertices its bone carries.
    const pos = mesh.geometry.attributes.position
    const si = mesh.geometry.attributes.skinIndex
    const sw = mesh.geometry.attributes.skinWeight
    const headIndex = mesh.skeleton.bones.indexOf(headBone)
    const headVerts: number[] = []
    for (let i = 0; i < pos.count; i++) {
      let w = 0
      for (let c = 0; c < 4; c++) if (si.getComponent(i, c) === headIndex) w += sw.getComponent(i, c)
      if (w >= 0.5) headVerts.push(i)
    }
    expect(headVerts.length).toBeGreaterThan(20)
    const lift = (clock: number) => biteLift(eating(clock, 1), cfg, woman)

    let overBand = -Infinity
    const peaks: { band: number; under: number; side: number; ahead: number }[] = []
    for (let frame = 0; frame < cfg.eatSeconds * FPS; frame++) {
      const clock = frame / FPS
      now.duo = eating(clock, Math.max(1e-3, 1 - clock / cfg.eatSeconds))
      act(() => advance((frame + 1) / FPS))
      group.updateMatrixWorld(true)
      hand.getWorldPosition(h)
      // The head as drawn this frame: chin, top, and where its face is at each height.
      toWorld.copy(mesh.bindMatrixInverse).invert()
      const at = headVerts.map((i) => {
        v.fromBufferAttribute(pos, i)
        mesh.applyBoneTransform(i, v)
        return v.clone().applyMatrix4(toWorld)
      })
      const chin = Math.min(...at.map((p) => p.y))
      const crown = Math.max(...at.map((p) => p.y))
      // The mouth band: the lower face, from a little over the chin to under the nose.
      const low = chin + MOUTH_BAND[0] * (crown - chin)
      const high = chin + MOUTH_BAND[1] * (crown - chin)
      overBand = Math.max(overBand, h.y - high)
      const l = lift(clock)
      if (l > 0.9 && l >= lift(clock - 1 / FPS) && l >= lift(clock + 1 / FPS)) {
        // the mouth: the front of the face at the band's middle
        const mid = (low + high) / 2
        const face = at.filter((p) => Math.abs(p.y - mid) < 0.02)
        const front = face.reduce((a, b) => (b.z > a.z ? b : a))
        const middle = face.reduce((s, p) => s + p.x, 0) / face.length
        peaks.push({ band: h.y - high, under: low - h.y, side: Math.abs(h.x - middle), ahead: h.z - front.z })
      }
    }
    await act(async () => root.unmount())
    // a bite every few seconds over the whole meal
    expect(peaks.length).toBeGreaterThanOrEqual(Math.floor(cfg.eatSeconds / cfg.biteSeconds) - 1)
    // the hand never rises over the mouth band, and at EVERY bite it is in it,
    // in front of the mouth and close to it
    expect(overBand).toBeLessThan(0)
    for (const p of peaks) {
      expect(p.band).toBeLessThan(0)
      expect(p.under).toBeLessThan(0)
      expect(p.side).toBeLessThan(MOUTH_SIDE)
      expect(p.ahead).toBeGreaterThan(0)
      expect(p.ahead).toBeLessThan(MOUTH_AHEAD)
    }
  }, 120_000)
})
