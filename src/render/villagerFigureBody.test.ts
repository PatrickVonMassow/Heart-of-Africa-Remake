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
import { codeBoneMap, createGltfSkeleton, gltfFigureGeometry, gltfPerson, remapSkin } from './villagerFigureBody'

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
