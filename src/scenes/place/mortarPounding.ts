// Grain pounding at the village mortar (design.md §19 "grain is pounded with
// pestle and mortar"). Pure geometry and timing, so the stroke is pinned in the
// fast test layer and the scene (`Pounder` in PlaceLife.tsx) only draws the
// numbers computed here.
//
// THE PICTURE IT HAS TO GIVE. The old vignette was a short brown cylinder with
// a stick sliding up and down above it, the arms waving beside it. What makes
// pounding recognisable is the WHOLE-BODY stroke on a long pole: lifted high,
// driven down with the knees giving, the pestle's foot vanishing into the
// grain-filled bowl of a footed mortar with a puff of grain and a thud. Two
// women at one mortar strike alternately, so one pestle is always up while the
// other lands.
//
// HOW IT IS SOLVED. The stroke is stated as the height of the PESTLE FOOT over
// the cycle (dwell, lift, hold, accelerating drive), with the knee dip and the
// trunk's lean riding it. The hands are then SOLVED: the arm elevation is
// bisected until the pestle — foot over the strike point in the bowl, shaft
// through the grip between both hands — has its foot at the stated height. So
// hands and pestle can never part, and the foot's depth at impact is a fact of
// the drawn chain, not of a separately animated stick.
//
// FRAME. One woman's own frame: origin at her feet on the ground, facing +Z,
// +X her LEFT (the Figure's convention). The mortar's centre is at
// (0, 0, standOff). She is drawn WITH legs, so the trunk leans about the hip
// (`FIGURE_LIMBS.hipY`), and the knee dip is a y-squash of her whole group —
// every y below is already multiplied by it.

import { balance } from '../../config/balance'
import { FIGURE_LIMBS } from '../../render/figures'
import { armAim, handAt, type FigurePose } from '../../render/gesture'

export type MortarConfig = Readonly<typeof balance.villageLife.mortar>

/** The figure's hip pivot height — the trunk leans about it (legs drawn). */
export const POUNDER_PIVOT_Y = FIGURE_LIMBS.hipY

/** Phase (0..1) of one stroke: 0 is the impact. */
export const IMPACT_PHASE = 0
/** End of the rebound dwell, end of the lift, end of the hold at the top; the
 *  drive runs from the last to the next impact. */
export const STROKE_MARKS = { dwell: 0.08, lift: 0.52, hold: 0.62 } as const

/** The grain's surface height above the ground. */
export function grainLevel(cfg: MortarConfig = balance.villageLife.mortar): number {
  return cfg.height - cfg.grainBelowRim
}

/** The pestle foot's height at impact: into the grain. */
export function impactFootY(cfg: MortarConfig = balance.villageLife.mortar): number {
  return grainLevel(cfg) - cfg.impactDepth
}

/**
 * The mortar's lathe profile [radius, y] from the ground centre, round the
 * flared foot, in at the waist (the hourglass), out to the rim and DOWN INTO
 * the hollowed bowl to its floor. Drawn with a lathe, this is one carved block
 * with a real hollow, not a cylinder with a lid.
 */
export function mortarProfile(cfg: MortarConfig = balance.villageLife.mortar): Array<[number, number]> {
  const h = cfg.height
  const lip = 0.022 // the rim's wall thickness (m)
  const floorY = h - cfg.bowlDepth
  return [
    [0.0001, 0],
    [cfg.footRadius, 0],
    [cfg.footRadius, h * 0.07],
    [cfg.footRadius * 0.82, h * 0.15],
    [cfg.waistRadius, h * 0.34],
    [cfg.waistRadius * 1.05, h * 0.5],
    [cfg.rimRadius * 0.9, h * 0.78],
    [cfg.rimRadius, h * 0.93],
    [cfg.rimRadius, h],
    [cfg.rimRadius - lip, h],
    [cfg.rimRadius - lip * 1.4, h - cfg.bowlDepth * 0.45],
    [(cfg.rimRadius - lip) * 0.55, floorY + 0.01],
    [0.0001, floorY],
  ]
}

/** The inner radius of the bowl at a height (linear in the profile's inner
 *  wall), 0 at or below its floor. */
export function bowlRadiusAt(y: number, cfg: MortarConfig = balance.villageLife.mortar): number {
  const inner = mortarProfile(cfg).slice(9).reverse() // floor -> rim, radius rising
  if (y <= inner[0][1]) return 0
  for (let i = 1; i < inner.length; i++) {
    const [r1, y1] = inner[i]
    const [r0, y0] = inner[i - 1]
    if (y <= y1) return r0 + ((r1 - r0) * (y - y0)) / Math.max(1e-9, y1 - y0)
  }
  return inner[inner.length - 1][0]
}

