// @vitest-environment node
// The shell garments (render/villagerShell.ts) on the committed glTF villager:
// recipes in the file, built on the drawn body at the figure's scale, the body
// and the shells cut by the region bits and the legacy mask, one rim strip per
// seam (docs/garment-merge-r9-1347.md, stage 1).
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { VILLAGER_ASSET } from '../config/balance'
import { PEOPLE_DRESS, type DressLayer } from '../systems/appearance'
import { paint, tidy } from './figureBody'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { garmentMeshName, gltfFigureGeometry, gltfLayerGeometry, gltfPerson, gltfShellParts, type GltfPerson } from './villagerFigureBody'
import { applyGarmentMask, decodeCover, GARMENT_PUSH_ATTRIBUTE, wornBits } from './villagerGarmentMask'
import { faceMasks } from './villagerShell'

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const SHELLS = ['g-trousers-waist', 'g-breastCloth-chest', 'g-neckBeads-neck', 'g-neckBeads-chest', 'g-waistBeads-waist']
const base = PEOPLE_DRESS.hausa.male.adult[0]
const layer = (name: string): DressLayer => {
  const [, form, wear] = name.split('-')
  const slot = form === 'trousers' ? 'hip' : form === 'breastCloth' || form === 'shirt' || form === 'robe' ? 'torso' : form === 'loinFlap' ? 'hip' : 'ornament'
  return { ...base, slot, form, wear } as DressLayer
}

/** The painted, masked body part the figure starts from (legacy garments `worn`). */
const bodyPart = (person: GltfPerson, worn: string[]) =>
  applyGarmentMask(tidy(paint(person.geometry.clone(), '#5c3317')), person.cover, asset.garmentMask, worn, VILLAGER_ASSET.garmentMaskPush * person.frame.scale)

describe('the shell garments in the file', () => {
  it('ships the five shells as recipes in bit order, no mesh, and a region word per body vertex carrying each row', () => {
    expect(asset.shells).not.toBeNull()
    const set = asset.shells!
    expect([...set.bits].sort()).toEqual([...SHELLS].sort())
    set.bits.forEach((n, k) => expect(set.garments[n].bit).toBe(k))
    for (const n of SHELLS) expect(asset.geometries[n]).toBeUndefined()
    expect(set.step).toBeCloseTo(VILLAGER_ASSET.garmentShellStep)
    const person = gltfPerson(asset, 'female', 'adult')
    expect(person.region!.length).toBe(person.geometry.getAttribute('position').count)
    // every row vertex carries its shell's bit (bit order agrees with the words)
    for (const n of SHELLS) {
      const r = set.garments[n]
      expect(r.rows.length).toBeGreaterThanOrEqual(2)
      for (const loop of r.rows) for (const v of loop) expect(person.region![v] & (1 << r.bit), n).toBeTruthy()
    }
  })
})

describe('a worn shell on the drawn body', () => {
  it('sits at (base + rank × step) × scale along the body normal, with its source skin, normal and push and zero live morphs', () => {
    for (const [sex, age] of [
      ['female', 'adult'],
      ['male', 'child'],
    ] as const) {
      const person = gltfPerson(asset, sex, age)
      const body = bodyPart(person, [])
      const parts = gltfShellParts(asset, person, SHELLS.map(layer), body, [])
      expect(parts.map((p) => garmentMeshName(p.l)).sort()).toEqual([...SHELLS].sort())
      const P = person.geometry.getAttribute('position') as THREE.BufferAttribute
      const N = person.geometry.getAttribute('normal') as THREE.BufferAttribute
      const bodyNames = Object.keys(body.attributes).sort()
      for (const { l, built, geometry: g } of parts) {
        const r = asset.shells!.garments[garmentMeshName(l)]
        const off = (r.base + r.rank * asset.shells!.step) * person.frame.scale
        const pos = g.getAttribute('position') as THREE.BufferAttribute
        const nor = g.getAttribute('normal') as THREE.BufferAttribute
        const push = g.getAttribute(GARMENT_PUSH_ATTRIBUTE) as THREE.BufferAttribute
        for (let k = 0; k < built.src.length; k++) {
          const s = built.src[k]
          expect(built.off[k]).toBeLessThanOrEqual(off + 1e-7)
          for (let c = 0; c < 3; c++) {
            expect(pos.getComponent(k, c)).toBeCloseTo(P.getComponent(s, c) + built.off[k] * N.getComponent(s, c), 6)
            expect(nor.getComponent(k, c)).toBe(N.getComponent(s, c))
          }
          for (let c = 0; c < 4; c++) {
            expect(g.getAttribute('skinIndex').getComponent(k, c)).toBe(body.getAttribute('skinIndex').getComponent(s, c))
            expect(g.getAttribute('skinWeight').getComponent(k, c)).toBe(body.getAttribute('skinWeight').getComponent(s, c))
          }
          expect(push.getX(k)).toBe(body.getAttribute(GARMENT_PUSH_ATTRIBUTE).getX(s))
        }
        expect(Math.max(...built.off)).toBeCloseTo(off, 6)
        expect(Object.keys(g.attributes).sort()).toEqual(bodyNames)
        expect(g.morphTargetsRelative).toBe(true)
        const targets = g.morphAttributes.position ?? []
        expect(targets.map((m) => m.name)).toEqual((body.morphAttributes.position ?? []).map((m) => m.name))
        for (const m of targets) expect((m.array as Float32Array).every((x) => x === 0)).toBe(true)
      }
    }
  })

  it('closes every seam with exactly one rim strip, owned by the higher shell, its inner row on the lower shell', () => {
    const person = gltfPerson(asset, 'female', 'adult')
    for (const worn of [['g-waistBeads-waist', 'g-trousers-waist'], ['g-neckBeads-neck', 'g-neckBeads-chest'], ['g-breastCloth-chest', 'g-neckBeads-chest'], SHELLS]) {
      const parts = gltfShellParts(asset, person, worn.map(layer), bodyPart(person, []), [])
      const quads = new Map<string, number>()
      const at = new Map<string, Set<string>>()
      for (const { l, built } of parts) at.set(garmentMeshName(l), new Set([...built.src].map((s, k) => `${s}|${built.off[k].toFixed(6)}`)))
      for (const { l, built } of parts) {
        const r = asset.shells!.garments[garmentMeshName(l)]
        for (let f = 0; f < built.rim.length; f += 2) {
          if (!built.rim[f]) continue
          const [ah, al, bl] = [built.index[f * 3], built.index[f * 3 + 1], built.index[f * 3 + 2]]
          const e = `${Math.min(built.src[ah], built.src[bl])}|${Math.max(built.src[ah], built.src[bl])}`
          quads.set(e, (quads.get(e) ?? 0) + 1)
          const inner = built.off[al]
          if (inner > 0) {
            // a covered seam: the inner row is a lower worn shell's own vertex
            const lower = parts.filter((p) => asset.shells!.garments[garmentMeshName(p.l)].rank < r.rank)
            expect(lower.some((p) => at.get(garmentMeshName(p.l))!.has(`${built.src[al]}|${inner.toFixed(6)}`)), `${worn.join('+')}`).toBe(true)
          }
        }
      }
      expect(quads.size, worn.join('+')).toBeGreaterThan(0)
      expect([...quads.values()].every((n) => n === 1), worn.join('+')).toBe(true)
    }
  })
})

