// The drummer's two drums and the stroke each hand beats on its own drum
// (work-order point 576). Pure geometry, so the whole thing is pinned in the
// fast test layer: the scene component only draws the numbers computed here.
//
// THE DEFECT IT ANSWERS. The stroke used to be a hand-set elevation range
// (`armAim(±0.26, -0.2 + lift)`, lift 0..0.42) that had nothing to do with where
// the drum heads actually are, and the hand over the LARGE drum spent its whole
// swing INSIDE the head. Worse, the arm driven by the large drum's stroke was
// the one standing over the SMALL drum — so the player learning `ba` from the
// low drum and `BA` from the high one was taught the wrong hand.
//
// HOW IT IS CLOSED. Everything is DERIVED from the drum's own dimensions and
// the shared `FIGURE_LIMBS` reach:
//  - the stroke's bottom puts the hand's UNDERSIDE on the head at the depth the
//    head dips to under the strike, so hand and skin meet;
//  - its top lifts that underside a stated clearance ABOVE the resting head;
//  - the bearing aims the hand at the drum's own axis at the moment of contact;
//  - and the SIDE is read off the drum's x — `+x` is the figure's left — so the
//    placement, the hand and the head that dips cannot disagree again.
// Change a drum's height or its position and the stroke follows.
//
// AND THE LEAN IS PART OF THE GEOMETRY. The drummer stands bowed over his drums
// (`DRUMMER_LEAN`), and the Figure tips the whole trunk — shoulders, arms and
// hands with it — about the hip. That carries a hand 0.05 m DOWN and 0.08 m
// forward, which is the same order as the whole error being fixed here: a
// stroke solved from the upright figure would still sink into the skin. So the
// solve runs through the leaning trunk, the way the scene graph draws it.

import { FIGURE_LIMBS } from '../../render/figures'
import { armAim, type ArmPose } from '../../render/gesture'

/** How deep a struck drum head sinks under the hand, in metres. */
export const DRUM_HEAD_DIP = 0.05

/** How far the hand's underside clears the RESTING head at the top of the
 *  swing, in metres. Big enough that the lift reads as a stroke from across the
 *  village square, small enough that the arm never leaves the drum's radius. */
export const DRUM_STROKE_CLEARANCE = 0.1

/** How far the drummer bows over his drums (rad), about the hip. The Figure's
 *  `lean`, kept here because the stroke is solved through it. */
export const DRUMMER_LEAN = 0.12

/** One drum, in the drummer's own frame (+x is his LEFT, +z in front of him). */
export interface DrumGeometry {
  /** The drum's axis. */
  x: number
  z: number
  /** Shell height and its [top, bottom] radii. */
  shellHeight: number
  shellRadius: readonly [number, number]
  /** The head's centre height at rest, its thickness and its radius. */
  headY: number
  headThickness: number
  headRadius: number
}

/** The LARGE low drum — it speaks `ba` (design.md §13.4). */
export const LOW_DRUM: DrumGeometry = {
  x: -0.34,
  z: 0.5,
  shellHeight: 0.66,
  shellRadius: [0.27, 0.21],
  headY: 0.66,
  headThickness: 0.04,
  headRadius: 0.28,
}

/** The SMALL high drum — it speaks `BA`; the same drum, smaller. */
export const HIGH_DRUM: DrumGeometry = {
  x: 0.3,
  z: 0.46,
  shellHeight: 0.5,
  shellRadius: [0.17, 0.13],
  headY: 0.5,
  headThickness: 0.035,
  headRadius: 0.18,
}

/** The head's upper surface at rest. */
export function drumHeadTop(drum: DrumGeometry): number {
  return drum.headY + drum.headThickness / 2
}

/** The head's centre height at a swing (0 = struck, 1 = the hand is up). */
export function drumHeadY(drum: DrumGeometry, swing: number): number {
  return drum.headY - (1 - clamp01(swing)) * DRUM_HEAD_DIP
}

