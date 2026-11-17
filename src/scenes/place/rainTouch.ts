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
import { balance } from '../../config/balance'

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
  /** The column's wrap period: one for all drops, or one per drop (rain layers). */
  period: number | Float32Array,
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
    const pk = typeof period === 'number' ? period : period[k]
    const tx = Math.round((eyeX - bx) / pk)
    const tz = Math.round((eyeZ - bz) / pk)
    if (!all && tiles[k * 2] === tx && tiles[k * 2 + 1] === tz) continue
    tiles[k * 2] = tx
    tiles[k * 2 + 1] = tz
    put(k, bx + pk * tx, bz + pk * tz)
  }
  if (!all && drawn > 0) {
    const n = Math.min(drawn, Math.ceil((drawn * Math.max(0, dt)) / refreshS))
    for (let i = 0; i < n; i++) {
      const k = st.cursor % drawn
      st.cursor = k + 1
      const pk = typeof period === 'number' ? period : period[k]
      put(k, bases[k * 2] + pk * tiles[k * 2], bases[k * 2 + 1] + pk * tiles[k * 2 + 1])
    }
  }
  return dirty
}

/** A pinhole camera for the CPU mirror of the streak's screen-space cap. */
export interface StreakCamera {
  eye: readonly [number, number, number]
  /** Heading (rad, 0 looks down −z) and pitch (rad, + looks up). */
  yaw: number
  pitch: number
  tanHalfFov: number
  aspect: number
}

/** A world point in NDC (x, y) and its view depth (+ in front), like the
 *  shader's `cameraProjectionMatrix · cameraViewMatrix` divided by w. */
export function projectPoint(cam: StreakCamera, p: readonly [number, number, number]): [number, number, number] {
  const [x, y, depth] = clipPoint(cam, p)
  return [x / depth, y / depth, depth]
}

/** Screen length of the segment a→b as a fraction of the frame height (NDC
 *  spans 2 per frame height; x is scaled by the aspect into height units). */
export function screenFraction(a: readonly [number, number, number], b: readonly [number, number, number], aspect: number): number {
  return Math.hypot((b[0] - a[0]) * aspect, b[1] - a[1]) / 2
}

/** A world point in clip-like coordinates (X, Y, W): linear in the point, so
 *  NDC = (X/W, Y/W) and W is the view depth — the shader's clip position.
 *  Computed without a divide, so it stays finite at depth 0. */
export function clipPoint(cam: StreakCamera, p: readonly [number, number, number]): [number, number, number] {
  const vx = p[0] - cam.eye[0]
  const vy = p[1] - cam.eye[1]
  const vz = p[2] - cam.eye[2]
  const cy = Math.cos(cam.yaw)
  const sy = Math.sin(cam.yaw)
  const cp = Math.cos(cam.pitch)
  const sp = Math.sin(cam.pitch)
  // forward, right, up of a yaw/pitch camera (three's: yaw about +y, pitch about x)
  const f = [-sy * cp, sp, -cy * cp]
  const r = [cy, 0, -sy]
  const u = [sy * sp, cp, cy * sp]
  const depth = vx * f[0] + vy * f[1] + vz * f[2]
  const x = vx * r[0] + vy * r[1] + vz * r[2]
  const y = vx * u[0] + vy * u[1] + vz * u[2]
  return [x / (cam.tanHalfFov * cam.aspect), y / cam.tanHalfFov, depth]
}

/**
 * Length factor that keeps a streak from its lower tip `base` upward at most
 * `maxFraction` of the frame height AFTER the full perspective projection
 * (off-axis position and pitch included). Clip space is linear along the
 * streak, c(s) = c0 + s·d, so its screen length is f(s) = s·K / (w0·(w0 + s·dw))
 * with K = |(dx·w0 − x0·dw)·aspect, dy·w0 − y0·dw| / 2, and f(s) = max solves
 * exactly to s = max·w0² / (K − max·w0·dw). 0 when a tip is at or behind the
 * eye. The shader evaluates the same closed form in clip space.
 */
export function streakScreenScale(
  cam: StreakCamera,
  base: readonly [number, number, number],
  len: number,
  maxFraction: number,
): number {
  const c0 = clipPoint(cam, base)
  const c1 = clipPoint(cam, [base[0], base[1] + len, base[2]])
  if (c0[2] < balance.rain.streakMinDepthM || c1[2] < balance.rain.streakMinDepthM) return 0
  const dx = c1[0] - c0[0]
  const dy = c1[1] - c0[1]
  const dw = c1[2] - c0[2]
  const w0 = c0[2]
  const k = Math.hypot((dx * w0 - c0[0] * dw) * cam.aspect, dy * w0 - c0[1] * dw) / 2
  const den = k - maxFraction * w0 * dw
  if (den <= 0) return 1
  return Math.min(1, Math.max(0, (maxFraction * w0 * w0) / den))
}

/**
 * Radius factor that keeps a flat horizontal impact ring of `radius` within
 * `maxFraction` of the frame height AFTER the full projection. Its screen
 * extent per metre is bounded by the Frobenius norm of the projection's
 * Jacobian over the world x and z axes at its centre (clip space is linear, so
 * an axis' image is d = c(centre + e) − c(centre), its NDC rate
 * (d.xy·w0 − c0.xy·d.w) / w0²). 0 when the centre is at or behind the eye.
 * The shader evaluates the same bound.
 */
export function impactSizeScale(
  cam: StreakCamera,
  centre: readonly [number, number, number],
  radius: number,
  maxFraction: number,
): number {
  const c0 = clipPoint(cam, centre)
  const w0 = c0[2]
  if (w0 < balance.rain.streakMinDepthM) return 0
  let sum = 0
  for (const e of [[1, 0, 0], [0, 0, 1]] as const) {
    const c1 = clipPoint(cam, [centre[0] + e[0], centre[1] + e[1], centre[2] + e[2]])
    const dw = c1[2] - w0
    const jx = (((c1[0] - c0[0]) * w0 - c0[0] * dw) / (w0 * w0)) * cam.aspect
    const jy = ((c1[1] - c0[1]) * w0 - c0[1] * dw) / (w0 * w0)
    sum += (jx * jx + jy * jy) / 4
  }
  const perMetre = Math.sqrt(sum)
  if (perMetre <= 0) return 1
  return Math.min(1, Math.max(0, maxFraction / (2 * radius * perMetre)))
}
