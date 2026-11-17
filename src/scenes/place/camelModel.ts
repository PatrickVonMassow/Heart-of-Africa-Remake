// The Giza dromedary's model (work-order "proper camel model"): a rounded
// barrel with one hump growing out of the back, an S-curved neck, a head with
// muzzle and ears, jointed legs (forearm/thigh, knee or hock, cannon) on wide
// soft pads, and a hanging tail. Built from the detailed ungulates' swept
// tubes (render/faunaGeometry.ts) with vertex colours; pure geometry, no React.
//
// Model space: faces +z, ground at y = 0, centred on the barrel's middle. The
// neck, head and tail are split onto their own pivots so the component can
// sway them (Camel.tsx). Proportions and colours: CAMEL_MODEL in balance.ts.

import * as THREE from 'three/webgpu'
import { CAMEL_MODEL } from '../../config/balance'
import { merge, sweepTube, tint, tintWhere, type SweepStation } from '../../render/faunaGeometry'

/** Which pivot a part hangs on: the body itself, or a swaying joint. */
export type CamelPivot = 'root' | 'neck' | 'head' | 'tail'
export type CamelJoint = Exclude<CamelPivot, 'root'>
export type Vec3 = [number, number, number]

export interface CamelPart {
  name: string
  pivot: CamelPivot
  /** In model space (not yet relative to its pivot). */
  geometry: THREE.BufferGeometry
}

export interface CamelBuild {
  parts: CamelPart[]
  /** Pivot points in model space: neck base, poll, tail root. */
  pivots: Record<CamelJoint, Vec3>
}

/** The four legs, fore/hind and left (+x) / right (−x). */
export const CAMEL_LEGS = ['fl', 'fr', 'hl', 'hr'] as const

const st = (p: Vec3, rx: number, ry = rx): SweepStation => ({ p, rx, ry })

