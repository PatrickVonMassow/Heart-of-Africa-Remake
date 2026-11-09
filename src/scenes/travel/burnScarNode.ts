// The grass fire's burn scar and ember edge as a SHADING TERM OF THE GROUND
// (design.md §19.8/§19.13), in the mould of the point-267 blood tint
// (render/groundStains.ts): the terrain material mixes its albedo toward soot
// inside the scar the fire has left, and glows along the band right behind the
// burning line. Being part of the ground surface it follows the relief exactly
// at any slope and zoom, on both backends; the old depiction was a strip of
// flat dark quads floated over the terrain.
//
// The shape is grassFireFront.ts's — the fanning, forward-bowed head fire —
// evaluated per fragment from a handful of uniforms the Wildlife frame refills
// (uniforms, not a fresh material, so it never trips point 96's relink). One
// fire burns at a time (FIRE_STATE), so one slot suffices. Its rim is frayed
// by one world-space noise field so the scar never reads as a stamped shape.

import * as THREE from 'three/webgpu'
import { abs, clamp, color, float, max, min, mix, mx_fractal_noise_float, mx_noise_float, positionWorld, smoothstep, time, uniform, vec3 } from 'three/tsl'
import { fireHalfWidth, fireLead, SOOT_RGB, type FirePlacement, type FireShape } from './grassFireFront'

// Packed uniforms (one fire): A = (x, z, sin h, cos h), B = (front, half-width
// at the front, lead, scar strength), C = (start half-width, spread rate, max
// half-width, edge softness), D = (rim jag, darkness, ember depth, ember strength).
const A = new THREE.Vector4(0, 0, 0, 1)
const B = new THREE.Vector4(0, 1, 0, 0)
const C = new THREE.Vector4(1, 0, 1, 1)
const D = new THREE.Vector4(0, 0, 1, 0)
const SCAR_A = uniform(A)
const SCAR_B = uniform(B)
const SCAR_C = uniform(C)
const SCAR_D = uniform(D)

/** What the frame hands the ground each tick. Strengths at 0 draw nothing. */
export interface BurnScarLook {
  /** Scar fade, 0..1 (1 while burning, falling through the smoulder). */
  scarStrength: number
  /** Ember-edge fade, 0..1 (1 while burning, gone soon after). */
  emberStrength: number
  edgeSoft: number
  jag: number
  darkness: number
  emberDepth: number
}

/** Upload the current fire (or clear it with both strengths at 0). */
export function setBurnScar(f: FirePlacement, s: FireShape, look: BurnScarLook): void {
  A.set(f.x, f.z, Math.sin(f.heading), Math.cos(f.heading))
  B.set(f.front, fireHalfWidth(f.front, s), fireLead(f.front, s), Math.max(0, Math.min(1, look.scarStrength)))
  C.set(s.startHalfWidth, s.spreadRate, s.maxHalfWidth, Math.max(1e-3, look.edgeSoft))
  D.set(Math.max(0, look.jag), Math.max(0, Math.min(1, look.darkness)), Math.max(1e-3, look.emberDepth), Math.max(0, Math.min(1, look.emberStrength)))
}

/** Read-only view of the packed uniforms (tests). */
export function burnScarUniforms(): { a: THREE.Vector4; b: THREE.Vector4; c: THREE.Vector4; d: THREE.Vector4 } {
  return { a: A, b: B, c: C, d: D }
}

// The published TSL typings are narrower than the runtime (groundStains.ts).
type FloatNode = ReturnType<typeof float>
type V4 = { x: FloatNode; y: FloatNode; z: FloatNode; w: FloatNode }

function fireLocalNode() {
  const a = SCAR_A as unknown as V4
  const dx = (positionWorld.x as unknown as FloatNode).sub(a.x)
  const dz = (positionWorld.z as unknown as FloatNode).sub(a.y)
  const along = dx.mul(a.z).add(dz.mul(a.w))
  const across = dx.mul(a.w).sub(dz.mul(a.z))
  const b = SCAR_B as unknown as V4
  const u = min(abs(across).div(b.y), float(1))
  // Distance (along the heading) still to go before the burning line: > 0 is burnt.
  const dFront = b.x.sub(b.z.mul(u.mul(u))).sub(along)
  return { along, across, dFront }
}

/** The per-fragment scar, 0..1 (mirror: `scarCoverage` in grassFireFront.ts). */
export function burnScarMask(): FloatNode {
  const { along, across, dFront } = fireLocalNode()
  const b = SCAR_B as unknown as V4
  const c = SCAR_C as unknown as V4
  const d = SCAR_D as unknown as V4
  const soft = c.w
  const scarHw = min(c.z, c.x.add(clamp(along, float(0), b.x).mul(c.y)))
  const dSide = scarHw.sub(abs(across))
  const dBack = along.add(soft.mul(0.5))
  // One noise field frays the rim: the flanks and the rear wander by the full
  // jag, the front edge (where the ember line stands) by a third of it.
  const n = mx_fractal_noise_float(vec3(positionWorld.xz.mul(0.32), 11.0), 2) as unknown as FloatNode
  const jag = n.mul(d.x)
  const m = smoothstep(float(0), soft, dFront.add(jag.mul(0.35)))
    .mul(smoothstep(float(0), soft, dSide.add(jag)))
    .mul(smoothstep(float(0), soft, dBack.add(jag)))
  return m.mul(b.w).clamp(0, 1) as unknown as FloatNode
}

const SOOT = color(new THREE.Color(SOOT_RGB[0], SOOT_RGB[1], SOOT_RGB[2]))

/** Mix a ground albedo toward soot where the scar lies (mirror: `scarTint`). */
export function burnScarColor(col: unknown, mask: FloatNode) {
  const cc = col as ReturnType<typeof color>
  const luma = cc.r.mul(0.35).add(cc.g.mul(0.5)).add(cc.b.mul(0.15))
  const d = SCAR_D as unknown as V4
  return mix(cc, SOOT.mul(luma.mul(0.6).add(0.4)), mask.mul(d.y).clamp(0, 1))
}

/** The ember band's emissive glow: orange AT the burning line, deepening to
 *  red over `emberDepth` behind it, flickering by a space-time noise (no
 *  travelling pattern: the noise has no preferred direction along the line). */
export function burnEmberEmissive() {
  const { across, dFront } = fireLocalNode()
  const b = SCAR_B as unknown as V4
  const d = SCAR_D as unknown as V4
  const depth = d.z
  const inBand = smoothstep(float(-0.3), float(0.05), dFront)
    .mul(smoothstep(depth, float(0), dFront))
    .mul(smoothstep(float(0), float(0.8), b.y.sub(abs(across))))
  const flick = (mx_noise_float(vec3(positionWorld.xz.mul(1.3), time.mul(2.2))) as unknown as FloatNode).mul(0.3).add(0.85)
  const t = clamp(dFront.div(depth), float(0), float(1))
  const hue = mix(vec3(1.0, 0.5, 0.12), vec3(0.75, 0.16, 0.03), t)
  return hue.mul(max(inBand.mul(d.w).mul(flick), float(0)).mul(1.3))
}
