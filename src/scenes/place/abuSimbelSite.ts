// Pure layout of the walkable Abu Simbel site (design.md §4.4, point 379;
// research: docs/205-world-accuracy-findings.md §F). The two rock temples of
// Ramesses II are cut into the sandstone cliff of the Nubian Nile at their
// ORIGINAL riverside place: the Great Temple with its four seated colossi —
// the second from the south broken off at the waist, head and torso lying at
// its feet — and, downstream, the smaller temple of Nefertari and Hathor with
// six standing figures. The 1890 sand drift pours down the face from the north
// and buries the northern colossus to the breast; the doorway stays open.
//
// Built like the Giza site (gizaSite.ts): a walkable sand disc, the solid
// bodies as the collider set (design.md §2.6), no trade, elder or hints. The
// rock, the colossi and the drift are colliders; the facades' relief is not
// (it lies flat on the face the cliff collider already holds).
//
// Everything is laid out in a CLIFF frame (u along the face, v out of it) and
// turned into the site frame by `ABU_SIMBEL_SITE.yaw` — the renderer applies
// the same turn to the geometry, so a collider can never drift off its mass.

import { ABU_SIMBEL_SITE } from '../../config/balance'
import { boxCollider, type Collider } from './collision'
import type { PlaceLayout } from './layout'

const S = ABU_SIMBEL_SITE

/** Cliff frame → site frame (the group yaw of the drawn site). */
export function cliffToSite(u: number, v: number): { x: number; z: number } {
  const c = Math.cos(S.yaw)
  const s = Math.sin(S.yaw)
  return { x: c * u + s * v, z: -s * u + c * v }
}

/** Site frame → cliff frame (the inverse turn). */
export function siteToCliff(x: number, z: number): { u: number; v: number } {
  const c = Math.cos(S.yaw)
  const s = Math.sin(S.yaw)
  return { u: c * x - s * z, v: s * x + c * z }
}

/** One seated colossus of the Great Temple, in the cliff frame. */
export interface SeatedColossus {
  u: number
  /** Total height, crown included (m). */
  height: number
  /** Broken off at the waist — head and torso lie at its feet. */
  fallen: boolean
}

export const GREAT_COLOSSI: readonly SeatedColossus[] = S.great.colossusU.map((u, i) => ({
  u: u * S.scale,
  height: S.great.colossusHeight * S.scale,
  fallen: i === S.great.fallen,
}))

/** Depth of a colossus's throne block out from the face (m). */
export const THRONE_DEPTH = 0.3 * S.great.colossusHeight * S.scale

/** Width of a colossus's throne block along the face (m). */
export const THRONE_WIDTH = 0.37 * S.great.colossusHeight * S.scale

/** Where the fallen colossus's head and torso lie, in front of its feet. */
export function fallenFragments(c: SeatedColossus): Array<{ u: number; v: number; w: number; d: number; h: number }> {
  const H = c.height
  return [
    { u: c.u - 0.08 * H, v: THRONE_DEPTH + 0.18 * H, w: 0.16 * H, d: 0.14 * H, h: 0.13 * H }, // head and nemes
    { u: c.u + 0.12 * H, v: THRONE_DEPTH + 0.12 * H, w: 0.24 * H, d: 0.13 * H, h: 0.11 * H }, // torso
  ]
}

/** Height of the drift's crest against the face at `u` (0 outside it). */
export function driftCrestAt(u: number): number {
  const st = S.drift.crest
  if (u < st[0][0] || u > st[st.length - 1][0]) return 0
  for (let i = 1; i < st.length; i++) {
    const [u0, h0] = st[i - 1]
    const [u1, h1] = st[i]
    if (u <= u1) return h0 + ((u - u0) / (u1 - u0)) * (h1 - h0)
  }
  return st[st.length - 1][1]
}

/** Drift height at a cliff-frame point: the crest falling linearly to nothing
 *  `reach` metres out from the face. */
