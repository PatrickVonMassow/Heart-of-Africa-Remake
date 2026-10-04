// Detailed ungulates — zebra, antelope (gazelle) and the settlement goat
// (design.md §19; acceptance criterion 11, no schematic look). Instead of the
// shared capsule body plan (sphere torso, cylinder legs and neck) each is
// shaped from swept tubes: a torso with rump, waist and deep chest, a neck
// thick at the shoulder and tapering to the poll, a head with jowl and muzzle,
// ears, eyes, the species ornament (lyre horns, swept-back goat horns, the
// zebra's upright striped mane, a beard), a tail, and jointed legs — forearm
// and thigh muscle over a knee or backward hock, a slim cannon, a fetlock and a
// dark hoof. Faces get the minimum that reads at distance: muzzle, eyes, ears.
//
// The gait runs unchanged on the same hip pivots (GoatLeg, gaitRig): each leg
// is built with its hip at the local origin and its foot exactly at the leg
// length, so a jointed leg swings as the rigid peg leg the gait math assumes.
// The pelt markings come from faunaMarkings.ts.

import * as THREE from 'three/webgpu'
import { QUALITY_PRESETS } from '../config/quality'
import {
  calfProportions,
  fitLegToPivot,
  merge,
  sweepTube,
  tint,
  tintWhere,
  type GoatLeg,
  type QuadrupedSpec,
  type SweepStation,
} from './faunaGeometry'
import { MARK, markGeometry, markStripes } from './faunaMarkings'

/** Default radial segments of the swept body parts — the medium detail level
 *  (`faunaBodySegments` in src/config/quality.ts). */
export const DEFAULT_FAUNA_BODY_SEGMENTS = QUALITY_PRESETS.medium.faunaBodySegments

export interface UngulateSpec extends QuadrupedSpec {
  /** Poll-to-nose length, in headSize units. */
  headLen: number
  /** Angle of the face below the horizontal (rad). */
  headPitch: number
  /** Ears in headSize units; `spread` tilts them outward, `back` rearward (rad). */
  ear: { len: number; width: number; spread: number; back: number }
  /** Dark muzzle (zebra, gazelle nose). */
  muzzleColor?: string
  /** Upright mane along the neck crest; height in bodyR units. */
  mane?: { color: string; height: number }
  /** Tail; length in bodyR units, with an optional dark tuft/tip. */
  tail: { len: number; color: string; tip?: string; up?: boolean }
  /** Horn form when `horns` is set; length in headSize units. */
  hornForm?: 'lyre' | 'swept'
  hornLen?: number
  hornColor?: string
  /** Torso width factor (1 = round; a goat is slab-sided). */
  bodyWidth?: number
  /** Chin beard (goat). */
  beard?: string
  hoofColor: string
  marking: 'zebra' | 'gazelle' | 'none'
}

const ZEBRA: UngulateSpec = {
  bodyLen: 1.5,
  bodyR: 0.42,
  legH: 0.75,
  legR: 0.07,
  neckLen: 0.65,
  neckTilt: 0.6,
  headSize: 0.2,
  bodyColor: '#e6e2d8',
  headColor: '#e6e2d8',
  seed: 121,
  headLen: 3.0,
  headPitch: 0.95,
  ear: { len: 0.95, width: 0.22, spread: 0.3, back: 0.25 },
  muzzleColor: '#2a2622',
  mane: { color: '#e6e2d8', height: 0.42 },
  tail: { len: 1.6, color: '#d8d4cc', tip: '#1f1c19' },
  hoofColor: '#2a2622',
  marking: 'zebra',
}

const ANTELOPE: UngulateSpec = {
  bodyLen: 1.1,
  bodyR: 0.32,
  legH: 0.65,
  legR: 0.05,
  neckLen: 0.55,
  neckTilt: 0.5,
  headSize: 0.15,
  bodyColor: '#b8894f',
  headColor: '#b8894f',
  horns: true,
  seed: 131,
  headLen: 2.7,
  headPitch: 0.75,
  ear: { len: 1.15, width: 0.26, spread: 0.75, back: 0.3 },
  muzzleColor: '#3a2c20',
  tail: { len: 0.7, color: '#b8894f', tip: '#2a2018' },
  hornForm: 'lyre',
  hornLen: 2.5,
  hornColor: '#33291f',
  hoofColor: '#2a2018',
  marking: 'gazelle',
}

