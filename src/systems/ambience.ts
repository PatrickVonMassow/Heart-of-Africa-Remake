// Procedural ambience engine (design.md §19): regional soundscapes and a
// simple dynamic music layer, synthesized with WebAudio — no audio assets,
// no new dependencies. Layers crossfade on region and perspective changes.
// The context starts on the first user gesture (browser autoplay policy).

import type { RegionId } from '../world/geo'
import { balance } from '../config/balance'

export interface AmbienceScene {
  region: RegionId
  mode: 'travel' | 'place'
  placeKind: 'port' | 'village' | null
  /** Travel mode: a village is close by (drums carry over, design.md §19). */
  nearVillage: boolean
}

interface Layer {
  gain: GainNode
  target: number
}

const FADE = 1.6 // seconds

/** Coastal surf fade (point 153, design.md §19.1): the surf bed's gain by the
 *  distance (in degrees) to the nearest coast — full (1) within `nearRadius`,
 *  silent (0) at/beyond `cutoff`, a smooth monotone fall between. Pure, so the
 *  curve is unit-tested; the caller multiplies it into the surf layer target. */
export function coastSurfGain(coastDist: number, nearRadius: number, cutoff: number): number {
  if (coastDist <= nearRadius) return 1
  if (coastDist >= cutoff) return 0
  const t = (coastDist - nearRadius) / (cutoff - nearRadius) // 0 at the shore edge, 1 at the cutoff
  const s = t * t * (3 - 2 * t) // smoothstep
  return 1 - s
}
/** Base surf loudness at the shore (before the coast fade and the ambience
 *  volume) — the old port-only 0.22 is now the near-coast value. */
const SURF_BASE = 0.26

let ctx: AudioContext | null = null
let master: GainNode | null = null
// Two sub-buses under the master so footsteps and every other ambient sound can
// be balanced against each other (design.md §20; user request): footsteps ×2,
// all else ×0.5. Every layer/emitter routes through ambientBus, footsteps
// through footstepBus, so the split needs no per-emit change.
let footstepBus: GainNode | null = null
let ambientBus: GainNode | null = null
const layers: Record<string, Layer> = {}
let scene: AmbienceScene = { region: 'north', mode: 'place', placeKind: 'port', nearVillage: false }
let started = false

function layer(name: string): Layer {
  if (!ctx || !master) throw new Error('audio not started')
  let l = layers[name]
  if (!l) {
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(ambientBus ?? master)
    l = { gain, target: 0 }
    layers[name] = l
  }
  return l
}

function setTarget(name: string, value: number) {
  if (!ctx) return
  const l = layer(name)
  if (Math.abs(l.target - value) < 0.001) return
  l.target = value
  l.gain.gain.cancelScheduledValues(ctx.currentTime)
  l.gain.gain.setValueAtTime(l.gain.gain.value, ctx.currentTime)
  l.gain.gain.linearRampToValueAtTime(value, ctx.currentTime + FADE)
}

