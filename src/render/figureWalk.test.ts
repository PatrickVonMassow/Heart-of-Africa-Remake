import { describe, expect, it } from 'vitest'
import { VILLAGER_MOTION as M } from '../config/balance'
import { AGE_GROUPS, SEXES } from '../systems/appearance'
import { bodyProportions, buildBodyGeometry, jointPositions } from './figureBody'
import { FIGURE_LIMBS } from './figures'
import {
  ankleAt,
  armAtRest,
  crouchTarget,
  crownOffset,
  headLoadGrip,
  kneelBlend,
  legDims,
  legExtent,
  lowestFoot,
  phasePerDistance,
  rephase,
  primitiveLayout,
  solveLeg,
  strideReach,
  walkPose,
} from './figureWalk'

const bodies = AGE_GROUPS.flatMap((age) => SEXES.map((sex) => ({ age, sex, p: bodyProportions(sex, age, 0) })))
const SPEEDS = [0.3, 0.8, 1.2, 1.8]

describe('the walk keeps the feet on the ground', () => {
  it('the leg IK puts the ankle where it was asked', () => {
    const d = legDims(bodyProportions('male', 'adult'))
    for (const [z, y] of [[0, -0.6], [0.15, -0.55], [-0.2, -0.5], [0.05, -0.45]]) {
      const a = ankleAt(d, solveLeg(d, z, y))
      expect(a.z).toBeCloseTo(z, 6)
      expect(a.y).toBeCloseTo(y, 6)
    }
  })

  it('standing, the hips sit at the leg’s own extent and both soles touch', () => {
    for (const { p } of bodies) {
      const d = legDims(p)
      const pose = walkPose(d, 0, strideReach(d, 1, 'adult'), 0, 'adult')
      expect(pose.hipHeight).toBeCloseTo(p.ankleY + legExtent(d, p.kneeFlex), 6)
      for (const l of pose.legs) expect(pose.hipHeight + ankleAt(d, l).y - d.ankle).toBeCloseTo(0, 5)
    }
  })

  it('at every phase and pace, for every age group, the lowest foot is on the ground and none is below it', () => {
    for (const { age, p } of bodies) {
      const d = legDims(p)
      for (const v of SPEEDS) {
        const reach = strideReach(d, v, age)
        for (let ph = 0; ph < Math.PI * 4; ph += 0.05) {
          const pose = walkPose(d, ph, reach, 1, age)
          expect(Math.abs(lowestFoot(d, pose))).toBeLessThanOrEqual(M.footGroundTolerance)
          pose.legs.forEach((l, i) => {
            const sole = pose.hipHeight + ankleAt(d, l).y - d.ankle
            if (pose.feet[i].stance) expect(Math.abs(sole)).toBeLessThanOrEqual(M.footGroundTolerance)
            expect(sole).toBeGreaterThanOrEqual(-M.footGroundTolerance)
          })
        }
      }
    }
  })

  it('a planted foot does not slide while the body walks over it', () => {
    for (const { age, p } of bodies) {
      const d = legDims(p)
      const v = 1.1
      const reach = strideReach(d, v, age)
      const rate = phasePerDistance(reach)
      let walked = 0
      let planted: [number | null, number | null] = [null, null]
      for (let f = 0; f < 600; f++) {
        walked += v / 60
        const pose = walkPose(d, walked * rate, reach, 1, age)
        pose.legs.forEach((l, i) => {
          const world = walked + ankleAt(d, l).z
          if (!pose.feet[i].stance) {
            planted[i] = null
            return
          }
          if (planted[i] === null) planted[i] = world
          expect(Math.abs(world - (planted[i] as number))).toBeLessThanOrEqual(M.stanceSlipTolerance)
        })
        planted = [planted[0], planted[1]]
      }
    }
  })

  it('a planted foot stays put when the pace changes mid-stance', () => {
    const p = bodyProportions('male', 'adult')
    const d = legDims(p)
    let walked = 0
    let phase = 0
    let reach = strideReach(d, 1.1, 'adult')
    let planted: [number | null, number | null] = [null, null]
    let worst = 0
    for (let f = 0; f < 600; f++) {
      // A pace that jumps every frame, as a crowded lane or a slow frame makes it.
      const v = f % 3 === 0 ? 1.8 : 0.9
      const step = v / 30
      const next = strideReach(d, v, 'adult')
      phase = rephase(phase, reach, next)
      reach = next
      walked += step
      phase += step * phasePerDistance(reach)
      const pose = walkPose(d, phase, reach, 1, 'adult')
      pose.legs.forEach((l, i) => {
        const world = walked + ankleAt(d, l).z
        if (!pose.feet[i].stance) {
          planted[i] = null
          return
        }
        planted[i] ??= world
        worst = Math.max(worst, Math.abs(world - (planted[i] as number)))
      })
      planted = [planted[0], planted[1]]
    }
    expect(worst).toBeLessThanOrEqual(M.stanceSlipTolerance)
  })

  it('the legs swing in counter-phase and the stride scales with pace and body', () => {
    const p = bodyProportions('female', 'adult')
    const d = legDims(p)
    const pose = walkPose(d, -Math.PI / 2, strideReach(d, 1.2, 'adult'), 1, 'adult')
    expect(Math.sign(pose.feet[0].z)).toBe(-Math.sign(pose.feet[1].z))
    expect(strideReach(d, 1.6, 'adult')).toBeGreaterThan(strideReach(d, 0.8, 'adult'))
    expect(strideReach(d, 1.2, 'elder')).toBeLessThan(strideReach(d, 1.2, 'adult'))
    const child = legDims(bodyProportions('female', 'child'))
    expect(strideReach(child, 1.2, 'child')).toBeLessThan(strideReach(d, 1.2, 'adult'))
  })
})

