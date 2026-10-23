// The task walker takes its head load off with its hands and puts it back on
// (work-order "the task walker takes its head load off with its hands"): the
// load is visible in every phase, never jumps, and is in the hands while it
// is set down and picked up.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TASK_LOAD_HANDLING as H, VILLAGER_MOTION } from '../../config/balance'
import { approach } from '../../render/figureWalk'
import { armDirection, REST_POSE, type FigurePose } from '../../render/gesture'
import { FIGURE_LIMBS } from '../../render/figures'
import { aimArm, gripPoints, handlingPose, LOAD_GROUND, loadGrip, loadHandling, loadPlacement, type V3 } from './taskWalkerLoad'
import { workSpan, workStop, type StopMode, type WorkStopMode } from './taskWalkerStop'
import type { TaskLoad } from './headLoads'

const DT = 1 / 60
const dist = (a: V3, b: V3) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
const mixV = (a: V3, b: V3, t: number): V3 => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t })

interface Frame {
  mode: WorkStopMode
  phase: 'take' | 'kneel down' | 'let go' | 'work' | 'grip' | 'rise' | 'settle' | 'walk'
  base: V3
  hands: [V3, V3]
  hold: number
  down: number
}

/** One whole stop, frame by frame: a modelled body (the crown sinks with the
 *  kneel) whose hands go where they are aimed, `lag` metres short of it. */
function simulate(carry: TaskLoad, lag = 0): Frame[] {
  const span = workSpan(6)
  let mode: WorkStopMode = 'take'
  let timer: number = H.takeSeconds
  let kneel = 0
  const rest: [V3, V3] = [
    { x: 0.25, y: 0.8, z: 0 },
    { x: -0.25, y: 0.8, z: 0 },
  ]
  let hands: [V3, V3] = [rest[0], rest[1]]
  const frames: Frame[] = []
  for (let n = 0; n < 2000 && mode !== 'back'; n++) {
    const next = workStop(mode as StopMode, timer, DT, span)
    mode = next.mode
    timer = next.timer
    kneel = approach(kneel, next.kneels ? 1 : 0, 1 / VILLAGER_MOTION.kneelSeconds, DT)
    const head = { x: 0, y: 1.5 - 0.5 * kneel, z: 0.02 }
    const h = loadHandling(mode, timer, span)
    const placed = loadPlacement(h, head, hands, carry)
    const e = span - timer
    const phase: Frame['phase'] =
      mode === 'work'
        ? e < H.lowerSeconds
          ? 'kneel down'
          : e < H.lowerSeconds + H.releaseSeconds
            ? 'let go'
            : timer < H.gripSeconds
              ? 'grip'
              : 'work'
         : mode === 'back' ? 'walk' : (mode as Frame['phase'])
    frames.push({ mode, phase, base: placed.base, hands, hold: h.hold, down: h.down })
    // the hands drawn for the next frame: toward the planned grip, `lag` short
    const aim = gripPoints(placed.planned, carry)
    hands = [0, 1].map((i) => {
      const at = mixV(rest[i], aim[i], h.reach)
      return { x: at.x, y: at.y + lag * h.reach, z: at.z }
    }) as [V3, V3]
  }
  // and the first step of the walk home: the load back on the crown
  const head = { x: 0, y: 1.5, z: 0.02 }
  frames.push({ mode: 'back', phase: 'walk', base: loadPlacement(loadHandling('back', 0, span), head, hands, carry).base, hands, hold: 0, down: 0 })
  return frames
}