/** Looping noise source through a filter — wind, surf, murmur beds. */
function noiseBed(name: string, filterType: BiquadFilterType, freq: number, q = 0.8) {
  if (!ctx) return
  const l = layer(name)
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  for (let i = 0; i < data.length; i++) {
    // Pink-ish noise via a one-pole lowpass over white noise.
    const white = Math.random() * 2 - 1
    last = last * 0.94 + white * 0.06
    data[i] = last * 3.2
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  const filter = ctx.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = freq
  filter.Q.value = q
  src.connect(filter)
  filter.connect(l.gain)
  src.start()
}

// Gust/swell LFOs add gain on top of the layer targets, so they are a
// loudness source of their own; their depth is scaled by the single
// configurable ambience volume (design.md §21) and re-applied on changes.
// The surf gust is ALSO scaled by the coast proximity (point 153): its depth
// must fall to 0 inland too, or a faint swell would leak past the silenced
// surf target — the layer target alone would read 0 while the ear still heard it.
const wobbles: Array<{ name: string; gain: GainNode; baseDepth: number }> = []
/** The extra scale a wobble carries beyond the ambience volume (the surf gust
 *  follows the coast fade; everything else is 1). */
function wobbleExtra(name: string): number {
  return name === 'surf' ? coastProx : 1
}

/** Slow amplitude wobble on a layer (wind gusts, crowd swell). */
function wobble(name: string, rate: number, depth: number) {
  if (!ctx) return
  const l = layer(name)
  const lfo = ctx.createOscillator()
  lfo.frequency.value = rate
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = depth * balance.ambienceVolume * wobbleExtra(name)
  lfo.connect(lfoGain)
  lfoGain.connect(l.gain.gain)
  lfo.start()
  wobbles.push({ name, gain: lfoGain, baseDepth: depth })
}

function envOsc(
  dest: GainNode,
  type: OscillatorType,
  f0: number,
  f1: number,
  t0: number,
  dur: number,
  peak: number,
) {
  if (!ctx) return
  const osc = ctx.createOscillator()
  osc.type = type
  osc.frequency.setValueAtTime(f0, t0)
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t0 + dur)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(g)
  g.connect(dest)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/** Repeating randomized emitter, silent while its layer is faded out. */
function emitter(name: string, minDelay: number, maxDelay: number, emit: (dest: GainNode) => void) {
  const tick = () => {
    if (ctx && layers[name] && layers[name].gain.gain.value > 0.005) {
      emit(layers[name].gain)
    }
    setTimeout(tick, (minDelay + Math.random() * (maxDelay - minDelay)) * 1000)
  }
  setTimeout(tick, Math.random() * maxDelay * 1000)
}

/** Insect ticks: short bursts of high clicks. */
function emitInsects(dest: GainNode) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const n = 4 + Math.floor(Math.random() * 6)
  for (let i = 0; i < n; i++) {
    envOsc(dest, 'square', 4200 + Math.random() * 1600, 3800, t0 + i * 0.07, 0.03, 0.12)
  }
}

/** Jungle bird: two falling chirps. */
function emitBird(dest: GainNode) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const f = 1600 + Math.random() * 900
  envOsc(dest, 'sine', f, f * 0.6, t0, 0.18, 0.35)
  if (Math.random() < 0.7) envOsc(dest, 'sine', f * 1.12, f * 0.7, t0 + 0.24, 0.14, 0.28)
}

/** Distant monkey hoots: rising short calls. */
function emitMonkey(dest: GainNode) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const n = 2 + Math.floor(Math.random() * 3)
  for (let i = 0; i < n; i++) {
    envOsc(dest, 'sine', 320, 480 + i * 40, t0 + i * 0.28, 0.2, 0.16)
  }
}

/** One drum bar: low hits with a lighter off-beat (design.md §19 drums). */
function emitDrums(dest: GainNode) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const step = 0.24
  const pattern = [1, 0, 0.6, 0, 1, 0, 0.6, 0.4]
  pattern.forEach((v, i) => {
    if (v === 0) return
    const t = t0 + i * step
    envOsc(dest, 'sine', 130, 55, t, 0.22, 0.9 * v)
    if (v < 1) envOsc(dest, 'triangle', 320, 180, t, 0.08, 0.25)
  })
}

// Pentatonic roots per region for the sparse music phrases.
const MUSIC_ROOTS: Record<RegionId, number> = {
  north: 293.66, // D
  west: 196.0, // G
  central: 261.63, // C
  east: 329.63, // E
  south: 220.0, // A
}
const PENTATONIC = [1, 9 / 8, 5 / 4, 3 / 2, 5 / 3, 2]

/** Short kalimba-like phrase in the region's pentatonic. */
function emitMusic(dest: GainNode) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const root = MUSIC_ROOTS[scene.region]
  const notes = 3 + Math.floor(Math.random() * 4)
  let t = t0
  for (let i = 0; i < notes; i++) {
    const f = root * PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)]
    envOsc(dest, 'triangle', f, f * 0.995, t, 0.5, 0.3)
    t += 0.28 + Math.random() * 0.3
  }
}

