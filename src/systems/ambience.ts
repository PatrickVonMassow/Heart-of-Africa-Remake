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

let ctx: AudioContext | null = null
let master: GainNode | null = null
const layers: Record<string, Layer> = {}
let scene: AmbienceScene = { region: 'north', mode: 'place', placeKind: 'port', nearVillage: false }
let started = false

function layer(name: string): Layer {
  if (!ctx || !master) throw new Error('audio not started')
  let l = layers[name]
  if (!l) {
    const gain = ctx.createGain()
    gain.gain.value = 0
    gain.connect(master)
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

/** Slow amplitude wobble on a layer (wind gusts, crowd swell). */
function wobble(name: string, rate: number, depth: number) {
  if (!ctx) return
  const l = layer(name)
  const lfo = ctx.createOscillator()
  lfo.frequency.value = rate
  const lfoGain = ctx.createGain()
  lfoGain.gain.value = depth
  lfo.connect(lfoGain)
  lfoGain.connect(l.gain.gain)
  lfo.start()
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

function buildGraph() {
  if (!ctx) return
  master = ctx.createGain()
  master.gain.value = 0.5
  master.connect(ctx.destination)

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
  emitter('insects', 0.4, 1.6, emitInsects)
  emitter('birds', 1.8, 6, emitBird)
  emitter('birds', 7, 18, emitMonkey)
  emitter('drums', 2.2, 2.2, emitDrums) // continuous bars while audible
  emitter('music', 9, 22, emitMusic)
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
  // The broadband noise beds are scaled by the configurable ambience noise
  // volume (design.md §21; default 0.2 = 20 % of the former loudness).
  const noise = balance.ambienceNoiseVolume
  setTarget('wind', (inPlace ? 0.1 : windByRegion[region]) * noise)
  setTarget('surf', (port ? 0.22 : 0) * noise)
  setTarget('murmur', (port ? 0.3 : 0) * noise)
  setTarget('insects', !port && (region === 'west' || region === 'south' || region === 'east') ? (inPlace ? 0.12 : 0.2) : 0)
  setTarget('birds', !port && region === 'central' ? (inPlace ? 0.25 : 0.4) : 0)
  setTarget('drums', village ? 0.5 : nearVillage ? 0.18 : 0)
  setTarget('music', inPlace ? 0.16 : 0.1)
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
  if (ctx) applyScene()
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
