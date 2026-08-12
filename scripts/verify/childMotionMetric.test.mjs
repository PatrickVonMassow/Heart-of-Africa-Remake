// The children's motion metric itself (work-order 656). It is the shared
// definition BOTH gates judge by — the live browser check and the replay test —
// so what it can and cannot see is pinned here, on traces built by hand where
// the right answer is known before the measurement is taken.
import { describe, expect, it } from 'vitest'
import { CHILD_MOTION, groundPath, rescueRate, shuffleWindows } from './childMotionMetric.mjs'

const DT = 1 / 60

/** A trace of one child from a function of the frame index. */
function trace(frames, at) {
  const out = []
  let walked = 0
  let x = 0
  let z = 0
  let nudges = 0
  for (let i = 0; i < frames; i++) {
    const step = at(i, { x, z })
    // A walked step moves the child AND adds to `walked`; a rescue moves it and
    // does not — exactly as the game keeps them apart.
    if (step.rescue) nudges++
    else walked += Math.hypot(step.x - x, step.z - z)
    x = step.x
    z = step.z
    out.push({ clock: i * DT, x, z, walked, nudges })
  }
  return out
}

describe('the walked distance is the game’s own', () => {
  it('passes a child that walks in a straight line', () => {
    const t = trace(600, (i) => ({ x: i * DT * 1.5, z: 0 }))
    const r = shuffleWindows([t])
    expect(r.windows).toBeGreaterThan(400)
    expect(r.bad).toBe(0)
  })

  it('catches a child that paces to and fro over a hand’s breadth', () => {
    // 1.5 m/s of walking inside 0.2 m of ground: the complaint itself.
    const t = trace(600, (i) => ({ x: (Math.floor(i / 8) % 2 === 0 ? 1 : -1) * 0.1, z: 0 }))
    const r = shuffleWindows([t])
    expect(r.windows).toBeGreaterThan(400)
    expect(r.share).toBeGreaterThan(0.9)
    expect(r.worst.out).toBeLessThan(CHILD_MOTION.circle)
  })

  it('does not count a teleport as walking', () => {
    // The child stands still and is carried three metres. Nothing walked, so
    // nothing is judged — and nothing is credited to it either.
    const t = trace(600, (i) => (i === 300 ? { x: 3, z: 0, rescue: true } : { x: i < 300 ? 0 : 3, z: 0 }))
    const r = shuffleWindows([t])
    expect(r.bad).toBe(0)
    expect(t[599].walked).toBe(0)
  })

  it('and does not let a teleport count as ground the child covered', () => {
    // The wedge the old gate could not see: pacing over 0.2 m, picked up every
    // 90 frames and set down a metre away. The RAW positions leave the circle,
    // so a check that watched them saw a child getting somewhere.
    const t = trace(600, (i, at) => {
      if (i > 0 && i % 90 === 0) return { x: at.x + 1, z: 0, rescue: true }
      return { x: at.x + (Math.floor(i / 8) % 2 === 0 ? 0.02 : -0.02), z: 0 }
    })
    const raw = shuffleWindows([t.map((s) => ({ ...s, nudges: 0 }))])
    const corrected = shuffleWindows([t])
    expect(raw.share).toBeLessThan(corrected.share)
    expect(corrected.share).toBeGreaterThan(0.5)
  })

  it('leaves the tail of a trace alone when it is shorter than one window', () => {
    const t = trace(30, () => ({ x: 0, z: 0 })) // half a second in all
    expect(shuffleWindows([t]).windows).toBe(0)
  })

  it('freezes the ground path only across the rescue frame', () => {
    const t = trace(4, (i, at) => (i === 2 ? { x: 5, z: 0, rescue: true } : { x: at.x + 1, z: 0 }))
    expect(groundPath(t).x).toEqual([1, 2, 2, 3])
  })
})

describe('the rescues are counted on their own account', () => {
  it('reports them per child and minute of game clock', () => {
    // Two children, one minute each: one rescued twice, one never.
    const wedged = trace(3600, (i, at) => (i > 0 && i % 1200 === 0 ? { x: at.x + 1, z: 0, rescue: true } : at))
    const free = trace(3600, (i) => ({ x: i * DT, z: 0 }))
    const r = rescueRate([wedged, free])
    expect(r.rescues).toBe(2)
    expect(r.childMinutes).toBeCloseTo(2, 1)
    expect(r.perChildMinute).toBeCloseTo(1, 1)
    expect(r.worstChild).toBe(0)
    expect(r.worstRescues).toBe(2)
  })

  it('reports nothing for a trace too short to judge', () => {
    expect(rescueRate([[]]).perChildMinute).toBe(0)
    expect(rescueRate([]).rescues).toBe(0)
  })
})
