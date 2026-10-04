import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { AGE_GROUPS, SEXES } from '../systems/appearance'
import {
  BONE_NAMES,
  bodyProportions,
  boneIndex,
  buildBodyGeometry,
  createSkeleton,
  FIGURE_STATURE,
  jointPositions,
} from './figureBody'

const LOOK = { skin: '#5c3317', paint: null }

describe('the skeleton (body 2a)', () => {
  it('has 17 bones in one connected tree, parents before children', () => {
    expect(BONE_NAMES.length).toBe(17)
    const { skeleton, bones } = createSkeleton(bodyProportions('male', 'adult'))
    expect(skeleton.bones).toHaveLength(17)
    skeleton.bones.forEach((b, i) => {
      if (i === 0) {
        expect(b).toBe(bones.hips)
        expect(b.parent).toBeNull()
        return
      }
      // every other bone hangs from a bone of the SAME skeleton, listed earlier
      expect(b.parent).toBeInstanceOf(THREE.Bone)
      const at = skeleton.bones.indexOf(b.parent as THREE.Bone)
      expect(at).toBeGreaterThanOrEqual(0)
      expect(at).toBeLessThan(i)
    })
    expect(bones['hand.L'].parent).toBe(bones['forearm.L'])
    expect(bones['foot.R'].parent).toBe(bones['shin.R'])
    expect(bones.head.parent).toBe(bones.neck)
  })

  it('puts every bone at its joint in bind pose', () => {
    const p = bodyProportions('female', 'youth')
    const { bones } = createSkeleton(p)
    const j = jointPositions(p)
    const w = new THREE.Vector3()
    for (const n of BONE_NAMES) expect(bones[n].getWorldPosition(w).distanceTo(j[n])).toBeLessThan(1e-6)
  })
})

describe('proportions by sex and age', () => {
  it('a child carries a child’s head-to-body ratio, an adult an adult’s', () => {
    const ratio = (p: ReturnType<typeof bodyProportions>) => (p.headHalfH * 2) / p.stature
    expect(ratio(bodyProportions('male', 'child'))).toBeGreaterThan(1 / 6)
    expect(ratio(bodyProportions('male', 'adult'))).toBeLessThan(1 / 7)
    // Shorter legs too: the child's hip sits lower in its stature.
    expect(bodyProportions('female', 'child').hipY / FIGURE_STATURE).toBeLessThan(bodyProportions('female', 'adult').hipY / bodyProportions('female', 'adult').stature)
  })

  it('men are broader at the shoulder, women at the pelvis', () => {
    const m = bodyProportions('male', 'adult')
    const f = bodyProportions('female', 'adult')
    expect(m.shoulderX).toBeGreaterThan(f.shoulderX)
    expect(f.pelvisHalfW).toBeGreaterThan(m.pelvisHalfW)
    expect(f.stature).toBeLessThan(m.stature)
  })

  it('the elder stoops, greys and thins; the young man stands straight', () => {
    const e = bodyProportions('male', 'elder')
    const y = bodyProportions('male', 'youth')
    expect(e.stoop).toBeGreaterThan(0.1)
    expect(y.stoop).toBe(0)
    expect(e.hair).not.toBe(y.hair)
    expect(e.armR).toBeLessThan(bodyProportions('male', 'adult').armR)
    // the age read at a distance: bent knees and, for the old man, a grey beard
    expect(e.kneeFlex).toBeGreaterThan(0.1)
    expect(y.kneeFlex).toBe(0)
    expect(e.beard).toBe(true)
    expect(y.beard).toBe(false)
    expect(bodyProportions('female', 'elder').beard).toBe(false)
  })

  it('a woman has a bust and a man or a child none — the sex read where the chest is bare', () => {
    for (const age of ['youth', 'adult', 'elder'] as const) {
      expect(bodyProportions('female', age).bust).toBeGreaterThan(0)
      expect(bodyProportions('male', age).bust).toBe(0)
    }
    expect(bodyProportions('female', 'child').bust).toBe(0)
    expect(bodyProportions('female', 'elder').bustDrop).toBeGreaterThan(bodyProportions('female', 'youth').bustDrop)
  })

  it('the old man’s beard adds geometry to the body, bound to the head', () => {
    const withBeard = buildBodyGeometry(bodyProportions('male', 'elder'), { skin: '#5c3317', paint: null }, 16)
    const without = buildBodyGeometry({ ...bodyProportions('male', 'elder'), beard: false }, { skin: '#5c3317', paint: null }, 16)
    expect(withBeard.getAttribute('position').count).toBeGreaterThan(without.getAttribute('position').count)
  })

  it('build scales the girth and nothing else', () => {
    const slight = bodyProportions('male', 'adult', -1)
    const stout = bodyProportions('male', 'adult', 1)
    expect(stout.chestHalfW).toBeGreaterThan(slight.chestHalfW)
    expect(stout.stature).toBe(slight.stature)
  })
})