describe('the whole body walks', () => {
  it('each arm swings against its own side’s leg', () => {
    const d = legDims(bodyProportions('male', 'youth'))
    const reach = strideReach(d, 1.2, 'youth')
    for (let ph = 0.1; ph < Math.PI * 2; ph += 0.3) {
      const pose = walkPose(d, ph, reach, 1, 'youth')
      pose.feet.forEach((f, i) => {
        if (Math.abs(f.z) < 1e-3) return
        // + arm pitch is backward: an arm forward while its leg is forward would share its sign.
        const armForward = -pose.arms[i]
        expect(Math.sign(armForward)).toBe(-Math.sign(f.z))
      })
      expect(Math.sign(pose.hipYaw) || 0).toBe(-Math.sign(pose.chestYaw) || 0)
    }
  })

  it('the elder swings less', () => {
    const d = legDims(bodyProportions('male', 'elder'))
    const a = walkPose(d, 1, 0.1, 1, 'elder')
    const b = walkPose(d, 1, 0.1, 1, 'adult')
    expect(Math.abs(a.arms[0])).toBeLessThan(Math.abs(b.arms[0]))
  })
})

describe('an arm hanging at rest is no contact', () => {
  it('the rest pose is free, a reach is held', () => {
    const rest = { pitch: 0.04, yaw: 0, roll: 0.46 }
    expect(armAtRest({ ...rest }, rest)).toBe(true)
    expect(armAtRest({ pitch: -1.2, yaw: 0.2, roll: 0 }, rest)).toBe(false)
    expect(armAtRest({ pitch: -0.17, yaw: 0, roll: 0 }, rest)).toBe(false)
  })
})

describe('no villager travels in a crouch', () => {
  it('a work crouch holds only while the figure stands', () => {
    expect(crouchTarget(0, 1.1)).toBe(1.1)
    for (const v of [0.2, 0.5, 1.2, -0.6]) expect(crouchTarget(v, 1.1)).toBe(0)
  })
})

describe('head loads sit on the crown', () => {
  it('the anchor on the head bone is the crown of the drawn head', () => {
    for (const { p } of bodies) {
      const geo = buildBodyGeometry(p, { skin: '#5c3317', paint: null }, 12)
      geo.computeBoundingBox()
      const top = geo.boundingBox!.max.y
      // The anchor is the top of the DRAWN head (its hair), a little above the skull's nominal crown.
      expect(jointPositions(p).head.y + crownOffset(p, top)).toBeCloseTo(top, 9)
      expect(top - p.crownY).toBeGreaterThan(0)
      expect(top - p.crownY).toBeLessThan(0.03 * p.stature)
    }
  })

  it('a steadying hand grips within reach, its elbow bent', () => {
    const p = bodyProportions('female', 'adult')
    const shoulder = { x: p.shoulderX, y: p.shoulderY - p.crownY, z: 0 }
    const reach = p.upperArm + p.forearm + p.hand * 0.9
    const g = headLoadGrip(shoulder, 1, { radius: 0.16, height: 0.32 }, reach)
    expect(Math.hypot(g.x - shoulder.x, g.y - shoulder.y, g.z)).toBeLessThanOrEqual(reach * 0.92 + 1e-9)
    expect(g.y).toBeGreaterThan(0)
  })
})

describe('kneeling folds the body, it never squashes it', () => {
  it('the skinned legs fold with the knee or foot on the ground all the way down', () => {
    for (const { p } of bodies) {
      const d = legDims(p)
      const stand = walkPose(d, 0, 0, 0, 'adult').legs[0]
      for (let k = 0; k <= 1.0001; k += 0.05) {
        const { legs, hipHeight } = kneelBlend(d, stand, k)
        const e = k * k * (3 - 2 * k)
        const kneeClear = hipHeight - d.thigh * Math.cos(legs.thigh) - d.calfR * e
        const footClear = hipHeight + ankleAt(d, legs).y - (d.ankle + (d.calfR - d.ankle) * e)
        expect(Math.min(kneeClear, footClear)).toBeCloseTo(0, 9)
        expect(Math.max(kneeClear, footClear)).toBeGreaterThanOrEqual(-1e-9)
      }
      expect(kneelBlend(d, stand, 0).hipHeight).toBeCloseTo(walkPose(d, 0, 0, 0, 'adult').hipHeight, 5)
    }
  })

  it('the primitive keeps a uniform scale and its head radius through the whole transition', () => {
    for (let k = 0; k <= 1.0001; k += 0.1) {
      const l = primitiveLayout(k, false, FIGURE_LIMBS)
      expect(l.groupScale[0]).toBe(l.groupScale[1])
      expect(l.groupScale[1]).toBe(l.groupScale[2])
      expect(l.headRadius).toBe(primitiveLayout(0, false, FIGURE_LIMBS).headRadius)
      expect(l.headY - l.headRadius).toBeGreaterThan(l.height - 0.01)
    }
    // Kneeling contacts keep the shoulder height they were solved for.
    const kneel = primitiveLayout(1, false, FIGURE_LIMBS)
    expect(kneel.height * FIGURE_LIMBS.shoulderY).toBeCloseTo(0.55 * 0.75 * FIGURE_LIMBS.shoulderY, 9)
    expect(kneel.armLength).toBeCloseTo(0.55 * FIGURE_LIMBS.armLength, 9)
  })
})
