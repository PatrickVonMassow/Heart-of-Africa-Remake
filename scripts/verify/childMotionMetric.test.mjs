// The children's motion metric itself (work-order 656). It is the shared
// definition BOTH gates judge by — the live browser check and the replay test —
// so what it can and cannot see is pinned here, on traces built by hand where
// the right answer is known before the measurement is taken.
import { describe, expect, it } from 'vitest'
import {
  CHILD_MOTION,
  groundPath,
  holdsAGame,
  judgedEnough,
  rescueRate,
  shuffleWindows,
  traceLiveness,
} from './childMotionMetric.mjs'

const DT = 1 / 60

/** A trace of one child from a function of the frame index. The game's own play
 *  counters ride along: `playing(i)` says whether the round was ON for the step
 *  that frame RECORDS, which is the step taken before it. */
function trace(frames, at, playing = () => true) {
  const out = []
  let walked = 0
  let walkedWhilePlaying = 0
  let playedClock = 0
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
    if (i > 0 && playing(i)) {
      playedClock += DT
      walkedWhilePlaying += step.rescue ? 0 : Math.hypot(step.x - x, step.z - z)
    }
    x = step.x
    z = step.z
    out.push({
      clock: i * DT,
      x,
      z,
      walked,
      walkedWhilePlaying,
      playedClock,
      carried,
      nudges,
      playing: playing(i),
    })
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

describe('the gate reads the WORST child, not the average one', () => {
  /**
   * SOL'S CONSTRUCTION (third cross-vendor review). Four children. ONE of them
   * snags for six tenths of a second, is picked up — and set down where it
   * stood, so nothing is carried — and does it again three seconds later, twenty
   * times a minute. The other three play. Every aggregate reads clean: the
   * group's rescue rate is a quarter of that child's, the group's share is
   * nothing at all because each of its bad windows ends in the rescue that makes
   * the window unjudgeable, and the group's judged share is near nine tenths.
   */
  const CYCLE = 180 // frames — three seconds
  const SNAG = 36 // of them spent going nowhere, then the settlement frees it
  const snagged = () =>
    trace(3600, (i, at) => {
      if (i > 0 && i % CYCLE === 0) return { x: at.x, z: 0, rescue: true } // freed where it stands
      return i % CYCLE >= CYCLE - SNAG
        ? { x: at.x + (Math.floor(i / 8) % 2 === 0 ? 0.025 : -0.025), z: 0 } // pacing on the spot
        : { x: at.x + 1.5 * DT, z: 0 } // walking properly
    })
  const walker = () => trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 }))
  const group = () => [snagged(), walker(), walker(), walker()]

  it('shows the group of four as clean, which is what it looks like', () => {
    const r = shuffleWindows(group())
    const rescues = rescueRate(group())
    expect(r.share).toBeLessThan(CHILD_MOTION.shareGate) // no shuffle to be seen
    expect(r.judgedShare).toBeGreaterThan(0.8) // and plenty of trace to see it in
    expect(rescues.perChildMinute).toBeLessThan(CHILD_MOTION.rescueGate) // 5 against 6
    expect(rescues.carriedMetresPerChildMinute).toBe(0) // nobody moved an inch
  })

  it('and the child itself as the finding it is', () => {
    const r = shuffleWindows(group())
    const rescues = rescueRate(group())
    // Two thirds of that child's minute is spent in windows that end in a
    // rescue, so no verdict on it can be given at all.
    expect(r.leastJudged).toBeLessThan(0.8)
    expect(r.leastJudgedChild).toBe(0)
    expect(r.perChild[1].judgedShare).toBeGreaterThan(0.95) // its siblings are fine
    // And it is picked up every three seconds — nineteen times in this minute,
    // on its own clock, against a gate of six.
    expect(rescues.worstPerChildMinute).toBeGreaterThan(CHILD_MOTION.rescueGate)
    expect(rescues.perChild[0].perMinute).toBeCloseTo(19, 0)
    expect(rescues.perChild[1].perMinute).toBe(0)
    expect(rescues.worstRescueChild).toBe(0)
  })

  it('and each maximum names the child it actually belongs to', () => {
    // Three questions, three answers, and they need not agree: one child is
    // picked up most OFTEN in absolute count over a long trace, another at the
    // highest RATE over a short one, a third is CARRIED furthest. Printed under
    // a single index, the diagnostic named the wrong child for two of them.
    const often = trace(3600, (i, at) => (i > 0 && i % 600 === 0 ? { x: at.x, z: 0, rescue: true } : at)) // 5 in a minute
    const fast = trace(300, (i, at) => (i > 0 && i % 100 === 0 ? { x: at.x, z: 0, rescue: true } : at)) // 2 in 5 s = 24/min
    const carried = trace(3600, (i, at) => (i === 600 ? { x: at.x + 9, z: 0, rescue: true } : at)) // one long carry
    const r = rescueRate([often, fast, carried])
    expect(r.worstChild).toBe(0) // most rescues in all: five
    expect(r.worstRescueChild).toBe(1) // highest rate: twenty-four a minute
    expect(r.worstCarriedChild).toBe(2) // furthest carried: nine metres
    expect(r.worstPerChildMinute).toBeGreaterThan(20)
    expect(r.worstCarriedMetresPerChildMinute).toBeCloseTo(9, 0)
  })
})

