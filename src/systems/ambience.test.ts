// Coastal surf fade (point 153, design.md §19.1): the surf bed is only audible
// near the coast — full at the shore, silent beyond a calibratable cutoff, and
// monotone between. The curve is pure, so it is pinned here.
// Plus the thunderclap (design.md §19.13, point 166): the clap plan is pure,
// and a fake AudioContext pins that a flash SCHEDULES the clap at the pure
// thunderDelaySeconds lag on the audio clock and SURVIVES to fire — no later
// frame or ambience state change can cancel it.
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  coastSurfGain,
  emitFootstep,
  emitDrumPhrase,
  playDrumMessage,
  playSpeech,
  playThunder,
  proximityGain,
  refreshAmbienceVolume,
  setAmbienceAnimals,
  setAmbienceScene,
  startAmbience,
  thunderClapPlan,
  trampleCrunchFires,
  trampleCrunchGain,
  trampleCrunchPlan,
  DRUM_BEAT_PEAK,
  DRUM_BED_PATTERNS,
  drumBedPhrasePlan,
  drumBedVillageSpread,
  PROXIMITY_AUDIBLE,
} from './ambience'
import { thunderDelaySeconds } from './season'
import { balance } from '../config/balance'
import { phraseOf, utteranceOf, SEQUENCE_LENGTH } from '../communication/lexicon'
import { phrasePlan, utterancePlan } from '../communication/speaking'
import { resetDevAsserts } from './devAssert'
import { drumMessagePlan } from '../communication/drumMessage'

describe('village drum bed phrase selection', () => {
  const sequence = (...values: number[]) => {
    let i = 0
    return () => values[i++ % values.length]
  }

  it('ships disabled while retaining its planner for debug audition', () => {
    expect(balance.drumBed.enabled).toBe(false)
    expect(drumBedPhrasePlan('bambara-village', 0, null, 0).hits.length).toBeGreaterThan(0)
  })

  it('varies across many bars and never repeats a pattern back to back', () => {
    const config = { ...balance.drumBed, phraseBars: 3 }
    const chosen: number[] = []
    let previous: number | null = null
    let ordinal = 0
    const random = sequence(0, 0.99, 0.34, 0.7, 0.12)
    for (let phrase = 0; phrase < 8; phrase++) {
      const plan = drumBedPhrasePlan('bambara-village', 0, previous, ordinal, random, config)
      chosen.push(...plan.patternIndices)
      previous = plan.patternIndices.at(-1) ?? previous
      ordinal += plan.patternIndices.length
    }
    expect(new Set(chosen).size).toBe(DRUM_BED_PATTERNS.length)
    for (let i = 1; i < chosen.length; i++) expect(chosen[i]).not.toBe(chosen[i - 1])
  })

  it('guarantees that at least half of every phrase is rests', () => {
    for (let pick = 0; pick < DRUM_BED_PATTERNS.length; pick++) {
      const plan = drumBedPhrasePlan('bambara-village', 0, null, 0, () => (pick + 0.01) / DRUM_BED_PATTERNS.length)
      expect(plan.restShare).toBeGreaterThanOrEqual(0.5)
    }
  })

  it('moves a secondary accent while preserving the same rhythm', () => {
    const first = drumBedPhrasePlan('bambara-village', 0, null, 0, () => 0)
    const second = drumBedPhrasePlan('bambara-village', 0, null, 1, () => 0)
    expect(first.patternIndices[0]).toBe(second.patternIndices[0])
    expect(first.hits.map((h) => h.startOffset)).toEqual(second.hits.map((h) => h.startOffset))
    expect(first.hits.map((h) => h.peak)).not.toEqual(second.hits.map((h) => h.peak))
  })

  it('gives each village a stable bounded tempo and pitch spread', () => {
    const ids = ['bambara-village', 'hausa-village', 'maasai-village', 'zulu-village']
    const spreads = ids.map((id) => drumBedVillageSpread(id, 0.07, 0.08))
    expect(spreads.map((s) => s.tempoScale)).toEqual(ids.map((id) => drumBedVillageSpread(id, 0.07, 0.08).tempoScale))
    expect(new Set(spreads.map((s) => s.tempoScale)).size).toBe(ids.length)
    expect(new Set(spreads.map((s) => s.pitchScale)).size).toBe(ids.length)
    for (const spread of spreads) {
      expect(spread.tempoScale).toBeGreaterThanOrEqual(0.93)
      expect(spread.tempoScale).toBeLessThanOrEqual(1.07)
      expect(spread.pitchScale).toBeGreaterThanOrEqual(0.92)
      expect(spread.pitchScale).toBeLessThanOrEqual(1.08)
    }
  })

  it('lengthens phrase silence as a visit continues without changing its bar count', () => {
    const random = () => 0.5
    const opening = drumBedPhrasePlan('bambara-village', 0, null, 0, random)
    const thinned = drumBedPhrasePlan('bambara-village', balance.drumBed.thinAfterSeconds, null, 0, random)
    expect(thinned.patternIndices).toHaveLength(opening.patternIndices.length)
    expect(thinned.nextDelaySeconds).toBeGreaterThan(opening.nextDelaySeconds)
  })
})

describe('coastSurfGain (point 153 — the coastal surf fade)', () => {
  const near = 0.4
  const cut = 3

  it('is full (1) at the shore and within the near radius', () => {
    expect(coastSurfGain(0, near, cut)).toBe(1)
    expect(coastSurfGain(near, near, cut)).toBe(1)
    expect(coastSurfGain(near * 0.5, near, cut)).toBe(1)
  })

  it('is exactly 0 at and beyond the cutoff (far inland is silent)', () => {
    expect(coastSurfGain(cut, near, cut)).toBe(0)
    expect(coastSurfGain(cut + 0.5, near, cut)).toBe(0)
    expect(coastSurfGain(15, near, cut)).toBe(0) // the live test's far-inland case
  })

  it('falls monotonically between the near radius and the cutoff', () => {
    let prev = coastSurfGain(near, near, cut)
    for (let d = near + 0.05; d < cut; d += 0.05) {
      const g = coastSurfGain(d, near, cut)
      expect(g).toBeLessThanOrEqual(prev)
      expect(g).toBeGreaterThanOrEqual(0)
      expect(g).toBeLessThanOrEqual(1)
      prev = g
    }
  })

  it('is a smoothstep — halfway between the edges it sits near 0.5', () => {
    const mid = (near + cut) / 2
    expect(coastSurfGain(mid, near, cut)).toBeCloseTo(0.5, 5)
  })
})

