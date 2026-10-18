// @vitest-environment node
// The glTF villager's clips on the drawn (hung) body: the carry onto the hung
// skeleton, the gait's no-slide (phase by distance, stride warped, planted foot
// held), the walk/sprint blend without a jump, and the shovel on the hand.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance, VILLAGER_ASSET, VILLAGER_GLTF, VILLAGER_POSE } from '../config/balance'
import { CHILD_FIGURE_SCALE } from './figures'
import { AGE_GROUPS, SEXES } from '../systems/appearance'
import { parseVillager, type VillagerAsset, type VillagerClip } from './villagerAsset'
import { clipGaitPose, clipPoseAt, gaitFootGround, kneeTurn, newClipGait, PLANT_TOUCH, samplePhase, type ClipGait, shovelOnHungHand, stanceOf, stepClipGait, toHung } from './villagerClipPose'
import { gltfPerson, type GltfPerson } from './villagerFigureBody'
import { contactPoints, forwardKinematics, gaitAt, newPose, newWorld, sprintWeight, toolInHand, type GaitClips } from './villagerRig'

let asset: VillagerAsset
let adult: GltfPerson
let child: GltfPerson

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
  adult = gltfPerson(asset, 'male', 'adult', 0)
  child = gltfPerson(asset, 'female', 'child', 0)
})

const quats = (n: number) => Array.from({ length: n }, () => new THREE.Quaternion())

/** The drawn body's world joints for hung locals (as three's bones would place them). */
function hungJoints(person: GltfPerson, local: THREE.Quaternion[], hips: THREE.Vector3) {
  const n = asset.bones.length
  const q = quats(n)
  const p = Array.from({ length: n }, () => new THREE.Vector3())
  const order = [...Array(n).keys()].sort((a, b) => depth(a) - depth(b))
  function depth(i: number): number {
    return asset.parents[i] < 0 ? 0 : 1 + depth(asset.parents[i])
  }
  for (const i of order) {
    const par = asset.parents[i]
    if (par < 0) {
      q[i].copy(local[i])
      p[i].copy(hips)
    } else {
      q[i].copy(q[par]).multiply(local[i])
      const off = new THREE.Vector3(
        person.rest[i * 3] - person.rest[par * 3],
        person.rest[i * 3 + 1] - person.rest[par * 3 + 1],
        person.rest[i * 3 + 2] - person.rest[par * 3 + 2],
      )
      p[i].copy(off.applyQuaternion(q[par])).add(p[par])
    }
  }
  return p
}

describe('a clip pose on the hung skeleton', () => {
  it('the hang itself is the drawn rest: identity locals, the hips at the drawn rest', () => {
    const n = asset.bones.length
    const f = adult.frame
    const pose = newPose(n)
    asset.parents.forEach((par, i) => {
      const q = par < 0 ? f.hang[i].clone() : f.hang[par].clone().invert().multiply(f.hang[i])
      q.toArray(pose.rot, i * 4)
    })
    const h = asset.parents.indexOf(-1)
    pose.hips.set(f.rest0[h * 3], f.rest0[h * 3 + 1], f.rest0[h * 3 + 2])
    const local = quats(n)
    const hips = new THREE.Vector3()
    toHung(asset, f, pose, local, hips)
    for (const q of local) expect(q.angleTo(new THREE.Quaternion())).toBeLessThan(2e-3)
    expect(hips.distanceTo(new THREE.Vector3(adult.rest[h * 3], adult.rest[h * 3 + 1], adult.rest[h * 3 + 2]))).toBeLessThan(1e-4)
  })

  it('every joint lands where the clip puts it, scaled onto the drawn body', () => {
    const n = asset.bones.length
    const f = child.frame
    const pose = clipPoseAt(asset, f, asset.clips.dig, 0.8, newPose(n))
    const world = forwardKinematics(asset, f.rest0, pose, newWorld(n))
    const local = quats(n)
    const hips = new THREE.Vector3()
    toHung(asset, f, pose, local, hips)
    const drawn = hungJoints(child, local, hips)
    for (let i = 0; i < n; i++) {
      const want = world.p[i].clone().setY(world.p[i].y - f.sole).multiplyScalar(f.scale)
      expect(drawn[i].distanceTo(want)).toBeLessThan(1e-4)
    }
  })
})