describe('the figure with shells', () => {
  it('never hands a shell layer to layerOf, and gltfLayerGeometry gives none for it without logging', () => {
    const person = gltfPerson(asset, 'male', 'adult')
    const err = vi.spyOn(console, 'error').mockImplementation(() => {})
    const asked: string[] = []
    const layers = [layer('g-trousers-waist'), layer('g-shirt-chest')]
    gltfFigureGeometry(asset, person, layers, '#5c3317', null, 16, (l) => {
      asked.push(garmentMeshName(l))
      return gltfLayerGeometry(asset, person, l)
    })
    expect(asked).toEqual(['g-shirt-chest'])
    expect(gltfLayerGeometry(asset, person, layer('g-waistBeads-waist'))).toBeNull()
    expect(err).not.toHaveBeenCalled()
    err.mockRestore()
  })

  it('cuts the body under the worn shells and where the legacy garment hides it; a shell hides and is pushed with its sources', () => {
    const person = gltfPerson(asset, 'male', 'adult')
    const shirt = layer('g-shirt-chest')
    const trousers = layer('g-trousers-waist')
    const fig = gltfFigureGeometry(asset, person, [trousers, shirt], '#5c3317', null, 16)
    const index = person.geometry.getIndex()!.array as ArrayLike<number>
    const fmask = faceMasks(index, person.region!)
    const hidden = decodeCover(person.cover!, wornBits(asset.garmentMask, ['g-shirt-chest'])).hidden
    const bit = 1 << asset.shells!.garments['g-trousers-waist'].bit
    let bodyFaces = 0
    let shellFaces = 0
    let shellHidden = 0
    for (let f = 0; f < fmask.length; f++) {
      const all = hidden[index[f * 3]] && hidden[index[f * 3 + 1]] && hidden[index[f * 3 + 2]]
      if (fmask[f] & bit) {
        if (all) shellHidden++
        else shellFaces++
      } else if (!all) bodyFaces++
    }
    // the shirt hides part of the trousers' seat: those shell faces are cut
    expect(shellHidden).toBeGreaterThan(0)
    const parts = gltfShellParts(asset, person, [trousers], bodyPart(person, ['g-shirt-chest']), ['g-shirt-chest'])
    const b = parts[0].built
    expect([...b.rim].filter((r) => !r).length).toBe(shellFaces)
    const shirtTris = asset.geometries['g-shirt-chest'].index!.count / 3
    const figTris = fig.index!.count / 3
    // body faces + shell faces and rims + the shirt's own (its cover may cut some of them)
    expect(figTris).toBeLessThanOrEqual(bodyFaces + b.rim.length + shirtTris)
    expect(figTris).toBeGreaterThan(bodyFaces + b.rim.length)
    // shell push = its sources' push under the shirt
    const g = parts[0].geometry
    expect((g.getAttribute(GARMENT_PUSH_ATTRIBUTE).array as Float32Array).some((x) => x > 0)).toBe(true)
  })
})