describe('trampleCrunchGain (point 260 — the crunch follows the §19.1 distance + ambience-volume curve)', () => {
  const vol = balance.ambienceVolume

  it('is loudest right beside the traveller and fades to 0 at the audible radius', () => {
    expect(vol).toBeGreaterThan(0)
    const near = trampleCrunchGain(0, vol)
    expect(near).toBeGreaterThan(0)
    // The gain is the SHARED proximity curve scaled by a fixed peak+volume, so
    // gain(d)/gain(0) reproduces proximityGain(d) at every distance.
    for (const d of [8, 24, 40]) {
      expect(trampleCrunchGain(d, vol) / near).toBeCloseTo(proximityGain(d), 10)
    }
    expect(trampleCrunchGain(PROXIMITY_AUDIBLE, vol)).toBe(0)
    expect(trampleCrunchGain(PROXIMITY_AUDIBLE + 20, vol)).toBe(0)
  })

  it('falls monotonically with distance (a far trample is fainter than a near one)', () => {
    let prev = trampleCrunchGain(0, vol)
    for (let d = 1; d <= PROXIMITY_AUDIBLE; d += 1) {
      const g = trampleCrunchGain(d, vol)
      expect(g).toBeLessThanOrEqual(prev)
      expect(g).toBeGreaterThanOrEqual(0)
      prev = g
    }
  })

  it('scales linearly with the single ambience volume and is silent when muted', () => {
    const base = trampleCrunchGain(10, vol)
    expect(base).toBeGreaterThan(0)
    expect(trampleCrunchGain(10, vol * 2)).toBeCloseTo(base * 2, 10)
    expect(trampleCrunchGain(10, 0)).toBe(0)
    expect(trampleCrunchGain(10, -1)).toBe(0) // a negative volume never inverts the sound
  })
})

describe('trampleCrunchFires (point 260 — an edge, one crunch per kill)', () => {
  it('fires on the alive->dead transition (the frame the animal is crushed)', () => {
    expect(trampleCrunchFires(false, true)).toBe(true)
  })

  it('does not re-fire while the carcass stays down, nor for a living animal', () => {
    expect(trampleCrunchFires(true, true)).toBe(false) // body already down: silent every later frame
    expect(trampleCrunchFires(false, false)).toBe(false) // still alive
    expect(trampleCrunchFires(true, false)).toBe(false) // never revives
  })
})

describe('trampleCrunchPlan (the crush is bone-crack micro-crackles over a wet squelch, not one dull thud)', () => {
  // Deterministic rand sources so the plan's shape is pinned, not sampled.
  const half = () => 0.5
  const seq = (...vals: number[]) => {
    let i = 0
    return () => vals[i++ % vals.length]
  }

  it('keeps the unchanged §19.1 gain curve as its overall peak', () => {
    expect(trampleCrunchPlan(10, 0.1, half).peak).toBeCloseTo(trampleCrunchGain(10, 0.1), 10)
    expect(trampleCrunchPlan(0, 0.3, half).peak).toBeCloseTo(trampleCrunchGain(0, 0.3), 10)
  })

  it('lays several fast micro-crackles: hard attacks, short, bright, fused into one moment', () => {
    const plan = trampleCrunchPlan(0, 1, half)
    expect(plan.crackles.length).toBeGreaterThanOrEqual(4) // several snaps, never a single burst
    expect(plan.crackles[0].startOffset).toBe(0) // the lead crack lands on the impact
    for (let i = 1; i < plan.crackles.length; i++) {
      expect(plan.crackles[i].startOffset).toBeGreaterThan(plan.crackles[i - 1].startOffset)
    }
    for (const c of plan.crackles) {
      expect(c.attack).toBeLessThanOrEqual(0.005) // hard attack: a snap edge, not a swell
      expect(c.duration).toBeLessThan(0.06) // micro: each burst is a blink
      expect(c.frequency).toBeGreaterThanOrEqual(1500) // bright — bone, not body
      expect(c.startOffset).toBeLessThan(0.2) // the whole crunch stays one moment
      expect(c.peak).toBeGreaterThan(0)
    }
    // The lead crack is the loudest snap; the follow-up crackles decay under it.
    for (let i = 1; i < plan.crackles.length; i++) {
      expect(plan.crackles[i].peak).toBeLessThan(plan.crackles[0].peak)
    }
  })

  it('adds a wet squelch: lower, softer-attacked and longer-damped than every bone snap', () => {
    const plan = trampleCrunchPlan(0, 1, half)
    const s = plan.squelch
    for (const c of plan.crackles) {
      expect(s.frequency).toBeLessThan(c.frequency) // the tissue band sits under the bone band
      expect(s.attack).toBeGreaterThan(c.attack) // softer envelope: a squish, not a snap
      expect(s.duration).toBeGreaterThan(c.duration) // damped, longer tail
    }
    expect(s.frequencyEnd).toBeLessThan(s.frequency) // the sweep falls — a give, not a ring
    expect(s.q).toBeGreaterThan(1) // resonant: the wet formant
    expect(s.peak).toBeGreaterThan(0)
    expect(s.peak).toBeLessThan(plan.crackles[0].peak) // the crack leads, the squelch underlies
  })

  it('scales every layer with the §19.1 curve — silent muted or out of earshot', () => {
    const muted = trampleCrunchPlan(10, 0, half)
    expect(muted.peak).toBe(0)
    for (const c of muted.crackles) expect(c.peak).toBe(0)
    expect(muted.squelch.peak).toBe(0)
    expect(trampleCrunchPlan(PROXIMITY_AUDIBLE + 5, 1, half).peak).toBe(0)
    // Distance scales both layers through the one shared curve.
    const near = trampleCrunchPlan(0, 0.5, half)
    const mid = trampleCrunchPlan(PROXIMITY_AUDIBLE / 2, 0.5, half)
    expect(mid.crackles[0].peak / near.crackles[0].peak).toBeCloseTo(proximityGain(PROXIMITY_AUDIBLE / 2), 10)
    expect(mid.squelch.peak / near.squelch.peak).toBeCloseTo(proximityGain(PROXIMITY_AUDIBLE / 2), 10)
  })

  it('is deterministic under a fixed rand source', () => {
    const a = trampleCrunchPlan(3, 0.2, seq(0.1, 0.9, 0.4, 0.7))
    const b = trampleCrunchPlan(3, 0.2, seq(0.1, 0.9, 0.4, 0.7))
    expect(b).toEqual(a)
  })
})

