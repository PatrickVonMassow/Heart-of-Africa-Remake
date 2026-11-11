// The elephant graveyard's remains (design.md §4.4/§19.18; point 1498): where
// the water-side deaths of old elephants have accumulated (research
// docs/fauna-behaviour-1890.md §4.2/§4.3) the ground shows what decades leave
// of an elephant — collapsed skeletons with the rib arches standing out of the
// ground, the massive skulls and their lower jaws, the pelvis and shoulder
// blades, long bones and loose ribs scattered by scavengers, and the ivory —
// never the pale whole elephant bodies that read as plaster casts. Layout is
// seeded per run; the whole site merges into two geometries (bone, ivory).

import * as THREE from 'three/webgpu'
import { mulberry32 } from '../world/noise'
import { merge, tint } from './faunaGeometry'

/** Calibratable counts and sizes of the site (CLAUDE.md §2). Units ≈ m. */
export const GRAVEYARD_REMAINS = {
  /** Collapsed skeletons on the site. */
  skeletons: 6,
  /** Loose skulls beside the skeletons (the skull outlasts the rest). */
  looseSkulls: 3,
  /** Scattered ivory tusks. */
  tusks: 16,
  /** Scattered long bones (femur, humerus, tibia). */
  longBones: 20,
  /** Scattered loose ribs. */
  ribs: 24,
  /** Radius the skeleton centres fall within. */
  skeletonRadius: 5,
  /** Radius the loose pieces fall within. */
  scatterRadius: 6.8,
  /** Minimum distance between two skeleton centres (they never overlap). */
  skeletonGap: 3.0,
  /** Skeleton length scale range (an adult elephant ≈ 4 units nose to pelvis). */
  scale: { min: 0.8, max: 1.15 },
  /** Bleached bone and weathered ivory tones. */
  bone: '#ddd3bf',
  boneShade: '#a89c86',
  socket: '#4f4639',
  ivory: '#eadfc4',
} as const

export interface RemainsPiece {
  x: number
  z: number
  yaw: number
  s: number
}
export interface SkeletonPiece extends RemainsPiece {
  /** 0..1: how far the rib cage has fallen apart (ribs lying flat). */
  collapse: number
}
export interface GraveyardLayout {
  skeletons: SkeletonPiece[]
  skulls: RemainsPiece[]
  tusks: RemainsPiece[]
  longBones: RemainsPiece[]
  ribs: RemainsPiece[]
}

/** The seeded layout of the site, centred on (0, 0). Pure. */
export function graveyardLayout(seed: number): GraveyardLayout {
  const g = GRAVEYARD_REMAINS
  const rand = mulberry32((seed ^ 0x51ef4a2d) >>> 0)
  const disc = (r: number) => {
    const a = rand() * Math.PI * 2
    const d = Math.sqrt(rand()) * r
    return { x: Math.cos(a) * d, z: Math.sin(a) * d }
  }
  const skeletons: SkeletonPiece[] = []
  for (let tries = 0; skeletons.length < g.skeletons && tries < 400; tries++) {
    const p = disc(g.skeletonRadius)
    if (skeletons.some((o) => Math.hypot(o.x - p.x, o.z - p.z) < g.skeletonGap)) continue
    skeletons.push({ ...p, yaw: rand() * Math.PI * 2, s: g.scale.min + rand() * (g.scale.max - g.scale.min), collapse: rand() })
  }
  const scatter = (n: number, sMin: number, sMax: number): RemainsPiece[] =>
    Array.from({ length: n }, () => ({ ...disc(g.scatterRadius), yaw: rand() * Math.PI * 2, s: sMin + rand() * (sMax - sMin) }))
  return {
    skeletons,
    skulls: scatter(g.looseSkulls, 0.8, 1.1),
    tusks: scatter(g.tusks, 0.7, 1.2),
    longBones: scatter(g.longBones, 0.7, 1.2),
    ribs: scatter(g.ribs, 0.7, 1.1),
  }
}

let seedCounter = 1
const bone = (geo: THREE.BufferGeometry, hex: string = GRAVEYARD_REMAINS.bone) => tint(geo, hex, 0.07, seedCounter++)

