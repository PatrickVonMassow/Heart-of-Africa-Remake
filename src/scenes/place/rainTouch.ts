// Settlement rain that touches the world (design.md §19.13): the pure half of
// PlaceRain.tsx. Each drop owns a FIXED world x/z tiled with the column's width,
// so it stays put in the world while the column follows the eye; it moves only
// when it wraps across the column's edge, where its opacity is already zero.
// Its fall ends on the surface under that x/z — the settlement ground the
// footing reads, or the river's water — and that end is where its impact (one
// shape: a faint ring, water-tinted on water, earth-tinted on ground) blooms. The shader replays the same
// fall from the drop's index and time; `dropFall`/`impactAge` are its mirror.

import { BANK_WATER_DROP, bankWaterDepth } from './riverBank'
import { placeGroundHeight, type PlaceGround } from './placeGround'

/** Where a drop's fall ends and what it lands in. */
export interface DropArrival {
  /** World y of the surface the drop ends on. */
  y: number
  /** 1 on the river's water (a water-tinted ring), 0 on ground (an earth-tinted crown). */
  water: 0 | 1
}

/**
 * The surface under (x, z): the river's water level where the bank's water
 * stands, else the settlement ground exactly as the footing samples it.
 */
export function dropArrival(ground: PlaceGround, x: number, z: number): DropArrival {
  const bank = ground.bank
  if (bank && bankWaterDepth(bank, x * bank.nx + z * bank.nz) > 0) return { y: -BANK_WATER_DROP, water: 1 }
  return { y: placeGroundHeight(ground, x, z), water: 0 }
}

/** Roof cover (shelter mask, 0..1) at and above which no impact blooms: a
 *  crown (cover ≤ `balance.rain.crownCover`) lets rain through, a roof not. */
export const ROOF_COVER = 0.9

/**
 * The spot's impact flag the shader reads: 1 a water ring, 0 a ground
 * crown, −1 none — the drop came down through a roof (water or not).
 */
export function impactFlag(arrival: DropArrival, roofCover: number): -1 | 0 | 1 {
  if (roofCover >= ROOF_COVER) return -1
  return arrival.water ? 1 : 0
}

/** The drop's world coordinate on one axis: its base tiled by `period`,
 *  taken nearest the eye, so |result − eye| ≤ period / 2. */
export function wrapToColumn(base: number, eye: number, period: number): number {
  return base + period * Math.round((eye - base) / period)
}

/** Deterministic base offsets in [−radius, radius) for `count` drops. */
export function dropBases(count: number, radius: number): Float32Array {
  const out = new Float32Array(count * 2)
  let s = 0x9e3779b9
  const next = () => {
    // xorshift32: cheap and stable across runs
    s ^= s << 13
    s ^= s >>> 17
    s ^= s << 5
    return (s >>> 0) / 4294967296
  }
  for (let i = 0; i < count * 2; i++) out[i] = (next() * 2 - 1) * radius
  return out
}

/** Height of the drop's lower tip above its arrival, in [0, height): the
 *  shader's `(phase·H − t·speed) mod H`. 0 is the moment it arrives. */
export function dropFall(phase: number, time: number, height: number, speed: number): number {
  const v = phase * height - time * speed
  return v - height * Math.floor(v / height)
}

/** Seconds since this drop last arrived — the age of its impact. */
export function impactAge(phase: number, time: number, height: number, speed: number): number {
  return (height - dropFall(phase, time, height, speed)) / speed
}

/** The one impact shape at age `age` of `life`: an expanding radius and a
 *  fading alpha; `water` only chooses the ring's tint in the shader. */
export function impactShape(age: number, life: number, radius: number): { radius: number; alpha: number } {
  const t = Math.min(1, Math.max(0, age / life))
  return { radius: radius * (0.25 + 0.75 * t), alpha: age < life ? (1 - t) * (1 - t) : 0 }
}

/** Projected length of a streak `len` m long at eye distance `d` m, as a
 *  fraction of the frame height, with `tanHalfFov` the vertical half-FOV's tan. */
export function streakFrameFraction(len: number, d: number, tanHalfFov: number): number {
  return len / (2 * tanHalfFov * Math.max(1e-6, d))
}

/** Eye distance (m) beyond which a streak `len` m long projects within
 *  `maxFraction` of the frame height: len / (2·tan(fov/2)·maxFraction). */
export function streakFitDistance(len: number, tanHalfFov: number, maxFraction: number): number {
  return len / (2 * tanHalfFov * maxFraction)
}

