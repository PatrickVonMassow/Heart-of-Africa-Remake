// @vitest-environment node
// The glTF villager's pure pose arithmetic against the committed asset
// (public/models/villager.glb, read from disk): morphs from the appearance
// table, the walk/sprint threshold and the speed → stride/cadence mapping, the
// feet's contacts in walk and sprint, and the tool held in the hand bone.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { VILLAGER_GLTF } from '../config/balance'
import { AGE_GROUPS, SEXES } from '../systems/appearance'
import { parseVillager, type VillagerAsset } from './villagerAsset'
import { legScale, morphInfluences, restHeads } from './villagerBody'
import {
  contactPoints,
  forwardKinematics,
  gaitAt,
  newPose,
  newWorld,
  sampleClip,
  sprintWeight,
  strideFactor,
  toolInHand,
} from './villagerRig'

let asset: VillagerAsset

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

  it('has the clips the figure plays', () => {
    for (const c of ['idle', 'walk', 'sprint', 'kneelDown', 'kneel', 'kneelUp', 'dig', 'carry', 'carryIdle']) expect(asset.clips[c]).toBeDefined()
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
    const g = gaitAt(asset.clips.walk, asset.clips.sprint, 1.2, 1)
    expect(g.sprint).toBe(0)
    expect(g.cycle).toBeCloseTo(asset.clips.walk.speed * asset.clips.walk.duration * g.strideWalk)
    expect(g.phasePerUnit * g.cycle).toBeCloseTo(1)
    // a child (shorter leg) needs more cycles for the same ground
    const child = gaitAt(asset.clips.walk, asset.clips.sprint, 1.2, 0.85)
    expect(child.phasePerUnit).toBeGreaterThan(g.phasePerUnit)
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
})