describe('a gait clip\'s stance', () => {
  const clip = (name: string, L: Record<'heel' | 'ball' | 'tip', [number, number][]>) =>
    ({ name, contacts: { support: { L, R: { heel: [], ball: [], tip: [] } } } }) as unknown as VillagerClip

  it('runs over every overlapping support span, not only those starting at the landing', () => {
    const c = clip('walk', { heel: [[0, 0.3]], ball: [[0.2, 0.5]], tip: [[0.4, 0.65]] })
    expect(stanceOf(c, 'L')).toEqual([0, 0.65])
    // a span after a gap belongs to no stance of this landing
    const gap = clip('walk', { heel: [[0, 0.3]], ball: [[0.4, 0.5]], tip: [] })
    expect(stanceOf(gap, 'L')).toEqual([0, 0.3])
    // the shipped walk carries the foot about two thirds of its cycle
    const w = stanceOf(asset.clips.walk, 'L')
    expect(w[1] - w[0]).toBeGreaterThan(0.6)
  })

  it('lands at the earliest touch of the support, not at the span starting nearest the landing phase', () => {
    // the right foot's heel lands at 0.35; its ball (0.5) only rolls on from there
    const c = {
      name: 'run',
      contacts: { support: { L: { heel: [], ball: [], tip: [] }, R: { heel: [[0.35, 0.55]], ball: [[0.5, 0.65]], tip: [[0.6, 0.7]] } } },
    } as unknown as VillagerClip
    expect(stanceOf(c, 'R')).toEqual([0.35, 0.7])
  })

  it('is read per clip object: two clips of one name keep their own stance', () => {
    const a = clip('walk', { heel: [[0, 0.6]], ball: [], tip: [] })
    const b = clip('walk', { heel: [[0, 0.2]], ball: [], tip: [] })
    expect(stanceOf(a, 'L')).toEqual([0, 0.6])
    expect(stanceOf(b, 'L')).toEqual([0, 0.2])
  })
})

describe('the gait feet\'s ground height', () => {
  it('is read afresh when the jog or sprint clip is replaced on the same person and walk', () => {
    const f = gltfPerson(asset, 'male', 'adult', 0).frame
    for (const [name, w] of [['jog', { walk: 0, jog: 1, sprint: 0 }], ['sprint', { walk: 0, jog: 0, sprint: 1 }]] as const) {
      const before = [...gaitFootGround(asset, f, asset.clips.walk, w)]
      // the other run in its place: a clip of other heights, the person and walk kept
      const swapped = { ...asset, clips: { ...asset.clips, [name]: name === 'jog' ? asset.clips.sprint : asset.clips.jog } }
      const fresh = [...gaitFootGround(swapped, gltfPerson(asset, 'male', 'adult', 0).frame, asset.clips.walk, w)]
      expect(Math.max(...fresh.map((h, i) => Math.abs(h - before[i]))), name).toBeGreaterThan(1e-4)
      const read = [...gaitFootGround(swapped, f, asset.clips.walk, w)]
      read.forEach((h, i) => expect(h, `${name} ${i}`).toBeCloseTo(fresh[i], 9))
    }
  })
})

