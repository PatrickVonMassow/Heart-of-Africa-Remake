// The grass fire's FRONT and its burn SCAR as pure geometry (design.md §19.8/
// §19.13, the burning of the steppe). Wildlife.tsx owns the fire's state and
// drama; this module owns where the burning line stands and which ground it has
// blackened, so the drawing (flames, ember edge, smoke, scar tint) and the
// calf-catching test all read ONE shape, and the shape is unit-testable.
//
// The shape is a head fire: the line walks along `heading` from its ignition
// point, widening as it goes, and its CENTRE leads the flanks — a parabola
// bowed forward, the way a wind-driven grass fire runs. Everything the fire has
// passed (behind the line, inside the flanks) is scar.
//
// Local frame: `along` is the distance down the heading from the ignition point,
// `across` the signed offset to its side; the same convention the catch test in
// Wildlife.tsx has always used (heading 0 walks +z).

/** The calibration the shape reads (balance.grassFire). */
export interface FireShape {
  /** Half-width of the line at ignition, world units. */
  startHalfWidth: number
  /** Half-width it never exceeds. */
  maxHalfWidth: number
  /** Half-width gained per unit the line advances (the fan of a spreading fire). */
  spreadRate: number
  /** How far the centre leads the flanks, as a fraction of the half-width. */
  headLead: number
  /** Cap on that lead in world units — bounds the curvature at any extent. */
  maxLead: number
}

/** A fire line's placement: ignition point, heading and how far it has walked. */
export interface FirePlacement {
  x: number
  z: number
  heading: number
  front: number
}

/** Half-width of the line once it has walked `front` units. */
export function fireHalfWidth(front: number, s: FireShape): number {
  return Math.min(s.maxHalfWidth, s.startHalfWidth + Math.max(0, front) * s.spreadRate)
}

/** How far the centre of the line leads its flanks at this extent. Never more
 *  than the line has walked, so the flanks never sit behind the ignition point. */
export function fireLead(front: number, s: FireShape): number {
  return Math.max(0, Math.min(s.maxLead, s.headLead * fireHalfWidth(front, s), front))
}

/** The `along` of the burning line at a side offset: the parabola through the
 *  centre (`front`) and the two flank tips (`front - lead`). */
export function frontAlong(across: number, front: number, s: FireShape): number {
  const hw = fireHalfWidth(front, s)
  const u = Math.min(1, Math.abs(across) / hw)
  return front - fireLead(front, s) * u * u
}

/** Peak curvature of the line (1/units), at its centre: 2·lead/hw². Bounded by
 *  construction through `maxLead` and the half-width floor. */
export function frontCurvature(front: number, s: FireShape): number {
  const hw = fireHalfWidth(front, s)
  return (2 * fireLead(front, s)) / (hw * hw)
}

/** World point → local (along, across) of the fire. */
export function fireLocal(f: FirePlacement, x: number, z: number): { along: number; across: number } {
  const rx = x - f.x
  const rz = z - f.z
  const sh = Math.sin(f.heading)
  const ch = Math.cos(f.heading)
  return { along: rx * sh + rz * ch, across: rx * ch - rz * sh }
}

/** Local (along, across) → world point. */
export function fireWorld(f: FirePlacement, along: number, across: number): { x: number; z: number } {
  const sh = Math.sin(f.heading)
  const ch = Math.cos(f.heading)
  return { x: f.x + sh * along + ch * across, z: f.z + ch * along - sh * across }
}

/** A point on the burning line, `t` in [-1, 1] across its width. */
export function frontPoint(f: FirePlacement, t: number, s: FireShape): { x: number; z: number; along: number; across: number } {
  const across = Math.max(-1, Math.min(1, t)) * fireHalfWidth(f.front, s)
  const along = frontAlong(across, f.front, s)
  return { ...fireWorld(f, along, across), along, across }
}

/** `n + 1` evenly spaced points along the burning line, flank to flank. */
export function frontLine(f: FirePlacement, s: FireShape, n: number): { x: number; z: number; along: number; across: number }[] {
  const out = []
  const k = Math.max(1, Math.floor(n))
  for (let i = 0; i <= k; i++) out.push(frontPoint(f, (i / k) * 2 - 1, s))
  return out
}

/** The scar's outline as a closed polygon in world space: the burning line,
 *  flank to flank, then back down the far flank to the ignition edge and up the
 *  near one. The scar TRAILS the front: every vertex lies on or behind it. */
export function scarPolygon(f: FirePlacement, s: FireShape, n: number): { x: number; z: number }[] {
  const line = frontLine(f, s, n)
  // The scar's rear edge is the ignition line at its starting width; the flanks
  // fan out from there to the current width (the fire widened as it went).
  const w0 = fireHalfWidth(0, s)
  const rear = [fireWorld(f, 0, w0), fireWorld(f, 0, -w0)]
  return [...line.map((p) => ({ x: p.x, z: p.z })), ...rear]
}

