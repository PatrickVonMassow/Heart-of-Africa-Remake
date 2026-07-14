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
import { buildPapyrus } from './flora'

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
 *  sandstone-toned, with slight size/position jitter. Rendered well above
 *  tree height (acacia ~2, baobab ~2.6) so the field is unmistakable at
 *  travel zoom (user request: much larger). */
export function buildMeroePyramids(): THREE.BufferGeometry {
  const rand = mulberry32(4201)
  const parts: THREE.BufferGeometry[] = []
  const spots: Array<[number, number]> = [
    [0, 0],
    [2.85, 1.05],
    [-2.55, 1.5],
    [1.2, -2.7],
    [-1.5, -2.4],
    [4.5, -1.2],
  ]
  spots.forEach(([x, z], i) => {
    const b = 1.0 + rand() * 0.4
    const h = b * (2.6 + rand() * 0.6) // steep: height well over twice the base
    parts.push(pyramid(x + (rand() - 0.5) * 0.6, z + (rand() - 0.5) * 0.6, b, h, 4210 + i))
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

/** Aksum: 3–4 tall thin tapered obelisks with rounded caps, one fallen —
 *  weathered granite grey. */
export function buildStelae(): THREE.BufferGeometry {
  const rand = mulberry32(4600)
  const parts: THREE.BufferGeometry[] = []
  const spots: Array<[number, number]> = [
    [0, 0],
    [0.8, 0.4],
    [-0.7, 0.55],
  ]
  spots.forEach(([x, z], i) => {
    const h = 1.6 + rand() * 0.9
    const shaft = new THREE.CylinderGeometry(0.07, 0.14, h, 6)
    shaft.translate(x, h / 2, z)
    parts.push(tint(shaft, '#8f8a80', 0.08, 4600 + i))
    const cap = new THREE.SphereGeometry(0.1, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2)
    cap.translate(x, h, z)
    parts.push(tint(cap, '#8f8a80', 0.08, 4610 + i))
  })
  // The fallen giant, lying across the field in two broken pieces.
  const fallen = new THREE.CylinderGeometry(0.13, 0.18, 1.6, 6)
  fallen.rotateZ(Math.PI / 2)
  fallen.rotateY(0.5)
  fallen.translate(0.2, 0.15, -0.9)
  parts.push(tint(fallen, '#87827a', 0.08, 4620))
  const stump = new THREE.CylinderGeometry(0.16, 0.18, 0.35, 6)
  stump.translate(-0.9, 0.17, -0.8)
  parts.push(tint(stump, '#87827a', 0.08, 4621))
  return merge(parts)
}

/** Gondar (Fasil Ghebbi): a compact crenellated keep plus two round corner
 *  towers with conical caps — grey stone. */
export function buildCastles(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const keep = new THREE.BoxGeometry(1.5, 1.1, 1.0)
  keep.translate(0, 0.55, 0)
  parts.push(tint(keep, '#9a938a', 0.07, 4700))
  // Notched parapet: merlons along the keep's front and back edges.
  for (let i = 0; i < 4; i++) {
    for (const zs of [-0.42, 0.42]) {
      const merlon = new THREE.BoxGeometry(0.18, 0.18, 0.16)
      merlon.translate(-0.56 + i * 0.375, 1.19, zs)
      parts.push(tint(merlon, '#9a938a', 0.07, 4710 + i))
    }
  }
  // Two round corner towers with conical caps.
  for (const [tx, tz, si] of [
    [0.95, 0.55, 0],
    [-0.95, -0.55, 1],
  ] as const) {
    const tower = new THREE.CylinderGeometry(0.28, 0.32, 1.35, 9)
    tower.translate(tx, 0.675, tz)
    parts.push(tint(tower, '#a29b91', 0.07, 4720 + si))
    const cap = new THREE.ConeGeometry(0.34, 0.42, 9)
    cap.translate(tx, 1.35 + 0.21, tz)
    parts.push(tint(cap, '#6f5b47', 0.08, 4730 + si))
  }
  return merge(parts)
}

/** Bandiagara: an angled cliff slab with small box dwellings on ledges at
 *  two heights — ochre mud tone. */
export function buildCliffDwellings(): THREE.BufferGeometry {
  const rand = mulberry32(4800)
  const parts: THREE.BufferGeometry[] = []
  // The escarpment: a tall slab leaning slightly back.
  const cliff = new THREE.BoxGeometry(3.4, 2.2, 0.6)
  cliff.rotateX(-0.16)
  cliff.translate(0, 1.1, -0.5)
  parts.push(tint(cliff, '#a9805a', 0.08, 4800))
  // Dwellings on two ledge heights, small boxes with flat roofs.
  const ledges: Array<[number, number]> = [
    [-1.2, 0.55],
    [-0.4, 0.55],
    [0.45, 0.55],
    [1.15, 0.55],
    [-0.75, 1.25],
    [0.15, 1.25],
    [0.95, 1.25],
  ]
  ledges.forEach(([x, y], i) => {
    const w = 0.3 + rand() * 0.14
    const h = 0.26 + rand() * 0.1
    const hut = new THREE.BoxGeometry(w, h, 0.3)
    hut.translate(x, y + h / 2, -0.05 + (y > 1 ? -0.14 : 0))
    parts.push(tint(hut, '#c49a6b', 0.09, 4810 + i))
  })
  return merge(parts)
}

/** Ngorongoro: a low broad circular rim of tilted rock segments (open bowl
 *  silhouette) — dry-grass/rock tone. */
export function buildCrater(): THREE.BufferGeometry {
  const rand = mulberry32(4900)
  const parts: THREE.BufferGeometry[] = []
  const R = 1.9
  const seg = 14
  for (let i = 0; i < seg; i++) {
    const a = (i / seg) * Math.PI * 2
    const h = 0.5 + rand() * 0.3
    const block = new THREE.BoxGeometry(0.9, h, 0.42)
    block.rotateX(-0.28) // tilted outward: an open bowl silhouette
    block.rotateY(-a)
    block.translate(Math.cos(a) * R, h / 2, Math.sin(a) * R)
    parts.push(tint(block, i % 2 ? '#a89a6c' : '#958861', 0.09, 4900 + i))
  }
  return merge(parts)
}

/** Ol Doinyo Lengai: a steep dark basalt cone with a flattened top plus a
 *  subtle translucent smoke hint (no particle system). */
export function buildVolcano(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  const cone = new THREE.CylinderGeometry(0.28, 1.5, 2.4, 12)
  cone.translate(0, 1.2, 0)
  parts.push(tint(cone, '#4c4642', 0.08, 5000))
  const crater = new THREE.CylinderGeometry(0.34, 0.3, 0.14, 12)
  crater.translate(0, 2.45, 0)
  parts.push(tint(crater, '#3a3531', 0.06, 5001))
  // Smoke hint: two stacked soft grey cones above the summit. Rendered with
  // the shared vertex-color material (opaque), so the hint stays subtle by
  // tone rather than by alpha — no separate transparent material needed.
  const smoke1 = new THREE.ConeGeometry(0.3, 0.5, 8)
  smoke1.rotateX(Math.PI) // opening upward
  smoke1.translate(0.06, 2.85, 0)
  parts.push(tint(smoke1, '#b9b6b2', 0.05, 5002))
  const smoke2 = new THREE.ConeGeometry(0.42, 0.55, 8)
  smoke2.rotateX(Math.PI)
  smoke2.translate(0.16, 3.3, 0.06)
  parts.push(tint(smoke2, '#c7c4c0', 0.05, 5003))
  return merge(parts)
}

/** Okavango: low braided water ribbons (thin flat blue strips splitting
 *  outward) interspersed with papyrus tufts. */
export function buildDelta(): THREE.BufferGeometry {
  const rand = mulberry32(5100)
  const parts: THREE.BufferGeometry[] = []
  // Braided ribbons fanning outward from an apex.
  for (let i = 0; i < 5; i++) {
    const a = -0.7 + i * 0.35
    const len = 2.2 + rand() * 0.8
    const ribbon = new THREE.BoxGeometry(0.28, 0.04, len)
    ribbon.rotateY(a)
    ribbon.translate(Math.sin(a) * (len / 2), 0.05, Math.cos(a) * (len / 2) - 1.2)
    parts.push(tint(ribbon, '#4a7d97', 0.06, 5100 + i))
  }
  // Papyrus tufts between the channels.
  const tufts: Array<[number, number]> = [
    [-0.8, 0.3],
    [0.7, 0.1],
    [0.1, -0.5],
    [-1.3, 1.0],
    [1.4, 0.9],
  ]
  tufts.forEach(([x, z], i) => {
    const t = buildPapyrus()
    t.scale(0.55, 0.5 + (i % 3) * 0.12, 0.55)
    t.translate(x, 0, z)
    parts.push(t)
  })
  return merge(parts)
}

/** Sudd: a broad even papyrus flat over a shallow blue disc — vast and
 *  uniform, distinct from the delta's braiding. */
export function buildWetland(): THREE.BufferGeometry {
  const rand = mulberry32(5200)
  const parts: THREE.BufferGeometry[] = []
  const water = new THREE.CylinderGeometry(2.1, 2.1, 0.05, 18)
  water.translate(0, 0.03, 0)
  parts.push(tint(water, '#54808f', 0.04, 5200))
  // A dense, even papyrus cover.
  for (let i = 0; i < 12; i++) {
    const a = rand() * Math.PI * 2
    const r = 0.3 + rand() * 1.6
    const t = buildPapyrus()
    const sc = 0.45 + rand() * 0.15
    t.scale(sc, sc, sc)
    t.translate(Math.cos(a) * r, 0.02, Math.sin(a) * r)
    parts.push(t)
  }
  return merge(parts)
}

/**
 * Table Mountain skyline massif for Cape Town's first-person backdrop
 * (design.md §4.4 Part C): a broad flat-topped plateau flanked by two lesser
 * peaks (Devil's Peak, Lion's Head), sized for the settlement panorama
 * (~140 units wide) rather than the travel map. Placed and scaled by the
 * scene; origin at the ground, the plateau top around y≈26.
 */
export function buildTableMountain(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = []
  // The main table: a wide truncated prism with a flat top.
  const table = new THREE.CylinderGeometry(52, 68, 26, 26, 1)
  table.scale(1.35, 1, 0.42)
  table.translate(0, 13, 0)
  parts.push(tint(table, '#7d7468', 0.07, 5300))
  // A slightly lighter plateau cap reads as the sunlit table top.
  const cap = new THREE.CylinderGeometry(52.5, 53, 1.6, 26, 1)
  cap.scale(1.35, 1, 0.42)
  cap.translate(0, 26.2, 0)
  parts.push(tint(cap, '#948a7a', 0.05, 5301))
  // Devil's Peak (east) and Lion's Head (west): steeper flanking cones.
  const devils = new THREE.ConeGeometry(26, 30, 16)
  devils.translate(96, 15, 6)
  parts.push(tint(devils, '#776e62', 0.08, 5302))
  const lions = new THREE.ConeGeometry(14, 22, 14)
  lions.translate(-92, 11, -4)
  parts.push(tint(lions, '#7d7468', 0.08, 5303))
  return merge(parts)
}
