// The vulture (design.md §19; point 1498): built true to size from
// VULTURE_SHAPE — a ~1 m bird with a ~2.4 m span, never the flat 3.7 m planks
// it replaced — in two poses sharing one material: SPREAD for the circling and
// arriving flock (broad wings with fingered primaries, pale coverts over dark
// flight feathers, a short tail, the bare head drawn in) and FOLDED for a bird
// on the ground at a carcass (hunched body on legs, wings closed along the
// flanks past the tail, the pale ruff and the bare head on its neck).

import * as THREE from 'three/webgpu'
import { merge, tint } from './faunaGeometry'
import { VULTURE_SHAPE } from './vultureShape'

/** Sphere segments of the small bird parts (the fauna `small` tessellation). */
const SEG: [number, number] = [12, 9]

/** White-backed vulture tones (simplified field-guide plumage). */
export const VULTURE_TONES = {
  body: '#4a3e34',
  coverts: '#8a7966',
  flight: '#2b2420',
  ruff: '#d9cfc0',
  head: '#9a8a7e',
  beak: '#2e2a26',
  leg: '#5f5852',
} as const

/**
 * A flat slab from a closed outline in the x/z plane (`pts`, any winding,
 * simple polygon) and a thickness along y, centred on y = 0: top and bottom
 * faces plus side walls, each with its own flat normals, every triangle wound
 * to face along its normal (so a mirrored outline needs no special case).
 */
export function slabFromOutline(pts: readonly (readonly [number, number])[], thickness: number): THREE.BufferGeometry {
  const contour = pts.map(([x, z]) => new THREE.Vector2(x, z))
  const tris = THREE.ShapeUtils.triangulateShape(contour, [])
  const pos: number[] = []
  const nor: number[] = []
  const idx: number[] = []
  const h = thickness / 2
  const push = (x: number, y: number, z: number, n: [number, number, number]) => {
    pos.push(x, y, z)
    nor.push(...n)
    return pos.length / 3 - 1
  }
  const face = (a: number, b: number, c: number) => {
    // Orient the triangle so its geometric normal agrees with the vertex normal.
    const p = (i: number) => new THREE.Vector3(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2])
    const g = p(b).sub(p(a)).cross(p(c).sub(p(a)))
    const n = new THREE.Vector3(nor[a * 3], nor[a * 3 + 1], nor[a * 3 + 2])
    if (g.dot(n) >= 0) idx.push(a, b, c)
    else idx.push(a, c, b)
  }
  for (const [sy, n] of [
    [h, [0, 1, 0]],
    [-h, [0, -1, 0]],
  ] as const) {
    const base = pts.map(([x, z]) => push(x, sy, z, [...n] as [number, number, number]))
    for (const [a, b, c] of tris) face(base[a], base[b], base[c])
  }
  // Side walls, normals pointing away from the outline's centroid side.
  let cx = 0
  let cz = 0
  for (const [x, z] of pts) {
    cx += x / pts.length
    cz += z / pts.length
  }
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i]
    const [x1, z1] = pts[(i + 1) % pts.length]
    let nx = z1 - z0
    let nz = -(x1 - x0)
    const len = Math.hypot(nx, nz) || 1
    nx /= len
    nz /= len
    // Outward: away from the centroid (good enough for the near-convex wing edges).
    if (((x0 + x1) / 2 - cx) * nx + ((z0 + z1) / 2 - cz) * nz < 0) {
      nx = -nx
      nz = -nz
    }
    const n: [number, number, number] = [nx, 0, nz]
    const a = push(x0, h, z0, n)
    const b = push(x1, h, z1, n)
    const c = push(x1, -h, z1, n)
    const d = push(x0, -h, z0, n)
    face(a, b, c)
    face(a, c, d)
  }
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((pos.length / 3) * 2).fill(0), 2))
  geo.setIndex(idx)
  return geo
}

/** The right (+x) wing planform in (x, z), scaled from the shape: a broad
 *  "barn-door" soaring wing whose hand ends in six spread primaries. */