function smooth(u: number): number {
  const c = Math.min(1, Math.max(0, u))
  return c * c * (3 - 2 * c)
}

/** One woman's stroke phase at a time (s); the second woman runs half a stroke
 *  behind, so their impacts alternate. */
export function poundPhase(seconds: number, woman: number, cfg: MortarConfig = balance.villageLife.mortar): number {
  const p = seconds / cfg.strokeSeconds + (woman % 2) * 0.5
  return p - Math.floor(p)
}

/** The pestle foot's height over the stroke: dwell in the grain, lift, hold
 *  at the top, then an accelerating drive back down. */
export function footHeightAt(phase: number, cfg: MortarConfig = balance.villageLife.mortar): number {
  const bottom = impactFootY(cfg)
  const top = cfg.height + cfg.liftAboveRim
  const { dwell, lift, hold } = STROKE_MARKS
  if (phase < dwell) return bottom
  if (phase < lift) return bottom + (top - bottom) * smooth((phase - dwell) / (lift - dwell))
  if (phase < hold) return top
  const u = (phase - hold) / (1 - hold)
  return top - (top - bottom) * u * u
}

/** How deep in the knee dip the body is, 0..1: it builds through the second
 *  half of the drive, is deepest at the impact and comes up with the lift. */
export function kneeBendAt(phase: number): number {
  if (phase >= 0.78) return smooth((phase - 0.78) / 0.22)
  if (phase < 0.3) return 1 - smooth(phase / 0.3)
  return 0
}

export interface PoundFrame {
  /** Y-scale of the woman's whole group (the knee dip). */
  squat: number
  /** The pose of her arms and trunk. */
  pose: FigurePose
  /** The grip: midway between her hands, in her frame (squat applied). */
  grip: [number, number, number]
  /** Her left and right hand centres, in her frame (squat applied). */
  hands: [[number, number, number], [number, number, number]]
  /** The pestle's foot, in her frame. */
  foot: [number, number, number]
  /** The pestle's centre and unit axis (foot -> top), in her frame. */
  centre: [number, number, number]
  axis: [number, number, number]
  /** The shaft's tilt from the vertical (rad). */
  tilt: number
  /** Her head's centre, in her frame. */
  head: [number, number, number]
}

/** The bearing that puts one hand `gripHalf` beside her shaft at an elevation. */
function bearingFor(side: 'left' | 'right', elevation: number, cfg: MortarConfig): number {
  const reach = FIGURE_LIMBS.armLength * Math.cos(elevation)
  // The hands straddle HER pestle, which stands `strikeOffset` to her left.
  const handX = cfg.strikeOffset + (side === 'left' ? cfg.gripHalf : -cfg.gripHalf)
  const shoulderX = side === 'left' ? FIGURE_LIMBS.shoulderX : -FIGURE_LIMBS.shoulderX
  const needed = (handX - shoulderX) / Math.max(1e-6, reach)
  return Math.asin(Math.max(-1, Math.min(1, needed)))
}

/** How far toward her the pestle foot hangs at a foot height: none in the
 *  bowl, `footDrift` at the top. Above the rim the foot only has to be over
 *  the opening, and drawing it toward her is what keeps the lifted shaft
 *  upright in front of her face instead of slanting through her head. */
export function footDriftAt(footY: number, cfg: MortarConfig = balance.villageLife.mortar): number {
  const bottom = impactFootY(cfg)
  const top = cfg.height + cfg.liftAboveRim
  return cfg.footDrift * Math.min(1, Math.max(0, (footY - bottom) / (top - bottom)))
}

function chainAt(elevation: number, lean: number, squat: number, cfg: MortarConfig, drift: number) {
  const bl = bearingFor('left', elevation, cfg)
  const br = bearingFor('right', elevation, cfg)
  const [lx, ly, lz] = handAt('left', bl, elevation, lean, POUNDER_PIVOT_Y)
  const [rx, ry, rz] = handAt('right', br, elevation, lean, POUNDER_PIVOT_Y)
  const grip: [number, number, number] = [(lx + rx) / 2, ((ly + ry) / 2) * squat, (lz + rz) / 2]
  const dx = cfg.strikeOffset - grip[0]
  const dz = cfg.standOff - drift - grip[2]
  const flat = Math.hypot(dx, dz)
  const rise = Math.sqrt(Math.max(0, cfg.gripFromFoot ** 2 - flat ** 2))
  return { bl, br, grip, footY: grip[1] - rise, hands: [[lx, ly * squat, lz], [rx, ry * squat, rz]] as const }
}

/** Elevation range the solve searches: from arms reaching down-forward to
 *  arms raised nearly straight up. */
const ELEVATION_RANGE: [number, number] = [-0.45, 1.35]

