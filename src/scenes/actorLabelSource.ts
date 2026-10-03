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
//     the carcasses): it reads the same records the render pass wrote;
//   • a MARK on an object (`markActor`) for what is drawn as its own node (an
//     inhabitant, a goat, a pitched camp, the canoe): one tag at the figure, and
//     the traversal finds it, so the call sites do not each have to register
//     and unregister.

import type { ActorAge, ActorKind } from '../systems/actorLabels'

/** One thing that may carry a label this frame, at its world position. */
export interface LabelledActor {
  kind: ActorKind
  age?: ActorAge
  /** A carcass: named as dead, because that is what is being looked at. */
  dead?: boolean
  /** Deliberately hidden right now (§19.16) — collected, but not named. */
  concealed?: boolean
  /** Carries a permanent label of its own — collected, but not named twice. */
  permanentLabel?: boolean
  /** The traveller's own canoe — collected, but not named (see the predicate). */
  ownedByPlayer?: boolean
  x: number
  /** Where the label floats: at the top of the thing, not at its feet. */
  y: number
  z: number
}

/** Pushes this scene's actors into the given array (no allocation per frame). */
type ActorSource = (out: LabelledActor[]) => void

const sources = new Set<ActorSource>()

/** Register a scene's actors; returns the unregister for the unmount. */
export function registerActorSource(source: ActorSource): () => void {
  sources.add(source)
  return () => {
    sources.delete(source)
  }
}

/** Everything the registered sources report right now, reusing `out`. Marked
 *  scene nodes are gathered separately (pushMarkedActors, called by ActorLabels.tsx). */
export function collectActors(out: LabelledActor[] = []): LabelledActor[] {
  out.length = 0
  for (const source of sources) source(out)
  return out
}

/** What a marked object is. `height` is its label's rise above the object's
 *  own origin, in the object's local units — the world scale is applied when
 *  the mark is read, so a figure drawn at half size labels at half the rise. */
interface ActorMark {
  kind: ActorKind
  age?: ActorAge
  height: number
  /** This object draws a label of its own at all times (a pitched camp). It
   *  stays a collected candidate — the layer simply does not name it a second
   *  time (`qualifiesAsActor`). */
  permanentLabel?: boolean
  /** The player's own vehicle — the ridden or dragged canoe. Same treatment. */
  ownedByPlayer?: boolean
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
    out.push({
      kind: mark.kind,
      age: mark.age,
      permanentLabel: mark.permanentLabel,
      ownedByPlayer: mark.ownedByPlayer,
      x: m[12],
      y: m[13] + mark.height * scale,
      z: m[14],
    })
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
  // The VERTICAL scale (the matrix's Y column): a figure kneeling at its work
  // is squashed in height only, and the horizontal scale left the speech
  // label's tail pointing a third of a metre above its drawn head.
  const scale = Math.hypot(found.m[4], found.m[5], found.m[6])
  return found.m[13] + found.mark.height * scale - base[13]
}

/** A drawn head as this module reads it: named `figure-head` by placeFigure,
 *  a sphere whose radius its geometry carries. Structural, like MarkedNode. */
export interface HeadNode {
  name?: string
  visible?: boolean
  children?: readonly HeadNode[]
  matrixWorld?: { elements: ArrayLike<number> }
  geometry?: { parameters?: { radius?: number } }
}

/**
 * Where the TOP of the drawn head under `root` stands relative to root's own
 * origin, as a world-space offset [dx, dy, dz] — null when no visible head is
 * drawn there (a wrap pulled over it, an object that is no figure). The speech
 * note's tail ends here (work-order point 1276): the actor record sits 0.11 m
 * above the head sphere, and with the old metre headroom on top the tip floated
 * 65-85 px over a near speaker's hair. The FULL offset, not only the rise: a
 * leaning or stepping head carries the tail with it sideways and in depth.
 *
 * A sphere of radius r under the linear map L reaches r·|row y of L| above its
 * centre (the top of the ellipsoid it becomes) — squash, lean and the head's
 * own counter-rotation included. That top point lies at centre + r·rowY/|rowY|
 * in world space, so its x/z follow the tilt too. Matrices are read as they
 * stand: the caller refreshes them (`updateWorldMatrix`) when the scene moved.
 */
