// The bird's-eye traveller's per-frame pose, pure: how he travels (on foot,
// in his canoe, dragging it, swimming), how high his body and his boat ride,
// whether he kneels, and which wound marks show (design.md §6/§7/§11.3).

// The explorer kneels this far below the boat origin: on the hull's floor
// (CanoeHull), his folded legs inside the hull, torso and head over the gunwale.
export const CANOE_SEAT_DROP = 0.08
// The hull's lowest point sits below the boat origin by ~0.25 (its draft); this
// constant places that point just above the water surface, so the surface never
// shows up through the open hull and floods the canoe (design.md §7).
export const CANOE_HULL_CLEARANCE = 0.29
// How far the swimming figure hangs under the rendered water surface
// (point 152, design.md §11.3): legs submerged to the hips of the villager-
// stature body (hip joint at 0.52 of FIGURE_STATURE), torso and head clear.
export const SWIM_IMMERSION = 0.65

export interface TravellerPoseInput {
  /** A canoe in the pack (equipment.canoe > 0). */
  hasCanoe: boolean
  /** The ground under him is water- or ocean-typed. */
  onWater: boolean
  /** afflictions.wounds: 0 none, 1 light, 2 severe. */
  wounds: number
  /** The rendered water surface's float height (0 off water). */
  surfaceY: number
  /** The traveller root's height: the clamped terrain height. */
  refY: number
  /** The accumulated bob clock in seconds. */
  bobTime: number
}

export interface TravellerPose {
  canoeing: boolean
  carrying: boolean
  swimming: boolean
  /** The body kneels: in the canoe, legs folded into the hull. */
  kneeling: boolean
  /** The body's lift over the root (the figure's local y). */
  figureY: number
  /** The ridden boat's lift over the root. */
  boatY: number
  woundLight: boolean
  woundSevere: boolean
  woundShoulders: boolean
}

export function travellerPose(i: TravellerPoseInput): TravellerPose {
  const canoeing = i.hasCanoe && i.onWater
  const carrying = i.hasCanoe && !i.onWater
  const swimming = i.onWater && !canoeing
  const rock = Math.sin(i.bobTime * 1.7) * 0.03
  const boatBaseY = i.surfaceY - i.refY + CANOE_HULL_CLEARANCE
  // Sit into the hull, lifted to the water surface; a slow rock replaces the
  // bob. Swimming: hang under the surface with a slow swim bob — never the
  // walk bounce, and never the bed underneath. On foot the body walks by itself.
  const figureY = canoeing
    ? boatBaseY - CANOE_SEAT_DROP + rock
    : swimming
      ? i.surfaceY - i.refY - SWIM_IMMERSION + Math.sin(i.bobTime * 2.1) * 0.05
      : 0
  return {
    canoeing,
    carrying,
    swimming,
    kneeling: canoeing,
    figureY,
    boatY: boatBaseY + rock,
    woundLight: i.wounds >= 1,
    woundSevere: i.wounds >= 2,
    woundShoulders: i.wounds >= 2,
  }
}