/** A drop's length factor by eye distance `d`: 1 where its full length fits,
 *  else d / fit, so a near drop is a short dash of at most `maxFraction` of
 *  the frame. The shader's `clamp(d / fit, 0, 1)`. */
export function dropLengthScale(d: number, fit: number): number {
  return Math.min(1, Math.max(0, d / fit))
}

/** A drop's opacity factor by eye distance `d` (m): 0 at and inside `near`,
 *  1 at and beyond `far` (the fit distance), a smoothstep between — the
 *  shader's `smoothstep(near, far, d)`. */
export function dropNearFade(d: number, near: number, far: number): number {
  const t = Math.min(1, Math.max(0, (d - near) / Math.max(1e-6, far - near)))
  return t * t * (3 - 2 * t)
}

/** A drop's width factor by its eye distance `d` (m): 1 beyond `cap`, else
 *  d / cap, so the projected width (∝ width / d) never exceeds its width at
 *  `cap`. The shader's `clamp(d / cap, 0.05, 1)` (the floor keeps it finite). */
export function dropWidthScale(d: number, cap: number): number {
  return Math.min(1, Math.max(0.05, d / cap))
}

/** Drops drawn at rain amount `amount` (0..1) of the preset's `total`: from
 *  `minFraction` of them at the faintest rain to all at full rain, linearly,
 *  so light rain stays sparse and heavy rain is a dense veil. */
export function rainDropCount(total: number, amount: number, minFraction: number): number {
  const a = Math.min(1, Math.max(0, amount))
  return Math.min(total, Math.max(0, Math.round(total * (minFraction + (1 - minFraction) * a))))
}

/** An impact's size factor by eye distance `d`: its projected diameter never
 *  exceeds `maxFraction` of the frame height (the streak's length cap, applied
 *  to the diameter 2·radius). */
export function impactSizeScale(d: number, radius: number, tanHalfFov: number, maxFraction: number): number {
  return dropLengthScale(d, streakFitDistance(2 * radius, tanHalfFov, maxFraction))
}

/** The CPU side of the drops' arrivals, kept across frames. */
export interface RainSpotState {
  /** Each drop's current column tile (x, z); an impossible value forces a sample. */
  tiles: Int32Array
  /** Next drop the rolling refresh re-samples. */
  cursor: number
  /** False after a fresh start: every drawn drop is sampled once. */
  live: boolean
}

export function createRainSpotState(count: number): RainSpotState {
  return { tiles: new Int32Array(count * 2).fill(-0x7fffffff), cursor: 0, live: false }
}

/**
 * One frame of arrival sampling into `spots` (x, arrival y, z, impact flag per
 * drop). A drop is sampled when it wraps to a new tile; on top, a rolling
 * refresh re-samples `drawn · dt / refreshS` drops per frame, so every drop is
 * re-read once per `refreshS` (growing dig spoil is followed) without a
 * once-a-second spike. Returns whether any spot changed.
 */
export function stepRainSpots(
  st: RainSpotState,
  spots: Float32Array,
  bases: Float32Array,
  drawn: number,
  eyeX: number,
  eyeZ: number,
  period: number,
  dt: number,
  refreshS: number,
  sample: (x: number, z: number) => { y: number; flag: number },
): boolean {
  const tiles = st.tiles
  const all = !st.live
  st.live = true
  let dirty = false
  const put = (k: number, x: number, z: number) => {
    const s = sample(x, z)
    spots[k * 4] = x
    spots[k * 4 + 1] = s.y
    spots[k * 4 + 2] = z
    spots[k * 4 + 3] = s.flag
    dirty = true
  }
  for (let k = 0; k < drawn; k++) {
    const bx = bases[k * 2]
    const bz = bases[k * 2 + 1]
    const tx = Math.round((eyeX - bx) / period)
    const tz = Math.round((eyeZ - bz) / period)
    if (!all && tiles[k * 2] === tx && tiles[k * 2 + 1] === tz) continue
    tiles[k * 2] = tx
    tiles[k * 2 + 1] = tz
    put(k, bx + period * tx, bz + period * tz)
  }
  if (!all && drawn > 0) {
    const n = Math.min(drawn, Math.ceil((drawn * Math.max(0, dt)) / refreshS))
    for (let i = 0; i < n; i++) {
      const k = st.cursor % drawn
      st.cursor = k + 1
      put(k, bases[k * 2] + period * tiles[k * 2], bases[k * 2 + 1] + period * tiles[k * 2 + 1])
    }
  }
  return dirty
}