/** The local half-width of the SCAR at a given `along`: the fire was narrower
 *  when it passed there, so the flanks fan out from ignition to the front. */
export function scarHalfWidthAt(along: number, front: number, s: FireShape): number {
  return fireHalfWidth(Math.min(Math.max(0, along), front), s)
}

/** Calibration of the scar's soft, ragged edge (balance.grassFire). */
export interface ScarEdge {
  /** Width of the soft falloff at the scar's rim, world units. */
  edgeSoft: number
}

function smooth01(e0: number, e1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

/**
 * CPU mirror of the terrain shader's scar mask (burnScarNode.ts): how fully the
 * ground at (x, z) is burnt, 0..1, before the shader's noise fray (which shifts
 * the three edge distances by ±`scarJag` and is deliberately not mirrored — it
 * moves the rim, never the inside, so no assertion here depends on it).
 * `strength` is the scar's current fade (1 while burning, falling after).
 * Like the point-267 blood tint, it takes no height: it is a function of the
 * horizontal position alone, so it paints whatever relief stands there.
 */
export function scarCoverage(f: FirePlacement, s: FireShape, e: ScarEdge, strength: number, x: number, z: number): number {
  if (!(strength > 0) || !(f.front > 0)) return 0
  const { along, across } = fireLocal(f, x, z)
  const soft = Math.max(1e-3, e.edgeSoft)
  const dFront = frontAlong(across, f.front, s) - along
  const dSide = scarHalfWidthAt(along, f.front, s) - Math.abs(across)
  const dBack = along + soft * 0.5
  const m = smooth01(0, soft, dFront) * smooth01(0, soft, dSide) * smooth01(0, soft, dBack)
  return Math.min(1, m * strength)
}

/** The burning band right behind the line glows: 1 at the line, 0 `depth` behind. */
export function emberCoverage(f: FirePlacement, s: FireShape, depth: number, strength: number, x: number, z: number): number {
  if (!(strength > 0)) return 0
  const { along, across } = fireLocal(f, x, z)
  if (Math.abs(across) > fireHalfWidth(f.front, s)) return 0
  const d = frontAlong(across, f.front, s) - along
  if (d < 0 || d > depth) return 0
  return strength * (1 - d / Math.max(1e-3, depth))
}

/** Burnt earth: the ground's own brightness carries through (grain and relief
 *  stay legible) but pulled toward sooty black-brown. Mirrored by the shader. */
export const SOOT_RGB: readonly [number, number, number] = [0.085, 0.07, 0.06]

/** Mix a ground albedo toward soot by the scar mask times `darkness` (0..1).
 *  Mirrored by `burnScarColor` in burnScarNode.ts. */
export function scarTint(rgb: readonly [number, number, number], mask: number, darkness: number): [number, number, number] {
  const luma = rgb[0] * 0.35 + rgb[1] * 0.5 + rgb[2] * 0.15
  const k = Math.min(1, Math.max(0, mask * darkness))
  const lift = luma * 0.6 + 0.4
  return [0, 1, 2].map((i) => rgb[i] + (SOOT_RGB[i] * lift - rgb[i]) * k) as [number, number, number]
}

/** Deterministic 0..1 hash (flame/smoke placement): fixed per index, so a flame
 *  keeps its spot on the line — no per-frame reshuffle, no travelling pattern. */
export function fireHash(a: number, b: number): number {
  const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453
  return v - Math.floor(v)
}

/** Where flame `i` of `n` stands across the line, in [-1, 1]: an even spread
 *  jittered by a fixed hash, so the flames neither bunch nor read as a picket. */
export function flameSlot(i: number, n: number): number {
  const k = Math.max(1, n)
  const jitter = (fireHash(i, 3.1) - 0.5) * 0.8
  return Math.max(-1, Math.min(1, ((i + 0.5 + jitter) / k) * 2 - 1))
}

/** One smoke puff's life at sim time `t`: its age fraction (0..1) and the
 *  cycle it is in (a new cycle is a new spot on the line). */
export function smokePhase(i: number, t: number, life: number): { age: number; cycle: number } {
  const p = t / Math.max(0.1, life) + fireHash(i, 7.7)
  const cycle = Math.floor(p)
  return { age: p - cycle, cycle }
}

/** A puff's opacity over its life: swells in fast, thins out slowly. */
export function smokeFade(age: number): number {
  const a = Math.min(1, Math.max(0, age))
  return smooth01(0, 0.15, a) * (1 - smooth01(0.45, 1, a))
}