export function driftHeightAt(u: number, v: number): number {
  if (v < 0 || v > S.drift.reach) return 0
  return driftCrestAt(u) * (1 - v / S.drift.reach)
}

/** The drift's solid part: where it stands higher than a walker could wade
 *  (DRIFT_SOLID_H), as one box in the cliff frame. */
const DRIFT_SOLID_H = 1.2
/** Width along the face of one drift collider strip, metres. */
const DRIFT_STEP = 2

/**
 * The collidable masses (design.md §2.6, the point-378 rule: the collider is
 * what the renderer draws): the rock body with its cheeks, each colossus's
 * throne-and-legs block, the fallen colossus's fragments, the small temple's
 * figures and buttresses as one strip, and the drift where it stands above
 * wading height. All in the cliff frame, turned into the site frame.
 */
export function abuSimbelColliders(): Collider[] {
  const out: Collider[] = []
  const box = (u0: number, u1: number, v0: number, v1: number) => {
    const c = cliffToSite((u0 + u1) / 2, (v0 + v1) / 2)
    out.push(boxCollider(c.x, c.z, (u1 - u0) / 2, (v1 - v0) / 2, S.yaw))
  }
  const { uMin, uMax, depth, cheek } = S.cliff
  // The rock behind the face.
  box(uMin, uMax, -depth, 0)
  // The cheeks standing forward of the face between and beside the facades.
  const gHalf = (S.great.width * S.scale) / 2
  const sHalf = (S.small.width * S.scale) / 2
  const su = S.small.u * S.scale
  box(uMin, -gHalf, 0, cheek)
  box(gHalf, su - sHalf, 0, cheek)
  box(su + sHalf, uMax, 0, cheek)
  // The colossi: throne plus legs and feet.
  for (const c of GREAT_COLOSSI) {
    box(c.u - THRONE_WIDTH / 2, c.u + THRONE_WIDTH / 2, 0, THRONE_DEPTH + 0.1 * c.height)
    if (c.fallen) for (const f of fallenFragments(c)) box(f.u - f.w / 2, f.u + f.w / 2, f.v - f.d / 2, f.v + f.d / 2)
  }
  // The small temple's standing figures and buttresses.
  box(su - sHalf, su + sHalf, 0, 0.25 * S.small.statueHeight * S.scale)
  // The drift where it is a slope, not ankle sand: one strip per step along
  // the face, out to where the higher end of the step falls below wading height.
  for (let u0 = S.drift.uFrom; u0 < S.drift.uTo; u0 += DRIFT_STEP) {
    const u1 = Math.min(u0 + DRIFT_STEP, S.drift.uTo)
    const h = Math.max(driftCrestAt(u0), driftCrestAt(u1))
    if (h > DRIFT_SOLID_H) box(u0, u1, 0, S.drift.reach * (1 - DRIFT_SOLID_H / h))
  }
  return out
}

/**
 * The Abu Simbel site as a PlaceLayout: the half-disc of sand in front of the
 * face is the walkable ground, the masses above are the collider set, and
 * there is nothing else — no interactives, dwellings, ambient anchors or bank.
 * The seed is accepted for signature parity with buildLayout.
 */
export function buildAbuSimbelLayout(_seed: number): PlaceLayout {
  return {
    radius: S.radius,
    observed: [],
    spawnZ: S.spawn.z,
    spawnX: S.spawn.x,
    interactives: [],
    dwellings: [],
    fences: [],
    paths: [],
    flora: [],
    rocks: [],
    climbRock: null,
    digSites: [],
    // OPEN: the Nile below the facades is not drawn in the walkable site — the
    // bank system belongs to villages; only the panorama band carries it.
    bank: null,
    playRocks: null,
    waterPath: null,
    waterStand: null,
    playGround: null,
    loom: null,
    gaveWayToLoom: { households: 0, dwellings: 0, rebuilt: 0 },
    wayOut: null,
    pen: null,
    // OPEN: no ambient life — design.md names none for Abu Simbel in 1890.
    errands: [],
    colliders: abuSimbelColliders(),
  }
}