const GOAT: UngulateSpec = {
  bodyLen: 0.65,
  bodyR: 0.2,
  legH: 0.35,
  legR: 0.035,
  neckLen: 0.3,
  neckTilt: 0.55,
  headSize: 0.1,
  bodyColor: '#9a8a72',
  headColor: '#8a7a62',
  horns: true,
  seed: 171,
  bodyWidth: 0.85,
  headLen: 2.6,
  headPitch: 0.85,
  ear: { len: 1.0, width: 0.24, spread: 1.25, back: 0.15 },
  tail: { len: 0.55, color: '#7a6a52', up: true },
  hornForm: 'swept',
  hornLen: 2.4,
  hornColor: '#4a3f33',
  beard: '#4a3f33',
  hoofColor: '#3a3128',
  marking: 'none',
}

/** Layout stations the builder and the tests share: everything in the
 *  animal's frame (+Z forward, origin on the ground under the body centre). */
export function ungulateLayout(s: UngulateSpec) {
  const R = s.bodyR
  const backY = s.legH + R * 0.8
  const halfL = s.bodyLen * 0.5
  const legLen = s.legH + R * 0.4
  const neckDir = new THREE.Vector3(0, Math.cos(s.neckTilt), Math.sin(s.neckTilt))
  const neckBase = new THREE.Vector3(0, backY + 0.1 * R, halfL + 0.25 * R)
  const neckTop = neckBase.clone().addScaledVector(neckDir, s.neckLen * 0.9)
  const headDir = new THREE.Vector3(0, -Math.sin(s.headPitch), Math.cos(s.headPitch))
  // Up across the face (forehead side): perpendicular to the head axis.
  const headUp = new THREE.Vector3(0, Math.cos(s.headPitch), Math.sin(s.headPitch))
  const poll = neckTop.clone().addScaledVector(headUp, 0.1 * s.headSize)
  const nose = poll.clone().addScaledVector(headDir, s.headLen * s.headSize)
  return { R, backY, halfL, legLen, neckDir, neckBase, neckTop, headDir, headUp, poll, nose }
}

type Segs = { body: number; limb: number; thin: number }
const segmentsFor = (radial: number): Segs => ({
  body: radial,
  limb: Math.max(8, Math.round(radial * 0.6)),
  thin: Math.max(6, Math.round(radial / 3)),
})

const v3 = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z]

