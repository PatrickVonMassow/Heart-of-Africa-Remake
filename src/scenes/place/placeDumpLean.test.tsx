// @vitest-environment node
// The dump's lean is the one DRAWN at the moment of the report (cross-vendor
// review of the place dump): a figure whose pose changes its lean from one
// frame to the next must report the new lean beside the new crown, never the
// lean of the frame before. Read on the real primitive and glTF bodies.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act, type RefObject } from 'react'
import * as THREE from 'three/webgpu'
import { advance, createRoot, extend } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { REST_POSE, type FigurePose } from '../../render/gesture'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { Figure } from './placeFigure'
import { FigureLookContext, type FigureLook } from './placeFigureContext'
import { figureSnapshot } from './placeDumpRead'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const PALETTE = ['#3a5a8a', '#8a4a2a', '#c2b090']
let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

async function leansAcrossAChange(look: FigureLook | null): Promise<{ before: number | null; after: number | null }> {
  const group = new THREE.Group()
  const pose: RefObject<FigurePose | null> = { current: { ...REST_POSE, left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0.1 } }
  function Stage() {
    return (
      <FigureLookContext.Provider value={look}>
        <primitive object={group}>
          <Figure cloth={PALETTE[0]} sex="male" age="adult" pose={pose} />
        </primitive>
      </FigureLookContext.Provider>
    )
  }
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () => root.render(<Stage />))
  for (let k = 1; k <= 3; k++) act(() => advance(k / 30))
  const before = figureSnapshot(group, { id: 'probe' }).pose.lean
  // The gesture moves on: one frame later the body leans further.
  pose.current!.lean = 0.45
  act(() => advance(4 / 30))
  const after = figureSnapshot(group, { id: 'probe' }).pose.lean
  await act(async () => root.unmount())
  return { before, after }
}

describe('the lean the place dump reports', () => {
  it('is the primitive figure\'s lean of this frame, not the last one', async () => {
    const { before, after } = await leansAcrossAChange(null)
    expect(before).toBeCloseTo(0.1, 6)
    expect(after).toBeCloseTo(0.45, 6)
  })

  it('is the glTF figure\'s lean of this frame, not the last one', async () => {
    const look: FigureLook = { peopleId: 'baganda', drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, palette: PALETTE, radial: 16, villager: asset }
    const { before, after } = await leansAcrossAChange(look)
    expect(before).toBeCloseTo(0.1, 6)
    expect(after).toBeCloseTo(0.45, 6)
  })
})