describe('thunderClapPlan (point 166 — the clap fires at the pure delay, scaled by the ambience volume)', () => {
  it('starts exactly at the pure thunderDelaySeconds lag for every strike seed', () => {
    for (let seed = 0; seed < 12; seed++) {
      const d = thunderDelaySeconds(seed)
      expect(d).toBeGreaterThanOrEqual(1)
      expect(d).toBeLessThanOrEqual(4)
      expect(thunderClapPlan(d, 0.8, 0.1).startOffset).toBe(d)
    }
  })

  it('is audible at the default ambience volume and scales linearly with it (§21 single volume)', () => {
    const base = thunderClapPlan(2, 0.8, balance.ambienceVolume)
    expect(balance.ambienceVolume).toBeGreaterThan(0)
    expect(base.crackPeak).toBeGreaterThan(0)
    expect(base.rumblePeak).toBeGreaterThan(0)
    const doubled = thunderClapPlan(2, 0.8, balance.ambienceVolume * 2)
    expect(doubled.crackPeak).toBeCloseTo(base.crackPeak * 2, 10)
    expect(doubled.rumblePeak).toBeCloseTo(base.rumblePeak * 2, 10)
  })

  it('is silent at volume 0 and clamps the strike strength to 0..1', () => {
    const muted = thunderClapPlan(2, 0.8, 0)
    expect(muted.crackPeak).toBe(0)
    expect(muted.rumblePeak).toBe(0)
    expect(thunderClapPlan(2, 5, 0.1)).toEqual(thunderClapPlan(2, 1, 0.1))
    expect(thunderClapPlan(2, -1, 0.1).crackPeak).toBe(0)
  })

  it('never schedules in the past', () => {
    expect(thunderClapPlan(-3, 0.8, 0.1).startOffset).toBe(0)
  })
})

// --- Fake WebAudio graph: just enough surface for the ambience engine, so the
// scheduling itself (not only the pure plan) is pinned without a browser. ---
class FakeParam {
  value = 0
  events: Array<{ type: 'set' | 'lin' | 'exp' | 'cancel'; value?: number; time: number }> = []
  setValueAtTime(v: number, t: number) {
    this.events.push({ type: 'set', value: v, time: t })
    this.value = v
    return this
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push({ type: 'lin', value: v, time: t })
    this.value = v
    return this
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push({ type: 'exp', value: v, time: t })
    this.value = v
    return this
  }
  cancelScheduledValues(t: number) {
    this.events.push({ type: 'cancel', time: t })
    return this
  }
}
class FakeNode {
  connected: unknown[] = []
  disconnectCalls = 0
  connect(n: unknown) {
    this.connected.push(n)
    return n
  }
  disconnect() {
    this.disconnectCalls++
  }
}
class FakeGain extends FakeNode {
  gain = new FakeParam()
}
class FakeFilter extends FakeNode {
  type = ''
  frequency = new FakeParam()
  Q = new FakeParam()
  /** Peaking filters carry a gain in dB (the vowel formants, point 587). */
  gain = new FakeParam()
}
class FakeOscillator extends FakeNode {
  type = ''
  frequency = new FakeParam()
  startedAt: number | null = null
  stoppedAt: number | null = null
  start(t = 0) {
    this.startedAt = t
  }
  stop(t = 0) {
    this.stoppedAt = t
  }
}
class FakeBuffer {
  data: Float32Array
  constructor(len: number) {
    this.data = new Float32Array(len)
  }
  getChannelData() {
    return this.data
  }
}
class FakeSource extends FakeNode {
  buffer: FakeBuffer | null = null
  loop = false
  startedAt: number | null = null
  stoppedAt: number | null = null
  start(t = 0) {
    this.startedAt = t
  }
  stop(t = 0) {
    this.stoppedAt = t
  }
}
class FakeCtx {
  static last: FakeCtx | null = null
  currentTime = 0
  sampleRate = 8000
  state = 'running'
  destination = new FakeNode()
  sources: FakeSource[] = []
  /** Every gain the engine ever built — lets a test FIND the node a change
   *  ramped instead of assuming the graph's build order. */
  gains: FakeGain[] = []
  constructor() {
    FakeCtx.last = this
  }
  createGain() {
    const g = new FakeGain()
    this.gains.push(g)
    return g
  }
  createBuffer(_channels: number, len: number) {
    return new FakeBuffer(len)
  }
  createBufferSource() {
    const s = new FakeSource()
    this.sources.push(s)
    return s
  }
  createBiquadFilter() {
    return new FakeFilter()
  }
  /** Every oscillator the engine ever built — the spoken syllables among them. */
  oscillators: FakeOscillator[] = []
  createOscillator() {
    const o = new FakeOscillator()
    this.oscillators.push(o)
    return o
  }
  resume() {
    return Promise.resolve()
  }
}

