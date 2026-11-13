// A vulture's visible landing and take-off (design.md §19.6): one shared rule
// for the kill flock and the ground scavenger. A landing is a descending glide
// along the approach heading with slowing forward speed, a flare with raised
// wings just before touchdown, then the standing pose; a take-off is a run with
// beating wings into the climb. Pure: the caller supplies the bird's flight
// pose (where it would fly) and its landed pose (where it stands, already
// lifted by the point-128/217 clearance rule) and draws what this returns.

export interface VultureLandingCfg {
  landSeconds: number
  flareFraction: number
  touchdownSpeedRatio: number
  glideCurve: number
  takeoffSeconds: number
  takeoffRunFraction: number
  liftoffSpeedRatio: number
  flapHz: number
}

export interface LandingSample {
  /** Remaining share of the horizontal approach, 1 at the glide's start, 0 at touchdown. */
  rem: number
  /** Height over the landed height as a share of the start height, 1 → 0. */
  height: number
  /** Forward speed as a share of the glide's start speed (decreasing). */
  speed: number
  /** Flare amount 0..1; non-zero only in the last `flareFraction` of the window. */
  flare: number
  phase: 'glide' | 'flare' | 'landed'
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)
const smooth = (v: number) => v * v * (3 - 2 * v)

/**
 * The landing profile at `t` seconds into the window. The forward speed falls
 * linearly from 1 to `touchdownSpeedRatio`; the remaining distance is its
 * integral, so the bird visibly brakes along a straight approach heading. The
 * height follows the remaining distance raised to `glideCurve` (> 1 flattens
 * the last metres), so it decreases strictly to the landed height at the end.
 */
export function landingProfile(t: number, cfg: VultureLandingCfg): LandingSample {
  const u = cfg.landSeconds > 0 ? clamp01(t / cfg.landSeconds) : 1
  const k = clamp01(cfg.touchdownSpeedRatio)
  const total = 1 + (k - 1) / 2
  const rem = ((1 - u) + ((k - 1) * (1 - u * u)) / 2) / total
  const height = Math.pow(Math.max(0, rem), Math.max(1, cfg.glideCurve))
  const speed = 1 + (k - 1) * u
  const f = clamp01(cfg.flareFraction)
  const flareStart = 1 - f
  const flare = u >= 1 ? 1 : f > 0 && u > flareStart ? smooth((u - flareStart) / f) : 0
  const phase = u >= 1 ? 'landed' : flare > 0 ? 'flare' : 'glide'
  return { rem: u >= 1 ? 0 : rem, height: u >= 1 ? 0 : height, speed, flare, phase }
}

export interface TakeoffSample {
  /** Covered share of the way from the ground spot to the flight pose, 0 → 1. */
  along: number
  /** Height over the ground spot as a share of the flight pose's height, 0 → 1. */
  height: number
  /** Forward speed as a share of the speed when it joins the flight (increasing). */
  speed: number
  /** Wings raised (upstroke) this instant — the flap of the run and the climb. */
  wingsUp: boolean
  phase: 'run' | 'climb' | 'air'
}

/**
 * The take-off profile at `t` seconds: the speed rises linearly from
 * `liftoffSpeedRatio` to 1, the first `takeoffRunFraction` of the window is a
 * run on the ground (height 0), then the bird climbs into its flight pose.
 * The wings beat at `flapHz` throughout.
 */
export function takeoffProfile(t: number, cfg: VultureLandingCfg): TakeoffSample {
  const u = cfg.takeoffSeconds > 0 ? clamp01(t / cfg.takeoffSeconds) : 1
  const s0 = clamp01(cfg.liftoffSpeedRatio)
  const total = s0 + (1 - s0) / 2
  const along = (s0 * u + ((1 - s0) * u * u) / 2) / total
  const r = clamp01(cfg.takeoffRunFraction)
  const climbU = r >= 1 ? (u >= 1 ? 1 : 0) : clamp01((u - r) / (1 - r))
  const height = climbU * climbU
  const speed = s0 + (1 - s0) * u
  const wingsUp = u < 1 && Math.sin(t * cfg.flapHz * Math.PI * 2) > 0
  const phase = u >= 1 ? 'air' : u < r ? 'run' : 'climb'
  return { along: u >= 1 ? 1 : along, height, speed, wingsUp, phase }
}

export interface Vec3 {
  x: number
  y: number
  z: number
}

export type BirdLandPhase = 'air' | 'landing' | 'ground' | 'takeoff'

/** One bird's landing state; `s*` is where the current transition began,
 *  `o*` the last drawn position (a transition starts from it, never a snap). */
