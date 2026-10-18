// @vitest-environment node
// A contact's crouch is chosen on the established body: the clips as the base,
// the dig's share and the posed clavicles are on before the crouch is tried
// (natural-villager-motion step 8's one pipeline). Tried before them, the
// crouch was found against last frame's clavicles and a trunk without its
// clip base.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, useRef } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend, useFrame } from '@react-three/fiber'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { applyFigurePose, type FigureLimbs } from '../../render/figurePose'
import { fillPose, type FigurePose } from '../../render/gesture'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure } from './skinnedFigure'

/** The clavicle as each crouch try sees it, by try. */
const probe = { bone: null as THREE.Bone | null, seen: [] as THREE.Quaternion[], tried: 0, worst: 0 }
vi.mock('../../render/figureRig', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../render/figureRig')>()
  return {
    ...real,
    contactCrouch: (shortAt: (c: number) => number) =>
      real.contactCrouch((c) => {
        const short = shortAt(c)
        if (probe.bone) probe.seen.push(probe.bone.quaternion.clone())
        return short
      }),
  }
})

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

describe("a contact's crouch", () => {
  it('is tried on the fully established pose: the clavicles posed this frame, not the last', async () => {
    const look: FigureLook = { peopleId: 'baganda', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, palette: PALETTE, radial: 16, villager: asset }
    const group = new THREE.Group()
    let frame = 0
    function Stage() {
      const pose = useRef<FigurePose | null>(null)
      const limbs = useRef<FigureLimbs | null>(null)
      // the caller's frame after the figure's, as PlaceLife's: a reach down to
      // the jar whose clavicles swing forward and back every other frame
      useFrame(() => {
        frame++
        const p = 0.15 + (0.15 * frame) / 30
        const fwd = frame % 2 ? 0.25 : 0
        if (!probe.bone) return
        pose.current = { ...fillPose(p), shoulders: { left: { protraction: fwd, elevation: 0 }, right: { protraction: fwd, elevation: 0 } } }
        probe.seen = []
        applyFigurePose(limbs.current, pose.current)
        // every try of this retarget saw the clavicle it ends with
        for (const q of probe.seen) probe.worst = Math.max(probe.worst, ...[0, 1, 2, 3].map((c) => Math.abs(q.toArray()[c] - probe.bone!.quaternion.toArray()[c])))
        probe.tried += probe.seen.length
      })
      return (
        <primitive object={group}>
          <SkinnedFigure look={look} cloth={PALETTE[0]} scale={1} sex="female" age="adult" identityKey="crouch-probe" pose={pose} limbs={limbs} />
        </primitive>
      )
    }
    const root = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
    await act(async () => root.render(<Stage />))
    const mesh = group.getObjectByName('figure-body') as THREE.SkinnedMesh
    probe.bone = mesh.skeleton.bones.find((b) => b.name === 'bone-shoulder.L') ?? null
    expect(probe.bone).not.toBeNull()
    for (let k = 1; k <= 30; k++) act(() => advance(k / 60))
    await act(async () => root.unmount())
    expect(probe.tried).toBeGreaterThan(10)
    expect(probe.worst).toBeLessThan(1e-9)
  })
})
