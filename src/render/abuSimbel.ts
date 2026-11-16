// Geometry of the rock temples of Abu Simbel (design.md §4.4, point 379;
// research: docs/205-world-accuracy-findings.md §F) — ONE build used twice:
// at real size for the walkable site and cut down and scaled for the
// bird's-eye landmark, so the two can never disagree about the site's form.
// Low-poly and vertex-coloured like the other landmark builders: the
// sandstone cliff with its two cut facades, the four seated colossi (the
// second from the south broken off at the waist, its head and torso lying at
// its feet), the six standing figures of the small temple between their
// buttresses, the dark doorways, and the 1890 sand drift pouring down the face
// from the north. Built in the cliff frame (u along the face, v out of it,
// y up) and turned by ABU_SIMBEL_SITE.yaw like the site's colliders.

import * as THREE from 'three/webgpu'
import { ABU_SIMBEL_SITE } from '../config/balance'
import {
  GREAT_COLOSSI,
  THRONE_DEPTH,
  THRONE_WIDTH,
  driftCrestAt,
  fallenFragments,
  type SeatedColossus,
} from '../scenes/place/abuSimbelSite'
import { merge, tint } from './landmarks'

const S = ABU_SIMBEL_SITE
const T = S.tones

/** An axis-aligned box in the cliff frame, spanning [u0,u1]×[y0,y1]×[v0,v1]. */
function box(
  u0: number, u1: number, y0: number, y1: number, v0: number, v1: number,
  tone: string, seed: number, jitter = 0.07,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(u1 - u0, y1 - y0, v1 - v0)
  g.translate((u0 + u1) / 2, (y0 + y1) / 2, (v0 + v1) / 2)
  return tint(g, tone, jitter, seed)
}

/** One seated colossus facing out of the face (+v): throne, legs and feet,
 *  lap with the hands on the knees, torso, the nemes-framed head and the
 *  double crown — or, for the fallen one, everything below the waist. */
function seatedColossus(c: SeatedColossus, seed: number): THREE.BufferGeometry[] {
  const H = c.height
  const u = c.u
  const parts: THREE.BufferGeometry[] = []
  const tw = THRONE_WIDTH / 2
  const seat = 0.45 * H // top of the lap
  parts.push(box(u - tw, u + tw, 0, 0.5 * H, 0, THRONE_DEPTH, T.face, seed)) // throne
  // Lower legs and feet, a little proud of the throne.
  for (const side of [-1, 1]) {
    const lu = u + side * 0.065 * H
    parts.push(box(lu - 0.045 * H, lu + 0.045 * H, 0.03 * H, seat, THRONE_DEPTH - 0.02 * H, THRONE_DEPTH + 0.05 * H, T.figure, seed + 1 + side))
    parts.push(box(lu - 0.05 * H, lu + 0.05 * H, 0, 0.035 * H, THRONE_DEPTH - 0.02 * H, THRONE_DEPTH + 0.1 * H, T.figure, seed + 3 + side))
  }
  // Lap and the forearms laid along the thighs.
  parts.push(box(u - 0.12 * H, u + 0.12 * H, seat, seat + 0.06 * H, 0.08 * H, THRONE_DEPTH + 0.05 * H, T.figure, seed + 5))
  if (c.fallen) {
    // Broken at the waist: a ragged stump of the lower torso.
    parts.push(box(u - 0.1 * H, u + 0.08 * H, seat + 0.06 * H, seat + 0.12 * H, 0.04 * H, 0.15 * H, T.figure, seed + 6, 0.12))
    for (const [i, f] of fallenFragments(c).entries()) {
      const g = new THREE.BoxGeometry(f.w, f.h, f.d)
      g.rotateZ(i === 0 ? 0.35 : -0.2)
      g.rotateY(i === 0 ? 0.5 : -0.3)
      g.translate(f.u, f.h / 2 - 0.01 * H, f.v)
      parts.push(tint(g, T.figure, 0.1, seed + 10 + i))
    }
    return parts
  }
  for (const side of [-1, 1]) {
    const au = u + side * 0.1 * H
    parts.push(box(au - 0.035 * H, au + 0.035 * H, seat + 0.04 * H, seat + 0.09 * H, 0.1 * H, THRONE_DEPTH + 0.03 * H, T.figure, seed + 7 + side))
  }
  const chest = 0.78 * H
  parts.push(box(u - 0.13 * H, u + 0.13 * H, seat + 0.06 * H, chest, 0.03 * H, 0.17 * H, T.figure, seed + 9)) // torso
  // Nemes: the broad striped head cloth behind the head, its lappets on the chest.
  parts.push(box(u - 0.09 * H, u + 0.09 * H, chest - 0.05 * H, chest + 0.12 * H, 0.02 * H, 0.1 * H, T.face, seed + 11))
  for (const side of [-1, 1]) {
    const lu = u + side * 0.065 * H
    parts.push(box(lu - 0.022 * H, lu + 0.022 * H, chest - 0.12 * H, chest, 0.1 * H, 0.15 * H, T.face, seed + 12 + side))
  }
  parts.push(box(u - 0.055 * H, u + 0.055 * H, chest - 0.01 * H, chest + 0.11 * H, 0.08 * H, 0.18 * H, T.figure, seed + 15)) // face
  // The double crown of Upper and Lower Egypt.
  const crown = new THREE.CylinderGeometry(0.045 * H, 0.07 * H, 0.11 * H, 8)
  crown.translate(u, chest + 0.165 * H, 0.1 * H)
  parts.push(tint(crown, T.face, 0.06, seed + 16))
  return parts
}