export interface BirdLandState {
  phase: BirdLandPhase
  t: number
  sx: number
  sy: number
  sz: number
  ox: number
  oy: number
  oz: number
  yaw: number
  fresh: boolean
}

export function makeBirdLandState(): BirdLandState {
  return { phase: 'air', t: 0, sx: 0, sy: 0, sz: 0, ox: 0, oy: 0, oz: 0, yaw: 0, fresh: true }
}

export interface BirdLandPose extends Vec3 {
  phase: BirdLandPhase
  /** Flare 0..1 (landing); draw the raised-wing pose while > 0. */
  flare: number
  /** Upstroke of the take-off's wing beat; draw the raised-wing pose while true. */
  wingsUp: boolean
  /** Heading (radians, three.js yaw of a bird whose head points along +z). */
  yaw: number
  /** Share of the current landing or take-off window elapsed (0..1; 0 in air/ground). */
  progress: number
}

/**
 * Advance one bird and return its drawn pose. `air` is where it would fly this
 * frame, `ground` where it stands. A landing starts from the last drawn
 * position and may be broken off into a take-off; a take-off is committed (it
 * finishes before a new landing starts), as a heavy bird's run cannot stop in
 * mid-stride. `wantGround` false while landed starts the take-off.
 * Mutates `s`.
 */
export function birdLandStep(
  s: BirdLandState,
  wantGround: boolean,
  air: Vec3,
  ground: Vec3,
  dt: number,
  cfg: VultureLandingCfg,
): BirdLandPose {
  if (s.fresh) {
    // First frame: appear in the state's own pose (a flight spawns off-frame).
    const p = s.phase === 'ground' ? ground : air
    s.ox = p.x
    s.oy = p.y
    s.oz = p.z
    s.fresh = false
  }
  const begin = (phase: BirdLandPhase) => {
    s.phase = phase
    s.t = 0
    s.sx = s.ox
    s.sy = s.oy
    s.sz = s.oz
  }
  if (s.phase === 'air' && wantGround) begin('landing')
  else if (s.phase === 'landing' && !wantGround) begin('takeoff')
  else if (s.phase === 'ground' && !wantGround) begin('takeoff')
  else s.t += dt
  let x: number
  let y: number
  let z: number
  let flare = 0
  let wingsUp = false
  let progress = 0
  if (s.phase === 'landing') {
    const p = landingProfile(s.t, cfg)
    x = ground.x + (s.sx - ground.x) * p.rem
    z = ground.z + (s.sz - ground.z) * p.rem
    y = ground.y + (s.sy - ground.y) * p.height
    flare = p.flare
    progress = cfg.landSeconds > 0 ? clamp01(s.t / cfg.landSeconds) : 1
    if (Math.hypot(ground.x - s.sx, ground.z - s.sz) > 1e-3) s.yaw = Math.atan2(ground.x - s.sx, ground.z - s.sz)
    if (p.phase === 'landed') s.phase = 'ground'
  } else if (s.phase === 'takeoff') {
    const p = takeoffProfile(s.t, cfg)
    x = s.sx + (air.x - s.sx) * p.along
    z = s.sz + (air.z - s.sz) * p.along
    y = s.sy + (air.y - s.sy) * p.height
    wingsUp = p.wingsUp
    progress = cfg.takeoffSeconds > 0 ? clamp01(s.t / cfg.takeoffSeconds) : 1
    const mx = x - s.ox
    const mz = z - s.oz
    if (Math.hypot(mx, mz) > 1e-4) s.yaw = Math.atan2(mx, mz)
    if (p.phase === 'air') s.phase = 'air'
  } else if (s.phase === 'ground') {
    x = ground.x
    y = ground.y
    z = ground.z
  } else {
    x = air.x
    y = air.y
    z = air.z
  }
  s.ox = x
  s.oy = y
  s.oz = z
  return { x, y, z, phase: s.phase, flare, wingsUp, yaw: s.yaw, progress }
}

/** Shared progress of a flock (0 = all in the air, 1 = all standing): a
 *  landing counts its window share, a take-off counts down from 1. */
export function flockLandProgress(states: readonly BirdLandState[], cfg: VultureLandingCfg): number {
  if (states.length === 0) return 0
  let sum = 0
  for (const s of states) {
    if (s.phase === 'ground') sum += 1
    else if (s.phase === 'landing') sum += cfg.landSeconds > 0 ? clamp01(s.t / cfg.landSeconds) : 1
    else if (s.phase === 'takeoff') sum += 1 - (cfg.takeoffSeconds > 0 ? clamp01(s.t / cfg.takeoffSeconds) : 1)
  }
  return sum / states.length
}
