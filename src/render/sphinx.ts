// The Great Sphinx's meshes, every level of detail drawn from the ONE
// definition in src/world/sphinx.ts (design.md §4.4, docs/giza-1890.md §1.3):
// the clear stone parts the level reaches, plus the drift that stands for the
// buried body. Nothing here adds a shape of its own; a level only chooses the
// tessellation, whether the face carries its painted marks, and whether the
// vertices carry the site material's banding attribute; the bird's-eye level
// also takes its documented emphasis (`sphinxEmphasis`, SPHINX_FORM.emphasis).
//
// Output is in body units (paw tip to tail = 1), origin on the ground at the
// middle of the body, facing +x; the callers scale and place it.

import * as THREE from 'three/webgpu'
import { SPHINX_FORM } from '../config/balance'
import { mulberry32 } from '../world/noise'
import { PALETTE, PALETTE_ALT } from '../world/terrainPalette'
import { farTerrainColor } from '../scenes/travel/farColor'
import {
  SPHINX_FACE_MARKS,
  SPHINX_HEAD_ANCHOR,
  partSurface,
  sphinxDriftBounds,
  sphinxDriftHeight,
  sphinxDriftNormal,
  sphinxEmphasis,
  sphinxLodSpec,
  sphinxPartsFor,
  type SphinxLod,
  type SphinxPart,
} from '../world/sphinx'

/** Per-vertex banding the site material reads: (amplitude, period in metres). */
export const SPHINX_BAND_ATTRIBUTE = 'sphinxBand'

/** Parts whose surface carries the fine detail (the face marks) get more rows. */
const PART_DETAIL: Record<string, number> = {
  face: 2,
  noseStump: 0.6,
  browBand: 0.8,
  browRidge: 0.8,
  cheekR: 0.6,
  cheekL: 0.6,
  upperLip: 0.6,
  lowerLip: 0.6,
  chin: 0.7,
}

export interface SphinxBuildOptions {
  /** Carry the banding attribute the site material reads. Its period is in
   *  metres, so only a caller that scales the geometry to metres asks for it;
   *  the distant views do not (no banding at their scale). */
  banding?: boolean
}

interface Buffers {
  pos: number[]
  nor: number[]
  col: number[]
  uv: number[]
  band: number[]
  idx: number[]
}

function toneColor(hex: string): THREE.Color {
  return new THREE.Color(hex)
}

function bandOf(part: SphinxPart): [number, number] {
  const b = SPHINX_FORM.banding
  if (part.band === 'course') return [b.courseAmplitude, b.coursePeriod]
  if (part.band === 'nemes') return [b.nemesAmplitude, b.nemesPeriod]
  return [0, 1]
}

function onFaceMark(part: SphinxPart, p: readonly number[], n: readonly number[]): boolean {
  if (part.id !== 'face' || n[0] < 0.6) return false
  const s = SPHINX_FORM.headScale
  const y = (p[1] - SPHINX_HEAD_ANCHOR[1]) / s
  const z = (p[2] - SPHINX_HEAD_ANCHOR[2]) / s
  return SPHINX_FACE_MARKS.some((m) => ((y - m.y) / m.ry) ** 2 + ((z - m.z) / m.rz) ** 2 <= 1)
}

