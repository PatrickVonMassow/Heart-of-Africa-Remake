import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { AGE_GROUPS, PEOPLE_DRESS, SEXES, type DressLayer } from '../systems/appearance'
import { BONE_NAMES, bodyProportions, boneIndex, buildBodyGeometry, createSkeleton, SURFACE_ATTRIBUTE } from './figureBody'
import { kneelLegs } from './figureRig'
import { buildLayerGeometry, figureMaterial, PATTERN_KIND, trunkAt } from './figureDress'

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

  it('the garment envelope holds the tops of the thighs, not only the pelvis', () => {
    const body = buildBodyGeometry(adultMan, { skin: '#5c3317', paint: null }, 16)
    const pos = body.getAttribute('position')
    const v = new THREE.Vector3()
    const lo = adultMan.hipY - 0.07 * adultMan.stature
    const hi = adultMan.hipY + 0.02 * adultMan.stature
    let seen = 0
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k)
      // the trunk and leg surfaces between crotch and hip joint (arms hang
      // further out and are not wrapped)
      if (v.y < lo || v.y > hi || Math.abs(v.x) > adultMan.shoulderX - adultMan.armR * 1.5) continue
      const [rx, rz] = trunkAt(adultMan, v.y)
      expect(Math.hypot(v.x / rx, v.z / rz)).toBeLessThanOrEqual(1.0001)
      seen++
    }
    expect(seen).toBeGreaterThan(20)
  })

  it('a robe below the knee follows the shins, so a kneeling figure folds it back', () => {
    const g = buildLayerGeometry(layer({ slot: 'torso', form: 'robe', wear: 'chest' }), adultMan)!
    const pos = g.getAttribute('position')
    const idx = g.getAttribute('skinIndex')
    const wt = g.getAttribute('skinWeight')
    const shins = new Set([boneIndex('shin.L'), boneIndex('shin.R')])
    const below = adultMan.kneeY - 0.05 * adultMan.stature
    let n = 0
    for (let k = 0; k < pos.count; k++) {
      if (pos.getY(k) > below) continue
      let w = 0
      ;[idx.getX(k), idx.getY(k), idx.getZ(k), idx.getW(k)].forEach((b, j) => {
        if (shins.has(b)) w += [wt.getX(k), wt.getY(k), wt.getZ(k), wt.getW(k)][j]
      })
      expect(w).toBeGreaterThan(0.5)
      n++
    }
    expect(n).toBeGreaterThan(0)
  })

  it('posed kneeling, a long garment lies along the shins instead of hanging into the ground', () => {
    // The kneeling pose skinnedFigure.tsx applies. Hanging from the thighs the
    // hem went 0.255 below the ground; following the shins with a mostly
    // sideways flare, what remains under 0.07 (about 9 cm) is the cloth's
    // underside beneath the laid-back shins — cloth resting on the ground,
    // clipped by the ground plane, never a skirt standing down into it.
    for (const [sex, age] of [['male', 'adult'], ['female', 'adult'], ['male', 'elder']] as const) {
      const p = bodyProportions(sex, age)
      for (const form of ['robe', 'toga', 'wrapLong'] as const) {
        const g = buildLayerGeometry(layer({ slot: 'torso', form, wear: 'chest' }), p)!
        const { skeleton, bones } = createSkeleton(p)
        const m = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial())
        m.add(bones.hips)
        m.bind(skeleton, new THREE.Matrix4())
        const k = kneelLegs(p.hipY - p.kneeY, p.calfR)
        bones.hips.position.y = k.hipY
        for (const sd of ['L', 'R'] as const) {
          bones[`thigh.${sd}`].rotation.x = k.thigh
          bones[`shin.${sd}`].rotation.x = k.shin
          bones[`foot.${sd}`].rotation.x = k.foot
        }
        m.updateMatrixWorld(true)
        skeleton.update()
        const v = new THREE.Vector3()
        let min = Infinity
        const pos = g.getAttribute('position')
        for (let i = 0; i < pos.count; i++) min = Math.min(min, m.applyBoneTransform(i, v.fromBufferAttribute(pos, i)).y)
        expect(min, `${sex} ${age} ${form}`).toBeGreaterThan(-0.07)
      }
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

describe('the shared material', () => {
  it('one double-sided, TSL-driven material for body and dress alike', () => {
    expect(figureMaterial()).toBe(figureMaterial())
    expect(figureMaterial().side).toBe(THREE.DoubleSide)
    // the colour node carries the vertex colour itself; a second multiply by
    // it would keep a light pattern colour off a dark cloth
    expect(figureMaterial().vertexColors).toBe(false)
    expect(figureMaterial().colorNode).toBeTruthy()
    expect(figureMaterial().roughnessNode).toBeTruthy()
  })
})

describe('a cloak over both shoulders', () => {
  const centroids = (g: THREE.BufferGeometry) => {
    const idx = g.getIndex()!
    const pos = g.getAttribute('position')
    const out: THREE.Vector3[] = []
    for (let i = 0; i < idx.count; i += 3) {
      const c = new THREE.Vector3()
      for (let k = 0; k < 3; k++) c.add(new THREE.Vector3().fromBufferAttribute(pos, idx.getX(i + k)))
      out.push(c.divideScalar(3))
    }
    return out
  }
  it('hangs open in front below the shoulders and closed behind', () => {
    const cloak = layer({ slot: 'shoulder', form: 'cloak', material: 'hide', wear: 'bothShoulders' })
    const g = buildLayerGeometry(cloak, adultMan, 16)!
    const cs = centroids(g)
    const below = adultMan.shoulderY - 0.03 * adultMan.stature
    const front = cs.filter((c) => c.y < below - 0.02 && c.z > 0 && Math.abs(c.x) < 0.03)
    const back = cs.filter((c) => c.y < below - 0.02 && c.z < 0 && Math.abs(c.x) < 0.03)
    expect(front).toHaveLength(0)
    expect(back.length).toBeGreaterThan(0)
  })
})
