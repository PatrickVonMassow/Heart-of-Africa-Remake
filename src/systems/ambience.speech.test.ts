// The spoken syllable, MEASURED (point 587). The user heard "nur Gequäke" —
// a squawk with no pitch in it — and no test noticed, because every test asked
// about the graph (how many oscillators, which carrier) and none about the
// SOUND. This one renders the real `speakSyllable` chain offline and analyses
// the spectrum, so the three properties the language stands on are asserted on
// the signal itself:
//   1. the FUNDAMENTAL of each tone is present — pitch is the whole language,
//      and the old lone bandpass at 820 Hz threw it away;
//   2. the vowel is the SAME in both tones — the formants stay put and only the
//      pitch moves (docs/communication-poc-spec.md: "differing in PITCH alone");
//   3. a pitch estimate over the rendered buffer returns the two carriers.
//
// The offline context below is a minimal WebAudio model (band-limited sawtooth,
// RBJ biquads, scheduled gain envelopes) — jsdom has no OfflineAudioContext and
// a native one would be a new dependency. It is deliberately small: the code
// under test is the SHIPPED function, driven through the same node interface.
import { describe, expect, it } from 'vitest'
import { speakSyllable, syllableCarrier } from './ambience'
import type { Tone } from '../communication/lexicon'

const SR = 24000

/** An AudioParam: the scheduled events, read back at a time. */
class Param {
  private events: Array<{ type: 'set' | 'lin' | 'exp'; value: number; time: number }> = []
  private base = 0
  get value(): number {
    return this.base
  }
  set value(v: number) {
    this.base = v
  }
  setValueAtTime(v: number, t: number) {
    this.events.push({ type: 'set', value: v, time: t })
    return this
  }
  linearRampToValueAtTime(v: number, t: number) {
    this.events.push({ type: 'lin', value: v, time: t })
    return this
  }
  exponentialRampToValueAtTime(v: number, t: number) {
    this.events.push({ type: 'exp', value: v, time: t })
    return this
  }
  at(t: number): number {
    if (this.events.length === 0) return this.base
    if (t <= this.events[0].time) return this.events[0].value
    let prev = this.events[0]
    for (let i = 1; i < this.events.length; i++) {
      const e = this.events[i]
      if (t <= e.time) {
        if (e.type === 'set') return prev.value
        const span = e.time - prev.time
        const f = span > 0 ? (t - prev.time) / span : 1
        if (e.type === 'lin') return prev.value + (e.value - prev.value) * f
        const a = Math.max(1e-7, prev.value)
        const b = Math.max(1e-7, e.value)
        return a * Math.pow(b / a, f)
      }
      prev = e
    }
    return prev.value
  }
}

/** A node of the offline graph. The chain is a tree, so every node renders
 *  exactly once per sample and may keep its own state. */
abstract class Node {
  readonly inputs: Node[] = []
  connect(dest: Node): Node {
    dest.inputs.push(this)
    return dest
  }
  disconnect() {}
  protected sum(t: number, dt: number): number {
    let s = 0
    for (const n of this.inputs) s += n.render(t, dt)
    return s
  }
  abstract render(t: number, dt: number): number
}

class Sum extends Node {
  render(t: number, dt: number): number {
    return this.sum(t, dt)
  }
}

/** Band-limited sawtooth/triangle — additive, so the spectrum carries no
 *  aliases a naive ramp would fold back onto the formants. */
class Oscillator extends Node {
  type = 'sawtooth'
  frequency = new Param()
  private phase = 0
  private startAt = 0
  private stopAt = Infinity
  start(t = 0) {
    this.startAt = t
  }
  stop(t = 0) {
    this.stopAt = t
  }
  render(t: number, dt: number): number {
    const f = Math.max(1, this.frequency.at(t))
    this.phase = (this.phase + f * dt) % 1
    if (t < this.startAt || t > this.stopAt) return 0
    const kMax = Math.max(1, Math.floor(SR / 2 / f))
    let v = 0
    for (let k = 1; k <= kMax; k++) v += Math.sin(2 * Math.PI * k * this.phase) / k
    return (2 / Math.PI) * v
  }
}