/** One rib: an arc of `radius` through `arc` rad in the local x/y plane,
 *  springing from the origin and curving over toward +x. */
function ribArc(radius: number, arc: number, thick: number): THREE.BufferGeometry {
  const rib = new THREE.TorusGeometry(radius, thick, 5, 12, arc)
  rib.rotateZ(Math.PI - arc) // start at angle π - arc … end at π: from the far side up and over
  rib.translate(radius, 0, 0) // the spine end (angle π) at the origin
  return rib
}

/** A long bone lying on the ground along x: shaft with knobbed ends. */
export function buildLongBone(len = 1.1): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const shaft = new THREE.CylinderGeometry(0.06, 0.07, len, 7)
  shaft.rotateZ(Math.PI / 2)
  shaft.translate(0, 0.08, 0)
  parts.push(bone(shaft))
  for (const [x, r] of [
    [-len / 2, 0.13],
    [len / 2, 0.11],
  ] as const) {
    const knob = new THREE.SphereGeometry(r, 8, 6)
    knob.scale(1, 0.8, 1.1)
    knob.translate(x, r * 0.75, 0)
    parts.push(bone(knob))
  }
  return merge(parts)
}

/** The elephant skull lying on the ground facing +z: the massive vault, the
 *  dark eye sockets and nasal opening, the tusk sockets; the lower jaw apart. */
export function buildElephantSkull(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const vault = new THREE.SphereGeometry(1, 14, 10)
  vault.scale(0.5, 0.42, 0.48)
  vault.translate(0, 0.38, 0)
  parts.push(bone(vault))
  const brow = new THREE.SphereGeometry(1, 12, 8)
  brow.scale(0.42, 0.3, 0.3)
  brow.translate(0, 0.52, 0.18)
  parts.push(bone(brow))
  for (const side of [-1, 1]) {
    const socket = new THREE.SphereGeometry(0.09, 8, 6)
    socket.scale(0.6, 1, 1)
    socket.translate(side * 0.4, 0.45, 0.24)
    parts.push(bone(socket, GRAVEYARD_REMAINS.socket))
    const tuskSocket = new THREE.CylinderGeometry(0.1, 0.12, 0.35, 8)
    tuskSocket.rotateX(1.9)
    tuskSocket.translate(side * 0.2, 0.2, 0.42)
    parts.push(bone(tuskSocket, GRAVEYARD_REMAINS.boneShade))
  }
  const nasal = new THREE.SphereGeometry(0.11, 8, 6)
  nasal.scale(1.2, 0.8, 0.5)
  nasal.translate(0, 0.5, 0.42)
  parts.push(bone(nasal, GRAVEYARD_REMAINS.socket))
  // The lower jaw, fallen a little apart: a U of bone.
  const jaw = new THREE.TorusGeometry(0.26, 0.07, 5, 10, Math.PI)
  jaw.rotateX(-Math.PI / 2)
  jaw.translate(0.15, 0.07, 0.85)
  parts.push(bone(jaw))
  return merge(parts)
}

/** A curved, tapering tusk lying on the ground along +x (ivory). */
export function buildTusk(len = 1.4): THREE.BufferGeometry {
  const curve = new THREE.QuadraticBezierCurve3(
    new THREE.Vector3(-len / 2, 0.09, 0),
    new THREE.Vector3(0, 0.09, len * 0.28),
    new THREE.Vector3(len / 2, 0.09, len * 0.1),
  )
  const segs = 12
  const tusk = new THREE.TubeGeometry(curve, segs, 0.08, 7, false)
  // Taper toward the tip: pull every ring toward its centre point.
  const p = tusk.attributes.position
  const uv = tusk.attributes.uv
  const c = new THREE.Vector3()
  for (let i = 0; i < p.count; i++) {
    const t = uv.getX(i)
    curve.getPoint(t, c)
    const k = 1 - 0.8 * t
    p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k)
  }
  tusk.computeVertexNormals()
  return tint(tusk, GRAVEYARD_REMAINS.ivory, 0.05, 901)
}

/** One loose rib lying flat on the ground. */
export function buildLooseRib(): THREE.BufferGeometry {
  const rib = ribArc(0.55, 1.9, 0.045)
  rib.rotateX(-Math.PI / 2) // lay the arc flat
  rib.translate(-0.4, 0.05, 0)
  return bone(rib)
}

