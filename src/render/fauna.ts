// Vertex-colored ambient wildlife geometries (design.md §19). Same approach
// as flora.ts: each species merges into one BufferGeometry so herds render as
// a single instanced draw call. Origin at the ground, +Z is the animal's
// forward direction. The rounded body parts are tessellated per
// FAUNA_TESSELLATION and smooth-shaded (point 214): the primitives carry
// per-vertex normals and the shared material never flat-shades, so curvature
// reads as a soft gradient instead of hard polygon panels.

import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../world/noise'

/**
 * Tessellation floors for the rounded organic fauna primitives (CLAUDE.md
 * §7.1 pt. 12, point 214 — the shading/tessellation cousin of the figures'
 * TESSELLATION in figures.ts): segment counts high enough that the curved
 * bodies read smooth at the close/mid bird's-eye range (the old 8x6 body
 * spheres and 5-6-segment limb cylinders read as hard flat panels on the
 * elephant). Boxy parts (ears, wings) stay deliberately hard-edged. The
 * vertex cost is negligible: each species is ONE merged geometry drawn
 * instanced.
 *
 * Point 214 close-zoom follow-up: at the 16x bird's-eye zoom the elephant
 * body's OUTLINE still stepped at 22x16 (16.4° of arc per face — a
 * silhouette-class facet; the normals were already smooth, so only more
 * tessellation rounds it). Body 36x24 (10°/face) and head 28x20 hold smooth
 * at the closest achievable zoom; measured cost is ~1.7-1.8x vertices per
 * species (the whole elephant: 1288 -> 2184), spread over one instanced draw
 * per species.
 */
export const FAUNA_TESSELLATION = {
  /** Torso-class spheres: bodies, humps, manes [width, height]. */
  body: [36, 24],
  /** Head spheres [width, height]. */
  head: [28, 20],
  /** Small spheres: eyes, bird bodies/heads, chicks [width, height]. */
  small: [12, 9],
  /** Limb cylinders/cones: legs, necks, tails, trunk segments (radial). */
  limb: 12,
  /** Spike cones: horns, tusks, beaks (radial). */
  spike: 8,
} as const

/**
 * The one shared fauna material (bird's-eye herds and hunt actors in
 * Wildlife.tsx, the village goats in PlaceLife.tsx). Smooth shading is
 * explicit (point 214): flat shading would give every merged body per-face
 * normals and collapse the rounded tessellation back into panels.
 */
export function createFaunaMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: false })
}

/**
 * Walk-cycle gait (design.md §19, points 228/255 — the animal foot-slide fix). A
 * walking animal must swing its legs, and the swing must ride the DISTANCE it
 * covers rather than wall-clock time, so the stride matches the speed and is
 * exactly zero at rest (no glide with still legs). rad of swing-cycle per world
 * unit walked.
 *
 * Calibrated as strides-per-metre (point 255): a full swing cycle is 2π rad, so
 * the cadence yields GAIT_CADENCE / 2π strides per world unit. At 11.0 that is
 * ~1.75 strides/m — a plausible walking cadence that reads as striding on the
 * FEET. The old 3.4 (0.54 strides/m — under one stride per metre) read as a slow
 * shuffle, the strongest of the point-255 complaints: it also made the SLOW
 * (near-turn) segments of the drift look frozen, so the legs seemed to move only
 * on the straight stretches even though the phase already rode raw distance.
 */
export const GAIT_CADENCE = 11.0
/** Amplitude (rad) a leg swings fore/aft about its hip. */
export const GAIT_SWING = 0.5

/**
 * Leg-swing phase from the distance travelled (point 228): a pure function of
 * DISTANCE, never of time — a stopped animal's legs are still, a faster one
 * strides faster. The caller accumulates the ground distance and reads the
 * phase back each frame.
 */
export function gaitPhase(distanceTravelled: number, cadence = GAIT_CADENCE): number {
  return distanceTravelled * cadence
}

/**
 * Fore/aft swing angle (rad) of one leg at a gait phase (point 228). Diagonal
 * legs carry a phaseOffset of π (a trot). At phase 0 — a standing animal —
 * every leg is at neutral (sin 0 = sin π = 0), so a resting animal never
 * twitches its legs.
 */
export function legSwingAngle(phase: number, phaseOffset: number, amp = GAIT_SWING): number {
  return Math.sin(phase + phaseOffset) * amp
}

/**
 * Facing yaw (rad) that tracks the velocity direction (point 228): an animal
 * turns to face where it MOVES, so it can never glide backward. Below the
 * epsilon speed the previous facing is held (no spin when standing still). Uses
 * the codebase's atan2(vx, vz) yaw convention (yaw 0 = +z forward).
 */
export function faceVelocity(vx: number, vz: number, prevYaw: number, eps = 1e-4): number {
  if (Math.hypot(vx, vz) < eps) return prevYaw
  return Math.atan2(vx, vz)
}