/** RBJ biquad, direct form I, coefficients recomputed per sample (the formant
 *  frequencies ramp during the `b` onset). */
class Biquad extends Node {
  type = 'peaking'
  frequency = new Param()
  Q = new Param()
  gain = new Param()
  private x1 = 0
  private x2 = 0
  private y1 = 0
  private y2 = 0
  render(t: number, dt: number): number {
    const x = this.sum(t, dt)
    const w = (2 * Math.PI * Math.max(1, this.frequency.at(t))) / SR
    const q = Math.max(1e-4, this.Q.at(t))
    const cw = Math.cos(w)
    const al = Math.sin(w) / (2 * q)
    let b0: number, b1: number, b2: number, a0: number, a1: number, a2: number
    if (this.type === 'peaking') {
      const A = Math.pow(10, this.gain.at(t) / 40)
      b0 = 1 + al * A
      b1 = -2 * cw
      b2 = 1 - al * A
      a0 = 1 + al / A
      a1 = -2 * cw
      a2 = 1 - al / A
    } else if (this.type === 'lowpass') {
      b0 = (1 - cw) / 2
      b1 = 1 - cw
      b2 = (1 - cw) / 2
      a0 = 1 + al
      a1 = -2 * cw
      a2 = 1 - al
    } else if (this.type === 'bandpass') {
      b0 = al
      b1 = 0
      b2 = -al
      a0 = 1 + al
      a1 = -2 * cw
      a2 = 1 - al
    } else {
      throw new Error(`the offline model has no "${this.type}" filter`)
    }
    const y = (b0 * x + b1 * this.x1 + b2 * this.x2 - a1 * this.y1 - a2 * this.y2) / a0
    this.x2 = this.x1
    this.x1 = x
    this.y2 = this.y1
    this.y1 = y
    return y
  }
}

class Gain extends Node {
  gain = new Param()
  render(t: number, dt: number): number {
    return this.sum(t, dt) * this.gain.at(t)
  }
}

class OfflineCtx {
  currentTime = 0
  sampleRate = SR
  destination = new Sum()
  createOscillator() {
    return new Oscillator()
  }
  createBiquadFilter() {
    return new Biquad()
  }
  createGain() {
    return new Gain()
  }
  render(seconds: number): Float64Array {
    const n = Math.round(seconds * SR)
    const out = new Float64Array(n)
    const dt = 1 / SR
    for (let i = 0; i < n; i++) out[i] = this.destination.render(i * dt, dt)
    return out
  }
}

const DUR = 0.186 // one syllable at the shipped pace (0.3 s step × 0.62 duty)

/** Render ONE syllable of the given tone through the shipped synthesis. */
function renderSyllable(tone: Tone): Float64Array {
  const ctx = new OfflineCtx()
  speakSyllable(
    ctx as unknown as AudioContext,
    ctx.destination as unknown as AudioNode,
    0,
    tone,
    DUR,
    1,
  )
  return ctx.render(DUR)
}

/** Magnitude of the Hann-windowed buffer at one frequency (a single DFT bin at
 *  an arbitrary frequency — no FFT grid to fall between). */
function magnitudeAt(buf: Float64Array, f: number): number {
  let re = 0
  let im = 0
  const n = buf.length
  for (let i = 0; i < n; i++) {
    const w = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1))
    const a = (2 * Math.PI * f * i) / SR
    re += buf[i] * w * Math.cos(a)
    im += buf[i] * w * Math.sin(a)
  }
  return Math.hypot(re, im) / n
}

const GRID_FROM = 60
const GRID_TO = 3000
const GRID_STEP = 10
const GRID: number[] = []
for (let f = GRID_FROM; f <= GRID_TO; f += GRID_STEP) GRID.push(f)

function spectrum(buf: Float64Array): number[] {
  return GRID.map((f) => magnitudeAt(buf, f))
}

