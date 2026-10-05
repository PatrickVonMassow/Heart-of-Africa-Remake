import { describe, expect, it } from 'vitest'
import { VILLAGER_MOTION as M } from '../config/balance'
import { AGE_GROUPS, SEXES, type AgeGroup } from '../systems/appearance'
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
  loadRadiusAt,
  phasePerDistance,
  rephase,
  primitiveLayout,
  restingMotion,
  solveLeg,
  steerHeading,
  stepWalk,
  strideReach,
  walkPose,
  GRIP_CLEARANCE,
  type FootOffset,
  type LegDims,
  type WalkMotion,
} from './figureWalk'
import { TASK_BUNDLE, TASK_JAR, steadiedLoad, taskLoadShape } from '../scenes/place/headLoads'
import { workStop, type WorkStopMode } from '../scenes/place/taskWalkerStop'

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

  it('a foot held off the hip’s line is reached by tilting the leg, still on the ground', () => {
    const d = legDims(bodyProportions('male', 'adult'))
    const reach = strideReach(d, 1.1, 'adult')
    for (const off of [{ x: 0.12, z: 0.05 }, { x: -0.1, z: -0.08 }]) {
      for (let ph = -1.4; ph <= 1.4; ph += 0.2) {
        const pose = walkPose(d, ph, reach, 1, 'adult', 0, [off, { x: 0, z: 0 }])
        const l = pose.legs[0]
        const a = ankleAt(d, l)
        // The tilted plane carries the in-plane ankle sideways by its depth.
        expect(-a.y * Math.sin(l.roll ?? 0)).toBeCloseTo(off.x, 6)
        expect(a.z).toBeCloseTo(pose.feet[0].z, 6)
        expect(pose.hipHeight + a.y * Math.cos(l.roll ?? 0) - d.ankle).toBeCloseTo(0, 5)
      }
    }
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

/** Walks a body along a route as the village walkers do — turned by
 *  `steerHeading`, stepping along its heading — and measures, by forward
 *  kinematics of the drawn legs, how far each stance foot drifts in the world. */
function walkRoute(
  d: LegDims,
  hipX: number,
  age: AgeGroup,
  route: Array<[number, number]>,
  opts: { speed: number; dt: number; shove?: (f: number) => FootOffset },
) {
  const m: WalkMotion = restingMotion()
  const joints: [FootOffset, FootOffset] = [
    { x: hipX, z: 0 },
    { x: -hipX, z: 0 },
  ]
  let x = route[0][0]
  let z = route[0][1]
  let yaw = Math.atan2(route[1][0] - x, route[1][1] - z)
  let seg = 0
  let worstSlip = 0
  let stances = 0
  const planted: Array<{ x: number; z: number } | null> = [null, null]
  // It stood there a moment before setting off.
  for (let f = 0; f < 3; f++) stepWalk(m, { x, z, yaw, unit: 1 }, opts.dt, d, age, false, joints)
  for (let f = 0; f < 6000 && seg < route.length - 1; f++) {
    const [tx, tz] = route[seg + 1]
    const dx = tx - x
    const dz = tz - z
    const step = opts.speed * opts.dt
    if (Math.hypot(dx, dz) <= step + (seg === route.length - 2 ? 0.08 : 0.35)) {
      seg++
      continue
    }
    const turn = steerHeading(yaw, Math.atan2(dx, dz), opts.speed, opts.dt)
    yaw = turn.yaw
    const before = { x, z }
    x += Math.sin(yaw) * step * turn.pace
    z += Math.cos(yaw) * step * turn.pace
    const push = opts.shove?.(f)
    if (push) {
      x += push.x
      z += push.z
    }
    stepWalk(m, { x, z, yaw, unit: 1 }, opts.dt, d, age, false, joints)
    const pose = walkPose(d, m.phase, m.reach, m.weight, age, m.crouch, [m.plants[0].offset, m.plants[1].offset])
    // Moving at all (a turn nearly on the spot included).
    const walking = Math.hypot(x - before.x, z - before.z) > 0.01 * step
    const c = Math.cos(pose.hipYaw)
    const sn = Math.sin(pose.hipYaw)
    pose.legs.forEach((l, i) => {
      const a = ankleAt(d, l)
      const j = joints[i]
      const lx = j.x * c + j.z * sn - a.y * Math.sin(l.roll ?? 0)
      const lz = -j.x * sn + j.z * c + a.z
      const world = { x: x + lx * Math.cos(yaw) + lz * Math.sin(yaw), z: z - lx * Math.sin(yaw) + lz * Math.cos(yaw) }
      if (!pose.feet[i].stance || !walking) {
        planted[i] = null
        return
      }
      if (!planted[i]) {
        planted[i] = world
        stances++
      }
      const p0 = planted[i] as { x: number; z: number }
      worstSlip = Math.max(worstSlip, Math.hypot(world.x - p0.x, world.z - p0.z))
    })
  }
  return { worstSlip, stances, arrived: seg >= route.length - 1 }
}

describe('a walker turning a corner keeps its planted foot', () => {
  const corners: Array<[string, Array<[number, number]>]> = [
    ['a right angle', [[0, 0], [0, 4], [4, 4]]],
    ['a sharp 135° bend', [[0, 0], [0, 4], [-2.5, 1.5]]],
    ['a doubling back past a door', [[0, 0], [0, 3], [0.3, 0.2], [0.2, 3]]],
    ['a zig-zag lane', [[0, 0], [1, 2], [-1, 4], [1, 6], [-1, 8]]],
  ]
  for (const [name, route] of corners) {
    it(`${name}: every waypoint reached, no stance foot drifts`, () => {
      for (const { age, p } of bodies) {
        const d = legDims(p)
        for (const dt of [1 / 60, 1 / 20]) {
          const r = walkRoute(d, p.hipX, age, route, { speed: age === 'child' ? 1.3 : 1.1, dt })
          expect(r.arrived).toBe(true)
          expect(r.stances).toBeGreaterThan(4)
          expect(r.worstSlip).toBeLessThanOrEqual(M.stanceSlipTolerance)
        }
      }
    })
  }

  it('a sideways shove (another body pushed clear) does not drag the planted foot', () => {
    const p = bodyProportions('female', 'adult')
    const d = legDims(p)
    const r = walkRoute(d, p.hipX, 'adult', [[0, 0], [0, 8]], {
      speed: 1.1,
      dt: 1 / 60,
      shove: (f) => ({ x: Math.sin(f / 9) * 0.004, z: 0 }),
    })
    expect(r.arrived).toBe(true)
    expect(r.worstSlip).toBeLessThanOrEqual(M.stanceSlipTolerance)
    // A long push aside, as a crowd shoves a walker clear for half a second.
    for (const { age, p: q } of bodies) {
      const long = walkRoute(legDims(q), q.hipX, age, [[0, 0], [0, 8]], {
        speed: 1.1,
        dt: 1 / 60,
        shove: (f) => (f % 120 < 30 ? { x: 0.3 / 60, z: 0 } : { x: 0, z: 0 }),
      })
      expect(long.worstSlip).toBeLessThanOrEqual(M.stanceSlipTolerance)
    }
  })

  it('the heading is turned, never snapped, and a way far off stops the pace', () => {
    const a = steerHeading(0, Math.PI * 0.9, 1.1, 1 / 60)
    expect(Math.abs(a.yaw)).toBeLessThanOrEqual(M.spotTurnRate / 60 + 1e-9)
    expect(a.pace).toBe(0)
    const b = steerHeading(0, 0.05, 1.1, 1 / 60)
    expect(b.pace).toBeGreaterThan(0.99)
  })
})

describe('the task walker gets up before it walks off', () => {
  it('no step is taken until the kneel has fully risen', () => {
    const d = legDims(bodyProportions('male', 'adult'))
    const p = bodyProportions('male', 'adult')
    const joints: [FootOffset, FootOffset] = [
      { x: p.hipX, z: 0 },
      { x: -p.hipX, z: 0 },
    ]
    for (const dt of [1 / 60, 1 / 24, 0.1]) {
      const m = restingMotion()
      let mode: WorkStopMode | 'go' = 'work'
      let timer = 2
      let x = 0
      let kneels = true
      let kneltFully = false
      let walkedOff = false
      for (let f = 0; f < 400; f++) {
        if (mode === 'work' || mode === 'rise') {
          const next = workStop(mode, timer, dt)
          mode = next.mode
          timer = next.timer
          kneels = next.kneels
        } else {
          // Walking: every step must be taken standing.
          expect(m.kneel).toBe(0)
          x += 1.2 * dt
          walkedOff = true
        }
        stepWalk(m, { x, z: 0, yaw: Math.PI / 2, unit: 1 }, dt, d, 'adult', kneels, joints)
        if (m.kneel === 1) kneltFully = true
      }
      expect(kneltFully).toBe(true)
      expect(walkedOff).toBe(true)
    }
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

  it('a steadying hand grips within reach, its elbow bent, against the drawn side of either task load', () => {
    const p = bodyProportions('female', 'adult')
    const shoulder = { x: p.shoulderX, y: p.shoulderY - p.crownY, z: 0 }
    const reach = p.upperArm + p.forearm + p.hand * 0.9
    // The drawn outlines, read off the meshes' own numbers: the bundle a box,
    // the jar a cylinder from its base radius to its rim.
    const drawn = {
      bundle: { height: TASK_BUNDLE.height, sideAt: () => TASK_BUNDLE.width / 2 },
      jar: { height: TASK_JAR.height, sideAt: (y: number) => TASK_JAR.bottom + ((TASK_JAR.top - TASK_JAR.bottom) * y) / TASK_JAR.height },
    }
    for (const carry of ['bundle', 'jar'] as const) {
      // Both configurations enabled, whatever the balance says today.
      const shape = steadiedLoad(carry, taskLoadShape(carry), true)
      expect(shape).not.toBeNull()
      for (const side of [1, -1] as const) {
        const sh = { ...shoulder, x: side * shoulder.x }
        const g = headLoadGrip(sh, side, shape!, reach)
        expect(Math.hypot(g.x - sh.x, g.y - sh.y, g.z)).toBeLessThanOrEqual(reach * 0.92 + 1e-9)
        expect(g.y).toBeGreaterThan(0)
        expect(g.y).toBeLessThanOrEqual(drawn[carry].height)
        expect(Math.abs(g.x)).toBeCloseTo(drawn[carry].sideAt(g.y) + GRIP_CLEARANCE, 6)
        expect(Math.sign(g.x)).toBe(side)
      }
      expect(loadRadiusAt(shape!, 0)).toBeCloseTo(drawn[carry].sideAt(0), 9)
      expect(loadRadiusAt(shape!, drawn[carry].height)).toBeCloseTo(drawn[carry].sideAt(drawn[carry].height), 9)
    }
    expect(steadiedLoad('bundle', taskLoadShape('bundle'), false)).toBeNull()
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
