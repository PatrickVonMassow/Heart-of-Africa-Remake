// The off-screen wildlife behaviour throttle (point 310): on-screen animals step
// every frame, off-screen ambient ones at the reduced rate, and an animal in a
// drama steps every frame wherever it is — so a sim-time drama deadline fires
// on exactly the frame it fires without the throttle.
import { describe, expect, it } from 'vitest'
import { behaviourStepDue, isAmbientForThrottle, type ThrottleCandidate } from './offscreenThrottle'
import { QUALITY_PRESETS } from '../../config/quality'

const idle = (phase = 0.3): ThrottleCandidate => ({ phase })

/** Frames in `frames` on which the animal steps its behaviour. */
function stepFrames(onScreen: (f: number) => boolean, ambient: boolean, interval: number, phase: number, frames: number) {
  const out: number[] = []
  for (let f = 0; f < frames; f++) if (behaviourStepDue(onScreen(f), ambient, interval, f, phase)) out.push(f)
  return out
}

describe('offscreenBehaviourInterval preset key', () => {
  it('LOW throttles (interval > 1); medium and high step every frame', () => {
    expect(QUALITY_PRESETS.low.offscreenBehaviourInterval).toBeGreaterThan(1)
    expect(Number.isInteger(QUALITY_PRESETS.low.offscreenBehaviourInterval)).toBe(true)
    expect(QUALITY_PRESETS.medium.offscreenBehaviourInterval).toBe(1)
    expect(QUALITY_PRESETS.high.offscreenBehaviourInterval).toBe(1)
  })
})

describe('behaviourStepDue', () => {
  const N = QUALITY_PRESETS.low.offscreenBehaviourInterval
  const FRAMES = 600

  it('an ON-screen animal steps every frame at the LOW interval', () => {
    expect(stepFrames(() => true, true, N, 0.7, FRAMES)).toHaveLength(FRAMES)
  })

  it('an OFF-screen ambient animal steps once per interval, never leaving a longer gap', () => {
    const steps = stepFrames(() => false, true, N, 0.7, FRAMES)
    expect(steps).toHaveLength(FRAMES / N)
    for (let i = 1; i < steps.length; i++) expect(steps[i] - steps[i - 1]).toBe(N)
  })

  it('the stagger spreads a herd over the frames (not all on one frame)', () => {
    const slots = new Set<number>()
    for (let k = 0; k < 40; k++) {
      const phase = (k * 0.157) % (Math.PI * 2)
      slots.add(stepFrames(() => false, true, N, phase, N)[0])
    }
    expect(slots.size).toBe(N)
  })

  it('interval 1 (medium/high) steps every animal every frame, off-screen too', () => {
    expect(stepFrames(() => false, true, 1, 0.7, FRAMES)).toHaveLength(FRAMES)
  })

  it('an animal entering the frame steps at once', () => {
    const steps = stepFrames((f) => f >= 101, true, N, 0.7, 200)
    for (let f = 101; f < 200; f++) expect(steps).toContain(f)
  })
})

describe('drama animals are never throttled — every §19 deadline holds in sim time', () => {
  it('plain ambient life qualifies; birds, elephants and crocodiles never do', () => {
    expect(isAmbientForThrottle('zebra', idle(), false)).toBe(true)
    expect(isAmbientForThrottle('lion', idle(), false)).toBe(true)
    for (const sp of ['elephant', 'crocodile', 'flamingo', 'plover']) expect(isAmbientForThrottle(sp, idle(), false)).toBe(false)
  })

  it.each<[string, ThrottleCandidate]>([
    ['caught', { phase: 0, caught: 0.5 }],
    ['in water', { phase: 0, inWater: 0 }],
    ['mired', { phase: 0, mired: 1 }],
    ['crossing', { phase: 0, crossing: { tx: 0, tz: 0, time: 0 } }],
    ['fighting', { phase: 0, fight: {} }],
    ['dying elder', { phase: 0, dying: {} }],
    ['grieving', { phase: 0, grief: 2 }],
    ['mourning', { phase: 0, mourn: 3 }],
    ['escaping', { phase: 0, escape: 1 }],
    ['drinking', { phase: 0, drink: { tx: 0, tz: 0 } }],
    ['juvenile', { phase: 0, young: true }],
    ['guarding a calf', { phase: 0, child: {} }],
    ['fire-trapped', { phase: 0, fireTrapped: 1 }],
    ['lured', { phase: 0, lure: {} }],
    ['kicked', { phase: 0, kick: 0.2 }],
    ['vigil', { phase: 0, vigil: {} }],
    ['carcass', { phase: 0, dead: true }],
  ])('%s is spoken for', (_label, a) => {
    expect(isAmbientForThrottle('zebra', a, false)).toBe(false)
  })

  it('the scripted lion hunt victim is spoken for', () => {
    expect(isAmbientForThrottle('zebra', idle(), true)).toBe(false)
  })

  it('an off-screen drama deadline fires on the same frame with and without the throttle', () => {
    // A mired animal with a 2-second sim-time deadline, stepped at 60 fps.
    const dt = 1 / 60
    const fireFrame = (interval: number): number => {
      const a: ThrottleCandidate = { phase: 0.9, mired: 0 }
      for (let f = 0; f < 1000; f++) {
        if (!behaviourStepDue(false, isAmbientForThrottle('zebra', a, false), interval, f, a.phase)) continue
        a.mired! += dt
        if (a.mired! >= 2) return f
      }
      return -1
    }
    const throttled = fireFrame(QUALITY_PRESETS.low.offscreenBehaviourInterval)
    expect(throttled).toBeGreaterThan(0)
    expect(throttled).toBe(fireFrame(1))
  })
})
