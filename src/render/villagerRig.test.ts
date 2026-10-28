// @vitest-environment node
// The glTF villager's pure pose arithmetic against the committed asset
// (public/models/villager.glb, read from disk): morphs from the appearance
// table, the walk/sprint threshold and the speed → stride/cadence mapping, the
// feet's contacts in walk and sprint, and the tool held in the hand bone.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_ASSET, VILLAGER_GLTF } from '../config/balance'
import { AGE_GROUPS, SEXES } from '../systems/appearance'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { legScale, morphInfluences, restHeads } from './villagerBody'
import {
  contactPoints,
  forwardKinematics,
  gaitAt,
  gaitWeights,
  newPose,
  newWorld,
  sampleClip,
  sprintWeight,
  strideFactor,
  toolInHand,
  type GaitClips,
} from './villagerRig'

let asset: VillagerAsset
const clips = () => asset.clips as unknown as GaitClips

beforeAll(async () => {
  const buf = readFileSync(resolve(__dirname, '../../public/models/villager.glb'))
  asset = await parseVillager(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
})

describe('the glTF villager asset', () => {
  it('carries the skeleton the dress layer expects, with a toe joint per foot', () => {
    for (const b of ['hips', 'spine', 'chest', 'neck', 'head', 'upperArm.L', 'forearm.L', 'hand.L', 'thigh.R', 'shin.R', 'foot.R', 'toe.L', 'toe.R']) {
      expect(asset.bones).toContain(b)
    }
    expect(asset.parents[asset.bones.indexOf('toe.L')]).toBe(asset.bones.indexOf('foot.L'))
    expect(asset.parents[asset.bones.indexOf('foot.L')]).toBe(asset.bones.indexOf('shin.L'))
  })

  it('has a three-segment spine over a short pelvis: 22 bones, hips → spine → spine1 → chest → neck', () => {
    expect(asset.bones).toHaveLength(22)
    const parent = (b: string) => asset.bones[asset.parents[asset.bones.indexOf(b)]]
    expect(asset.parents[asset.bones.indexOf('hips')]).toBe(-1)
    expect(parent('spine')).toBe('hips')
    expect(parent('spine1')).toBe('spine')
    expect(parent('chest')).toBe('spine1')
    expect(parent('neck')).toBe('chest')
    // the trunk in chain order, root first (the pose code walks topoOrder)
    expect(['hips', 'spine', 'spine1', 'chest'].map((b) => asset.bones.indexOf(b))).toEqual([0, 1, 2, 3])
    // four distinct pivots up the trunk, each above the one below
    const y = (b: string) => asset.rest[asset.bones.indexOf(b) * 3 + 1]
    const trunk = ['hips', 'spine', 'spine1', 'chest', 'neck'].map(y)
    for (let k = 1; k < trunk.length; k++) expect(trunk[k] - trunk[k - 1]).toBeGreaterThan(0.02)
  })

  it('has the clips the figure plays', () => {
    for (const c of ['idle', 'walk', 'jog', 'sprint', 'kneelDown', 'kneel', 'kneelUp', 'dig', 'carry', 'carryIdle']) expect(asset.clips[c]).toBeDefined()
    expect(asset.clips.walk.speed).toBeGreaterThan(0)
    expect(asset.clips.sprint.speed).toBeGreaterThan(asset.clips.walk.speed)
  })
})

describe('morphs from the appearance table', () => {
  it('maps every sex and age corner onto the bilinear morphs', () => {
    expect(morphInfluences('male', 'adult')).toEqual({})
    expect(morphInfluences('female', 'adult')).toEqual({ female: 1 })
    expect(morphInfluences('male', 'child')).toEqual({ child: 1 })
    expect(morphInfluences('female', 'elder')).toEqual({ female: 1, elder: 1, elder_f: 1 })
    for (const s of SEXES) for (const a of AGE_GROUPS) for (const m of Object.keys(morphInfluences(s, a))) expect(asset.morphs).toContain(m)
  })

  it('adds the build morph, scaled for the age, and never both directions', () => {
    expect(morphInfluences('male', 'adult', 1)).toEqual({ stout: 1 })
    expect(morphInfluences('male', 'adult', -0.5)).toEqual({ slight: 0.5 })
    expect(morphInfluences('female', 'child', 1).stout).toBeCloseTo(VILLAGER_GLTF.buildByAge.child)
  })

  it('moves the skeleton with the body: a child has relatively shorter legs, a woman a lower crown', () => {
    const man = restHeads(asset, morphInfluences('male', 'adult'))
    const child = restHeads(asset, morphInfluences('male', 'child'))
    expect(legScale(asset, man)).toBeCloseTo(1, 5)
    expect(legScale(asset, child)).toBeLessThan(0.97)
    const head = asset.bones.indexOf('head')
    const woman = restHeads(asset, morphInfluences('female', 'adult'))
    expect(woman[head * 3 + 1]).toBeLessThan(man[head * 3 + 1])
  })
})

describe('speed → clip, stride and cadence', () => {
  it('walks below the threshold and sprints above it, per unit of leg', () => {
    const t = VILLAGER_GLTF.sprintThreshold
    const b = VILLAGER_GLTF.sprintBand
    expect(sprintWeight(t - b - 0.01, 1)).toBe(0)
    expect(sprintWeight(t + b + 0.01, 1)).toBe(1)
    expect(sprintWeight(t, 1)).toBeCloseTo(0.5)
    // a shorter leg reaches the sprint at a lower speed
    expect(sprintWeight(t * 0.8, 0.8)).toBeCloseTo(0.5)
  })

  it('blends without a jump: the sprint share is continuous in speed', () => {
    let last = 0
    for (let v = 0; v < 5; v += 0.01) {
      const s = sprintWeight(v, 1)
      expect(Math.abs(s - last)).toBeLessThan(0.05)
      last = s
    }
  })

  it('lengthens the stride with pace (bounded) and lets cadence take the rest', () => {
    expect(strideFactor(1, 1)).toBe(1)
    expect(strideFactor(1.5, 1)).toBeCloseTo(Math.sqrt(1.5))
    expect(strideFactor(10, 1)).toBe(VILLAGER_GLTF.strideMax)
    expect(strideFactor(0.01, 1)).toBe(VILLAGER_GLTF.strideMin)
  })

  it('advances the phase by exactly the distance one cycle covers', () => {
    const g = gaitAt(clips(), 1.2, 1)
    expect(g.sprint).toBe(0)
    expect(g.jog).toBe(0)
    expect(g.cycle).toBeCloseTo(asset.clips.walk.speed * asset.clips.walk.duration * g.strideWalk)
    expect(g.phasePerUnit * g.cycle).toBeCloseTo(1)
    // a child (shorter leg) needs more cycles for the same ground
    const child = gaitAt(clips(), 1.2, 0.85)
    expect(child.phasePerUnit).toBeGreaterThan(g.phasePerUnit)
  })

  it('walk → jog → sprint by speed: the weights sum to 1, each gait wins its own band, the phase rate is continuous', () => {
    expect(VILLAGER_GLTF.jogThreshold + VILLAGER_GLTF.jogBand).toBeLessThan(VILLAGER_GLTF.sprintThreshold - VILLAGER_GLTF.sprintBand)
    let last = gaitAt(clips(), 0.05, 1)
    for (let v = 0.06; v < 10; v += 0.01) {
      for (const legs of [1, 0.85]) {
        const w = gaitWeights(v, legs)
        expect(w.walk + w.jog + w.sprint).toBeCloseTo(1, 12)
        for (const x of [w.walk, w.jog, w.sprint]) expect(x).toBeGreaterThanOrEqual(0)
      }
      const g = gaitAt(clips(), v, 1)
      // continuous: no jump of the phase rate at a band's edge or inside it
      expect(Math.abs(g.phasePerUnit - last.phasePerUnit) / last.phasePerUnit).toBeLessThan(0.02)
      last = g
    }
    expect(gaitWeights(1.0, 1).walk).toBe(1)
    // between the bands the jog runs alone
    const mid = gaitWeights((VILLAGER_GLTF.jogThreshold + VILLAGER_GLTF.sprintThreshold) / 2, 1)
    expect(mid.jog).toBe(1)
    expect(mid.walk).toBe(0)
    expect(gaitWeights(VILLAGER_GLTF.sprintThreshold + VILLAGER_GLTF.sprintBand + 0.1, 1).sprint).toBe(1)
  })
})

describe('the feet in the clips', () => {
  const heights = (clip: string, frames = 60) => {
    const pose = newPose(asset.bones.length)
    const world = newWorld(asset.bones.length)
    const c = asset.clips[clip]
    const out: Array<Record<'L' | 'R', Record<'heel' | 'ball' | 'tip', number>>> = []
    for (let f = 0; f < frames; f++) {
      sampleClip(c, (c.duration * f) / frames, pose)
      forwardKinematics(asset, asset.rest, pose, world)
      const cp = contactPoints(asset, world)
      out.push({
        L: { heel: cp.L.heel.y, ball: cp.L.ball.y, tip: cp.L.tip.y },
        R: { heel: cp.R.heel.y, ball: cp.R.ball.y, tip: cp.R.tip.y },
      })
    }
    return out
  }

  it('walk: the heel strikes first, the foot rolls over the ball and pushes off over the toes', () => {
    const h = heights('walk', 80)
    const touch = 0.012
    // the left foot's landing: the first frame anything of it is down after a swing
    const low = h.map((f) => Math.min(f.L.heel, f.L.ball, f.L.tip))
    let land = -1
    for (let f = 6; f < low.length; f++) if (low[f] < touch && Math.max(...low.slice(f - 6, f)) > 3 * touch) land = land < 0 ? f : land
    if (land < 0) land = low.findIndex((v) => v < touch)
    expect(land).toBeGreaterThanOrEqual(0)
    expect(h[land].L.heel).toBeLessThan(h[land].L.ball)
    // later in the stance the heel is up while the toe still carries
    const pushOff = h.findIndex((f, i) => i > land && f.L.heel > 2 * touch && f.L.tip < touch)
    expect(pushOff).toBeGreaterThan(land)
    // and at some frame the whole foot is down (the roll over the ball)
    expect(h.some((f) => f.L.heel < touch && f.L.ball < touch)).toBe(true)
  })

  it('sprint: on the balls of the feet throughout, the heel never touches', () => {
    const h = heights('sprint', 80)
    for (const f of h) {
      expect(f.L.heel).toBeGreaterThan(0.025)
      expect(f.R.heel).toBeGreaterThan(0.025)
    }
    expect(Math.min(...h.map((f) => Math.min(f.L.ball, f.L.tip)))).toBeLessThan(0.02)
  })

  it('walk: some foot is always on the ground', () => {
    for (const f of heights('walk', 80)) expect(Math.min(f.L.heel, f.L.ball, f.L.tip, f.R.heel, f.R.ball, f.R.tip)).toBeLessThan(0.006)
  })
})

describe('the tool is held in the hand bone', () => {
  it('puts the shaft through the closed fist and the tool frame on the grip rotation', () => {
    const t = toolInHand(asset, 'R', 0)
    expect(t.position.distanceTo(asset.toolHold.R.offset)).toBeLessThan(1e-6)
    expect(t.quaternion.angleTo(asset.toolHold.R.rotation)).toBeLessThan(1e-6)
    // gripping higher up the shaft slides the tool down through the fist
    const up = toolInHand(asset, 'R', 0.1)
    const shaft = new THREE.Vector3(0, 1, 0).applyQuaternion(t.quaternion)
    expect(up.position.clone().sub(t.position).dot(shaft)).toBeCloseTo(-0.1)
  })

  it('in the dig clip the other hand holds the same shaft higher up', () => {
    const dig = asset.clips.dig
    expect(dig.tool?.hand).toBe('R')
    expect(dig.tool!.other!).toBeGreaterThan(dig.tool!.grip)
    const pose = newPose(asset.bones.length)
    const world = newWorld(asset.bones.length)
    for (let f = 0; f < 12; f++) {
      sampleClip(dig, (dig.duration * f) / 12, pose)
      forwardKinematics(asset, asset.rest, pose, world)
      const hR = asset.bones.indexOf('hand.R')
      const hL = asset.bones.indexOf('hand.L')
      const tool = toolInHand(asset, 'R', dig.tool!.grip)
      const q = world.q[hR].clone().multiply(tool.quaternion)
      const origin = tool.position.clone().applyQuaternion(world.q[hR]).add(world.p[hR])
      const otherGrip = origin.clone().add(new THREE.Vector3(0, dig.tool!.other!, 0).applyQuaternion(q))
      const leftFist = asset.toolHold.L.offset.clone().applyQuaternion(world.q[hL]).add(world.p[hL])
      expect(leftFist.distanceTo(otherGrip)).toBeLessThan(0.01)
    }
  })

  it('in the dig clip the head follows the blade tip frame by frame, not a fixed point', () => {
    const dig = asset.clips.dig
    const pose = newPose(asset.bones.length)
    const world = newWorld(asset.bones.length)
    const hR = asset.bones.indexOf('hand.R')
    const ih = asset.bones.indexOf('head')
    const frames = Array.from({ length: 24 }, (_, f) => {
      sampleClip(dig, (dig.duration * f) / 24, pose)
      forwardKinematics(asset, asset.rest, pose, world)
      const tool = toolInHand(asset, 'R', dig.tool!.grip)
      const q = world.q[hR].clone().multiply(tool.quaternion)
      const origin = tool.position.clone().applyQuaternion(world.q[hR]).add(world.p[hR])
      const tip = origin.add(new THREE.Vector3(0, VILLAGER_ASSET.shovel.tip, 0).applyQuaternion(q))
      const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(world.q[ih])
      return { tip, head: world.p[ih].clone(), fwd }
    })
    const off = (k: number, target: THREE.Vector3) => frames[k].fwd.angleTo(target.clone().sub(frames[k].head))
    // where the blade has moved away from its first-frame place, the head
    // looks nearer the moving tip than that fixed place (the bug aimed at it)
    let judged = 0
    for (let k = 1; k < frames.length; k++) {
      if (frames[k].tip.distanceTo(frames[0].tip) < 0.15) continue
      judged++
      expect(off(k, frames[k].tip)).toBeLessThan(off(k, frames[0].tip))
    }
    expect(judged).toBeGreaterThan(4)
  })
})

describe('the clip style (natural-villager-motion step 6)', () => {
  /** A bone's forward tilt (deg) per sampled frame of a clip: its up axis off
   *  the vertical, seen from the side (or, with `yaw`, its facing off ahead). */
  const tilts = (clip: string, bone: string, yaw = false) => {
    const c = asset.clips[clip]
    const n = asset.bones.length
    const pose = newPose(n)
    const world = newWorld(n)
    const i = asset.bones.indexOf(bone)
    const k = 24
    return Array.from({ length: k }, (_, f) => {
      sampleClip(c, (f / k) * c.duration, pose)
      forwardKinematics(asset, asset.rest, pose, world)
      const v = new THREE.Vector3(0, yaw ? 0 : 1, yaw ? 1 : 0).applyQuaternion(world.q[i])
      return ((yaw ? Math.atan2(v.x, v.z) : Math.atan2(v.z, v.y)) * 180) / Math.PI
    })
  }
  /** The tilt's size: its mean over the clip of each frame's absolute tilt
   *  (a clip swinging ±30° or leaning back has no small mean), and the worst
   *  single frame. */
  const size = (clip: string, bone: string, yaw = false) => {
    const t = tilts(clip, bone, yaw).map(Math.abs)
    return { mean: t.reduce((s, x) => s + x, 0) / t.length, worst: Math.max(...t) }
  }
  // a single frame may swing past the mean's bound with the stride, never
  // dive (the jog's chest peaks at 19.9°, measured 15.10.2026)
  const DIVE = 25
  it('the sprint no longer dives: hips upright, chest under 15°; the jog likewise', () => {
    expect(size('sprint', 'hips').worst).toBeLessThan(2)
    for (const clip of ['sprint', 'jog']) {
      const chest = size(clip, 'chest')
      expect(chest.mean, clip).toBeLessThan(15)
      expect(chest.worst, clip).toBeLessThan(DIVE)
    }
    // leaning forward, not back
    expect(Math.min(...tilts('sprint', 'chest'), ...tilts('jog', 'chest'))).toBeGreaterThan(0)
  })
  it('the walk and the idle stand up: chest under 10°; the idle faces ahead', () => {
    for (const clip of ['walk', 'idle']) {
      const chest = size(clip, 'chest')
      expect(chest.mean, clip).toBeLessThan(10)
      expect(chest.worst, clip).toBeLessThan(DIVE)
    }
    expect(size('idle', 'hips', true).worst).toBeLessThan(1)
    expect(size('idle', 'head', true).worst).toBeLessThan(2)
  })
})