function tint(geo: THREE.BufferGeometry, hex: string, jitter = 0.08, seed = 1): THREE.BufferGeometry {
  const base = new THREE.Color(hex)
  const rand = mulberry32(seed)
  const count = geo.attributes.position.count
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const f = 1 + (rand() - 0.5) * 2 * jitter
    colors[i * 3] = Math.min(1, base.r * f)
    colors[i * 3 + 1] = Math.min(1, base.g * f)
    colors[i * 3 + 2] = Math.min(1, base.b * f)
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return geo
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

export interface QuadrupedSpec {
  bodyLen: number
  bodyR: number
  legH: number
  legR: number
  neckLen: number
  neckTilt: number
  headSize: number
  bodyColor: string
  headColor?: string
  horns?: boolean
  seed: number
}

/**
 * Baby-schema proportions for a juvenile (design.md §19): within the schematic
 * animal style a calf reads as young beyond its mere size — a proportionally
 * larger head on a shorter neck, a shorter, rounder body on relatively long,
 * thin legs, and none of the adult ornaments (horns). Built at adult scale;
 * the per-animal spawn scale shrinks the whole calf.
 */
export function calfProportions(s: QuadrupedSpec): QuadrupedSpec {
  return {
    ...s,
    bodyLen: s.bodyLen * 0.68,
    bodyR: s.bodyR * 0.88,
    legR: s.legR * 0.75, // legH stays: a leggy, stilt-like juvenile stance
    neckLen: s.neckLen * 0.7,
    headSize: s.headSize * 1.45,
    horns: false,
  }
}

/** Shared quadruped body plan (zebra, antelope, goat, lion base). */
function buildQuadruped(s: QuadrupedSpec): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const backY = s.legH + s.bodyR * 0.8

  const body = new THREE.SphereGeometry(s.bodyR, ...FAUNA_TESSELLATION.body)
  body.scale(0.8, 0.8, s.bodyLen / (2 * s.bodyR) + 0.55)
  body.translate(0, backY, 0)
  parts.push(tint(body, s.bodyColor, 0.1, s.seed))

  for (const [lx, lz] of [
    [-0.4, 0.75],
    [0.4, 0.75],
    [-0.4, -0.75],
    [0.4, -0.75],
  ]) {
    const leg = new THREE.CylinderGeometry(s.legR, s.legR * 0.8, s.legH + s.bodyR * 0.4, FAUNA_TESSELLATION.limb)
    leg.translate(lx * s.bodyR, (s.legH + s.bodyR * 0.4) / 2, lz * s.bodyLen * 0.5)
    parts.push(tint(leg, s.bodyColor, 0.12, s.seed + 1))
  }

  const neck = new THREE.CylinderGeometry(s.bodyR * 0.32, s.bodyR * 0.45, s.neckLen, FAUNA_TESSELLATION.limb)
  neck.rotateX(-s.neckTilt)
  const nz = s.bodyLen * 0.5 + Math.sin(s.neckTilt) * s.neckLen * 0.4
  const ny = backY + Math.cos(s.neckTilt) * s.neckLen * 0.4
  neck.translate(0, ny, nz)
  parts.push(tint(neck, s.bodyColor, 0.1, s.seed + 2))

  const head = new THREE.SphereGeometry(s.headSize, ...FAUNA_TESSELLATION.head)
  head.scale(0.8, 0.85, 1.35)
  const hz = nz + Math.sin(s.neckTilt) * s.neckLen * 0.35 + s.headSize * 0.5
  const hy = ny + Math.cos(s.neckTilt) * s.neckLen * 0.35
  head.translate(0, hy, hz)
  parts.push(tint(head, s.headColor ?? s.bodyColor, 0.1, s.seed + 3))

  if (s.horns) {
    for (const hx of [-0.5, 0.5]) {
      const horn = new THREE.ConeGeometry(s.headSize * 0.16, s.headSize * 1.6, FAUNA_TESSELLATION.spike)
      horn.rotateX(-0.5)
      horn.translate(hx * s.headSize, hy + s.headSize * 0.9, hz - s.headSize * 0.4)
      parts.push(tint(horn, '#4a3a26', 0.1, s.seed + 4))
    }
  }
  return parts
}

/** Rings sampled along the elephant trunk's curved centreline (segments =
 *  rings - 1). High enough that the droop reads as one smooth curve at the
 *  16x close zoom, in line with the point-214 tessellation floors. */
export const ELEPHANT_TRUNK_RINGS = 14

/**
 * Elephant trunk: ONE connected tapered tube swept along a curved centreline —
 * thick where it roots in the head, tapering monotonically to the tip, with
 * the natural downward droop and a gentle inward curl at the end. It replaces
 * the old three loosely stacked cylinders whose joints gapped and read as
 * separate parts. Built as an indexed ring sweep (ring-major vertex layout,
 * one apex vertex closing the tip) with recomputed smooth normals — the same
 * one-bent-surface approach as the palm trunk rebuild — at the limb
 * tessellation floor so no facet panels read at close zoom. The calf keeps a
 * shorter, stubbier curve on the same construction.
 */
