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

/** The drift: a height-field grid over its bounds, keeping every cell that
 *  rises above the ground, so its foot crosses the ground at the repose slope. */
function addDrift(buf: Buffers, lod: SphinxLod): void {
  const spec = sphinxLodSpec(lod)
  const b = sphinxDriftBounds(lod)
  const flankShade = sphinxEmphasis(lod).flankShade
  const nx = spec.driftCells
  const nz = Math.max(4, Math.round((nx * (b.maxZ - b.minZ)) / (b.maxX - b.minX)))
  const sand = toneColor(SPHINX_FORM.tones.sand)
  const rand = mulberry32(8290)
  const base = buf.pos.length / 3
  const heights: number[] = []
  for (let j = 0; j <= nz; j++) {
    const z = b.minZ + ((b.maxZ - b.minZ) * j) / nz
    for (let i = 0; i <= nx; i++) {
      const x = b.minX + ((b.maxX - b.minX) * i) / nx
      const y = sphinxDriftHeight(x, z, lod)
      heights.push(y)
      const n = sphinxDriftNormal(x, z, lod)
      buf.pos.push(x, y, z)
      buf.nor.push(n[0], n[1], n[2])
      buf.uv.push(i / nx, j / nz)
      // Steeper sand is shaded a little darker (a cheap occlusion term), so
      // the body's shape under the drift reads from above as well as aside.
      const f = (1 + (rand() - 0.5) * 0.06) * (1 - flankShade * (1 - n[1] * n[1]))
      buf.col.push(Math.min(1, sand.r * f), Math.min(1, sand.g * f), Math.min(1, sand.b * f))
      buf.band.push(0, 1)
    }
  }
  const row = nx + 1
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = j * row + i
      const corners = [a, a + 1, a + row, a + row + 1]
      if (!corners.some((k) => heights[k] > 0)) continue
      buf.idx.push(base + a, base + a + row, base + a + 1)
      buf.idx.push(base + a + 1, base + a + row, base + a + row + 1)
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
