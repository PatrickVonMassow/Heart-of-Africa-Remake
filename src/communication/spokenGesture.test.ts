// The gesture reaches exactly as far as the voice (work-order point 580). The
// invariant is swept across the whole range rather than probed at a few points:
// there must be NO distance at which a figure gestures while its utterance is
// neither heard nor raised over its head.
import { afterEach, describe, expect, it } from 'vitest'
import { balance } from '../config/balance'
import { gestureIfHeard, speechReach } from './spokenGesture'
import { GESTURE_DURATIONS, GESTURE_KINDS, REST_POSE, gesturePose } from '../render/gesture'

const RADIUS = balance.communication.hearingRadius

afterEach(() => {
  balance.communication.hearingRadius = RADIUS
})

/** Every distance the sweep judges: inside, at the rim, and well beyond it. */
function sweep(radius: number): number[] {
  const steps: number[] = []
  for (let d = 0; d <= radius * 3; d += radius / 40) steps.push(Number(d.toFixed(6)))
  steps.push(radius - 1e-9, radius, radius + 1e-9)
  return steps
}

describe('the one decision: a gesture carries no further than its utterance', () => {
  it('never gestures where nothing is heard, at any distance across the range', () => {
    for (const radius of [1, 4, RADIUS, 25]) {
      for (const distance of sweep(radius)) {
        const reach = speechReach(distance, radius)
        // The invariant of point 580, stated as it is verified.
        expect(reach.gesture && !reach.audible).toBe(false)
        const state = gestureIfHeard(distance, 'point', {}, radius)
        expect(state.kind !== null).toBe(reach.gesture)
      }
    }
  })

  it('hears and gestures up to the rim, and neither beyond it', () => {
    expect(speechReach(0)).toEqual({ audible: true, gesture: true })
    expect(speechReach(RADIUS)).toEqual({ audible: true, gesture: true })
    expect(speechReach(RADIUS + 0.01)).toEqual({ audible: false, gesture: false })
    expect(speechReach(RADIUS * 4)).toEqual({ audible: false, gesture: false })
  })

  it('an explicit radius wins over the balance value', () => {
    expect(speechReach(20, 25).gesture).toBe(true)
    expect(speechReach(20, 5).gesture).toBe(false)
  })

  it('follows the radius the debug menu sets, while the game runs', () => {
    balance.communication.hearingRadius = 2
    expect(speechReach(5).gesture).toBe(false)
    expect(gestureIfHeard(5, 'beckon').kind).toBe(null)
    balance.communication.hearingRadius = 50
    expect(speechReach(5).gesture).toBe(true)
    expect(gestureIfHeard(5, 'beckon').kind).toBe('beckon')
  })

  it('a radius of zero leaves only the figure the player stands on', () => {
    expect(speechReach(0, 0)).toEqual({ audible: true, gesture: true })
    expect(speechReach(0.01, 0)).toEqual({ audible: false, gesture: false })
  })

  it('refuses a nonsensical distance rather than gesturing on it', () => {
    for (const distance of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(speechReach(distance)).toEqual({ audible: false, gesture: false })
      expect(gestureIfHeard(distance, 'refuse').kind).toBe(null)
    }
  })
})

describe('the gesture a heard figure makes', () => {
  it('starts the kind it was asked for, with its own duration and aim', () => {
    for (const kind of GESTURE_KINDS) {
      const state = gestureIfHeard(1, kind, { bearing: 0.7, elevation: -0.2, phase: 1.1 })
      expect(state.kind).toBe(kind)
      expect(state.t).toBe(0)
      expect(state.duration).toBe(GESTURE_DURATIONS[kind])
      expect(state.bearing).toBeCloseTo(0.7, 10)
      expect(state.elevation).toBeCloseTo(-0.2, 10)
      expect(state.phase).toBeCloseTo(1.1, 10)
    }
  })

  it('honours an overridden duration', () => {
    expect(gestureIfHeard(1, 'point', { duration: 9 }).duration).toBe(9)
  })

  it('out of earshot hands back REST — the pose itself, not merely no kind', () => {
    const state = gestureIfHeard(RADIUS + 1, 'indicate', { bearing: 1.2 })
    expect(state.kind).toBe(null)
    expect(state.duration).toBe(0)
    expect(state.bearing).toBe(0)
    expect(gesturePose(state)).toEqual(REST_POSE)
  })
})

describe('the exits — how a gesture stops, and who gestures at once', () => {
  it('interrupts the arms of a speaker the player has walked away from', () => {
    // Spoken to from close by, then again from beyond the rim: the second call
    // must not leave the first gesture standing.
    const near = gestureIfHeard(1, 'beckon')
    expect(near.kind).toBe('beckon')
    const far = gestureIfHeard(RADIUS + 5, 'beckon')
    expect(far.kind).toBe(null)
  })

  it('walking out of earshot and back in switches the figure off and on again', () => {
    const walk = [0.5, 4, RADIUS, RADIUS + 2, RADIUS * 3, RADIUS + 0.5, 6, 0.5]
    const gesturing = walk.map((d) => gestureIfHeard(d, 'point').kind !== null)
    expect(gesturing).toEqual([true, true, true, false, false, false, true, true])
    // and every step agrees with what the same step records.
    walk.forEach((d, i) => expect(speechReach(d).audible).toBe(gesturing[i]))
  })

  it('judges two speakers at once each by its OWN distance', () => {
    const near = gestureIfHeard(2, 'beckon')
    const far = gestureIfHeard(RADIUS + 2, 'refuse')
    expect(near.kind).toBe('beckon')
    expect(far.kind).toBe(null)
    // The near speaker is unaffected by the far one having said nothing.
    expect(speechReach(2).audible).toBe(true)
    expect(speechReach(RADIUS + 2).audible).toBe(false)
  })

  it('a second utterance from the same speaker restarts rather than stacks', () => {
    const first = gestureIfHeard(1, 'beckon')
    const second = gestureIfHeard(1, 'indicate')
    expect(first.kind).toBe('beckon')
    expect(second.kind).toBe('indicate')
    expect(second.t).toBe(0)
  })
})