/** SOL'S INTERMITTENT SNAG: six tenths of a second pacing on the spot, half a
 *  second standing, over and over — the user's own "die Kinder hängen KURZ
 *  fest", and the shape the one-second window cannot see. */
function burstTrace(step) {
  const t = []
  let walked = 0
  let x = 0
  for (let i = 0; i < 3600; i++) {
    if (i % 66 < 36) {
      const d = Math.floor(i / 6) % 2 === 0 ? step : -step
      x += d
      walked += Math.abs(d)
    }
    t.push({
      clock: i * DT,
      x,
      z: 0,
      walked,
      walkedWhilePlaying: walked,
      playedClock: i * DT,
      carried: 0,
      nudges: 0,
      playing: true,
    })
  }
  return t
}

describe('a trace has to hold a game before it proves anything', () => {
  it('measures what was played and what was walked', () => {
    const walker = trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 })).map((s) => ({ ...s, playing: true }))
    const live = traceLiveness([walker, walker])
    expect(live.children).toBe(2)
    expect(live.seconds).toBeCloseTo(59.98, 1) // the group's clock, never the sum
    expect(live.playedShare).toBeCloseTo(1, 2)
    expect(live.walkedPerChildMinute).toBeCloseTo(90, 0) // 1.5 m/s
  })

  it('and reports the QUIETEST child, not the group’s walking', () => {
    // THE ONE FLOOR AMONG THE CEILINGS. Three children playing and one standing
    // perfectly still: the statue clears every upper bound there is — it
    // shuffles nowhere, is never stuck, is never carried, and its trace is
    // judgeable end to end — and the group's walking hides it, three quarters
    // of four still being plenty.
    const walker = () => trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 })).map((s) => ({ ...s, playing: true }))
    const statue = () => trace(3600, () => ({ x: 0, z: 0 })).map((s) => ({ ...s, playing: true }))
    const live = traceLiveness([walker(), walker(), walker(), statue()])
    expect(live.walkedPerChildMinute).toBeGreaterThan(CHILD_MOTION.walkFloor) // the group looks busy
    expect(live.quietestWalkedPerPlayedMinute).toBe(0) // and one of them never moved
    expect(live.quietestChild).toBe(3)
    expect(live.perChild[0].walkedPerMinute).toBeCloseTo(90, 0)
    expect(holdsAGame(live)).toBe(false) // and the live gate refuses the group
  })

  it('and the live gate REFUSES four children standing still', () => {
    // SOL'S LIVE CONSTRUCTION (fourth cross-vendor review), which the live
    // section passed on every check it made: four children that report
    // themselves as playing and never move. Nothing walked is nothing shuffled,
    // nothing stuck and nothing carried, and the trace is judgeable end to end,
    // so every ceiling was satisfied — by a settlement standing perfectly still.
    const statue = () => trace(420, () => ({ x: 0, z: 0 })).map((s) => ({ ...s, playing: true }))
    const still = traceLiveness([statue(), statue(), statue(), statue()])
    expect(still.playedShare).toBeCloseTo(1, 6) // it says it played the whole seven seconds
    expect(shuffleWindows([statue(), statue(), statue(), statue()]).share).toBe(0)
    expect(rescueRate([statue(), statue(), statue(), statue()]).worstPerChildMinute).toBe(0)
    expect(holdsAGame(still)).toBe(false) // and it is refused, on the legs
    // A trace of the same shape in which they really play is accepted.
    const walker = () =>
      trace(420, (i) => ({ x: i * DT * 1.5, z: 0 })).map((s) => ({ ...s, playing: true }))
    expect(holdsAGame(traceLiveness([walker(), walker(), walker(), walker()]))).toBe(true)
  })

  it('and the SHORT burst the one-second window cannot see', () => {
    // SOL'S INTERMITTENT TRACE (sixth cross-vendor review), and it is the user's
    // own report: "die Kinder hängen KURZ fest". Six tenths of a second pacing
    // on the spot at a full walking pace, half a second standing, over and over.
    // It walks 49 m per played minute, so the floor is satisfied; and no
    // one-second window it lies in ever collects the metre of walking `minPath`
    // asks for, so the long measure sees nothing at all. The half-second measure
    // reads 18 % of the child's judged time.
    const paced = burstTrace(0.025) // a full walking pace
    const live = traceLiveness([paced, paced])
    expect(live.quietestWalkedPerPlayedMinute).toBeGreaterThan(CHILD_MOTION.walkFloor)
    expect(holdsAGame(live)).toBe(true) // the legs moved, and the round was on
    expect(shuffleWindows([paced]).worstShare).toBe(0) // the one-second window: nothing
    const short = shuffleWindows([paced], CHILD_MOTION.short)
    expect(short.worstShare).toBeGreaterThan(CHILD_MOTION.shareGate * 20)
    // At the chase's own floor pace too, which is the slowest it can happen at.
    expect(shuffleWindows([burstTrace(0.0193)], CHILD_MOTION.short).worstShare).toBeGreaterThan(
      CHILD_MOTION.shareGate * 20,
    )
    // AND ORDINARY WALKING IS NOT CAUGHT BY IT. A child walking its line, and
    // one turning right round once inside the half second — the legitimate turn
    // the ratio is calibrated to allow.
    const straight = trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 }))
    const turning = trace(3600, (i) => ({ x: (Math.floor(i / 30) % 2 === 0 ? 1 : -1) * 0.4, z: 0 }))
    expect(shuffleWindows([straight], CHILD_MOTION.short).worstShare).toBe(0)
    expect(shuffleWindows([turning], CHILD_MOTION.short).worstShare).toBe(0)
  })

  it('and a trace too coarse for the burst window is refused, not read as clean', () => {
    // THE VACUUM THE BURST HALF LEFT (seventh cross-vendor review). At a sample
    // every 0.6 s the one-second windows are still judgeable, but every
    // half-second window ends inside a gap longer than itself and is refused —
    // so the burst measure judged NOTHING and reported a share of 0, which reads
    // exactly like a clean bill. The trace below is the intermittent snag, so
    // "clean" would be a lie about a settlement that really is shuffling.
    const paced = burstTrace(0.025)
    const coarse = [paced.filter((_, i) => i % 36 === 0)] // 0.6 s apart
    const short = shuffleWindows(coarse, CHILD_MOTION.short)
    expect(short.seconds).toBe(0)
    expect(short.share).toBe(0) // and this is why a share alone proves nothing
    expect(short.leastJudged).toBe(0)
    expect(judgedEnough(short)).toBe(false)
    // The one-second measure DOES still judge that trace, which is what made the
    // hole invisible: half the verdict looked fine because the other half was.
    expect(judgedEnough(shuffleWindows(coarse))).toBe(true)
    // Sampled finely, the same trace is judged by both and the burst one bites.
    expect(judgedEnough(shuffleWindows([paced], CHILD_MOTION.short))).toBe(true)
    expect(shuffleWindows([paced], CHILD_MOTION.short).worstShare).toBeGreaterThan(
      CHILD_MOTION.shareGate,
    )
  })

  it('is a STATUE detector — the walking defect is caught by the share', () => {
    // WHAT THE FLOOR CANNOT DO, measured rather than assumed. A child pacing at
    // a full walking pace inside a fifth of a metre is the reported defect, and
    // its legs move exactly as much as a healthy child's: it sails over the
    // floor and `holdsAGame` accepts the group. The companion measure is what
    // refuses it — the per-child shuffle share, which reads 100 % of its judged
    // time. (In the settlement itself the same pair reads 109.6 m per played
    // minute and 1.94 %; that case is in the replay test beside the pen.)
    const pacing = trace(3600, (i, at) => ({
      x: at.x + (Math.floor(i / 8) % 2 === 0 ? 0.025 : -0.025),
      z: 0,
    })).map((s) => ({ ...s, playing: true }))
    const walker = trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 })).map((s) => ({ ...s, playing: true }))
    const live = traceLiveness([pacing, walker, walker, walker])
    expect(live.perChild[0].walkedPerPlayedMinute).toBeGreaterThan(CHILD_MOTION.walkFloor * 3)
    expect(holdsAGame(live)).toBe(true) // the legs moved, so this bar says nothing
    const r = shuffleWindows([pacing, walker, walker, walker])
    expect(r.worstShare).toBeGreaterThan(CHILD_MOTION.shareGate) // and this one refuses it
    expect(r.worstShareChild).toBe(0)
    expect(r.perChild[1].share).toBe(0) // its siblings are fine, and are not blamed
  })

  it('and demands the walking happen WHILE the game is played', () => {
    // SOL'S DISJOINT TRACE (fifth cross-vendor review). Two children walk thirty
    // metres during a twenty-nine-second stretch that is NOT play, then stand
    // perfectly still through thirty-one seconds that are. Walking and playing
    // were counted over different parts of the trace, so both bars were
    // satisfied at once — by a group that never took a step while the game was
    // on. The counters below are the settlement's own, so the question is not
    // reconstructed from anything.
    const playing = (i) => i * DT >= 29
    const before = trace(3600, (i, at) => (playing(i) ? at : { x: at.x + 1.5 * DT, z: 0 }), playing)
    const during = trace(3600, (i, at) => (playing(i) ? { x: at.x + 1.5 * DT, z: 0 } : at), playing)
    const idleGame = traceLiveness([before, before])
    expect(idleGame.playedShare).toBeGreaterThan(CHILD_MOTION.playedGate) // it says it played
    expect(idleGame.walkedPerChildMinute).toBeGreaterThan(CHILD_MOTION.walkFloor) // and it walked
    expect(idleGame.perChild[0].walked).toBeGreaterThan(40) // really walked, over the trace
    expect(idleGame.quietestWalkedPerPlayedMinute).toBe(0) // but not one step of it in play
    expect(holdsAGame(idleGame)).toBe(false)
    // The same trace with the walking inside the played stretch is a game.
    const played = traceLiveness([during, during])
    expect(played.quietestWalkedPerPlayedMinute).toBeGreaterThan(CHILD_MOTION.walkFloor)
    expect(holdsAGame(played)).toBe(true)
  })

  it('and takes the metres from the GAME where the flag flips at the step', () => {
    // THE TRANSITION ITSELF (sixth cross-vendor review). A frame's movement is
    // recorded at the sample AFTER it happened, so a watcher that classifies
    // that step by the `playing` flag of an endpoint credits the wrong side of
    // every frame the round turns over on. Here the round is on for two frames
    // in three and the child walks ONLY on the third — never while playing — and
    // each of those walking steps is recorded at a sample whose predecessor says
    // "playing". The settlement's counter says nothing was walked in play; the
    // reconstruction says all of it was.
    const played = (i) => i % 3 !== 0
    const t = trace(3600, (i, at) => (played(i) ? at : { x: at.x + 0.025, z: 0 }), played)
    const walkedAt = t.findIndex((s, i) => i > 0 && s.walked > t[i - 1].walked)
    expect(t[walkedAt].playing).toBe(false) // the step was taken with the round off
    expect(t[walkedAt - 1].playing).toBe(true) // and the sample before it says otherwise
    // What the flag-based reading made of it, on this very trace: every metre
    // credited to play.
    let reconstructed = 0
    for (let i = 0; i < t.length - 1; i++) {
      if (t[i].playing) reconstructed += t[i + 1].walked - t[i].walked
    }
    expect(reconstructed).toBeCloseTo(t[t.length - 1].walked - t[0].walked, 6)
    const live = traceLiveness([t, t])
    expect(live.playedShare).toBeGreaterThan(CHILD_MOTION.playedGate) // it really did play
    expect(live.walkedPerChildMinute).toBeGreaterThan(CHILD_MOTION.walkFloor) // and really walked
    expect(live.quietestWalkedPerPlayedMinute).toBe(0) // but never while playing
    expect(holdsAGame(live)).toBe(false)
  })

  it('and refuses a trace that does not publish those counters at all', () => {
    // A missing counter is not "nothing walked while playing"; it is nothing
    // said, and it is refused as such.
    const bare = trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 })).map(
      ({ walkedWhilePlaying: _w, playedClock: _p, ...rest }) => rest,
    )
    const live = traceLiveness([bare, bare])
    expect(live.countersPublished).toBe(false)
    expect(holdsAGame(live)).toBe(false)
  })

  it('and it reads the played share off the CLOCK, not the frame count', () => {
    // Frames are not evenly spaced — this trace's own live frames run from 20 ms
    // to over a second — so a majority of the frames is not a majority of the
    // minute. Two thirds of these SAMPLES are playing and they hold a tenth of
    // the game.
    const t = []
    let clock = 0
    let walked = 0
    let playedClock = 0
    let walkedWhilePlaying = 0
    for (let i = 0; i < 300; i++) {
      const playing = i % 3 !== 0
      const dt = playing ? 0.01 : 0.18
      walked += 1.5 * dt
      if (playing) {
        playedClock += dt
        walkedWhilePlaying += 1.5 * dt
      }
      t.push({ clock, x: walked, z: 0, walked, walkedWhilePlaying, playedClock, carried: 0, nudges: 0, playing })
      clock += dt
    }
    const live = traceLiveness([t, t])
    expect(live.playedShare).toBeLessThan(0.15)
    expect(t.filter((s) => s.playing).length / t.length).toBeCloseTo(0.667, 2)
    expect(holdsAGame(live)).toBe(false)
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
    const unplayed = trace(3600, (i) => ({ x: i * DT * 1.5, z: 0 }), () => false)
    expect(traceLiveness([unplayed]).playedShare).toBe(0) // a round that never ran is no game
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

  it('and reads the WHOLE track for that, sample zero included', () => {
    // The check used to start at sample ONE, where the stepping loop starts, so
    // a track whose FIRST sample lacked the counter — the very sample every
    // difference below is measured from — was reported as fully published.
    const t = trace(600, (i) => ({ x: i * DT, z: 0 }))
    const { carried: _drop, ...first } = t[0]
    expect(rescueRate([[first, ...t.slice(1)]]).carriedPublished).toBe(false)
    // And a track too short to hold a single step was skipped before the check
    // ran at all, so it passed for published as well.
    expect(rescueRate([[{ clock: 0, nudges: 0 }]]).carriedPublished).toBe(false)
    // Nor does silence count: no samples at all is not "nothing was carried".
    expect(rescueRate([]).carriedPublished).toBe(false)
    expect(rescueRate([[]]).carriedPublished).toBe(false)
    // A short track that DOES publish is published — the rule is the counter,
    // not the length.
    expect(rescueRate([[{ clock: 0, nudges: 0, carried: 0 }]]).carriedPublished).toBe(true)
  })

  it('reports nothing for a trace too short to judge', () => {
    expect(rescueRate([[]]).perChildMinute).toBe(0)
    expect(rescueRate([]).rescues).toBe(0)
  })
})
