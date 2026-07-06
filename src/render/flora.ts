// Low-poly, vertex-colored flora/prop geometries. Each builder merges its
// parts into a single BufferGeometry so instanced rendering needs one draw
// call per species. Colors carry slight per-vertex jitter for a hand-made
// look; materials just enable vertexColors.

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

/** Umbrella-crowned savanna tree. Height ~2.2 units, origin at the ground. */
export function buildAcacia(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.07, 0.16, 1.5, 6)
  trunk.translate(0, 0.75, 0)
  tint(trunk, '#6b4f2a', 0.1, 11)

  const crown = new THREE.SphereGeometry(1.15, 8, 5)
  crown.scale(1, 0.3, 1)
  crown.translate(0.1, 1.75, 0)
  tint(crown, '#6e7c2f', 0.14, 12)

  const crown2 = new THREE.SphereGeometry(0.6, 7, 4)
  crown2.scale(1, 0.32, 1)
  crown2.translate(-0.55, 1.45, 0.3)
  tint(crown2, '#5f6e28', 0.14, 13)

  return merge([trunk, crown, crown2])
}

/** Tall rainforest tree with a layered canopy. Height ~3.6 units. */
export function buildJungleTree(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.12, 0.22, 2.6, 6)
  trunk.translate(0, 1.3, 0)
  tint(trunk, '#4e3d24', 0.1, 21)

  const c1 = new THREE.SphereGeometry(1.25, 8, 6)
  c1.scale(1, 0.75, 1)
  c1.translate(0, 2.95, 0)
  tint(c1, '#1f5323', 0.16, 22)

  const c2 = new THREE.SphereGeometry(0.85, 7, 5)
  c2.translate(0.75, 2.5, 0.25)
  tint(c2, '#2a6128', 0.16, 23)

  const c3 = new THREE.SphereGeometry(0.7, 7, 5)
  c3.translate(-0.65, 2.65, -0.3)
  tint(c3, '#245a24', 0.16, 24)

  return merge([trunk, c1, c2, c3])
}

/**
 * Coconut palm with a curved trunk and radiating fronds. `detailed` adds
 * more/longer fronds for the walkable first-person places.
 */
export function buildPalm(detailed = false): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const segs = 4
  const height = detailed ? 4.4 : 2.8
  const lean = detailed ? 0.55 : 0.35
  // Trunk from stacked, progressively offset segments (cheap curve).
  for (let i = 0; i < segs; i++) {
    const h = height / segs
    const r0 = 0.16 - i * 0.025
    const seg = new THREE.CylinderGeometry(r0 - 0.02, r0, h * 1.15, 6)
    const t = (i + 0.5) / segs
    seg.translate(lean * t * t, h * (i + 0.5), 0)
    tint(seg, '#7a5c33', 0.12, 31 + i)
    parts.push(seg)
  }
  const topX = lean
  const topY = height
  // Fronds: squashed cones radiating from the crown, drooping outward.
  const fronds = detailed ? 7 : 5
  for (let i = 0; i < fronds; i++) {
    const a = (i / fronds) * Math.PI * 2
    const len = detailed ? 2.2 : 1.5
    const frond = new THREE.ConeGeometry(0.32, len, 4)
    frond.scale(1, 1, 0.22)
    frond.rotateX(-Math.PI / 2)
    frond.rotateZ(-0.5) // droop
    frond.rotateY(a)
    frond.translate(topX + Math.sin(a) * len * 0.32, topY + 0.18 - len * 0.1, Math.cos(a) * len * 0.32)
    tint(frond, i % 2 ? '#3f6b2a' : '#4a7a30', 0.12, 41 + i)
    parts.push(frond)
  }
  // Coconuts on the detailed variant.
  if (detailed) {
    for (let i = 0; i < 3; i++) {
      const nut = new THREE.SphereGeometry(0.12, 5, 4)
      const a = (i / 3) * Math.PI * 2 + 0.4
      nut.translate(topX + Math.sin(a) * 0.22, topY - 0.12, Math.cos(a) * 0.22)
      tint(nut, '#5c4526', 0.1, 51 + i)
      parts.push(nut)
    }
  }
  return merge(parts)
}

/** Dry shrub. Height ~0.7 units. */
export function buildBush(): THREE.BufferGeometry {
  const b1 = new THREE.SphereGeometry(0.42, 6, 4)
  b1.scale(1, 0.65, 1)
  b1.translate(0, 0.28, 0)
  tint(b1, '#7d7c35', 0.18, 61)
  const b2 = new THREE.SphereGeometry(0.28, 5, 4)
  b2.scale(1, 0.7, 1)
  b2.translate(0.3, 0.2, 0.15)
  tint(b2, '#8a8340', 0.18, 62)
  return merge([b1, b2])
}

/** Weathered boulder. */
export function buildRock(): THREE.BufferGeometry {
  const r = new THREE.DodecahedronGeometry(0.5, 0)
  r.scale(1, 0.62, 0.8)
  r.translate(0, 0.24, 0)
  tint(r, '#8a8178', 0.12, 71)
  return r
}

/** Tuft of dry grass: crossed, tapered blades. Used as close-up scatter. */
export function buildGrassTuft(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 4; i++) {
    const blade = new THREE.ConeGeometry(0.09, 0.42, 3)
    blade.scale(1, 1, 0.2)
    blade.rotateZ((i % 2 ? 1 : -1) * 0.18)
    blade.rotateY((i / 4) * Math.PI)
    blade.translate((i % 2) * 0.1 - 0.05, 0.2, ((i + 1) % 2) * 0.1 - 0.05)
    tint(blade, '#a89e55', 0.2, 81 + i)
    parts.push(blade)
  }
  return merge(parts)
}