function addPart(buf: Buffers, part: SphinxPart, lod: SphinxLod, seed: number): void {
  const spec = sphinxLodSpec(lod)
  const detail = (part.group === 'head' ? spec.headFactor : 1) * (PART_DETAIL[part.id] ?? 1)
  const rings = Math.max(6, Math.round(spec.rings * detail))
  const rows = Math.max(4, Math.round(spec.rows * detail))
  const shade = sphinxEmphasis(lod).stoneShade
  const tone = toneColor(SPHINX_FORM.tones[part.tone]).multiplyScalar(shade)
  const mark = toneColor(SPHINX_FORM.tones.shadowMark).multiplyScalar(shade)
  const rand = mulberry32(seed)
  const [amp, period] = bandOf(part)
  const base = buf.pos.length / 3
  for (let j = 0; j <= rows; j++) {
    const eta = -Math.PI / 2 + (Math.PI * j) / rows
    for (let i = 0; i <= rings; i++) {
      const omega = -Math.PI + (2 * Math.PI * i) / rings
      const { p, n } = partSurface(part, eta, omega)
      buf.pos.push(p[0], p[1], p[2])
      buf.nor.push(n[0], n[1], n[2])
      buf.uv.push(i / rings, j / rows)
      const c = spec.faceMarks && onFaceMark(part, p, n) ? mark : tone
      const f = 1 + (rand() - 0.5) * 0.1
      buf.col.push(Math.min(1, c.r * f), Math.min(1, c.g * f), Math.min(1, c.b * f))
      buf.band.push(amp, period)
    }
  }
  const row = rings + 1
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < rings; i++) {
      const a = base + j * row + i
      const b = a + 1
      const c = a + row
      const d = c + 1
      // The pole rows collapse to a point: emit only their non-degenerate half.
      if (j !== 0) buf.idx.push(a, d, b)
      if (j !== rows - 1) buf.idx.push(a, c, d)
    }
  }
}

/** The drift's colour at a level: the site's sand, or — for the bird's-eye
 *  landmark — the travel ground's desert tone, so it reads as the same sand
 *  as the desert round it (owner verdict 11.11.2026). Linear RGB. */
export function sphinxDriftTone(lod: SphinxLod): [number, number, number] {
  if (lod !== 'landmark') {
    const c = toneColor(SPHINX_FORM.tones.sand)
    return [c.r, c.g, c.b]
  }
  // The desert biome's mid tint under the splatted sand albedo, exactly as the
  // far-terrain sheet bakes it (farColor.ts), then a slight shade.
  const tint = PALETTE.desert.map((v, i) => (v + PALETTE_ALT.desert[i]) / 2) as [number, number, number]
  const g = farTerrainColor(tint, [1, 0, 0, 0])
  const k = SPHINX_FORM.landmarkDrift.groundShade
  return [g[0] * k, g[1] * k, g[2] * k]
}

/** Smoothstep 0..1 over [0, w]. */
function feather(y: number, w: number): number {
  const t = Math.max(0, Math.min(1, y / w))
  return t * t * (3 - 2 * t)
}

/** The drift: a height-field grid over its bounds, keeping every cell that
 *  rises above the ground, so its foot crosses the ground at the repose slope.
 *  At the bird's-eye landmark the grid is instead CUT along the drift's zero
 *  contour — each triangle clipped where the drift meets the ground, the cut
 *  points found on the drift itself — so its outline is a smooth curve with no
 *  cell steps, and over the lowest `rimFeather` the shading and the normals
 *  fade into the flat ground's, so the rim melts into the desert. */
