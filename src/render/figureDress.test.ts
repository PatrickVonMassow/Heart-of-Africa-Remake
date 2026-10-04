import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { AGE_GROUPS, PEOPLE_DRESS, SEXES, type DressLayer } from '../systems/appearance'
import { BONE_NAMES, bodyProportions, boneIndex, SURFACE_ATTRIBUTE } from './figureBody'
import { buildLayerGeometry, figureBodyMaterial, figureDressMaterial, PATTERN_KIND, trunkAt } from './figureDress'

const adultMan = bodyProportions('male', 'adult')
const layer = (over: Partial<DressLayer>): DressLayer => ({
  slot: 'hip',
  form: 'wrapLong',
  material: 'cotton',
  colour: '#e6e1d3',
  colour2: null,
  pattern: 'plain',
  wear: 'waist',
  source: { section: '§7' },
  ...over,
})

function bounds(g: THREE.BufferGeometry) {
  g.computeBoundingBox()
  return g.boundingBox!
}

describe('every cell of the table builds on its own body', () => {
  it('each layer of each people / sex / age is a skinned, painted mesh (body paint excepted)', () => {
    for (const people of Object.keys(PEOPLE_DRESS))
      for (const sex of SEXES)
        for (const age of AGE_GROUPS) {
          const p = bodyProportions(sex, age)
          for (const l of PEOPLE_DRESS[people][sex][age]) {
            const g = buildLayerGeometry(l, p, 10)
            if (l.form === 'bodyPaint') {
              expect(g).toBeNull()
              continue
            }
            expect(g, `${people} ${sex} ${age} ${l.form}`).not.toBeNull()
            const w = g!.getAttribute('skinWeight')
            const i = g!.getAttribute('skinIndex')
            expect(w.count).toBeGreaterThan(0)
            expect(g!.getIndex()!.count).toBeGreaterThan(0)
            for (let k = 0; k < w.count; k += 7) {
              expect(Math.abs(w.getX(k) + w.getY(k) + w.getZ(k) + w.getW(k) - 1)).toBeLessThan(1e-4)
              expect(i.getX(k)).toBeLessThan(BONE_NAMES.length)
            }
            expect(g!.getAttribute(SURFACE_ATTRIBUTE).count).toBe(w.count)
          }
        }
  })
})

describe('the garments sit on the body', () => {
  it('a long wrap reaches below the knee, a short skirt stops above it', () => {
    const long = bounds(buildLayerGeometry(layer({ form: 'wrapLong' }), adultMan)!)
    const short = bounds(buildLayerGeometry(layer({ form: 'skirtShort' }), adultMan)!)
    expect(long.min.y).toBeLessThan(adultMan.kneeY)
    expect(short.min.y).toBeGreaterThan(adultMan.kneeY)
  })

  it('a wrap stands off the trunk everywhere — no body pokes through at rest', () => {
    const g = buildLayerGeometry(layer({ form: 'wrapLong', wear: 'chest' }), adultMan)!
    const pos = g.getAttribute('position')
    const v = new THREE.Vector3()
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k)
      const [rx, rz] = trunkAt(adultMan, v.y)
      const r = Math.hypot(v.x / rx, v.z / rz)
      expect(r).toBeGreaterThan(0.999)
    }
  })

  it('a toga over one shoulder leaves the other bare; a cloak covers both', () => {
    const above = (l: DressLayer, side: 1 | -1) => {
      const g = buildLayerGeometry(l, adultMan)!
      const pos = g.getAttribute('position')
      const idx = g.getIndex()!
      let n = 0
      const v = new THREE.Vector3()
      for (let k = 0; k < idx.count; k++) {
        v.fromBufferAttribute(pos, idx.getX(k))
        if (v.x * side > adultMan.shoulderX * 0.6 && v.y > adultMan.shoulderY - 0.01) n++
      }
      return n
    }
    // Baganda: knotted over the RIGHT shoulder (−x), so the LEFT (+x) is bare.
    const toga = layer({ slot: 'torso', form: 'toga', wear: 'rightShoulder', material: 'barkCloth' })
    expect(above(toga, 1)).toBe(0)
    expect(above(toga, -1)).toBeGreaterThan(0)
    const cloak = layer({ slot: 'shoulder', form: 'cloak', wear: 'bothShoulders', material: 'hide' })
    expect(above(cloak, 1)).toBeGreaterThan(0)
    expect(above(cloak, -1)).toBeGreaterThan(0)
  })

  it('head coverings ride the head bone alone', () => {
    for (const form of ['turban', 'cap', 'headRing', 'topknot', 'hairBag', 'headband'] as const) {
      const g = buildLayerGeometry(layer({ slot: 'head', form, wear: 'crown' }), adultMan)!
      const i = g.getAttribute('skinIndex')
      const w = g.getAttribute('skinWeight')
      for (let k = 0; k < i.count; k++) {
        expect(i.getX(k)).toBe(boneIndex('head'))
        expect(w.getX(k)).toBe(1)
      }
      expect(bounds(g).min.y).toBeGreaterThan(adultMan.chinY)
    }
  })

  it('the hood leaves the face open', () => {
    const g = buildLayerGeometry(layer({ slot: 'shoulder', form: 'hood', wear: 'overHead' }), adultMan)!
    const pos = g.getAttribute('position')
    const idx = g.getIndex()!
    const face = new THREE.Vector3(0, adultMan.chinY + adultMan.headHalfH, adultMan.headHalfW * 1.4)
    const v = new THREE.Vector3()
    let nearest = Infinity
    for (let k = 0; k < idx.count; k++) nearest = Math.min(nearest, v.fromBufferAttribute(pos, idx.getX(k)).distanceTo(face))
    expect(nearest).toBeGreaterThan(adultMan.headHalfW * 0.5)
  })

  it('a pattern layer carries its kind; a plain cotton one none', () => {
    const beads = buildLayerGeometry(layer({ slot: 'ornament', form: 'neckBeads', pattern: 'beadwork', material: 'beads' }), adultMan)!
    expect(beads.getAttribute(SURFACE_ATTRIBUTE).getX(0)).toBe(PATTERN_KIND.beadwork)
    const plain = buildLayerGeometry(layer({}), adultMan)!
    expect(plain.getAttribute(SURFACE_ATTRIBUTE).getX(0)).toBe(PATTERN_KIND.plain)
  })
})

describe('the shared materials', () => {
  it('one body and one double-sided dress material, both TSL-driven', () => {
    expect(figureBodyMaterial()).toBe(figureBodyMaterial())
    expect(figureDressMaterial().side).toBe(THREE.DoubleSide)
    expect(figureDressMaterial().colorNode).toBeTruthy()
    expect(figureBodyMaterial().roughnessNode).toBeTruthy()
  })
})
