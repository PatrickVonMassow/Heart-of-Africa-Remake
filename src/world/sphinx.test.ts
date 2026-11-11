// The Great Sphinx's ONE definition (src/world/sphinx.ts, docs/giza-1890.md
// §1.3): the ~1890 burial line, the clear and the buried parts, the drift's
// footprint and the absence of any coplanar surface pair (the geometry must
// not z-fight, and no offset may hide a fight).

import { describe, expect, it } from 'vitest'
import { SPHINX_FORM } from '../config/balance'
import {
  SPHINX_BURIED_PARTS,
  SPHINX_FACE_MARKS,
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
    for (const id of ['face', 'nemes', 'wingR', 'wingL', 'neck', 'spine', 'chest', 'lappetR', 'lappetL']) {
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
      expect.arrayContaining(['torso', 'rearTorso', 'shoulderR', 'shoulderL', 'haunchR', 'haunchL', 'breast', 'hindLegR', 'hindLegL', 'forelegR', 'forelegL', 'tail']),
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
    expect(sphinxDriftHeight(part('shoulderR').centre[0], part('shoulderR').centre[2])).toBeGreaterThan(sphinxDriftHeight(-0.05, 0.09))
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

  /** Half-width (max |z|) of a set of parts' surface within a height band. */
  const halfWidth = (ids: string[], y0: number, y1: number) =>
    Math.max(
      0,
      ...ids.flatMap((id) => sampleSurface(part(id), 64, 64).filter((s) => s.p[1] >= y0 && s.p[1] <= y1).map((s) => Math.abs(s.p[2]))),
    )
  const topOf = (p: SphinxPart) => Math.max(...sampleSurface(p, 32, 24).map((s) => s.p[1]))

  it("reads from the front as the nemes' flaring trapezoid framing a narrower face", () => {
    const nemesIds = ['nemes', 'wingR', 'wingL']
    const crown = sphinxCrownHeight()
    const faceHalf = halfWidth(['face', 'cheekR', 'cheekL'], 0, 1)
    const wingBottom = Math.min(bottomOf(part('wingR')), bottomOf(part('wingL')))
    // Flat crown on top, widening downward: the top band narrowest, the wings'
    // lower band widest — and that widest span well over the face's width.
    const top = halfWidth(nemesIds, crown - 0.01, crown)
    const low = halfWidth(nemesIds, wingBottom, wingBottom + 0.02)
    expect(low).toBeGreaterThan(top * 1.5)
    expect(low).toBeGreaterThan(faceHalf * 1.8)
    expect(top).toBeGreaterThan(faceHalf * 0.9)
    // The wings are flat panels (thin across their own plane), not lobes.
    const w = part('wingR')
    expect(w.radii[2]).toBeLessThan(Math.min(w.radii[0], w.radii[1]) * 0.4)
    // The brow band runs across the forehead, proud of the crown.
    const front = (p: SphinxPart) => Math.max(...sampleSurface(p, 32, 32).map((s) => s.p[0]))
    expect(front(part('browBand'))).toBeGreaterThan(front(part('nemes')))
  })

  it('hangs the lappets as long flat panels beside the neck, from under the wings down into the sand at the chest', () => {
    for (const id of ['lappetR', 'lappetL']) {
      const l = part(id)
      // Long and flat: tall, broad across, thin front to back.
      expect(l.radii[1]).toBeGreaterThan(l.radii[2] * 2)
      expect(l.radii[0]).toBeLessThan(l.radii[2] * 0.6)
      // From the wings' lower edge, past the chin, into the drift at the chest.
      expect(topOf(l)).toBeGreaterThan(bottomOf(part(id.replace('lappet', 'wing'))))
      expect(topOf(l)).toBeLessThan(bottomOf(part('face')) + 0.02)
      expect(bottomOf(l)).toBeLessThan(sphinxBurialLine())
      // Beside the neck, not at the temples: inside the wings' span, outside the neck.
      const z = Math.abs(l.centre[2])
      expect(z).toBeGreaterThan(part('neck').radii[2] * 0.6)
      expect(z + l.radii[2]).toBeLessThan(halfWidth(['wingR', 'wingL'], 0, 1))
    }
  })

  it('gives the face its features: brow ridge, cheekbones, lips, rounded chin, all inside the face', () => {
    const faceHalf = halfWidth(['face'], 0, 1)
    for (const id of ['browRidge', 'cheekR', 'cheekL', 'upperLip', 'lowerLip', 'chin']) {
      const p = part(id)
      expect(p.tone, id).toBe('face')
      expect(Math.abs(p.centre[2]) + p.radii[2], `${id} inside the face`).toBeLessThanOrEqual(faceHalf * 1.05)
    }
    // Top to bottom: brow ridge over the eyes, cheekbones, lips, chin.
    const y = (id: string) => part(id).centre[1]
    expect(y('browRidge')).toBeGreaterThan(y('cheekR'))
    expect(y('cheekR')).toBeGreaterThan(y('upperLip'))
    expect(y('upperLip')).toBeGreaterThan(y('lowerLip'))
    expect(y('lowerLip')).toBeGreaterThan(y('chin'))
    // The eye sockets lie between brow ridge and cheekbones (recessed by both).
    const s = SPHINX_FORM.headScale
    const eye = SPHINX_FACE_MARKS.find((m) => m.id === 'eyeR')!
    const eyeY = SPHINX_HEAD_ANCHOR[1] + eye.y * s
    expect(eyeY).toBeLessThan(y('browRidge'))
    expect(eyeY).toBeGreaterThan(y('cheekR'))
  })

  it('has a broken nose and no beard', () => {
    const front = (p: SphinxPart) => Math.max(...sampleSurface(p, 32, 32).map((s) => s.p[0]))
    const face = part('face')
    // The nose is a flattened stump: it stands only a little proud of the face.
    const stump = front(part('noseStump')) - front(face)
    expect(stump).toBeGreaterThan(0)
    expect(stump).toBeLessThan(face.radii[0] * 0.5)
    // No beard: nothing under the chin reaches forward of the chin.
    expect(SPHINX_PARTS.some((p) => p.id.toLowerCase().includes('beard'))).toBe(false)
    const chin = part('chin')
    const chinY = bottomOf(chin)
    const chinFront = front(chin)
    for (const p of SPHINX_CLEAR_PARTS) {
      for (const s of sampleSurface(p, 32, 24)) {
        if (s.p[1] < chinY && Math.abs(s.p[2]) < face.radii[2]) expect(s.p[0], `${p.id} below the chin`).toBeLessThan(chinFront)
      }
    }
    expect(SPHINX_HEAD_ANCHOR[0]).toBeGreaterThan(0)
  })

  it('carries horizontal banding on the stone and stripes on the nemes, none on the face', () => {
    expect(part('spine').band).toBe('course')
    expect(part('chest').band).toBe('course')
    expect(part('nemes').band).toBe('nemes')
    expect(part('face').band).toBe('none')
  })
})

