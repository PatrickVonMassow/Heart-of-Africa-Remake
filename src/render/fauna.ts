// Low-poly, vertex-colored ambient wildlife geometries (design.md §19).
// Same approach as flora.ts: each species merges into one BufferGeometry so
// herds render as a single instanced draw call. Origin at the ground, +Z is
// the animal's forward direction.

import * as THREE from 'three/webgpu'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { mulberry32 } from '../world/noise'

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

interface QuadrupedSpec {
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
}

/** Shared quadruped body plan (zebra, antelope, goat, lion base). */
function buildQuadruped(s: QuadrupedSpec): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = []
  const backY = s.legH + s.bodyR * 0.8

  const body = new THREE.SphereGeometry(s.bodyR, 8, 6)
  body.scale(0.8, 0.8, s.bodyLen / (2 * s.bodyR) + 0.55)
  body.translate(0, backY, 0)
  parts.push(tint(body, s.bodyColor, 0.1, s.seed))

  for (const [lx, lz] of [
    [-0.4, 0.75],
    [0.4, 0.75],
    [-0.4, -0.75],
    [0.4, -0.75],
  ]) {
    const leg = new THREE.CylinderGeometry(s.legR, s.legR * 0.8, s.legH + s.bodyR * 0.4, 5)
    leg.translate(lx * s.bodyR, (s.legH + s.bodyR * 0.4) / 2, lz * s.bodyLen * 0.5)
    parts.push(tint(leg, s.bodyColor, 0.12, s.seed + 1))
  }

  const neck = new THREE.CylinderGeometry(s.bodyR * 0.32, s.bodyR * 0.45, s.neckLen, 6)
  neck.rotateX(-s.neckTilt)
  const nz = s.bodyLen * 0.5 + Math.sin(s.neckTilt) * s.neckLen * 0.4
  const ny = backY + Math.cos(s.neckTilt) * s.neckLen * 0.4
  neck.translate(0, ny, nz)
  parts.push(tint(neck, s.bodyColor, 0.1, s.seed + 2))

  const head = new THREE.SphereGeometry(s.headSize, 7, 5)
  head.scale(0.8, 0.85, 1.35)
  const hz = nz + Math.sin(s.neckTilt) * s.neckLen * 0.35 + s.headSize * 0.5
  const hy = ny + Math.cos(s.neckTilt) * s.neckLen * 0.35
  head.translate(0, hy, hz)
  parts.push(tint(head, s.headColor ?? s.bodyColor, 0.1, s.seed + 3))

  if (s.horns) {
    for (const hx of [-0.5, 0.5]) {
      const horn = new THREE.ConeGeometry(s.headSize * 0.16, s.headSize * 1.6, 4)
      horn.rotateX(-0.5)
      horn.translate(hx * s.headSize, hy + s.headSize * 0.9, hz - s.headSize * 0.4)
      parts.push(tint(horn, '#4a3a26', 0.1, s.seed + 4))
    }
  }
  return parts
}

/** Savanna elephant, ~2.6 units tall. */
export function buildElephant(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(1.05, 9, 7)
  body.scale(0.95, 0.95, 1.4)
  body.translate(0, 1.75, 0)
  parts.push(tint(body, '#8d8680', 0.06, 101))

  for (const [lx, lz] of [
    [-0.5, 0.85],
    [0.5, 0.85],
    [-0.5, -0.85],
    [0.5, -0.85],
  ]) {
    const leg = new THREE.CylinderGeometry(0.26, 0.3, 1.3, 6)
    leg.translate(lx, 0.65, lz)
    parts.push(tint(leg, '#847d77', 0.06, 102))
  }

  const head = new THREE.SphereGeometry(0.62, 8, 6)
  head.translate(0, 2.15, 1.45)
  parts.push(tint(head, '#8d8680', 0.06, 103))

  for (const ex of [-0.72, 0.72]) {
    const ear = new THREE.BoxGeometry(0.1, 0.75, 0.62)
    ear.rotateY(ex < 0 ? 0.35 : -0.35)
    ear.translate(ex, 2.2, 1.3)
    parts.push(tint(ear, '#7d766f', 0.06, 104))
  }

  // Trunk: three tapering segments curving down.
  let ty = 1.85
  let tz = 2.0
  for (let i = 0; i < 3; i++) {
    const seg = new THREE.CylinderGeometry(0.14 - i * 0.03, 0.18 - i * 0.03, 0.55, 6)
    seg.rotateX(0.5 + i * 0.45)
    seg.translate(0, ty, tz)
    parts.push(tint(seg, '#847d77', 0.06, 105 + i))
    ty -= 0.42
    tz += 0.16
  }

  for (const tx of [-0.3, 0.3]) {
    const tusk = new THREE.ConeGeometry(0.07, 0.6, 5)
    tusk.rotateX(1.9)
    tusk.translate(tx, 1.75, 2.0)
    parts.push(tint(tusk, '#e8ddc4', 0.05, 108))
  }
  return merge(parts)
}

