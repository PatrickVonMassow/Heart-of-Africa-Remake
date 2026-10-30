// @vitest-environment node
// A head load is portalled onto the rig's crown. When the rig is rebuilt in
// place (the glTF arriving after mount, a preset changing the radial segments)
// the load must move to the NEW crown: left on the old one it hangs on an
// undrawn skeleton and the drawn carrier walks with nothing on the head.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import * as THREE from 'three/webgpu'
import { createRoot, extend } from '@react-three/fiber'
import { beforeAll, expect, it } from 'vitest'
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

it('keeps the head load on the drawn crown across a rig rebuilt in place', async () => {
  const look = (radial: number, villager: VillagerAsset | null): FigureLook => ({
    peopleId: 'zulu',
    drivers: { coldness: 0, harmattan: 0, karif: 0 },
    year: 1890,
    palette: PALETTE,
    radial,
    villager,
  })
  const scene = new THREE.Group()
  const Stage = ({ l }: { l: FigureLook }) => (
    <primitive object={scene}>
      <SkinnedFigure look={l} cloth={PALETTE[0]} scale={1} identityKey="head-load-probe"
        headProp={<mesh name="basket"><boxGeometry /></mesh>} />
    </primitive>
  )
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })

  // the crown the drawn body carries, and what hangs under it
  const crownLoad = () => {
    const crowns: THREE.Object3D[] = []
    scene.traverse((o) => o.name === 'figure-crown' && crowns.push(o))
    expect(crowns).toHaveLength(1)
    return crowns[0].children.map((o) => o.name)
  }
  // code-built skinned body first, then the glTF arriving, then a preset change
  for (const l of [look(16, null), look(16, asset), look(24, asset)]) {
    await act(async () => root.render(<Stage l={l} />))
    expect(crownLoad()).toEqual(['basket'])
  }
  await act(async () => root.unmount())
})