/** Elephant trumpet: a rising brassy blare with a short fall. */
function emitTrumpet(dest: GainNode) {
  if (!ctx) return
  const t0 = ctx.currentTime
  envOsc(dest, 'sawtooth', 150, 430, t0, 0.5, 0.4)
  envOsc(dest, 'sawtooth', 430, 220, t0 + 0.5, 0.35, 0.3)
}

/** Lion roar: a low, slowly falling growl with a sub octave. */
function emitRoar(dest: GainNode) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const n = 2 + Math.floor(Math.random() * 2)
  let t = t0
  for (let i = 0; i < n; i++) {
    envOsc(dest, 'sawtooth', 130, 78, t, 0.7, 0.5)
    envOsc(dest, 'sine', 65, 42, t, 0.7, 0.35)
    t += 0.55 + Math.random() * 0.25
  }
}

/** Grazer call: short zebra bark / antelope snort, a couple of clipped notes. */
function emitGrazer(dest: GainNode) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const n = 1 + Math.floor(Math.random() * 3)
  for (let i = 0; i < n; i++) {
    envOsc(dest, 'square', 520 + Math.random() * 220, 260, t0 + i * 0.16, 0.12, 0.18)
  }
}

/** Wading-flock chatter: soft high honks from a flamingo lagoon. */
function emitFlock(dest: GainNode) {
  if (!ctx) return
  const t0 = ctx.currentTime
  const n = 3 + Math.floor(Math.random() * 4)
  for (let i = 0; i < n; i++) {
    envOsc(dest, 'triangle', 900 + Math.random() * 500, 700, t0 + i * 0.1, 0.09, 0.1)
  }
}

// Coast proximity (point 153): 0 = far inland (no surf), 1 = at the shore, set
// by the ambience controller from the distance to the nearest coast. Re-applied
// on a move and on a volume change so the surf fades as the traveller leaves the
// sea. Its curve (coastSurfGain) is computed by the caller and clamped here.
let coastProx = 0

// Nearby-animal proximity (0 = none/far, 1 = right beside the player), set each
// frame by the travel scene; re-applied on a volume change (design.md §19/§21).
const animalProx: Record<'elephant' | 'lion' | 'grazer' | 'flock', number> = {
  elephant: 0,
  lion: 0,
  grazer: 0,
  flock: 0,
}

function applyAnimalTargets() {
  if (!ctx) return
  const vol = balance.ambienceVolume
  const inPlace = scene.mode === 'place'
  setTarget('aniElephant', inPlace ? 0 : animalProx.elephant * 0.6 * vol)
  setTarget('aniLion', inPlace ? 0 : animalProx.lion * 0.7 * vol)
  setTarget('aniGrazer', inPlace ? 0 : animalProx.grazer * 0.5 * vol)
  setTarget('aniFlock', inPlace ? 0 : animalProx.flock * 0.45 * vol)
}

/** Surf gain from the coast proximity (point 153): the shore bed scaled by the
 *  coast fade and the single ambience volume. Called from applyScene and on a
 *  coast-proximity change. */
function applySurfTarget() {
  if (!ctx) return
  setTarget('surf', SURF_BASE * coastProx * balance.ambienceVolume)
  // The surf gust follows the same coast fade, or it would swell inland where
  // the bed itself is silent.
  for (const w of wobbles) if (w.name === 'surf') w.gain.gain.value = w.baseDepth * balance.ambienceVolume * coastProx
}