export function buildElephantTrunk(calf = false): THREE.BufferGeometry {
  // Centreline control points (x = 0 plane): root buried in the head sphere,
  // then forward and down past the tusk line, drooping to a low tip that
  // curls softly back toward the body.
  const spine = (calf
    ? [
        [0, 2.05, 1.6],
        [0, 1.85, 2.0],
        [0, 1.6, 2.18],
        [0, 1.38, 2.16],
      ]
    : [
        [0, 2.05, 1.75],
        [0, 1.8, 2.18],
        [0, 1.45, 2.34],
        [0, 1.05, 2.32],
        [0, 0.78, 2.18],
        [0, 0.66, 2.0],
      ]
  ).map(([x, y, z]) => new THREE.Vector3(x, y, z))
  const curve = new THREE.CatmullRomCurve3(spine, false, 'centripetal')
  const rBase = calf ? 0.17 : 0.2
  const rTip = calf ? 0.075 : 0.055

  const rings = ELEPHANT_TRUNK_RINGS
  const radial = FAUNA_TESSELLATION.limb
  const xAxis = new THREE.Vector3(1, 0, 0)
  const center = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const side = new THREE.Vector3()

  const positions = new Float32Array((rings * radial + 1) * 3)
  const uvs = new Float32Array((rings * radial + 1) * 2)
  for (let k = 0; k < rings; k++) {
    const t = k / (rings - 1)
    curve.getPointAt(t, center)
    curve.getTangentAt(t, tangent)
    // The centreline stays in the x=0 plane, so the constant world X axis and
    // its cross with the tangent give a stable, twist-free ring frame.
    side.crossVectors(tangent, xAxis).normalize()
    const r = rBase + (rTip - rBase) * t
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const i = k * radial + j
      positions[i * 3] = center.x + Math.cos(a) * r
      positions[i * 3 + 1] = center.y + Math.sin(a) * r * side.y
      positions[i * 3 + 2] = center.z + Math.sin(a) * r * side.z
      uvs[i * 2] = j / radial
      uvs[i * 2 + 1] = t
    }
  }
  // Rounded tip: one apex vertex a touch past the last ring closes the tube.
  const tipIndex = rings * radial
  curve.getPointAt(1, center)
  curve.getTangentAt(1, tangent)
  center.addScaledVector(tangent, rTip)
  positions[tipIndex * 3] = center.x
  positions[tipIndex * 3 + 1] = center.y
  positions[tipIndex * 3 + 2] = center.z
  uvs[tipIndex * 2] = 0.5
  uvs[tipIndex * 2 + 1] = 1

  const indices: number[] = []
  for (let k = 0; k < rings - 1; k++) {
    for (let j = 0; j < radial; j++) {
      const j2 = (j + 1) % radial
      const a = k * radial + j
      const b = k * radial + j2
      const c = (k + 1) * radial + j2
      const d = (k + 1) * radial + j
      indices.push(a, b, c, a, c, d)
    }
  }
  for (let j = 0; j < radial; j++) {
    const j2 = (j + 1) % radial
    indices.push((rings - 1) * radial + j, (rings - 1) * radial + j2, tipIndex)
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Savanna elephant, ~2.6 units tall. With `calf`, baby-schema proportions
 *  (design.md §19): a rounder, shorter body, a proportionally bigger head with
 *  smaller ears, a stubby trunk and no tusks yet — built at adult scale, the
 *  spawn scale shrinks it. */
export function buildElephant(calf = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(1.05, ...FAUNA_TESSELLATION.body)
  body.scale(0.95, 0.95, calf ? 1.15 : 1.4)
  body.translate(0, 1.75, 0)
  parts.push(tint(body, '#8d8680', 0.06, 101))

  for (const [lx, lz] of [
    [-0.5, 0.85],
    [0.5, 0.85],
    [-0.5, -0.85],
    [0.5, -0.85],
  ]) {
    const leg = new THREE.CylinderGeometry(0.26, 0.3, 1.3, FAUNA_TESSELLATION.limb)
    leg.translate(lx, 0.65, lz * (calf ? 0.85 : 1))
    parts.push(tint(leg, '#847d77', 0.06, 102))
  }

  const head = new THREE.SphereGeometry(calf ? 0.85 : 0.62, ...FAUNA_TESSELLATION.head)
  head.translate(0, 2.15, calf ? 1.25 : 1.45)
  parts.push(tint(head, '#8d8680', 0.06, 103))

  for (const ex of calf ? [-0.88, 0.88] : [-0.72, 0.72]) {
    const ear = new THREE.BoxGeometry(0.1, calf ? 0.6 : 0.75, calf ? 0.5 : 0.62)
    ear.rotateY(ex < 0 ? 0.35 : -0.35)
    ear.translate(ex, 2.2, calf ? 1.1 : 1.3)
    parts.push(tint(ear, '#7d766f', 0.06, 104))
  }

  // Trunk: one connected tapered tube drooping along a curved centreline
  // (the calf's is short and stubby on the same construction).
  parts.push(tint(buildElephantTrunk(calf), '#847d77', 0.06, 105))

  if (!calf) {
    for (const tx of [-0.3, 0.3]) {
      const tusk = new THREE.ConeGeometry(0.07, 0.6, FAUNA_TESSELLATION.spike)
      tusk.rotateX(1.9)
      tusk.translate(tx, 1.75, 2.0)
      parts.push(tint(tusk, '#e8ddc4', 0.05, 108))
    }
  }
  return merge(parts)
}

/** Giraffe, ~3.6 units tall. With `calf`, baby-schema proportions (design.md
 *  §19): a much shorter neck carrying a proportionally bigger head over the
 *  same leggy stance, and short ossicone nubs — built at adult scale, the
 *  spawn scale shrinks it. */
export function buildGiraffe(calf = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(0.62, ...FAUNA_TESSELLATION.body)
  body.scale(0.85, 0.85, calf ? 1.1 : 1.35)
  body.rotateX(-0.18)
  body.translate(0, 1.9, 0)
  parts.push(tint(body, '#c89a55', 0.14, 111))

  for (const [lx, lz] of [
    [-0.3, 0.5],
    [0.3, 0.5],
    [-0.3, -0.5],
    [0.3, -0.5],
  ]) {
    const leg = new THREE.CylinderGeometry(0.09, 0.07, 1.65, FAUNA_TESSELLATION.limb)
    leg.translate(lx, 0.82, lz * (calf ? 0.85 : 1))
    parts.push(tint(leg, '#bf9150', 0.14, 112))
  }

  const neck = new THREE.CylinderGeometry(0.13, 0.2, calf ? 1.0 : 1.6, FAUNA_TESSELLATION.limb)
  neck.rotateX(-0.35)
  neck.translate(0, calf ? 2.55 : 2.85, calf ? 0.73 : 0.85)
  parts.push(tint(neck, '#c89a55', 0.14, 113))

  const head = new THREE.SphereGeometry(calf ? 0.29 : 0.2, ...FAUNA_TESSELLATION.head)
  head.scale(0.8, 0.8, 1.4)
  head.translate(0, calf ? 3.08 : 3.55, calf ? 1.0 : 1.25)
  parts.push(tint(head, '#c89a55', 0.12, 114))

  for (const ox of [-0.08, 0.08]) {
    const ossicone = new THREE.CylinderGeometry(0.025, 0.025, calf ? 0.1 : 0.18, FAUNA_TESSELLATION.spike)
    ossicone.translate(ox, calf ? 3.3 : 3.72, calf ? 0.92 : 1.15)
    parts.push(tint(ossicone, '#8a6a38', 0.1, 115))
  }
  return merge(parts)
}

const ZEBRA_SPEC: QuadrupedSpec = {
  bodyLen: 1.5,
  bodyR: 0.42,
  legH: 0.75,
  legR: 0.07,
  neckLen: 0.65,
  neckTilt: 0.6,
  headSize: 0.2,
  bodyColor: '#d8d4cc',
  headColor: '#9a958c',
  seed: 121,
}

/** Zebra, ~1.5 units tall. */
export function buildZebra(): THREE.BufferGeometry {
  return merge(buildQuadruped(ZEBRA_SPEC))
}

/** Zebra foal with baby-schema proportions (design.md §19). */
export function buildZebraCalf(): THREE.BufferGeometry {
  return merge(buildQuadruped(calfProportions(ZEBRA_SPEC)))
}

const ANTELOPE_SPEC: QuadrupedSpec = {
  bodyLen: 1.1,
  bodyR: 0.32,
  legH: 0.65,
  legR: 0.05,
  neckLen: 0.55,
  neckTilt: 0.5,
  headSize: 0.15,
  bodyColor: '#b08a55',
  horns: true,
  seed: 131,
}

/** Antelope/gazelle, ~1.2 units tall. */
export function buildAntelope(): THREE.BufferGeometry {
  return merge(buildQuadruped(ANTELOPE_SPEC))
}

/** Antelope calf: baby schema, hornless (design.md §19). */
export function buildAntelopeCalf(): THREE.BufferGeometry {
  return merge(buildQuadruped(calfProportions(ANTELOPE_SPEC)))
}

const WILDEBEEST_SPEC: QuadrupedSpec = {
  bodyLen: 1.5,
  bodyR: 0.44,
  legH: 0.8,
  legR: 0.07,
  neckLen: 0.5,
  neckTilt: 1.0,
  headSize: 0.2,
  bodyColor: '#5b554f',
  headColor: '#3d3a36',
  seed: 171,
}

/** Wildebeest (gnu), the quintessential savanna lion prey (~1.35 units tall). */
export function buildWildebeest(): THREE.BufferGeometry {
  const parts = buildQuadruped(WILDEBEEST_SPEC)
  // Muscular shoulder hump.
  const hump = new THREE.SphereGeometry(0.3, ...FAUNA_TESSELLATION.body)
  hump.scale(0.85, 0.7, 1.0)
  hump.translate(0, 1.36, 0.5)
  parts.push(tint(hump, '#4a453f', 0.1, 172))
  // Short curved horns sweeping out to the sides.
  for (const hx of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.04, 0.3, FAUNA_TESSELLATION.spike)
    horn.rotateZ(hx * 1.1)
    horn.translate(hx * 0.16, 1.55, 0.95)
    parts.push(tint(horn, '#2b2620', 0.08, 173))
  }
  // Beard hanging under the throat.
  const beard = new THREE.ConeGeometry(0.06, 0.26, FAUNA_TESSELLATION.spike)
  beard.rotateX(Math.PI)
  beard.translate(0, 1.02, 0.92)
  parts.push(tint(beard, '#2f2b26', 0.1, 174))
  return merge(parts)
}

