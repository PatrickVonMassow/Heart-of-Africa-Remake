// The Great Sphinx's ONE definition (src/world/sphinx.ts, docs/giza-1890.md
// §1.3): the ~1890 burial line, the clear and the buried parts, the drift's
// footprint and the absence of any coplanar surface pair (the geometry must
// not z-fight, and no offset may hide a fight).

import { describe, expect, it } from 'vitest'
import { SPHINX_FORM } from '../config/balance'
import {
  SPHINX_BURIED_PARTS,
  SPHINX_CLEAR_PARTS,
  SPHINX_HEAD_ANCHOR,
  SPHINX_PARTS,
  partLevel,
  sampleSurface,
  sphinxBurialLine,
  sphinxBurialTarget,
  sphinxCrownHeight,
  sphinxDriftBounds,
  sphinxDriftHeight,
  sphinxDriftNormal,
  sphinxPartsFor,
  type SphinxPart,
} from './sphinx'

const part = (id: string) => SPHINX_PARTS.find((p) => p.id === id)!
const deg = (r: number) => (r * 180) / Math.PI

/** Angle between two surfaces' normals, folded to 0..90° (0 = coplanar). */
function crossing(a: readonly number[], b: readonly number[]): number {
  const dot = Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2])
  return deg(Math.acos(Math.min(1, dot)))
}

function levelGradient(p: SphinxPart, x: number, y: number, z: number): number[] {
  const e = 1e-5
  const g = [
    partLevel(p, x + e, y, z) - partLevel(p, x - e, y, z),
    partLevel(p, x, y + e, z) - partLevel(p, x, y - e, z),
    partLevel(p, x, y, z + e) - partLevel(p, x, y, z - e),
  ]
  const l = Math.hypot(g[0], g[1], g[2])
  return g.map((v) => v / l)
}

/** Lowest point of a part's surface. */
const bottomOf = (p: SphinxPart) => Math.min(...sampleSurface(p, 32, 24).map((s) => s.p[1]))

