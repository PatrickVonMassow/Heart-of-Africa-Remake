// @vitest-environment node
// Reproduction (point 1447): the figure geometry caches are keyed per person,
// dress layer and village palette, so visiting village after village only ever
// grew them — the CPU arrays of every figure built this session stayed on the
// heap (~120 MB per village measured). Leaving a place now drops them.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { act } from 'react'
import * as THREE from 'three/webgpu'
import { createRoot, extend } from '@react-three/fiber'
import { beforeAll, describe, expect, it } from 'vitest'
import { parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import type { FigureLook } from './placeFigureContext'
import { SkinnedFigure, figureCacheSize, releaseFigureCaches } from './skinnedFigure'

extend(THREE as unknown as Parameters<typeof extend>[0])
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const VILLAGES = [
  { peopleId: 'bambara', palette: ['#3a5a8a', '#8a4a2a', '#c2b090'] },
  { peopleId: 'hausa', palette: ['#5a3a8a', '#2a8a4a', '#b0c290'] },
  { peopleId: 'zulu', palette: ['#8a3a3a', '#4a2a8a', '#90b0c2'] },
]

async function visit(v: (typeof VILLAGES)[number], i: number) {
  const look: FigureLook = {
    peopleId: v.peopleId,
    drivers: { coldness: 0, harmattan: 0, karif: 0 },
    year: 1890,
    palette: v.palette,
    radial: 16,
    villager: asset,
  }
  const scene = new THREE.Group()
  const root = createRoot({} as HTMLCanvasElement)
  const gl = { render() {}, setSize() {}, setPixelRatio() {}, domElement: {} }
  await root.configure({ gl: gl as never, frameloop: 'never', size: { width: 1, height: 1, top: 0, left: 0 } })
  await act(async () =>
    root.render(
      <primitive object={scene}>
        {(['female', 'male'] as const).map((sex) => (
          <SkinnedFigure key={sex} look={look} cloth={v.palette[0]} scale={1} sex={sex} age="adult" identityKey={`v${i}-${sex}`} />
        ))}
      </primitive>,
    ),
  )
  await act(async () => root.unmount())
}

describe('figure caches across village visits', () => {
  it('grow with every village while nothing releases them', async () => {
    releaseFigureCaches()
    const sizes: number[] = []
    for (const [i, v] of VILLAGES.entries()) {
      await visit(v, i)
      sizes.push(figureCacheSize())
    }
    expect(sizes[1]).toBeGreaterThan(sizes[0])
    expect(sizes[2]).toBeGreaterThan(sizes[1])
  })

  it('stay bounded by one village when each leave releases them', async () => {
    releaseFigureCaches()
    const sizes: number[] = []
    for (const [i, v] of VILLAGES.entries()) {
      await visit(v, i)
      sizes.push(figureCacheSize())
      expect(releaseFigureCaches()).toBe(sizes[i])
      expect(figureCacheSize()).toBe(0)
    }
    expect(Math.max(...sizes)).toBeLessThan(sizes[0] * 2)
  })
})