describe('playThunder (point 166 — scheduled on the audio clock, survives to fire)', () => {
  const defaultVolume = balance.ambienceVolume

  beforeAll(() => {
    // Fake timers BEFORE the engine starts: the emitters' setTimeout loops
    // never run, proving the clap needs no JS timer to fire — it lives
    // entirely on the AudioContext timeline.
    vi.useFakeTimers()
    ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx
    startAmbience()
  })
  afterAll(() => {
    vi.useRealTimers()
  })
  afterEach(() => {
    balance.ambienceVolume = defaultVolume
  })

  /** The gain node a clap source's chain ends in (source -> filter -> gain). */
  const clapGain = (src: FakeSource): FakeParam => {
    const filter = src.connected[0] as FakeFilter
    const gain = filter.connected[0] as FakeGain
    return gain.gain
  }

  it('emits no ambient drum phrase in the shipped off state', () => {
    const ctx = FakeCtx.last
    expect(ctx).not.toBeNull()
    if (!ctx) return
    const before = ctx.oscillators.length
    expect(balance.drumBed.enabled).toBe(false)
    emitDrumPhrase(new FakeGain() as unknown as GainNode)
    expect(ctx.oscillators.slice(before)).toHaveLength(0)
  })

  it("still emits every strike of the chief's message while the ambient bed is off", () => {
    const ctx = FakeCtx.last
    if (!ctx) return
    ctx.currentTime = 5
    const plan = drumMessagePlan()
    const before = ctx.oscillators.length
    playDrumMessage(plan)
    const voices = ctx.oscillators.slice(before)
    expect(balance.drumBed.enabled).toBe(false)
    expect(voices).toHaveLength(plan.strikes.length * 2)
    expect(voices[0].startedAt).toBeCloseTo(5 + plan.strikes[0].at, 10)
    expect(voices[voices.length - 2].startedAt).toBeCloseTo(5 + plan.strikes.at(-1)!.at, 10)
  })

  it('schedules both clap voices at now + the pure delay, with a stop only after the tail', () => {
    const ctx = FakeCtx.last
    expect(ctx).not.toBeNull()
    if (!ctx) return
    ctx.currentTime = 10
    const before = ctx.sources.length
    const d = thunderDelaySeconds(5)
    playThunder(d, 0.8)
    const claps = ctx.sources.slice(before)
    expect(claps).toHaveLength(2) // the crack and the rumble
    for (const s of claps) {
      expect(s.loop).toBe(false)
      expect(s.startedAt).toBeCloseTo(10 + d, 10)
      expect(s.stoppedAt).toBeGreaterThan(s.startedAt as number) // the stop ENDS the clap, it never precedes the start
    }
  })

  it('ramps each voice to a positive peak at the default volume — never gated to silence', () => {
    const ctx = FakeCtx.last
    if (!ctx) return
    ctx.currentTime = 20
    const before = ctx.sources.length
    playThunder(2.5, 0.8)
    for (const s of ctx.sources.slice(before)) {
      const peak = Math.max(...clapGain(s).events.filter((e) => e.type === 'lin').map((e) => e.value ?? 0))
      expect(peak).toBeGreaterThan(0.001)
      // And the buffer itself carries signal (normalized, not the old ~0.4-peak raw chain).
      const data = (s.buffer as FakeBuffer).getChannelData()
      let max = 0
      for (const v of data) max = Math.max(max, Math.abs(v))
      expect(max).toBeCloseTo(1, 5)
    }
  })

  it('survives the frames between flash and clap — later ambience changes cancel nothing', () => {
    const ctx = FakeCtx.last
    if (!ctx) return
    ctx.currentTime = 30
    const before = ctx.sources.length
    const d = thunderDelaySeconds(7)
    playThunder(d, 0.7)
    const claps = ctx.sources.slice(before)
    const stops = claps.map((s) => s.stoppedAt)
    // Everything a frame/state change between flash and clap can do:
    setAmbienceScene({ region: 'south', mode: 'place', placeKind: 'village', nearVillage: false })
    setAmbienceAnimals({ elephant: 1, lion: 0.5, grazer: 0, flock: 0 })
    balance.ambienceVolume = 0.05
    refreshAmbienceVolume()
    ctx.currentTime = 30 + d - 0.01 // just before the clap fires
    for (let i = 0; i < claps.length; i++) {
      expect(claps[i].disconnectCalls).toBe(0) // still wired into the graph
      expect(claps[i].stoppedAt).toBe(stops[i]) // no early stop was injected
      expect(clapGain(claps[i]).events.some((e) => e.type === 'cancel')).toBe(false) // envelope intact
    }
  })

  it('re-fires: TWO and then N successive claps EACH schedule and play — never gated after the first (point 241)', () => {
    const ctx = FakeCtx.last
    if (!ctx) return
    const N = 6
    const allSources: FakeSource[] = []
    for (let i = 0; i < N; i++) {
      ctx.currentTime = 100 + i * 10 // successive flashes, 10 s apart
      const before = ctx.sources.length
      const d = thunderDelaySeconds(i)
      playThunder(d, 0.8)
      const claps = ctx.sources.slice(before)
      // The 2nd..Nth claps are NOT suppressed: each call builds its own two
      // fresh voices and schedules them at ITS OWN flash time + delay.
      expect(claps).toHaveLength(2)
      for (const s of claps) {
        expect(allSources).not.toContain(s) // fresh short-lived nodes, never a reused/stopped one
        expect(s.startedAt).toBeCloseTo(100 + i * 10 + d, 10)
        expect(s.stoppedAt).toBeGreaterThan(s.startedAt as number)
        const peak = Math.max(...clapGain(s).events.filter((e) => e.type === 'lin').map((e) => e.value ?? 0))
        expect(peak).toBeGreaterThan(0.001) // each clap ramps to an audible level
        expect(clapGain(s).events.some((e) => e.type === 'cancel')).toBe(false) // no later clap cancels an earlier envelope
      }
      allSources.push(...claps)
    }
    expect(allSources).toHaveLength(N * 2) // every flash produced its own pair
  })

  it('reports the strike AND the scheduled audio level on the __thunder probe', () => {
    const ctx = FakeCtx.last
    if (!ctx) return
    const probe = (window as unknown as { __thunder?: { count: number; lastDelay: number; audio: number; lastPeak: number } }).__thunder
    expect(probe).toBeDefined()
    if (!probe) return
    const { count, audio } = probe
    playThunder(3, 0.8)
    expect(probe.count).toBe(count + 1)
    expect(probe.audio).toBe(audio + 1) // a clap was really scheduled, not only counted
    expect(probe.lastPeak).toBeGreaterThan(0)
    expect(probe.lastDelay).toBe(3)
    // At volume 0 the strike still counts but the scheduled level reads silent.
    balance.ambienceVolume = 0
    playThunder(2, 0.8)
    expect(probe.count).toBe(count + 2)
    expect(probe.lastPeak).toBe(0)
  })
})