/** The spectral ENVELOPE: a harmonic source peaks at every harmonic, so the
 *  formants are the shape OVER them — a moving max wider than the fundamental,
 *  smoothed. This is what must be identical for the two tones. */
function envelope(mags: number[], f0: number): number[] {
  const halfMax = Math.max(2, Math.round(f0 / GRID_STEP / 2) + 1)
  const maxed = mags.map((_, i) => {
    let m = 0
    for (let j = Math.max(0, i - halfMax); j <= Math.min(mags.length - 1, i + halfMax); j++) {
      m = Math.max(m, mags[j])
    }
    return m
  })
  const halfAvg = 4
  return maxed.map((_, i) => {
    let s = 0
    let c = 0
    for (let j = Math.max(0, i - halfAvg); j <= Math.min(maxed.length - 1, i + halfAvg); j++) {
      s += maxed[j]
      c++
    }
    return s / c
  })
}

/** Local maxima of the envelope in the FORMANT band, strongest first. The band
 *  starts above the fundamentals: a voice's F1 never sits at its own pitch, and
 *  the fundamental is asserted on its own above. */
const FORMANT_FROM = 450
const FORMANT_TO = 2600
function envelopePeaks(env: number[]): number[] {
  const peaks: Array<{ hz: number; level: number }> = []
  for (let i = 1; i < env.length - 1; i++) {
    if (GRID[i] < FORMANT_FROM || GRID[i] > FORMANT_TO) continue
    if (env[i] > env[i - 1] && env[i] >= env[i + 1]) peaks.push({ hz: GRID[i], level: env[i] })
  }
  return peaks.sort((a, b) => b.level - a.level).map((p) => p.hz)
}

/** Pearson correlation of two curves in dB — "is this the same vowel?". */
function correlation(a: number[], b: number[], from: number, to: number): number {
  const idx = GRID.map((f, i) => (f >= from && f <= to ? i : -1)).filter((i) => i >= 0)
  const la = idx.map((i) => Math.log10(Math.max(1e-9, a[i])))
  const lb = idx.map((i) => Math.log10(Math.max(1e-9, b[i])))
  const ma = la.reduce((s, v) => s + v, 0) / la.length
  const mb = lb.reduce((s, v) => s + v, 0) / lb.length
  let num = 0
  let da = 0
  let db = 0
  for (let i = 0; i < la.length; i++) {
    num += (la[i] - ma) * (lb[i] - mb)
    da += (la[i] - ma) ** 2
    db += (lb[i] - mb) ** 2
  }
  return num / Math.sqrt(da * db)
}

/** Autocorrelation pitch over the vowel body: the SMALLEST lag within 90 % of
 *  the best correlation, so an octave-doubled lag cannot win. */
function pitchHz(buf: Float64Array): number {
  const seg = buf.subarray(Math.round(0.04 * SR), Math.round(0.14 * SR))
  const minLag = Math.floor(SR / 400)
  const maxLag = Math.floor(SR / 70)
  const corr: number[] = []
  for (let lag = minLag; lag <= maxLag; lag++) {
    let s = 0
    for (let i = 0; i + lag < seg.length; i++) s += seg[i] * seg[i + lag]
    corr.push(s / (seg.length - lag))
  }
  const best = Math.max(...corr)
  const first = corr.findIndex((v) => v >= 0.9 * best)
  return SR / (minLag + first)
}