describe('the clip gait on the ground', () => {
  /** Walk a person straight ahead at `speed` and record each planted foot's
   *  world slide. `probes` > 1 also samples each frame interval that many
   *  times from a copy of the frame's gait state (nothing drawn, the state
   *  carried on unchanged) and measures every contact down at the frame
   *  against itself at those sub-frame instants. */
  function walkStraight(person: GltfPerson, speed: number, hold = true, seconds = 4, dt = 1 / 60, probes = 1) {
    const n = asset.bones.length
    const g = newClipGait()
    const pose = newPose(n)
    const world = newWorld(n)
    const f = person.frame
    let slide = 0
    let lowest = Infinity
    // per foot, frames with a contact down, contacts measured down on two
    // frames running, and contacts measured down at a frame and at one of its
    // sub-frame probes (a floating foot has none; a run's stance at the bands
    // can touch at most one 30 Hz frame running, so there it lands without a
    // pair and only the probes measure it)
    const downs = { L: 0, R: 0 }
    const pairs = { L: 0, R: 0 }
    const probed = { L: 0, R: 0 }
    /** The contacts down after stepping `gait` by `walked` to the body at `z` (world x, z). */
    const downAt = (gait: ClipGait, walked: number, z: number) => {
      stepClipGait(gait, asset, f, walked, speed)
      clipGaitPose(gait, asset, f, speed, hold ? { x: 0, z, yaw: 0, unit: 1 } : null, pose)
      forwardKinematics(asset, f.rest0, pose, world)
      const c = contactPoints(asset, world, f.legScale)
      const down: Record<string, THREE.Vector3> = {}
      for (const s of ['L', 'R'] as const) {
        for (const k of ['heel', 'ball', 'tip'] as const) {
          const p = c[s][k]
          lowest = Math.min(lowest, p.y)
          if (p.y <= 0.01) down[s + k] = new THREE.Vector3(p.x * f.scale, 0, p.z * f.scale + z)
        }
      }
      return down
    }
    let last: Record<string, THREE.Vector3> = {}
    let z = 0
    for (let t = 0; t < seconds; t += dt) {
      const walked = speed * dt
      z += walked
      const now = downAt(g, walked, z)
      const keys = Object.keys(now)
      if (t > 1) {
        for (const key of keys) {
          const s = key[0] as 'L' | 'R'
          downs[s]++
          if (!last[key]) continue
          slide = Math.max(slide, now[key].distanceTo(last[key]))
          pairs[s]++
        }
        for (let j = 1; j < probes && keys.length; j++) {
          const part = (walked * j) / probes
          const sub = downAt(structuredClone(g), part, z + part)
          for (const key of keys) {
            if (!sub[key]) continue
            slide = Math.max(slide, sub[key].distanceTo(now[key]))
            probed[key[0] as 'L' | 'R']++
          }
        }
      }
      last = now
    }
    return { slide, lowest, downs, pairs, probed }
  }

  it('with the hold, a planted foot does not slide across the whole speed ramp: every body, both cross-fades, 30/60/120 Hz', () => {
    // natural-villager-motion step 5: the walk ↔ jog ↔ sprint bands are no
    // longer exempt — 0.004 person units per frame everywhere
    const bodies = [
      ...SEXES.flatMap((sex) => AGE_GROUPS.map((age) => gltfPerson(asset, sex, age, 0))),
      gltfPerson(asset, 'male', 'adult', -1),
      gltfPerson(asset, 'male', 'adult', 1),
    ]
    const G = VILLAGER_GLTF
    // per unit of leg: a stroll, the walk, both bands (edges and middle), the jog, a dash
    const ramp = [0.4, 1.0, G.jogThreshold - G.jogBand, G.jogThreshold, G.jogThreshold + G.jogBand, 3.5, 5.5, G.sprintThreshold - G.sprintBand, G.sprintThreshold, G.sprintThreshold + G.sprintBand, 8.6]
    for (const person of bodies) {
      const per = person.frame.legScale * person.frame.scale
      for (const hz of [30, 60, 120]) {
        for (const v of ramp) {
          // 30 Hz probes each frame at its half: the slide is measured there
          // even where no contact stays down two frames running
          const r = walkStraight(person, v * per, true, 3, 1 / hz, hz === 30 ? 2 : 1)
          const where = `${v} per leg at ${hz} Hz, leg ${person.frame.legScale.toFixed(2)}`
          expect(r.slide, where).toBeLessThan(0.004)
          // the slide was measured: each foot came down and was followed
          // there (from 60 Hz frame to frame, at 30 Hz to the half frame),
          // and no foot sank into the ground
          expect(Math.min(r.downs.L, r.downs.R), where).toBeGreaterThan(0)
          const followed = hz >= 60 ? r.pairs : r.probed
          expect(Math.min(followed.L, followed.R), where).toBeGreaterThan(0)
          expect(r.lowest, where).toBeGreaterThan(-0.005)
        }
      }
    }
  }, 240_000)

  it('a held foot shoved off its clip lets go by easing, never by a jump when its last contact lifts', () => {
    const n = asset.bones.length
    const f = adult.frame
    const foot = ['L', 'R'].map((s) => asset.bones.indexOf(`foot.${s}`))
    const g = newClipGait()
    const pose = newPose(n)
    const world = newWorld(n)
    const speed = 0.8
    const dt = 1 / 60
    let z = 0
    let shove = 0
    let last: number[] | null = null
    let worst = 0
    for (let t = 0; t < 4; t += dt) {
      z += speed * dt
      // a sideways shove of the body while the feet stand held
      if (t > 1.5 && shove === 0) shove = 0.1 * f.scale
      stepClipGait(g, asset, f, speed * dt, speed)
      clipGaitPose(g, asset, f, speed, { x: shove, z, yaw: 0, unit: 1 }, pose)
      forwardKinematics(asset, f.rest0, pose, world)
      const xs = foot.map((i) => world.p[i].x)
      // the shove's own frame moves every held foot by design; judge the rest
      if (last && !(t > 1.5 && t - dt <= 1.5)) worst = Math.max(worst, ...xs.map((x, k) => Math.abs(x - last![k])))
      last = xs
    }
    expect(worst).toBeLessThan(0.02)
  })

  it('planting switched off holds nothing: no correction left over from earlier holds', () => {
    const n = asset.bones.length
    const f = adult.frame
    const foot = ['L', 'R'].map((s) => asset.bones.indexOf(`foot.${s}`))
    const g = newClipGait()
    const pose = newPose(n)
    const speed = 0.8
    const dt = 1 / 60
    let z = 0
    for (let t = 0; t < 2; t += dt) {
      z += speed * dt
      stepClipGait(g, asset, f, speed * dt, speed)
      // shoved sideways, so the held feet carry a correction
      clipGaitPose(g, asset, f, speed, { x: t > 1 ? 0.1 * f.scale : 0, z, yaw: 0, unit: 1 }, pose)
    }
    expect(Math.hypot(g.slip[0].x, g.slip[1].x)).toBeGreaterThan(0)
    // the same phase, planting off: as a gait that never held anything
    const fresh = newClipGait()
    fresh.phase = g.phase
    fresh.slipPhase = g.phase
    const a = forwardKinematics(asset, f.rest0, clipGaitPose(g, asset, f, speed, null, newPose(n)), newWorld(n))
    const b = forwardKinematics(asset, f.rest0, clipGaitPose(fresh, asset, f, speed, null, newPose(n)), newWorld(n))
    for (const i of foot) expect(a.p[i].distanceTo(b.p[i])).toBeLessThan(1e-9)
  })

  it("the tag game's fastest child still jogs: the sprint blend starts above a fresh runner's top pace", () => {
    const tag = balance.villageLife.tag
    const top = tag.sprintSpeed * tag.runnerBoost
    for (const sex of SEXES) {
      const f = gltfPerson(asset, sex, 'child', 0).frame
      // the figure's own speed (world / group scale), then as clipGaitPose reads it
      const v = top / CHILD_FIGURE_SCALE / f.scale
      expect(sprintWeight(v, f.legScale), sex).toBe(0)
      // with a margin: two per cent more pace still stays out of the band
      expect(sprintWeight(v * 1.02, f.legScale), sex).toBe(0)
    }
  })

  it('the feet never sink below the ground', () => {
    for (const v of [0.6, 1.2, 3.4]) expect(walkStraight(adult, v).lowest).toBeGreaterThan(-0.01)
  })

  it('walk → jog → sprint is continuous: a small change of pace moves no joint by a jump', () => {
    const n = asset.bones.length
    const f = adult.frame
    const g = newClipGait()
    g.phase = 0.3
    const a = newPose(n)
    const b = newPose(n)
    const wa = newWorld(n)
    const wb = newWorld(n)
    // per 0.02 of pace. The walk ↔ jog band syncs the stances of gaits of very
    // different support (walk 0.675 of the cycle, jog 0.107): the swinging leg
    // sweeps through part of its cycle across the band, 0.048 at this phase
    // (measured 15.10.2026; 0.029 while the walk's stance was misread as 0.3)
    for (const [t, limit] of [
      [VILLAGER_GLTF.jogThreshold, 0.06],
      [VILLAGER_GLTF.sprintThreshold, 0.03],
    ]) {
      const threshold = t * f.legScale * f.scale
      for (let v = threshold - 0.8; v < threshold + 0.8; v += 0.02) {
        clipGaitPose(g, asset, f, v, null, a)
        clipGaitPose(g, asset, f, v + 0.02, null, b)
        forwardKinematics(asset, f.rest0, a, wa)
        forwardKinematics(asset, f.rest0, b, wb)
        for (let i = 0; i < n; i++) expect(wa.p[i].distanceTo(wb.p[i]), `${t} band at ${v.toFixed(2)}, bone ${asset.bones[i]}`).toBeLessThan(limit)
      }
    }
  })
})

