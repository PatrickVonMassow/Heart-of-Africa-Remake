// Where the hold-Ctrl labels get their subjects (design.md §17.8).
//
// A bridge like wildlifeCollision.ts: each scene registers what it can see of
// its own actors, and the label layer asks for them while Ctrl is down. The
// scenes therefore keep their data — the streamed herds live in instanced
// meshes, the settlement's people are ordinary objects in the scene graph — and
// neither has to be reshaped for a layer that is off almost all the time.
//
// Two shapes, because the two scenes really are different:
//   • a SOURCE FUNCTION for what is drawn from a list (the herds, the vultures,
//     the camps): it reads the same records the render pass wrote;
//   • a MARK on an object (`markActor`) for what is drawn as its own node (an
//     inhabitant, a goat): one tag at the figure, and the traversal finds it,
//     so twenty call sites do not each have to register and unregister.

import type { ActorAge, ActorKind } from '../systems/actorLabels'

/** One thing that may carry a label this frame, at its world position. */
export interface LabelledActor {
  kind: ActorKind
  age?: ActorAge
  /** A carcass: named as dead, because that is what is being looked at. */
  dead?: boolean
  /** Deliberately hidden right now (§19.16) — collected, but not named. */
  concealed?: boolean
  x: number
  /** Where the label floats: at the top of the thing, not at its feet. */
  y: number
  z: number
}

/** Pushes this scene's actors into the given array (no allocation per frame). */
export type ActorSource = (out: LabelledActor[]) => void

const sources = new Set<ActorSource>()

/** Register a scene's actors; returns the unregister for the unmount. */
export function registerActorSource(source: ActorSource): () => void {
  sources.add(source)
  return () => {
    sources.delete(source)
  }
}

/** Everything the mounted scenes can see right now, reusing `out`. */
export function collectActors(out: LabelledActor[] = []): LabelledActor[] {
  out.length = 0
  for (const source of sources) source(out)
  return out
}

/** What a marked object is. `height` is its label's rise above the object's
 *  own origin, in the object's local units — the world scale is applied when
 *  the mark is read, so a figure drawn at half size labels at half the rise. */
export interface ActorMark {
  kind: ActorKind
  age?: ActorAge
  height: number
}

/** Tag an object as an actor: `<group userData={markActor({ … })}>`. */
export function markActor(mark: ActorMark): { actor: ActorMark } {
  return { actor: mark }
}

/** The little of an Object3D this module reads — structural, so the traversal
 *  is testable without a renderer. */
export interface MarkedNode {
  visible?: boolean
  userData?: { actor?: ActorMark }
  children?: readonly MarkedNode[]
  matrixWorld?: { elements: ArrayLike<number> }
}

/**
 * Collect every marked object under `root` that is actually being drawn. An
 * invisible node takes its whole subtree with it: a figure switched off is not
 * on screen, and naming it would invent an inhabitant.
 */
export function pushMarkedActors(root: MarkedNode | null | undefined, out: LabelledActor[]): void {
  if (!root || root.visible === false) return
  const mark = root.userData?.actor
  const m = root.matrixWorld?.elements
  if (mark !== undefined && m !== undefined) {
    // Uniform world scale as the length of the first basis column — the same
    // reading recordDrawnBody takes for the wildlife colliders.
    const scale = Math.hypot(m[0], m[1], m[2])
    out.push({ kind: mark.kind, age: mark.age, x: m[12], y: m[13] + mark.height * scale, z: m[14] })
  }
  const children = root.children
  if (children === undefined) return
  for (const child of children) pushMarkedActors(child, out)
}

/**
 * How high the marked figure drawn under `root` reaches ABOVE root's own
 * origin, in world units — its own recorded height, taken at the scale it is
 * actually drawn at. Null when nothing under it is a marked actor.
 *
 * The same record the hold-Ctrl labels read, so whatever floats over a head
 * floats over the SAME point whichever layer put it there: a child drawn at
 * half size gets half the rise, and a figure that changes scale takes its
 * labels with it. The speech label (work-order point 582) is the second reader
 * — it hung at a flat height over the speaker's FEET, which put a child's note
 * about twice the child's own height above it.
 */
export function markedActorRise(root: MarkedNode | null | undefined): number | null {
  const base = root?.matrixWorld?.elements
  if (!root || base === undefined) return null
  const found = firstMarked(root)
  if (!found) return null
  const scale = Math.hypot(found.m[0], found.m[1], found.m[2])
  return found.m[13] + found.mark.height * scale - base[13]
}

/** The nearest marked node at or under `root`, depth first — an invisible node
 *  takes its subtree with it, exactly as the label collection does. */
function firstMarked(
  root: MarkedNode,
): { mark: ActorMark; m: ArrayLike<number> } | null {
  if (root.visible === false) return null
  const mark = root.userData?.actor
  const m = root.matrixWorld?.elements
  if (mark !== undefined && m !== undefined) return { mark, m }
  for (const child of root.children ?? []) {
    const hit = firstMarked(child)
    if (hit) return hit
  }
  return null
}