/** One standing figure of the small temple, striding out of the face. */
function standingFigure(u: number, H: number, seed: number): THREE.BufferGeometry[] {
  return [
    box(u - 0.07 * H, u + 0.07 * H, 0, 0.48 * H, 0.02 * H, 0.16 * H, T.figure, seed), // legs and kilt
    box(u - 0.1 * H, u + 0.1 * H, 0.48 * H, 0.8 * H, 0.02 * H, 0.15 * H, T.figure, seed + 1), // torso and arms
    box(u - 0.055 * H, u + 0.055 * H, 0.8 * H, 0.94 * H, 0.03 * H, 0.15 * H, T.figure, seed + 2), // head
    box(u - 0.04 * H, u + 0.04 * H, 0.94 * H, H, 0.05 * H, 0.13 * H, T.face, seed + 3), // crown
  ]
}

/** The 1890 drift: a wedge against the face whose crest follows driftCrestAt
 *  and runs out to the ground `reach` metres in front. */
function sandDrift(): THREE.BufferGeometry {
  const us: number[] = []
  const n = 12
  for (let i = 0; i <= n; i++) us.push(S.drift.uFrom + ((S.drift.uTo - S.drift.uFrom) * i) / n)
  const pos: number[] = []
  const idx: number[] = []
  // Per station: crest on the face (v slightly behind 0 so it meets the rock)
  // and the foot at the reach.
  for (const u of us) {
    pos.push(u, driftCrestAt(u), -0.3, u, -0.05, S.drift.reach)
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2
    idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3)
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setIndex(idx)
  g.computeVertexNormals()
  const ng = g.toNonIndexed()
  g.dispose()
  ng.computeVertexNormals()
  return tint(ng, T.sand, 0.05, 9100)
}