/** Giraffe, ~3.6 units tall. */
export function buildGiraffe(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(0.62, 8, 6)
  body.scale(0.85, 0.85, 1.35)
  body.rotateX(-0.18)
  body.translate(0, 1.9, 0)
  parts.push(tint(body, '#c89a55', 0.14, 111))

  for (const [lx, lz] of [
    [-0.3, 0.5],
    [0.3, 0.5],
    [-0.3, -0.5],
    [0.3, -0.5],
  ]) {
    const leg = new THREE.CylinderGeometry(0.09, 0.07, 1.65, 5)
    leg.translate(lx, 0.82, lz)
    parts.push(tint(leg, '#bf9150', 0.14, 112))
  }

  const neck = new THREE.CylinderGeometry(0.13, 0.2, 1.6, 6)
  neck.rotateX(-0.35)
  neck.translate(0, 2.85, 0.85)
  parts.push(tint(neck, '#c89a55', 0.14, 113))

  const head = new THREE.SphereGeometry(0.2, 7, 5)
  head.scale(0.8, 0.8, 1.4)
  head.translate(0, 3.55, 1.25)
  parts.push(tint(head, '#c89a55', 0.12, 114))

  for (const ox of [-0.08, 0.08]) {
    const ossicone = new THREE.CylinderGeometry(0.025, 0.025, 0.18, 4)
    ossicone.translate(ox, 3.72, 1.15)
    parts.push(tint(ossicone, '#8a6a38', 0.1, 115))
  }
  return merge(parts)
}

/** Zebra, ~1.5 units tall. */
export function buildZebra(): THREE.BufferGeometry {
  return merge(
    buildQuadruped({
      bodyLen: 1.5,
      bodyR: 0.42,
      legH: 0.75,
      legR: 0.07,
      neckLen: 0.65,
      neckTilt: 0.6,
      headSize: 0.2,
      bodyColor: '#d8d4cc',
      headColor: '#9a958c',
      seed: 121,
    }),
  )
}

/** Antelope/gazelle, ~1.2 units tall. */
export function buildAntelope(): THREE.BufferGeometry {
  return merge(
    buildQuadruped({
      bodyLen: 1.1,
      bodyR: 0.32,
      legH: 0.65,
      legR: 0.05,
      neckLen: 0.55,
      neckTilt: 0.5,
      headSize: 0.15,
      bodyColor: '#b08a55',
      horns: true,
      seed: 131,
    }),
  )
}

/** Wildebeest (gnu), the quintessential savanna lion prey (~1.35 units tall). */
export function buildWildebeest(): THREE.BufferGeometry {
  const parts = buildQuadruped({
    bodyLen: 1.5,
    bodyR: 0.44,
    legH: 0.8,
    legR: 0.07,
    neckLen: 0.5,
    neckTilt: 1.0,
    headSize: 0.2,
    bodyColor: '#5b554f',
    headColor: '#3d3a36',
    seed: 171,
  })
  // Muscular shoulder hump.
  const hump = new THREE.SphereGeometry(0.3, 7, 5)
  hump.scale(0.85, 0.7, 1.0)
  hump.translate(0, 1.36, 0.5)
  parts.push(tint(hump, '#4a453f', 0.1, 172))
  // Short curved horns sweeping out to the sides.
  for (const hx of [-1, 1]) {
    const horn = new THREE.ConeGeometry(0.04, 0.3, 4)
    horn.rotateZ(hx * 1.1)
    horn.translate(hx * 0.16, 1.55, 0.95)
    parts.push(tint(horn, '#2b2620', 0.08, 173))
  }
  // Beard hanging under the throat.
  const beard = new THREE.ConeGeometry(0.06, 0.26, 4)
  beard.rotateX(Math.PI)
  beard.translate(0, 1.02, 0.92)
  parts.push(tint(beard, '#2f2b26', 0.1, 174))
  return merge(parts)
}