function buildGraph() {
  if (!ctx) return
  master = ctx.createGain()
  master.gain.value = 0.5
  master.connect(ctx.destination)
  // Footstep and ambient sub-buses (design.md §20): footsteps twice as loud,
  // every other ambient sound half as loud, both under the master volume.
  ambientBus = ctx.createGain()
  ambientBus.gain.value = balance.ambientVolume
  ambientBus.connect(master)
  footstepBus = ctx.createGain()
  footstepBus.gain.value = balance.footstepVolume
  footstepBus.connect(master)

  noiseBed('wind', 'lowpass', 420)
  wobble('wind', 0.13, 0.35)
  noiseBed('surf', 'bandpass', 620, 0.6)
  wobble('surf', 0.09, 0.5)
  noiseBed('murmur', 'bandpass', 480, 1.4)
  wobble('murmur', 0.35, 0.3)

  layer('insects')
  layer('birds')
  layer('drums')
  layer('music')
  layer('aniElephant')
  layer('aniLion')
  layer('aniGrazer')
  layer('aniFlock')
  emitter('insects', 0.4, 1.6, emitInsects)
  emitter('birds', 1.8, 6, emitBird)
  emitter('birds', 7, 18, emitMonkey)
  emitter('drums', 2.2, 2.2, emitDrums) // continuous bars while audible
  emitter('music', 9, 22, emitMusic)
  emitter('aniElephant', 3, 9, emitTrumpet)
  emitter('aniLion', 4, 11, emitRoar)
  emitter('aniGrazer', 1.6, 5, emitGrazer)
  emitter('aniFlock', 2, 6, emitFlock)
}

/** Gain targets per scene (region × perspective). */
function applyScene() {
  if (!ctx) return
  const { region, mode, placeKind, nearVillage } = scene
  const inPlace = mode === 'place'
  const village = inPlace && placeKind === 'village'
  const port = inPlace && placeKind === 'port'

  const windByRegion: Record<RegionId, number> = {
    north: 0.4,
    west: 0.14,
    central: 0.08,
    east: 0.2,
    south: 0.18,
  }
  // Every ambience layer is scaled by the single configurable ambience volume
  // (design.md §21; default 0.1).
  const noise = balance.ambienceVolume
  setTarget('wind', (inPlace ? 0.1 : windByRegion[region]) * noise)
  // Surf is coastal (point 153): the coast fade drives it in both travel and
  // port, so an inland-ish port hears less of it and travel near the sea hears
  // it at all — no longer a flat port-only bed.
  applySurfTarget()
  setTarget('murmur', (port ? 0.3 : 0) * noise)
  setTarget('insects', !port && (region === 'west' || region === 'south' || region === 'east') ? (inPlace ? 0.12 : 0.2) : 0)
  // Birdsong carries its own per-source volume (point 153).
  setTarget('birds', (!port && region === 'central' ? (inPlace ? 0.25 : 0.4) : 0) * balance.birdsongVolume)
  setTarget('drums', village ? 0.5 : nearVillage ? 0.18 : 0)
  setTarget('music', inPlace ? 0.16 : 0.1)
  applyAnimalTargets()
}

/**
 * A single footstep (point 97): a short filtered-noise impulse through the
 * master bus, so it respects the single ambience volume like every other
 * sound. Duller and softer on open ground/sand, harder and brighter on a
 * stone/clay path. One-shot — no layer, no scheduling.
 */
export function emitFootstep(surface: 'ground' | 'stone') {
  if (!ctx || !master) return
  const t0 = ctx.currentTime
  const dur = surface === 'stone' ? 0.09 : 0.13
  const buffer = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * dur)), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = surface === 'stone' ? 1400 : 680
  filter.Q.value = surface === 'stone' ? 1.2 : 0.7
  const g = ctx.createGain()
  const peak = (surface === 'stone' ? 0.5 : 0.38) * balance.ambienceVolume
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + 0.006)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(filter)
  filter.connect(g)
  g.connect(footstepBus ?? master)
  src.start(t0)
  src.stop(t0 + dur + 0.02)
}

/**
 * The thunderclap's pure timing/level plan (design.md §19.13, point 166): the
 * clap starts exactly `delaySeconds` after the flash (the pure
 * thunderDelaySeconds lag) and its two voices — a mid-band CRACK small
 * speakers can render and a long low RUMBLE — are scaled by the strike
 * strength and the single ambience volume (0 => silent). Pure, so the
 * flash->thunder pairing is unit-testable without WebAudio.
 */
