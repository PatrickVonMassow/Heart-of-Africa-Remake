// Shared geometry helpers of the ambient wildlife builds (fauna.ts,
// faunaUngulates.ts): vertex tinting, merging, the quadruped body-plan spec, and
// the swept tube the detailed ungulates are shaped from.

import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../world/noise'
import { FAUNA_MARK_ATTRIBUTE, markGeometry, MARK } from './faunaMarkings'

/** Vertex-colour a part with a seeded brightness jitter. Every fauna part
 *  passes through here, so it also gets the (unmarked) marking attribute the
 *  shared material reads — merged parts must all carry the same attributes. */
export function tint(geo: THREE.BufferGeometry, hex: string, jitter = 0.08, seed = 1): THREE.BufferGeometry {
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
  if (!geo.getAttribute(FAUNA_MARK_ATTRIBUTE)) markGeometry(geo, MARK.none)
  return geo
}

/** Re-colour the vertices of a swept part whose sweep fraction (uv.y, 0 at the
 *  first ring, 1 at the last) passes `where` — a hoof, a dark muzzle. */
export function tintWhere(geo: THREE.BufferGeometry, where: (t: number) => boolean, hex: string): THREE.BufferGeometry {
  const c = new THREE.Color(hex)
  const uv = geo.getAttribute('uv')
  const col = geo.getAttribute('color')
  for (let i = 0; i < uv.count; i++) {
    if (where(uv.getY(i))) col.setXYZ(i, c.r, c.g, c.b)
  }
  col.needsUpdate = true
  return geo
}

export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
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
  /** Sag of the topline at mid-back, in bodyR units (an aged sway-back;
   *  design.md §19.18). The body drops between withers and hips. */
  swayBack?: number
  /** Aged build: adds the prominent hip and shoulder bones (`agedBoneKnobs`). */
  elderly?: boolean
}

/** Dull and grey a coat colour by `amount` (0..1): toward the grey of its own
 *  luminance, a little darker — the staring, faded coat of an old animal
 *  (docs/fauna-behaviour-1890.md §2.1). Never applied to the giraffe (§10.2). */
export function agedColor(hex: string, amount: number): string {
  const c = new THREE.Color(hex)
  const k = Math.min(1, Math.max(0, amount))
  const lum = 0.299 * c.r + 0.587 * c.g + 0.114 * c.b
  const grey = lum * 0.95
  c.setRGB(c.r + (grey - c.r) * k, c.g + (grey - c.g) * k, c.b + (grey - c.b) * k)
  return `#${c.getHexString()}`
}

/** The greying muzzle of an old mammal (§2.1/§2.3): a face colour pulled toward a pale grey. */
export function greyMuzzle(hex: string, amount = 0.5): string {
  const c = new THREE.Color(hex).lerp(new THREE.Color('#8f8a84'), Math.min(1, Math.max(0, amount)))
  return `#${c.getHexString()}`
}

/** Shares by which the elderly schema changes an adult spec. Exported for the tests. */
export const ELDERLY_SCHEMA = {
  /** Barrel radius: a leaner, gaunter body (the strongest cue, research §2.1). */
  bodyR: 0.86,
  /** Bonier legs. */
  legR: 0.9,
  /** The head carried lower: added forward tilt of the neck (rad). */
  neckDrop: 0.15,
  /** Topline sag in bodyR units (sway-back, research §2.1, INFERRED for zebra). */
  swayBack: 0.14,
  /** Coat dulling/greying share (`agedColor`). */
  coatGrey: 0.3,
  /** Face dulling share — the greyer face reads before the coat does. */
  faceGrey: 0.5,
} as const

/**
 * The elderly-adult schema (design.md §19.18, research docs/fauna-behaviour-1890.md
 * §2/§10.7/§10.8), the old-age twin of `calfProportions`: a leaner, more
 * angular body with a sagging topline between prominent hips and withers, the
 * head carried lower, and a duller, greyer coat and face. `grey: false` keeps
 * the coat colour — the giraffe does not grey (§10.2). Built at adult scale.
 */