/**
 * The whole drawn stroke at a phase: knee dip, lean, the solved arms, the
 * pestle through her hands with its foot at `footHeightAt`. Where the stated
 * foot height is out of the arms' reach the nearest reachable one is drawn —
 * the test pins that impact and top both ARE reached.
 */
export function poundFrame(phase: number, cfg: MortarConfig = balance.villageLife.mortar): PoundFrame {
  const k = kneeBendAt(phase)
  const squat = 1 - cfg.squatDepth * k
  const lean = cfg.leanTop + (cfg.leanImpact - cfg.leanTop) * k
  const target = footHeightAt(phase, cfg)
  const drift = footDriftAt(target, cfg)
  let [lo, hi] = ELEVATION_RANGE
  // Foot height rises with the elevation over the whole range (pinned by test).
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (chainAt(mid, lean, squat, cfg, drift).footY < target) lo = mid
    else hi = mid
  }
  const elevation = (lo + hi) / 2
  const { bl, br, grip, footY, hands } = chainAt(elevation, lean, squat, cfg, drift)
  const foot: [number, number, number] = [cfg.strikeOffset, footY, cfg.standOff - drift]
  const d = [grip[0] - foot[0], grip[1] - foot[1], grip[2] - foot[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const axis: [number, number, number] = [d[0] / len, d[1] / len, d[2] / len]
  const half = cfg.pestleLength / 2
  return {
    squat,
    pose: { left: armAim(bl, elevation), right: armAim(br, elevation), lean, turn: 0 },
    hands: [[...hands[0]], [...hands[1]]],
    grip,
    foot,
    centre: [foot[0] + axis[0] * half, foot[1] + axis[1] * half, foot[2] + axis[2] * half],
    axis,
    tilt: Math.acos(Math.min(1, axis[1])),
    head: headCentre(lean, squat),
  }
}

/** Her head's centre in her frame: the Figure puts it 0.18 above the body
 *  cone, inside the trunk that leans about the hip; the squat scales it. */
export function headCentre(lean: number, squat: number): [number, number, number] {
  const up = 1.18 - POUNDER_PIVOT_Y
  return [0, (POUNDER_PIVOT_Y + up * Math.cos(lean)) * squat, up * Math.sin(lean)]
}

/** The Figure's head radius (placeFigure.tsx). */
export const HEAD_RADIUS = 0.16

/** The foot height the solve reaches at an elevation (for the monotony pin). */
export function footAtElevation(elevation: number, phase: number, cfg: MortarConfig = balance.villageLife.mortar): number {
  const k = kneeBendAt(phase)
  return chainAt(elevation, cfg.leanTop + (cfg.leanImpact - cfg.leanTop) * k, 1 - cfg.squatDepth * k, cfg, footDriftAt(footHeightAt(phase, cfg), cfg)).footY
}

export const POUND_ELEVATION_RANGE = ELEVATION_RANGE

/** How many impacts one woman makes between two times (s) — the edge the thud
 *  and the grain puff fire on. A long frame gap counts every stroke it spans. */
export function impactsBetween(from: number, to: number, woman: number, cfg: MortarConfig = balance.villageLife.mortar): number {
  if (!(to > from)) return 0
  const offset = (woman % 2) * 0.5
  return Math.floor(to / cfg.strokeSeconds + offset) - Math.floor(from / cfg.strokeSeconds + offset)
}

/** Seconds since this woman's last impact. */
export function sinceImpact(seconds: number, woman: number, cfg: MortarConfig = balance.villageLife.mortar): number {
  return poundPhase(seconds, woman, cfg) * cfg.strokeSeconds
}

/**
 * The grain puff after an impact: each grain's offset from the strike point
 * (her frame) and whether it is still in the air. Thrown up and outward round
 * the shaft in a fan, falling under gravity back toward the bowl; gone once
 * `puffSeconds` have passed. Deterministic per grain index.
 */
export function puffGrain(
  index: number,
  since: number,
  cfg: MortarConfig = balance.villageLife.mortar,
): { visible: boolean; offset: [number, number, number] } {
  if (since < 0 || since >= cfg.puffSeconds) return { visible: false, offset: [0, 0, 0] }
  const n = Math.max(1, cfg.puffGrains)
  const angle = (index / n) * Math.PI * 2 + 0.4 * Math.sin(index * 12.9898)
  const spread = 0.35 + 0.25 * ((index * 7) % 3) / 2
  const speed = cfg.puffSpeed * (0.75 + 0.25 * ((index * 5) % 4) / 3)
  const up = speed
  const out = speed * spread
  const g = 9.8
  return {
    visible: true,
    offset: [Math.cos(angle) * out * since, up * since - 0.5 * g * since * since, Math.sin(angle) * out * since],
  }
}

// --- The pair's stations and their own pounding clock (point 1282) ---------

/** A woman's stand at the mortar: where she is and the way she faces. */
export interface PounderStand {
  x: number
  z: number
  yaw: number
}

/**
 * Where the women stand round a mortar at (`x`, `z`) whose frame is turned by
 * `yaw`: woman 0 `standOff` on the frame's -z side facing +z, woman 1 across
 * the mortar facing back. `Pounder` draws them exactly here.
 */
export function pounderStands(x: number, z: number, yaw: number, cfg: MortarConfig = balance.villageLife.mortar): PounderStand[] {
  const count = Math.min(2, Math.max(1, cfg.pounders))
  return [-1, 1].slice(0, count).map((side, i) => ({
    x: x + Math.sin(yaw) * side * cfg.standOff,
    z: z + Math.cos(yaw) * side * cfg.standOff,
    yaw: i === 0 ? yaw : yaw + Math.PI,
  }))
}

/** What the pair is doing: pounding; finishing the stroke in hand before
 *  they leave; walking to the fish rack; taking a fish; eating it; walking
 *  back. Only the first two are at the mortar. */
export type DuoPhase = 'pound' | 'settle' | 'toRack' | 'take' | 'eat' | 'back'

export interface PoundingWoman {
  x: number
  z: number
  yaw: number
  /** Metres walked, for the stride. */
  walked: number
  /** Her fish, 1 whole to 0 eaten; 0 while she holds none. */
  fish: number
  /** Impacts struck, and the pounding clock's reading at the last one. */
  impacts: number
  lastImpact: number
  /** At the mortar but no longer striking: her pestle rests in the grain. */
  resting: boolean
  /** Arrived at the end of the current walk (the pair moves on together). */
  arrived: boolean
}

export interface PoundingDuo {
  phase: DuoPhase
  /** Seconds in the current phase. */
  clock: number
  /** Seconds of pounding since the pair last took up their pestles. */
  poundClock: number
  /** Seconds until they next walk to the fish rack (Infinity: never). */
  next: number
  women: PoundingWoman[]
  /** Visits to the rack made together. */
  visits: number
}

/** The pair at its stands, just taking up the pestles. */
export function createPoundingDuo(stands: readonly PounderStand[], next: number): PoundingDuo {
  return {
    phase: 'pound',
    clock: 0,
    poundClock: 0,
    next,
    women: stands.map((s) => ({ ...s, walked: 0, fish: 0, impacts: 0, lastImpact: -Infinity, resting: false, arrived: true })),
    visits: 0,
  }
}

/** Pounding-clock second at which woman `i` makes her first stroke: the
 *  second woman starts half a stroke later, from her pestle at rest, so the
 *  alternation is taken up without a jump. */
function strokeStart(i: number, cfg: MortarConfig): number {
  return (i % 2) * 0.5 * cfg.strokeSeconds
}

/** Woman `i`'s stroke phase at the mortar (0 is the impact, her pestle down in
 *  the grain), or null while she is away from it. */
export function womanStrokePhase(duo: PoundingDuo, i: number, cfg: MortarConfig = balance.villageLife.mortar): number | null {
  if (duo.phase !== 'pound' && duo.phase !== 'settle') return null
  if (duo.women[i].resting || duo.poundClock < strokeStart(i, cfg)) return 0
  return poundPhase(duo.poundClock, i, cfg)
}

/** Seconds since woman `i`'s last impact (Infinity away or before her first). */
export function womanSinceImpact(duo: PoundingDuo, i: number): number {
  if (duo.phase !== 'pound' && duo.phase !== 'settle') return Infinity
  return duo.poundClock - duo.women[i].lastImpact
}

/**
 * Runs the pounding clock on by `dt` while the pair is at the mortar and
 * counts each woman's impacts. While settling, a woman stops at her next
 * impact and leaves her pestle resting in the grain.
 */
export function advancePounding(duo: PoundingDuo, dt: number, cfg: MortarConfig = balance.villageLife.mortar): void {
  if (duo.phase !== 'pound' && duo.phase !== 'settle') return
  const from = duo.poundClock
  duo.poundClock += dt
  duo.women.forEach((w, i) => {
    if (w.resting) return
    // Not yet started: her pestle is already resting in the grain.
    if (duo.phase === 'settle' && from < strokeStart(i, cfg)) {
      w.resting = true
      return
    }
    const struck = impactsBetween(Math.max(from, strokeStart(i, cfg)), duo.poundClock, i, cfg)
    if (struck <= 0) return
    w.impacts += struck
    w.lastImpact = duo.poundClock - sinceImpact(duo.poundClock, i, cfg)
    if (duo.phase === 'settle') w.resting = true
  })
}
