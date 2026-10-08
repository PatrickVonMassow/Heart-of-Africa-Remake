// @vitest-environment node
// The garment cover mask: the game's decode of villager.glb's _COVER gives
// what the pipeline measured with (verification/villager-body/
// garment-mask-check.json, scripts/villager/mask.py `check`), the hidden
// triangles leave the index, and the vertex shader's push input is the
// covered vertices' depth — zero while no pipeline garment is worn.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../config/balance'
import { PEOPLE_DRESS } from '../systems/appearance'
import { figureMaterial } from './figureDress'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { gltfFigureGeometry, gltfPerson } from './villagerFigureBody'
import {
  applyGarmentMask,
  COVER_ATTRIBUTE,
  decodeCover,
  GARMENT_PUSH_ATTRIBUTE,
  garmentPush,
  maskedIndex,
  wornBits,
} from './villagerGarmentMask'

interface Check {
  garments: string[]
  vertices: number
  triangles: number
  sets: { worn: string[]; hidden: number; covered: number; drawnTriangles: number; coveredIds: number[] }[]
}

let asset: VillagerAsset
const check = JSON.parse(readFileSync(resolve(__dirname, '../../verification/villager-body/garment-mask-check.json'), 'utf8')) as Check

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

describe('the cover mask decode', () => {
  it('splits the worn garments into the two 16-bit halves', () => {
    const order = Array.from({ length: 32 }, (_, k) => `g-x${k}`)
    expect(wornBits(order, ['g-x0', 'g-x3'])).toEqual({ lo: 0b1001, hi: 0 })
    expect(wornBits(order, ['g-x16', 'g-x31', 'g-unknown'])).toEqual({ lo: 0, hi: 1 | (1 << 15) })
  })

  it('reads hide and push bits per vertex; a hidden vertex is covered too', () => {
    // v0 hidden by garment 0, v1 pushed by garment 17, v2 pushed by 0, v3 hidden by 17
    const cover = new Uint16Array([1, 0, 0, 0, 0, 0, 0, 2, 0, 0, 1, 0, 0, 2, 0, 0])
    const g17 = decodeCover(cover, { lo: 0, hi: 2 })
    expect(Array.from(g17.hidden)).toEqual([0, 0, 0, 1])
    expect(Array.from(g17.covered)).toEqual([0, 1, 0, 1])
    const g0 = decodeCover(cover, { lo: 1, hi: 0 })
    expect(Array.from(g0.hidden)).toEqual([1, 0, 0, 0])
    expect(Array.from(g0.covered)).toEqual([1, 0, 1, 0])
    expect(Array.from(decodeCover(cover, { lo: 0, hi: 0 }).covered)).toEqual([0, 0, 0, 0])
  })

  it('drops only the triangles whose three corners are hidden', () => {
    const hidden = new Uint8Array([1, 1, 1, 0])
    expect(Array.from(maskedIndex([0, 1, 2, 0, 2, 3, 4, 5, 6], hidden))).toEqual([0, 2, 3, 4, 5, 6])
  })

  it('pushes the covered vertices by the depth, every other vertex by 0', () => {
    expect(Array.from(garmentPush(5, new Uint8Array([0, 1, 1]), 0.25))).toEqual([0, 0.25, 0.25, 0, 0])
  })
})

describe('villager.glb carries the pipeline mask', () => {
  it('has the garment order and one mask per body vertex', () => {
    expect(asset.garmentMask).toEqual(check.garments)
    const cov = asset.geometries.body.getAttribute(COVER_ATTRIBUTE)
    expect(cov.itemSize).toBe(4)
    expect(cov.count).toBe(check.vertices)
    expect(asset.geometries.body.index!.count / 3).toBe(check.triangles)
  })

  it('decodes for every single garment and outfit as the pipeline measured', () => {
    const cov = asset.geometries.body.getAttribute(COVER_ATTRIBUTE).array as ArrayLike<number>
    const index = asset.geometries.body.index!.array
    expect(check.sets.length).toBeGreaterThan(check.garments.length)
    for (const s of check.sets) {
      const { hidden, covered } = decodeCover(cov, wornBits(asset.garmentMask, s.worn))
      expect(hidden.reduce((a, b) => a + b, 0), s.worn.join('+')).toBe(s.hidden)
      expect(covered.reduce((a, b) => a + b, 0), s.worn.join('+')).toBe(s.covered)
      expect(maskedIndex(index, hidden).length / 3, s.worn.join('+')).toBe(s.drawnTriangles)
      const ids = [...covered.keys()].filter((i) => covered[i]).slice(0, 16)
      expect(ids).toEqual(s.coveredIds)
    }
  })

  it('a long garment hides much of the body; skin at its openings stays drawn', () => {
    const robe = check.sets.find((s) => s.worn.length === 1 && s.worn[0] === 'g-robe-chest')!
    expect(robe.hidden).toBeGreaterThan(100)
    expect(robe.covered).toBeGreaterThan(robe.hidden)
    expect(robe.drawnTriangles).toBeLessThan(check.triangles)
  })
})

describe('the figure geometry and the vertex shader input', () => {
  it('a mask the worn garments hide leaves the index, its covered vertices get the push', () => {
    const person = gltfPerson(asset, 'male', 'adult')
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', person.geometry.getAttribute('position').clone())
    g.setIndex(person.geometry.index!.clone())
    const depth = Math.fround(0.01)
    applyGarmentMask(g, person.cover, asset.garmentMask, ['g-robe-chest'], depth)
    const robe = check.sets.find((s) => s.worn.length === 1 && s.worn[0] === 'g-robe-chest')!
    expect(g.index!.count / 3).toBe(robe.drawnTriangles)
    const push = g.getAttribute(GARMENT_PUSH_ATTRIBUTE).array as Float32Array
    expect(push.filter((x) => x === depth).length).toBe(robe.covered)
    expect(push.filter((x) => x !== 0 && x !== depth).length).toBe(0)
  })

  it('every glTF figure carries the push, zero while it wears no pipeline garment', () => {
    const person = gltfPerson(asset, 'female', 'adult')
    const layers = Object.values(PEOPLE_DRESS)[0].female.adult
    const g = gltfFigureGeometry(asset, person, layers, '#6b4a33', null, 8)
    const push = g.getAttribute(GARMENT_PUSH_ATTRIBUTE)
    expect(push.count).toBe(g.getAttribute('position').count)
    expect((push.array as Float32Array).every((x) => x === 0)).toBe(true)
    expect(g.index!.count).toBeGreaterThanOrEqual(person.geometry.index!.count)
  })

  it('the masked figure material moves the position by the push; the plain one does not', () => {
    expect(figureMaterial(true)).toBe(figureMaterial(true))
    expect(figureMaterial(true)).not.toBe(figureMaterial())
    expect(figureMaterial(true).positionNode).toBeTruthy()
    expect(figureMaterial().positionNode).toBeFalsy()
    expect(VILLAGER_ASSET.garmentMaskPush).toBeGreaterThan(0)
    expect(VILLAGER_ASSET.garmentMaskPush).toBeLessThan(0.01)
  })
})