describe('the ~1890 burial (docs/giza-1890.md §1.3)', () => {
  it('puts the burial line at the upper chest, where the record has it', () => {
    const { line, tolerance } = sphinxBurialTarget()
    expect(Math.abs(sphinxBurialLine() - line)).toBeLessThanOrEqual(tolerance)
    // Above it the whole head stands clear: the chin is above the sand line…
    expect(bottomOf(part('face'))).toBeGreaterThan(sphinxBurialLine())
    // …and below it lie the paws and forelegs.
    for (const id of ['forelegR', 'forelegL']) {
      const top = Math.max(...sampleSurface(part(id), 32, 24).map((s) => s.p[1]))
      expect(top).toBeLessThan(sphinxBurialLine())
    }
  })

  it('leaves the head, the neck and the upper back standing clear of the drift', () => {
    const clearIds = SPHINX_CLEAR_PARTS.map((p) => p.id)
    for (const id of ['face', 'nemes', 'neck', 'backRidge', 'chest', 'lappetR', 'lappetL']) {
      expect(clearIds).toContain(id)
    }
    for (const p of SPHINX_CLEAR_PARTS) {
      const emergence = Math.max(...sampleSurface(p, 48, 32).map((s) => s.p[1] - sphinxDriftHeight(s.p[0], s.p[2])))
      // At least half a metre at the site's 20 m length, and visibly more for the head.
      expect(emergence, `${p.id} breaks the surface`).toBeGreaterThan(0.02)
    }
  })

  it('keeps every other body part below the drift — torso, shoulders, haunches, legs, paws, tail', () => {
    const buried = SPHINX_BURIED_PARTS.map((p) => p.id)
    expect(buried).toEqual(
      expect.arrayContaining(['torso', 'shoulders', 'haunch', 'breast', 'hindLegR', 'hindLegL', 'forelegR', 'forelegL', 'tail']),
    )
    for (const p of SPHINX_BURIED_PARTS) {
      for (const s of sampleSurface(p, 48, 32)) {
        expect(sphinxDriftHeight(s.p[0], s.p[2]) - s.p[1], `${p.id} under the sand`).toBeGreaterThan(
          SPHINX_FORM.drift.cover * 0.5,
        )
      }
    }
  })

  it('models the drift as a body under sand: the shoulders swell and the paws show through', () => {
    // The shoulder swell stands above the mid-back's sand…
    expect(sphinxDriftHeight(part('shoulders').centre[0], 0)).toBeGreaterThan(sphinxDriftHeight(-0.05, 0.09))
    // …and over the forepaws, ahead of the chest, the sand rises in two lobes
    // with a dip between them.
    const x = part('forelegR').centre[0] + part('forelegR').radii[0] * 0.6
    const lobe = sphinxDriftHeight(x, part('forelegR').centre[2])
    expect(lobe).toBeGreaterThan(sphinxDriftHeight(x, 0) + 0.01)
    expect(sphinxDriftHeight(x, -part('forelegR').centre[2])).toBeCloseTo(lobe, 6)
  })

  it("does not reach past the body's footprint by more than its skirt", () => {
    const pts: Array<[number, number]> = []
    for (const p of SPHINX_BURIED_PARTS) for (const s of sampleSurface(p, 64, 24)) pts.push([s.p[0], s.p[2]])
    const b = sphinxDriftBounds()
    let inside = 0
    for (let x = b.minX; x <= b.maxX; x += 0.01) {
      for (let z = b.minZ; z <= b.maxZ; z += 0.01) {
        if (sphinxDriftHeight(x, z) <= 0) continue
        if (SPHINX_BURIED_PARTS.some((p) => partLevel(p, x, p.centre[1], z) <= 1)) {
          inside++
          continue
        }
        const d = Math.min(...pts.map(([px, pz]) => Math.hypot(x - px, z - pz)))
        expect(d, `drift at (${x.toFixed(2)}, ${z.toFixed(2)})`).toBeLessThanOrEqual(SPHINX_FORM.drift.skirt)
      }
    }
    expect(inside).toBeGreaterThan(0)
    // The bounds are honest: the drift is below the ground all round them.
    for (let t = 0; t <= 1; t += 0.05) {
      expect(sphinxDriftHeight(b.minX + (b.maxX - b.minX) * t, b.minZ)).toBeLessThan(0)
      expect(sphinxDriftHeight(b.minX + (b.maxX - b.minX) * t, b.maxZ)).toBeLessThan(0)
      expect(sphinxDriftHeight(b.minX, b.minZ + (b.maxZ - b.minZ) * t)).toBeLessThan(0)
      expect(sphinxDriftHeight(b.maxX, b.minZ + (b.maxZ - b.minZ) * t)).toBeLessThan(0)
    }
  })
})

describe('the head: nemes, brow band, lappets, broken nose, no beard', () => {
  it('faces east and is the highest point, the nemes on top', () => {
    const face = part('face')
    expect(face.centre[0]).toBeGreaterThan(part('nemes').centre[0])
    const crown = sphinxCrownHeight()
    expect(Math.max(...sampleSurface(part('nemes'), 32, 32).map((s) => s.p[1]))).toBeCloseTo(crown, 6)
    // Crown ≈ 0.27 of the length in reality; the head is drawn a little larger
    // to read from across the site, but stays a couchant lion, not a bust.
    expect(crown).toBeGreaterThan(0.25)
    expect(crown).toBeLessThan(0.36)
  })

  it('frames the face with the nemes widening down to the shoulders', () => {
    const nemes = part('nemes')
    expect(nemes.taper).toBeGreaterThan(0)
    const half = (y: number) =>
      Math.max(...sampleSurface(nemes, 64, 64).filter((s) => Math.abs(s.p[1] - y) < 0.004).map((s) => Math.abs(s.p[2])))
    const faceHalf = Math.max(...sampleSurface(part('face'), 32, 32).map((s) => Math.abs(s.p[2])))
    expect(half(part('face').centre[1])).toBeGreaterThan(faceHalf)
    expect(half(nemes.centre[1] - nemes.radii[1] * 0.8)).toBeGreaterThan(half(nemes.centre[1] + nemes.radii[1] * 0.8))
    // The brow band runs across the forehead, proud of the face.
    const front = (p: SphinxPart) => Math.max(...sampleSurface(p, 32, 32).map((s) => s.p[0]))
    expect(front(part('browBand'))).toBeGreaterThan(front(part('nemes')))
    // The lappets fall from the head to the chest, below the chin.
    expect(bottomOf(part('lappetR'))).toBeLessThan(bottomOf(part('face')))
  })

  it('has a broken nose and no beard', () => {
    const front = (p: SphinxPart) => Math.max(...sampleSurface(p, 32, 32).map((s) => s.p[0]))
    const face = part('face')
    // The nose is a stump: it stands only a little proud of the face.
    const stump = front(part('noseStump')) - front(face)
    expect(stump).toBeGreaterThan(0)
    expect(stump).toBeLessThan(face.radii[0] * 0.5)
    // No beard: nothing under the chin reaches forward of the chin.
    expect(SPHINX_PARTS.some((p) => p.id.toLowerCase().includes('beard'))).toBe(false)
    const chinY = bottomOf(face)
    const chinFront = Math.max(...sampleSurface(face, 48, 48).filter((s) => s.p[1] < chinY + 0.01).map((s) => s.p[0]))
    for (const p of SPHINX_CLEAR_PARTS) {
      for (const s of sampleSurface(p, 32, 24)) {
        if (s.p[1] < chinY && Math.abs(s.p[2]) < face.radii[2]) expect(s.p[0], `${p.id} below the chin`).toBeLessThan(chinFront)
      }
    }
    expect(SPHINX_HEAD_ANCHOR[0]).toBeGreaterThan(0)
  })

  it('carries horizontal banding on the stone and stripes on the nemes, none on the face', () => {
    expect(part('backRidge').band).toBe('course')
    expect(part('chest').band).toBe('course')
    expect(part('nemes').band).toBe('nemes')
    expect(part('face').band).toBe('none')
  })
})

