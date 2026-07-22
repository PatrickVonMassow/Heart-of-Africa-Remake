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

/**
 * Mark a part as FOLIAGE (the 'foliage' attribute = 1 on every vertex). The
 * dry-season collapse (point 144) keys on this baked, PER-PART-UNIFORM signal
 * — never on the jittered colour: colour varies per vertex by design, and a
 * position mask derived from it collapsed neighbouring vertices by different
 * amounts, tearing the crowns into the shards of the 16.07 critical bug. An
 * attribute set at build time is identical across a part by construction, so
 * the part moves as one and nothing can tear.
 */
// Class 1 = tree crown (bare-branch collapse), class 2 = ground flora
// (anchored at the soil, it SPROUTS/withdraws there — point 151). Always one
// value per part: per-vertex variation is what tore the crowns (16.07 bug).
function foliage(geo: THREE.BufferGeometry, cls: 1 | 2 = 1): THREE.BufferGeometry {
  const count = geo.attributes.position.count
  geo.setAttribute('foliage', new THREE.BufferAttribute(new Float32Array(count).fill(cls), 1))
  return geo
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  // Every part must carry the foliage attribute or mergeGeometries drops it:
  // unmarked parts (trunks, rocks, nuts) default to 0 = never collapses.
  for (const p of parts) {
    if (!p.attributes.foliage) {
      const count = p.attributes.position.count
      p.setAttribute('foliage', new THREE.BufferAttribute(new Float32Array(count), 1))
    }
  }
  const merged = mergeGeometries(parts, false)
  parts.forEach((p) => p.dispose())
  return merged
}

/**
 * Split a merged flora geometry into its CROWN (foliage attribute == 1) and the
 * REST (foliage != 1: trunk, branches, props). In the travel scene the
 * dry-season crown collapse (point 144) then rides the crown mesh's own INSTANCE
 * MATRIX (point 175) instead of a per-instance vertex-shader attribute — the
 * latter races its rebuild re-upload on WebGPU and jittered the crowns. `foliage`
 * is per-part-uniform (set once per merged part), so every triangle belongs to
 * one part and is assigned by its first vertex's value. Returns non-indexed
 * geometries carrying position / normal / color / foliage.
 */
export function splitFoliage(geo: THREE.BufferGeometry): {
  base: THREE.BufferGeometry
  crown: THREE.BufferGeometry
} {
  const src = geo.index ? geo.toNonIndexed() : geo
  const pos = src.attributes.position.array
  const nrm = src.attributes.normal.array
  const col = src.attributes.color.array
  const fol = src.attributes.foliage.array
  const base = { p: [] as number[], n: [] as number[], c: [] as number[], f: [] as number[] }
  const crown = { p: [] as number[], n: [] as number[], c: [] as number[], f: [] as number[] }
  const triCount = pos.length / 9 // 3 verts * 3 components
  for (let t = 0; t < triCount; t++) {
    // Per-part-uniform foliage: the whole triangle shares its first vertex's class.
    const dst = fol[t * 3] === 1 ? crown : base
    for (let k = 0; k < 3; k++) {
      const vi = t * 3 + k
      dst.p.push(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2])
      dst.n.push(nrm[vi * 3], nrm[vi * 3 + 1], nrm[vi * 3 + 2])
      dst.c.push(col[vi * 3], col[vi * 3 + 1], col[vi * 3 + 2])
      dst.f.push(fol[vi])
    }
  }
  if (geo.index) src.dispose()
  const build = (d: typeof base): THREE.BufferGeometry => {
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(d.p), 3))
    g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(d.n), 3))
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(d.c), 3))
    g.setAttribute('foliage', new THREE.BufferAttribute(new Float32Array(d.f), 1))
    return g
  }
  return { base: build(base), crown: build(crown) }
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
  foliage(crown)

  const crown2 = new THREE.SphereGeometry(0.6, 7, 4)
  crown2.scale(1, 0.32, 1)
  crown2.translate(-0.55, 1.45, 0.3)
  tint(crown2, '#5f6e28', 0.14, 13)
  foliage(crown2)

  return merge([trunk, crown, crown2])
}

/** Tall rainforest tree with a layered canopy. Height ~3.6 units.
 *
 * Crown colours (point 206, Central reopen): THREE.Color converts the authored
 * hex from sRGB to the LINEAR working space, so a "dark green" hex lands far
 * darker than it reads on a colour picker — the old #1f5323/#2a6128/#245a24
 * came out at linear luminance 0.066/0.092/0.078, 2-2.7x darker than every
 * other crown (acacia 0.18/0.14, palm 0.12/0.16, bush 0.19). The global x1.9
 * material lift was calibrated against that brighter average, and the Congo
 * additionally runs under a permanent wet-season sun dim (x0.6 year round) and
 * dense mutual canopy shadow — so jungle crowns alone still read near-black.
 * These hexes put the jungle crown at linear luminance 0.123/0.168/0.141: a
 * LIT deep green, still a step darker than the savanna's olive acacia.
 * Pinned by the max-greenness luminance floor in flora.test.ts. */
