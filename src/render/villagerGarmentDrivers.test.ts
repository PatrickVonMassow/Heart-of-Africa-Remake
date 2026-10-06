// @vitest-environment node
// The garments' corrective drivers: zero at the hung rest, one per right-angle
// swing, and the same values the pipeline fitted the shapes with
// (verification/villager-body/garment-drivers-check.json, written by
// scripts/villager/correct.py from the same clips on the adult man).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET } from '../config/balance'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { clipPoseAt, toHung } from './villagerClipPose'
import { gltfPerson } from './villagerFigureBody'
import { morphInfluences } from './villagerBody'
import { garmentCorrection, garmentDriverNames, garmentDrivers } from './villagerGarmentDrivers'
import { newPose } from './villagerRig'

const BONES = ['hips', 'spine', 'chest', 'neck', 'head', 'upperArm.L', 'upperArm.R', 'forearm.L', 'forearm.R', 'thigh.L', 'thigh.R', 'shin.L', 'shin.R']
const ident = () => BONES.map(() => new THREE.Quaternion())

describe('garment correction', () => {
  const v = (...x: number[]) => new Float32Array(x)

  it('weights each shape by its driver and lets the body morphs move the shapes', () => {
    const shapes = [v(1, 0, 0), v(0, 2, 0)]
    const morphs = { female: [v(0, 0, 1), v(0, 0, 0)], child: [v(0, 0, 0), v(1, 1, 1)] }
    const out = garmentCorrection(shapes, morphs, { female: 1, child: 0.5 }, [1, 0.5])
    expect(Array.from(out)).toEqual([1 + 0.25, 1 + 0.25, 1 + 0.25])
  })

  it('is zero with every driver zero', () => {
    const out = garmentCorrection([v(1, 2, 3)], { female: [v(4, 5, 6)] }, { female: 1 }, [0])
    expect(Array.from(out)).toEqual([0, 0, 0])
  })
})

describe('garment drivers', () => {
  it('are the constant alone at the hung rest', () => {
    const d = garmentDrivers(BONES, ident())
    expect(d.length).toBe(garmentDriverNames().length)
    expect(d[0]).toBe(1)
    expect(Array.from(d.slice(1)).every((x) => Math.abs(x) < 1e-9)).toBe(true)
  })

  it('read a thigh swung forward a right angle as its +z driver at one', () => {
    const local = ident()
    local[BONES.indexOf('thigh.L')].setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    const d = garmentDrivers(BONES, local)
    const names = garmentDriverNames()
    expect(d[names.indexOf('thigh.L+z')]).toBeCloseTo(1, 6)
    expect(d[names.indexOf('thigh.L-z')]).toBe(0)
    expect(d[names.indexOf('thigh.R+z')]).toBe(0)
  })

  it('multiply a thigh swung forward and a knee bent back into their pair driver', () => {
    const local = ident()
    local[BONES.indexOf('thigh.L')].setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2)
    local[BONES.indexOf('shin.L')].setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 6)
    const d = garmentDrivers(BONES, local)
    const names = garmentDriverNames()
    expect(d[names.indexOf('thigh.L+z*shin.L-z')]).toBeCloseTo(0.5, 6)
    expect(d[names.indexOf('thigh.L+z*shin.L+z')]).toBe(0)
  })

  it('read a trunk bent sideways by half its lean', () => {
    const local = ident()
    local[BONES.indexOf('spine')].setFromAxisAngle(new THREE.Vector3(0, 0, 1), -Math.PI / 6)
    const d = garmentDrivers(BONES, local)
    expect(d[garmentDriverNames().indexOf('spine+x')]).toBeCloseTo(0.5, 6)
  })

  it('cover every configured bone', () => {
    expect(garmentDriverNames().length).toBe(1 + 4 * VILLAGER_ASSET.garmentDriverBones.length + 4 * VILLAGER_ASSET.garmentDriverPairs.length)
  })
})

const CHECK = resolve(__dirname, '../../verification/villager-body/garment-drivers-check.json')

describe('garment drivers against the pipeline', () => {
  let asset: VillagerAsset
  beforeAll(async () => {
    const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
    asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  })

  it('match the values the shapes were fitted with, frame by frame', () => {
    expect(existsSync(CHECK)).toBe(true)
    const check = JSON.parse(readFileSync(CHECK, 'utf8')) as { names: string[]; poses: { clip: string; frame: number; drivers: number[] }[] }
    expect(check.names).toEqual(garmentDriverNames())
    const person = gltfPerson(asset, 'male', 'adult', 0)
    const n = asset.bones.length
    const local = Array.from({ length: n }, () => new THREE.Quaternion())
    for (const p of check.poses) {
      const clip = asset.clips[p.clip as keyof typeof asset.clips]
      const pose = clipPoseAt(asset, person.frame, clip, clip.times[p.frame], newPose(n))
      toHung(asset, person.frame, pose, local, new THREE.Vector3())
      const d = garmentDrivers(asset.bones, local)
      p.drivers.forEach((x, k) => expect(d[k], `${p.clip} ${p.frame} ${check.names[k]}`).toBeCloseTo(x, 4))
    }
  })

  it("reproduce the pipeline's corrective offsets on the adult man and the girl", () => {
    type Corner = { sex: 'male' | 'female'; age: 'child' | 'youth' | 'adult' | 'elder'; poses: { clip: string; frame: number; drivers: number[]; offsets: number[][] }[] }
    const check = JSON.parse(readFileSync(CHECK, 'utf8')) as {
      correction: { garment: string; vertices: number[]; shapes: number[][][]; morphs: Record<string, number[][][]>; corners: Corner[] } | null
    }
    const c = check.correction
    expect(c, 'the pipeline wrote no corrective sample').toBeTruthy()
    if (!c) return
    const flat = (k: number[][]) => new Float32Array(k.flat())
    const shapes = c.shapes.map(flat)
    const morphs = Object.fromEntries(Object.entries(c.morphs).map(([m, s]) => [m, s.map(flat)]))
    expect(c.corners.length).toBe(2)
    for (const corner of c.corners) {
      const infl = morphInfluences(corner.sex, corner.age, 0)
      for (const p of corner.poses) {
        const out = garmentCorrection(shapes, morphs, infl, p.drivers)
        p.offsets.flat().forEach((x, i) => expect(out[i], `${corner.sex} ${corner.age} ${p.clip} ${p.frame} [${i}]`).toBeCloseTo(x, 4))
      }
    }
  })
})