export function vultureWingOutline(): [number, number][] {
  const H = VULTURE_SHAPE.span / 2
  const c = VULTURE_SHAPE.chord
  const k = H / 1.2 // outline drawn for a 1.2 half-span, scaled in x
  const out: [number, number][] = [
    [0.1, 0.36 * c],
    [0.45 * k, 0.44 * c],
    [0.8 * k, 0.36 * c],
    [1.0 * k, 0.24 * c],
  ]
  const fingers = 6
  for (let i = 0; i < fingers; i++) {
    const z = 0.16 * c - i * 0.12 * c
    out.push([H - 0.03 * Math.abs(i - 2), z])
    if (i < fingers - 1) out.push([H - 0.14 * k, z - 0.06 * c])
  }
  out.push([1.02 * k, -0.54 * c], [0.75 * k, -0.6 * c], [0.45 * k, -0.64 * c], [0.1, -0.56 * c])
  return out
}

/** The pale covert panel over the inner and middle wing (white-backed vulture). */
function covertOutline(): [number, number][] {
  const k = VULTURE_SHAPE.span / 2 / 1.2
  const c = VULTURE_SHAPE.chord
  return [
    [0.1, 0.34 * c],
    [0.45 * k, 0.42 * c],
    [0.8 * k, 0.34 * c],
    [0.95 * k, 0.2 * c],
    [0.9 * k, -0.04 * c],
    [0.45 * k, -0.12 * c],
    [0.1, -0.1 * c],
  ]
}

const mirror = (pts: [number, number][]): [number, number][] => pts.map(([x, z]) => [-x, z])

/** Vulture with spread wings, circling or arriving (design.md §19). */
export function buildVulture(): THREE.BufferGeometry {
  const v = VULTURE_SHAPE
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(1, ...SEG)
  body.scale(v.body.halfWidth, v.body.halfHeight * 0.85, v.body.halfLen)
  parts.push(tint(body, VULTURE_TONES.body, 0.08, 161))
  // The pale ruff and the bare head, the neck drawn in for flight.
  const ruff = new THREE.SphereGeometry(0.08, ...SEG)
  ruff.translate(0, 0.03, v.body.halfLen * 0.85)
  parts.push(tint(ruff, VULTURE_TONES.ruff, 0.05, 162))
  const head = new THREE.SphereGeometry(v.head.r, ...SEG)
  head.scale(0.9, 0.9, 1.2)
  head.translate(0, 0.04, v.body.halfLen + v.head.r * 1.4)
  parts.push(tint(head, VULTURE_TONES.head, 0.06, 163))
  const beak = new THREE.ConeGeometry(0.025, v.head.beak, 6)
  beak.rotateX(Math.PI / 2)
  beak.translate(0, 0.03, v.body.halfLen + v.head.r * 2.4 + v.head.beak / 2)
  parts.push(tint(beak, VULTURE_TONES.beak, 0.04, 164))
  // A short, square tail.
  const tail = slabFromOutline(
    [
      [-0.06, -v.body.halfLen * 0.8],
      [0.06, -v.body.halfLen * 0.8],
      [v.tail.width / 2, -v.body.halfLen - v.tail.len],
      [-v.tail.width / 2, -v.body.halfLen - v.tail.len],
    ],
    0.02,
  )
  parts.push(tint(tail, VULTURE_TONES.flight, 0.08, 165))
  // Wings: dark flight feathers, the pale covert panel over them (a thicker
  // slab, so it shows on both faces without z-fighting), a slight dihedral.
  for (const side of [-1, 1]) {
    const wing = slabFromOutline(side > 0 ? vultureWingOutline() : mirror(vultureWingOutline()), 0.02)
    const coverts = slabFromOutline(side > 0 ? covertOutline() : mirror(covertOutline()), 0.03)
    for (const [g, tone, seed] of [
      [wing, VULTURE_TONES.flight, 166],
      [coverts, VULTURE_TONES.coverts, 167],
    ] as const) {
      g.rotateZ(side * 0.08)
      g.translate(0, 0.03, 0)
      parts.push(tint(g, tone, 0.1, seed))
    }
  }
  return merge(parts)
}

