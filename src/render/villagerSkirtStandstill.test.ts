// @vitest-environment node
// θ at the rest standstill with a driven form worn (stage-3 plan 3.5.z):
// the driver, stepped at rest from its gravity start, keeps every segment
// within 5° (owner decision 03.11.2026 23:20, stop rule 4). Red as measured in plan 3.5.z.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { DressLayer } from '../systems/appearance'
import { clipLayers, applyClipLayers, stepClipLayers } from '../scenes/place/gltfClipLayers'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { createGltfSkeleton, drivenFigure, gltfPerson } from './villagerFigureBody'
import { ColumnDriver, columnRig } from './villagerSkirtDriver'

const LIMIT_DEG = 5
let asset: VillagerAsset
beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const layer = (form: string): DressLayer => ({ slot: 'hip', form, wear: 'waist', material: 'cotton', colour: '#888888', colour2: null, pattern: 'plain', source: { guess: 'standstill' } }) as DressLayer

describe('driven columns at the rest standstill', () => {
  const people = [['male', 'adult'], ['female', 'child'], ['male', 'elder']] as const
  for (const form of ['loinFlap', 'girdleTails']) {
    for (const [sex, age] of people) {
      it(`${sex} ${age} ${form}: every segment within ${LIMIT_DEG}°`, () => {
        const person = gltfPerson(asset, sex, age, 0)
        const driven = drivenFigure(asset, person, [layer(form)])
        expect(driven).not.toBeNull()
        const { skeleton, bones } = createGltfSkeleton(asset, driven!.rest)
        const d = new ColumnDriver(columnRig(asset, { ...person, rest: driven!.rest, columnAnkles: driven!.columnAnkles }, driven!.form))
        const c = clipLayers(asset)
        const dt = 1 / 60
        for (let f = 0; f < 120; f++) {
          stepClipLayers(asset, person, c, 0, 0, { x: 0, z: 0, yaw: 0, unit: 1 }, null, dt)
          applyClipLayers(asset, person, bones, c, { speed: 0, weight: 0, kneel: 0 }, [true, true])
          d.step(skeleton.bones, dt)
        }
        const deg = Array.from(d.theta, (t) => (t * 180) / Math.PI)
        console.log(`standstill ${sex} ${age} ${form}: θ° ${deg.map((x) => x.toFixed(1)).join(' ')} (joint searches ${d.counters.jointSearches})`)
        expect(Math.max(...deg.map(Math.abs))).toBeLessThanOrEqual(LIMIT_DEG)
      }, 120_000)
    }
  }
})