describe('the body geometry', () => {
  for (const sex of SEXES)
    for (const age of AGE_GROUPS) {
      it(`${sex} ${age}: stands its stature, every vertex fully and validly weighted`, () => {
        const p = bodyProportions(sex, age)
        const g = buildBodyGeometry(p, LOOK, 12)
        g.computeBoundingBox()
        const b = g.boundingBox!
        expect(b.min.y).toBeGreaterThan(-0.01)
        expect(b.min.y).toBeLessThan(0.03)
        expect(Math.abs(b.max.y - p.stature)).toBeLessThan(0.03)
        const idx = g.getAttribute('skinIndex')
        const wt = g.getAttribute('skinWeight')
        const n = g.getAttribute('position').count
        expect(idx.count).toBe(n)
        expect(wt.count).toBe(n)
        expect(idx.itemSize).toBe(4)
        expect(wt.itemSize).toBe(4)
        for (let i = 0; i < n; i++) {
          const ws = [wt.getX(i), wt.getY(i), wt.getZ(i), wt.getW(i)]
          for (const w of ws) expect(Number.isFinite(w) && w >= 0 && w <= 1 + 1e-6).toBe(true)
          expect(Math.abs(ws.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-4)
          for (const k of [idx.getX(i), idx.getY(i), idx.getZ(i), idx.getW(i)]) {
            expect(Number.isInteger(k) && k >= 0 && k < BONE_NAMES.length).toBe(true)
          }
        }
      })
    }

  it('the arm surface follows its bones: a raised arm moves the hand, not the hip', () => {
    const p = bodyProportions('male', 'adult')
    const g = buildBodyGeometry(p, LOOK, 12)
    const { skeleton, bones } = createSkeleton(p)
    const mesh = new THREE.SkinnedMesh(g, new THREE.MeshBasicMaterial())
    mesh.add(bones.hips)
    mesh.bind(skeleton)
    const lowest = (pred: (i: number) => boolean) => {
      const v = new THREE.Vector3()
      let low = Infinity
      for (let i = 0; i < g.getAttribute('position').count; i++) {
        if (!pred(i)) continue
        mesh.getVertexPosition(i, v)
        low = Math.min(low, v.y)
      }
      return low
    }
    const dominant = g.getAttribute('skinIndex')
    const leftArm = (i: number) => [boneIndex('forearm.L'), boneIndex('hand.L')].includes(dominant.getX(i))
    const hip = (i: number) => dominant.getX(i) === boneIndex('hips')
    const hipBefore = lowest(hip)
    mesh.updateMatrixWorld(true)
    skeleton.update()
    const before = lowest(leftArm)
    bones['upperArm.L'].rotation.x = -Math.PI / 2 // arm forward, horizontal
    mesh.updateMatrixWorld(true)
    skeleton.update()
    const after = lowest(leftArm)
    expect(after - before).toBeGreaterThan(p.upperArm + p.forearm)
    expect(lowest(hip)).toBeCloseTo(hipBefore, 6)
  })
})
