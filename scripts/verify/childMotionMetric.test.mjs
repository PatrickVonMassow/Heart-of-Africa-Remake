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

/** The same recorded trace seen by a slower or an unevener renderer: the samples
 *  are the game's own state at those moments, only fewer of them. Nothing about
 *  the motion changes — which is exactly what makes it a test of the MEASURE. */
function resample(track, next) {
  const out = []
  for (let i = 0; i < track.length; i = next(i)) out.push(track[i])
  return out
}

/** A cadence that jitters between `min` and `max` frames, deterministically. */
function jitter(min, max, seed) {
  let s = seed >>> 0
  return (i) => {
    s = (s * 1664525 + 1013904223) >>> 0
    return i + min + ((s >>> 8) % (max - min + 1))
  }
}

/** A child that paces over 0.2 m of ground, walks away for a third of the trace
 *  and then paces again — all of it at the same 1.5 m/s, so the trace's true
 *  answer is known: two thirds of the game time is walked without getting
 *  anywhere. */
function mixed(seconds) {
  const third = Math.round(seconds / 3 / DT)
  return trace(third * 3, (i, at) =>
    Math.floor(i / third) === 1
      ? { x: at.x + 1.5 * DT, z: 0 }
      : { x: at.x + (Math.floor(i / 8) % 2 === 0 ? 0.025 : -0.025), z: 0 },
  )
}

describe('the windows carry equal weight in game time', () => {
  it('judges a sparsely sampled trace to its end instead of dropping it', () => {
    // 60 s of walking, seen at 1.4 frames a second — sparser than the one-second
    // window. Every window is then shorter than a single sample gap, which used
    // to be read as "the tail is too short" and threw the whole trace away at
    // its first window.
    const sparse = resample(
      trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 })),
      (i) => i + 42,
    )
    const r = shuffleWindows([sparse])
    expect(sparse.length).toBe(86)
    expect(r.windows).toBeGreaterThan(70)
    expect(r.seconds).toBeCloseTo(59, 0) // the whole trace bar its last window
    expect(r.bad).toBe(0)
  })

  it('weighs a slow stretch by its game time, not by its frame count', () => {
    // The same 120 s of game seen by a renderer that ran ten times faster while
    // the child shuffled than while it walked. Half the GAME is a shuffle; nine
    // tenths of the FRAMES are.
    const fine = trace(7200, (i, at) =>
      i < 3600
        ? { x: (Math.floor(i / 8) % 2 === 0 ? 1 : -1) * 0.1, z: 0 }
        : { x: at.x + 1.5 * DT, z: 0 },
    )
    const uneven = resample(fine, (i) => (i < 3600 ? i + 1 : i + 10))
    const r = shuffleWindows([uneven])
    expect(r.bad / r.windows).toBeGreaterThan(0.85) // what a per-sample count says
    expect(r.share).toBeGreaterThan(0.45) // and what the game time says
    expect(r.share).toBeLessThan(0.55)
  })

  it('gives one recorded trace the same share at any cadence', () => {
    // THE INVARIANCE ITSELF. One recorded trace, resampled six ways — evenly at
    // 60, 20 and 7.5 frames a second, and irregularly at cadences that swing by
    // a factor of eight and of thirty, which is the spread a headless frame
    // really shows. TOLERANCE: every share within 0.02 of the 60 fps reading.
    // Measured, 0.6517 at 60 fps: 0.6517 / 0.6516 / 0.6525 / 0.6511 / 0.6549 —
    // a spread of 0.004, where the same six traces counted ONE WINDOW PER SAMPLE
    // spread 0.034, nine times as far. The band is wider than the measurement
    // because the coarsest cadence can miss the peak of an excursion between two
    // samples; it is far tighter than the gate it protects.
    const fine = mixed(60)
    const cadences = [
      ['60 fps', (i) => i + 1],
      ['20 fps', (i) => i + 3],
      ['7.5 fps', (i) => i + 8],
      ['1-8 frames', jitter(1, 8, 12345)],
      ['2-12 frames', jitter(2, 12, 777)],
      ['1-30 frames', jitter(1, 30, 99)],
    ]
    const shares = cadences.map(([, next]) => shuffleWindows([resample(fine, next)]).share)
    const base = shares[0]
    expect(base).toBeGreaterThan(0.6) // there is a real share to be invariant ABOUT
    for (const s of shares) expect(Math.abs(s - base)).toBeLessThan(0.02)
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
