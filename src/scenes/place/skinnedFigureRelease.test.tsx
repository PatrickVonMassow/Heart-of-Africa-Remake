// @vitest-environment node
// The glTF figure geometry carries the live hand morphs, and three/webgpu keeps
// one morph DataArrayTexture per such geometry until the geometry is disposed.
// The geometry is shared through skinnedFigure.tsx's caches: it must be
// released (disposed, freeing that texture) when the LAST figure drawing it
// unmounts — leaving a settlement — and never while one still draws it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import * as THREE from 'three/webgpu'
import { createRoot, extend } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
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

describe('shared figure geometry release', () => {
  it('disposes the morph-carrying geometry when its last figure unmounts, and again after a re-entry', async () => {
    const look: FigureLook = {
      peopleId: 'bambara',
      drivers: { coldness: 0, harmattan: 0, karif: 0 },
      year: 1890,
      palette: PALETTE,
      radial: 16,
      villager: asset,
    }
    const scene = new THREE.Group()
    // two figures of one identity share one cached geometry
    const Stage = ({ n }: { n: number }) => (
      <primitive object={scene}>
        {Array.from({ length: n }, (_, k) => (
          <group key={k} name={`fig-${k}`}>
            <SkinnedFigure look={look} cloth={PALETTE[0]} scale={1} sex="female" age="adult" identityKey="release-probe" />
          </group>
        ))}
      </primitive>
    )
    const root = createRoot({} as HTMLCanvasElement)
    const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
    await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })

    await act(async () => root.render(<Stage n={2} />))
    const bodies: THREE.SkinnedMesh[] = []
    scene.traverse((o) => o.name === 'figure-body' && bodies.push(o as THREE.SkinnedMesh))
    expect(bodies).toHaveLength(2)
    const geo = bodies[0].geometry
    expect(bodies[1].geometry).toBe(geo)
    // the reason this matters: the hand morphs are what three keeps a texture for
    expect(geo.morphAttributes.position?.length ?? 0).toBeGreaterThan(0)
    let disposed = 0
    geo.addEventListener('dispose', () => disposed++)

    await act(async () => root.render(<Stage n={1} />))
    expect(disposed).toBe(0) // one figure still draws it

    await act(async () => root.render(<Stage n={0} />))
    expect(disposed).toBe(1) // place left: released

    // re-entry draws the same cached geometry, released again on the next leave
    await act(async () => root.render(<Stage n={2} />))
    const again = scene.getObjectByName('figure-body') as THREE.SkinnedMesh
    expect(again.geometry).toBe(geo)
    expect(disposed).toBe(1)
    await act(async () => root.unmount())
    expect(disposed).toBe(2)
  })
})
