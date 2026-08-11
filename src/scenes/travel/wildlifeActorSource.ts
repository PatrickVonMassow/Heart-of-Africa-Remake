// What the bird's-eye scene offers the hold-Ctrl label layer (design.md §17.8),
// as pure functions over the records the render pass leaves behind.
//
// It lives apart from Wildlife.tsx because the scene draws its animate things
// from THREE unrelated places — the streamed herds (instanced), the scripted
// hunt's own two groups, and the vulture flocks — and "is this one named right
// now?" has to be answerable for every one of them, in every STATE they can be
// in, without a browser. The first hold in real play found an ATTACKING lion
// unnamed: it is drawn from the hunt's groups, and the only source registered
// walked the herds (point 600). A gap like that is invisible to a predicate
// test; it is visible to a test that asks each SOURCE what it produces.

import { BODY_RADIUS, SPECIES, type DrawnBodyCarrier, type Species } from './animalBodies'
import type { LabelledActor } from '../actorLabelSource'

/** What the label layer reads off one streamed animal. */
export interface LabelledAnimal extends DrawnBodyCarrier {
  /** Drawn as a juvenile — the label says so (design.md §17.8). */
  young?: boolean
  /** The §19.16 ambush state: present from the lunge through the drag, the
   *  grip and the slink home, absent while the crocodile lies hidden. */
  lunge?: unknown
}

/** How far above a body's own base its label floats: clear of the animal, so
 *  the tallest kinds carry the largest stand-off, scaled with the drawn body. */
export function labelRise(kind: Species, scale: number): number {
  return (1 + BODY_RADIUS[kind] * 1.6) * scale
}

/**
 * Is this animal deliberately hidden right now (§19.16)?
 *
 * ONLY the submerged crocodile waiting to lunge: naming an ambusher that has
 * not broken cover would end the ambush before it began. The moment it lunges
 * — and for the whole drag, grip and withdrawal that follow — it is named like
 * anything else, and a crocodile carcass, which hides nothing, always is. No
 * other kind is ever concealed: a predator in its attack run is the opposite of
 * hidden, and the rule reaching it was one of the two candidate causes point
 * 600 had to rule out.
 */
export function actorConcealed(kind: Species, a: LabelledAnimal): boolean {
  return kind === 'crocodile' && a.dead !== true && a.lunge === undefined
}

/**
 * The streamed herds: every animal the LAST render pass actually drew, at the
 * transform it drew it with — the same rule as the collider (point 378), so an
 * animal the frame skipped is never named where it is not standing.
 */
export function pushHerdActors(
  herds: Record<Species, readonly LabelledAnimal[]>,
  frame: number,
  out: LabelledActor[],
): void {
  for (const sp of SPECIES) {
    for (const a of herds[sp]) {
      const d = a.drawn
      if (d === undefined || d.frame !== frame) continue
      out.push({
        kind: sp,
        age: a.young === true ? 'young' : 'adult',
        dead: a.dead === true,
        concealed: actorConcealed(sp, a),
        x: d.x,
        y: d.y + labelRise(sp, d.scale),
        z: d.z,
      })
    }
  }
}

/** The little of a drawn scene node these sources read — structural, so the
 *  matrix below runs without a renderer. */
export interface DrawnGroup {
  visible: boolean
  matrixWorld: { elements: ArrayLike<number> }
}

/**
 * One figure of the SCRIPTED hunt — the predator, or the prey it runs down
 * (design.md §19). Both are drawn by the hunt's own groups rather than out of
 * the herds, so they need their own source; without one the attacking predator
 * carried no label at all, at the moment the player most wants the name.
 *
 * `bodyScale` is the mesh's own body scale (PREDATOR_SCALE / PREY_SCALE); the
 * group's world scale multiplies it, which is what lowers a carcass's label as
 * the feeding predator eats it away.
 */
export function pushHuntActor(
  group: DrawnGroup | null | undefined,
  kind: Species,
  bodyScale: number,
  dead: boolean,
  out: LabelledActor[],
): void {
  if (!group || !group.visible) return
  const m = group.matrixWorld.elements
  const scale = bodyScale * Math.hypot(m[0], m[1], m[2])
  out.push({ kind, age: 'adult', dead, x: m[12], y: m[13] + labelRise(kind, scale), z: m[14] })
}

/** A flock group: each bird is its own object under it (design.md §19.6). */
export interface FlockGroup {
  visible: boolean
  children: readonly { matrixWorld: { elements: ArrayLike<number> } }[]
}

/** Vultures from one circling or landed flock, as drawn. */
export function pushFlockActors(group: FlockGroup | null | undefined, out: LabelledActor[]): void {
  if (!group || !group.visible) return
  for (const bird of group.children) {
    const m = bird.matrixWorld.elements
    out.push({ kind: 'vulture', x: m[12], y: m[13] + 1.2, z: m[14] })
  }
}