describe('the shovel on the drawn hand', () => {
  it('in the dig clip the blade stays clear of the body and the shaft runs through the hand', () => {
    const f = adult.frame
    const grip = asset.clips.dig.tool!.grip
    const at = shovelOnHungHand(asset, f, 'R', grip)
    // the fist holds the shaft: the shaft line passes within a hand's breadth of the bone
    const shaft = new THREE.Vector3(0, 1, 0).applyQuaternion(at.quaternion)
    const closest = at.position.clone().sub(shaft.clone().multiplyScalar(at.position.dot(shaft)))
    expect(closest.length()).toBeLessThan(0.12)
    expect(VILLAGER_ASSET.shovel.tip).toBeLessThan(VILLAGER_ASSET.shovel.shaftBottom)
  })
})

describe('the clips themselves', () => {
  it('the dig never turns the shovel about its own shaft: per frame, once the shaft\'s swing is taken out', () => {
    const c = asset.clips.dig
    const n = asset.bones.length
    const f = adult.frame
    const hand = asset.bones.indexOf('hand.R')
    const inHand = toolInHand(asset, 'R', c.tool!.grip).quaternion
    const pose = newPose(n)
    const world = newWorld(n)
    const tools = Array.from(c.times, (t) => {
      clipPoseAt(asset, f, c, t, pose)
      forwardKinematics(asset, f.rest0, pose, world)
      return world.q[hand].clone().multiply(inHand)
    })
    let worst = 0
    let total = 0
    for (let k = 1; k < tools.length; k++) {
      const a0 = new THREE.Vector3(0, 1, 0).applyQuaternion(tools[k - 1])
      const a1 = new THREE.Vector3(0, 1, 0).applyQuaternion(tools[k])
      // the face carried by the shortest swing of the shaft, against the face itself
      const carried = new THREE.Vector3(0, 0, 1).applyQuaternion(tools[k - 1]).applyQuaternion(new THREE.Quaternion().setFromUnitVectors(a0, a1))
      const face = new THREE.Vector3(0, 0, 1).applyQuaternion(tools[k])
      const roll = Math.atan2(carried.clone().cross(face).dot(a1), carried.dot(face))
      worst = Math.max(worst, Math.abs(roll))
      total += roll
    }
    // the loop's leftover (holonomy, ~18°) is spread evenly: ~0.25° a frame
    expect(worst).toBeLessThan((1 * Math.PI) / 180)
    expect(Math.abs(total)).toBeLessThan((25 * Math.PI) / 180)
  })

  it('no bone jumps between two frames of any clip (an IK flip would)', () => {
    for (const [name, c] of Object.entries(asset.clips)) {
      const n = c.times.length
      c.rot.forEach((r, i) => {
        if (!r.length) return
        for (let k = 1; k < n; k++) {
          const a = new THREE.Quaternion().fromArray(r, (k - 1) * 4)
          const b = new THREE.Quaternion().fromArray(r, k * 4)
          const step = c.times[k] - c.times[k - 1]
          // 9 rad/s holds the dig's throw and the walk's swing; a runner's (jog, sprint)
          // thigh swings at up to ~17 (the sprint's knee snapped at ~30 before the softening)
          expect(a.angleTo(b) / step, `${name} ${asset.bones[i]} frame ${k}`).toBeLessThan(name === 'sprint' || name === 'jog' ? 18 : 9)
        }
      })
    }
  })
})

