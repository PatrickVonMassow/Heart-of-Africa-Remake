// The villager garments' cover mask (work-order point "hide the covered body
// and inner garments with a mask"): the pipeline marks, in the pose every
// garment is built in, which body vertices each garment covers
// (scripts/villager/mask.py) and writes them into villager.glb as the
// attribute _COVER — per vertex four unsigned shorts: hide bits 0-15, hide
// bits 16-31, push bits 0-15, push bits 16-31; bit k is the garment
// `asset.garmentMask[k]`. While a figure wears a garment, a body triangle whose
// three corners it hides is not drawn, and every vertex it covers that is
// still drawn (near an opening, or a hidden corner of a drawn triangle) is
// pushed VILLAGER_ASSET.garmentMaskPush inward along its normal in the vertex
// shader (`garmentPushPosition`). No per-pose correction.
//
// Pure apart from the TSL node: mask and worn garments in, index and push out.

import * as THREE from 'three/webgpu'
import { attribute, normalLocal, positionLocal } from 'three/tsl'

/** The glTF attribute (GLTFLoader lower-cases a custom attribute's name). */
export const COVER_ATTRIBUTE = '_cover'
/** The per-vertex inward push the vertex shader reads (local units). */
export const GARMENT_PUSH_ATTRIBUTE = 'garmentPush'

/** The worn garments as the mask's two 16-bit halves. Unknown names are skipped. */
export function wornBits(order: readonly string[], worn: readonly string[]): { lo: number; hi: number } {
  let lo = 0
  let hi = 0
  for (const n of worn) {
    const k = order.indexOf(n)
    if (k < 0) continue
    if (k < 16) lo |= 1 << k
    else hi |= 1 << (k - 16)
  }
  return { lo, hi }
}

/** Per vertex of `cover` (count × 4): hidden by a worn garment, and covered
 *  (hidden or pushed) by one — a hidden vertex is pushed too where a drawn
 *  triangle keeps it. */
export function decodeCover(cover: ArrayLike<number>, bits: { lo: number; hi: number }): { hidden: Uint8Array; covered: Uint8Array } {
  const n = cover.length / 4
  const hidden = new Uint8Array(n)
  const covered = new Uint8Array(n)
  if (!bits.lo && !bits.hi) return { hidden, covered }
  for (let i = 0; i < n; i++) {
    const h = (cover[i * 4] & bits.lo) | (cover[i * 4 + 1] & bits.hi)
    const p = (cover[i * 4 + 2] & bits.lo) | (cover[i * 4 + 3] & bits.hi)
    hidden[i] = h ? 1 : 0
    covered[i] = h || p ? 1 : 0
  }
  return { hidden, covered }
}

/** The triangle index without the triangles whose three corners are hidden
 *  (`hidden` covers the first vertices; any later vertex is never hidden). */
export function maskedIndex(index: ArrayLike<number>, hidden: Uint8Array): Uint32Array {
  const out: number[] = []
  const h = (v: number) => v < hidden.length && hidden[v] === 1
  for (let t = 0; t + 2 < index.length; t += 3) {
    const a = index[t]
    const b = index[t + 1]
    const c = index[t + 2]
    if (h(a) && h(b) && h(c)) continue
    out.push(a, b, c)
  }
  return Uint32Array.from(out)
}

/** The per-vertex push (`count` vertices; the covered ones `depth`, the rest 0). */
export function garmentPush(count: number, covered: Uint8Array, depth: number): Float32Array {
  const out = new Float32Array(count)
  for (let i = 0; i < covered.length && i < count; i++) if (covered[i]) out[i] = depth
  return out
}

/**
 * Apply the mask of the garments `worn` to a figure geometry whose first
 * vertices are the body the mask `cover` belongs to: the hidden triangles
 * leave the index and every vertex gets its push (0 where nothing covers it).
 * Mutates and returns `g`.
 */
export function applyGarmentMask(
  g: THREE.BufferGeometry,
  cover: ArrayLike<number> | null,
  order: readonly string[],
  worn: readonly string[],
  depth: number,
): THREE.BufferGeometry {
  const count = g.getAttribute('position').count
  const { hidden, covered } = cover ? decodeCover(cover, wornBits(order, worn)) : { hidden: new Uint8Array(0), covered: new Uint8Array(0) }
  if (g.index && hidden.some((x) => x)) {
    const idx = maskedIndex(g.index.array, hidden)
    g.setIndex(new THREE.BufferAttribute(count < 65536 ? Uint16Array.from(idx) : idx, 1))
  }
  g.setAttribute(GARMENT_PUSH_ATTRIBUTE, new THREE.BufferAttribute(garmentPush(count, covered, depth), 1))
  return g
}

/** The vertex shader's position: the skinned position pushed inward along the
 *  skinned normal by the vertex's garment push. */
export function garmentPushPosition() {
  return positionLocal.sub(normalLocal.mul(attribute<'float'>(GARMENT_PUSH_ATTRIBUTE, 'float')))
}