/** Everything but the legs, as separate tinted and marked parts. */
function ungulateBodyParts(s: UngulateSpec, segs: Segs): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const L = ungulateLayout(s)
  const { R, backY, halfL } = L
  const h = s.headSize
  const headColor = s.headColor ?? s.bodyColor

  // Torso: a rounded rump, the hip, a waist, the deep girth behind the
  // forelegs and the breast — not a capsule. The ends close along an
  // elliptical falloff so the rump reads round, never as a cut-off tube.
  const w = s.bodyWidth ?? 1
  const st = (z: number, y: number, rx: number, ry: number): SweepStation => ({ p: [0, backY + y * R, z], rx: rx * R * w, ry: ry * R })
  const torso = sweepTube(
    [
      st(-halfL - 0.8 * R, 0.0, 0.22, 0.26),
      st(-halfL - 0.62 * R, 0.02, 0.55, 0.6),
      st(-halfL - 0.35 * R, 0.02, 0.74, 0.78),
      st(-halfL + 0.05 * R, -0.02, 0.8, 0.84),
      st(0, -0.1, 0.8, 0.86),
      st(halfL - 0.15 * R, -0.12, 0.76, 0.96),
      st(halfL + 0.3 * R, -0.08, 0.62, 0.84),
      st(halfL + 0.55 * R, -0.02, 0.44, 0.6),
      st(halfL + 0.72 * R, 0.04, 0.2, 0.26),
    ],
    { radial: segs.body, rings: 20, capStart: true, capEnd: true },
  )
  parts.push(tint(torso, s.bodyColor, 0.08, s.seed))

  // Neck: deep where it springs from the shoulder, tapering to the poll, the
  // crest gently arched.
  const nd = L.neckDir
  const neckAt = (f: number, arch: number) =>
    v3(L.neckBase.clone().addScaledVector(nd, f * s.neckLen * 0.9).add(new THREE.Vector3(0, 0, -arch * R)))
  const neck = sweepTube(
    [
      { p: neckAt(-0.15, 0), rx: 0.46 * R, ry: 0.66 * R },
      { p: neckAt(0.35, 0.06), rx: 0.36 * R, ry: 0.48 * R },
      { p: neckAt(0.75, 0.04), rx: 0.3 * R, ry: 0.38 * R },
      { p: neckAt(1.05, 0), rx: 0.4 * h, ry: 0.5 * h },
    ],
    { radial: segs.body, rings: 8 },
  )
  parts.push(tint(neck, s.bodyColor, 0.08, s.seed + 2))

  // Head: poll, jowl, face, muzzle — the jowl sits low behind the face.
  const hd = L.headDir
  const hu = L.headUp
  const headAt = (f: number, drop: number) =>
    v3(L.poll.clone().addScaledVector(hd, f * s.headLen * h).addScaledVector(hu, -drop * h))
  const head = sweepTube(
    [
      { p: headAt(0, 0), rx: 0.42 * h, ry: 0.48 * h },
      { p: headAt(0.25, 0.12), rx: 0.48 * h, ry: 0.62 * h },
      { p: headAt(0.55, 0.05), rx: 0.36 * h, ry: 0.42 * h },
      { p: headAt(0.85, 0.02), rx: 0.32 * h, ry: 0.36 * h },
      { p: headAt(1, 0.02), rx: 0.28 * h, ry: 0.3 * h },
    ],
    { radial: segs.body, rings: 10, capStart: true, capEnd: true },
  )
  tint(head, headColor, 0.06, s.seed + 3)
  if (s.muzzleColor) tintWhere(head, (t) => t > 0.84, s.muzzleColor)
  parts.push(head)

  // Eyes: the minimum face, one dark bead per side behind the jowl line.
  for (const side of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.11 * h, 8, 6)
    const at = L.poll.clone().addScaledVector(hd, 0.3 * s.headLen * h).addScaledVector(hu, 0.12 * h)
    eye.translate(side * 0.4 * h, at.y, at.z)
    parts.push(tint(eye, '#16120f', 0.02, s.seed + 6))
  }

  // Ears: flattened leaf cones rising from the poll.
  for (const side of [-1, 1]) {
    const ear = new THREE.ConeGeometry(s.ear.width * h, s.ear.len * h, 8)
    ear.scale(1, 1, 0.4)
    ear.translate(0, (s.ear.len * h) / 2, 0)
    ear.rotateX(-s.ear.back)
    ear.rotateZ(-side * s.ear.spread)
    const at = L.poll.clone().addScaledVector(hu, 0.3 * h).addScaledVector(hd, 0.05 * s.headLen * h)
    ear.translate(side * 0.28 * h, at.y, at.z)
    parts.push(tint(ear, headColor, 0.06, s.seed + 7))
  }

  if (s.horns && s.hornForm) {
    const len = (s.hornLen ?? 2) * h
    const path: Array<[number, number]> =
      s.hornForm === 'lyre'
        ? // Up and back, the tips turning forward again: the gazelle lyre.
          [[0, 0], [0.42, -0.2], [0.78, -0.18], [1, 0.02]]
        : // Swept back over the neck: the goat's scimitar.
          [[0, 0], [0.35, -0.22], [0.52, -0.58], [0.46, -0.92]]
    for (const side of [-1, 1]) {
      const horn = sweepTube(
        path.map(([y, z], i) => ({ p: [0, y * len, z * len] as [number, number, number], rx: (0.1 - 0.025 * i) * len, ry: (0.1 - 0.025 * i) * len })),
        { radial: segs.thin, rings: 7, capEnd: true },
      )
      horn.rotateZ(-side * (s.hornForm === 'lyre' ? 0.16 : 0.32))
      const at = L.poll.clone().addScaledVector(hu, 0.32 * h).addScaledVector(hd, 0.12 * s.headLen * h)
      horn.translate(side * 0.2 * h, at.y, at.z)
      parts.push(tint(horn, s.hornColor ?? '#4a3a26', 0.08, s.seed + 4))
    }
  }

  if (s.beard) {
    const beard = new THREE.ConeGeometry(0.16 * h, 0.75 * h, 8)
    beard.rotateX(Math.PI)
    const at = L.poll.clone().addScaledVector(hd, 0.72 * s.headLen * h).addScaledVector(hu, -0.55 * h)
    beard.translate(0, at.y - 0.3 * h, at.z)
    parts.push(tint(beard, s.beard, 0.08, s.seed + 8))
  }

  // Upright mane along the neck crest, from the withers to the poll.
  if (s.mane) {
    const back = new THREE.Vector3(0, Math.sin(s.neckTilt), -Math.cos(s.neckTilt))
    const crest = (f: number, r: number) => {
      const at = L.neckBase.clone().addScaledVector(nd, f * s.neckLen * 0.9).addScaledVector(back, r)
      return v3(at)
    }
    const mh = s.mane.height * R
    const mane = sweepTube(
      [
        { p: crest(-0.1, 0.55 * R), rx: 0.05 * R, ry: mh * 0.3 },
        { p: crest(0.4, 0.42 * R + mh * 0.3), rx: 0.06 * R, ry: mh * 0.5 },
        { p: crest(0.95, 0.3 * R + mh * 0.3), rx: 0.06 * R, ry: mh * 0.5 },
        { p: crest(1.15, 0.2 * R), rx: 0.05 * R, ry: mh * 0.3 },
      ],
      { radial: segs.thin, rings: 8, capStart: true, capEnd: true },
    )
    tint(mane, s.mane.color, 0.06, s.seed + 9)
    if (s.marking === 'zebra') markStripes(mane, v3(nd), 12)
    parts.push(mane)
  }

  // Tail from the top of the rump: a hanging switch, or the goat's short flag.
  {
    const tl = s.tail.len * R
    const root: [number, number, number] = [0, backY + 0.12 * R, -halfL - 0.62 * R]
    const path: Array<[number, number]> = s.tail.up
      ? [[0, 0], [0.45, -0.3], [0.8, -0.35]]
      : [[0, 0], [-0.22, -0.22], [-0.65, -0.3], [-1, -0.28]]
    const tail = sweepTube(
      path.map(([y, z], i) => ({
        p: [root[0], root[1] + y * tl, root[2] + z * tl] as [number, number, number],
        rx: (0.13 - 0.02 * i) * R,
        ry: (0.13 - 0.02 * i) * R,
      })),
      { radial: segs.thin, rings: 7, capEnd: true },
    )
    tint(tail, s.tail.color, 0.06, s.seed + 5)
    if (s.tail.tip) tintWhere(tail, (t) => t > 0.65, s.tail.tip)
    parts.push(tail)
  }

  // Pelt markings, laid out in the animal's own frame.
  if (s.marking === 'zebra') {
    // Broad bands, few enough to survive a small zebra: ~8 over the torso,
    // leaning forward on the shoulder; rings on the neck and the face.
    markStripes(torso, [0, 0.3, 1], 4.2)
    markStripes(neck, v3(nd), 7)
    markStripes(head, v3(hd), 8)
  } else if (s.marking === 'gazelle') {
    // Pale belly under a dark flank band.
    const bellyY = backY - 0.55 * R
    markGeometry(torso, MARK.flank, bellyY, 0.22 * R)
  }
  return parts
}

