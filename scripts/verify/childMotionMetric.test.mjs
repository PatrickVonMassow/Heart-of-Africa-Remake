// The children's motion metric itself (work-order 656). It is the shared
// definition BOTH gates judge by — the live browser check and the replay test —
// so what it can and cannot see is pinned here, on traces built by hand where
// the right answer is known before the measurement is taken.
import { describe, expect, it } from 'vitest'
import {
  CHILD_MOTION,
  groundPath,
  rescueRate,
  shuffleWindows,
  traceLiveness,
} from './childMotionMetric.mjs'

const DT = 1 / 60

/** A trace of one child from a function of the frame index. */
function trace(frames, at) {
  const out = []
  let walked = 0
  let carried = 0
  let x = 0
  let z = 0
  let nudges = 0
  for (let i = 0; i < frames; i++) {
    const step = at(i, { x, z })
    // A walked step moves the child AND adds to `walked`; a rescue moves it and
    // adds to `carried` instead — exactly as the game keeps them apart.
    if (step.rescue) {
      nudges++
      carried += Math.hypot(step.x - x, step.z - z)
    } else walked += Math.hypot(step.x - x, step.z - z)
    x = step.x
    z = step.z
    out.push({ clock: i * DT, x, z, walked, carried, nudges })
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

  it('and never credits a carry as ground covered, at any cadence', () => {
    // THE CASE THE RECONSTRUCTION GOT WRONG (second cross-vendor review). Sampled
    // every half second, ONE gap holds both a metre of pacing — which ends where
    // it began — and a 0.8 m carry. `walked` is a scalar, so nothing in it says
    // which way the legs went, and crediting the gap's own vector as ground
    // covered would read as a child that got 0.8 m somewhere: the shuffle
    // HIDDEN by the correction that ended it. The gap is a break instead, and
    // the windows across it are unjudged.
    const t = []
    let walked = 0
    let base = 0
    let nudges = 0
    for (let i = 0; i <= 24; i++) {
      const clock = i * 0.5
      if (i > 0) walked += 0.75 // 1.5 m/s of pacing, all of it inside 0.1 m
      if (clock === 6) {
        base += 0.8 // carried clear, and it goes on pacing where it was put
        nudges++
      }
      t.push({ clock, x: base + (i % 2 === 0 ? 0 : 0.1), z: 0, walked, nudges })
    }
    const r = shuffleWindows([t])
    expect(r.share).toBe(1) // every judged window is the shuffle it really is
    // The two half-second windows that span the break, plus the half-second
    // tail: 1.5 s of the twelve, and every second of it named as unjudged.
    expect(r.unjudged).toBeCloseTo(1.5, 6)
    // AND WHAT CREDITING THE VECTOR WOULD HAVE SAID, on the very same trace:
    // the carry reads as ground covered and those windows come out CLEAN.
    const asCredited = shuffleWindows([t.map((s) => ({ ...s, nudges: 0 }))])
    expect(asCredited.share).toBeLessThan(1)
    expect(asCredited.windows).toBeGreaterThan(r.windows)
  })

  it('calls a sample whose numbers are not numbers UNJUDGEABLE, never clean', () => {
    // The vacuum this closes: NaN loses every comparison it is in, so `out <
    // circle` came out false, every window counted as judged and GOOD, and
    // `judgedShare` climbed towards 1 on a trace that says nothing at all — a
    // clean bill of health from numbers nobody can read. Valid clocks and a
    // valid, rising walked distance, and not one usable coordinate.
    const t = []
    for (let i = 0; i < 600; i++) t.push({ clock: i * DT, x: NaN, z: 0, walked: i * 0.025, nudges: 0 })
    const r = shuffleWindows([t])
    expect(r.windows).toBe(0)
    expect(r.seconds).toBe(0)
    expect(r.judgedShare).toBe(0)
    expect(r.unjudged).toBeCloseTo(9.98, 1) // and the trace is accounted for
  })

  it('and one unreadable sample does not carry the rest of the trace with it', () => {
    // A single bad coordinate used to poison every LATER position — the ground
    // path is cumulative, and `px += NaN` stays NaN for good — so the whole
    // remainder read clean. It is a break now: the windows that touch it are
    // refused and the ones after it are judged again.
    const t = trace(600, (i) => ({ x: i * DT * 1.5, z: 0 }))
    const holed = t.map((s, i) => (i === 300 ? { ...s, x: NaN } : s))
    const r = shuffleWindows([holed])
    expect(Number.isFinite(r.share)).toBe(true)
    expect(r.seconds).toBeGreaterThan(7) // most of it still judged
    expect(r.judgedShare).toBeLessThan(shuffleWindows([t]).judgedShare)
    expect(r.bad).toBe(0)
  })

  it('and a clock that is not a number leaves the whole track unjudged', () => {
    const t = trace(600, (i) => ({ x: i * DT * 1.5, z: 0 })).map((s, i) =>
      i === 200 ? { ...s, clock: NaN } : s,
    )
    const r = shuffleWindows([t])
    expect(r.windows).toBe(0)
    expect(r.judgedShare).toBe(0)
    expect(r.covered).toBeCloseTo(9.98, 1)
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

  it('lets no single verdict stand for a silence longer than the window', () => {
    // THE COUNTEREXAMPLE, verbatim: two samples ten seconds apart. Whatever
    // happened in between, ONE classification used to be charged all ten
    // seconds of it — nine that no window had looked at and one that is the
    // tail no window can reach. Both readings of that shape are refused: the
    // one that would look filthy (20 m walked, back where it started) and the
    // one that would look spotless (20 m walked, 20 m away). A trace of holes
    // is not allowed to be evidence either way.
    const at = (clock, x, walked) => ({ clock, x, z: 0, walked, nudges: 0 })
    const wouldLookBad = shuffleWindows([[at(0, 0, 0), at(10, 0, 20)]])
    const wouldLookGood = shuffleWindows([[at(0, 0, 0), at(10, 20, 20)]])
    for (const r of [wouldLookBad, wouldLookGood]) {
      expect(r.windows).toBe(0)
      expect(r.seconds).toBe(0)
      expect(r.share).toBe(0)
      expect(r.judgedShare).toBe(0)
      expect(r.unjudged).toBeCloseTo(10, 6)
    }
  })

  it('and refuses the window whose far end falls inside a long gap', () => {
    // Samples at 0, 0.5 and 5 s. The window at 0 s ends inside a four-and-a-half
    // second silence, so its far end could only be invented: unjudged, and the
    // 0.5 s it would have spoken for is booked as such. What remains is the
    // tail — the whole trace, judged nowhere.
    const at = (clock, x, walked) => ({ clock, x, z: 0, walked, nudges: 0 })
    const r = shuffleWindows([[at(0, 0, 0), at(0.5, 0, 3), at(5, 0.1, 9)]])
    expect(r.windows).toBe(0)
    expect(r.judgedShare).toBe(0)
    expect(r.covered).toBeCloseTo(5, 6)
  })

  it('and says how much of a holey trace it could judge at all', () => {
    // Ten seconds of real play with a five-second silence dropped in the middle
    // of it. The play is judged, the silence is not, and the caller can see the
    // difference: a gate on `judgedShare` is what stops a trace of holes from
    // proving anything.
    const dense = trace(300, (i) => ({ x: i * DT * 1.5, z: 0 })) // 5 s, walking
    const after = dense.map((s) => ({ ...s, clock: s.clock + 10 }))
    const r = shuffleWindows([[...dense, ...after]])
    expect(r.seconds).toBeGreaterThan(7)
    expect(r.judgedShare).toBeGreaterThan(0.45)
    expect(r.judgedShare).toBeLessThan(0.6)
    expect(shuffleWindows([dense]).judgedShare).toBeGreaterThan(0.75)
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

describe('a trace has to hold a game before it proves anything', () => {
  it('measures what was played and what was walked', () => {
    const walker = trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 })).map((s) => ({ ...s, playing: true }))
    const live = traceLiveness([walker, walker])
    expect(live.children).toBe(2)
    expect(live.seconds).toBeCloseTo(59.98, 1) // the group's clock, never the sum
    expect(live.playedShare).toBeCloseTo(1, 2)
    expect(live.walkedPerChildMinute).toBeCloseTo(90, 0) // 1.5 m/s
  })

  it('and refuses to read a trace whose numbers are not numbers', () => {
    // The same rule for the liveness helper: NaN loses its comparisons, so a
    // bar like "20 m per child-minute" would simply be false rather than
    // failing loudly. It is said outright instead.
    const broken = trace(600, (i) => ({ x: i * DT, z: 0 })).map((s) => ({ ...s, walked: NaN, playing: true }))
    expect(traceLiveness([broken]).numbersFinite).toBe(false)
    expect(traceLiveness([]).numbersFinite).toBe(false) // nothing said is not good news
    const good = trace(600, (i) => ({ x: i * DT, z: 0 })).map((s) => ({ ...s, playing: true }))
    expect(traceLiveness([good]).numbersFinite).toBe(true)
  })

  it('and reports an idle group as idle, whichever way it is idle', () => {
    // Both are traces every OTHER gate passes with full marks.
    const still = trace(3600, () => ({ x: 0, z: 0 })).map((s) => ({ ...s, playing: true }))
    expect(traceLiveness([still]).walkedPerChildMinute).toBe(0)
    expect(shuffleWindows([still]).share).toBe(0)
    const unplayed = trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 }))
    expect(traceLiveness([unplayed]).playedShare).toBe(0) // a missing flag is not a game
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
    // And how FAR it was carried, from the game's own counter: a metre each time.
    expect(r.carriedPublished).toBe(true)
    expect(r.carriedMetres).toBeCloseTo(2, 6)
    expect(r.carriedMetresPerChildMinute).toBeCloseTo(1, 1)
  })

  it('counts every rise of the counter, however many share one sample gap', () => {
    // A coarse trace: between two samples the settlement freed the child THREE
    // times and moved it 5 m in all. Read off the frame vector, that was one
    // carry of whatever the net displacement happened to be.
    const t = [
      { clock: 0, x: 0, z: 0, walked: 0, carried: 0, nudges: 0 },
      { clock: 30, x: 1, z: 0, walked: 4, carried: 5, nudges: 3 },
    ]
    const r = rescueRate([t])
    expect(r.rescues).toBe(3)
    expect(r.carriedMetres).toBeCloseTo(5, 6)
  })

  it('and sees a carry that the child’s own walking led back from', () => {
    // Carried two metres and walked the two metres back inside the same gap:
    // the positions say nothing happened, the game says it was carried.
    const t = [
      { clock: 0, x: 0, z: 0, walked: 0, carried: 0, nudges: 0 },
      { clock: 1, x: 0, z: 0, walked: 2, carried: 2, nudges: 1 },
    ]
    expect(rescueRate([t]).carriedMetres).toBeCloseTo(2, 6)
    expect(Math.hypot(t[1].x - t[0].x, t[1].z - t[0].z)).toBe(0) // what a watcher saw
  })

  it('and refuses to call a trace carry-free when the game never said', () => {
    // A missing counter is not good news. It is reported as unpublished, and
    // the gates demand the field rather than reading zero as a clean bill.
    const silent = trace(600, (i) => ({ x: i * DT, z: 0 })).map(({ carried: _drop, ...rest }) => rest)
    const r = rescueRate([silent])
    expect(r.carriedPublished).toBe(false)
    expect(r.carriedMetres).toBe(0)
  })

  it('reports nothing for a trace too short to judge', () => {
    expect(rescueRate([[]]).perChildMinute).toBe(0)
    expect(rescueRate([]).rescues).toBe(0)
  })
})