describe('the body under the sand reads from every standpoint (owner verdict 11.11.2026)', () => {
  const crestAt = (x: number) => {
    const near = sampleSurface(part('spine'), 128, 64).filter((s) => Math.abs(s.p[0] - x) < 0.006)
    return Math.max(...near.map((s) => s.p[1]))
  }

  it('the spine rises out of the drift as one continuous ridge from the mid-back to the shoulders', () => {
    for (let x = -0.15; x <= 0.15; x += 0.025) {
      expect(crestAt(x) - sphinxDriftHeight(x, 0), `crest clear at x=${x.toFixed(3)}`).toBeGreaterThan(0.02)
    }
    // It runs on into the neck: no sand gap between the ridge's front and the neck.
    const neck = part('neck')
    expect(part('spine').centre[0] + part('spine').radii[0]).toBeGreaterThan(neck.centre[0] - neck.radii[0])
    // Sand banks against its flanks: right beside the ridge the drift stands
    // higher than a little further out.
    const w = part('spine').radii[2]
    for (const x of [-0.1, 0, 0.1]) expect(sphinxDriftHeight(x, w * 1.3)).toBeGreaterThan(sphinxDriftHeight(x, w * 3))
  })

  it('draws the spine in the same limestone family as the head, and the stone darker than the sand', () => {
    const lum = (hex: string) => {
      const v = parseInt(hex.slice(1), 16)
      return 0.299 * (v >> 16) + 0.587 * ((v >> 8) & 255) + 0.114 * (v & 255)
    }
    const t = SPHINX_FORM.tones
    expect(part('spine').tone).toBe('limestone')
    expect(Math.abs(lum(t.limestone) - lum(t.face))).toBeLessThan(10)
    expect(Math.abs(lum(t.limestone) - lum(t.nemes))).toBeLessThan(10)
    // From above the clear stone must stand out against the drift.
    for (const k of ['limestone', 'face', 'nemes'] as const) expect(lum(t.sand) - lum(t[k])).toBeGreaterThan(25)
  })

  it('from behind the head and the nemes back stand above the drift, over two haunch swells', () => {
    // The verification standpoint behind the monument, at eye height (1.7 m at a 20 m body).
    const eye = [-0.95, 1.7 / SPHINX_FORM.site.length, 0.15]
    const visible = (target: readonly number[]) => {
      for (let t = 0.02; t < 0.98; t += 0.005) {
        const x = eye[0] + (target[0] - eye[0]) * t
        const y = eye[1] + (target[1] - eye[1]) * t
        const z = eye[2] + (target[2] - eye[2]) * t
        if (sphinxDriftHeight(x, z) >= y) return false
      }
      return true
    }
    const top = (id: string) => sampleSurface(part(id), 32, 32).reduce((a, s) => (s.p[1] > a[1] ? s.p : a), [0, -1, 0])
    expect(visible(top('nemes')), 'crown').toBe(true)
    expect(visible(top('nemesBack')), 'nemes back').toBe(true)
    expect(visible([0, crestAt(0), 0]), 'spine crest').toBe(true)
    // Two haunch swells with a dip between them at the rump.
    const h = part('haunchR')
    expect(sphinxDriftHeight(h.centre[0], h.centre[2])).toBeGreaterThan(sphinxDriftHeight(h.centre[0] - h.radii[0] * 0.5, 0) + 0.003)
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