describe('the corrective leg solve (natural-villager-motion step 10)', () => {
  /** The figure speed (figure units/s) at which the person's walk strides `k` of its clip. */
  function speedForStride(person: GltfPerson, k: number): number {
    const f = person.frame
    let lo = 0.05
    let hi = VILLAGER_GLTF.jogThreshold - VILLAGER_GLTF.jogBand - 0.01
    for (let it = 0; it < 60; it++) {
      const mid = (lo + hi) / 2
      if (gaitAt(asset.clips as unknown as GaitClips, mid * f.legScale, f.legScale).stride <= k) lo = mid
      else hi = mid
    }
    return ((lo + hi) / 2) * f.legScale * f.scale
  }

  it("corrective leg IK keeps the clip's leg when nothing is held", () => {
    const n = asset.bones.length
    const f = adult.frame
    const v = speedForStride(adult, 1)
    expect(gaitAt(asset.clips as unknown as GaitClips, v / f.scale, f.legScale).stride).toBeCloseTo(1, 6)
    const g = newClipGait()
    const out = newPose(n)
    const clip = newPose(n)
    const legs = ['thigh', 'shin', 'foot', 'toe'].flatMap((b) => [`${b}.L`, `${b}.R`]).map((b) => asset.bones.indexOf(b))
    let worst = 0
    for (let k = 0; k < 48; k++) {
      g.phase = k / 48
      // nothing held (no ground), the clip's own stride
      clipGaitPose(g, asset, f, v, null, out)
      samplePhase(asset.clips.walk, g.phase, f, clip)
      for (const b of legs) {
        const s = out.rot[b * 4] * clip.rot[b * 4] + out.rot[b * 4 + 1] * clip.rot[b * 4 + 1] + out.rot[b * 4 + 2] * clip.rot[b * 4 + 2] + out.rot[b * 4 + 3] * clip.rot[b * 4 + 3] < 0 ? -1 : 1
        for (let c = 0; c < 4; c++) worst = Math.max(worst, Math.abs(out.rot[b * 4 + c] - s * clip.rot[b * 4 + c]))
      }
    }
    // the locals are the clip's
    expect(worst).toBeLessThan(1e-4)
  })

  it('the knee turns continuously as the knee crosses the hip–ankle line: no flip of its bend', () => {
    // a unit leg, nearly straight, its knee from just in front of the line to
    // well behind it — across the band where the hinge once flipped (knee z
    // −0.0009999 vs −0.0010001 turned the shin +0.216 vs −0.218 rad), the
    // pole blend's midpoint at −straight/2 (where it once passed through zero
    // and moved the ankle 0.785 for a 2e-7 knee move) and past `straight`
    const hip = new THREE.Vector3(0, 1, 0)
    const ankle = new THREE.Vector3(0, 0, 0)
    const want = 0.9
    const axis = new THREE.Vector3()
    let last: THREE.Vector3 | null = null
    let jump = 0
    for (let k = 0; k <= 30000; k++) {
      const knee = new THREE.Vector3(0, 0.5, 0.001 - k * 0.0000005)
      const turn = kneeTurn(hip, knee, ankle, want, VILLAGER_POSE.kneePoleMin, axis)
      const moved = ankle.clone().sub(knee).applyAxisAngle(axis, turn).add(knee)
      // the target length reached, the knee bent forward (the ankle behind it)
      expect(moved.distanceTo(hip)).toBeCloseTo(want, 6)
      expect(moved.z).toBeLessThan(0)
      if (last) jump = Math.max(jump, moved.distanceTo(last))
      last = moved
    }
    // 5e-7 of knee per step moves the ankle by about as little
    expect(jump).toBeLessThan(1e-3)
    // and right at the blend's midpoint, a 2e-7 knee move
    const mid = -VILLAGER_POSE.kneePoleMin / 2
    const at = (z: number) => {
      const knee = new THREE.Vector3(0, 0.5, z)
      const turn = kneeTurn(hip, knee, ankle, want, VILLAGER_POSE.kneePoleMin, axis)
      return ankle.clone().sub(knee).applyAxisAngle(axis, turn).add(knee)
    }
    expect(at(mid + 1e-7).distanceTo(at(mid - 1e-7))).toBeLessThan(1e-5)
  })

  it('held foot still holds', () => {
    // the foot's sole contacts (heel and ball), from the frame each touches
    // down while it stays down, drift on the ground by less than a
    // millimetre, at a short, the clip's and a long stride. OPEN: the toe tip
    // (on the toe bone) drifts up to 1.9 mm while the clip's toe flexes under
    // a held ball (measured 18.10.2026, the same on main); bending the toe
    // onto the tip's hold broke the full-ramp no-slide test at the jog
    const n = asset.bones.length
    const f = adult.frame
    for (const k of [0.75, 1.0, 1.35]) {
      const v = speedForStride(adult, k)
      const g = newClipGait()
      const pose = newPose(n)
      const world = newWorld(n)
      const at = new Map<string, THREE.Vector3>()
      const dt = 1 / 60
      let z = 0
      let drift = 0
      let runs = 0
      for (let t = 0; t < 7; t += dt) {
        z += v * dt
        stepClipGait(g, asset, f, v * dt, v)
        clipGaitPose(g, asset, f, v, { x: 0, z, yaw: 0, unit: 1 }, pose)
        forwardKinematics(asset, f.rest0, pose, world)
        const c = contactPoints(asset, world, f.legScale)
        for (const s of ['L', 'R'] as const) {
          for (const key of ['heel', 'ball'] as const) {
            const p = c[s][key]
            const id = s + key
            // on the ground: within a quarter of the touch height (5 mm); a
            // contact rising past it is rolling off (the ball over the toe)
            if (p.y > 0.25 * PLANT_TOUCH * f.legScale) {
              at.delete(id)
              continue
            }
            const here = new THREE.Vector3(p.x * f.scale, 0, p.z * f.scale + z)
            const first = at.get(id)
            if (!first) {
              if (t > 1) runs++
              at.set(id, here)
            } else if (t > 1) {
              const d = here.distanceTo(first)
              drift = Math.max(drift, d)
            }
          }
        }
      }
      expect(runs, `stride ${k}`).toBeGreaterThan(4)
      expect(drift, `stride ${k}`).toBeLessThan(0.001)
    }
  })
})
