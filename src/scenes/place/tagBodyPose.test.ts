// The glTF body's tag poses (natural-villager-motion steps 15 and 16): the
// port-city chaser and the river-bank / tag caught child, driven frame by frame
// the way PlaceLife.tsx drives them, through the same pure functions. The
// primitive figure's poses (tagGame.test.ts) stay exactly as they were.

import { describe, expect, it } from 'vitest'
import { balance, VILLAGER_POSE } from '../../config/balance'
import { CHILD_FIGURE_SCALE, FIGURE_LIMBS } from '../../render/figures'
import { distributeLean, LEAN_BONES } from '../../render/figureRig'
import {
  advanceGesture,
  gestureEnvelope,
  gesturePose,
  REST_POSE,
  restGesture,
  TOUCH_LEAN,
  type ArmPose,
  type FigurePose,
  type GestureState,
} from '../../render/gesture'
import {
  bankFigurePose,
  caughtBodyPose,
  createTagGame,
  easeWeight,
  grabAim,
  grabDue,
  grabHandWorld,
  handGapToBody,
  mixPose,
  newTagBodyWeights,
  prepareDue,
  quarryBearing,
  stepTagGame,
  steerGrab,
  tagBody,
  tagFigurePose,
  type GrabAim,
  type TagConfig,
  type TagState,
  type TagWorld,
} from './tagGame'
import { mulberry32 } from '../../world/noise'
import { VILLAGER_MOTION } from '../../config/balance'

const CFG: TagConfig = balance.villageLife.tag
const CH = VILLAGER_POSE.tagChaser
const SL = VILLAGER_POSE.caughtSlump
const SCALE = CHILD_FIGURE_SCALE
const OPEN: TagWorld = {
  radius: 40,
  childRadius: 0.3,
  blocked: (x, z) => Math.hypot(x, z) > 40,
  nudge: (x, z) => ({ x, z, found: true }),
}

function pair(gap: number): TagState {
  const s = createTagGame([{ x: 0, z: 0 }, { x: 0, z: gap }], mulberry32(9), CFG)
  s.chaser = 0
  s.playing = true
  s.target = 1
  s.children.forEach((c) => {
    c.facing = 0
    c.heading = 0
  })
  return s
}

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a))
const armStep = (a: ArmPose, b: ArmPose) => Math.max(Math.abs(a.pitch - b.pitch), Math.abs(a.yaw - b.yaw), Math.abs(a.roll - b.roll))
const restOf = (side: 'left' | 'right') => (side === 'left' ? REST_POSE.left : REST_POSE.right)
/** The trunk's additive pitch as the glTF body distributes it: every share summed (the hips take none). */
const trunkPitch = (lean: number) => LEAN_BONES.reduce((sum, b) => sum + distributeLean(lean, 0, VILLAGER_POSE.leanShares)[b].pitch, 0)

interface Frame {
  t: number
  gap: number
  bearing: number
  body: FigurePose
  side: 'left' | 'right' | null
  aim: GrabAim | null
  grab: number
  me: { x: number; z: number; facing: number }
  quarry: { x: number; z: number }
}

/**
 * The chaser at the sprint closing on (or losing) its quarry, PlaceLife's
 * per-frame part: the primitive grab steered as before, the glTF body's level
 * grab, readied arm and reach eased beside it.
 */