function addDrift(buf: Buffers, lod: SphinxLod): void {
  const spec = sphinxLodSpec(lod)
  const b = sphinxDriftBounds(lod)
  const flankShade = sphinxEmphasis(lod).flankShade
  const contour = lod === 'landmark'
  const rim = SPHINX_FORM.landmarkDrift.rimFeather
  const nx = spec.driftCells
  const nz = Math.max(4, Math.round((nx * (b.maxZ - b.minZ)) / (b.maxX - b.minX)))
  const sand = sphinxDriftTone(lod)
  const rand = mulberry32(8290)
  const base = buf.pos.length / 3
  const heights: number[] = []
  const push = (x: number, y: number, z: number, u: number, v: number) => {
    let n = sphinxDriftNormal(x, z, lod)
    // Steeper sand is shaded a little darker (a cheap occlusion term), so
    // the body's shape under the drift reads from above as well as aside.
    let flank = flankShade * (1 - n[1] * n[1])
    if (contour) {
      const s = feather(y, rim)
      flank *= s
      const m: [number, number, number] = [n[0] * s, 1 - s + n[1] * s, n[2] * s]
      const l = Math.hypot(m[0], m[1], m[2])
      n = [m[0] / l, m[1] / l, m[2] / l]
    }
    buf.pos.push(x, y, z)
    buf.nor.push(n[0], n[1], n[2])
    buf.uv.push(u, v)
    const f = (1 + (rand() - 0.5) * 0.06) * (1 - flank)
    // The landmark's ground tone may exceed 1, as the terrain's does.
    const cap = contour ? Infinity : 1
    buf.col.push(Math.min(cap, sand[0] * f), Math.min(cap, sand[1] * f), Math.min(cap, sand[2] * f))
    buf.band.push(0, 1)
  }
  const gx = (i: number) => b.minX + ((b.maxX - b.minX) * i) / nx
  const gz = (j: number) => b.minZ + ((b.maxZ - b.minZ) * j) / nz
  for (let j = 0; j <= nz; j++) {
    for (let i = 0; i <= nx; i++) {
      const y = sphinxDriftHeight(gx(i), gz(j), lod)
      heights.push(y)
      push(gx(i), y, gz(j), i / nx, j / nz)
    }
  }
  const row = nx + 1
  if (!contour) {
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) {
        const a = j * row + i
        const corners = [a, a + 1, a + row, a + row + 1]
        if (!corners.some((k) => heights[k] > 0)) continue
        buf.idx.push(base + a, base + a + row, base + a + 1)
        buf.idx.push(base + a + 1, base + a + row, base + a + row + 1)
      }
    }
    return
  }
  // The zero contour on a grid edge (shared by both triangles that use it).
  const cut = new Map<string, number>()
  const edgePoint = (p: number, q: number): number => {
    const lo = Math.min(p, q)
    const hi = Math.max(p, q)
    const key = `${lo}:${hi}`
    const hit = cut.get(key)
    if (hit !== undefined) return hit
    const [x0, z0] = [gx(lo % row), gz(Math.floor(lo / row))]
    const [x1, z1] = [gx(hi % row), gz(Math.floor(hi / row))]
    // Bisect along the edge for the point where the drift meets the ground.
    let t0 = 0
    let t1 = 1
    const above0 = heights[lo] > 0
    for (let k = 0; k < 40; k++) {
      const t = (t0 + t1) / 2
      const above = sphinxDriftHeight(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, lod) > 0
      if (above === above0) t0 = t
      else t1 = t
    }
    const t = (t0 + t1) / 2
    const x = x0 + (x1 - x0) * t
    const z = z0 + (z1 - z0) * t
    const id = buf.pos.length / 3
    push(x, sphinxDriftHeight(x, z, lod), z, (x - b.minX) / (b.maxX - b.minX), (z - b.minZ) / (b.maxZ - b.minZ))
    cut.set(key, id - base)
    return id - base
  }
  // Keep each triangle's part above the ground (Sutherland-Hodgman against y = 0).
  const clip = (tri: [number, number, number]) => {
    const out: number[] = []
    for (let k = 0; k < 3; k++) {
      const p = tri[k]
      const q = tri[(k + 1) % 3]
      const pin = heights[p] > 0
      const qin = heights[q] > 0
      if (pin) out.push(p)
      if (pin !== qin) out.push(edgePoint(p, q))
    }
    for (let k = 1; k + 1 < out.length; k++) buf.idx.push(base + out[0], base + out[k], base + out[k + 1])
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * row + i
      if (![a, a + 1, a + row, a + row + 1].some((k) => heights[k] > 0)) continue
      clip([a, a + row, a + 1])
      clip([a + 1, a + row, a + row + 1])
    }
  }
}

/**
 * One level of detail of the Great Sphinx, as one indexed, vertex-coloured
 * geometry (position, normal, uv, color, and — for the site — the banding
 * attribute). The clear parts the level reaches plus the drift; never the
 * buried body, which the drift stands for at every level.
 */
export function buildSphinxGeometry(lod: SphinxLod, opts: SphinxBuildOptions = {}): THREE.BufferGeometry {
  const buf: Buffers = { pos: [], nor: [], col: [], uv: [], band: [], idx: [] }
  sphinxPartsFor(lod).forEach((part, i) => addPart(buf, part, lod, 8240 + i))
  addDrift(buf, lod)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute(buf.pos, 3))
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(buf.nor, 3))
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uv, 2))
  geo.setAttribute('color', new THREE.Float32BufferAttribute(buf.col, 3))
  if (opts.banding) {
    geo.setAttribute(SPHINX_BAND_ATTRIBUTE, new THREE.Float32BufferAttribute(buf.band, 2))
  }
  geo.setIndex(buf.idx)
  return geo
}