/** Builds every named part of the dromedary at `radial` ring segments. */
export function buildCamelParts(radial: number): CamelBuild {
  const M = CAMEL_MODEL
  const c = M.colour
  const radialBody = Math.max(6, Math.round(radial))
  const radialLimb = Math.max(5, Math.round(radial * 0.5))
  const parts: CamelPart[] = []
  const add = (name: string, pivot: CamelPivot, geometry: THREE.BufferGeometry) => parts.push({ name, pivot, geometry })

  // Barrel: rounded rump and breast, deeper at the girth behind the forelegs.
  const { y: by, halfLen, rx: brx, ry: bry, z: bz } = M.body
  const rumpZ = bz - halfLen
  const breastZ = bz + halfLen
  const endCap = (z0: number, len: number, sign: number, y: number, rx: number, ry: number) =>
    [0.45, 0.72, 0.88, 0.97].map((u) => {
      const k = Math.sqrt(1 - u * u)
      return st([0, y, z0 + sign * u * len], rx * k, ry * k)
    })
  const body = sweepTube(
    [
      ...endCap(rumpZ, 0.24, -1, by + 0.02, brx * 0.92, bry * 0.92).reverse(),
      st([0, by + 0.02, rumpZ], brx * 0.92, bry * 0.92),
      st([0, by, bz - halfLen * 0.4], brx, bry * 0.95),
      st([0, by - 0.02, bz + halfLen * 0.35], brx * 1.02, bry * 1.06),
      st([0, by + 0.02, breastZ], brx * 0.85, bry * 0.92),
      ...endCap(breastZ, 0.2, 1, by + 0.02, brx * 0.85, bry * 0.92),
    ],
    { radial: radialBody, rings: 20, capStart: true, capEnd: true },
  )
  add('body', 'root', tint(body, c.coat, 0.06, 31))

  // Hump: one mound rising out of the topline, its foot buried in the barrel
  // so it grows from the back rather than sitting on it.
  const backTop = by + bry
  const foot = backTop - 0.14
  const humpZ = bz - 0.04
  const humpRise = M.hump.top - backTop
  const humpStations = [-1, -0.7, -0.35, 0, 0.35, 0.7, 1].map((u) => {
    const k = Math.pow(Math.max(0, 1 - u * u), 0.7)
    const top = backTop + humpRise * k
    return st([0, (foot + top) / 2, humpZ + u * M.hump.halfLen], 0.06 + (M.hump.rx - 0.06) * Math.sqrt(Math.max(0, 1 - u * u)), (top - foot) / 2)
  })
  add('hump', 'root', tint(sweepTube(humpStations, { radial: radialBody, rings: 16, capStart: true, capEnd: true }), c.hump, 0.06, 37))

  // Neck: from the breast forward and down, then curving up to the poll — the
  // camel's S.
  const n = M.neck
  const neckBase: Vec3 = [0, n.baseY, breastZ - 0.08]
  const poll: Vec3 = [0, n.pollY, breastZ + n.pollReach]
  const neck = sweepTube(
    [
      st(neckBase, n.rBase * 0.95, n.rBase * 1.2),
      st([0, n.dipY + 0.04, breastZ + n.dipReach * 0.55], n.rBase * 0.72, n.rBase * 0.88),
      st([0, n.dipY + 0.06, breastZ + n.dipReach], n.rBase * 0.6, n.rBase * 0.7),
      st([0, (n.dipY + n.pollY) / 2 + 0.06, poll[2] - 0.04], n.rPoll * 1.15, n.rPoll * 1.25),
      st([0, poll[1] + 0.02, poll[2]], n.rPoll, n.rPoll * 1.05),
    ],
    { radial: radialBody, rings: 14 },
  )
  add('neck', 'neck', tint(neck, c.coat, 0.06, 41))

  // Head: from the poll forward and a little down; the dark soft muzzle with
  // the split lip closes it.
  const h = M.head
  const headY = poll[1] + 0.04
  const head = sweepTube(
    [
      st([0, headY, poll[2] - 0.05], h.rx * 0.9, h.ry * 0.9),
      st([0, headY + 0.01, poll[2] + h.len * 0.3], h.rx, h.ry),
      st([0, headY - h.drop * 0.5, poll[2] + h.len * 0.65], h.rx * 0.82, h.ry * 0.78),
      st([0, headY - h.drop * 0.8, poll[2] + h.len * 0.8], h.muzzleR * 1.05, h.muzzleR * 1.1),
    ],
    { radial: radialBody, rings: 10, capStart: true },
  )
  add('head', 'head', tint(head, c.coat, 0.05, 43))
  const muzzle = sweepTube(
    [
      st([0, headY - h.drop * 0.8, poll[2] + h.len * 0.78], h.muzzleR * 1.05, h.muzzleR * 1.1),
      st([0, headY - h.drop * 0.95, poll[2] + h.len * 0.92], h.muzzleR, h.muzzleR * 1.05),
      st([0, headY - h.drop, poll[2] + h.len], h.muzzleR * 0.85, h.muzzleR * 0.9),
    ],
    { radial: radialBody, rings: 5, capEnd: true },
  )
  add('muzzle', 'head', tint(muzzle, c.muzzle, 0.05, 47))

  // Ears: small rounded cones, set wide on the poll and laid slightly back.
  for (const side of [1, -1] as const) {
    const ear = new THREE.ConeGeometry(M.ear.r, M.ear.len, Math.max(5, radialLimb), 1)
    ear.rotateX(-0.35)
    ear.rotateZ(-side * 0.45)
    ear.translate(side * h.rx * 0.75, headY + h.ry * 0.85, poll[2] - 0.01)
    add(side > 0 ? 'ear-left' : 'ear-right', 'head', tint(ear, c.ear, 0.05, 53 + side))
  }

  // Legs: forearm or thigh into a knobbed knee (fore) or backward hock
  // (hind), a slim cannon, the fetlock, and the wide flat pad on the ground.
  const L = M.leg
  for (const id of CAMEL_LEGS) {
    const fore = id[0] === 'f'
    const x = (id[1] === 'l' ? 1 : -1) * L.x
    const z = fore ? L.foreZ : L.hindZ
    const jointY = fore ? L.kneeY : L.kneeY + 0.06
    const jointZ = fore ? z + 0.02 : z - 0.1
    const footZ = fore ? z + 0.02 : z - 0.02
    const upper = sweepTube(
      fore
        ? [st([x, by - 0.06, z], L.rUpper, L.rUpper * 1.15), st([x, (by + jointY) / 2, z + 0.01], L.rUpper * 0.62, L.rUpper * 0.7), st([x, jointY, jointZ], L.rLower * 1.5)]
        : [st([x, by + 0.02, z + 0.02], L.rUpper * 1.15, L.rUpper * 1.4), st([x, (by + jointY) / 2, z - 0.06], L.rUpper * 0.6, L.rUpper * 0.75), st([x, jointY, jointZ], L.rLower * 1.4)],
      { radial: radialLimb, rings: 8, capEnd: true },
    )
    add(`leg-${id}-upper`, 'root', tint(upper, c.coat, 0.05, 61))
    const lower = sweepTube(
      [
        st([x, jointY, jointZ], L.rLower * 1.4),
        st([x, jointY - 0.1, (jointZ + footZ) / 2], L.rLower),
        st([x, 0.2, footZ], L.rLower * 0.95),
        st([x, 0.1, footZ + 0.01], L.rLower * 1.3),
      ],
      { radial: radialLimb, rings: 8, capEnd: true },
    )
    add(`leg-${id}-lower`, 'root', tint(lower, c.coat, 0.05, 67))
    const pad = new THREE.SphereGeometry(1, Math.max(6, radialLimb + 2), Math.max(4, Math.round(radialLimb / 2) + 1))
    pad.scale(L.padRx, L.padRy, L.padRz)
    pad.translate(x, L.padRy, footZ + 0.03)
    add(`leg-${id}-pad`, 'root', tint(pad, c.pad, 0.04, 71))
  }

  // Tail: hangs from the top of the rump, a dark tuft at the end.
  const t = M.tail
  const tailRoot: Vec3 = [0, by + 0.14, rumpZ - 0.16]
  const tail = sweepTube(
    [
      st(tailRoot, t.r),
      st([0, tailRoot[1] - t.len * 0.3, tailRoot[2] - 0.06], t.r * 0.8),
      st([0, tailRoot[1] - t.len * 0.75, tailRoot[2] - 0.05], t.r * 0.9),
      st([0, tailRoot[1] - t.len, tailRoot[2] - 0.03], t.r * 1.5),
    ],
    { radial: radialLimb, rings: 8, capStart: true, capEnd: true },
  )
  add('tail', 'tail', tintWhere(tint(tail, c.coat, 0.05, 73), (v) => v > 0.7, c.tailTuft))

  return { parts, pivots: { neck: neckBase, head: poll, tail: tailRoot } }
}

/** The tallest point of the built camel above the ground (m). */
export function camelHeight(build: CamelBuild): number {
  let top = -Infinity
  for (const p of build.parts) {
    p.geometry.computeBoundingBox()
    top = Math.max(top, p.geometry.boundingBox!.max.y)
  }
  return top
}

/**
 * One merged geometry per pivot, each relative to its own pivot: the root in
 * model space, the neck about the neck base, the head about the poll (the head
 * pivot sits inside the neck one), the tail about its root. Consumes `build`.
 */
export function assembleCamel(build: CamelBuild): Record<CamelPivot, THREE.BufferGeometry> {
  const origin: Record<CamelPivot, Vec3> = { root: [0, 0, 0], ...build.pivots }
  const out = {} as Record<CamelPivot, THREE.BufferGeometry>
  for (const pivot of ['root', 'neck', 'head', 'tail'] as const) {
    const [ox, oy, oz] = origin[pivot]
    const geos = build.parts.filter((p) => p.pivot === pivot).map((p) => p.geometry.translate(-ox, -oy, -oz))
    out[pivot] = merge(geos)
  }
  return out
}