export interface ThunderPlan {
  /** Seconds after "now" the clap starts — the flash->thunder lag, >= 0. */
  startOffset: number
  /** Envelope peak of the sharp mid-band onset (pre-bus gain). */
  crackPeak: number
  crackDuration: number
  /** Envelope peak of the low rolling tail (pre-bus gain). */
  rumblePeak: number
  rumbleDuration: number
}

// The clap must survive the ambient-bus (0.5) and master (0.5) attenuation and
// read over the storm's own rain/wind beds. The first synthesis peaked at
// 0.9 × strength × ambienceVolume over an unnormalized ~0.4-amplitude buffer,
// entirely below 220 Hz — after the ×0.25 bus chain that landed near -45 dBFS
// of sub-bass: scheduled, but inaudible on real speakers (the reported
// "lightning without thunder"). These peaks compensate the bus chain; the
// buffers are normalized so the envelope alone sets the level.
const THUNDER_CRACK_PEAK = 9
const THUNDER_RUMBLE_PEAK = 5.5

export function thunderClapPlan(delaySeconds: number, strength: number, volume: number): ThunderPlan {
  const s = Math.min(1, Math.max(0, strength))
  const v = Math.max(0, volume)
  return {
    startOffset: Math.max(0, delaySeconds),
    crackPeak: THUNDER_CRACK_PEAK * s * v,
    crackDuration: 0.32,
    rumblePeak: THUNDER_RUMBLE_PEAK * s * v,
    rumbleDuration: 4.5,
  }
}

/** A normalized one-shot noise buffer (peak ~1): white for the crack, deep
 *  brown-ish for the rumble. Normalized so the gain envelope alone sets the
 *  level — the old raw brown chain's ~0.4 amplitude was part of the silence. */
function noiseBuffer(ac: AudioContext, dur: number, brown: boolean): AudioBuffer {
  const buffer = ac.createBuffer(1, Math.max(1, Math.ceil(ac.sampleRate * dur)), ac.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  let peak = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    data[i] = brown ? (last = last * 0.985 + white * 0.015) : white
    const a = Math.abs(data[i])
    if (a > peak) peak = a
  }
  if (peak > 0) for (let i = 0; i < data.length; i++) data[i] /= peak
  return buffer
}

/** One clap voice: normalized noise -> filter -> envelope -> the ambient bus. */
function clapVoice(
  ac: AudioContext,
  dest: AudioNode,
  t0: number,
  dur: number,
  brown: boolean,
  filterType: BiquadFilterType,
  freq: number,
  q: number,
  shape: (gain: AudioParam) => void,
) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, dur, brown)
  const filter = ac.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = freq
  filter.Q.value = q
  const g = ac.createGain()
  shape(g.gain)
  src.connect(filter)
  filter.connect(g)
  g.connect(dest)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

/**
 * A single thunderclap (design.md §19.13, point 166), played DELAYED after its
 * lightning flash so the pair reads as weather, not a sound effect. Scheduled
 * entirely on the AudioContext clock (src.start(t0), envelopes at t0), so a
 * re-render or state change between flash and clap can never cancel it — there
 * is no JS timer to lose. Two voices through the ambient bus: a sharp mid-band
 * CRACK (audible on small speakers with no deep bass) and a long low ROLLING
 * tail, both scaled by the strike strength and the single ambience volume.
 */
