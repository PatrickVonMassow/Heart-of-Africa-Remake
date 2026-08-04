// Where a settlement's animals stand and how they keep out of each other's way
// (design.md §19 village life; point 413). Pure, so the whole behaviour is
// pinned in the fast test layer — the render component only feeds it positions
// and draws the result.
//
// Both halves fix a reported defect. The anchors used to be a bare radius
// around the settlement centre, validated against nothing: one could land
// inside a tent or a rock, and the wobble then drove the animal in and out of
// that body forever. And no animal was part of the collider set, so nothing
// could ever separate two of them — several goats stood inside one another.

import { nudgeToFree, resolveMove, WALKER_RADIUS, type Collider } from './collision'
import { mulberry32 } from '../../world/noise'

/** The radius an animal MOVES with — the settlement's shared mover footprint. */
export const ANIMAL_RADIUS = WALKER_RADIUS

/**
 * The radius an animal presents to the OTHERS. Deliberately smaller than the
 * mover radius: a goat is ~0.4 wide, so 0.18 + 0.3 = 0.48 m between centres
 * already keeps two bodies clear of each other, while the full 0.6 had the herd
 * shouldering one another all day — every jostle is motion the legs then have to
 * account for, and a grazing pen is not a scrum. Calibratable.
 */
export const ANIMAL_BODY_RADIUS = 0.18

/** A grazing spot: the point the animal wanders around, and the wobble that
 *  carries it (phase so the herd does not move as one, amplitude by setting —
 *  penned animals stay tighter than free-grazing ones). */
export interface AnimalAnchor {
  x: number
  z: number
  phase: number
  amp: number
}

/** An animal's body in the collider set — mutated in place each frame, so the
 *  scene array never has to be rebuilt. */
export interface AnimalBody {
  x: number
  z: number
  r: number
}

/** Circular enclosure the animals are kept in, when the settlement has one. */
export interface AnimalPen {
  x: number
  z: number
  r: number
}

/**
 * The grazing anchors for one settlement: inside the pen when there is one,
 * otherwise scattered in the open ring around the centre — and every one of
 * them validated against the FULL collider set the way point 155 validates a
 * walker's errand target (a clear standing circle it can also leave), nudged to
 * the nearest free spot otherwise.
 */
export function animalAnchors(
  seed: number,
  count: number,
  pen: AnimalPen | null,
  colliders: Collider[],
): AnimalAnchor[] {
  const rand = mulberry32((seed + 31337) >>> 0)
  return Array.from({ length: count }, () => {
    const a = rand() * Math.PI * 2
    let x: number
    let z: number
    let amp: number
    if (pen) {
      const r = rand() * (pen.r - 1.6)
      x = pen.x + Math.cos(a) * r
      z = pen.z + Math.sin(a) * r
      amp = 0.6
    } else {
      const r = 9 + rand() * 12
      x = Math.cos(a) * r
      z = Math.sin(a) * r
      amp = 1.5
    }
    const [ax, az] = nudgeToFree(colliders, x, z, ANIMAL_RADIUS)
    return { x: ax, z: az, phase: rand() * Math.PI * 2, amp }
  })
}

/** One body per anchor, seeded at the anchor so the first frame already
 *  resolves against real positions rather than the origin. */
export function animalBodies(anchors: readonly AnimalAnchor[]): AnimalBody[] {
  return anchors.map((a) => ({ x: a.x, z: a.z, r: ANIMAL_BODY_RADIUS }))
}

/** The settlement's colliders with every animal body appended. The bodies keep
 *  their identity, so moving an animal is a field write, not a rebuild. */
export function animalScene(colliders: readonly Collider[], bodies: readonly AnimalBody[]): Collider[] {
  return [...colliders, ...bodies]
}

/** Stand-in for the mover's own body while IT resolves: a collider infinitely
 *  far away pushes nobody, so one scene array serves the whole herd. */
const NO_COLLIDER: Collider = { x: Infinity, z: Infinity, r: 0 }

/** How fast an animal may swing its body round (rad/s). A goat pivots quickly
 *  but not instantly, and the facing used to be SNAPPED to the raw per-frame
 *  velocity: meeting a fence or another goat reversed that velocity, and the
 *  body flipped 180 degrees between two frames — the "changes direction
 *  abruptly" half of the point-413 report. Calibratable. */
export const ANIMAL_TURN_RATE = 4

/** Turn `from` toward `to` by at most `maxStep` radians, the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  const delta = Math.atan2(Math.sin(to - from), Math.cos(to - from))
  if (Math.abs(delta) <= maxStep) return to
  return from + Math.sign(delta) * maxStep
}

/**
 * Move animal `index` from `from` toward its wobble target, against the
 * settlement AND the rest of the herd. Swept (point 413), so a long step is
 * caught at the near edge of the first collider it meets instead of landing on
 * the far side of it. The animal's own body is swapped out for the resolve and
 * updated to the result, so the next animal in the frame already sees it.
 */
export function stepAnimal(
  scene: Collider[],
  bodies: AnimalBody[],
  index: number,
  targetX: number,
  targetZ: number,
  fromX: number,
  fromZ: number,
): [number, number] {
  const base = scene.length - bodies.length
  const self = bodies[index]
  scene[base + index] = NO_COLLIDER
  const [px, pz] = resolveMove(scene, targetX, targetZ, ANIMAL_RADIUS, [fromX, fromZ])
  scene[base + index] = self
  self.x = px
  self.z = pz
  return [px, pz]
}
