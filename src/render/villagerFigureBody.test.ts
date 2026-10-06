// @vitest-environment node
// The glTF villager body under the settlement's pose machinery (work-order
// "glTF villager body", final states 3 and 4): hung into the code-built rest,
// grounded and sized like the code-built body, its proportions measured, its
// skeleton binding the geometry exactly, and the level that draws it.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { DETAIL_LEVELS, QUALITY_PRESETS } from '../config/quality'
import { VILLAGER_MOTION as M } from '../config/balance'
import { AGE_GROUPS, PEOPLE_DRESS, SEXES } from '../systems/appearance'
import { BONE_NAMES, bodyProportions } from './figureBody'
import { ankleAt, legDims, legExtent, strideReach, walkPose } from './figureWalk'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { buildLayerGeometry } from './figureDress'
import { codeBoneMap, createGltfSkeleton, dominantBones, gltfFigureGeometry, gltfPerson, remapSkin, transferTrunkWeights } from './villagerFigureBody'

let asset: VillagerAsset

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

const people = () => AGE_GROUPS.flatMap((age) => SEXES.map((sex) => ({ sex, age })))
const head = (rest: Float32Array, i: number) => new THREE.Vector3(rest[i * 3], rest[i * 3 + 1], rest[i * 3 + 2])

describe('the glTF body hung into the code-built rest', () => {
  it('arms and legs hang straight down: each joint directly below the one above', () => {
    for (const { sex, age } of people()) {
      const { rest } = gltfPerson(asset, sex, age)
      const at = (n: string) => head(rest, asset.bones.indexOf(n))
      for (const s of ['L', 'R']) {
        for (const [a, b] of [
          [`upperArm.${s}`, `forearm.${s}`],
          [`forearm.${s}`, `hand.${s}`],
          [`thigh.${s}`, `shin.${s}`],
          [`shin.${s}`, `foot.${s}`],
        ]) {
          const d = at(b).sub(at(a))
          expect(Math.hypot(d.x, d.z)).toBeLessThan(1e-4)
          expect(d.y).toBeLessThan(0)
        }
      }
    }
  })

  it('stands on y = 0 at the code-built stature of its sex and age, with no morph left on the GPU', () => {
    for (const { sex, age } of people()) {
      const { geometry, p } = gltfPerson(asset, sex, age)
      geometry.computeBoundingBox()
      expect(geometry.boundingBox!.min.y).toBeGreaterThan(-0.01)
      expect(geometry.boundingBox!.min.y).toBeLessThan(0.01)
      expect(geometry.boundingBox!.max.y).toBeCloseTo(bodyProportions(sex, age).stature, 4)
      expect(p.stature).toBeCloseTo(bodyProportions(sex, age).stature, 6)
      expect(Object.keys(geometry.morphAttributes)).toHaveLength(0)
      expect(geometry.getAttribute('skinIndex')).toBeInstanceOf(THREE.Uint16BufferAttribute)
      expect(geometry.getAttribute('skinWeight').normalized).toBe(false)
    }
  })

  it('measures joints and girths the pose and the dress can read', () => {
    for (const { sex, age } of people()) {
      const { p } = gltfPerson(asset, sex, age)
      expect(p.crownY).toBeGreaterThan(p.chinY)
      expect(p.chinY).toBeGreaterThan(p.shoulderY)
      expect(p.shoulderY).toBeGreaterThan(p.chestY)
      expect(p.chestY).toBeGreaterThan(p.waistY)
      expect(p.waistY).toBeGreaterThan(p.hipY)
      expect(p.hipY).toBeGreaterThan(p.kneeY)
      expect(p.kneeY).toBeGreaterThan(p.ankleY)
      for (const k of ['chestHalfW', 'chestHalfD', 'waistHalfW', 'pelvisHalfW', 'armR', 'thighR', 'calfR', 'neckR', 'hand', 'footLen'] as const) {
        expect(p[k], `${sex} ${age} ${k}`).toBeGreaterThan(0.01 * p.stature)
        expect(p[k], `${sex} ${age} ${k}`).toBeLessThan(0.2 * p.stature)
      }
    }
  })

  it('the child keeps a child’s head: a larger share of its stature than the adult’s', () => {
    for (const sex of SEXES) {
      const child = gltfPerson(asset, sex, 'child').p
      const adult = gltfPerson(asset, sex, 'adult').p
      expect((child.crownY - child.chinY) / child.stature).toBeGreaterThan((adult.crownY - adult.chinY) / adult.stature * 1.15)
    }
  })

  it('the code-built walk keeps its soles on the ground on this body (point 1295 stays binding)', () => {
    for (const { sex, age } of people()) {
      const { p, rest } = gltfPerson(asset, sex, age)
      const d = legDims(p)
      // standing: the hips bone at the leg's extent puts the ankle at its rest height
      const hips = head(rest, asset.bones.indexOf('hips')).y
      expect(d.ankle + legExtent(d, 0)).toBeCloseTo(hips, 5)
      for (let ph = 0; ph < Math.PI * 2; ph += 0.2) {
        const pose = walkPose(d, ph, strideReach(d, 0.8, age), 1, age)
        pose.legs.forEach((l, i) => {
          const sole = pose.hipHeight + ankleAt(d, l).y - d.ankle
          if (pose.feet[i].stance) expect(Math.abs(sole)).toBeLessThanOrEqual(M.footGroundTolerance)
        })
      }
    }
  })
})