function chase(quarryAt: (t: number) => { x: number; z: number }, seconds: number, dt = 1 / 60, lean = CFG.leanAtSprint): Frame[] {
  const s = pair(5)
  const w = newTagBodyWeights()
  let gesture: GestureState = restGesture()
  let bodyAim: GrabAim | null = null
  let side: 'left' | 'right' | null = null
  const out: Frame[] = []
  for (let t = 0; t <= seconds; t += dt) {
    const c = s.children[0]
    c.z += CFG.sprintSpeed * dt
    const q = quarryAt(t)
    s.children[1].x = q.x
    s.children[1].z = q.z
    gesture = advanceGesture(gesture, dt)
    const quarry = grabDue(s, CFG) ? s.children[1] : null
    if (quarry) {
      const aim = grabAim({ x: c.x, z: c.z, facing: c.facing }, quarry, Math.max(lean, TOUCH_LEAN), SCALE, CFG.gazeTurnMax, side)
      side = aim.side
      bodyAim = grabAim({ x: c.x, z: c.z, facing: c.facing }, quarry, Math.min(lean, CH.leanMax), SCALE, CFG.gazeTurnMax, w.side, { elevation: CH.reachElevation, reachMax: CH.reachMax })
      w.side = bodyAim.side
      gesture = steerGrab(gesture, aim)
    } else gesture = steerGrab(gesture, null)
    if (gesture.kind !== 'touch') {
      side = null
      bodyAim = null
    }
    w.prepare = easeWeight(w.prepare, prepareDue(s, CFG), CH.prepareSeconds, dt)
    w.reach = easeWeight(w.reach, !!bodyAim, CH.prepareSeconds, dt)
    const bearing = quarryBearing(s, 0)
    if (w.prepare <= 0 && w.reach <= 0 && !bodyAim) w.side = null
    else w.side ??= bearing >= 0 ? 'left' : 'right'
    const pose = tagFigurePose(tagBody(s, 0), gesturePose(gesture), gestureEnvelope(gesture), lean, 0, CFG, { weights: w, aim: bodyAim, bearing })
    const gap = Math.hypot(q.x - c.x, q.z - c.z)
    out.push({ t, gap, bearing, body: pose.body!, side: w.side, aim: bodyAim, grab: Math.min(gestureEnvelope(gesture), w.reach), me: { x: c.x, z: c.z, facing: c.facing }, quarry: q })
  }
  return out
}

