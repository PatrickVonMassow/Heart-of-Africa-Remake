// Coastal surf fade (point 153, design.md §19.1): the surf bed is only audible
// near the coast — full at the shore, silent beyond a calibratable cutoff, and
// monotone between. The curve is pure, so it is pinned here.
// Plus the thunderclap (design.md §19.13, point 166): the clap plan is pure,
// and a fake AudioContext pins that a flash SCHEDULES the clap at the pure
// thunderDelaySeconds lag on the audio clock and SURVIVES to fire — no later
// frame or ambience state change can cancel it.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import {
  coastSurfGain,
  playThunder,
  proximityGain,
  refreshAmbienceVolume,
  setAmbienceAnimals,
  setAmbienceScene,
  startAmbience,
  thunderClapPlan,
  trampleCrunchFires,
  trampleCrunchGain,
  PROXIMITY_AUDIBLE,
} from './ambience'
import { thunderDelaySeconds } from './season'
import { balance } from '../config/balance'

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
}
class FakeOscillator extends FakeNode {
  type = ''
  frequency = new FakeParam()
  start() {}
  stop() {}
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
  constructor() {
    FakeCtx.last = this
  }
  createGain() {
    return new FakeGain()
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
  createOscillator() {
    return new FakeOscillator()
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