/**
 * A collapsed elephant skeleton on its side, facing +z, origin on the ground
 * at the rib cage: the spine along z, the rib arches standing out of the
 * ground (the read from above: a basket of pale curves), a share of them
 * fallen flat by `collapse`, the pelvis and shoulder blade, and the skull at
 * the head end.
 */
export function buildElephantSkeleton(collapse = 0.3): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // Spine: a chain of vertebrae with their dorsal spines.
  const n = 16
  for (let i = 0; i < n; i++) {
    const z = -1.7 + (i / (n - 1)) * 3.0
    const v = new THREE.SphereGeometry(0.1, 8, 6)
    v.scale(1, 0.9, 0.8)
    v.translate(-0.65, 0.1, z)
    parts.push(bone(v))
    const spike = new THREE.BoxGeometry(0.2, 0.05, 0.06)
    spike.translate(-0.83, 0.07, z)
    parts.push(bone(spike, GRAVEYARD_REMAINS.boneShade))
  }
  // Ribs: 10 arches from the spine over the cage, longest mid-chest.
  const ribs = 10
  for (let i = 0; i < ribs; i++) {
    const z = -0.7 + (i / (ribs - 1)) * 1.8
    const mid = 1 - Math.abs(i / (ribs - 1) - 0.55) * 1.1
    const r = 0.45 + 0.35 * mid
    const fallen = (i * 0.37 + collapse * 3.1) % 1 < collapse * 0.6
    const rib = ribArc(r, 2.8, 0.045)
    if (fallen) {
      rib.rotateX(-Math.PI / 2 + 0.15)
      rib.translate(-0.65, 0.06, z)
    } else {
      rib.rotateY(0.1) // a slight rake toward the tail
      rib.translate(-0.65, 0.08, z)
    }
    parts.push(bone(rib))
  }
  // Pelvis: the broad butterfly of bone at the rear.
  for (const side of [-1, 1]) {
    const wing = new THREE.SphereGeometry(1, 10, 8)
    wing.scale(0.38, 0.08, 0.3)
    wing.rotateZ(side * 0.5)
    wing.translate(-0.5 + side * 0.32, 0.22, -2.0)
    parts.push(bone(wing))
  }
  // Shoulder blade, lying flat.
  const scap = new THREE.SphereGeometry(1, 10, 8)
  scap.scale(0.32, 0.05, 0.42)
  scap.translate(0.35, 0.05, 1.15)
  parts.push(bone(scap))
  // Two long bones still in place below the cage.
  for (const [x, z, yaw] of [
    [0.6, -1.4, 0.4],
    [0.7, 0.9, -0.3],
  ] as const) {
    const lb = buildLongBone(1.05)
    lb.rotateY(yaw)
    lb.translate(x, 0, z)
    parts.push(lb)
  }
  const skull = buildElephantSkull()
  skull.rotateY(0.25)
  skull.translate(-0.45, 0, 1.95)
  parts.push(skull)
  return merge(parts)
}

/** Place a built piece: scale, yaw, then the site offset. */
function place(geo: THREE.BufferGeometry, p: RemainsPiece): THREE.BufferGeometry {
  geo.scale(p.s, p.s, p.s)
  geo.rotateY(p.yaw)
  geo.translate(p.x, 0, p.z)
  return geo
}

/** The whole site as two geometries (bone, ivory), centred on the ground at (0, 0). */
export function buildGraveyardRemains(layout: GraveyardLayout): { bones: THREE.BufferGeometry; ivory: THREE.BufferGeometry } {
  seedCounter = 1
  const bones: THREE.BufferGeometry[] = []
  for (const s of layout.skeletons) bones.push(place(buildElephantSkeleton(s.collapse), s))
  for (const s of layout.skulls) bones.push(place(buildElephantSkull(), s))
  for (const b of layout.longBones) bones.push(place(buildLongBone(), b))
  for (const r of layout.ribs) bones.push(place(buildLooseRib(), r))
  const ivory = layout.tusks.map((t) => place(buildTusk(), t))
  return { bones: merge(bones), ivory: merge(ivory) }
}