// The §19.1 proximity call must RISE with a near animal and FADE BACK once it is
// gone — the audible half of the report, asserted on the real gain node the
// engine ramps (found by observation, so the test assumes nothing about the
// graph's build order or the per-voice scaling constants). The live check in
// scripts/verify/settings.mjs measures the same behaviour in the browser; this
// pins it without one, so a future change that leaves a voice standing after its
// animal left fails in the fast layer.
describe('setAmbienceAnimals (design.md §19.1 — the proximity call rises and fades back to silence)', () => {
  const defaultVolume = balance.ambienceVolume
  /** The engine's crossfade window (ambience.ts FADE) — the perceptible time in
   *  which a call must reach silence; the live check waits 1600 ms for it. */
  const FADE = 1.6
  let ctx: FakeCtx

  beforeAll(() => {
    vi.useFakeTimers() // the emitters' setTimeout loops never run
    ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx
    startAmbience() // a no-op if an earlier block already started the engine
    const c = FakeCtx.last
    if (!c) throw new Error('the fake audio context was not created')
    ctx = c
    // Travel, not a settlement: in a place every animal voice is forced to 0.
    setAmbienceScene({ region: 'east', mode: 'travel', placeKind: null, nearVillage: false })
  })
  afterAll(() => {
    vi.useRealTimers()
    balance.ambienceVolume = defaultVolume
  })

  /** Raise the elephant voice out of silence and return the ONE layer gain that
   *  moved — identified by the ramp it received, not by its build position. */
  const riseElephant = (prox: number): FakeParam => {
    setAmbienceAnimals({ elephant: 0, lion: 0, grazer: 0, flock: 0 })
    const before = ctx.gains.map((g) => g.gain.events.length)
    setAmbienceAnimals({ elephant: prox, lion: 0, grazer: 0, flock: 0 })
    const moved = ctx.gains.filter((g, i) => g.gain.events.length > before[i])
    expect(moved).toHaveLength(1) // exactly one voice moved: the elephant's own
    return moved[0].gain
  }

  /** The value the last scheduled ramp on a param drives to. */
  const rampTarget = (p: FakeParam): number => {
    const ramps = p.events.filter((e) => e.type === 'lin')
    expect(ramps.length).toBeGreaterThan(0)
    return ramps[ramps.length - 1].value ?? 0
  }

  it('ramps the voice up when an animal is near and back to exactly 0 when it is gone', () => {
    ctx.currentTime = 5
    const param = riseElephant(1)
    const up = param.events.filter((e) => e.type === 'lin')
    expect(rampTarget(param)).toBeGreaterThan(0) // audible while it stands there
    expect(up[up.length - 1].time).toBeCloseTo(5 + FADE, 6)
    // The animal is gone: the SAME node must be ramped back down to silence.
    ctx.currentTime = 9
    setAmbienceAnimals({ elephant: 0, lion: 0, grazer: 0, flock: 0 })
    expect(rampTarget(param)).toBe(0)
    const down = param.events.filter((e) => e.type === 'lin')
    expect(down[down.length - 1].time).toBeCloseTo(9 + FADE, 6) // silent within the fade window
    expect(param.value).toBe(0)
  })

  it('an animal walking out of earshot fades the call the whole way — the report hysteresis strands nothing', () => {
    ctx.currentTime = 20
    const param = riseElephant(1) // right beside the traveller
    let prev = rampTarget(param)
    expect(prev).toBeGreaterThan(0)
    // Frame by frame it walks from the traveller's feet past the audible radius.
    // Each single step moves the proximity by far less than the 0.02 report
    // hysteresis, so a fade may only ever be quantised by it, never stopped.
    for (let d = 0; d <= PROXIMITY_AUDIBLE; d += 0.5) {
      setAmbienceAnimals({ elephant: proximityGain(d), lion: 0, grazer: 0, flock: 0 })
      const v = rampTarget(param)
      expect(v).toBeLessThanOrEqual(prev + 1e-12) // never louder as it leaves
      prev = v
    }
    expect(prev).toBe(0) // beyond the audible radius the call is exactly silent
    expect(param.value).toBe(0)
  })

  it('fades only the voice that left — an animal still near keeps its own call', () => {
    ctx.currentTime = 30
    const elephant = riseElephant(1)
    // A lion joins; its own voice rises on a DIFFERENT node.
    const before = ctx.gains.map((g) => g.gain.events.length)
    setAmbienceAnimals({ elephant: 1, lion: 0.8, grazer: 0, flock: 0 })
    const lionMoved = ctx.gains.filter((g, i) => g.gain.events.length > before[i])
    expect(lionMoved).toHaveLength(1)
    const lion = lionMoved[0].gain
    expect(lion).not.toBe(elephant)
    expect(rampTarget(lion)).toBeGreaterThan(0)
    // The elephant leaves, the lion stays: only the elephant's voice goes down.
    setAmbienceAnimals({ elephant: 0, lion: 0.8, grazer: 0, flock: 0 })
    expect(rampTarget(elephant)).toBe(0)
    expect(rampTarget(lion)).toBeGreaterThan(0)
  })

  it('scales the call with the single ambience volume and silences it at volume 0', () => {
    ctx.currentTime = 50
    balance.ambienceVolume = 0.5
    const param = riseElephant(1)
    const loud = rampTarget(param)
    const reRise = () => {
      setAmbienceAnimals({ elephant: 0, lion: 0, grazer: 0, flock: 0 })
      setAmbienceAnimals({ elephant: 1, lion: 0, grazer: 0, flock: 0 })
      return rampTarget(param)
    }
    balance.ambienceVolume = 0.25
    expect(reRise()).toBeCloseTo(loud / 2, 10)
    balance.ambienceVolume = 0
    expect(reRise()).toBe(0) // muted: a near animal schedules no audible level
    balance.ambienceVolume = defaultVolume
  })
})

