// Low-poly, vertex-colored geometry for the built cultural landmarks of
// design.md §4.4 (the Nubian pyramids of Meroë, Great Zimbabwe, the rock-hewn
// churches of Lalibela, the coastal ruins of Kilwa). Same pattern as flora.ts:
// each builder merges its parts into one BufferGeometry with a base color and
// slight per-vertex jitter for a hand-made look; the origin sits at the ground
// and the footprint stays ~2–4 units so the silhouette reads from the travel
// camera.

import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../world/noise'

/** Paint a geometry with a base color plus deterministic per-vertex jitter. */
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

/** A single steep square pyramid (four-sided cone), base on the ground. */
function pyramid(x: number, z: number, base: number, height: number, seed: number): THREE.BufferGeometry {
  const g = new THREE.ConeGeometry(base, height, 4)
  g.rotateY(Math.PI / 4) // faces flat toward the camera axes
  g.translate(x, height / 2, z)
  return tint(g, '#c9a76a', 0.09, seed)
}

/** Meroë: a cluster of steep-sided Nubian pyramids (steeper than Giza),
 *  sandstone-toned, with slight size/position jitter. */
export function buildMeroePyramids(): THREE.BufferGeometry {
  const rand = mulberry32(4201)
  const parts: THREE.BufferGeometry[] = []
  const spots: Array<[number, number]> = [
    [0, 0],
    [0.95, 0.35],
    [-0.85, 0.5],
    [0.4, -0.9],
    [-0.5, -0.8],
    [1.5, -0.4],
  ]
  spots.forEach(([x, z], i) => {
    const b = 0.32 + rand() * 0.12
    const h = b * (2.6 + rand() * 0.6) // steep: height well over twice the base
    parts.push(pyramid(x + (rand() - 0.5) * 0.2, z + (rand() - 0.5) * 0.2, b, h, 4210 + i))
  })
  return merge(parts)
}

/** Great Zimbabwe: a curved mortarless dry-stone wall (segmented boxes) and a
 *  solid conical tower, weathered granite-grey. */
export function buildStoneCity(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const R = 2.0
  const seg = 12
  for (let i = 0; i < seg; i++) {
    // A ~200° arc of wall (leaves an opening), thick and tapering upward.
    const a = -Math.PI * 0.15 + (i / (seg - 1)) * Math.PI * 1.15
    const w = new THREE.BoxGeometry(0.55, 1.0, 0.3)
    w.rotateY(-a)
    w.translate(Math.cos(a) * R, 0.5, Math.sin(a) * R)
    parts.push(tint(w, '#8c847a', 0.1, 4300 + i))
  }
  // The conical tower inside the enclosure.
  const tower = new THREE.CylinderGeometry(0.28, 0.42, 1.5, 10)
  tower.translate(0.3, 0.75, 0.2)
  parts.push(tint(tower, '#948b80', 0.08, 4330))
  return merge(parts)
}

/** Lalibela: a cross-plan church hewn downward out of the living rock —
 *  a cruciform prism sunk into a flat rock slab, reddish tuff. */
export function buildRockChurches(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // The rock slab the church is cut from.
  const slab = new THREE.BoxGeometry(3.0, 0.5, 3.0)
  slab.translate(0, 0.25, 0)
  parts.push(tint(slab, '#9a5238', 0.06, 4400))
  // A recessed trench (darker) framing the cross so it reads as cut-in.
  const trench = new THREE.BoxGeometry(1.9, 0.42, 0.62)
  trench.translate(0, 0.3, 0)
  parts.push(tint(trench, '#5f3323', 0.06, 4401))
  const trench2 = new THREE.BoxGeometry(0.62, 0.42, 1.9)
  trench2.translate(0, 0.3, 0)
  parts.push(tint(trench2, '#5f3323', 0.06, 4402))
  // The cross-shaped church body, flush with the slab top.
  const arm1 = new THREE.BoxGeometry(1.4, 0.55, 0.42)
  arm1.translate(0, 0.42, 0)
  parts.push(tint(arm1, '#a86048', 0.07, 4403))
  const arm2 = new THREE.BoxGeometry(0.42, 0.55, 1.4)
  arm2.translate(0, 0.42, 0)
  parts.push(tint(arm2, '#a86048', 0.07, 4404))
  return merge(parts)
}

/** Kilwa: broken arches and standing columns of differing heights on a low
 *  platform, pale coral-stone. */
export function buildCoastalRuins(): THREE.BufferGeometry {
  const rand = mulberry32(4500)
  const parts: THREE.BufferGeometry[] = []
  const plat = new THREE.BoxGeometry(3.2, 0.3, 2.0)
  plat.translate(0, 0.15, 0)
  parts.push(tint(plat, '#c9bf9e', 0.05, 4500))
  // Standing columns of varied height.
  const cols: Array<[number, number]> = [
    [-1.1, -0.6],
    [-0.4, 0.5],
    [0.5, -0.5],
    [1.2, 0.4],
  ]
  cols.forEach(([x, z], i) => {
    const h = 0.7 + rand() * 0.8
    const c = new THREE.CylinderGeometry(0.12, 0.14, h, 7)
    c.translate(x, 0.3 + h / 2, z)
    parts.push(tint(c, '#d3c9a8', 0.07, 4510 + i))
  })
  // A broken arch: two pillars bridged by a lintel, one side fallen away.
  for (const sx of [-0.5, 0.5]) {
    const p = new THREE.BoxGeometry(0.22, 1.1, 0.22)
    p.translate(sx, 0.3 + 0.55, -1.0)
    parts.push(tint(p, '#cabf9e', 0.06, 4520 + (sx > 0 ? 1 : 0)))
  }
  const lintel = new THREE.BoxGeometry(1.0, 0.24, 0.24)
  lintel.rotateZ(0.12) // sagging, broken
  lintel.translate(-0.1, 0.3 + 1.15, -1.0)
  parts.push(tint(lintel, '#cabf9e', 0.06, 4522))
  return merge(parts)
}