/** Wildebeest calf: baby schema, none of the adult hump/horns/beard (§19). */
export function buildWildebeestCalf(): THREE.BufferGeometry {
  return merge(buildQuadruped(calfProportions(WILDEBEEST_SPEC)))
}

const WARTHOG_SPEC: QuadrupedSpec = {
  bodyLen: 1.0,
  bodyR: 0.3,
  legH: 0.4,
  legR: 0.05,
  neckLen: 0.25,
  neckTilt: 1.2,
  headSize: 0.2,
  bodyColor: '#5a4b3c',
  headColor: '#463a2e',
  seed: 181,
}

/** Warthog, a small tusked savanna lion prey (~0.65 units tall). */
export function buildWarthog(): THREE.BufferGeometry {
  const parts = buildQuadruped(WARTHOG_SPEC)
  // Curved tusks from the snout.
  for (const hx of [-1, 1]) {
    const tusk = new THREE.ConeGeometry(0.022, 0.18, FAUNA_TESSELLATION.spike)
    tusk.rotateX(-0.5)
    tusk.rotateZ(hx * 0.5)
    tusk.translate(hx * 0.08, 0.6, 0.72)
    parts.push(tint(tusk, '#e6dfcd', 0.06, 182))
  }
  // Bristly mane along the spine.
  const mane = new THREE.BoxGeometry(0.05, 0.14, 0.7)
  mane.translate(0, 0.74, 0.1)
  parts.push(tint(mane, '#3a2f24', 0.12, 183))
  return merge(parts)
}

/** Warthog piglet: baby schema, no tusks or bristly mane yet (§19). */
export function buildWarthogCalf(): THREE.BufferGeometry {
  return merge(buildQuadruped(calfProportions(WARTHOG_SPEC)))
}