// Village speech (design.md §13.4, docs/communication-poc-spec.md): the PURE
// timing/level plan is pinned in src/communication/speaking.test.ts; here the
// SCHEDULING is — that a plan becomes one voice per syllable on the
// AudioContext clock, through the same ambient bus the §21 volume governs, and
// that an inaudible plan schedules nothing at all. The browser check in
// scripts/verify/settings.mjs proves the sound really plays.
describe('playSpeech (design.md §13.4 — the syllables reach the audio clock)', () => {
  const defaultVolume = balance.ambienceVolume
  let ctx: FakeCtx

  beforeAll(() => {
    vi.useFakeTimers() // the emitters' setTimeout loops never run
    ;(window as unknown as { AudioContext: unknown }).AudioContext = FakeCtx
    startAmbience() // a no-op if an earlier block already started the engine
    const c = FakeCtx.last
    if (!c) throw new Error('the fake audio context was not created')
    ctx = c
  })
  afterAll(() => {
    vi.useRealTimers()
    balance.ambienceVolume = defaultVolume
  })

  /** The oscillators one call added. */
  const spoken = (play: () => void): FakeOscillator[] => {
    const before = ctx.oscillators.length
    play()
    return ctx.oscillators.slice(before)
  }

  it('schedules one voice per syllable, at the plan offsets on the audio clock', () => {
    ctx.currentTime = 40
    const plan = utterancePlan(utteranceOf('DIG'), 0, { syllableSeconds: 0.3, volume: 1 })
    const voices = spoken(() => playSpeech(plan))
    expect(voices).toHaveLength(plan.syllables.length)
    voices.forEach((v, i) => {
      expect(v.startedAt).toBeCloseTo(40 + plan.syllables[i].startOffset, 10)
      expect(v.stoppedAt as number).toBeGreaterThan(v.startedAt as number)
    })
  })

  it('gives the high syllable a higher carrier than the low one — the two samples', () => {
    ctx.currentTime = 60
    const plan = utterancePlan(utteranceOf('DIG'), 0, { syllableSeconds: 0.3, volume: 1 })
    const voices = spoken(() => playSpeech(plan))
    const pitch = (i: number) => voices[i].frequency.events[0].value ?? 0
    const high = plan.syllables.findIndex((s) => s.tone === 'high')
    const low = plan.syllables.findIndex((s) => s.tone === 'low')
    expect(pitch(high)).toBeGreaterThan(pitch(low))
  })

  it('keeps the phrase pause on the clock between the atoms', () => {
    ctx.currentTime = 80
    const plan = phrasePlan(phraseOf(['DIG', 'ROCK']), 0, {
      syllableSeconds: 0.3,
      pauseSeconds: 0.9,
      volume: 1,
    })
    const voices = spoken(() => playSpeech(plan))
    expect(voices).toHaveLength(2 * SEQUENCE_LENGTH)
    const gap =
      (voices[SEQUENCE_LENGTH].startedAt as number) - (voices[SEQUENCE_LENGTH - 1].startedAt as number)
    expect(gap).toBeCloseTo(0.3 + 0.9, 10) // the last beat's step, then the pause
  })

  it('schedules nothing for a speaker out of earshot or a muted soundscape', () => {
    ctx.currentTime = 100
    expect(spoken(() => playSpeech(utterancePlan(utteranceOf('DIG'), 999, { volume: 1 })))).toHaveLength(0)
    balance.ambienceVolume = 0
    expect(spoken(() => playSpeech(utterancePlan(utteranceOf('DIG'), 0)))).toHaveLength(0)
    balance.ambienceVolume = defaultVolume
  })

  /** Walk a voice's chain (filters, however many) down to its envelope gain,
   *  so the check assumes nothing about the vowel's filter count. */
  const envelopeOf = (osc: FakeOscillator): FakeGain => {
    let node: FakeNode = osc
    while (!(node instanceof FakeGain)) {
      const next = node.connected[0] as FakeNode | undefined
      if (!next) throw new Error('the voice chain ends in no gain node')
      node = next
    }
    return node
  }

  it('is quieter from further away, and never louder than right beside the speaker', () => {
    ctx.currentTime = 120
    const peakOf = (distance: number) => {
      const voices = spoken(() => playSpeech(utterancePlan(utteranceOf('DIG'), distance, { volume: 1 })))
      return Math.max(...envelopeOf(voices[0]).gain.events.map((e) => e.value ?? 0))
    }
    const near = peakOf(0)
    const far = peakOf(6)
    expect(near).toBeGreaterThan(0)
    expect(far).toBeGreaterThan(0)
    expect(far).toBeLessThan(near)
  })

  // Point 577: the speech used to hang on the ambient bus, so "Übrige
  // Ambiente-Lautstärke" — the slider the game's own advice tells the player to
  // turn DOWN to hear the voices over the drums — multiplied every syllable
  // away. The bug was invisible to every earlier check because the plan still
  // reported a positive peak; only the BUS behind it was zero. These cases
  // therefore assert the routing itself, on the node the voices really reach.
  describe('the speech has its own bus, out of reach of "everything else" (point 577)', () => {
    const defaultAmbient = balance.ambientVolume
    const defaultSpeech = balance.communication.speechVolume

    /** The bus a spoken syllable actually lands on. */
    const speechBusOf = (voice: FakeOscillator): FakeGain => {
      const bus = envelopeOf(voice).connected[0] as FakeGain | undefined
      if (!bus) throw new Error('the voice envelope reaches no bus')
      return bus
    }
    /** The bus a thunderclap — one of the ambient bed's own emitters — lands on. */
    const ambientBus = (): FakeGain => {
      const before = ctx.sources.length
      playThunder(thunderDelaySeconds(3), 0.8)
      const clap = ctx.sources.slice(before)[0]
      const gain = (clap.connected[0] as FakeFilter).connected[0] as FakeGain
      const bus = gain.connected[0] as FakeGain | undefined
      if (!bus) throw new Error('the clap envelope reaches no bus')
      return bus
    }
    const speak = () => {
      const before = ctx.oscillators.length
      playSpeech(utterancePlan(utteranceOf('DIG'), 0, { volume: 1 }))
      return ctx.oscillators.slice(before)
    }

    afterEach(() => {
      balance.ambientVolume = defaultAmbient
      balance.communication.speechVolume = defaultSpeech
      refreshAmbienceVolume()
    })

    it('does not route the syllables through the ambient bus at all', () => {
      ctx.currentTime = 140
      expect(speechBusOf(speak()[0])).not.toBe(ambientBus())
    })

    it('keeps speaking at a positive level with "everything else" turned to zero (the reported bug)', () => {
      ctx.currentTime = 160
      balance.ambientVolume = 0 // the user's own state in the F6 report
      refreshAmbienceVolume()
      const voices = speak()
      expect(voices.length).toBeGreaterThan(0)
      // The syllable is scheduled at a positive peak…
      expect(Math.max(...envelopeOf(voices[0]).gain.events.map((e) => e.value ?? 0))).toBeGreaterThan(0)
      // …and, unlike before, nothing behind it multiplies that away.
      expect(speechBusOf(voices[0]).gain.value).toBeGreaterThan(0)
      expect(ambientBus().gain.value).toBe(0) // the bed IS silent — that still works
    })

    it('silences the speech only through its OWN slider, and leaves the bed alone', () => {
      ctx.currentTime = 180
      balance.communication.speechVolume = 0
      refreshAmbienceVolume()
      expect(speechBusOf(speak()[0]).gain.value).toBe(0)
      expect(ambientBus().gain.value).toBeGreaterThan(0)
    })

    it('follows the slider live — no restart of the engine to hear the change', () => {
      ctx.currentTime = 200
      balance.communication.speechVolume = 0.9
      refreshAmbienceVolume()
      expect(speechBusOf(speak()[0]).gain.value).toBeCloseTo(0.9, 10)
    })

    it('never lets a negative value invert the bus', () => {
      ctx.currentTime = 220
      balance.communication.speechVolume = -3
      refreshAmbienceVolume()
      expect(speechBusOf(speak()[0]).gain.value).toBe(0)
    })

    // THE RESULT-LEVEL ASSERTION (point 589, rule 1): the level that LEAVES the
    // graph is what the ear gets, and point 577 proved a plan can be perfect
    // while the chain behind it multiplies the tone away. So the running game
    // judges the end of the chain, and every session — headless or manual —
    // reports it.
    describe('the armed end-of-chain level', () => {
      let spy: ReturnType<typeof vi.spyOn>
      beforeEach(() => {
        resetDevAsserts()
        spy = vi.spyOn(console, 'error').mockImplementation(() => {})
      })
      afterEach(() => spy.mockRestore())

      const codes = () => spy.mock.calls.map((c) => String(c[0]))

      it('says nothing at the shipped mix, nor with the bed turned to zero', () => {
        ctx.currentTime = 240
        balance.ambientVolume = 0
        refreshAmbienceVolume()
        speak()
        expect(codes()).toEqual([])
      })

      it('stays silent when the PLAYER turned the speech off — that is not a defect', () => {
        ctx.currentTime = 260
        balance.communication.speechVolume = 0
        refreshAmbienceVolume()
        speak()
        expect(codes()).toEqual([])
      })

      it('FIRES when the chain behind an intact plan is zero (the point-577 shape)', () => {
        ctx.currentTime = 280
        // The bus is left at zero while the player's own setting says otherwise
        // — exactly the state in which every plan-level measurement was green.
        balance.communication.speechVolume = 0
        refreshAmbienceVolume()
        balance.communication.speechVolume = defaultSpeech
        speak()
        expect(codes().join(' ')).toContain('speech-inaudible')
      })

      it('FIRES on a zero MASTER too — every factor of the chain is in the product', () => {
        ctx.currentTime = 300
        // The node the speech bus feeds IS the master; zeroing it silences the
        // voices just as surely, and a check that read only the sub-bus would
        // pass. Restored immediately, so nothing after this sees a mute engine.
        const master = speechBusOf(speak()[0]).connected[0] as FakeGain
        const held = master.gain.value
        master.gain.value = 0
        speak()
        master.gain.value = held
        expect(codes().join(' ')).toContain('speech-inaudible')
      })

      it('FIRES on a plan that carries syllables at no level at all', () => {
        ctx.currentTime = 320
        // Not reachable through `phrasePlan` — it returns no syllables for an
        // inaudible level — but `playSpeech` takes any plan, and syllables at
        // peak 0 are silence whatever the scheduling floor makes of them.
        playSpeech({
          syllables: [{ tone: 'low', startOffset: 0, duration: 0.1, peak: 0 }],
          duration: 0.1,
          gain: 1,
        })
        expect(codes().join(' ')).toContain('speech-inaudible')
      })
    })
  })

  /** Conservative measured output of the rendered vowel filters per unit of
   * scheduled speech envelope; pinned in ambience.speech.test.ts. */
  const SYLLABLE_SYNTHESIS_GAIN = 1.7

  // Point 605: point 577 gave the speech its own bus at the level it had had on
  // the ambient one, and at that level the syllables sat BELOW the village drum
  // bed — the user still reported them too quiet. Its dormant audition mix is
  // calibrated
  // against the graph, so this case measures the whole chain the ear gets:
  // syllable peak × speech bus against drum beat × drum layer × ambient bus,
  // all read off the LIVE nodes at the default gains. A later change to
  // either side then fails here instead of quietly re-burying the voices.
  describe('the speech carries over the debug-enabled drum mix (point 605)', () => {
    beforeEach(() => {
      balance.drumBed.enabled = true
      refreshAmbienceVolume()
    })
    afterEach(() => {
      balance.drumBed.enabled = false
      refreshAmbienceVolume()
    })
    /** The bus a spoken syllable lands on, and the master behind it. */
    const busOf = (voice: FakeOscillator): FakeGain => {
      const bus = envelopeOf(voice).connected[0] as FakeGain | undefined
      if (!bus) throw new Error('the voice envelope reaches no bus')
      return bus
    }
    const masterOf = (bus: FakeGain): FakeGain => {
      const m = bus.connected[0] as FakeGain | undefined
      if (!m) throw new Error('the bus reaches no master')
      return m
    }
    /** The ambient bus, via one of the bed's own emitters. */
    const ambientBusOf = (): FakeGain => {
      const before = ctx.sources.length
      playThunder(thunderDelaySeconds(3), 0.8)
      const clap = ctx.sources.slice(before)[0]
      const gain = (clap.connected[0] as FakeFilter).connected[0] as FakeGain
      const bus = gain.connected[0] as FakeGain | undefined
      if (!bus) throw new Error('the clap envelope reaches no bus')
      return bus
    }
    /** The drum bed's own layer gain, identified by the ONE ramp that separates
     *  standing IN a village from hearing it from outside — no assumption about
     *  the graph's build order. */
    const drumLayerGain = (): number => {
      setAmbienceScene({ region: 'central', mode: 'place', placeKind: null, nearVillage: true })
      const before = ctx.gains.map((g) => g.gain.events.length)
      setAmbienceScene({ region: 'central', mode: 'place', placeKind: 'village', nearVillage: false })
      const moved = ctx.gains.filter((g, i) => g.gain.events.length > before[i])
      expect(moved, 'exactly one layer separates the two scenes: the drums').toHaveLength(1)
      return moved[0].gain.value
    }
    /** One syllable spoken right beside the player, at the default volume — no
     *  option override, so the plan reads the shipped balance. */
    const syllableBesideThePlayer = (): { peak: number; bus: FakeGain } => {
      const before = ctx.oscillators.length
      playSpeech(utterancePlan(utteranceOf('DIG'), 0))
      const voice = ctx.oscillators.slice(before)[0]
      expect(voice, 'a villager beside the player schedules a voice').toBeDefined()
      const peak = Math.max(...envelopeOf(voice).gain.events.map((e) => e.value ?? 0))
      return { peak, bus: busOf(voice) }
    }

    /** The level the ear gets, on the two sides, at the master's input. */
    const measure = () => {
      refreshAmbienceVolume() // the live buses carry the shipped balance
      const drums = DRUM_BEAT_PEAK * drumLayerGain() * ambientBusOf().gain.value
      const { peak, bus } = syllableBesideThePlayer()
      return { drums, speech: peak * bus.gain.value * SYLLABLE_SYNTHESIS_GAIN, master: masterOf(bus).gain.value }
    }

    it('measures the syllables well ABOVE the drum bed, not under it', () => {
      ctx.currentTime = 240
      // The gains are the calibrated defaults; only the debug audition switch differs.
      expect(balance.ambienceVolume).toBe(0.1)
      expect(balance.ambientVolume).toBe(0.5)
      expect(balance.communication.speechVolume).toBe(2)
      expect(balance.drumBed.villageGain).toBe(0.42)
      const { drums, speech } = measure()
      expect(drums).toBeGreaterThan(0)
      // MEASURED: 3.24× the drum beat (0.612 against 0.189) at the pinned
      // synthesis gain. Under 1 is the reported bug; a shout is no fix either.
      expect(speech / drums).toBeGreaterThanOrEqual(1.6)
      expect(speech / drums).toBeLessThanOrEqual(4)
    })

    it('leaves the mix headroom — the loudest realistic moment stays under full scale', () => {
      ctx.currentTime = 260
      const { drums, speech, master } = measure()
      // A footstep, on its own bus, is the third voice in that moment.
      const before = ctx.sources.length
      emitFootstep('stone')
      const step = ctx.sources.slice(before)[0]
      const stepGain = (step.connected[0] as FakeFilter).connected[0] as FakeGain
      const stepBus = stepGain.connected[0] as FakeGain
      const footstep =
        Math.max(...stepGain.gain.events.map((e) => e.value ?? 0)) * stepBus.gain.value
      // Two villagers speaking right beside the player, over the drum bed, with
      // the player walking: MEASURED 0.76 of full scale after the master.
      expect((2 * speech + drums + footstep) * master).toBeLessThan(1)
    })
  })

  // Point 673 follows the shipped drum silence, so the calibration that closes
  // it measures the DEPLOYED village mix rather than turning the dormant bed
  // back on. The floor is deliberately conservative: all remaining active
  // layer gains are summed as though their peaks coincided, along with gain
  // modulation feeding those layers, before the common master gain. Real bird
  // and music envelopes can only make the instantaneous floor lower.
  it('puts a nearby syllable at least 8 dB above the remaining deployed village ambience', () => {
    ctx.currentTime = 280
    expect(balance.drumBed.enabled).toBe(false)
    setAmbienceScene({ region: 'central', mode: 'place', placeKind: 'village', nearVillage: false })
    refreshAmbienceVolume()

    // Find the ambient bus through a real ambient emitter, then select layer
    // nodes by their setTarget ramps rather than assuming graph build order.
    const beforeProbe = ctx.gains.length
    const beforeSources = ctx.sources.length
    playThunder(thunderDelaySeconds(3), 0.8)
    const clap = ctx.sources.slice(beforeSources)[0]
    const clapEnvelope = (clap.connected[0] as FakeFilter).connected[0] as FakeGain
    const ambientBus = clapEnvelope.connected[0] as FakeGain
    const activeLayers = ctx.gains
      .slice(0, beforeProbe)
      .filter((g) => g.connected[0] === ambientBus)
      .filter((g) => g.gain.value > 0 && g.gain.events.some((e) => e.type === 'cancel'))
    const activeParams = new Set(activeLayers.map((g) => g.gain))
    const modulation = ctx.gains
      .slice(0, beforeProbe)
      .filter((g) => activeParams.has(g.connected[0] as FakeParam))
      .reduce((sum, g) => sum + Math.max(0, g.gain.value), 0)
    const ambienceFloor = (
      activeLayers.reduce((sum, layer) => sum + layer.gain.value, 0) + modulation
    ) * ambientBus.gain.value

    const beforeSpeech = ctx.oscillators.length
    playSpeech(utterancePlan(utteranceOf('DIG'), 0))
    const voice = ctx.oscillators.slice(beforeSpeech)[0]
    const envelope = envelopeOf(voice)
    const speechBus = envelope.connected[0] as FakeGain
    const peak = Math.max(...envelope.gain.events.map((e) => e.value ?? 0))
    const speechPeak = peak * speechBus.gain.value * SYLLABLE_SYNTHESIS_GAIN
    const marginDb = 20 * Math.log10(speechPeak / ambienceFloor)

    // MEASURED at the default preset: 0.612 over 0.2275, a 2.69× / 8.59 dB
    // peak-to-floor margin. The explicit floor makes the promised margin the
    // failure boundary, not an incidental consequence of the chosen number.
    expect(ambienceFloor).toBeCloseTo(0.2275, 10)
    expect(speechPeak).toBeCloseTo(0.612, 10)
    expect(marginDb).toBeGreaterThanOrEqual(8)
  })
})