export function elderlyProportions<S extends QuadrupedSpec>(s: S, opts: { grey?: boolean } = {}): S {
  const grey = opts.grey !== false
  const head = s.headColor ?? s.bodyColor
  return {
    ...s,
    bodyR: s.bodyR * ELDERLY_SCHEMA.bodyR,
    legR: s.legR * ELDERLY_SCHEMA.legR,
    neckTilt: s.neckTilt + ELDERLY_SCHEMA.neckDrop,
    bodyColor: grey ? agedColor(s.bodyColor, ELDERLY_SCHEMA.coatGrey) : s.bodyColor,
    headColor: grey ? agedColor(head, ELDERLY_SCHEMA.faceGrey) : head,
    swayBack: ELDERLY_SCHEMA.swayBack,
    elderly: true,
  }
}

/** The prominent pin/hip bones and the withers of an aged body (research
 *  §2.1/§2.2): small rounded knobs standing proud of the dropped topline.
 *  `hipZ`/`withersZ` are the knobs' positions along the body, `topY` the
 *  topline height they crown (`withersY` where a sloping back sets the withers
 *  higher than the hips). */
export function agedBoneKnobs(
  hipZ: number,
  withersZ: number,
  topY: number,
  halfWidth: number,
  r: number,
  color: string,
  seed: number,
  withersY = topY,
): THREE.BufferGeometry[] {
  const out: THREE.BufferGeometry[] = []
  for (const [x, y, z] of [
    [-halfWidth, topY, hipZ],
    [halfWidth, topY, hipZ],
    [0, withersY, withersZ],
  ] as const) {
    const knob = new THREE.SphereGeometry(r, 10, 8)
    knob.scale(1, 0.8, 1.2)
    knob.translate(x, y, z)
    out.push(tint(knob, color, 0.06, seed))
  }
  return out
}

/**
 * Baby-schema proportions for a juvenile (design.md §19): within the schematic
 * animal style a calf reads as young beyond its mere size — a proportionally
 * larger head on a shorter neck, a shorter, rounder body on relatively long,
 * thin legs, and none of the adult ornaments (horns). Built at adult scale;
 * the per-animal spawn scale shrinks the whole calf.
 */