const LION_SPEC: QuadrupedSpec = {
  bodyLen: 1.4,
  bodyR: 0.42,
  legH: 0.6,
  legR: 0.09,
  neckLen: 0.4,
  neckTilt: 0.85,
  headSize: 0.22,
  bodyColor: '#b6905a',
  seed: 141,
}

/** Lion, ~1.3 units tall, with mane. */
export function buildLion(): THREE.BufferGeometry {
  const parts = buildQuadruped(LION_SPEC)
  const mane = new THREE.SphereGeometry(0.42, ...FAUNA_TESSELLATION.body)
  mane.scale(1, 1, 0.85)
  mane.translate(0, 1.25, 0.85)
  parts.push(tint(mane, '#7a5228', 0.14, 142))
  const tail = new THREE.CylinderGeometry(0.03, 0.05, 0.9, FAUNA_TESSELLATION.limb)
  tail.rotateX(1.1)
  tail.translate(0, 1.1, -1.0)
  parts.push(tint(tail, '#b6905a', 0.1, 143))
  return merge(parts)
}

/** Lion cub: baby schema (proportionally larger head, shorter neck/body, leggy
 *  stance) and none of the adult ornaments — no mane yet (design.md §19.8,
 *  point 145c). The defended young of the lioness-vs-hyena drama. */
export function buildLionCub(): THREE.BufferGeometry {
  return merge(buildQuadruped(calfProportions(LION_SPEC)))
}

/** Slender quadruped predator with a long low tail (cheetah/leopard base). */
function buildCatPredator(bodyColor: string, headColor: string, scale: number, seed: number): THREE.BufferGeometry {
  const parts = buildQuadruped({
    bodyLen: 1.3 * scale,
    bodyR: 0.34 * scale,
    legH: 0.62 * scale,
    legR: 0.07 * scale,
    neckLen: 0.34 * scale,
    neckTilt: 0.9,
    headSize: 0.18 * scale,
    bodyColor,
    headColor,
    seed,
  })
  const tail = new THREE.CylinderGeometry(0.025 * scale, 0.04 * scale, 1.0 * scale, FAUNA_TESSELLATION.limb)
  tail.rotateX(1.25)
  tail.translate(0, 0.85 * scale, -0.95 * scale)
  parts.push(tint(tail, bodyColor, 0.1, seed + 5))
  return merge(parts)
}

/** Cheetah: slim, tawny, the open-plains sprinter (~1.1 units tall). */
export function buildCheetah(): THREE.BufferGeometry {
  return buildCatPredator('#c9a86a', '#8f7038', 1.0, 191)
}

/** Leopard: stockier, darker rosetted coat; ambush hunter near cover. */
export function buildLeopard(): THREE.BufferGeometry {
  return buildCatPredator('#b7923f', '#6f5722', 1.05, 201)
}

/** Spotted hyena: sloping back (high shoulders), coarse grey-brown coat. */
export function buildHyena(): THREE.BufferGeometry {
  const parts = buildQuadruped({
    bodyLen: 1.2,
    bodyR: 0.34,
    legH: 0.62,
    legR: 0.07,
    neckLen: 0.34,
    neckTilt: 1.1,
    headSize: 0.2,
    bodyColor: '#8a7d63',
    headColor: '#5f5442',
    seed: 211,
  })
  // Higher shoulders than hindquarters: a raised hump over the front legs.
  const hump = new THREE.SphereGeometry(0.26, ...FAUNA_TESSELLATION.body)
  hump.scale(0.85, 0.7, 1.0)
  hump.translate(0, 1.02, 0.5)
  parts.push(tint(hump, '#7c6f57', 0.12, 212))
  const tail = new THREE.CylinderGeometry(0.03, 0.04, 0.5, FAUNA_TESSELLATION.limb)
  tail.rotateX(0.8)
  tail.translate(0, 0.85, -0.85)
  parts.push(tint(tail, '#4c4436', 0.1, 213))
  return merge(parts)
}

/** Flamingo, ~1.1 units tall, standing. */
export function buildFlamingo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const leg = new THREE.CylinderGeometry(0.018, 0.018, 0.55, FAUNA_TESSELLATION.spike)
  leg.translate(0.03, 0.28, 0)
  parts.push(tint(leg, '#c96a70', 0.1, 151))

  const body = new THREE.SphereGeometry(0.2, ...FAUNA_TESSELLATION.small)
  body.scale(0.85, 0.8, 1.25)
  body.translate(0, 0.68, 0)
  parts.push(tint(body, '#ef8f9a', 0.12, 152))

  const neck1 = new THREE.CylinderGeometry(0.035, 0.045, 0.4, FAUNA_TESSELLATION.limb)
  neck1.rotateX(-0.5)
  neck1.translate(0, 0.92, 0.22)
  parts.push(tint(neck1, '#ef8f9a', 0.1, 153))
  const neck2 = new THREE.CylinderGeometry(0.03, 0.035, 0.3, FAUNA_TESSELLATION.limb)
  neck2.rotateX(0.35)
  neck2.translate(0, 1.12, 0.3)
  parts.push(tint(neck2, '#ef8f9a', 0.1, 154))

  const head = new THREE.SphereGeometry(0.07, ...FAUNA_TESSELLATION.small)
  head.translate(0, 1.26, 0.34)
  parts.push(tint(head, '#ef8f9a', 0.1, 155))
  const beak = new THREE.ConeGeometry(0.03, 0.16, FAUNA_TESSELLATION.spike)
  beak.rotateX(1.9)
  beak.translate(0, 1.22, 0.46)
  parts.push(tint(beak, '#3a3230', 0.1, 156))
  return merge(parts)
}

