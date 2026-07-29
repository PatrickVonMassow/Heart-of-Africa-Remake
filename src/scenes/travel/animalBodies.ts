// The animals' body sizes, the placement the renderer ACTUALLY drew for each,
// and the collision circle derived from it (point 378, the point-129 principle
// applied to
// wildlife): the bird's-eye collider must read the drawn transform, never a
// parallel quantity merely expected to match it. The herd render loop composes
// one instance matrix per animal — from the behaviour position PLUS the render
// offsets (the idle shuffle, the drink/bathe slide, the caught struggle, the
// crocodile's ambush placement) — and hands that matrix here; the collider is
// built from nothing else. An animal the frame did not draw (beyond the
// instance cap, streamed out) carries no circle at all, so an unrendered body
// can never leave a phantom collider.
import type { PredatorKind } from './wildlifeBehavior'

/** Every species the herds render (design.md §19); the four predators appear as
 *  carcasses and the scripted hunt's live lion. */
export type Species =
  | 'elephant'
  | 'giraffe'
  | 'zebra'
  | 'wildebeest'
  | 'antelope'
  | 'warthog'
  | 'flamingo'
  | 'crocodile'
  | 'plover'
  | PredatorKind

export const SPECIES: Species[] = [
  'elephant', 'giraffe', 'zebra', 'wildebeest', 'antelope', 'warthog', 'flamingo', 'crocodile', 'plover',
  'lion', 'cheetah', 'leopard', 'hyena',
]

/** Body radius per species (world units, at scale 1): animals spawn with — and
 *  keep — at least the sum of two bodies' radii between their centres, so they
 *  neither spawn inside one another nor walk through each other (design.md
 *  §19). The elephant×smaller-prey pair is exempt at runtime: trampling is a
 *  designed interaction (the herd walks OVER a too-slow animal). The SAME radius
 *  scales with the DRAWN instance for the traveller's collision circle below. */
export const BODY_RADIUS: Record<Species, number> = {
  elephant: 1.3,
  giraffe: 0.9,
  zebra: 0.7,
  wildebeest: 0.75,
  antelope: 0.6,
  warthog: 0.45,
  flamingo: 0.25,
  crocodile: 0.55,
  plover: 0.12,
  // Predator entries complete the record (point 146); their list members are
  // always dead, and every proximity pass skips carcasses.
  lion: 0.8,
  cheetah: 0.55,
  leopard: 0.55,
  hyena: 0.6,
}

/** The transform the last render pass composed for one animal. */
export interface DrawnBody {
  x: number
  y: number
  z: number
  /** Uniform scale of the drawn instance (the basis length of the matrix). */
  scale: number
  /** Render-loop frame counter at the moment the instance was written. */
  frame: number
}

/** Anything the render loop draws and the collider may read. */
export interface DrawnBodyCarrier {
  dead?: boolean
  drawn?: DrawnBody
}

/**
 * Stamp the animal with the instance matrix just written for it (column-major
 * `Matrix4.elements`): translation from the fourth column, uniform scale as the
 * length of the first basis column. Mutates an existing record in place — this
 * runs for every drawn animal every frame.
 */
export function recordDrawnBody(a: DrawnBodyCarrier, m: ArrayLike<number>, frame: number): void {
  const scale = Math.hypot(m[0], m[1], m[2])
  const d = a.drawn
  if (d === undefined) a.drawn = { x: m[12], y: m[13], z: m[14], scale, frame }
  else {
    d.x = m[12]
    d.y = m[13]
    d.z = m[14]
    d.scale = scale
    d.frame = frame
  }
}

/**
 * Collision circle `[x, z, radius]` of an animal AS DRAWN, or `null` when the
 * given render pass did not draw it (never drawn, capped out, or dead — a
 * carcass stays passable, design.md §19).
 */
export function drawnCollisionCircle(
  a: DrawnBodyCarrier,
  bodyRadius: number,
  frame: number,
): [number, number, number] | null {
  if (a.dead) return null
  const d = a.drawn
  if (d === undefined || d.frame !== frame) return null
  return [d.x, d.z, bodyRadius * d.scale]
}