describe('no coplanar surfaces: the model has nothing to z-fight (no offset hides one)', () => {
  it('every clear part leaves the drift at a real angle', () => {
    for (const p of SPHINX_CLEAR_PARTS) {
      for (const s of sampleSurface(p, 96, 64)) {
        if (Math.abs(s.p[1] - sphinxDriftHeight(s.p[0], s.p[2])) > 0.002) continue
        expect(crossing(s.n, sphinxDriftNormal(s.p[0], s.p[2])), `${p.id} through the drift`).toBeGreaterThan(20)
      }
    }
  })

  it('the drift meets the ground at its repose slope, never lying flat on it', () => {
    const b = sphinxDriftBounds()
    for (let x = b.minX; x <= b.maxX; x += 0.005) {
      for (let z = b.minZ; z <= b.maxZ; z += 0.005) {
        const h = sphinxDriftHeight(x, z)
        if (h <= 0 || h > 0.003) continue
        expect(crossing(sphinxDriftNormal(x, z), [0, 1, 0]), 'foot of the drift').toBeGreaterThan(25)
      }
    }
  })

  it('partLevel is homogeneous of degree one, tapered parts included (the contact filter relies on it)', () => {
    const tapered = SPHINX_PARTS.filter((p) => p.taper !== 0)
    expect(tapered.length).toBeGreaterThan(0)
    for (const p of [...tapered, part('face')]) {
      for (const s of sampleSurface(p, 24, 16)) {
        expect(partLevel(p, s.p[0], s.p[1], s.p[2]), `${p.id} on its surface`).toBeCloseTo(1, 4)
        for (const k of [0.5, 2]) {
          const q = s.p.map((v, i) => p.centre[i] + (v - p.centre[i]) * k)
          expect(partLevel(p, q[0], q[1], q[2]), `${p.id} scaled by ${k}`).toBeCloseTo(k, 4)
        }
      }
    }
  })

  it('no two drawn parts meet in a near-coplanar contact', () => {
    // A point of A within a hair of B's surface must cross it at an angle.
    const parts = sphinxPartsFor('site-full')
    for (const a of parts) {
      for (const b of parts) {
        if (a === b) continue
        for (const s of sampleSurface(a, 72, 48)) {
          const level = partLevel(b, s.p[0], s.p[1], s.p[2])
          const r = Math.hypot(s.p[0] - b.centre[0], s.p[1] - b.centre[1], s.p[2] - b.centre[2])
          if (Math.abs(r * (1 - 1 / level)) > 0.0015) continue
          expect(crossing(s.n, levelGradient(b, s.p[0], s.p[1], s.p[2])), `${a.id} against ${b.id}`).toBeGreaterThan(10)
        }
      }
    }
  })
})
