// @vitest-environment node
// The driven garments' column bones (docs/garment-stage3-plan-1398.md sections
// 3.1 and 3.2, sub-step 1): appended after the 22 joint bones without moving
// one, written by no clip and no clip layer, never scaled, and their runtime
// knee and ankle pivots at the hung landmarks of every person.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { clipBones, isColumnBone, parseVillager, type VillagerAsset } from '../../render/villagerAsset'
import { createGltfSkeleton, gltfPerson, type GltfPerson } from '../../render/villagerFigureBody'
import { AGE_GROUPS, SEXES } from '../../systems/appearance'
import { applyClipLayers, clipLayers, stepClipLayers } from './gltfClipLayers'

/** The joint bones in their file order: every index a skin or clip reads. */
const JOINT_BONES = [
  'hips', 'spine', 'spine1', 'chest', 'neck', 'head',
  'upperArm.L', 'forearm.L', 'hand.L', 'upperArm.R', 'forearm.R', 'hand.R',
  'thigh.L', 'shin.L', 'foot.L', 'thigh.R', 'shin.R', 'foot.R',
  'shoulder.L', 'shoulder.R', 'toe.L', 'toe.R',
]

let asset: VillagerAsset
let person: GltfPerson

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  person = gltfPerson(asset, 'female', 'adult', 0)
})

const columnNames = () => asset.bones.filter(isColumnBone)

describe('the column bones of the villager skeleton', () => {
  it('come after the 22 joint bones, whose indices stay 0 … 21', () => {
    expect(asset.bones.slice(0, 22)).toEqual(JOINT_BONES)
    expect(asset.bones).toHaveLength(46)
    expect(columnNames()).toEqual(asset.bones.slice(22))
    expect(clipBones(asset)).toEqual(JOINT_BONES)
  })

  it('hang twelve columns of two segments on the hips, as extras.villager.columns says', () => {
    const c = asset.columns!
    expect(c).not.toBeNull()
    expect(c.count).toBe(12)
    expect(c.segments).toBe(2)
    expect(c.angles).toHaveLength(12)
    expect(c.angles[0]).toBe(0)
    for (let k = 0; k < 12; k++) {
      const u = asset.bones.indexOf(c.bones.upper[k])
      const l = asset.bones.indexOf(c.bones.lower[k])
      expect(c.bones.upper[k]).toBe(`col.U.${k}`)
      expect(asset.parents[u]).toBe(asset.bones.indexOf('hips'))
      expect(asset.parents[l]).toBe(u)
      // the reference: knee pivot straight below the girdle head
      expect(asset.rest[l * 3]).toBeCloseTo(asset.rest[u * 3], 6)
      expect(asset.rest[l * 3 + 2]).toBeCloseTo(asset.rest[u * 3 + 2], 6)
      expect(asset.rest[l * 3 + 1]).toBeLessThan(asset.rest[u * 3 + 1])
    }
    expect(Object.keys(c.capsules).sort()).toEqual(['foot.L', 'foot.R', 'shin.L', 'shin.R', 'thigh.L', 'thigh.R', 'toe.L', 'toe.R'])
  })

  it('carry no clip channel, and skin weight only on the driven panels', () => {
    const cols = columnNames().map((n) => asset.bones.indexOf(n))
    for (const clip of Object.values(asset.clips)) for (const i of cols) expect(clip.rot[i]).toHaveLength(0)
    // the driven panels hang on the column bones by construction (plan section 3.8)
    const panels = new Set(Object.values(asset.driven).map((d) => d.panel))
    for (const [name, g] of Object.entries(asset.geometries)) {
      if (panels.has(name)) continue
      const si = g.getAttribute('skinIndex')
      const sw = g.getAttribute('skinWeight')
      if (!si || !sw) continue
      let carried = 0
      for (let k = 0; k < si.count; k++) for (let c = 0; c < 4; c++) if (cols.includes(si.getComponent(k, c)) && sw.getComponent(k, c) > 0) carried++
      expect(carried, name).toBe(0)
    }
  })

  it('no clip layer writes a column bone, and none is ever scaled', () => {
    const { bones } = createGltfSkeleton(asset, person.rest)
    const c = clipLayers(asset)
    const mark = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), 0.3)
    const dt = 1 / 30
    let z = 0
    const run = (frames: number, speed: number, work: { dig: boolean; tool: boolean } | null) => {
      for (let k = 0; k < frames; k++) {
        for (const n of JOINT_BONES) bones[n].quaternion.identity()
        for (const n of columnNames()) bones[n].quaternion.copy(mark)
        stepClipLayers(asset, person, c, speed * dt, speed, { x: 0, z: (z += speed * dt), yaw: 0, unit: 1 }, work, dt)
        applyClipLayers(asset, person, bones, c, { speed, weight: speed > 0 ? 1 : 0, kneel: 0 }, [true, true])
        for (const n of columnNames()) {
          expect(bones[n].quaternion.equals(mark), n).toBe(true)
          expect(bones[n].scale.toArray(), n).toEqual([1, 1, 1])
        }
      }
    }
    run(20, 0, null) // idle
    run(20, 1.1, null) // walk
    run(20, 1.1, { dig: false, tool: true }) // carry
    run(40, 0, { dig: true, tool: true }) // dig, eased in to full
    expect(c.dig).toBe(1)
  })

  it('pivot at the knee and ankle heights of every hung person (the DEV assertion\'s rule)', () => {
    for (const sex of SEXES) {
      for (const age of AGE_GROUPS) {
        for (const build of [-1, 0, 1]) {
          const p = gltfPerson(asset, sex, age, build)
          const y = (n: string) => p.rest[asset.bones.indexOf(n) * 3 + 1]
          const knee = 0.5 * (y('shin.L') + y('shin.R'))
          const ankle = 0.5 * (y('foot.L') + y('foot.R'))
          const lower = asset.columns!.bones.lower
          expect(p.columnAnkles).toHaveLength(lower.length * 3)
          lower.forEach((n, k) => {
            const i = asset.bones.indexOf(n)
            expect(Math.abs(y(n) - knee), `${sex} ${age} ${build} ${n}`).toBeLessThan(1e-4)
            expect(Math.abs(p.columnAnkles![k * 3 + 1] - ankle)).toBeLessThan(1e-4)
            expect(p.columnAnkles![k * 3]).toBeCloseTo(p.rest[i * 3], 6)
            expect(p.columnAnkles![k * 3 + 2]).toBeCloseTo(p.rest[i * 3 + 2], 6)
          })
        }
      }
    }
  })
})