export function calfProportions<S extends QuadrupedSpec>(s: S): S {
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

/** The topline sag of a spec in world units (0 for a prime adult). */
export function swayDrop(s: QuadrupedSpec): number {
  return (s.swayBack ?? 0) * s.bodyR
}

/** One pivoted quadruped leg (point 228; goat, zebra, antelope, elephant,
 *  giraffe). `geo` has its HIP (top) at the local origin, so a render group
 *  placed at `hip` and rotated about X swings the foot fore/aft. `phaseOffset`
 *  (0 or π) splits the legs into two diagonal pairs that share a beat, the
 *  pairs in antiphase (a trot). */
export interface GoatLeg {
  geo: THREE.BufferGeometry
  hip: [number, number, number]
  phaseOffset: number
}

/** One control station of a swept tube: centre and the two half-axes of its
 *  elliptical cross-section — `rx` sideways (world X), `ry` in the sweep plane
 *  perpendicular to the centreline (up for a forward-running tube). */
export interface SweepStation {
  p: [number, number, number]
  rx: number
  ry: number
}

export interface SweepOptions {
  /** Vertices around each ring. */
  radial: number
  /** Rings sampled along the centreline (>= stations). */
  rings: number
  /** Close the first / last end with a rounded apex. */
  capStart?: boolean
  capEnd?: boolean
}

/**
 * A tube swept along a smooth centreline through `stations`, its elliptical
 * cross-section interpolated between them — the shaped torso, neck, head and
 * jointed legs of the detailed ungulates (the elephant-trunk construction,
 * generalised). The centreline must stay in a plane of constant x (the animal's
 * side view): the world X axis then gives a twist-free ring frame. Indexed with
 * shared ring vertices and smooth normals; uv = (around, along) with uv.y the
 * sweep fraction 0..1 that `tintWhere` reads.
 */
export function sweepTube(stations: readonly SweepStation[], opts: SweepOptions): THREE.BufferGeometry {
  const n = stations.length
  const curve = new THREE.CatmullRomCurve3(
    stations.map((s) => new THREE.Vector3(...s.p)),
    false,
    'centripetal',
  )
  const { radial, rings } = opts
  const xAxis = new THREE.Vector3(1, 0, 0)
  const centre = new THREE.Vector3()
  const tangent = new THREE.Vector3()
  const up = new THREE.Vector3()
  const capCount = (opts.capStart ? 1 : 0) + (opts.capEnd ? 1 : 0)
  const total = rings * radial + capCount
  const positions = new Float32Array(total * 3)
  const uvs = new Float32Array(total * 2)
  // Smoothstep-eased radius between neighbouring stations, so the profile has
  // no kinks at a station.
  const radiusAt = (t: number): [number, number] => {
    const u = t * (n - 1)
    const i = Math.min(n - 2, Math.floor(u))
    const f = u - i
    const e = f * f * (3 - 2 * f)
    const a = stations[i]
    const b = stations[i + 1]
    return [a.rx + (b.rx - a.rx) * e, a.ry + (b.ry - a.ry) * e]
  }
  for (let k = 0; k < rings; k++) {
    const t = k / (rings - 1)
    // getPoint (not getPointAt): t maps uniformly onto the station index, so
    // the radii above line up with their stations.
    curve.getPoint(t, centre)
    curve.getTangent(t, tangent)
    up.crossVectors(tangent, xAxis).normalize()
    const [rx, ry] = radiusAt(t)
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2
      const i = k * radial + j
      const c = Math.cos(a)
      const s = Math.sin(a)
      positions[i * 3] = centre.x + c * rx
      positions[i * 3 + 1] = centre.y + s * ry * up.y
      positions[i * 3 + 2] = centre.z + s * ry * up.z
      uvs[i * 2] = j / radial
      uvs[i * 2 + 1] = t
    }
  }
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
  let next = rings * radial
  const cap = (t: number, sign: number, ringStart: number, flip: boolean) => {
    curve.getPoint(t, centre)
    curve.getTangent(t, tangent)
    const [rx, ry] = radiusAt(t)
    centre.addScaledVector(tangent, sign * Math.min(rx, ry) * 0.6)
    positions[next * 3] = centre.x
    positions[next * 3 + 1] = centre.y
    positions[next * 3 + 2] = centre.z
    uvs[next * 2] = 0.5
    uvs[next * 2 + 1] = t
    for (let j = 0; j < radial; j++) {
      const a = ringStart + j
      const b = ringStart + ((j + 1) % radial)
      if (flip) indices.push(b, a, next)
      else indices.push(a, b, next)
    }
    next++
  }
  if (opts.capStart) cap(0, -1, 0, true)
  if (opts.capEnd) cap(1, 1, (rings - 1) * radial, false)

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2))
  geo.setIndex(indices)
  geo.computeVertexNormals()
  return geo
}

/** Seat a hanging leg on its pivot: top exactly at the local origin (the hip)
 *  and the hoof contact (its lowest vertex) exactly at (0, -`legLen`, 0) — the
 *  point the gait math swings — so a jointed leg neither hovers, digs in nor
 *  slides. A shear proportional to depth recentres the hoof; the top stays put. */
export function fitLegToPivot(geo: THREE.BufferGeometry, legLen: number): THREE.BufferGeometry {
  geo.computeBoundingBox()
  const b = geo.boundingBox!
  geo.translate(0, -b.max.y, 0)
  geo.scale(1, legLen / (b.max.y - b.min.y), 1)
  const pos = geo.attributes.position
  let low = 0
  for (let i = 1; i < pos.count; i++) if (pos.getY(i) < pos.getY(low)) low = i
  const dx = pos.getX(low)
  const dz = pos.getZ(low)
  for (let i = 0; i < pos.count; i++) {
    const depth = -pos.getY(i) / legLen
    pos.setXYZ(i, pos.getX(i) - dx * depth, pos.getY(i), pos.getZ(i) - dz * depth)
  }
  pos.needsUpdate = true
  geo.computeVertexNormals()
  geo.computeBoundingBox()
  return geo
}