/** Ground-nesting plover (design.md §19.8, point 145b): a small lapwing-class
 *  bird that lives ON the ground at its nest — high-contrast head, thin legs.
 *  Unlike the vulture it never starts in the air. */
export function buildPlover(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (const hx of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.008, 0.008, 0.14, FAUNA_TESSELLATION.spike)
    leg.translate(hx * 0.03, 0.07, 0)
    parts.push(tint(leg, '#c9b48a', 0.08, 201))
  }
  const body = new THREE.SphereGeometry(0.09, ...FAUNA_TESSELLATION.small)
  body.scale(0.9, 0.8, 1.3)
  body.translate(0, 0.18, 0)
  parts.push(tint(body, '#b7a888', 0.1, 202))
  const breast = new THREE.SphereGeometry(0.06, ...FAUNA_TESSELLATION.small)
  breast.scale(0.9, 0.7, 0.8)
  breast.translate(0, 0.15, 0.07)
  parts.push(tint(breast, '#f2ead8', 0.06, 203))
  const head = new THREE.SphereGeometry(0.045, ...FAUNA_TESSELLATION.small)
  head.translate(0, 0.29, 0.09)
  parts.push(tint(head, '#2e2a24', 0.08, 204))
  const beak = new THREE.ConeGeometry(0.012, 0.05, FAUNA_TESSELLATION.spike)
  beak.rotateX(1.7)
  beak.translate(0, 0.285, 0.15)
  parts.push(tint(beak, '#3a3230', 0.06, 205))
  // Folded wings as flat side plates — the broken-wing drag tilts the body,
  // so the wing silhouette must read from above.
  for (const hx of [-1, 1]) {
    const wing = new THREE.BoxGeometry(0.02, 0.05, 0.16)
    wing.translate(hx * 0.08, 0.19, -0.01)
    parts.push(tint(wing, '#5a5248', 0.1, 206))
  }
  return merge(parts)
}

/** Plover chick (point 145b): baby schema — rounder, bigger-headed, no wing
 *  plates yet, downy pale colour. */
export function buildPloverChick(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(0.05, ...FAUNA_TESSELLATION.small)
  body.scale(1, 0.9, 1.1)
  body.translate(0, 0.06, 0)
  parts.push(tint(body, '#d8cba8', 0.08, 207))
  const head = new THREE.SphereGeometry(0.035, ...FAUNA_TESSELLATION.small)
  head.translate(0, 0.11, 0.03)
  parts.push(tint(head, '#cfc2a0', 0.08, 208))
  const beak = new THREE.ConeGeometry(0.008, 0.025, FAUNA_TESSELLATION.spike)
  beak.rotateX(1.7)
  beak.translate(0, 0.108, 0.065)
  parts.push(tint(beak, '#3a3230', 0.06, 209))
  return merge(parts)
}

/**
 * Documented stations of the crocodile build (point 243) — the z split lines
 * and back line the silhouette tests read (the trunk-ring precedent). +Z is
 * forward, origin at the ground/waterline.
 */
export const CROCODILE_LAYOUT = {
  /** Rear end of the torso ellipsoid — where the tail takes over. */
  tailBaseZ: -0.7,
  /** Front end of the torso — the skull sits ahead of this. */
  torsoFrontZ: 0.56,
  /** Front of the skull — the tapered snout reaches well beyond this. */
  snoutBaseZ: 0.87,
  /** The torso's top line: the LOW back nothing tall may ride above. */
  backTopY: 0.266,
  /** Torso half width — the splayed stance reaches beyond it. */
  torsoHalfWidth: 0.345,
} as const

/**
 * Hidden-crocodile submerge depth (design.md §19.16, point 242): a resting
 * crocodile drops its group origin by the torso's TOP line so the whole armoured
 * back sits at/below the water sheet and only the higher eye knobs break the
 * surface (the point-243 silhouette's crown). The old inline 0.24 render offset
 * left the back riding ~0.03 ABOVE the water — the exposed, flat-on-the-water
 * reading the user hit at the Giza Nile. Derived from CROCODILE_LAYOUT so a mesh
 * rebuild can never silently drift the pose off the geometry.
 */
export const CROCODILE_SUBMERGE_DEPTH = CROCODILE_LAYOUT.backTopY
/** Ride-out lift while lunging/striking (point 130): the origin sits just under
 *  the surface so the whole body clears the sheet — the burst rides fully out. */
export const CROCODILE_LUNGE_LIFT = 0.02

/**
 * Rendered body-origin y of a crocodile floating on a water surface (design.md
 * §19.16, points 130/242): hidden, slinking home, or dragging a kill under it
 * submerges to the eye knobs (body below the sheet); striking at live prey it
 * rides fully out. The single source of the render's crocodile bodyY.
 */
export function crocodileBodyY(surfaceY: number, submerged: boolean): number {
  return surfaceY - (submerged ? CROCODILE_SUBMERGE_DEPTH : CROCODILE_LUNGE_LIFT)
}

/** Nile crocodile (design.md §19.16, points 130/243): the classic silhouette —
 *  a long LOW raft of a body under a double row of low dorsal scutes (the old
 *  build's tall thin ridge rod is gone), a long TAPERED two-jaw snout meeting
 *  at a narrowed tip well forward of the skull, raised eye knobs as the
 *  highest point (the only thing breaking the surface when it lies hidden —
 *  also the anchor of point 242's submerge pose), four short splayed legs and
 *  a tail longer than the body core. Origin at the waterline in mind: hidden
 *  it sinks to the eye knobs, lunging it rides fully out. */