describe('the skeleton the figure binds', () => {
  it('rests at the hung joints, identity rotations, and binds the geometry unmoved', () => {
    const { rest, geometry } = gltfPerson(asset, 'female', 'elder')
    const { skeleton, bones } = createGltfSkeleton(asset, rest)
    expect(skeleton.bones).toHaveLength(asset.bones.length)
    for (const [i, name] of asset.bones.entries()) {
      const b = bones[name]
      expect(b.name).toBe(`bone-${name}`)
      expect(b.quaternion.equals(new THREE.Quaternion())).toBe(true)
      expect(b.getWorldPosition(new THREE.Vector3()).distanceTo(head(rest, i))).toBeLessThan(1e-5)
    }
    // at rest every skinning matrix is the identity: bone world × inverse
    skeleton.update()
    const m = new THREE.Matrix4()
    for (let i = 0; i < skeleton.bones.length; i++) {
      m.multiplyMatrices(skeleton.bones[i].matrixWorld, skeleton.boneInverses[i])
      expect(m.equals(new THREE.Matrix4()) || m.elements.every((e, k) => Math.abs(e - new THREE.Matrix4().elements[k]) < 1e-5)).toBe(true)
    }
    expect(geometry.getAttribute('position').count).toBeGreaterThan(1000)
  })

  it('carries the code-built dress layers onto the asset’s bones by name', () => {
    const map = codeBoneMap(asset)
    BONE_NAMES.forEach((n, i) => expect(asset.bones[map[i]]).toBe(n))
    const g = new THREE.BufferGeometry()
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(BONE_NAMES.slice(0, 4).map((_, i) => i), 4))
    remapSkin(g, map)
    expect(Array.from(g.getAttribute('skinIndex').array)).toEqual([0, 1, 2, 3].map((i) => map[i]))
  })
})

/** A skinned geometry's positions under the skeleton's current pose (CPU). */
function skinned(g: THREE.BufferGeometry, sk: THREE.Skeleton): Float32Array {
  const pos = g.getAttribute('position')
  const si = g.getAttribute('skinIndex')
  const sw = g.getAttribute('skinWeight')
  const out = new Float32Array(pos.count * 3)
  const v = new THREE.Vector3()
  const acc = new THREE.Vector3()
  const t = new THREE.Vector3()
  const m = new THREE.Matrix4()
  for (let k = 0; k < pos.count; k++) {
    v.fromBufferAttribute(pos, k)
    acc.set(0, 0, 0)
    for (let j = 0; j < 4; j++) {
      const w = sw.getComponent(k, j)
      if (!w) continue
      const b = si.getComponent(k, j)
      m.multiplyMatrices(sk.bones[b].matrixWorld, sk.boneInverses[b])
      acc.addScaledVector(t.copy(v).applyMatrix4(m), w)
    }
    acc.toArray(out, k * 3)
  }
  return out
}