describe('the port-city tag chaser on the glTF body (natural-villager-motion step 15)', () => {
  // The quarry runs ahead and a little to the left, slower than the chaser:
  // it is closed on through the prepare and commit distances to the catch.
  const caught = chase((t) => ({ x: 0.4, z: 5 + 2.6 * t }), 8)
  const catchAt = caught.findIndex((f) => f.gap <= CFG.catchDistance)

  it('the trunk leans by the run alone, capped, distributed above the hips — no touch lean while running', () => {
    expect(catchAt).toBeGreaterThan(0)
    for (const f of caught.slice(0, catchAt + 1)) {
      expect(f.body.lean).toBeLessThanOrEqual(CH.leanMax + 1e-9)
      expect(trunkPitch(f.body.lean)).toBeLessThanOrEqual(0.15)
    }
    expect(Object.keys(distributeLean(0.1, 0, VILLAGER_POSE.leanShares))).not.toContain('hips')
    expect(CH.leanMax).toBeLessThan(TOUCH_LEAN)
  })

  it('the head holds the quarry: the gaze within 5° of its bearing, the chest only its share', () => {
    for (const f of caught.slice(0, catchAt + 1)) {
      const g = f.body.gaze!
      expect(Math.abs(wrap(g.yaw - f.bearing))).toBeLessThan((5 * Math.PI) / 180)
      // the glTF body's chest turn: the trunk's own part, plus the chest's share of the gaze
      const own = f.body.turn - g.turn
      const chest = own + VILLAGER_POSE.gaze.chestYaw * (g.yaw - own)
      if (f.grab === 0) expect(chest).toBeCloseTo(VILLAGER_POSE.gaze.chestYaw * f.bearing, 9)
    }
  })

  it('the free arm keeps the run’s swing throughout; the one arm readies, bent, before the commit distance', () => {
    let readied = false
    for (const f of caught.slice(0, catchAt + 1)) {
      if (!f.side) {
        expect(f.body.left).toEqual(REST_POSE.left)
        expect(f.body.right).toEqual(REST_POSE.right)
        continue
      }
      const other = f.side === 'left' ? 'right' : 'left'
      expect(f.body[other]).toEqual(restOf(other))
      if (f.gap > CFG.commitDistance && f.gap < CH.prepareDistance - 0.5) {
        readied = true
        // bent: the hand short of the straight arm, the clavicle forward
        expect(f.body.reach![f.side]).toBeLessThan(1)
        expect(f.body.shoulders![f.side].protraction).toBeGreaterThan(0)
      }
    }
    expect(readied).toBe(true)
    // the pre-aim never gates the grab: inside the commit distance the grab is
    // due exactly as before, and the prepare window reaches beyond it
    expect(CH.prepareDistance).toBeGreaterThan(CFG.commitDistance)
    const s = pair(CFG.commitDistance + 0.5)
    expect(prepareDue(s, CFG)).toBe(true)
    expect(grabDue(s, CFG)).toBe(false)
    const t = pair(CFG.commitDistance - 0.1)
    expect(grabDue(t, CFG)).toBe(true)
  })

  it('blends, never snaps: the reaching arm moves a bounded amount per frame', () => {
    for (let k = 1; k <= catchAt; k++) {
      const a = caught[k - 1]
      const b = caught[k]
      for (const s of ['left', 'right'] as const) expect(armStep(a.body[s], b.body[s]), `t=${b.t.toFixed(2)} ${s}`).toBeLessThan(0.2)
      expect(Math.abs((a.body.reach?.left ?? 1) - (b.body.reach?.left ?? 1))).toBeLessThan(0.2)
      expect(Math.abs((a.body.reach?.right ?? 1) - (b.body.reach?.right ?? 1))).toBeLessThan(0.2)
    }
  })

  it('at the catch frame the hand reaches level at shoulder height, onto the quarry', () => {
    const f = caught[catchAt]
    expect(f.aim).not.toBeNull()
    expect(f.grab).toBe(1)
    const me = f.me
    const side = f.side!
    const shoulder = grabHandWorld(me, f.body[side], side, f.body.lean, f.body.turn, SCALE, 0, 0)
    const hand = grabHandWorld(me, f.body[side], side, f.body.lean, f.body.turn, SCALE, 0, f.body.reach![side])
    const elevation = Math.atan2(hand[1] - shoulder[1], Math.hypot(hand[0] - shoulder[0], hand[2] - shoulder[2]))
    expect(Math.abs(elevation)).toBeLessThan((10 * Math.PI) / 180)
    expect(shoulder[1] / SCALE).toBeGreaterThan(FIGURE_LIMBS.shoulderY - 0.03)
    expect(handGapToBody(hand, f.quarry, SCALE)).toBeLessThanOrEqual(FIGURE_LIMBS.handRadius * SCALE)
    expect(f.body.shoulders![side].protraction).toBeCloseTo(CH.reachProtraction, 9)
    // the last stride may lunge onto the quarry; the approach never does
    expect(f.body.reach!.lunge).toBe(true)
    for (const g of caught.filter((x) => x.gap > 1)) expect(g.body.reach?.lunge ?? false).toBe(false)
  })

  it('after a miss the arm recovers into the swing and the run goes on', () => {
    // closes to just inside the commit distance, then the quarry pulls away
    const missed = chase((t) => ({ x: -0.3, z: t < 1.6 ? 5 + 1.2 * t : 5 + 1.2 * 1.6 + 6 * (t - 1.6) }), 4)
    expect(missed.some((f) => f.aim)).toBe(true)
    expect(missed.every((f) => f.gap > CFG.catchDistance)).toBe(true)
    const last = missed.at(-1)!
    expect(last.gap).toBeGreaterThan(CH.prepareDistance)
    expect(last.side).toBeNull()
    expect(last.body.left).toEqual(REST_POSE.left)
    expect(last.body.right).toEqual(REST_POSE.right)
    for (let k = 1; k < missed.length; k++) {
      for (const s of ['left', 'right'] as const) expect(armStep(missed[k - 1].body[s], missed[k].body[s])).toBeLessThan(0.2)
    }
  })

  it('a child at the full run strides: its sprint is no placement to the walk', () => {
    // the drawn walk measures speed in person units; above teleportSpeed it
    // reads a jump and freezes the legs
    expect((CFG.sprintSpeed * CFG.runnerBoost) / SCALE).toBeLessThan(VILLAGER_MOTION.teleportSpeed)
  })

  it('the primitive figure keeps its own chaser pose (the low preset untouched)', () => {
    const shown = { left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0, turn: 0 }
    const w = { ...newTagBodyWeights(), prepare: 1, side: 'left' as const }
    const withBody = tagFigurePose('chaser', shown, 0, 0.28, 0.2, CFG, { weights: w, aim: null, bearing: 0.2 })
    const without = tagFigurePose('chaser', shown, 0, 0.28, 0.2, CFG)
    const { body, ...primitive } = withBody
    expect(primitive).toEqual(without)
    expect(body).toBeDefined()
  })
})