describe('the spoken syllable is a VOICE, measured on the rendered signal (point 587)', () => {
  const low = renderSyllable('low')
  const high = renderSyllable('high')
  const carrierLow = syllableCarrier('low')
  const carrierHigh = syllableCarrier('high')
  const magLow = spectrum(low)
  const magHigh = spectrum(high)

  /** Strongest magnitude in a band, and the whole band's maximum. */
  const bandMax = (mags: number[], from: number, to: number) =>
    Math.max(...GRID.map((f, i) => (f >= from && f <= to ? mags[i] : 0)))

  it('keeps the FUNDAMENTAL of both tones in the spectrum — the pitch is not filtered away', () => {
    // The carrier falls slightly across the syllable, so the fundamental is a
    // narrow band rather than a line.
    for (const [name, mags, f0] of [
      ['low', magLow, carrierLow],
      ['high', magHigh, carrierHigh],
    ] as const) {
      const fundamental = bandMax(mags, f0 * 0.9, f0 * 1.05)
      const loudest = bandMax(mags, GRID_FROM, GRID_TO)
      // MEASURED: 1.00 (low) and 0.95 (high) with the voiced source; the old
      // lone bandpass at 820 Hz left 0.33 and 0.39 — the pitch was a side
      // effect of the timbre, which is exactly what the user heard.
      expect(fundamental / loudest, `${name}: fundamental vs. loudest component`).toBeGreaterThan(0.6)
    }
  })

  it('speaks the SAME vowel in both tones — the formants do not move with the pitch', () => {
    const envLow = envelope(magLow, carrierLow)
    const envHigh = envelope(magHigh, carrierHigh)
    // The spectral envelope IS the vowel: two tones of one syllable must draw
    // the same shape. The old code moved its single resonance 820 → 1240 Hz.
    // MEASURED: 0.97 for the shared vowel; the old moving formant gave 0.80.
    expect(correlation(envLow, envHigh, 300, 2600)).toBeGreaterThan(0.9)
    const peaksLow = envelopePeaks(envLow).slice(0, 2).sort((a, b) => a - b)
    const peaksHigh = envelopePeaks(envHigh).slice(0, 2).sort((a, b) => a - b)
    expect(peaksLow.length, 'the vowel needs at least two resonances').toBe(2)
    expect(peaksHigh.length, 'the vowel needs at least two resonances').toBe(2)
    for (let i = 0; i < 2; i++) {
      // Resolution limit: an envelope over a harmonic source can only place a
      // formant to about half the fundamental, so the tolerance is that wide.
      expect(Math.abs(peaksLow[i] - peaksHigh[i]), `formant ${i + 1} moved with the tone`).toBeLessThan(140)
    }
    // …and they sit on the vowel `a` (F1 730 / F2 1090 Hz), not somewhere else.
    expect(Math.abs(peaksLow[0] - 730)).toBeLessThan(150)
    expect(Math.abs(peaksLow[1] - 1090)).toBeLessThan(150)
  })

  // Point 605: the speech default is calibrated against the drums, and that
  // arithmetic needs the ONE number the node graph does not carry — how much
  // signal a syllable's own synthesis puts out per unit of envelope peak. The
  // vowel's three peaking filters (+15/+13/+9 dB) sit BEFORE the envelope, so
  // the rendered wave is louder than the peak the plan schedules. Measured on
  // the shipped chain and pinned here; src/systems/ambience.test.ts names the
  // same number as SYLLABLE_SYNTHESIS_GAIN when it weighs the speech bus
  // against the drums, and a synthesis change that moves the loudness fails
  // here instead of quietly re-burying the voices.
  it('puts out ~2× its scheduled envelope peak — the vowel formants are a gain (point 605)', () => {
    const peakOf = (buf: Float64Array) => buf.reduce((m, v) => Math.max(m, Math.abs(v)), 0)
    // MEASURED: 1.99 (low), 2.07 (high) at an envelope peak of 1.
    for (const [name, buf] of [['low', low], ['high', high]] as const) {
      expect(peakOf(buf), `${name}: output per unit envelope peak`).toBeGreaterThan(1.7)
      expect(peakOf(buf), `${name}: output per unit envelope peak`).toBeLessThan(2.4)
    }
  })

  it('is PITCHED: an estimate over the rendered buffer returns the two carriers', () => {
    expect(pitchHz(low) / carrierLow).toBeGreaterThan(0.92)
    expect(pitchHz(low) / carrierLow).toBeLessThan(1.08)
    expect(pitchHz(high) / carrierHigh).toBeGreaterThan(0.92)
    expect(pitchHz(high) / carrierHigh).toBeLessThan(1.08)
    // And the two are far enough apart to be told apart by ear at speaking pace.
    expect(carrierHigh / carrierLow).toBeGreaterThan(1.4)
  })
})