/** Jointed legs on their hip pivots (front: forearm over a straight knee;
 *  hind: thigh over a backward hock), hoof dark. Same hips as the capsule plan. */
function ungulateLegs(s: UngulateSpec, segs: Segs): GoatLeg[] {
  const R = s.bodyR
  const legLen = s.legH + R * 0.4
  const r = s.legR
  const front: Array<[number, number, number, number]> = [
    // [down fraction, forward fraction, rx, ry] in legLen / legR units
    [0, 0, 1.7, 2.6],
    [0.22, 0.02, 1.55, 2.2],
    [0.47, 0.0, 0.95, 1.15],
    [0.56, 0.0, 0.85, 1.0],
    [0.78, 0.0, 0.68, 0.82],
    [0.88, 0.012, 0.85, 0.98],
    [0.95, 0.03, 0.72, 0.8],
    [1, 0.04, 0.9, 1.0],
  ]
  const hind: Array<[number, number, number, number]> = [
    [0, 0, 1.9, 3.0],
    [0.2, 0.05, 1.7, 2.6],
    [0.42, -0.05, 1.0, 1.4],
    [0.5, -0.07, 0.85, 1.15],
    [0.76, -0.02, 0.68, 0.82],
    [0.88, 0.0, 0.85, 0.98],
    [0.95, 0.02, 0.72, 0.8],
    [1, 0.03, 0.9, 1.0],
  ]
  const legs: GoatLeg[] = []
  for (const [lx, lz] of [
    [-0.4, 0.75],
    [0.4, 0.75],
    [-0.4, -0.75],
    [0.4, -0.75],
  ]) {
    const plan = lz > 0 ? front : hind
    const geo = sweepTube(
      plan.map(([d, f, rx, ry]) => ({ p: [0, -d * legLen, f * legLen] as [number, number, number], rx: rx * r, ry: ry * r })),
      { radial: segs.limb, rings: 14, capEnd: true },
    )
    tint(geo, s.bodyColor, 0.08, s.seed + 1)
    tintWhere(geo, (t) => t > 0.93, s.hoofColor)
    if (s.marking === 'zebra') markStripes(geo, [0, 1, 0], 9)
    fitLegToPivot(geo, legLen)
    legs.push({
      geo,
      hip: [lx * R, legLen, lz * s.bodyLen * 0.5],
      // Diagonal pairs trot in antiphase (same rule as the capsule plan).
      phaseOffset: Math.sign(lx) === Math.sign(lz) ? Math.PI : 0,
    })
  }
  return legs
}

