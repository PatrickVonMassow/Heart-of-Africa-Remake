// Settlement rain that touches the world (design.md §19.13): the pure half of
// PlaceRain.tsx. Each drop owns a FIXED world x/z tiled with the column's width,
// so it stays put in the world while the column follows the eye; it moves only
// when it wraps across the column's edge, where its opacity is already zero.
// Its fall ends on the surface under that x/z — the settlement ground the
// footing reads, or the river's water — and that end is where its impact (one
// shape: a ring on water, a puff on dust) blooms. The shader replays the same
// fall from the drop's index and time; `dropFall`/`impactAge` are its mirror.

import { BANK_WATER_DROP, bankWaterDepth } from './riverBank'
import { placeGroundHeight, type PlaceGround } from './placeGround'

/** Where a drop's fall ends and what it lands in. */
export interface DropArrival {
  /** World y of the surface the drop ends on. */
  y: number
  /** 1 on the river's water (the impact is a ring), 0 on ground (a puff). */
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
 * The spot's impact flag the shader reads: 1 a ring (water), 0 a puff
 * (ground), −1 none — the drop came down through a roof (water or not).
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
 *  fading alpha; `water` only chooses ring vs filled puff in the shader. */
export function impactShape(age: number, life: number, radius: number): { radius: number; alpha: number } {
  const t = Math.min(1, Math.max(0, age / life))
  return { radius: radius * (0.25 + 0.75 * t), alpha: age < life ? (1 - t) * (1 - t) : 0 }
}

/** A drop's opacity factor by its eye distance `d` (m): 0 at and inside
 *  `near`, 1 at and beyond `far`, a smoothstep between — the shader's
 *  `smoothstep(near, far, d)`, so a streak at the eye fades instead of
 *  standing as an opaque bar. */
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