/** Vulture on the ground at a carcass: hunched, wings folded (point 1498).
 *  Origin at the body centre, feet `VULTURE_SHAPE.leg` below the body. */
export function buildVultureLanded(): THREE.BufferGeometry {
  const v = VULTURE_SHAPE
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(1, ...SEG)
  body.scale(v.body.halfWidth, v.body.halfHeight, v.body.halfLen)
  body.rotateX(-v.hunch)
  parts.push(tint(body, VULTURE_TONES.body, 0.08, 171))
  // Folded wings along the flanks, tips crossing past the tail; a pale
  // covert band on each.
  for (const side of [-1, 1]) {
    const wing = new THREE.SphereGeometry(1, ...SEG)
    wing.scale(0.06, 0.1, v.folded.halfLen)
    wing.rotateX(-v.hunch * 0.6)
    wing.translate(side * (v.body.halfWidth - 0.01), 0.03, -0.08)
    parts.push(tint(wing, VULTURE_TONES.flight, 0.08, 172))
    const band = new THREE.SphereGeometry(1, ...SEG)
    band.scale(0.065, 0.06, v.folded.halfLen * 0.45)
    band.rotateX(-v.hunch * 0.6)
    band.translate(side * (v.body.halfWidth - 0.005), 0.07, 0.04)
    parts.push(tint(band, VULTURE_TONES.coverts, 0.08, 173))
  }
  // The ruff at the neck root, the neck rising forward, the bare head and beak.
  const front = new THREE.Vector3(0, Math.sin(v.hunch), Math.cos(v.hunch)).multiplyScalar(v.body.halfLen * 0.8)
  const ruff = new THREE.SphereGeometry(0.09, ...SEG)
  ruff.translate(0, front.y, front.z)
  parts.push(tint(ruff, VULTURE_TONES.ruff, 0.05, 174))
  const lean = 0.6
  const neck = new THREE.CylinderGeometry(0.03, 0.04, v.head.neck, 8)
  neck.rotateX(lean)
  const neckMid = front.clone().add(new THREE.Vector3(0, Math.cos(lean), Math.sin(lean)).multiplyScalar(v.head.neck / 2))
  neck.translate(neckMid.x, neckMid.y, neckMid.z)
  parts.push(tint(neck, VULTURE_TONES.head, 0.06, 175))
  const top = front.clone().add(new THREE.Vector3(0, Math.cos(lean), Math.sin(lean)).multiplyScalar(v.head.neck))
  const head = new THREE.SphereGeometry(v.head.r, ...SEG)
  head.scale(0.9, 0.9, 1.2)
  head.translate(0, top.y, top.z + v.head.r * 0.4)
  parts.push(tint(head, VULTURE_TONES.head, 0.06, 176))
  const beak = new THREE.ConeGeometry(0.022, v.head.beak, 6)
  beak.rotateX(Math.PI / 2 + 0.4) // hooked down
  beak.translate(0, top.y - 0.015, top.z + v.head.r * 1.3 + v.head.beak / 2)
  parts.push(tint(beak, VULTURE_TONES.beak, 0.04, 177))
  // Legs down to the feet on the ground.
  const hipY = -v.body.halfHeight * 0.7
  const footY = hipY - v.leg
  for (const side of [-1, 1]) {
    const leg = new THREE.CylinderGeometry(0.022, 0.026, v.leg, 6)
    leg.translate(side * 0.06, hipY - v.leg / 2, 0)
    parts.push(tint(leg, VULTURE_TONES.leg, 0.06, 178))
    const foot = new THREE.SphereGeometry(1, 8, 6)
    foot.scale(0.035, 0.015, 0.06)
    foot.translate(side * 0.06, footY + 0.015, 0.02)
    parts.push(tint(foot, VULTURE_TONES.leg, 0.06, 179))
  }
  return merge(parts)
}