/** The detailed ungulate split into a body and four hip-pivoted legs. */
export function buildUngulateParts(s: UngulateSpec, radial = DEFAULT_FAUNA_BODY_SEGMENTS): { body: THREE.BufferGeometry; legs: GoatLeg[] } {
  const segs = segmentsFor(radial)
  return { body: merge(ungulateBodyParts(s, segs)), legs: ungulateLegs(s, segs) }
}

/** The same animal as ONE merged geometry (the instanced bird's-eye herds):
 *  the legs placed at their hips, at rest. */
export function buildUngulate(s: UngulateSpec, radial = DEFAULT_FAUNA_BODY_SEGMENTS): THREE.BufferGeometry {
  const segs = segmentsFor(radial)
  const parts = ungulateBodyParts(s, segs)
  for (const leg of ungulateLegs(s, segs)) {
    leg.geo.translate(...leg.hip)
    parts.push(leg.geo)
  }
  return merge(parts)
}

/** Zebra, ~1.5 units tall. */
export function buildZebra(radial = DEFAULT_FAUNA_BODY_SEGMENTS): THREE.BufferGeometry {
  return buildUngulate(ZEBRA, radial)
}

/** The zebra split into body and pivoted legs (point 255): the §2.5 panorama
 *  silhouettes need a real leg swing to read as walking at horizon range. */
export function buildZebraParts(radial = DEFAULT_FAUNA_BODY_SEGMENTS): { body: THREE.BufferGeometry; legs: GoatLeg[] } {
  return buildUngulateParts(ZEBRA, radial)
}

/** Zebra foal with baby-schema proportions (design.md §19); the mane stays. */
export function buildZebraCalf(radial = DEFAULT_FAUNA_BODY_SEGMENTS): THREE.BufferGeometry {
  return buildUngulate(calfProportions(ZEBRA), radial)
}

/** Antelope/gazelle, ~1.2 units tall (more at the horn tips). */
export function buildAntelope(radial = DEFAULT_FAUNA_BODY_SEGMENTS): THREE.BufferGeometry {
  return buildUngulate(ANTELOPE, radial)
}

/** The antelope split into body and pivoted legs (point 255). */
export function buildAntelopeParts(radial = DEFAULT_FAUNA_BODY_SEGMENTS): { body: THREE.BufferGeometry; legs: GoatLeg[] } {
  return buildUngulateParts(ANTELOPE, radial)
}

/** Antelope calf: baby schema, hornless (design.md §19). */
export function buildAntelopeCalf(radial = DEFAULT_FAUNA_BODY_SEGMENTS): THREE.BufferGeometry {
  return buildUngulate(calfProportions(ANTELOPE), radial)
}

/** Goat for village life (design.md §19 village life), ~0.7 units tall — the
 *  merged single-draw geometry for any static use. */
export function buildGoat(radial = DEFAULT_FAUNA_BODY_SEGMENTS): THREE.BufferGeometry {
  return buildUngulate(GOAT, radial)
}

/** The goat split into body and pivoted legs — the settlement walkers' rig. */
export function buildGoatParts(radial = DEFAULT_FAUNA_BODY_SEGMENTS): { body: THREE.BufferGeometry; legs: GoatLeg[] } {
  return buildUngulateParts(GOAT, radial)
}

/** The three specs, for tests. */
export const UNGULATE_SPECS = { zebra: ZEBRA, antelope: ANTELOPE, goat: GOAT } as const
