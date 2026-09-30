// A RECOGNISABLE FISH (work-order 1245): the catch of the fishermen's drift net,
// "not stylised — it has to read as fish" (user 30.09.2026). One shared
// geometry of unit length — a spindle body turned on a lathe, a forked tail fin
// and a dorsal fin — scaled per fish to its 25-40 cm, with the head along local
// +Z and the back up. A silvery material with a sheen that catches the light;
// the grilled and smoked states only darken it.

import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

/** The body's greatest depth and width as a fraction of its length. */
export const FISH_DEPTH = 0.26
export const FISH_WIDTH = 0.12

/**
 * The fish, length 1 along +Z (head at +0.5), centred on the origin. Plain
 * position/normal attributes only, so the parts merge cleanly.
 */
export function buildFishGeometry(): THREE.BufferGeometry {
  // The body's half-depth along the axis, head to the root of the tail.
  const profile: THREE.Vector2[] = []
  const n = 12
  for (let i = 0; i <= n; i++) {
    const t = i / n
    // A blunt head, deepest a third back, tapering to the tail's root.
    const r = Math.sin(Math.PI * Math.pow(t, 0.75)) * (FISH_DEPTH / 2) * (t < 0.95 ? 1 : 0.6)
    profile.push(new THREE.Vector2(Math.max(0.004, r), 0.42 - t * 0.84))
  }
  // Ascending along the lathe axis, so the faces wind outward (a descending
  // profile turns every normal inward).
  profile.reverse()
  const body = new THREE.LatheGeometry(profile, 10)
  // Lathe axis is Y; lay it along Z (head forward) and flatten it sideways.
  body.rotateX(Math.PI / 2)
  body.scale(FISH_WIDTH / FISH_DEPTH, 1, 1)
  const tail = new THREE.BufferGeometry()
  // A forked tail: two triangles spreading up and down from the root.
  const root = -0.42
  const tip = -0.58
  tail.setAttribute(
    'position',
    new THREE.BufferAttribute(
      new Float32Array([
        0, 0, root, 0, 0.13, tip, 0, 0.02, tip + 0.05,
        0, 0, root, 0, -0.02, tip + 0.05, 0, -0.13, tip,
      ]),
      3,
    ),
  )
  const dorsal = new THREE.BufferGeometry()
  dorsal.setAttribute(
    'position',
    new THREE.BufferAttribute(new Float32Array([0, FISH_DEPTH / 2 - 0.01, 0.12, 0, FISH_DEPTH / 2 + 0.07, -0.02, 0, FISH_DEPTH / 2 - 0.02, -0.18]), 3),
  )
  for (const g of [tail, dorsal]) g.computeVertexNormals()
  const bodyPlain = body.toNonIndexed()
  bodyPlain.deleteAttribute('uv')
  const merged = mergeGeometries([bodyPlain, tail, dorsal], false)
  body.dispose()
  bodyPlain.dispose()
  tail.dispose()
  dorsal.dispose()
  if (!merged) return new THREE.BufferGeometry()
  merged.computeBoundingSphere()
  return merged
}

/** The fresh fish's silver, and the colours grilling and smoking turn it. */
export const FISH_TONES = {
  fresh: '#c4ccd2',
  gutted: '#b89a90',
  grilled: '#8a6440',
  smoked: '#5a3a22',
} as const