/** The rock and its two cut facades between `uMin` and `uMax`, `depth` deep. */
function cliffAndFacades(uMin: number, uMax: number, depth: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const { height, cheek } = S.cliff
  const k = S.scale
  const gHalf = (S.great.width * k) / 2
  const su = S.small.u * k
  const sHalf = (S.small.width * k) / 2
  // The rock behind the face, in a few uneven blocks so the top line breaks.
  const blocks = 8
  for (let i = 0; i < blocks; i++) {
    const u0 = uMin + ((uMax - uMin) * i) / blocks
    const u1 = uMin + ((uMax - uMin) * (i + 1)) / blocks
    const h = height * (0.94 + 0.12 * (((i * 7919) % 13) / 13))
    parts.push(box(u0, u1, 0, h, -depth, 0, T.rock, 9000 + i, 0.09))
  }
  // Cheeks standing forward of the face beside and between the facades.
  const cheeks: Array<[number, number]> = [[uMin, -gHalf], [gHalf, su - sHalf], [su + sHalf, uMax]]
  cheeks.forEach(([u0, u1], i) => {
    const a = Math.max(u0, uMin)
    const b = Math.min(u1, uMax)
    if (b > a) parts.push(box(a, b, 0, height * 0.97, 0, cheek, T.rock, 9020 + i, 0.09))
  })
  // The Great Temple facade: a smooth dressed face with a cornice, the dark
  // doorway between the inner colossi and the falcon-headed niche above it.
  parts.push(box(-gHalf, gHalf, 0, S.great.height * k, -0.4, 0.2, T.face, 9030, 0.04))
  parts.push(box(-gHalf, gHalf, S.great.height * k - 1.2 * k, S.great.height * k, 0.2, 0.9, T.face, 9031, 0.04))
  const dw = (S.great.door.width * k) / 2
  parts.push(box(-dw, dw, 0, S.great.door.height * k, 0.2, 0.3, T.dark, 9032, 0.02))
  parts.push(box(-1.6 * k, 1.6 * k, 12 * k, 18.5 * k, 0.2, 0.3, T.dark, 9033, 0.02))
  parts.push(box(-0.9 * k, 0.9 * k, 12.2 * k, 17.8 * k, 0.25, 1.1, T.figure, 9034))
  // The small temple facade, its buttresses between the figures and its door.
  const sh = S.small.height * k
  parts.push(box(su - sHalf, su + sHalf, 0, sh, -0.4, 0.2, T.face, 9040, 0.04))
  const fu = S.small.statueU.map((u) => su + u * k)
  // At both ends and between neighbouring figures, the doorway gap left open.
  const edge = 0.7 * k
  const buttress = [su - sHalf + edge, (fu[0] + fu[1]) / 2, (fu[1] + fu[2]) / 2, (fu[3] + fu[4]) / 2, (fu[4] + fu[5]) / 2, su + sHalf - edge]
  buttress.forEach((u, i) => parts.push(box(u - 0.7 * k, u + 0.7 * k, 0, sh * 0.95, 0, 2.2 * k, T.face, 9045 + i, 0.05)))
  const sd = (S.small.door.width * k) / 2
  parts.push(box(su - sd, su + sd, 0, S.small.door.height * k, 0.2, 0.3, T.dark, 9060, 0.02))
  fu.forEach((u, i) => parts.push(...standingFigure(u, S.small.statueHeight * k, 9070 + i * 5)))
  return parts
}

/** Everything of the site between `uMin` and `uMax`, in the cliff frame,
 *  turned into the site frame. */
function buildSite(uMin: number, uMax: number, depth: number): THREE.BufferGeometry {
  const parts = cliffAndFacades(uMin, uMax, depth)
  GREAT_COLOSSI.forEach((c, i) => parts.push(...seatedColossus(c, 9200 + i * 30)))
  parts.push(sandDrift())
  // One attribute set for the merge: non-indexed, no uv (the drift has none).
  const flat = parts.map((p) => {
    const q = p.index ? p.toNonIndexed() : p
    if (q !== p) p.dispose()
    q.deleteAttribute('uv')
    return q
  })
  const merged = merge(flat)
  merged.computeVertexNormals()
  merged.rotateY(S.yaw)
  return merged
}

/** The walkable site at real size (metres, site frame). */
export function buildAbuSimbelSite(): THREE.BufferGeometry {
  return buildSite(S.cliff.uMin, S.cliff.uMax, S.cliff.depth)
}

/** The bird's-eye landmark: the same build cut to the temples' stretch of
 *  cliff and scaled to a landmark symbol (world units). */
export function buildRockTemples(): THREE.BufferGeometry {
  const f = S.field
  const g = buildSite(f.uMin, f.uMax, f.depth)
  g.scale(f.scale, f.scale, f.scale)
  return g
}