describe('the dressed figure', () => {
  it('every people’s dress of every sex and age merges with the glTF body into one geometry', () => {
    for (const { sex, age } of people()) {
      const person = gltfPerson(asset, sex, age)
      const bodyCount = person.geometry.getAttribute('position').count
      for (const [id, table] of Object.entries(PEOPLE_DRESS)) {
        // the table's 'cloth' colour is the figure's own cloth (appearanceFor resolves it)
        const cloth = <T extends string | null>(c: T): T | string => (c === 'cloth' ? '#b08850' : c)
        const layers = table[sex][age].map((l) => ({ ...l, colour: cloth(l.colour), colour2: cloth(l.colour2) }))
        const g = gltfFigureGeometry(asset, person, layers, '#5c3317', id === 'maasai' ? '#a0442a' : null, 16)
        expect(g.getAttribute('position').count, `${id} ${sex} ${age}`).toBeGreaterThanOrEqual(bodyCount)
        const si = g.getAttribute('skinIndex')
        expect(Math.max(...(si.array as Uint16Array))).toBeLessThan(asset.bones.length)
      }
    }
  })

  it('every people’s dress clears the glTF body’s trunk for every sex, age and build, at rest and stooped: no skin through the cloth', () => {
    // A ray from the trunk's axis out through each trunk vertex: where it meets
    // a layer's cloth, the outermost cloth lies beyond the skin (a sleeve's
    // inner wall may cross the trunk; its outer wall does not). Checked in the
    // hanging rest and with the chest bent by the elder's stoop (the pose the
    // settlement gives every elder), body and cloth skinned alike.
    const ray = new THREE.Ray()
    const hit = new THREE.Vector3()
    const [a, b, c] = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()]
    const map = codeBoneMap(asset)
    const fails: string[] = []
    for (const { sex, age } of people()) {
      for (const build of [-1, 0, 1]) {
        const person = gltfPerson(asset, sex, age, build)
        const p = person.p
        const H = p.stature
        const dom = dominantBones(person.geometry)
        const trunkBones = new Set(['hips', 'spine', 'chest'].map((n) => asset.bones.indexOf(n)))
        const { skeleton, bones } = createGltfSkeleton(asset, person.rest)
        for (const stoop of p.stoop > 0 ? [0, p.stoop] : [0]) {
          bones.chest.rotation.set(stoop, 0, 0)
          bones.neck.rotation.set(-stoop * 0.45, 0, 0)
          let root: THREE.Object3D = bones.hips
          while (root.parent) root = root.parent
          root.updateMatrixWorld(true)
          const body = skinned(person.geometry, skeleton)
          const skin: THREE.Vector3[] = []
          for (let k = 0; k < dom.length; k++) {
            const y = body[k * 3 + 1]
            if (trunkBones.has(dom[k]) && y > p.hipY && y < p.shoulderY - 0.03 * H) skin.push(new THREE.Vector3().fromArray(body, k * 3))
          }
          for (const [id, table] of Object.entries(PEOPLE_DRESS)) {
            for (const l of table[sex][age]) {
              const g = buildLayerGeometry(l, p, 32)
              if (!g) continue
              const gp = skinned(transferTrunkWeights(asset, person, remapSkin(g, map)), skeleton)
              const idx = g.getIndex()!
              let worst = 0
              for (const v of skin) {
                const r = Math.hypot(v.x, v.z)
                ray.origin.set(0, v.y, 0)
                ray.direction.set(v.x, 0, v.z).normalize()
                let far = -Infinity
                for (let t = 0; t < idx.count; t += 3) {
                  a.fromArray(gp, idx.getX(t) * 3)
                  b.fromArray(gp, idx.getX(t + 1) * 3)
                  c.fromArray(gp, idx.getX(t + 2) * 3)
                  if (Math.min(a.y, b.y, c.y) > v.y || Math.max(a.y, b.y, c.y) < v.y) continue
                  if (ray.intersectTriangle(a, b, c, false, hit)) far = Math.max(far, hit.distanceTo(ray.origin))
                }
                if (far > -Infinity) worst = Math.max(worst, r - far)
              }
              if (worst > 0) fails.push(`${id} ${sex} ${age} build ${build} stoop ${stoop.toFixed(2)} ${l.form}: skin ${(worst / H).toFixed(4)} H through`)
            }
          }
        }
      }
    }
    expect(fails).toEqual([])
  }, 120_000)

  it('a sleeve keeps its arm weights under the trunk transfer: a raised arm carries its sleeve', () => {
    const map = codeBoneMap(asset)
    const arms = new Set(['L', 'R'].flatMap((s) => [`upperArm.${s}`, `forearm.${s}`, `hand.${s}`].map((n) => asset.bones.indexOf(n))))
    let checked = 0
    let mixed = 0
    for (const { sex, age } of people()) {
      const person = gltfPerson(asset, sex, age)
      for (const table of Object.values(PEOPLE_DRESS)) {
        for (const l of table[sex][age]) {
          const g = buildLayerGeometry(l, person.p, 16)
          if (!g) continue
          remapSkin(g, map)
          const before = Array.from(g.getAttribute('skinIndex').array as Uint16Array)
          const wBefore = Array.from(g.getAttribute('skinWeight').array as Float32Array)
          transferTrunkWeights(asset, person, g)
          const si = g.getAttribute('skinIndex')
          const sw = g.getAttribute('skinWeight')
          for (let k = 0; k < si.count; k++) {
            let armBefore = 0
            for (let j = 0; j < 4; j++) if (arms.has(before[k * 4 + j])) armBefore += wBefore[k * 4 + j]
            // mixed sleeve weights too: the arm share stays whole, not only on a pure arm vertex
            if (armBefore < 0.2) continue
            let armAfter = 0
            for (let j = 0; j < 4; j++) if (arms.has(si.getComponent(k, j))) armAfter += sw.getComponent(k, j)
            expect(armAfter, `${l.form} ${sex} ${age} vertex ${k}`).toBeGreaterThan(armBefore - 0.01)
            checked++
            if (armBefore < 0.99) mixed++
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
    expect(mixed).toBeGreaterThan(0)
  })

  it('paints the scalp in the hair colour and the rest in the skin', () => {
    const person = gltfPerson(asset, 'male', 'elder')
    const g = gltfFigureGeometry(asset, person, [], '#5c3317', null, 16)
    const col = g.getAttribute('color')
    const hair = new THREE.Color(person.p.hair)
    let scalp = 0
    for (let i = 0; i < col.count; i++) if (person.hair[i]) {
      scalp++
      expect(col.getX(i)).toBeCloseTo(hair.r, 5)
    }
    expect(scalp).toBeGreaterThan(50)
    expect(scalp).toBeLessThan(col.count * 0.2)
  })
})

describe('which level draws the glTF body', () => {
  it('medium and high draw it; low keeps the primitive figure and loads nothing', () => {
    expect(QUALITY_PRESETS.low.figureGltfBody).toBe(false)
    expect(QUALITY_PRESETS.medium.figureGltfBody).toBe(true)
    expect(QUALITY_PRESETS.high.figureGltfBody).toBe(true)
    // never on a level that draws the primitive figure
    for (const l of DETAIL_LEVELS) if (!QUALITY_PRESETS[l].figureBodySegments) expect(QUALITY_PRESETS[l].figureGltfBody).toBe(false)
  })
})