describe('the caught child on the glTF body (natural-villager-motion step 16)', () => {
  it('the settled hold: trunk over the spine alone, clavicles forward and down, the head bowed, arms to the clip', () => {
    const p = caughtBodyPose()
    expect(p.lean).toBe(SL.trunk)
    expect(trunkPitch(p.lean)).toBeLessThanOrEqual(0.15)
    for (const s of ['left', 'right'] as const) {
      expect(p.shoulders![s].protraction).toBeGreaterThan(0)
      expect(p.shoulders![s].elevation).toBeLessThan(0)
      expect(p[s]).toEqual(restOf(s))
    }
    expect(p.gaze!.pitch).toBeCloseTo(-SL.headBow, 9)
    // the bow looks at the ground about a metre ahead of a child's eyes
    const eye = 0.93 * SCALE * 1.75
    expect(Math.abs(Math.atan2(eye, 1) - SL.headBow)).toBeLessThan(0.5)
    expect(p.turn).toBe(0)
    expect(p.gaze!.yaw).toBe(0)
  })

  it('catch → settle → hold → resume in the tag round: eased in and out, never a snap or a squash', () => {
    const s = pair(CFG.catchDistance * 0.5)
    const w = newTagBodyWeights()
    const dt = 1 / 60
    // the quarry at the sprint's lean (above the chaser's cap): the frame
    // BEFORE the catch is the first compared, so the boundary is covered
    const caught = s.target
    s.children[caught].lean = CFG.leanAtSprint
    expect(CFG.leanAtSprint).toBeGreaterThan(CH.leanMax + 0.05)
    const runner = tagFigurePose(tagBody(s, caught), { ...REST_POSE }, 0, s.children[caught].lean, 0, CFG, { weights: w, aim: null, bearing: quarryBearing(s, caught) })
    expect(tagBody(s, caught)).toBe('runner')
    stepTagGame(s, 1e-6, CFG, OPEN)
    expect(s.chaser).toBe(caught)
    expect(tagBody(s, caught)).toBe('caught')
    // what the glTF body draws: the pose's own body, else the pose itself
    let prev: FigurePose | null = runner.body ?? runner
    let held = false
    let resumed = false
    for (let t = 0; t < CFG.caughtPauseSeconds + 1.5; t += dt) {
      stepTagGame(s, dt, CFG, OPEN)
      const body = tagBody(s, caught)
      w.slump = easeWeight(w.slump, body === 'caught', SL.settleSeconds, dt)
      const pose = tagFigurePose(body, { ...REST_POSE }, 0, s.children[caught].lean, 0, CFG, { weights: w, aim: null, bearing: quarryBearing(s, caught) })
      const b = pose.body!
      // eased out of the run's own lean, never past it; the hold itself stays
      // over the spine alone
      expect(b.lean).toBeLessThanOrEqual(CFG.leanAtSprint + 1e-9)
      if (w.slump === 1) expect(trunkPitch(b.lean)).toBeLessThanOrEqual(0.15)
      expect(Object.keys(b)).not.toContain('squash')
      if (prev) {
        // the brake's own ease out of the sprint lean (0.28) under the slump:
        // ~0.02 rad a frame at most; the old snap to the chaser's cap was 0.16
        expect(Math.abs(b.lean - prev.lean)).toBeLessThan(0.025)
        expect(Math.abs((b.gaze?.pitch ?? 0) - (prev.gaze?.pitch ?? 0))).toBeLessThan(0.06)
        expect(Math.abs((b.shoulders?.left.protraction ?? 0) - (prev.shoulders?.left.protraction ?? 0))).toBeLessThan(0.05)
      }
      if (w.slump === 1) {
        held = true
        expect(b.lean).toBeCloseTo(SL.trunk, 9)
        expect(b.gaze!.pitch).toBeCloseTo(-SL.headBow, 9)
        // the caught child stands still through its beat
        expect(s.children[caught].pace).toBe(0)
      }
      if (body === 'chaser' && w.slump === 0) resumed = true
      prev = b
    }
    expect(held).toBe(true)
    expect(resumed).toBe(true)
  })

  it('the bank round draws the same hold, eased, while the primitive keeps its slump', () => {
    const shown = { left: { ...REST_POSE.left }, right: { ...REST_POSE.right }, lean: 0, turn: 0 }
    const full = bankFigurePose(true, shown, 0.2, CFG, 1)
    expect(full.body).toEqual(caughtBodyPose())
    expect(full.lean).toBe(CFG.caughtSlumpLean)
    const half = bankFigurePose(true, shown, 0.2, CFG, 0.5)
    expect(half.body!.lean).toBeGreaterThan(0.12 * 0.3)
    expect(half.body!.lean).toBeLessThan(0.2)
    expect(bankFigurePose(false, shown, 0.2, CFG, 0).body).toBeUndefined()
    // a pose blend at its ends is either pose exactly
    expect(mixPose(shown, caughtBodyPose(), 0)).toBe(shown)
  })
})