export function buildJungleTree(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.12, 0.22, 2.6, 6)
  trunk.translate(0, 1.3, 0)
  tint(trunk, '#4e3d24', 0.1, 21)

  const c1 = new THREE.SphereGeometry(1.25, 8, 6)
  c1.scale(1, 0.75, 1)
  c1.translate(0, 2.95, 0)
  tint(c1, '#2b7030', 0.16, 22)
  foliage(c1)

  const c2 = new THREE.SphereGeometry(0.85, 7, 5)
  c2.translate(0.75, 2.5, 0.25)
  tint(c2, '#37813a', 0.16, 23)
  foliage(c2)

  const c3 = new THREE.SphereGeometry(0.7, 7, 5)
  c3.translate(-0.65, 2.65, -0.3)
  tint(c3, '#317736', 0.16, 24)
  foliage(c3)

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
    foliage(frond)
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
  foliage(b1, 2)
  const b2 = new THREE.SphereGeometry(0.28, 5, 4)
  b2.scale(1, 0.7, 1)
  b2.translate(0.3, 0.2, 0.15)
  tint(b2, '#8a8340', 0.18, 62)
  foliage(b2, 2)
  return merge([b1, b2])
}

/** Weathered boulder. */
export function buildRock(): THREE.BufferGeometry {
  const r = new THREE.DodecahedronGeometry(0.5, 0)
  r.scale(1, 0.62, 0.8)
  r.translate(0, 0.24, 0)
  tint(r, '#8a8178', 0.12, 71)
  return merge([r]) // through merge so it carries the (zero) foliage attribute
}

/** Baobab: massive bottle trunk with a sparse, flat branch crown. ~3 units. */
export function buildBaobab(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.42, 0.62, 2.2, 8)
  trunk.translate(0, 1.1, 0)
  tint(trunk, '#9a7f5e', 0.08, 91)
  const parts: THREE.BufferGeometry[] = [trunk]
  // A ring of stubby branches instead of a leafy canopy (dry-season look).
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2
    const branch = new THREE.CylinderGeometry(0.05, 0.11, 0.9, 5)
    branch.translate(0, 0.45, 0)
    branch.rotateZ(0.9)
    branch.rotateY(a)
    branch.translate(Math.cos(a) * 0.2, 2.15, Math.sin(a) * 0.2)
    tint(branch, '#8f755a', 0.1, 92 + i)
    parts.push(branch)
  }
  const crown = new THREE.SphereGeometry(0.95, 7, 4)
  crown.scale(1, 0.22, 1)
  crown.translate(0, 2.65, 0)
  tint(crown, '#7a7434', 0.2, 98)
  foliage(crown)
  parts.push(crown)
  return merge(parts)
}

/** Termite mound: reddish earthen spires (savanna). ~1.1 units. */
export function buildTermiteMound(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const spec = [
    [0, 0, 0.34, 1.1],
    [0.28, 0.1, 0.22, 0.65],
    [-0.24, -0.12, 0.18, 0.5],
  ] as const
  spec.forEach(([x, z, r, h], i) => {
    const spire = new THREE.ConeGeometry(r, h, 6)
    spire.translate(x, h / 2, z)
    tint(spire, '#a3603a', 0.1, 101 + i)
    parts.push(spire)
  })
  return merge(parts)
}

/** Dead, bare tree (droughts, elephant damage). ~2 units. */
export function buildDeadTree(): THREE.BufferGeometry {
  const trunk = new THREE.CylinderGeometry(0.06, 0.14, 1.6, 5)
  trunk.translate(0, 0.8, 0)
  tint(trunk, '#7d7466', 0.1, 111)
  const parts: THREE.BufferGeometry[] = [trunk]
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2 + 0.5
    const branch = new THREE.CylinderGeometry(0.03, 0.06, 0.9, 4)
    branch.translate(0, 0.45, 0)
    branch.rotateZ(0.7 + i * 0.15)
    branch.rotateY(a)
    branch.translate(0, 1.45, 0)
    tint(branch, '#736a5c', 0.1, 112 + i)
    parts.push(branch)
  }
  return merge(parts)
}

/** Papyrus/reed clump for river banks and lake shores. ~1.3 units. */
export function buildPapyrus(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2
    const lean = 0.12 + (i % 3) * 0.06
    const stem = new THREE.CylinderGeometry(0.02, 0.03, 1.15, 4)
    stem.translate(0, 0.58, 0)
    stem.rotateZ(lean)
    stem.rotateY(a)
    stem.translate(Math.cos(a) * 0.08, 0, Math.sin(a) * 0.08)
    tint(stem, '#5f7c33', 0.15, 121 + i)
    foliage(stem, 2)
    parts.push(stem)
    const head = new THREE.SphereGeometry(0.11, 5, 4)
    head.scale(1, 0.7, 1)
    head.translate(Math.cos(a) * (0.08 + Math.sin(lean) * 1.1), 1.18, Math.sin(a) * (0.08 + Math.sin(lean) * 1.1))
    tint(head, '#88a04a', 0.18, 131 + i)
    foliage(head, 2)
    parts.push(head)
  }
  return merge(parts)
}

/** Kopje: stacked granite boulders (savanna/high plateau). ~1.4 units. */
export function buildKopje(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const spec = [
    [0, 0.4, 0, 0.85],
    [0.55, 0.35, 0.3, 0.55],
    [-0.5, 0.3, -0.2, 0.5],
    [0.1, 1.0, 0.1, 0.45],
  ] as const
  spec.forEach(([x, y, z, r], i) => {
    const rock = new THREE.DodecahedronGeometry(r, 0)
    rock.scale(1, 0.75, 0.9)
    rock.translate(x, y, z)
    tint(rock, '#96897c', 0.1, 141 + i)
    parts.push(rock)
  })
  return merge(parts)
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
    foliage(blade, 2)
    parts.push(blade)
  }
  return merge(parts)
}
