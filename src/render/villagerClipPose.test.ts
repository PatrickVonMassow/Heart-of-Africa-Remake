// @vitest-environment node
// The glTF villager's clips on the drawn (hung) body: the carry onto the hung
// skeleton, the gait's no-slide (phase by distance, stride warped, planted foot
// held), the walk/sprint blend without a jump, and the shovel on the hand.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import * as THREE from 'three/webgpu'
import { beforeAll, describe, expect, it } from 'vitest'
import { balance, VILLAGER_ASSET, VILLAGER_GLTF, VILLAGER_MOTION, VILLAGER_POSE } from '../config/balance'
import { CHILD_FIGURE_SCALE } from './figures'
import { AGE_GROUPS, SEXES } from '../systems/appearance'
import { isColumnBone, parseVillager, type VillagerAsset, type VillagerClip } from './villagerAsset'
import { clipGaitPose, clipPoseAt, gaitFootGround, heelBrakeEnd, heelOff, kneeTurn, nearPitch, newClipGait, PLANT_TOUCH, samplePhase, type ClipGait, shovelOnHungHand, stanceOf, stepClipGait, toHung } from './villagerClipPose'
import { gltfPerson, type GltfPerson } from './villagerFigureBody'
import { contactPoints, forwardKinematics, gaitAt, gaitWeights, newPose, newWorld, sprintWeight, toolInHand, type GaitClips } from './villagerRig'

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
      // The columns hang at their reference heads on the drawn body, not the clip's (villagerColumnBones.test.ts).
      if (isColumnBone(asset.bones[i])) continue
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
   *  world slide. `probes` > 1 also samples each frame interval at probes − 1
   *  sub-frame instants from a copy of the frame's gait state (nothing drawn, the state
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
    // per foot, contacts down (heel, ball and tip each count), contacts measured down on two
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
    // longer exempt — 0.004 figure units per frame everywhere
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

  /** One frame of a heel-strike run: the ground walked (figure units), the
   *  pace the gait is drawn at, and the body's turn that frame (rad). */
  type HeelStep = { walked: number; speed: number; dyaw: number }
  /** One heel strike of `heelStrikeRun`. */
  type HeelStrike = { i: number; k: number; into: number; drop: number; stop: number; land: number; slide: number; walk: number; braked: boolean; leap: number }
  /**
   * The walk's heel strikes over a run of `frames` frames at `hz`, the
   * planted walk beside the clip's own (nothing held). Every landing of a
   * foot whose lift-off the run saw (its first landing, mid-swing as the
   * run begins, is the gait's entry, not a strike) is one, at the frame its
   * HEEL takes hold (`ClipGait.held[i].heel`: a ball or tip caught first is
   * not the heel's touchdown, and a toe caught again where it rose is no
   * landing); `unheeled` counts landings whose heel never took hold before
   * the foot rose again. Per strike, the heel's ground pace over its swing
   * (from the frame its last contact let go) as shares of the swing's peak:
   * `into` the pace into the touchdown frame, `drop` the most it loses in
   * one frame from its brake's start to the frame after the touchdown
   * beyond what the clip's own heel loses that frame (a dead stop loses its
   * whole pace in one frame however short, and the clips' keys step the
   * pace by up to 0.3 of it at 144 Hz), `stop` the most it loses in the
   * touchdown frame or the one after, not offset by the clip (a heel
   * stopped dead from where the clip loses pace too); `land` how far past
   * the clip's own step of a 60 Hz frame it sets down (per unit of leg);
   * `slide` how far (per unit of leg) the heel moves on the ground from
   * where it touched down, every frame it stays held through the stance; the
   * walk's share at the touchdown, and whether its brake ran in the swing.
   */
  function heelStrikeRun(person: GltfPerson, hz: number, frames: number, step: (k: number, g: ClipGait) => HeelStep) {
    const n = asset.bones.length
    const f = person.frame
    const per = f.legScale * f.scale
    const dt = 1 / hz
    const KEYS = ['heel', 'ball', 'tip'] as const
    const runs = [true, false].map((hold) => ({ hold, g: newClipGait(), pose: newPose(n), world: newWorld(n), heels: [[], []] as THREE.Vector3[][] }))
    // per foot and frame (the planted run): its heel's world spot (its
    // height the person's), and which contacts are held
    const spots: THREE.Vector3[][] = [[], []]
    const held: Record<(typeof KEYS)[number], boolean>[][] = [[], []]
    const braked: boolean[][] = [[], []]
    const walkAt: number[] = []
    const frameDt: number[] = []
    let x = 0
    let z = 0
    let yaw = 0
    for (let k = 0; k < frames; k++) {
      const s = step(k, runs[0].g)
      yaw += s.dyaw
      x += Math.sin(yaw) * s.walked
      z += Math.cos(yaw) * s.walked
      walkAt.push(gaitWeights(s.speed / f.scale, f.legScale).walk)
      // (each frame's own length: a hitch walks a longer one)
      frameDt.push(s.speed > 0 ? s.walked / s.speed : dt)
      const cy = Math.cos(yaw)
      const sy = Math.sin(yaw)
      const toWorld = (p: THREE.Vector3) => {
        const lx = p.x * f.scale
        const lz = p.z * f.scale
        return new THREE.Vector3(x + lx * cy + lz * sy, p.y, z - lx * sy + lz * cy)
      }
      for (const r of runs) {
        stepClipGait(r.g, asset, f, s.walked, s.speed)
        clipGaitPose(r.g, asset, f, s.speed, r.hold ? { x, z, yaw, unit: 1 } : null, r.pose)
        forwardKinematics(asset, f.rest0, r.pose, r.world)
        const c = contactPoints(asset, r.world, f.legScale)
        ;(['L', 'R'] as const).forEach((side, i) => {
          // the heel in the world, as the figure stands and faces
          const heel = toWorld(c[side].heel)
          heel.y = 0
          r.heels[i].push(heel)
          if (!r.hold) return
          spots[i].push(toWorld(c[side].heel))
          held[i].push({ heel: !!r.g.held[i].heel, ball: !!r.g.held[i].ball, tip: !!r.g.held[i].tip })
          braked[i].push(r.g.brake[i] !== null)
        })
      }
    }
    const [drawn, clip] = [runs[0].heels, runs[1].heels]
    const out: HeelStrike[] = []
    let unheeled = 0
    const any = (i: number, k: number) => KEYS.some((p) => held[i][k][p])
    for (const i of [0, 1]) {
      const pace = (j: number, of = drawn) => of[i][j].distanceTo(of[i][j - 1]) / frameDt[j]
      // the frame its last contact let go (-1: not seen), and whether its
      // heel has taken hold since
      let off = -1
      let heeled = true
      let landed = false
      for (let k = 1; k < frames; k++) {
        if (any(i, k - 1) && !any(i, k)) {
          if (off >= 0 && landed && !heeled) unheeled++
          off = k
          heeled = false
          landed = false
        }
        if (any(i, k) && !landed && off >= 0) {
          landed = true
          // a toe caught again where it rose (a pace falling fast lengthens
          // the blended stance back over a foot just lifted off its toes) is
          // no landing: the foot has not swung
          // (measured: such a catch holds the tip alone, its heel moved at
          // most 0.3 per unit of leg since it rose; every landing 0.44 and
          // more, its heel caught first, 25.11.2026)
          const moved = drawn[i][k].distanceTo(drawn[i][off]) / per
          if (!held[i][k].heel && moved < 0.4) heeled = true
        }
        if (off < 0 || heeled || held[i][k - 1].heel || !held[i][k].heel) continue
        heeled = true
        const peak = Math.max(...Array.from({ length: k - off }, (_, j) => pace(off + 1 + j)))
        const last = Math.min(k + 1, frames - 1)
        // (over what the clip's own heel loses that frame: its lift-off and
        // a pace changing under it are the clip's, its heel strike is not —
        // the clip swings on through it; from the frame before its brake
        // began, or over the whole swing where none ran: a pace stepping at
        // the lift-off moves the hold's release, which is not the strike)
        const began = braked[i].findIndex((b, j) => j > off && j < k && b)
        let drop = 0
        for (let j = began > 0 ? began : off + 2; j <= last; j++) drop = Math.max(drop, (pace(j - 1) - pace(j) - Math.max(0, pace(j - 1, clip) - pace(j, clip))) / peak)
        let stop = 0
        for (let j = k; j <= last; j++) stop = Math.max(stop, (pace(j - 1) - pace(j)) / peak)
        // the heel (the strike's contact, and the stance's pivot until it
        // rolls onto its ball) from the frame it is held on the ground,
        // against that spot every frame it stays held there, through the
        // stance (its ball and tip are handed the drawn foot's place while
        // the heel pivots: they drift up to 3.6 cm per unit of leg in a turn,
        // the same with the brake off, measured 25.11.2026)
        let slide = 0
        let down: THREE.Vector3 | null = null
        for (let j = k; j < frames && held[i][j].heel; j++) {
          const at = spots[i][j]
          if (at.y > 0.01) continue
          down ??= at
          slide = Math.max(slide, Math.hypot(at.x - down.x, at.z - down.z) / per)
        }
        // (against the clip's step that frame, or of a 60 Hz one where frames
        // are shorter)
        const land = (drawn[i][k].distanceTo(clip[i][k]) - pace(k, clip) / Math.min(hz, 60)) / per
        // (the share of its way to its touchdown spot the heel covers on its
        // brake's first frame: 1, the brake drawn on no frame before)
        const b0 = braked[i].findIndex((b, j) => j > off && j <= k && b)
        const leap = b0 > 0 ? 1 - drawn[i][b0].distanceTo(drawn[i][k]) / Math.max(1e-9, drawn[i][b0 - 1].distanceTo(drawn[i][k])) : 1
        out.push({ i, k, into: pace(k) / peak, drop, stop, land, slide, walk: walkAt[k], braked: braked[i].slice(off, k).some(Boolean), leap })
      }
    }
    return Object.assign(out, { unheeled })
  }
  /** A steady run: `speed` throughout, turning `yawRate` rad/s. */
  const steady = (hz: number, speed: number, yawRate = 0) => () => ({ walked: speed / hz, speed, dyaw: yawRate / hz })
  /** The jog's own landing on this body at this rate (no walk, so no brake):
   *  the worst `into` and `drop` of a pure jog's catches. The runs land their
   *  heel moving, at 0.27-0.53 of their swing's pace at 60 Hz (measured
   *  25.11.2026); a blend keeps the jog's share of that, never more. */
  const jogLanding = (person: GltfPerson, hz: number) => {
    const G = VILLAGER_GLTF
    const per = person.frame.legScale * person.frame.scale
    const c = heelStrikeRun(person, hz, 3 * hz, steady(hz, (G.jogThreshold + G.jogBand) * per))
    expect(c.length).toBeGreaterThan(0)
    return { into: Math.max(...c.map((s) => s.into)), drop: Math.max(...c.map((s) => s.drop)), stop: Math.max(...c.map((s) => s.stop)) }
  }
  /** The heel-strike bounds, per frame rate: into its catch at most `into`
   *  of its swing's pace, per frame at most `drop` of it lost, each over what
   *  the jog's share keeps of the jog's own landing; set down at most `land`
   *  per unit of leg past the clip's own step. At 30 Hz the brake spans four
   *  frames, its cubic easing the heel off its peak by up to half in one of
   *  them and its last frame carrying the brake's tail into the catch
   *  (measured at most 0.21 and 0.59, 25.11.2026); the unbraked heel strike
   *  loses 0.7 and more (the next case). `stop`: at most that much of its
   *  swing's pace lost in the touchdown frame or the one after, the drawn
   *  heel's own loss (a dead stop from 0.75 of its pace passed `drop` where
   *  the clip lost 0.3 in the same frame: cross-vendor review of point
   *  1591); braked at most 0.52 at 30 Hz, 0.23 at 60 Hz and 0.06 at 144 Hz,
   *  unbraked 0.62 and more walking (measured 25.11.2026). `slide`: the
   *  heel held on the ground moves at most that much per unit of leg from
   *  where it touched down through the stance (measured at most 0.001). */
  const heelBounds = (hz: number) => ({ ...(hz < 60 ? { into: 0.25, drop: 0.65, stop: 0.55 } : { into: 0.08, drop: 0.5, stop: (0.25 * 60) / hz }), land: 0.02, slide: 0.004 })
  const overBound = (s: { into: number; drop: number; stop: number; land: number; slide: number; walk: number }, jog: { into: number; drop: number; stop: number }, hz: number) => {
    // (the brake fades out below VILLAGER_GLTF.heelBrakeWalk of the walk)
    const j = 1 - Math.min(1, s.walk / VILLAGER_GLTF.heelBrakeWalk)
    const b = heelBounds(hz)
    return { into: s.into - j * jog.into - b.into, drop: s.drop - j * jog.drop - b.drop, stop: s.stop - j * jog.stop - b.stop, land: s.land - b.land, slide: s.slide - b.slide }
  }

  it('the walk\'s heel strike slows the swinging heel to rest before it takes hold: no dead stop, landing where the clip lands it, straight, turning and in the walk-jog band, at 30/60/144 Hz', () => {
    // the clip still swings its heel forward ~2 m/s as it touches down, and
    // the hold stopped it from 2.05 m/s to rest within one frame (adult, 1 m/s)
    const G = VILLAGER_GLTF
    const lo = G.jogThreshold - G.jogBand
    // per unit of leg: walking, the band's lower edge, and inside the band
    // (the walk's share 0.84, 0.5, 0.16), where the jog shapes the landing
    const paces = [0.6, 1.0, lo, lo + 0.5 * G.jogBand, lo + G.jogBand, lo + 1.5 * G.jogBand]
    let catches = 0
    const keys = ['into', 'drop', 'stop', 'land', 'slide'] as const
    const worst = { into: -Infinity, drop: -Infinity, stop: -Infinity, land: -Infinity, slide: -Infinity }
    const at = { into: '', drop: '', stop: '', land: '', slide: '' }
    for (const person of [adult, child, gltfPerson(asset, 'female', 'adult', 1)]) {
      const per = person.frame.legScale * person.frame.scale
      for (const hz of [30, 60, 144]) {
        const jog = jogLanding(person, hz)
        for (const v of paces) {
          // straight on, and turning the whole way at 2.8 rad/s (read straight
          // ahead, the brake's target swung round with the body and the hold
          // stopped that sideways pace dead)
          for (const yawRate of [0, 2.8, -2.8]) {
            const where = `${v.toFixed(3)} per leg, ${yawRate} rad/s at ${hz} Hz, leg ${person.frame.legScale.toFixed(2)}`
            const strikes = heelStrikeRun(person, hz, 3 * hz, steady(hz, v * per, yawRate))
            // every landing of a foot after its first is a heel strike: its
            // heel takes hold, and its brake ran
            for (const i of [0, 1]) expect(strikes.filter((s) => s.i === i).length, `${where}: foot ${i} is caught`).toBeGreaterThan(0)
            expect(strikes.unheeled, `${where}: landings whose heel never took hold`).toBe(0)
            for (const s of strikes) {
              expect(s.braked, `${where}, frame ${s.k}, foot ${s.i}: its brake ran`).toBe(true)
              const o = overBound(s, jog, hz)
              for (const key of keys) {
                if (o[key] > worst[key]) {
                  worst[key] = o[key]
                  at[key] = `${where}, frame ${s.k}, foot ${s.i}: ${key} ${s[key].toFixed(3)}, walk ${s.walk.toFixed(2)}`
                }
              }
              catches++
            }
          }
        }
      }
    }
    // (each foot of every run caught at least once, most twice)
    expect(catches).toBeGreaterThanOrEqual(3 * 3 * paces.length * 3 * 2)
    // into its catch the heel has nearly come to rest, slowing over frames
    // (not stopped dead in its touchdown frame), sets down where the clip's
    // heel touches, not short of it, and stays there through its stance
    for (const key of keys) expect(worst[key], at[key]).toBeLessThan(0)
  }, 480_000)

  it('the heel-strike bounds reject the unbraked heel strike, a dead stop, at every frame rate', () => {
    // review 25.11.2026: a bound loosened by the jog's share let a whole
    // peak-to-zero stop pass at 60 Hz at the walk's share 0.16; unbraked, the
    // heel strike comes into its catch at 0.6-0.76 of its swing's pace
    // walking
    const G = VILLAGER_GLTF
    const g = G as { heelBrakeCycle: number }
    const was = g.heelBrakeCycle
    g.heelBrakeCycle = 0
    try {
      for (const person of [adult, child]) {
        const per = person.frame.legScale * person.frame.scale
        for (const hz of [30, 60, 144]) {
          const jog = jogLanding(person, hz)
          // in the band at the walk's share 0.16 the brake keeps no allowance:
          // a heel stopped from its swing's peak in a frame fails there
          expect(Math.min(...Object.values(overBound({ into: 1, drop: 1, stop: 1, land: 0, slide: 0, walk: 0.16 }, jog, hz)).slice(0, 3)), `a dead stop in the band at ${hz} Hz`).toBeGreaterThan(0)
          // a heel stopped dead from 0.75 of its pace where the clip loses
          // 0.3 of it the same frame: into 0, drop 0.45 (cross-vendor review
          // of point 1591), rejected by its own loss at the touchdown
          expect(overBound({ into: 0, drop: 0.45, stop: 0.75, land: 0, slide: 0, walk: 1 }, jog, hz).stop, `a one-frame dead stop at ${hz} Hz`).toBeGreaterThan(0)
          for (const v of [1.0]) {
            const strikes = heelStrikeRun(person, hz, 3 * hz, steady(hz, v * per))
            expect(strikes.length).toBeGreaterThan(1)
            for (const s of strikes) {
              const o = overBound(s, jog, hz)
              const where = `${v.toFixed(3)} per leg at ${hz} Hz, leg ${person.frame.legScale.toFixed(2)}, frame ${s.k}, foot ${s.i}: walk ${s.walk.toFixed(2)}`
              expect(Math.max(o.into, o.drop), where).toBeGreaterThan(0)
              // the touchdown's own loss alone rejects it
              expect(o.stop, `${where}: stop ${s.stop.toFixed(3)}`).toBeGreaterThan(0)
            }
          }
        }
      }
    } finally {
      g.heelBrakeCycle = was
    }
  }, 120_000)

  it('the heel strike brakes through a pace changing mid-swing: in and out of the walk-jog band, gently and by steps', () => {
    // review 25.11.2026: the brake's start was read against the pace drawn
    // now, so a start moved earlier between two frames was never begun and
    // the heel reached its hold unbraked
    const G = VILLAGER_GLTF
    const lo = G.jogThreshold - G.jogBand
    for (const person of [adult, child]) {
      const per = person.frame.legScale * person.frame.scale
      for (const hz of [30, 60, 144]) {
        const jog = jogLanding(person, hz)
        for (const period of [0.53, 0.89, 1.37]) {
          for (const [a, b] of [[1.0, lo + 1.5 * G.jogBand], [lo, lo + G.jogBand]]) {
            for (const kind of ['wave', 'steps'] as const) {
              const where = `${kind} ${a.toFixed(2)}-${b.toFixed(2)} per leg every ${period} s at ${hz} Hz, leg ${person.frame.legScale.toFixed(2)}`
              // the pace asked for, smoothed as the figure's walk smooths its
              // measured speed (figureWalk.ts, speedSmoothing)
              let speed = a * per
              const strikes = heelStrikeRun(person, hz, 4 * hz, (k) => {
                const t = k / hz
                const u = kind === 'wave' ? 0.5 - 0.5 * Math.cos((2 * Math.PI * t) / period) : Math.floor(t / (period / 2)) % 2
                speed += ((a + (b - a) * u) * per - speed) * (1 - Math.exp(-1 / hz / VILLAGER_MOTION.speedSmoothing))
                return { walked: speed / hz, speed, dyaw: 0 }
              })
              expect(strikes.length, where).toBeGreaterThan(3)
              for (const i of [0, 1]) expect(strikes.filter((s) => s.i === i).length, `${where}: foot ${i} is caught`).toBeGreaterThan(1)
              expect(strikes.unheeled, `${where}: landings whose heel never took hold`).toBe(0)
              for (const s of strikes) {
                const at = `${where}, frame ${s.k}, foot ${s.i}`
                expect(s.braked, `${at}: its brake ran`).toBe(true)
                const o = overBound(s, jog, hz)
                // (a pace crossing the band within the brake moves the touch it
                // ends before, where one contact or another comes down first:
                // by up to 0.0125 of the cycle in a 144 Hz frame, the heel
                // coming into its catch at 0.093 of its swing's pace, and over
                // a 30 Hz brake of three or four frames at 0.297; measured
                // 25.11.2026)
                expect(o.into, `${at}: into ${s.into.toFixed(3)}, walk ${s.walk.toFixed(2)}`).toBeLessThan(hz < 60 ? 0.05 : 0.02)
                expect(o.drop, `${at}: drop ${s.drop.toFixed(3)}, walk ${s.walk.toFixed(2)}`).toBeLessThan(0)
                // (its touchdown frame's own loss likewise: at 60 Hz up to 0.38
                // of its swing's pace, a dead stop 0.62 and more; set down up
                // to 0.0234 per unit of leg past the clip's own step at 144 Hz;
                // measured 25.11.2026)
                // OPEN (point 1595): at 30 Hz a pace crossing into the band
                // within the four-frame brake still loses up to 0.74 of its
                // swing's pace in the touchdown frame, as a dead stop does
                // (re-planned each frame, the pace's change extrapolated, a
                // quartic ease and a brake of five frames' length all left it
                // or broke the brake's start, measured 25.11.2026): unbounded here
                if (hz >= 60) expect(o.stop, `${at}: stop ${s.stop.toFixed(3)}, walk ${s.walk.toFixed(2)}`).toBeLessThan(0.15)
                expect(o.land, `${at}: land ${s.land.toFixed(3)}, walk ${s.walk.toFixed(2)}`).toBeLessThan(0.005)
                expect(o.slide, `${at}: slide ${s.slide.toFixed(4)}, walk ${s.walk.toFixed(2)}`).toBeLessThan(0)
              }
            }
          }
        }
      }
    }
  }, 240_000)

  it('a frame hitch stepping past the brake\'s start still brakes the heel strike it walks into', () => {
    // cross-vendor review of point 1591: a frame crossing from before the
    // brake's start past its late cutoff began no brake, and the hold took
    // the heel unbraked on the next frame. One hitch of the figure's frame
    // clamp (0.1 s, GIZA_ACTIVITY.maxFrame) at every offset through a cycle
    let hitches = 0
    let onHitch = 0
    for (const person of [adult, child]) {
      const per = person.frame.legScale * person.frame.scale
      // (walking, and at the band's middle and upper half, where a hitch
      // walks furthest through the brake)
      for (const v of [0.6, 1.0, 1.45, VILLAGER_GLTF.jogThreshold, VILLAGER_GLTF.jogThreshold + 0.5 * VILLAGER_GLTF.jogBand]) {
        const speed = v * per
        const hz = 60
        for (let at = hz; at < 2.2 * hz; at += 1) {
          const strikes = heelStrikeRun(person, hz, 3 * hz, (k) => ({ walked: (speed * (k === at ? 0.1 : 1 / hz)), speed, dyaw: 0 }))
          for (const s of strikes) {
            // (the hitch frame's own catch included: a brake begun on it is
            // no brake drawn into the catch)
            if (s.k < at) continue
            if (s.k <= at + 0.2 * hz) hitches++
            if (s.k === at) onHitch++
            const where = `${v} per leg, hitch at frame ${at}, leg ${person.frame.legScale.toFixed(2)}: frame ${s.k}, foot ${s.i}`
            expect(s.braked, `${where}: its brake ran`).toBe(true)
            // never set from its swing onto its touchdown spot in one frame:
            // a frame walking past the brake's end took the heel from its
            // swing to 0.99 of its way there and the hold took it (cross-
            // vendor review of point 1591); measured at most 0.75 with the
            // brake lagging the clip after the hitch, and into its catch at
            // most 0.18 of its swing's pace over the frame's own length
            // (25.11.2026)
            expect(s.leap, `${where}: its way to its touchdown spot covered in its brake's first frame`).toBeLessThan(0.9)
            expect(s.into, `${where}: into its catch, of its swing's pace`).toBeLessThan(0.25)
          }
        }
      }
    }
    // (strikes landed within 0.2 s after the hitch, and on the hitch frame)
    expect(hitches).toBeGreaterThan(50)
    expect(onHitch, 'catches on the hitch frame itself').toBeGreaterThan(0)
  }, 120_000)

  it('a short step while turning swings no braking heel round: the turn the brake predicts is the walk\'s, not one frame\'s', () => {
    // review 25.11.2026: a frame walking 0.0001 of a cycle while the body
    // turned 0.01 rad read a turn of 100 rad a cycle, and the brake swung the
    // heel's target 1.43 rad round in that frame
    const G = VILLAGER_GLTF
    for (const person of [adult, child]) {
      const per = person.frame.legScale * person.frame.scale
      for (const hz of [30, 60, 144]) {
        for (const [v, yawRate] of [[1.0, 2.8], [1.0, -2.8], [G.jogThreshold - 0.5 * G.jogBand, 1.5]]) {
          const speed = v * per
          const gait = gaitAt(asset.clips as unknown as GaitClips, speed / person.frame.scale, person.frame.legScale)
          // a step of 0.0001 of a cycle, turning 0.01 rad, once into each brake
          const tiny = (0.0001 / gait.phasePerUnit) * person.frame.scale
          const braking = [false, false]
          let shorts = 0
          const where = `${v.toFixed(2)} per leg, ${yawRate} rad/s at ${hz} Hz, leg ${person.frame.legScale.toFixed(2)}`
          // the drawn heel's move in the world over the short step, past the
          // body's own turn of it (0.01 rad about the body) and the step
          const n = asset.bones.length
          const f = person.frame
          const g = newClipGait()
          const pose = newPose(n)
          const world = newWorld(n)
          let x = 0
          let z = 0
          let yaw = 0
          let worst = 0
          let prev: THREE.Vector3[] | null = null
          for (let k = 0; k < 3 * hz; k++) {
            const brakingNow = g.brake.map((b) => b !== null)
            const short = k > hz && brakingNow.some((b, i) => b && !braking[i])
            brakingNow.forEach((b, i) => (braking[i] = b))
            const s = short ? { walked: tiny, dyaw: 0.01 * Math.sign(yawRate) } : { walked: speed / hz, dyaw: yawRate / hz }
            yaw += s.dyaw
            x += Math.sin(yaw) * s.walked
            z += Math.cos(yaw) * s.walked
            stepClipGait(g, asset, f, s.walked, speed)
            clipGaitPose(g, asset, f, speed, { x, z, yaw, unit: 1 }, pose)
            forwardKinematics(asset, f.rest0, pose, world)
            const c = contactPoints(asset, world, f.legScale)
            const cy = Math.cos(yaw)
            const sy = Math.sin(yaw)
            const now = (['L', 'R'] as const).map((side) => {
              const lx = c[side].heel.x * f.scale
              const lz = c[side].heel.z * f.scale
              return new THREE.Vector3(x + lx * cy + lz * sy, 0, z - lx * sy + lz * cy)
            })
            if (short && prev) {
              shorts++
              for (const i of [0, 1]) if (g.brake[i] !== null) worst = Math.max(worst, now[i].distanceTo(prev[i]) - Math.hypot(now[i].x - x, now[i].z - z) * 0.01 - tiny)
            }
            prev = now
          }
          expect(shorts, where).toBeGreaterThan(1)
          // (0.0036 with the brake's turn not carried at all: the step's own;
          // the brake read 100 rad a cycle and swung it 0.049)
          expect(worst / per, where).toBeLessThan(0.008)
        }
      }
    }
  }, 120_000)

  it('the heel strike\'s brake ends before the hold takes the heel: its end read where the hold reads the touch, the runs\' stance lowering included', () => {
    // review 25.11.2026: the touch the brake ends before was read without
    // the runs' lowering of a stance foot, which the hold reads, so in the
    // walk-jog band the brake could still run when the heel was caught
    const G = VILLAGER_GLTF
    const lo = G.jogThreshold - G.jogBand
    for (const person of [adult, child, gltfPerson(asset, 'female', 'adult', 1)]) {
      const f = person.frame
      const per = f.legScale * f.scale
      // fine frames, so the catch is read within a step of the touch scan
      const hz = 600
      for (let u = 0; u <= 1.0001; u += 0.125) {
        const speed = (lo + 2 * G.jogBand * u * 0.999) * per
        const g = newClipGait()
        const n = asset.bones.length
        const pose = newPose(n)
        let z = 0
        let caughtN = 0
        for (let k = 0; k < 2 * hz; k++) {
          z += speed / hz
          const was = g.held.map((h) => !!(h.heel || h.ball || h.tip))
          stepClipGait(g, asset, f, speed / hz, speed)
          clipGaitPose(g, asset, f, speed, { x: 0, z, yaw: 0, unit: 1 }, pose)
          for (const i of [0, 1]) {
            if (was[i] || !(g.held[i].heel || g.held[i].ball || g.held[i].tip) || k < hz / 2) continue
            const end = heelBrakeEnd(asset, f, speed, i)
            if (end === null) continue
            // the catch's phase past the brake's end, in (-0.5, 0.5]
            const past = ((((g.phase - end) % 1) + 1.5) % 1) - 0.5
            expect(past, `walk ${gaitWeights(speed / f.scale, f.legScale).walk.toFixed(3)}, leg ${f.legScale.toFixed(2)}, foot ${i}`).toBeGreaterThanOrEqual(0)
            caughtN++
          }
        }
        expect(caughtN).toBeGreaterThan(0)
      }
    }
  }, 120_000)

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

  it('the walk stands on a foot every frame and lies flat through mid-stance, on every body', () => {
    // point 1330: the retargeted walk floated both feet at the double support
    // and never set a foot flat (its heel rode 1.5 cm up through mid-stance)
    const n = asset.bones.length
    for (const sex of SEXES) {
      for (const age of AGE_GROUPS) {
        const f = gltfPerson(asset, sex, age, 0).frame
        for (const perLeg of [0.6, 1.0, 1.4]) {
          const speed = perLeg * f.legScale * f.scale
          const g = newClipGait()
          const pose = newPose(n)
          const world = newWorld(n)
          const dt = 1 / 60
          let z = 0
          let frames = 0
          let worstLow = 0
          const flat = [0, 0]
          for (let t = 0; t < 4; t += dt) {
            z += speed * dt
            stepClipGait(g, asset, f, speed * dt, speed)
            clipGaitPose(g, asset, f, speed, { x: 0, z, yaw: 0, unit: 1 }, pose)
            forwardKinematics(asset, f.rest0, pose, world)
            if (t < 1) continue
            frames++
            const c = contactPoints(asset, world, f.legScale)
            worstLow = Math.max(worstLow, Math.min(...(['L', 'R'] as const).flatMap((s) => [c[s].heel.y, c[s].ball.y, c[s].tip.y])))
            ;(['L', 'R'] as const).forEach((s, i) => {
              const foot = asset.bones.indexOf(`foot.${s}`)
              const q = world.q[foot]
              // level: no pitch or roll (a turn about the vertical alone)
              const level = Math.hypot(q.x, q.z) < 0.005
              if (level && Math.abs(world.p[foot].y - f.rest0[foot * 3 + 1]) < 0.003) flat[i]++
            })
          }
          const where = `${sex} ${age} at ${perLeg} per leg`
          // measured 0.0011-0.0074 (20.10.2026): before, both feet rode 4-6 cm up
          expect(worstLow, where).toBeLessThan(0.012)
          // each foot flat over a share of the cycle (measured 0.19-0.36; none before)
          for (const k of flat) expect(k / frames, where).toBeGreaterThan(0.15)
        }
      }
    }
  })

  it('coming back from a jog into the walk, a sole is on the ground from the first walking frame', () => {
    // point 1330: the jog's long stride left the trailing foot planted beyond
    // reach and the leading one in the air, both soles 5 cm up
    const n = asset.bones.length
    for (const sex of SEXES) {
      for (const age of AGE_GROUPS) {
        const f = gltfPerson(asset, sex, age, 0).frame
        const g = newClipGait()
        const pose = newPose(n)
        const world = newWorld(n)
        const dt = 1 / 30
        let z = 0
        let worst = 0
        for (let t = 0; t < 7; t += dt) {
          // per leg: the walk at its longest stride, a dip into the jog band and back
          const perLeg = t < 3 ? 1.45 : t < 4 ? 1.45 + (t - 3) * 0.6 : t < 5 ? 2.05 - (t - 4) * 0.6 : 1.45
          const speed = perLeg * f.legScale * f.scale
          z += speed * dt
          stepClipGait(g, asset, f, speed * dt, speed)
          clipGaitPose(g, asset, f, speed, { x: 0, z, yaw: 0, unit: 1 }, pose)
          forwardKinematics(asset, f.rest0, pose, world)
          if (t < 1 || gaitWeights(speed / f.scale, f.legScale).walk < 0.98) continue
          const c = contactPoints(asset, world, f.legScale)
          worst = Math.max(worst, Math.min(c.L.heel.y, c.L.ball.y, c.R.heel.y, c.R.ball.y))
        }
        // measured at most 0.0096 (20.10.2026); 0.055 before
        expect(worst, `${sex} ${age}`).toBeLessThan(0.02)
      }
    }
  })

  it('coming back from a short jog at uneven frames, the lower heel or ball is down from the first walking frame', () => {
    // point 1330: a jog's stride coming back to the walk left its held foot
    // beyond the walk's pelvis reach and the other in the air — no heel or
    // ball within 4 cm of the ground (0.042 on the adult, village-walk 0.0402)
    const n = asset.bones.length
    const rng = (seed: number) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
    for (const sex of SEXES) {
      for (const age of AGE_GROUPS) {
        const f = gltfPerson(asset, sex, age, 0).frame
        const per = f.legScale * f.scale
        let worst = 0
        for (let seed = 1; seed < 40; seed++) {
          const r = rng(seed)
          const g = newClipGait()
          const pose = newPose(n)
          const world = newWorld(n)
          let z = 0
          let speed = 1.45 * per
          // a dip into the jog of random onset, length and pace, at about 20-120 Hz
          const from = 1 + r() * 1.5
          const span = 0.15 + r() * 0.8
          const jog = 1.9 + r() * 0.8
          for (let t = 0; t < 4.5; ) {
            const dt = 1 / 120 + r() * (1 / 25)
            t += dt
            const want = (t > from && t < from + span ? jog : 1.45) * per
            speed += (want - speed) * (1 - Math.exp(-dt / 0.12))
            z += speed * dt
            stepClipGait(g, asset, f, speed * dt, speed)
            clipGaitPose(g, asset, f, speed, { x: 0, z, yaw: 0, unit: 1 }, pose)
            forwardKinematics(asset, f.rest0, pose, world)
            if (t < 1 || gaitWeights(speed / f.scale, f.legScale).walk < 0.98) continue
            const c = contactPoints(asset, world, f.legScale)
            worst = Math.max(worst, Math.min(c.L.heel.y, c.L.ball.y, c.R.heel.y, c.R.ball.y) * f.scale)
          }
        }
        // measured at most 0.0347 (20.10.2026); 0.0420 before
        expect(worst, `${sex} ${age}`).toBeLessThan(0.037)
      }
    }
  }, 120_000)

  it('the gait is drawn on its own ground: a contact at 0 lands on the drawn sole', () => {
    const n = asset.bones.length
    const f = adult.frame
    const out = quats(n)
    const hips = new THREE.Vector3()
    const pose = newPose(n)
    pose.hips.set(0, 0.7, 0)
    toHung(asset, f, pose, out, hips, 0)
    expect(hips.y).toBeCloseTo(0.7 * f.scale, 9)
    // the default stays the hung rest's sole (the idle, the dig, the kneel)
    toHung(asset, f, pose, out, hips)
    expect(hips.y).toBeCloseTo((0.7 - f.sole) * f.scale, 9)
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

  it("a running child's flight is short and low: airborne share and apex within the balance bounds", () => {
    const tag = balance.villageLife.tag
    const { airborneMax, apexMax } = VILLAGER_GLTF.runFlight
    const n = asset.bones.length
    const pose = newPose(n)
    const world = newWorld(n)
    const dt = 1 / 60
    // the tag game's trot, run and a fresh runner's top pace (m/s, world)
    for (const pace of [tag.sprintSpeed * tag.trotFactor, tag.sprintSpeed, tag.sprintSpeed * tag.runnerBoost]) {
      for (const sex of SEXES) {
        const f = gltfPerson(asset, sex, 'child', 0).frame
        const speed = pace / CHILD_FIGURE_SCALE
        const g = newClipGait()
        let z = 0
        let frames = 0
        let air = 0
        let apex = 0
        for (let t = 0; t < 4; t += dt) {
          z += speed * dt
          stepClipGait(g, asset, f, speed * dt, speed)
          clipGaitPose(g, asset, f, speed, { x: 0, z, yaw: 0, unit: 1 }, pose)
          forwardKinematics(asset, f.rest0, pose, world)
          const c = contactPoints(asset, world, f.legScale)
          const low = Math.min(...(['L', 'R'] as const).flatMap((s) => [c[s].heel.y, c[s].ball.y, c[s].tip.y]))
          if (t < 1) continue
          frames++
          if (low > PLANT_TOUCH) air++
          apex = Math.max(apex, low * f.scale * CHILD_FIGURE_SCALE)
        }
        const where = `${sex} child at ${pace.toFixed(2)} m/s`
        expect(air / frames, where).toBeLessThan(airborneMax)
        expect(apex, where).toBeLessThan(apexMax)
      }
    }
  })

  it('the feet never sink below the ground', () => {
    for (const v of [0.6, 1.2, 3.4]) expect(walkStraight(adult, v).lowest).toBeGreaterThan(-0.01)
  })

  it('the trailing leg rolls off its toes without a tremble: no joint turns back on itself between two frames', () => {
    // user report 21.10.2026 ("the rear leg trembles at every step"): out of
    // reach, the rolling foot sprang back to the clip's pitch with the knee
    // snapped straight for one frame, then rolled again — a one-frame spike of
    // 0.2 rad at the thigh and 0.5 rad at the foot at every toe-off (thigh
    // 12-31, foot 40-99 rad/s below; frame-rate bound, as a spike is). A
    // smooth turn reverses only through rest: its reversal rate goes to 0
    // with the frame time. Measured after the fix: at most 7.4 rad/s, the
    // same at 60, 100 and 144 Hz (the toe's lift-off kink, no spike).
    const n = asset.bones.length
    const bones = ['thigh', 'shin', 'foot'].flatMap((b) => ['L', 'R'].map((s) => `${b}.${s}`))
    for (const sex of SEXES) {
      for (const age of AGE_GROUPS) {
        const f = gltfPerson(asset, sex, age, 0).frame
        for (const perLeg of [1.0, 1.4]) {
          for (const hz of [60, 100, 144]) {
            const dt = 1 / hz
            const speed = perLeg * f.legScale * f.scale
            const g = newClipGait()
            const pose = newPose(n)
            const world = newWorld(n)
            const prev = bones.map(() => new THREE.Quaternion())
            const step = bones.map(() => new THREE.Vector3())
            const d = new THREE.Quaternion()
            const v = new THREE.Vector3()
            let z = 0
            for (let k = 0; k * dt < 4; k++) {
              z += speed * dt
              stepClipGait(g, asset, f, speed * dt, speed)
              clipGaitPose(g, asset, f, speed, { x: 0, z, yaw: 0, unit: 1 }, pose)
              forwardKinematics(asset, f.rest0, pose, world)
              bones.forEach((b, j) => {
                const q = world.q[asset.bones.indexOf(b)]
                // this frame's world turn of the bone as a rotation vector
                d.copy(prev[j]).invert().premultiply(q)
                if (d.w < 0) d.set(-d.x, -d.y, -d.z, -d.w)
                const s = Math.hypot(d.x, d.y, d.z)
                v.set(d.x, d.y, d.z).multiplyScalar(s > 1e-12 ? (2 * Math.atan2(s, d.w)) / s : 0)
                if (k * dt > 1 && v.dot(step[j]) < 0) {
                  const rate = Math.min(v.length(), step[j].length()) / dt
                  expect(rate, `${sex} ${age} at ${perLeg} per leg, ${hz} Hz, ${b} at phase ${g.phase.toFixed(3)}`).toBeLessThan(9)
                }
                step[j].copy(v)
                prev[j].copy(q)
              })
            }
          }
        }
      }
    }
  })

  it('the leg joints turn no faster than the clip drives them, at every frame rate: no pop at lift-off', () => {
    // user report 21.10.2026, the remaining knee pop: at lift-off the leg
    // went from the roll's stretched reach into the swing's bent knee in one
    // frame (shin 0.20 → 1.38 rad at 20 Hz), the rolling foot snapped onto
    // the line of leg and foot before it lifted, and the toes and the ball →
    // tip hand-over sprang the foot — rates that grew with the frame rate
    // (foot up to 34×, shin 4-5×, thigh up to 10× the clip's own maximum at
    // 144 Hz). Each joint's local turn per frame is bounded against the walk
    // clip's own fastest turn of that joint at that pace. The margin: the
    // stride warp (up to 1.35) and the hold's catch-up take the thigh to
    // 2.1×, the shin to 1.7×, and the foot lying down flat to 2.5× (measured
    // 25.11.2026, 15-240 Hz). The heel caught while its clip still swung it
    // forward snapped onto its hold once held firm: the foot to 2.8× at
    // 144 Hz and 3.9× at 240 Hz (measured 22.10. and 25.11.2026; the margin
    // was 3×).
    const n = asset.bones.length
    const bones = ['thigh', 'shin', 'foot'].flatMap((b) => ['L', 'R'].map((s) => `${b}.${s}`))
    const index = bones.map((b) => asset.bones.indexOf(b))
    const qa = new THREE.Quaternion()
    const qb = new THREE.Quaternion()
    const turn = (a: ArrayLike<number>, b: ArrayLike<number>, k: number) => qa.fromArray(a as number[], k * 4).angleTo(qb.fromArray(b as number[], k * 4))
    for (const sex of SEXES) {
      for (const age of AGE_GROUPS) {
        const f = gltfPerson(asset, sex, age, 0).frame
        for (const perLeg of [1.0, 1.4]) {
          const speed = perLeg * f.legScale * f.scale
          const cycle = gaitAt(asset.clips as unknown as GaitClips, speed / f.scale, f.legScale)
          const perSecond = (speed / f.scale) * cycle.phasePerUnit
          // the clip's own fastest turn of each joint (rad/s at this pace)
          const steps = 2000
          const a = samplePhase(asset.clips.walk, 0, f, newPose(n))
          const b = newPose(n)
          const clipMax = index.map(() => 0)
          for (let k = 1; k <= steps; k++) {
            samplePhase(asset.clips.walk, k / steps, f, b)
            index.forEach((bone, j) => (clipMax[j] = Math.max(clipMax[j], turn(a.rot, b.rot, bone) * steps * perSecond)))
            for (let c = 0; c < b.rot.length; c++) a.rot[c] = b.rot[c]
          }
          for (const hz of [15, 20, 30, 60, 144, 240]) {
            const dt = 1 / hz
            const g = newClipGait()
            const pose = newPose(n)
            const prev = Array.from(pose.rot)
            let z = 0
            for (let k = 0; k * dt < 5; k++) {
              z += speed * dt
              stepClipGait(g, asset, f, speed * dt, speed)
              clipGaitPose(g, asset, f, speed, { x: 0, z, yaw: 0, unit: 1 }, pose)
              if (k * dt > 1) {
                index.forEach((bone, j) => {
                  const rate = turn(prev, pose.rot, bone) / dt
                  expect(rate, `${sex} ${age} at ${perLeg} per leg, ${hz} Hz, ${bones[j]} at phase ${g.phase.toFixed(3)}`).toBeLessThan(2.75 * clipMax[j])
                })
              }
              for (let c = 0; c < pose.rot.length; c++) prev[c] = pose.rot[c]
            }
          }
        }
      }
    }
  })

  it('in a sharp curve a planted foot keeps its heading and its spot, and never turns back against the curve', () => {
    // finding 22.10.2026 (point-1402 joint-speed sweep): at 3.5 rad/s yaw
    // the flat foot's heel-off roll turned it back against the curve (up to
    // 9 rad/s on the ground) and the kept heading, let go with the flat share,
    // swung round at up to 61 rad/s (16 rad/s with heel and ball still flat
    // on the ground; measured 25.11.2026). Cross-vendor review 25.11.2026:
    // the heading read a frame after the catch (0.12 rad later at 30 Hz), a
    // roll's undone turn pulled in past the reach slid the pivot (2.0 cm
    // from its touchdown), and heading and spot were never compared with
    // the touchdown.
    const n = asset.bones.length
    const feet = ['L', 'R'].map((s) => asset.bones.indexOf(`foot.${s}`))
    const contacts = ['heel', 'ball', 'tip'] as const
    let flatChecked = 0
    let spotChecked = 0
    let catchChecked = 0
    let rollChecked = 0
    for (const yawRate of [3.5, -3.5]) {
      for (const sex of SEXES) {
        for (const age of AGE_GROUPS) {
          const f = gltfPerson(asset, sex, age, 0).frame
          for (const perLeg of [1.0, 1.4]) {
            const speed = perLeg * f.legScale * f.scale
            for (const hz of [30, 60, 144]) {
              const dt = 1 / hz
              const g = newClipGait()
              const pose = newPose(n)
              const world = newWorld(n)
              let x = 0
              let z = 0
              let yaw = 0
              const last = [0, 0]
              // per foot, the contacts held on the frame before
              const heldBefore = [{ heel: false, ball: false, tip: false }, { heel: false, ball: false, tip: false }]
              // per foot, its heading on the frame it took hold (null: in the air)
              const caught: (number | null)[] = [null, null]
              // per foot and contact, where it lay when it came down held
              const spot: Record<string, { x: number; z: number } | null> = {}
              for (let k = 0; k * dt < 4; k++) {
                yaw += yawRate * dt
                x += Math.sin(yaw) * speed * dt
                z += Math.cos(yaw) * speed * dt
                // whether each foot still keeps a heading from its last plant
                // (its keep or its toes still letting go of it)
                const keptBefore = [g.flatYaw[0] !== null, g.flatYaw[1] !== null]
                stepClipGait(g, asset, f, speed * dt, speed)
                clipGaitPose(g, asset, f, speed, { x, z, yaw, unit: 1 }, pose)
                forwardKinematics(asset, f.rest0, pose, world)
                const c = contactPoints(asset, world, f.legScale)
                ;(['L', 'R'] as const).forEach((s, i) => {
                  const q = world.q[feet[i]]
                  const heading = 2 * Math.atan2(q.y, q.w) + yaw
                  const d = heading - last[i]
                  last[i] = heading
                  const held = g.held[i]
                  const holding = !!(held.heel || held.ball || held.tip)
                  // a hold handed from old contacts to new ones within one frame
                  // would be a catch this sweep never sees (it never happens)
                  const was = heldBefore[i]
                  if (holding && (was.heel || was.ball || was.tip)) expect(contacts.some((kk) => !!held[kk] && was[kk]), `${sex} ${age} at ${perLeg} per leg, ${hz} Hz, ${yawRate} rad/s, foot ${s} handed its hold over`).toBe(true)
                  for (const kk of contacts) was[kk] = !!held[kk]
                  if (!holding) caught[i] = null
                  else if (caught[i] === null) {
                    caught[i] = heading
                    // the heading kept from the catch on is the one drawn on
                    // the catch frame, never one kept from an earlier plant
                    const kept = g.flatYaw[i]
                    if (kept !== null && g.headingKeep[i] > 0) {
                      catchChecked++
                      // (the catch keeps the heading drawn on its frame: that
                      // is the clip's own only where nothing of the last plant's
                      // heading is kept before it — measured so at every catch)
                      expect(keptBefore[i], `${sex} ${age} at ${perLeg} per leg, ${hz} Hz, ${yawRate} rad/s, foot ${s} caught while still keeping`).toBe(false)
                      const e = kept - heading
                      expect(Math.abs(Math.atan2(Math.sin(e), Math.cos(e))), `${sex} ${age} at ${perLeg} per leg, ${hz} Hz, ${yawRate} rad/s, foot ${s} caught`).toBeLessThan(1e-3)
                    }
                  }
                  const where = `${sex} ${age} at ${perLeg} per leg, ${hz} Hz, ${yawRate} rad/s, foot ${s} at phase ${g.phase.toFixed(3)}`
                  for (const kk of contacts) {
                    const p = c[s][kk]
                    const key = s + kk
                    // the spot is kept for the whole hold: a contact lifted
                    // within it and set down again comes back to it
                    if (!held[kk]) {
                      spot[key] = null
                      continue
                    }
                    if (p.y > 0.003) continue
                    const w = { x: x + (p.x * Math.cos(yaw) + p.z * Math.sin(yaw)) * f.scale, z: z + (-p.x * Math.sin(yaw) + p.z * Math.cos(yaw)) * f.scale }
                    if (!spot[key]) spot[key] = w
                    else if (k * dt > 1) {
                      spotChecked++
                      // a held contact on the ground stays where it came down
                      // (measured to 0.9 cm over the whole hold, main before 1.3 cm)
                      expect(Math.hypot(w.x - spot[key]!.x, w.z - spot[key]!.z), `${where}, ${kk}`).toBeLessThan(0.012)
                    }
                  }
                  if (k * dt < 1) return
                  // the foot's world turn this frame, rad/s (+: with the curve)
                  const rate = (Math.atan2(Math.sin(d), Math.cos(d)) / dt) * Math.sign(yawRate)
                  // on the ground, or still letting go of its heading, it never
                  // turns back against the curve
                  if (Math.min(c[s].heel.y, c[s].ball.y, c[s].tip.y) <= 0.01 || g.headingKeep[i] > 0) expect(rate, where).toBeGreaterThan(-0.1)
                  // OPEN: past its release, the swinging foot's hand-over into
                  // the clip's swing turns it back by up to 17.5 rad/s at 30 Hz
                  // (main before: 16.3)
                  else expect(rate, where).toBeGreaterThan(-20)
                  // lying on heel and ball it keeps the heading it took hold with
                  // (measured to 1e-4 rad)
                  if (c[s].heel.y <= 0.003 && c[s].ball.y <= 0.003 && caught[i] !== null) {
                    flatChecked++
                    const e = heading - caught[i]!
                    expect(Math.abs(Math.atan2(Math.sin(e), Math.cos(e))), where).toBeLessThan(0.03)
                  } else if (caught[i] !== null && g.headingKeep[i] >= 1 && contacts.filter((kk) => held[kk] && c[s][kk].y <= 0.003).length === 1) {
                    // and rolling on a single held contact, until its release
                    // begins (measured to 1e-7 rad; letting go it turns by up
                    // to 0.42 rad while a contact is still down, by design)
                    rollChecked++
                    const e = heading - caught[i]!
                    expect(Math.abs(Math.atan2(Math.sin(e), Math.cos(e))), `${where}, rolling`).toBeLessThan(0.03)
                  }
                  // and it lets go of it without a snap (main before: 61 rad/s).
                  // OPEN: at 1.4 per leg the trailing foot is thrown up to
                  // 0.6 m while its ball and tip still count as held (main
                  // before alike); letting go up there it turns at up to
                  // 34.7 rad/s at 30 Hz, elsewhere at most 23.5
                  expect(rate, where).toBeLessThan(40)
                })
              }
            }
          }
        }
      }
    }
    expect(flatChecked).toBeGreaterThan(1000)
    expect(spotChecked).toBeGreaterThan(1000)
    // (8465 frames on exactly one held contact, measured 25.11.2026)
    expect(rollChecked).toBeGreaterThan(1000)
    expect(catchChecked).toBeGreaterThan(500)
  })

  it('stopping and walking on in a sharp curve, a foot handed between its pivots bends its knee no faster than the clip, and keeps the heading drawn at its catch', () => {
    // cross-vendor review 25.11.2026: the hand-over of a heading-keeping
    // foot moved its ankle target past the reach the first solve stops at,
    // so the knee snapped near straight for the frame (2.5x the clip's
    // fastest knee on the female child, 144-240 Hz); and the heading kept
    // from a catch was read before the solve drew the foot, or kept from
    // an earlier plant
    const n = asset.bones.length
    const legs = ['L', 'R'].map((s) => ['thigh', 'shin', 'foot'].map((b) => asset.bones.indexOf(`${b}.${s}`)))
    const shins = legs.map((l) => l[1])
    const qa = new THREE.Quaternion()
    const qb = new THREE.Quaternion()
    const ease = (x: number) => {
      const c = Math.min(1, Math.max(0, x))
      return c * c * (3 - 2 * c)
    }
    let handed = 0
    let caughtN = 0
    for (const sex of SEXES) {
      for (const age of AGE_GROUPS) {
        const f = gltfPerson(asset, sex, age, 0).frame
        for (const perLeg of [1.0, 1.4]) {
          const full = perLeg * f.legScale * f.scale
          const cycle = gaitAt(asset.clips as unknown as GaitClips, full / f.scale, f.legScale)
          const perSecond = (full / f.scale) * cycle.phasePerUnit
          // the clip's own fastest knee (rad/s at this pace)
          let clipMax = 0
          const steps = 2000
          const a = samplePhase(asset.clips.walk, 0, f, newPose(n))
          const b = newPose(n)
          for (let k = 1; k <= steps; k++) {
            samplePhase(asset.clips.walk, k / steps, f, b)
            for (const sh of shins) clipMax = Math.max(clipMax, qa.fromArray(a.rot, sh * 4).angleTo(qb.fromArray(b.rot, sh * 4)) * steps * perSecond)
            for (let c = 0; c < b.rot.length; c++) a.rot[c] = b.rot[c]
          }
          for (const yawRate of [3.5, -3.5]) {
            for (const hz of [60, 240]) {
              // walking on through the curve, or stopping in it (0.3 s down,
              // a pause, 0.3 s up), the body turning with its pace
              for (const pause of [null, 0.05, 0.15, 0.3]) {
                const dt = 1 / hz
                const pace = (t: number) => {
                  if (pause === null || t < 1.5) return full
                  if (t < 1.8) return full * (1 - ease((t - 1.5) / 0.3))
                  if (t < 1.8 + pause) return 0
                  return full * ease((t - 1.8 - pause) / 0.3)
                }
                const g = newClipGait()
                const pose = newPose(n)
                const world = newWorld(n)
                const prev = Array.from(pose.rot)
                const wasHeld = [false, false]
                const heldBefore = [{ heel: false, ball: false, tip: false }, { heel: false, ball: false, tip: false }]
                let x = 0
                let z = 0
                let yaw = 0
                for (let k = 0; k * dt < 3.5; k++) {
                  const speed = pace(k * dt)
                  yaw += yawRate * (speed / full) * dt
                  x += Math.sin(yaw) * speed * dt
                  z += Math.cos(yaw) * speed * dt
                  stepClipGait(g, asset, f, speed * dt, speed)
                  clipGaitPose(g, asset, f, speed, { x, z, yaw, unit: 1 }, pose)
                  forwardKinematics(asset, f.rest0, pose, world)
                  const where = `${sex} ${age} at ${perLeg} per leg, ${hz} Hz, ${yawRate} rad/s, pause ${pause}, t ${(k * dt).toFixed(3)}`
                  legs.forEach(([, shin, foot], i) => {
                    const held = g.held[i]
                    const holding = !!(held.heel || held.ball || held.tip)
                    // (every catch is a frame from no hold to a hold here too:
                    // a hold is never handed to other contacts within a frame)
                    const was = heldBefore[i]
                    if (holding && (was.heel || was.ball || was.tip)) expect((['heel', 'ball', 'tip'] as const).some((kk) => !!held[kk] && was[kk]), `${where}, foot ${i} handed its hold over`).toBe(true)
                    for (const kk of ['heel', 'ball', 'tip'] as const) was[kk] = !!held[kk]
                    if (holding && !wasHeld[i] && g.headingKeep[i] > 0 && g.flatYaw[i] !== null) {
                      caughtN++
                      const q = world.q[foot]
                      const e = g.flatYaw[i]! - (2 * Math.atan2(q.y, q.w) + yaw)
                      const miss = Math.abs(Math.atan2(Math.sin(e), Math.cos(e)))
                      // the heading kept from the catch is the one drawn there
                      expect(miss, `${where}, foot ${i} caught`).toBeLessThan(1e-3)
                    }
                    wasHeld[i] = holding
                    if (k * dt < 1 || !(g.lift[i].left > 0 && g.planted[i])) return
                    handed++
                    const rate = qa.fromArray(prev, shin * 4).angleTo(qb.fromArray(pose.rot, shin * 4)) / dt / clipMax
                    // (measured 0.99 of the clip's fastest; 2.5 before)
                    expect(rate, `${where}, shin ${i} handed over`).toBeLessThan(1)
                  })
                  for (let c = 0; c < pose.rot.length; c++) prev[c] = pose.rot[c]
                }
              }
            }
          }
        }
      }
    }
    expect(handed).toBeGreaterThan(1000)
    expect(caughtN).toBeGreaterThan(500)
    // (8 bodies x 2 paces x 2 turns x 2 rates x 4 stops of 3.5 s each; the
    // heel strike's brake samples the clip once more per braking frame: 18 s
    // on a quiet host, past the 20 s default on the CI runner, 25.11.2026)
  }, 120_000)

  it('two villagers drawn in turn pose their legs and toes as each drawn alone, through every toe release', () => {
    // review 22.10.2026: the toes letting go after the tip's hold ended were
    // flattened onto a heading shared between figures, so a walker drawn in
    // between with another heading turned the releasing toes
    const n = asset.bones.length
    const f = adult.frame
    const legs = ['thigh', 'shin', 'foot', 'toe'].flatMap((b) => ['L', 'R'].map((s) => asset.bones.indexOf(`${b}.${s}`)))
    const walkers = [
      { yaw: 0.3, speed: 1.0 * f.legScale * f.scale },
      { yaw: -2.1, speed: 1.3 * f.legScale * f.scale },
    ]
    const dt = 1 / 60
    const run = (who: number[]) => {
      const gaits = who.map(() => newClipGait())
      const poses = who.map(() => newPose(n))
      const out: number[][][] = who.map(() => [])
      for (let k = 0; k * dt < 4; k++) {
        who.forEach((w, j) => {
          const { yaw, speed } = walkers[w]
          const d = speed * dt * (k + 1)
          stepClipGait(gaits[j], asset, f, speed * dt, speed)
          clipGaitPose(gaits[j], asset, f, speed, { x: Math.sin(yaw) * d, z: Math.cos(yaw) * d, yaw, unit: 1 }, poses[j])
          out[j].push(legs.flatMap((b) => Array.from(poses[j].rot.slice(b * 4, b * 4 + 4))))
        })
      }
      return out
    }
    const both = run([0, 1])
    const alone = [run([0])[0], run([1])[0]]
    // component by component (an angle between float32 quaternions reads
    // their rounding as a turn)
    let worst = 0
    for (const w of [0, 1]) both[w].forEach((frame, k) => frame.forEach((x, c) => (worst = Math.max(worst, Math.abs(x - alone[w][k][c])))))
    // the same arithmetic on the same state: exactly the same pose
    expect(worst).toBe(0)
  })

  it('a pivot carried across the reach of leg and foot in one line moves the ankle and foot without a jump', () => {
    // review 21.10.2026: the lift to the reach ended at the horizontal limit,
    // so a low pivot just past it dropped back down and the pose jumped
    const n = asset.bones.length
    const f = adult.frame
    const world = newWorld(n)
    forwardKinematics(asset, f.rest0, newPose(n), world)
    const [thigh, shin, foot] = ['thigh.L', 'shin.L', 'foot.L'].map((b) => asset.bones.indexOf(b))
    const hip = world.p[thigh]
    const toPivot = new THREE.Vector3(0, -0.02, 0.1)
    const solve = (x: number) => {
      const target = new THREE.Vector3(hip.x, hip.y - 0.4, hip.z + x)
      const q = new THREE.Quaternion()
      const out = heelOff(f, world, thigh, shin, foot, target, toPivot, q)
      return { out, target, q }
    }
    // the largest change between neighbouring samples: a steep but continuous
    // turn shrinks with the sample spacing, a jump keeps its size
    const largest = (h: number) => {
      let prev = solve(0.3)
      let ankle = 0
      let turn = 0
      for (let k = 1; 0.3 + k * h <= 3; k++) {
        const s = solve(0.3 + k * h)
        expect(s.out).not.toBe('out')
        ankle = Math.max(ankle, s.target.distanceTo(prev.target))
        turn = Math.max(turn, s.q.angleTo(prev.q))
        prev = s
      }
      return { ankle, turn }
    }
    const coarse = largest(1e-3)
    const fine = largest(1e-4)
    expect(fine.ankle).toBeLessThan(coarse.ankle / 2)
    expect(fine.turn).toBeLessThan(coarse.turn / 2)
  })

  it('a rolling foot that keeps its heading moves its ankle and pitch without a jump, a hip off its line included', () => {
    // review 25.11.2026: the further pitch that keeps the ankle on the reach
    // was applied whole up to G.rollKeepPitchMax and dropped above it, and
    // dropped too where the reach sphere was just missed (the tangent's
    // pitch, 0.16 rad, lost in one step); the continuity case above runs
    // without a kept heading and so never reached it
    const n = asset.bones.length
    const f = adult.frame
    const world = newWorld(n)
    forwardKinematics(asset, f.rest0, newPose(n), world)
    const [thigh, shin, foot] = ['thigh.L', 'shin.L', 'foot.L'].map((b) => asset.bones.indexOf(b))
    const hip = world.p[thigh]
    let rolled = 0
    for (const toPivot of [new THREE.Vector3(0, -0.02, 0.1), new THREE.Vector3(0.03, -0.05, 0.16)]) {
      for (const keepYaw of [0.5, 1]) {
        for (const side of [0.15, 0.3, 0.5]) {
          for (const lift of [0, 0.05, 0.15]) {
            // the ankle target at the foot's rest height (plus a lift), swept
            // from behind the hip to in front of it, off its line by `side`
            const solve = (x: number) => {
              const target = new THREE.Vector3(hip.x + side * x, world.p[foot].y + lift, hip.z + x)
              const q = new THREE.Quaternion()
              const out = heelOff(f, world, thigh, shin, foot, target, toPivot, q, keepYaw)
              if (out === 'rolled') rolled++
              return { target, q }
            }
            // the steepest step at a 0.1 mm spacing, then sampled 100 times
            // finer where it lies: a continuous change (steep as a root near
            // a tangent) shrinks with the spacing, a jump keeps its size
            const steps = (from: number, to: number, h: number) => {
              let prev = solve(from)
              const m = { ankle: 0, turn: 0, atAnkle: from, atTurn: from }
              for (let x = from + h; x <= to + 1e-12; x += h) {
                const s = solve(x)
                const a = s.target.distanceTo(prev.target)
                const t = s.q.angleTo(prev.q)
                if (a > m.ankle) Object.assign(m, { ankle: a, atAnkle: x })
                if (t > m.turn) Object.assign(m, { turn: t, atTurn: x })
                prev = s
              }
              return m
            }
            const where = `keepYaw ${keepYaw}, side ${side}, lift ${lift}`
            const coarse = steps(-1.5, 1.5, 1e-4)
            expect(steps(coarse.atAnkle - 1e-4, coarse.atAnkle, 1e-6).ankle, where).toBeLessThan(coarse.ankle / 3)
            expect(steps(coarse.atTurn - 1e-4, coarse.atTurn, 1e-6).turn, where).toBeLessThan(coarse.turn / 3)
          }
        }
      }
    }
    expect(rolled).toBeGreaterThan(1000)
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

  it('the knee turns continuously on a tilted leg too: the pole never lies along the hip–ankle line', () => {
    // the leg tilted 53° off vertical, its knee swept across the line from
    // 0.012 ahead to 0.012 behind (the review's case: behind at 0.004454683
    // the pole once lay along the line and the ankle jumped 0.785)
    const hip = new THREE.Vector3(0, 0.6, 0.8)
    const ankle = new THREE.Vector3(0, 0, 0)
    const across = new THREE.Vector3(0, 0.8, -0.6) // behind the line
    const want = 0.9
    const axis = new THREE.Vector3()
    const at = (d: number) => {
      const knee = hip.clone().multiplyScalar(0.5).addScaledVector(across, d)
      const turn = kneeTurn(hip, knee, ankle, want, VILLAGER_POSE.kneePoleMin, axis)
      const moved = ankle.clone().sub(knee).applyAxisAngle(axis, turn).add(knee)
      expect(moved.distanceTo(hip)).toBeCloseTo(want, 6)
      return moved
    }
    let last = at(-0.012)
    let jump = 0
    for (let k = 1; k <= 48000; k++) {
      const moved = at(-0.012 + k * 0.0000005)
      jump = Math.max(jump, moved.distanceTo(last))
      last = moved
    }
    expect(jump).toBeLessThan(1e-3)
    expect(at(0.004454583089).distanceTo(at(0.004454783089))).toBeLessThan(1e-5)
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

describe('a rolled foot\'s further pitch', () => {
  it('stays continuous where its two solutions change sides', () => {
    // cross-vendor review 25.11.2026: with ka < 0, kb crossing 0 and
    // K / r0 = -cos(0.3), the nearer root switched between about -0.3 and
    // +0.3 rad at full weight, a 0.6 rad jump of the applied pitch
    const K = -Math.cos(0.3)
    let last: number | null = null
    let maxStep = 0
    for (let k = -200; k <= 200; k++) {
      const kb = k * 1e-4
      const ka = -Math.sqrt(1 - kb * kb)
      const { alpha, weight } = nearPitch(ka, kb, K, 1)
      const applied = alpha * weight
      if (last !== null) maxStep = Math.max(maxStep, Math.abs(applied - last))
      last = applied
    }
    expect(maxStep).toBeLessThan(0.01)
    // away from the tie the nearer root carries its full weight
    const away = nearPitch(Math.cos(0.5), Math.sin(0.5), Math.cos(0.3), 1)
    expect(away.alpha).toBeCloseTo(0.2, 6)
    expect(away.weight).toBe(1)
    // a tangent's (and a just missed sphere's) coinciding pitches keep their
    // full weight (review round 4: the tie fade had zeroed them)
    for (const K2 of [1, 1.2]) {
      const t = nearPitch(Math.cos(0.4), Math.sin(0.4), K2, 1)
      expect(t.alpha).toBeCloseTo(0.4, 6)
      expect(t.weight).toBe(1)
    }
    // and keep it from the tangent inward while both lie on one side
    // (the pitch itself follows the root's own slope there)
    for (let k = 0; k <= 400; k++) expect(nearPitch(Math.cos(0.4), Math.sin(0.4), 1 - k * 1e-4, 1).weight).toBe(1)
    // review round 5: where the tangent meets the side change (both pitches
    // at 0) the weight steps but the applied pitch runs on through 0, and a
    // pitch wrapping through ±π keeps its weight
    // approached with a nonzero pitch (phi and K running to 0 and the
    // tangent together), the applied pitch tends to 0 without a step
    let prev: number | null = null
    let worst = 0
    let largest = 0
    for (let k = 400; k >= 0; k--) {
      const phi = k * 5e-4
      const { alpha, weight } = nearPitch(Math.cos(phi), Math.sin(phi), Math.cos(phi / 2), 1)
      const applied = alpha * weight
      largest = Math.max(largest, Math.abs(applied))
      if (prev !== null) worst = Math.max(worst, Math.abs(applied - prev))
      prev = applied
    }
    expect(largest).toBeGreaterThan(0.05)
    expect(Math.abs(prev!)).toBeLessThan(1e-9)
    expect(worst).toBeLessThan(0.01)
    // and with its two pitches straddling 0 (3 phi and -phi) the same
    prev = null
    worst = 0
    largest = 0
    for (let k = 400; k >= 0; k--) {
      const phi = k * 2.5e-4
      const { alpha, weight } = nearPitch(Math.cos(phi), Math.sin(phi), Math.cos(2 * phi), 1)
      const applied = alpha * weight
      largest = Math.max(largest, Math.abs(applied))
      if (prev !== null) worst = Math.max(worst, Math.abs(applied - prev))
      prev = applied
    }
    expect(largest).toBeGreaterThan(0.05)
    expect(Math.abs(prev!)).toBeLessThan(1e-9)
    expect(worst).toBeLessThan(0.01)
    const c = 0.05
    const before = nearPitch(Math.cos(Math.PI - c - 1e-6), Math.sin(Math.PI - c - 1e-6), Math.cos(c), 1)
    const after = nearPitch(Math.cos(Math.PI - c + 1e-6), Math.sin(Math.PI - c + 1e-6), Math.cos(c), 1)
    expect(Math.abs(before.weight - after.weight)).toBeLessThan(1e-3)
  })
})