/** Warthog, a small tusked savanna lion prey (~0.65 units tall). */
export function buildWarthog(): THREE.BufferGeometry {
  const parts = buildQuadruped({
    bodyLen: 1.0,
    bodyR: 0.3,
    legH: 0.4,
    legR: 0.05,
    neckLen: 0.25,
    neckTilt: 1.2,
    headSize: 0.2,
    bodyColor: '#5a4b3c',
    headColor: '#463a2e',
    seed: 181,
  })
  // Curved tusks from the snout.
  for (const hx of [-1, 1]) {
    const tusk = new THREE.ConeGeometry(0.022, 0.18, 4)
    tusk.rotateX(-0.5)
    tusk.rotateZ(hx * 0.5)
    tusk.translate(hx * 0.08, 0.6, 0.72)
    parts.push(tint(tusk, '#e6dfcd', 0.06, 182))
  }
  // Bristly mane along the spine.
  const mane = new THREE.BoxGeometry(0.05, 0.14, 0.7)
  mane.translate(0, 0.74, 0.1)
  parts.push(tint(mane, '#3a2f24', 0.12, 183))
  return merge(parts)
}

/** Lion, ~1.3 units tall, with mane. */
export function buildLion(): THREE.BufferGeometry {
  const parts = buildQuadruped({
    bodyLen: 1.4,
    bodyR: 0.42,
    legH: 0.6,
    legR: 0.09,
    neckLen: 0.4,
    neckTilt: 0.85,
    headSize: 0.22,
    bodyColor: '#b6905a',
    seed: 141,
  })
  const mane = new THREE.SphereGeometry(0.42, 8, 6)
  mane.scale(1, 1, 0.85)
  mane.translate(0, 1.25, 0.85)
  parts.push(tint(mane, '#7a5228', 0.14, 142))
  const tail = new THREE.CylinderGeometry(0.03, 0.05, 0.9, 4)
  tail.rotateX(1.1)
  tail.translate(0, 1.1, -1.0)
  parts.push(tint(tail, '#b6905a', 0.1, 143))
  return merge(parts)
}

/** Flamingo, ~1.1 units tall, standing. */
export function buildFlamingo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const leg = new THREE.CylinderGeometry(0.018, 0.018, 0.55, 4)
  leg.translate(0.03, 0.28, 0)
  parts.push(tint(leg, '#c96a70', 0.1, 151))

  const body = new THREE.SphereGeometry(0.2, 7, 5)
  body.scale(0.85, 0.8, 1.25)
  body.translate(0, 0.68, 0)
  parts.push(tint(body, '#ef8f9a', 0.12, 152))

  const neck1 = new THREE.CylinderGeometry(0.035, 0.045, 0.4, 5)
  neck1.rotateX(-0.5)
  neck1.translate(0, 0.92, 0.22)
  parts.push(tint(neck1, '#ef8f9a', 0.1, 153))
  const neck2 = new THREE.CylinderGeometry(0.03, 0.035, 0.3, 5)
  neck2.rotateX(0.35)
  neck2.translate(0, 1.12, 0.3)
  parts.push(tint(neck2, '#ef8f9a', 0.1, 154))

  const head = new THREE.SphereGeometry(0.07, 6, 5)
  head.translate(0, 1.26, 0.34)
  parts.push(tint(head, '#ef8f9a', 0.1, 155))
  const beak = new THREE.ConeGeometry(0.03, 0.16, 4)
  beak.rotateX(1.9)
  beak.translate(0, 1.22, 0.46)
  parts.push(tint(beak, '#3a3230', 0.1, 156))
  return merge(parts)
}

/** Vulture with spread wings, meant to circle overhead (design.md §19). */
export function buildVulture(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const body = new THREE.SphereGeometry(0.16, 7, 5)
  body.scale(0.8, 0.6, 1.4)
  parts.push(tint(body, '#3f3833', 0.1, 161))
  const head = new THREE.SphereGeometry(0.06, 6, 4)
  head.translate(0, 0.03, 0.24)
  parts.push(tint(head, '#b8a48c', 0.1, 162))
  for (const side of [-1, 1]) {
    const wing = new THREE.BoxGeometry(0.85, 0.025, 0.28)
    wing.translate(side * 0.5, 0.04, -0.02)
    wing.rotateZ(side * 0.12)
    parts.push(tint(wing, '#4a423b', 0.12, 163))
    const tip = new THREE.BoxGeometry(0.3, 0.02, 0.2)
    tip.translate(side * 1.0, 0.12, -0.04)
    tip.rotateZ(side * 0.3)
    parts.push(tint(tip, '#38312c', 0.12, 164))
  }
  return merge(parts)
}

/** Goat for village life (design.md §19 village life), ~0.7 units tall. */
export function buildGoat(): THREE.BufferGeometry {
  return merge(
    buildQuadruped({
      bodyLen: 0.65,
      bodyR: 0.2,
      legH: 0.35,
      legR: 0.035,
      neckLen: 0.3,
      neckTilt: 0.55,
      headSize: 0.1,
      bodyColor: '#9a8a72',
      horns: true,
      seed: 171,
    }),
  )
}
