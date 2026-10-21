// @vitest-environment node
// The body pre-split on the committed asset (docs/garment-merge-r10-1347.md):
// in the hung adult man and woman every cut vertex lies on its parent point of
// the band-subdivided reference surface, whose corners the cut keeps as the
// body's first n0 vertices (scripts/villager/pipeline.py `split_parents`).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { parseVillager } from './villagerAsset'
import { gltfPerson } from './villagerFigureBody'

const root = resolve(__dirname, '../..')
const split = JSON.parse(readFileSync(resolve(root, 'verification/villager-body/split-parents.json'), 'utf8')) as {
  n0: number
  parents: number[][]
  bary: number[][]
}

const load = async () => {
  const buf = readFileSync(resolve(root, 'public/models/villager.glb'))
  return parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
}

describe('villager body pre-split', () => {
  it('ships the reference vertices first and one parent per cut vertex', async () => {
    const asset = await load()
    const count = asset.geometries.body.getAttribute('position').count
    expect(split.parents.length).toBeGreaterThan(0)
    expect(split.n0 + split.parents.length).toBe(count)
    for (const p of split.parents) for (const c of p) expect(c).toBeLessThan(split.n0)
  })

  for (const sex of ['male', 'female'] as const) {
    it(`keeps every cut vertex of the hung adult ${sex === 'male' ? 'man' : 'woman'} within 1 mm of the reference`, async () => {
      const person = gltfPerson(await load(), sex, 'adult')
      const pos = person.geometry.getAttribute('position') as THREE.BufferAttribute
      const p = new THREE.Vector3()
      const q = new THREE.Vector3()
      const c = new THREE.Vector3()
      let worst = 0
      let at = -1
      split.parents.forEach((tri, k) => {
        q.set(0, 0, 0)
        tri.forEach((v, j) => q.addScaledVector(c.fromBufferAttribute(pos, v), split.bary[k][j]))
        const d = p.fromBufferAttribute(pos, split.n0 + k).distanceTo(q)
        if (d > worst) {
          worst = d
          at = split.n0 + k
        }
      })
      // 1 mm in pipeline figure units, in the person's drawn units
      expect(worst, `cut vertex ${at}`).toBeLessThan(0.001 * person.frame.scale)
    })
  }
})