export function drawnHeadTop(root: HeadNode | null | undefined): [number, number, number] | null {
  const base = root?.matrixWorld?.elements
  if (!root || base === undefined) return null
  const head = findHead(root)
  if (!head) return null
  const e = head.matrixWorld!.elements
  const r = head.geometry?.parameters?.radius ?? 0
  // Column-major: the world y of L·u is e1·ux + e5·uy + e9·uz, largest over
  // the unit sphere at u = (e1, e5, e9)/len; the top point is centre + r·L·u.
  const len = Math.hypot(e[1], e[5], e[9])
  if (len === 0) return [e[12] - base[12], e[13] - base[13], e[14] - base[14]]
  const ux = e[1] / len
  const uy = e[5] / len
  const uz = e[9] / len
  return [
    e[12] + r * (e[0] * ux + e[4] * uy + e[8] * uz) - base[12],
    e[13] + r * len - base[13],
    e[14] + r * (e[2] * ux + e[6] * uy + e[10] * uz) - base[14],
  ]
}

/** How high the drawn head's top stands above root's origin (`drawnHeadTop`'s
 *  rise alone), or null without a visible head. */
export function drawnHeadRise(root: HeadNode | null | undefined): number | null {
  return drawnHeadTop(root)?.[1] ?? null
}

/** The drawn head under `root` as a ball in WORLD space: its centre and its
 *  world-up half-extent (r·|row y|, as drawnHeadTop reads it). Null without a
 *  visible head. The figures' heads are drawn round; a squashed head is
 *  treated as the ball of its vertical extent. */
export function drawnHeadBall(
  root: HeadNode | null | undefined,
): { center: [number, number, number]; radius: number } | null {
  if (!root?.matrixWorld) return null
  const head = findHead(root)
  if (!head) return null
  const e = head.matrixWorld!.elements
  const r = head.geometry?.parameters?.radius ?? 0
  return { center: [e[12], e[13], e[14]], radius: r * Math.hypot(e[1], e[5], e[9]) }
}

/**
 * The point of a ball (world `center`, `radius`) that a perspective camera
 * with world matrix `camera` draws HIGHEST on screen — the top of its
 * silhouette (work-order point 1276). Seen from above or close by, that is not
 * the ball's world crown but a point behind it: the crown projects below the
 * outline, by about r(1 − cos α)/D of the view (α the elevation, D the
 * distance) — a 5 px lift can vanish into the hair over a child a metre away.
 *
 * In camera space (right, up, back) screen height is y/−z, independent of x,
 * so the highest point lies where a plane through the eye and the camera's x
 * axis touches the ball: at angle θ = atan2(cy, −cz) + asin(R/D) above the
 * view axis, D = hypot(cy, cz); the point is center + R(cos θ·up + sin θ·back).
 * Writes `out`; false (nothing written) when the ball is not wholly in front
 * of the camera, so the caller keeps the world crown.
 */
export function silhouetteTop(
  center: readonly [number, number, number],
  radius: number,
  camera: ArrayLike<number>,
  out: { x: number; y: number; z: number },
): boolean {
  const len = (i: number) => Math.hypot(camera[i], camera[i + 1], camera[i + 2]) || 1
  const up = [camera[4] / len(4), camera[5] / len(4), camera[6] / len(4)]
  const back = [camera[8] / len(8), camera[9] / len(8), camera[10] / len(8)]
  const d = [center[0] - camera[12], center[1] - camera[13], center[2] - camera[14]]
  const cy = d[0] * up[0] + d[1] * up[1] + d[2] * up[2]
  const cz = d[0] * back[0] + d[1] * back[1] + d[2] * back[2]
  const dist = Math.hypot(cy, cz)
  if (!(radius >= 0) || -cz <= radius || dist <= radius) return false
  const theta = Math.atan2(cy, -cz) + Math.asin(radius / dist)
  const c = Math.cos(theta) * radius
  const s = Math.sin(theta) * radius
  out.x = center[0] + c * up[0] + s * back[0]
  out.y = center[1] + c * up[1] + s * back[1]
  out.z = center[2] + c * up[2] + s * back[2]
  return true
}

function findHead(node: HeadNode): HeadNode | null {
  if (node.visible === false) return null
  if (node.name === 'figure-head' && node.matrixWorld !== undefined) return node
  for (const child of node.children ?? []) {
    const hit = findHead(child)
    if (hit) return hit
  }
  return null
}

/** The first marked node at or under `root` in depth-first order (not
 *  necessarily the shallowest) — an invisible node takes its subtree with it,
 *  exactly as the label collection does. */
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