export function playThunder(delaySeconds: number, strength = 1): void {
  const plan = thunderClapPlan(delaySeconds, strength, balance.ambienceVolume)
  // Probe (dev/verify): count every strike even without a running audio context
  // (headless has no gesture), and SEPARATELY count the actually scheduled
  // claps with their level — so the live gate proves audio output, not only
  // that the counter moved (the old counter-only probe stayed green while the
  // clap was inaudible).
  const probe =
    import.meta.env.DEV && typeof window !== 'undefined'
      ? ((window as unknown as { __thunder?: { count: number; lastDelay: number; audio: number; lastPeak: number } }).__thunder ??= {
          count: 0,
          lastDelay: 0,
          audio: 0,
          lastPeak: 0,
        })
      : null
  if (probe) {
    probe.count++
    probe.lastDelay = delaySeconds
  }
  if (!ctx || !master) return
  const ac = ctx
  const dest = ambientBus ?? master
  const t0 = ac.currentTime + plan.startOffset
  // The crack: a hard mid-band onset — the part a laptop speaker can render.
  clapVoice(ac, dest, t0, plan.crackDuration, false, 'bandpass', 1800, 0.8, (gain) => {
    gain.setValueAtTime(0.0001, t0)
    gain.linearRampToValueAtTime(Math.max(0.0001, plan.crackPeak), t0 + 0.02)
    gain.exponentialRampToValueAtTime(0.0001, t0 + plan.crackDuration)
  })
  // The rumble: the deep rolling tail under it.
  clapVoice(ac, dest, t0, plan.rumbleDuration, true, 'lowpass', 380, 0.5, (gain) => {
    gain.setValueAtTime(0.0001, t0)
    gain.linearRampToValueAtTime(Math.max(0.0001, plan.rumblePeak), t0 + 0.08)
    gain.exponentialRampToValueAtTime(Math.max(0.0001, plan.rumblePeak * 0.5), t0 + 1.2)
    gain.exponentialRampToValueAtTime(0.0001, t0 + plan.rumbleDuration)
  })
  if (probe) {
    probe.audio++
    probe.lastPeak = Math.max(plan.crackPeak, plan.rumblePeak)
  }
}

/** Report the closest wildlife to the player (design.md §19): each field is a
 *  0..1 proximity that raises that voice's calls, scaled by the ambience
 *  volume. Called every frame by the travel scene while animals are near. */
export function setAmbienceAnimals(next: Record<'elephant' | 'lion' | 'grazer' | 'flock', number>) {
  let changed = false
  for (const k of ['elephant', 'lion', 'grazer', 'flock'] as const) {
    const v = Math.max(0, Math.min(1, next[k]))
    if (Math.abs(v - animalProx[k]) > 0.02) {
      animalProx[k] = v
      changed = true
    }
  }
  if (changed && ctx) applyAnimalTargets()
}

/** Report the traveller's coast proximity (point 153): 0 far inland, 1 at the
 *  shore — the surf fades with it. Called from the ambience controller each
 *  sync with coastSurfGain(distance). */
export function setAmbienceCoast(prox: number) {
  const v = Math.max(0, Math.min(1, prox))
  if (Math.abs(v - coastProx) < 0.02) return
  coastProx = v
  if (ctx) applySurfTarget()
}

/** Start the engine on the first user gesture; safe to call repeatedly. */
export function startAmbience() {
  if (started) {
    if (ctx?.state === 'suspended') void ctx.resume()
    return
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return // no WebAudio support: ambience silently disabled
  started = true
  ctx = new Ctor()
  buildGraph()
  applyScene()
}

/** Re-apply the gain targets after a volume change in the debug menu. */
export function refreshAmbienceVolume() {
  if (!ctx) return
  applyScene()
  for (const w of wobbles) w.gain.gain.value = w.baseDepth * balance.ambienceVolume * wobbleExtra(w.name)
  if (ambientBus) ambientBus.gain.value = balance.ambientVolume
  if (footstepBus) footstepBus.gain.value = balance.footstepVolume
}

/** Update the ambience to the current game situation. */
export function setAmbienceScene(next: AmbienceScene) {
  const changed =
    next.region !== scene.region ||
    next.mode !== scene.mode ||
    next.placeKind !== scene.placeKind ||
    next.nearVillage !== scene.nearVillage
  scene = next
  if (changed && ctx) applyScene()
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__ambience = {
    start: () => startAmbience(),
    started: () => started,
    layerTarget: (name: string) => layers[name]?.target ?? 0,
    animalProx: () => ({ ...animalProx }),
    setCoast: (prox: number) => setAmbienceCoast(prox),
    coastProx: () => coastProx,
    setScene: (next: AmbienceScene) => setAmbienceScene(next),
    refresh: () => refreshAmbienceVolume(),
    surfWobble: () => wobbles.find((w) => w.name === 'surf')?.gain.gain.value ?? 0,
  }
}