export function buildCrocodile(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const L = CROCODILE_LAYOUT

  // Torso: one long, low, wide ellipsoid (center y 0.14, half height 0.126).
  const torso = new THREE.SphereGeometry(0.3, ...FAUNA_TESSELLATION.body)
  torso.scale(1.15, 0.42, 2.2)
  torso.translate(0, 0.14, -0.1)
  parts.push(tint(torso, '#4d5b3f', 0.1, 191))
  /** Top of the torso ellipsoid at (x, z) — seats the dorsal scutes ON the back. */
  const torsoTopAt = (x: number, z: number): number => {
    const nx = x / 0.345
    const nz = (z + 0.1) / 0.66
    return 0.14 + 0.126 * Math.sqrt(Math.max(0, 1 - nx * nx - nz * nz))
  }

  // Skull: a flat wedge-round head ahead of the torso, lower than the eyes.
  const skull = new THREE.SphereGeometry(0.17, ...FAUNA_TESSELLATION.head)
  skull.scale(1.05, 0.55, 1.35)
  skull.translate(0, 0.17, 0.64)
  parts.push(tint(skull, '#46543a', 0.08, 192))

  // The classic croc jaw line: upper and lower jaw as flat tapered tubes
  // meeting at a narrowed tip well forward of the skull (ring vertices along
  // the length let the taper read in the mesh, not only at the ends).
  const upperJaw = new THREE.CylinderGeometry(0.038, 0.135, 0.75, FAUNA_TESSELLATION.limb, 6)
  upperJaw.rotateX(Math.PI / 2) // axis to +z, narrow end forward
  upperJaw.scale(1.4, 0.42, 1)
  upperJaw.translate(0, 0.155, 1.17)
  parts.push(tint(upperJaw, '#46543a', 0.08, 193))
  const lowerJaw = new THREE.CylinderGeometry(0.032, 0.115, 0.66, FAUNA_TESSELLATION.limb, 6)
  lowerJaw.rotateX(Math.PI / 2)
  lowerJaw.scale(1.35, 0.34, 1)
  lowerJaw.translate(0, 0.1, 1.08) // slight overbite: ends behind the upper tip
  parts.push(tint(lowerJaw, '#8a9070', 0.08, 194))
  // Nostril bump on the snout tip — with the eyes, what a swimmer sees first.
  const nostril = new THREE.SphereGeometry(0.032, ...FAUNA_TESSELLATION.small)
  nostril.scale(1.3, 0.7, 1)
  nostril.translate(0, 0.185, 1.47)
  parts.push(tint(nostril, '#39452f', 0.06, 195))

  // Raised eye knobs above the skull — the crown of the whole silhouette.
  for (const hx of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.052, ...FAUNA_TESSELLATION.small)
    eye.translate(hx * 0.095, 0.262, 0.55)
    parts.push(tint(eye, '#39452f', 0.06, 196))
  }

  // Armoured back: a double row of LOW wide-based scutes seated on the torso
  // top (replaces the old floating ridge box that read as a rod, point 243).
  for (const hx of [-1, 1]) {
    for (const sz of [-0.55, -0.33, -0.1, 0.11, 0.32]) {
      const scute = new THREE.ConeGeometry(0.055, 0.048, FAUNA_TESSELLATION.spike)
      scute.scale(1.7, 1, 1.25)
      scute.translate(hx * 0.075, torsoTopAt(hx * 0.075, sz) + 0.005, sz)
      parts.push(tint(scute, '#39452f', 0.1, 197))
    }
  }

  // Tail: longer than the body core, tapering to a fine tip, slightly drooped.
  const tailLen = 1.45
  const tail = new THREE.ConeGeometry(0.2, tailLen, FAUNA_TESSELLATION.limb, 8)
  tail.rotateX(-Math.PI / 2 - 0.04) // apex to -z, tip nosing down
  tail.scale(1.05, 0.52, 1)
  tail.translate(0, 0.125, L.tailBaseZ - tailLen / 2)
  parts.push(tint(tail, '#46543a', 0.1, 198))
  // A shrinking single row of tail scutes continues the back armour.
  for (const [tz, th] of [
    [-0.85, 0.042],
    [-1.15, 0.036],
    [-1.45, 0.03],
    [-1.75, 0.025],
  ]) {
    const frac = (L.tailBaseZ - tz) / tailLen
    const tailTop = 0.135 - 0.03 * frac + 0.52 * 0.2 * (1 - frac)
    const scute = new THREE.ConeGeometry(0.05, th, FAUNA_TESSELLATION.spike)
    scute.scale(1.5, 1, 1.2)
    scute.translate(0, tailTop + 0.005, tz)
    parts.push(tint(scute, '#39452f', 0.1, 199))
  }

  // Four short splayed legs: out-and-down stubs with flat feet — the sprawl
  // stance wider than the torso.
  for (const hx of [-1, 1]) {
    for (const hz of [0.32, -0.5]) {
      const leg = new THREE.CylinderGeometry(0.052, 0.04, 0.19, FAUNA_TESSELLATION.limb)
      leg.rotateZ(hx * 0.75)
      leg.translate(hx * 0.365, 0.071, hz)
      parts.push(tint(leg, '#46543a', 0.08, 200))
      const foot = new THREE.SphereGeometry(0.048, ...FAUNA_TESSELLATION.small)
      foot.scale(1.25, 0.45, 1.45)
      foot.translate(hx * 0.43, 0.03, hz + 0.03)
      parts.push(tint(foot, '#46543a', 0.08, 210))
    }
  }
  return merge(parts)
}

