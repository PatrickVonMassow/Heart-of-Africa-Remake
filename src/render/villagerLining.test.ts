// @vitest-environment node
// No sensitive body part exposed (work-order point 1489, design.md "No
// sensitive body part exposed"): measured on the shipped villager.glb, every
// body vertex of a woman's bust, and of anyone's genital area and buttocks,
// that a worn covering garment is meant to cover takes that garment's colour
// as its lining — so a cloth standing off the body (a kneeling woman's breast
// cloth seen from the steep overhead camera, a flap lifted by the stride)
// opens a view onto lining, never onto skin. The colour is a vertex attribute,
// so what holds in the build pose holds in every pose and from every camera.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import type { AgeGroup, DressLayer, Sex } from '../systems/appearance'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { gltfFigureGeometry, gltfPerson, linesSkin } from './villagerFigureBody'

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const SKIN = '#8a5a3c'
const CLOTH = '#00ff00'
const layer = (slot: DressLayer['slot'], form: string, wear: string) =>
  ({ form, wear, slot, colour: CLOTH, material: 'cotton' }) as unknown as DressLayer

/** The vertex wears the cloth's colour (pure green; the skin is never green). */
const isCloth = (col: THREE.BufferAttribute, i: number) => {
  const c = new THREE.Color(CLOTH)
  return Math.abs(col.getX(i) - c.r) + Math.abs(col.getY(i) - c.g) + Math.abs(col.getZ(i) - c.b) < 1e-4
}

type Zone = 'breast' | 'genital' | 'buttocks'

/** The zones of a body (its build pose, the figure's frame), by the anatomy
 *  of the unmasked body: crotch = lowest midline point of the trunk, the
 *  bust's peak = most forward point over a breast; the buttocks end at the
 *  sacrum, a little over the hip joints (a low-slung skirt's band sits above
 *  them on the lower back). */
function zones(person: ReturnType<typeof gltfPerson>, sex: Sex, age: AgeGroup): Record<Zone, (i: number) => boolean> {
  const pos = person.geometry.getAttribute('position') as THREE.BufferAttribute
  const H = person.p.stature
  let crotch = Infinity
  let peakZ = -Infinity
  let peak = 0
  for (let i = 0; i < pos.count; i++) {
    const [px, py, pz] = [pos.getX(i), pos.getY(i), pos.getZ(i)]
    if (Math.abs(px) < 0.004 * H && py > 0.3 * H && py < 0.6 * H) crotch = Math.min(crotch, py)
    if (Math.abs(Math.abs(px) - 0.05 * H) < 0.01 * H && py > 0.6 * H && py < 0.8 * H && pz > peakZ) [peakZ, peak] = [pz, py]
  }
  const at = (i: number) => [pos.getX(i), pos.getY(i), pos.getZ(i)]
  return {
    breast: (i) => {
      const [px, py, pz] = at(i)
      return sex === 'female' && age !== 'child' && pz > 0.035 * H && Math.abs(px) < 0.085 * H && py > peak - 0.05 * H && py < peak + 0.02 * H
    },
    genital: (i) => {
      const [px, py, pz] = at(i)
      return pz > 0.02 * H && Math.abs(px) < 0.035 * H && py > crotch - 0.01 * H && py < crotch + 0.06 * H
    },
    buttocks: (i) => {
      const [px, py, pz] = at(i)
      return pz < -0.03 * H && Math.abs(px) < 0.08 * H && py > crotch && py < person.p.hipY + 0.025 * H
    },
  }
}

/** Every covering garment form, with the zones it is worn to cover. */
const GARMENTS: Array<{ l: DressLayer; covers: Zone[] }> = [
  { l: layer('torso', 'breastCloth', 'chest'), covers: ['breast'] },
  { l: layer('hip', 'wrapLong', 'chest'), covers: ['breast', 'genital', 'buttocks'] },
  { l: layer('shoulder', 'cape', 'chest'), covers: ['breast'] },
  { l: layer('shoulder', 'cloak', 'chest'), covers: ['breast'] },
  { l: layer('torso', 'shirt', 'chest'), covers: ['breast'] },
  { l: layer('torso', 'robe', 'chest'), covers: ['breast', 'genital', 'buttocks'] },
  { l: layer('torso', 'gown', 'chest'), covers: ['breast', 'genital', 'buttocks'] },
  { l: layer('hip', 'wrapLong', 'waist'), covers: ['genital', 'buttocks'] },
  { l: layer('hip', 'skirtKnee', 'waist'), covers: ['genital', 'buttocks'] },
  { l: layer('hip', 'skirtShort', 'waist'), covers: ['genital', 'buttocks'] },
  { l: layer('hip', 'loinFlap', 'waist'), covers: ['genital', 'buttocks'] },
  { l: layer('hip', 'apron', 'waist'), covers: ['genital', 'buttocks'] },
  { l: layer('hip', 'girdleTails', 'waist'), covers: ['genital', 'buttocks'] },
]

const BODIES: Array<[Sex, AgeGroup, number]> = [
  ['female', 'adult', -0.6],
  ['female', 'adult', 0],
  ['female', 'adult', 0.6],
  ['female', 'youth', 0],
  ['female', 'elder', 0],
  ['female', 'child', 0],
  ['male', 'adult', 0],
  ['male', 'child', 0],
]

describe('a covering garment lines the skin it covers', () => {
  it('lines the hip, torso and shoulder garments, not the hood, head pieces or ornaments', () => {
    expect(GARMENTS.every(({ l }) => linesSkin(l))).toBe(true)
    expect(linesSkin(layer('shoulder', 'hood', 'overHead'))).toBe(false)
    expect(linesSkin(layer('head', 'veil', 'face'))).toBe(false)
    expect(linesSkin(layer('ornament', 'waistBeads', 'waist'))).toBe(false)
  })

  for (const [sex, age, build] of BODIES) {
    it(`no bust, genital area or buttocks under a covering garment reads as skin (${sex} ${age}, build ${build})`, () => {
      const person = gltfPerson(asset, sex, age, build)
      const z = zones(person, sex, age)
      const n = person.geometry.getAttribute('position').count
      const bare: string[] = []
      let checked = 0
      for (const { l, covers } of GARMENTS) {
        // the garment alone: what it covers is its own lining, no other layer's
        const g = gltfFigureGeometry(asset, person, [l], SKIN, null, 16)
        const col = g.getAttribute('color') as THREE.BufferAttribute
        for (const zone of covers) {
          let skinned = 0
          for (let i = 0; i < n; i++) {
            if (!z[zone](i)) continue
            checked++
            if (!isCloth(col, i)) skinned++
          }
          if (skinned) bare.push(`${l.form}-${l.wear} ${zone}: ${skinned}`)
        }
      }
      expect(checked).toBeGreaterThan(0)
      expect(bare).toEqual([])
    }, 60000)
  }

  it('leaves the skin a garment does not cover as skin (the face and the hands)', () => {
    const person = gltfPerson(asset, 'female', 'adult', 0)
    const g = gltfFigureGeometry(asset, person, [layer('torso', 'breastCloth', 'chest')], SKIN, null, 16)
    const col = g.getAttribute('color') as THREE.BufferAttribute
    const pos = person.geometry.getAttribute('position') as THREE.BufferAttribute
    const H = person.p.stature
    let lined = 0
    for (let i = 0; i < pos.count; i++) {
      // above the shoulders and below the hips: nothing the breast cloth covers
      if (pos.getY(i) < 0.82 * H && pos.getY(i) > 0.45 * H) continue
      if (person.hair[i]) continue
      if (isCloth(col, i)) lined++
    }
    expect(lined).toBe(0)
  })
})
