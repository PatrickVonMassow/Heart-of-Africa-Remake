// Procedural ambience engine (design.md §19): regional soundscapes and a
// simple dynamic music layer, synthesized with WebAudio — no audio assets,
// no new dependencies. Layers crossfade on region and perspective changes.
// The context starts on the first user gesture (browser autoplay policy).

import type { PlaceKind, RegionId } from '../world/geo'
import { balance } from '../config/balance'
import { devAssert } from './devAssert'
import type { Tone } from '../communication/lexicon'
import { phrasePlan, utterancePlan, type SpeechPlan } from '../communication/speaking'
import type { DrumId, DrumMessagePlan } from '../communication/drumMessage'

export interface AmbienceScene {
  region: RegionId
  mode: 'travel' | 'place'
  /** null in travel; a monument uses the region's ambient bed (no bustle). */
  placeKind: PlaceKind | null
  /** Travel mode: a village is close by (drums carry over, design.md §19). */
  nearVillage: boolean
  /** The village heard here, in-place or nearby. It gives the otherwise
   *  meaningless drum bed a stable local tempo and pitch. */
  villageId?: string | null
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
// THREE sub-buses under the master so footsteps, the village speech and every
// other ambient sound can be balanced against each other (design.md §19.1/§20;
// user request): footsteps ×2, all else ×0.5. Every layer/emitter routes through
// ambientBus, footsteps through footstepBus, so the split needs no per-emit
// change.
let footstepBus: GainNode | null = null
let ambientBus: GainNode | null = null
// The speech bus is the third (point 577). The syllables are the one sound the
// player MUST hear — the whole communication PoC is learned from them — so they
// may not hang on the slider labelled "everything ELSE", which the game's own
// advice (turn the bed down to hear the voices over the drums) leads the player
// to set to zero. It carries the SAME level the speech had on the ambient bus,
// so the split moved the routing and left the mix where it was.
let speechBus: GainNode | null = null
const layers: Record<string, Layer> = {}
let scene: AmbienceScene = { region: 'north', mode: 'place', placeKind: 'port', nearVillage: false }
let started = false
let drumPreviousPattern: number | null = null
let drumBarOrdinal = 0
let drumVisitStartedAt = 0

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

/** Envelope peak of the LOUDEST beat of the village drum bed, before its layer
 *  gain and the ambient bus. Exported because it is the level the village
 *  speech has to carry through: the mix check measures the speech bus against
 *  it (point 605). */
export const DRUM_BEAT_PEAK = 0.9

/** Composed rhythms, not calibration: zeroes are rests and the other values
 *  are relative accents. Tuning their pace, voice, dynamics and spacing lives
 *  in `balance.drumBed`; these figures only say which rhythm is played. Every
 *  figure is at least half rest, keeping air inside even a two-bar phrase. */
export const DRUM_BED_PATTERNS: ReadonlyArray<ReadonlyArray<number>> = [
  [1, 0, 0.52, 0, 0.78, 0, 0.38, 0],
  [1, 0, 0, 0.42, 0.72, 0, 0.55, 0],
  [0.76, 0, 0.44, 0, 1, 0, 0, 0.34],
  [1, 0, 0.36, 0.58, 0, 0, 0.68, 0],
]

export interface DrumBedHit {
  startOffset: number
  peak: number
  pitchStartHz: number
  pitchEndHz: number
}

export interface DrumBedPhrasePlan {
  patternIndices: number[]
  hits: DrumBedHit[]
  restShare: number
  tempoScale: number
  pitchScale: number
  /** From this phrase's first hit to the next phrase's first hit. */
  nextDelaySeconds: number
}

/** Stable 0..1 hash: the village character must not change every bar or visit. */
function villageUnit(villageId: string, salt: string): number {
  let h = 2166136261
  for (const c of `${villageId}:${salt}`) {
    h ^= c.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

/** The slight, stable tempo/pitch signature that separates villages without
 *  turning the meaningless bed into one of the semantic message figures. */
export function drumBedVillageSpread(villageId: string, tempoSpread: number, pitchSpread: number) {
  const signed = (salt: string) => villageUnit(villageId, salt) * 2 - 1
  return {
    tempoScale: 1 + signed('tempo') * Math.max(0, tempoSpread),
    pitchScale: 1 + signed('pitch') * Math.max(0, pitchSpread),
  }
}

/** Pick an index uniformly from all patterns except the previous one. */
function differentPattern(previous: number | null, random: () => number): number {
  const count = DRUM_BED_PATTERNS.length
  if (previous === null || previous < 0 || previous >= count) {
    return Math.min(count - 1, Math.floor(Math.max(0, random()) * count))
  }
  const candidate = Math.min(count - 2, Math.floor(Math.max(0, random()) * (count - 1)))
  return candidate >= previous ? candidate + 1 : candidate
}

/** Pure village-bed planner. It chooses several different bars, moves a
 *  secondary accent through their audible hits, leaves their written rests
 *  intact, then inserts a phrase pause that lengthens over a long visit. */
export function drumBedPhrasePlan(
  villageId: string,
  staySeconds: number,
  previousPattern: number | null,
  firstBarOrdinal: number,
  random: () => number = Math.random,
): DrumBedPhrasePlan {
  const c = balance.drumBed
  const bars = Math.max(1, Math.round(c.phraseBars))
  const { tempoScale, pitchScale } = drumBedVillageSpread(villageId, c.tempoSpread, c.pitchSpread)
  const step = Math.max(0.02, c.stepSeconds * tempoScale)
  const hits: DrumBedHit[] = []
  const patternIndices: number[] = []
  let previous = previousPattern
  let restCount = 0
  let stepCount = 0

  for (let bar = 0; bar < bars; bar++) {
    const patternIndex = differentPattern(previous, random)
    const pattern = DRUM_BED_PATTERNS[patternIndex]
    patternIndices.push(patternIndex)
    previous = patternIndex
    const audible = pattern.flatMap((value, index) => value > 0 ? [index] : [])
    const movingAccent = audible[(firstBarOrdinal + bar) % audible.length]
    for (let i = 0; i < pattern.length; i++) {
      const value = pattern[i]
      stepCount++
      if (value <= 0) {
        restCount++
        continue
      }
      const shifted = i === movingAccent ? value + (1 - value) * Math.max(0, Math.min(1, c.accentShift)) : value
      hits.push({
        startOffset: (bar * pattern.length + i) * step,
        peak: DRUM_BEAT_PEAK * shifted,
        pitchStartHz: Math.max(20, c.pitchStartHz * pitchScale),
        pitchEndHz: Math.max(20, c.pitchEndHz * pitchScale),
      })
    }
  }

  const phraseSeconds = bars * DRUM_BED_PATTERNS[0].length * step
  const gapLo = Math.max(0, Math.min(c.phraseGapMinSeconds, c.phraseGapMaxSeconds))
  const gapHi = Math.max(gapLo, c.phraseGapMinSeconds, c.phraseGapMaxSeconds)
  const baseGap = gapLo + Math.max(0, Math.min(1, random())) * (gapHi - gapLo)
  const thinning = Math.min(1, Math.max(0, staySeconds) / Math.max(1, c.thinAfterSeconds))
  const gapFactor = 1 + thinning * (Math.max(1, c.thinMaxGapFactor) - 1)
  return {
    patternIndices,
    hits,
    restShare: restCount / stepCount,
    tempoScale,
    pitchScale,
    nextDelaySeconds: phraseSeconds + baseGap * gapFactor,
  }
}

/** Render one planned phrase with the bed's deliberately plain low sine voice.
 *  Message drums use two distinct heads, a longer ring and a stick click below;
 *  keeping all three out of this bed preserves that semantic boundary. */
function emitDrumPhrase(dest: GainNode): number {
  if (!ctx) return 1
  const villageId = scene.villageId ?? scene.region
  const staySeconds = Math.max(0, ctx.currentTime - drumVisitStartedAt)
  const plan = drumBedPhrasePlan(villageId, staySeconds, drumPreviousPattern, drumBarOrdinal)
  const t0 = ctx.currentTime
  for (const hit of plan.hits) {
    envOsc(
      dest,
      'sine',
      hit.pitchStartHz,
      hit.pitchEndHz,
      t0 + hit.startOffset,
      Math.max(0.04, balance.drumBed.hitSeconds),
      hit.peak,
    )
  }
  drumPreviousPattern = plan.patternIndices.at(-1) ?? drumPreviousPattern
  drumBarOrdinal += plan.patternIndices.length
  return plan.nextDelaySeconds
}

/** Unlike the generic one-shot emitters, a drum phrase chooses its own next
 *  delay: that is where its explicit rests and long-visit thinning live. */
function startDrumEmitter() {
  const tick = () => {
    let delay = 1
    if (ctx && layers.drums && layers.drums.gain.gain.value > 0.005) {
      delay = emitDrumPhrase(layers.drums.gain)
    }
    setTimeout(tick, Math.max(0.1, delay) * 1000)
  }
  setTimeout(tick, Math.random() * Math.max(0.1, balance.drumBed.phraseGapMaxSeconds) * 1000)
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
  // Footstep, ambient and speech sub-buses (design.md §19.1/§20): footsteps
  // twice as loud, every other ambient sound half as loud, the village speech on
  // its own level, all three under the master volume.
  ambientBus = ctx.createGain()
  ambientBus.gain.value = balance.ambientVolume
  ambientBus.connect(master)
  footstepBus = ctx.createGain()
  footstepBus.gain.value = balance.footstepVolume
  footstepBus.connect(master)
  speechBus = ctx.createGain()
  speechBus.gain.value = Math.max(0, balance.communication.speechVolume)
  speechBus.connect(master)

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
  startDrumEmitter()
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
  setTarget('drums', village ? balance.drumBed.villageGain : nearVillage ? balance.drumBed.nearbyGain : 0)
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

/** Audible radius (world units) of the §19.1 proximity wildlife sounds — the
 *  distance at which a call or a trample crunch fades to silence. Shared by the
 *  looped proximity calls (Wildlife.tsx) and the trample-crunch gain curve so
 *  both fall off over the same range. */
export const PROXIMITY_AUDIBLE = 48

/** The §19.1 proximity gain curve: 1 right beside the traveller, a linear fall
 *  to 0 at `audible`, clamped outside. The single shared distance->loudness
 *  helper for the proximity calls and the trample crunch — pure, so both the
 *  curve and its reuse are unit-testable. */
export function proximityGain(distance: number, audible = PROXIMITY_AUDIBLE): number {
  if (distance <= 0) return 1
  if (distance >= audible) return 0
  return 1 - distance / audible
}

// Peak envelope of the trample crunch (pre-bus). Like the thunder peaks it
// compensates the ambient-bus (0.5) x master (0.5) attenuation so a near
// trample reads clearly over the beds; calibratable (design.md §21).
const CRUNCH_PEAK = 2.2

/** Peak gain of the trample crunch (design.md §19.1/§19.5, point 260): the
 *  shared proximity curve times the single ambience volume times the crunch
 *  peak — clearly heard up close, faint far off, silent beyond the audible
 *  radius or at volume 0. Pure, so the distance + volume scaling is pinned. */
export function trampleCrunchGain(distance: number, volume: number): number {
  return CRUNCH_PEAK * proximityGain(distance) * Math.max(0, volume)
}

/** Whether the trample crunch fires this frame (design.md §19.5, point 260): an
 *  EDGE, not a level — true only on the alive->dead transition, so the crunch
 *  sounds once at the kill and never again while the carcass lies there. Pure,
 *  so the once-per-kill latch is testable without the scene. */
export function trampleCrunchFires(prevDead: boolean, nowDead: boolean): boolean {
  return !prevDead && nowDead
}

/** One micro-crackle of the crunch's bone layer: a short, bright, hard-attack
 *  band-passed noise snap. Several of these a few ms apart read as bones
 *  crunching rather than one thud. */
export interface CrunchCrackle {
  /** Seconds after the impact this snap starts. */
  startOffset: number
  /** Attack time — hard (a couple of ms): the snap edge. */
  attack: number
  /** Total length — a blink, far shorter than the squelch. */
  duration: number
  /** Envelope peak (pre-bus), already §19.1 distance/volume scaled. */
  peak: number
  /** Bandpass centre — bright (bone), well above the squelch band. */
  frequency: number
  q: number
}

/** The trample crunch's pure synthesis plan (design.md §19.1/§19.5): two
 *  layered timbres — (a) a sharp BONE-CRACK transient of fast micro-crackles
 *  and (b) a wet soft-tissue SQUELCH — with every level scaled by the
 *  UNCHANGED trampleCrunchGain curve. Pure (rand injectable), so the layers'
 *  presence and envelope shapes are unit-testable without WebAudio. */
export interface TrampleCrunchPlan {
  /** The §19.1 distance + ambience-volume peak (trampleCrunchGain, unchanged). */
  peak: number
  /** (a) The bone layer: a loud lead crack plus fast decaying micro-crackles. */
  crackles: CrunchCrackle[]
  /** (b) The wet squelch: lower, damped, resonant, softer-enveloped than any snap. */
  squelch: {
    startOffset: number
    /** Soft attack — a squish, not a snap. */
    attack: number
    /** Long damped tail — the tissue gives and settles. */
    duration: number
    peak: number
    /** Resonant-lowpass start frequency; sweeps down to `frequencyEnd`. */
    frequency: number
    frequencyEnd: number
    /** Resonance — the wet formant of the squelch. */
    q: number
  }
}

export function trampleCrunchPlan(
  distance: number,
  volume: number,
  rand: () => number = Math.random,
): TrampleCrunchPlan {
  const peak = trampleCrunchGain(distance, volume)
  // (a) The bone layer: a hard lead crack at the impact, then 3-5 decaying
  // micro-crackles a few ms apart — fast enough to fuse into one crunch, spaced
  // enough to read as breaking, never a single thud.
  const crackles: CrunchCrackle[] = []
  const count = 4 + Math.floor(rand() * 3) // 4..6 snaps
  let t = 0
  for (let i = 0; i < count; i++) {
    crackles.push({
      startOffset: t,
      attack: 0.002,
      duration: 0.02 + rand() * 0.025,
      peak: peak * (i === 0 ? 1.2 : (0.85 - i * 0.1) * (0.8 + rand() * 0.4)),
      frequency: 1700 + rand() * 1600,
      q: 1.4,
    })
    t += 0.012 + rand() * 0.024
  }
  return {
    peak,
    crackles,
    // (b) The squelch starts as the first bone gives, swells softly and damps
    // out over a downward resonant sweep — the wet matsch under the snaps.
    squelch: {
      startOffset: 0.012,
      attack: 0.035,
      duration: 0.3,
      peak: peak * 0.8,
      frequency: 460,
      frequencyEnd: 200,
      q: 6,
    },
  }
}

/**
 * The trample crunch one-shot (design.md §19.1/§19.5, point 260): the moment an
 * animal is crushed under an elephant's feet — the ordinary trample and the
 * parent grief-trample alike. A positional §19.1 proximity SFX, scaled by the
 * distance to the traveller (the shared proximityGain curve) and the single
 * ambience volume, through the SAME ambient bus as every other wildlife sound —
 * no second audio path. Cheap procedural synth (no asset) from the pure
 * trampleCrunchPlan: (a) a sharp bone-crack transient — a hard-attack bright
 * lead snap with fast micro-crackles so it reads as bones crunching, not one
 * dull "plomp" — over (b) a wet squelch: normalized brown noise through a
 * resonant lowpass sweeping down under a soft, damped envelope for the
 * soft-tissue give. Silent far off or when muted.
 */
export function playTrampleCrunch(distance: number): void {
  if (!ctx || !master) return
  const plan = trampleCrunchPlan(distance, balance.ambienceVolume)
  if (plan.peak <= 0) return // beyond the audible radius or muted: nothing to play
  const ac = ctx
  const dest = ambientBus ?? master
  const t0 = ac.currentTime
  // (a) The bone layer: bright band-passed white-noise snaps, hard attacks.
  for (const c of plan.crackles) {
    const at = t0 + c.startOffset
    clapVoice(ac, dest, at, c.duration, false, 'bandpass', c.frequency, c.q, (gain) => {
      gain.setValueAtTime(0.0001, at)
      gain.linearRampToValueAtTime(c.peak, at + c.attack)
      gain.exponentialRampToValueAtTime(0.0001, at + c.duration)
    })
  }
  // (b) The wet squelch: deep brown noise, resonant lowpass falling through the
  // tail — the damped soft-tissue matsch under the snaps.
  const s = plan.squelch
  const st = t0 + s.startOffset
  clapVoice(
    ac,
    dest,
    st,
    s.duration,
    true,
    'lowpass',
    s.frequency,
    s.q,
    (gain) => {
      gain.setValueAtTime(0.0001, st)
      gain.linearRampToValueAtTime(s.peak, st + s.attack)
      gain.exponentialRampToValueAtTime(0.0001, st + s.duration)
    },
    (frequency) => {
      frequency.setValueAtTime(s.frequency, st)
      frequency.exponentialRampToValueAtTime(s.frequencyEnd, st + s.duration)
    },
  )
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

/** One noise voice (thunder claps, the trample crunch): normalized noise ->
 *  filter -> envelope -> the ambient bus. `shapeFilter` optionally schedules a
 *  frequency sweep on top of the static `freq` (the squelch's falling formant). */
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
  shapeFilter?: (frequency: AudioParam) => void,
) {
  const src = ac.createBufferSource()
  src.buffer = noiseBuffer(ac, dur, brown)
  const filter = ac.createBiquadFilter()
  filter.type = filterType
  filter.frequency.value = freq
  filter.Q.value = q
  shapeFilter?.(filter.frequency)
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

// --- Village speech (design.md §13.4, docs/communication-poc-spec.md) --------
// A spoken syllable is a VOICE, not a beep (point 587): a glottal sawtooth whose
// FUNDAMENTAL reaches the ear intact — the pitch IS the language — shaped by the
// three resonances of the vowel `a`. Those resonances are the SAME in both
// tones, exactly as the spec demands ("differing in PITCH alone"), so the player
// learns ONE syllable spoken low and high, which is what the two message drums
// repeat later. Only the carrier moves between `ba` and `BA`.

/** The carrier of a tone, in Hz, from the calibratable balance values: `ba` is
 *  the low pitch, `BA` sits `speechPitchInterval` above it. */
export function syllableCarrier(tone: Tone): number {
  const c = balance.communication
  const low = Math.max(20, c.speechPitchHz)
  return tone === 'low' ? low : low * Math.max(1, c.speechPitchInterval)
}

/** The vowel `a` (F1 730 / F2 1090 / F3 2440 Hz, the textbook open vowel), as
 *  PEAKING resonators: each formant ADDS a resonance and lets everything else
 *  through, so the fundamental survives — a single bandpass was what threw the
 *  pitch away. `onset` is where the formant stands at the release of the `b`:
 *  a labial starts low and rises into the vowel, and that rise is the whole
 *  difference between hearing `ba` and hearing `a`. */
const VOWEL_A: ReadonlyArray<{ hz: number; q: number; gainDb: number; onset: number }> = [
  { hz: 730, q: 5.5, gainDb: 15, onset: 0.55 },
  { hz: 1090, q: 6.5, gainDb: 13, onset: 0.72 },
  { hz: 2440, q: 7, gainDb: 9, onset: 1 },
]
/** A voice rolls off above its formants; without this the sawtooth buzzes. */
const VOWEL_TILT_HZ = 3000
/** How long the `b` transition takes to reach the steady vowel. */
const VOWEL_ONSET_SECONDS = 0.035
/** The small pitch fall of a spoken beat — far too small to blur the two tones. */
const SPEECH_PITCH_FALL = 0.96

/** Dev/verify probe: proves a spoken utterance really SCHEDULED audio. */
const speechProbe =
  import.meta.env.DEV && typeof window !== 'undefined'
    ? ((window as unknown as { __villageSpeech?: { spoken: number; syllables: number; lastPeak: number } }).__villageSpeech ??= {
        spoken: 0,
        syllables: 0,
        lastPeak: 0,
      })
    : null

/**
 * One spoken syllable `ba`: the voiced carrier of its tone through the vowel's
 * resonators, with the plosive onset of a `b` — a hard release transient, the
 * short dip of the closure opening, then the vowel body. Exported so the
 * offline spectrum check (ambience.speech.test.ts) renders the REAL chain.
 */
export function speakSyllable(ac: AudioContext, dest: AudioNode, t0: number, tone: Tone, dur: number, peak: number) {
  const carrier = syllableCarrier(tone)
  const osc = ac.createOscillator()
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(carrier, t0)
  osc.frequency.linearRampToValueAtTime(carrier * SPEECH_PITCH_FALL, t0 + dur)
  const onset = Math.min(VOWEL_ONSET_SECONDS, dur * 0.3)
  let node: AudioNode = osc
  for (const f of VOWEL_A) {
    const bq = ac.createBiquadFilter()
    bq.type = 'peaking'
    bq.frequency.setValueAtTime(f.hz * f.onset, t0)
    bq.frequency.linearRampToValueAtTime(f.hz, t0 + onset) // the `b` transition
    bq.Q.value = f.q
    bq.gain.value = f.gainDb
    node.connect(bq)
    node = bq
  }
  const tilt = ac.createBiquadFilter()
  tilt.type = 'lowpass'
  tilt.frequency.value = VOWEL_TILT_HZ
  tilt.Q.value = 0.7
  node.connect(tilt)
  const g = ac.createGain()
  const attack = Math.min(0.002, dur * 0.05)
  const body = Math.min(dur * 0.5, onset + 0.05)
  g.gain.setValueAtTime(0.0001, t0)
  g.gain.linearRampToValueAtTime(peak, t0 + attack) // the burst of the `b`
  g.gain.linearRampToValueAtTime(peak * 0.55, t0 + onset) // …and the dip behind it
  g.gain.linearRampToValueAtTime(peak * 0.95, t0 + body) // the vowel swells
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  tilt.connect(g)
  g.connect(dest)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

/**
 * Speaks a pure SpeechPlan (src/communication/speaking.ts): its syllables at the
 * constant pace, a phrase's atoms with the constant pause between them, all on
 * the AudioContext clock — so a re-render or a scene change mid-phrase can never
 * cancel what is already scheduled. Every voice goes through the SPEECH bus
 * (point 577): under the master §21 ambience volume, but beside — never behind —
 * the ambient bus that carries the drums and the rest of the village bed. A plan
 * that carries no audible syllable (out of range, muted) schedules nothing.
 */
export function playSpeech(plan: SpeechPlan): void {
  if (plan.syllables.length === 0) return
  if (speechProbe) speechProbe.spoken++ // an audible plan, even without a started engine
  if (!ctx || !master) return
  const ac = ctx
  const dest = speechBus ?? master
  const t0 = ac.currentTime
  for (const s of plan.syllables) {
    speakSyllable(ac, dest, t0 + s.startOffset, s.tone, s.duration, Math.max(0.0001, s.peak))
  }
  const peak = Math.max(...plan.syllables.map((s) => s.peak))
  // THE RESULT-LEVEL ASSERTION (point 589, rule 1): sound is judged at the END
  // of the chain — the level that actually LEAVES the graph — not at the level
  // the plan asked for. Point 577's defect had an intact plan with a positive
  // peak whose tone was multiplied by ZERO further down the bus, and every
  // measurement that stopped at the plan reported it healthy. The one legitimate
  // silence is the player's own speech slider at zero.
  //
  // The PLAN's peak is what is read, deliberately, not the 0.0001 floor the
  // scheduling passes to the envelope: that floor exists because an exponential
  // ramp cannot reach zero, and it is silence to the ear. A plan carrying
  // syllables at peak 0 is therefore a defect and is reported as one —
  // `phrasePlan` returns no syllables at all for an inaudible level.
  //
  // What it CANNOT see is the topology: whether the buses are still connected to
  // the destination is not readable through the Web Audio API. That end is held
  // by the live browser check, which listens to what the output really carries
  // (`scripts/verify/settings.mjs`).
  const chain = speechBus ? speechBus.gain.value * master.gain.value : master.gain.value
  devAssert(
    peak * chain > 0 || balance.communication.speechVolume <= 0,
    'speech-inaudible',
    () =>
      `${plan.syllables.length} syllables leave the graph at ${(peak * chain).toExponential(2)} ` +
      `(peak ${peak.toFixed(3)}, speech bus ${(speechBus?.gain.value ?? 1).toFixed(3)}, ` +
      `master ${master?.gain.value.toFixed(3)}) while the speech volume is ${balance.communication.speechVolume}`,
  )
  // Counted SEPARATELY from `spoken`, so the live gate proves audio was really
  // scheduled at a positive level — not merely that a counter moved.
  if (speechProbe) {
    speechProbe.syllables += plan.syllables.length
    speechProbe.lastPeak = peak
  }
}

/**
 * The two message drums (design.md §13.4, point 486): the LARGE low one speaks
 * `ba`, the SMALL high one `BA`, and they differ in pitch alone — exactly as the
 * two spoken syllables do. A hit is a struck membrane: a fast fall in pitch with
 * a short body, so a beat is unmistakably a drum and never a voice.
 */
const DRUM_TONE: Record<DrumId, { head: number; body: number; ring: number }> = {
  low: { head: 190, body: 62, ring: 1.35 },
  high: { head: 430, body: 168, ring: 0.85 },
}

/**
 * Beats the chief's message out (src/communication/drumMessage.ts): every strike
 * of the plan on the AudioContext clock, so a re-render or a scene change cannot
 * cut the message short once the chief has sent it. It runs through the AMBIENT
 * bus — the voices left it for their own — under the single §21 ambience volume.
 */
export function playDrumMessage(plan: DrumMessagePlan): void {
  if (plan.strikes.length === 0) return
  if (speechProbe) speechProbe.spoken++ // a sent message, even without an engine
  if (!ctx || !master) return
  const dest = ambientBus ?? master
  const t0 = ctx.currentTime
  for (const strike of plan.strikes) {
    const { head, body, ring } = DRUM_TONE[strike.drum]
    const peak = Math.max(0.0001, strike.peak)
    envOsc(dest, 'sine', head, body, t0 + strike.at, strike.duration * ring, peak)
    // A little click of the stick on the skin, so a strike reads as struck.
    envOsc(dest, 'triangle', head * 3, head, t0 + strike.at, 0.03, peak * 0.2)
  }
  if (speechProbe) {
    speechProbe.syllables += plan.strikes.length
    speechProbe.lastPeak = Math.max(speechProbe.lastPeak, ...plan.strikes.map((s) => s.peak))
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
  if (speechBus) speechBus.gain.value = Math.max(0, balance.communication.speechVolume)
}

/** Update the ambience to the current game situation. */
export function setAmbienceScene(next: AmbienceScene) {
  const nextVillageId = next.villageId ?? null
  const villageChanged = nextVillageId !== (scene.villageId ?? null)
  const changed =
    next.region !== scene.region ||
    next.mode !== scene.mode ||
    next.placeKind !== scene.placeKind ||
    next.nearVillage !== scene.nearVillage ||
    villageChanged
  scene = next
  if (villageChanged) {
    drumPreviousPattern = null
    drumBarOrdinal = 0
    drumVisitStartedAt = ctx?.currentTime ?? 0
  }
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
    // The live gain of one sub-bus (point 577): the browser gate reads them to
    // prove `ambientVolume` moves the bed WITHOUT touching the speech.
    busGain: (name: 'master' | 'ambient' | 'footstep' | 'speech') =>
      ({ master, ambient: ambientBus, footstep: footstepBus, speech: speechBus })[name]?.gain.value ?? 0,
    refresh: () => refreshAmbienceVolume(),
    surfWobble: () => wobbles.find((w) => w.name === 'surf')?.gain.gain.value ?? 0,
    // Village speech (design.md §13.4): speak an utterance/phrase from a given
    // distance, and read what was actually scheduled.
    speak: (utterance: string, distance: number) => playSpeech(utterancePlan(utterance, distance)),
    speakPhrase: (phrase: string[], distance: number) => playSpeech(phrasePlan(phrase, distance)),
    speechProbe: () => ({ ...(speechProbe ?? { spoken: 0, syllables: 0, lastPeak: 0 }) }),
  }
}