/** Vulture with spread wings, meant to circle overhead (design.md §19). */
export function buildVulture(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(0.16, ...FAUNA_TESSELLATION.small)
  body.scale(0.8, 0.6, 1.4)
  parts.push(tint(body, '#3f3833', 0.1, 161))
  const head = new THREE.SphereGeometry(0.06, ...FAUNA_TESSELLATION.small)
  head.translate(0, 0.03, 0.24)
  parts.push(tint(head, '#b8a48c', 0.1, 162))
  for (const side of [-1, 1]) {
    const wing = new THREE.BoxGeometry(0.85, 0.025, 0.28)
    wing.translate(side * 0.5, 0.04, -0.02)
    wing.rotateZ(side * 0.12)
    parts.push(tint(wing, '#4a423b', 0.12, 163))
    const tip = new THREE.BoxGeometry(0.3, 0.02, 0.2)
    tip.translate(side * 1.0, 0.12, -0.04)
    tip.rotateZ(side * 0.3)
    parts.push(tint(tip, '#38312c', 0.12, 164))
  }
  return merge(parts)
}

const GOAT_SPEC: QuadrupedSpec = {
  bodyLen: 0.65,
  bodyR: 0.2,
  legH: 0.35,
  legR: 0.035,
  neckLen: 0.3,
  neckTilt: 0.55,
  headSize: 0.1,
  bodyColor: '#9a8a72',
  horns: true,
  seed: 171,
}

/** Goat for village life (design.md §19 village life), ~0.7 units tall — the
 *  merged single-draw geometry for any static use. */
export function buildGoat(): THREE.BufferGeometry {
  return merge(buildQuadruped(GOAT_SPEC))
}

/** One pivoted goat leg (point 228). `geo` has its HIP (top) at the local
 *  origin, so a render group placed at `hip` and rotated about X swings the
 *  foot fore/aft. `phaseOffset` (0 or π) puts diagonal legs on opposite beats
 *  (a trot). */
export interface GoatLeg {
  geo: THREE.BufferGeometry
  hip: [number, number, number]
  phaseOffset: number
}

/**
 * The goat split into a body (everything but the legs) and four separately
 * pivoted legs (design.md §19, point 228). The settlement gait rotates each leg
 * about its hip so a walking goat no longer foot-slides. Same geometry as
 * buildGoat — just not merged across the hip joints. Village goats stand at
 * first-person range, where a legless glide reads plainly; the far bird's-eye
 * herds keep the cheaper merged build.
 */
export function buildGoatParts(): { body: THREE.BufferGeometry; legs: GoatLeg[] } {
  const s = GOAT_SPEC
  const backY = s.legH + s.bodyR * 0.8
  const bodyParts: THREE.BufferGeometry[] = []

  const body = new THREE.SphereGeometry(s.bodyR, ...FAUNA_TESSELLATION.body)
  body.scale(0.8, 0.8, s.bodyLen / (2 * s.bodyR) + 0.55)
  body.translate(0, backY, 0)
  bodyParts.push(tint(body, s.bodyColor, 0.1, s.seed))

  const neck = new THREE.CylinderGeometry(s.bodyR * 0.32, s.bodyR * 0.45, s.neckLen, FAUNA_TESSELLATION.limb)
  neck.rotateX(-s.neckTilt)
  const nz = s.bodyLen * 0.5 + Math.sin(s.neckTilt) * s.neckLen * 0.4
  const ny = backY + Math.cos(s.neckTilt) * s.neckLen * 0.4
  neck.translate(0, ny, nz)
  bodyParts.push(tint(neck, s.bodyColor, 0.1, s.seed + 2))

  const head = new THREE.SphereGeometry(s.headSize, ...FAUNA_TESSELLATION.head)
  head.scale(0.8, 0.85, 1.35)
  const hz = nz + Math.sin(s.neckTilt) * s.neckLen * 0.35 + s.headSize * 0.5
  const hy = ny + Math.cos(s.neckTilt) * s.neckLen * 0.35
  head.translate(0, hy, hz)
  bodyParts.push(tint(head, s.headColor ?? s.bodyColor, 0.1, s.seed + 3))

  if (s.horns) {
    for (const hx of [-0.5, 0.5]) {
      const horn = new THREE.ConeGeometry(s.headSize * 0.16, s.headSize * 1.6, FAUNA_TESSELLATION.spike)
      horn.rotateX(-0.5)
      horn.translate(hx * s.headSize, hy + s.headSize * 0.9, hz - s.headSize * 0.4)
      bodyParts.push(tint(horn, '#4a3a26', 0.1, s.seed + 4))
    }
  }

  const legLen = s.legH + s.bodyR * 0.4
  const legs: GoatLeg[] = []
  for (const [lx, lz] of [
    [-0.4, 0.75],
    [0.4, 0.75],
    [-0.4, -0.75],
    [0.4, -0.75],
  ]) {
    const leg = new THREE.CylinderGeometry(s.legR, s.legR * 0.8, legLen, FAUNA_TESSELLATION.limb)
    // Shift the cylinder down so its TOP sits at the local origin — the pivot.
    leg.translate(0, -legLen / 2, 0)
    // Diagonal legs (front-left+back-right vs front-right+back-left) trot in
    // antiphase: they share a beat when lx and lz have the same sign.
    const phaseOffset = Math.sign(lx) === Math.sign(lz) ? Math.PI : 0
    legs.push({
      geo: tint(leg, s.bodyColor, 0.12, s.seed + 1),
      hip: [lx * s.bodyR, legLen, lz * s.bodyLen * 0.5],
      phaseOffset,
    })
  }
  return { body: merge(bodyParts), legs }
}