describe.each(['bundle', 'jar'] as const)('the task walker’s %s', (carry) => {
  const frames = simulate(carry)

  it('runs through every phase of the stop, the load placed in each', () => {
    const phases = new Set(frames.map((f) => f.phase))
    for (const p of ['take', 'kneel down', 'let go', 'work', 'grip', 'rise', 'settle', 'walk'] as const) expect(phases).toContain(p)
    for (const f of frames) {
      expect(Number.isFinite(f.base.x + f.base.y + f.base.z)).toBe(true)
      expect(f.base.y).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('never jumps: it moves continuously from frame to frame', () => {
    for (let i = 1; i < frames.length; i++) expect(dist(frames[i].base, frames[i - 1].base)).toBeLessThan(0.05)
  })

  it('stays in the hands while it is set down and picked up', () => {
    const g = loadGrip(carry)
    const carried = frames.filter((f) => (f.phase === 'kneel down' || f.phase === 'rise') && f.hold === 1)
    expect(carried.length).toBeGreaterThan(30)
    for (const f of carried) {
      const centre = { x: f.base.x, y: f.base.y + g.y, z: f.base.z }
      const mid = mixV(f.hands[0], f.hands[1], 0.5)
      expect(dist(centre, mid)).toBeLessThan(0.02)
      // each palm against its side of the load
      for (const hand of f.hands) expect(Math.abs(Math.abs(hand.x - f.base.x) - g.half - H.gripClearance)).toBeLessThan(0.02)
    }
  })

  it('follows hands that fall short of their aim rather than the plan', () => {
    const g = loadGrip(carry)
    for (const f of simulate(carry, 0.06).filter((x) => x.hold === 1)) {
      const mid = mixV(f.hands[0], f.hands[1], 0.5)
      expect(dist({ x: f.base.x, y: f.base.y + g.y, z: f.base.z }, mid)).toBeLessThan(1e-9)
    }
  })

  it('stands on the ground beside the kneeling walker while it works', () => {
    const work = frames.filter((f) => f.phase === 'work')
    expect(work.length).toBeGreaterThan(60)
    for (const f of work) {
      expect(f.base).toEqual(LOAD_GROUND)
      expect(f.hold).toBe(0)
    }
    // clear of the body, within its arms' reach
    expect(Math.hypot(LOAD_GROUND.x, LOAD_GROUND.z)).toBeGreaterThan(0.3)
  })

  it('is back on the crown, untouched by the hands, once it walks home', () => {
    const last = frames.at(-1)!
    expect(last.base).toEqual({ x: 0, y: 1.5, z: 0.02 })
    expect(frames.at(-2)!.hold).toBeLessThan(0.05)
  })
})

describe('the arms aimed at the load', () => {
  it('point each arm from its shoulder at its grip', () => {
    for (const kneel of [0, 0.5, 1]) {
      for (const target of [{ x: 0.3, y: 0.15, z: 0.35 }, { x: -0.1, y: 1.1, z: 0.05 }]) {
        for (const i of [0, 1] as const) {
          const { arm } = aimArm(i, target, kneel)
          const bodyH = 1 - 0.45 * kneel
          const squash = 1 - 0.25 * kneel
          const s = { x: (i === 0 ? 1 : -1) * bodyH * FIGURE_LIMBS.shoulderX, y: bodyH * FIGURE_LIMBS.shoulderY * squash, z: 0 }
          const d = armDirection(arm)
          // the virtual arm's direction, squashed as the kneeling rig draws it
          const drawn = { x: d[0], y: d[1] * squash, z: d[2] }
          const want = { x: target.x - s.x, y: target.y - s.y, z: target.z - s.z }
          const cos = (drawn.x * want.x + drawn.y * want.y + drawn.z * want.z) / (Math.hypot(drawn.x, drawn.y, drawn.z) * Math.hypot(want.x, want.y, want.z))
          expect(cos).toBeGreaterThan(0.9999)
        }
      }
    }
  })

  it('leaves the walking pose untouched when the hands are free', () => {
    const pose: FigurePose = { left: { pitch: 1, yaw: 1, roll: 1 }, right: { pitch: 1, yaw: 1, roll: 1 }, lean: 0.3, turn: 0.2, reach: { left: 0.5 } }
    const zero = { x: 0, y: 0, z: 0 }
    handlingPose(pose, { down: 0, hold: 0, reach: 0 }, [zero, zero], 0)
    expect(pose.left).toEqual(REST_POSE.left)
    expect(pose.right).toEqual(REST_POSE.right)
    expect(pose.lean).toBe(0)
    expect(pose.reach).toBeUndefined()
  })
})

it('never hides the load: TaskWalker sets no visibility on it', () => {
  const src = readFileSync('src/scenes/place/PlaceLife.tsx', 'utf8')
  const body = src.slice(src.indexOf('function TaskWalker('), src.indexOf('interface HomeDef'))
  expect(body.length).toBeGreaterThan(1000)
  expect(body).not.toMatch(/load\.current\.visible|visible=\{false\}\s*>\s*<mesh/)
})