/** The stroke one hand beats on one drum, all of it derived from that drum. */
export interface DrumStroke {
  /** Which of the figure's arms plays it — read off the drum's own x, so the
   *  hand that falls is always the one standing over the drum that sounds. */
  side: 'left' | 'right'
  /** Aim in the figure's frame; the hand sits on the drum's axis at contact. */
  bearing: number
  /** Arm elevation at the strike (the hand's underside on the dipped head). */
  strikeElevation: number
  /** Arm elevation at the top of the swing. */
  liftElevation: number
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v
}

function shoulderXOf(side: 'left' | 'right'): number {
  return side === 'left' ? FIGURE_LIMBS.shoulderX : -FIGURE_LIMBS.shoulderX
}

/**
 * The hand CENTRE for a side, a bearing and an elevation, in the drummer's own
 * frame — shoulder plus posed arm, then the trunk's lean about the hip. It is
 * the chain `Figure` draws, written once so the solve and the assertions share
 * exactly the geometry the picture has.
 */
export function handAt(
  side: 'left' | 'right',
  bearing: number,
  elevation: number,
  lean = DRUMMER_LEAN,
): [number, number, number] {
  const reach = FIGURE_LIMBS.armLength * Math.cos(elevation)
  const x = shoulderXOf(side) + reach * Math.sin(bearing)
  const y = FIGURE_LIMBS.shoulderY + FIGURE_LIMBS.armLength * Math.sin(elevation)
  const z = reach * Math.cos(bearing)
  const cl = Math.cos(lean)
  const sl = Math.sin(lean)
  return [x, y * cl - z * sl, y * sl + z * cl]
}

/** The elevation whose HAND UNDERSIDE ends up at height `y` once the trunk has
 *  leaned. Bisected rather than inverted: the lean mixes the arm's own y and z
 *  into the answer, and the height is monotone in the elevation over the whole
 *  reachable range, so a bisection is exact to the metre's sixth decimal and
 *  cannot be got subtly wrong the way a re-derived closed form can. */
function elevationForUnderside(
  side: 'left' | 'right',
  bearing: number,
  y: number,
  lean: number,
): number {
  const want = y + FIGURE_LIMBS.handRadius
  let lo = -1.4
  let hi = 1.4
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2
    if (handAt(side, bearing, mid, lean)[1] < want) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

/** The stroke for a drum: which hand, aimed where, between which elevations.
 *  The bearing and the strike elevation depend on each other through the lean,
 *  so they are solved together — a handful of passes settles them. */
export function drumStroke(drum: DrumGeometry, lean = DRUMMER_LEAN): DrumStroke {
  const side: 'left' | 'right' = drum.x >= 0 ? 'left' : 'right'
  const head = drumHeadTop(drum)
  let bearing = 0
  let strikeElevation = 0
  for (let i = 0; i < 24; i++) {
    strikeElevation = elevationForUnderside(side, bearing, head - DRUM_HEAD_DIP, lean)
    // The bearing that puts the hand on the drum's axis AT CONTACT, which is the
    // moment the picture has to be right; the arm shortens its horizontal reach
    // as it lifts, and the drum's radius covers that (asserted in the test).
    const reach = FIGURE_LIMBS.armLength * Math.cos(strikeElevation)
    const sin = reach > 1e-6 ? (drum.x - shoulderXOf(side)) / reach : 0
    bearing = Math.asin(Math.max(-1, Math.min(1, sin)))
  }
  return {
    side,
    bearing,
    strikeElevation,
    liftElevation: elevationForUnderside(side, bearing, head + DRUM_STROKE_CLEARANCE, lean),
  }
}

/** The arm pose at a swing (0 = on the head, 1 = the top of the lift). */
export function drumHandPose(stroke: DrumStroke, swing: number): ArmPose {
  return armAim(stroke.bearing, elevationAt(stroke, swing))
}

/** The hand's CENTRE in the drummer's own frame at that swing. */
export function drumHandPoint(
  stroke: DrumStroke,
  swing: number,
  lean = DRUMMER_LEAN,
): [number, number, number] {
  return handAt(stroke.side, stroke.bearing, elevationAt(stroke, swing), lean)
}

function elevationAt(stroke: DrumStroke, swing: number): number {
  return (
    stroke.strikeElevation +
    (stroke.liftElevation - stroke.strikeElevation) * clamp01(swing)
  )
}
