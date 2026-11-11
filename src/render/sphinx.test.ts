// The Great Sphinx's levels of detail (src/render/sphinx.ts) all come from the
// ONE definition (src/world/sphinx.ts): the site mesh, the bird's-eye landmark
// and the Cairo skyline outline cannot drift apart (the lesson of point 338).

import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { QUALITY_PRESETS, DETAIL_LEVELS } from '../config/quality'
import { SPHINX_FORM } from '../config/balance'
import {
  SPHINX_CLEAR_PARTS,
  SPHINX_HEAD_ANCHOR,
  SPHINX_HEAD_BLOCK_SOURCES,
  SPHINX_LODS,
  SPHINX_PARTS,
  SPHINX_SITE_LOD,
  partLevel,
  sampleSurface,
  sphinxEmphasis,
  sphinxCrownHeight,
  sphinxDriftBounds,
  sphinxDriftHeight,
  sphinxDriftNormal,
  headBlockWidths,
  sphinxHeadBlock,
  sphinxPartsFor,
  type SphinxLod,
  type SphinxPart,
} from '../world/sphinx'
import { buildSphinxGeometry, SPHINX_BAND_ATTRIBUTE } from './sphinx'

/** The z of a part's surface samples (its half-width in plan). */
const sampleSurfaceOf = (p: (typeof SPHINX_PARTS)[number]) => sampleSurface(p, 24, 16).map((s) => s.p[2])

/** A level's drawn footprint: its drift's bounds (where it draws one) joined
 *  with its drawn parts' extents. */
function drawnBounds(lod: SphinxLod) {
  const b = SPHINX_FORM.lods[lod].driftCells > 0 ? { ...sphinxDriftBounds(lod) } : { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  for (const p of sphinxPartsFor(lod)) {
    for (const { p: q } of sampleSurface(p, 24, 16)) {
      b.minX = Math.min(b.minX, q[0])
      b.maxX = Math.max(b.maxX, q[0])
      b.minZ = Math.min(b.minZ, q[2])
      b.maxZ = Math.max(b.maxZ, q[2])
    }
  }
  return b
}

const triangles = (lod: (typeof SPHINX_LODS)[number]) => {
  const g = buildSphinxGeometry(lod)
  const n = g.index!.count / 3
  g.dispose()
  return n
}

describe('three levels of detail, one source', () => {
  it('every vertex of every level lies on a part of the definition or on its drift', () => {
    for (const lod of SPHINX_LODS) {
      const geo = buildSphinxGeometry(lod)
      const pos = geo.getAttribute('position')
      const parts = sphinxPartsFor(lod)
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        const z = pos.getZ(i)
        const onPart = parts.some((p) => Math.abs(partLevel(p, x, y, z) - 1) < 1e-3)
        const onDrift = Math.abs(y - sphinxDriftHeight(x, z, lod)) < 1e-6
        expect(onPart || onDrift, `${lod} vertex ${i} (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`).toBe(true)
      }
      geo.dispose()
    }
  })

  it('every level draws the same monument: crown, length and footprint agree', () => {
    for (const lod of SPHINX_LODS) {
      // A level's crown and footprint are the definition's under its emphasis
      // (neutral everywhere but the bird's-eye landmark).
      const crown = sphinxCrownHeight(lod)
      const b = drawnBounds(lod)
      const geo = buildSphinxGeometry(lod)
      geo.computeBoundingBox()
      const bb = geo.boundingBox!
      // The coarser the level, the more its facets cut the curves; never by much.
      expect(Math.abs(bb.max.y - crown), `${lod} crown`).toBeLessThan(crown * 0.08)
      expect(bb.min.x).toBeGreaterThanOrEqual(b.minX - 1e-3)
      expect(bb.max.x).toBeLessThanOrEqual(b.maxX + 1e-3)
      // The drift's foot runs just under the ground at every level.
      expect(bb.min.y).toBeLessThan(0)
      geo.dispose()
    }
  })

  it('the coarser levels draw a subset of the finer levels’ parts, the buried body at none', () => {
    const ids = (lod: (typeof SPHINX_LODS)[number]) => new Set(sphinxPartsFor(lod).map((p) => p.id))
    const site = ids('site-full')
    const landmark = ids('landmark')
    const skyline = ids('skyline')
    // The bird's-eye level's documented reveal: the forepaws drawn in stone.
    const revealed = (id: string) => sphinxEmphasis('landmark').revealPaws && id.startsWith('foreleg')
    for (const id of landmark) if (!revealed(id)) expect(site.has(id), id).toBe(true)
    expect(landmark.has('forelegR') && landmark.has('forelegL')).toBe(true)
    // The skyline's head block stands for nemes parts every finer level draws.
    for (const id of skyline) {
      if (id === 'headBlock') for (const src of SPHINX_HEAD_BLOCK_SOURCES) expect(landmark.has(src), src).toBe(true)
      else expect(landmark.has(id), id).toBe(true)
    }
    for (const p of SPHINX_PARTS) if (p.burial === 'buried') expect(site.has(p.id)).toBe(false)
    // The skyline outline carries the head — the nemes block and the face —
    // over the neck and the back ridge, and nothing else: from Cairo only
    // head, neck and back ridge stand above the drift (owner verdict 11.11.2026).
    expect([...skyline].sort()).toEqual(['face', 'headBlock', 'neck', 'spine'])
  })

  it('the skyline level carries the drift: the mound is DRAWN and stands over half the crown height', () => {
    // Counted on the triangles, not the vertex grid: addDrift emits the whole
    // grid before it indexes the cells, so only vertices a drift triangle
    // references — and the area those triangles cover — prove the mound is drawn.
    const geo = buildSphinxGeometry('skyline')
    const pos = geo.getAttribute('position')
    const idx = geo.index!
    const onDrift = (i: number) => Math.abs(pos.getY(i) - sphinxDriftHeight(pos.getX(i), pos.getZ(i), 'skyline')) < 1e-6
    const used = new Set<number>()
    let area = 0
    let driftTop = 0
    for (let t = 0; t < idx.count; t += 3) {
      const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]
      if (!v.every(onDrift)) continue
      for (const i of v) {
        used.add(i)
        driftTop = Math.max(driftTop, pos.getY(i))
      }
      const [ax, az, bx, bz, cx, cz] = [pos.getX(v[0]), pos.getZ(v[0]), pos.getX(v[1]), pos.getZ(v[1]), pos.getX(v[2]), pos.getZ(v[2])]
      area += Math.abs((bx - ax) * (cz - az) - (cx - ax) * (bz - az)) / 2
    }
    expect(used.size).toBeGreaterThan(100)
    // A plan area of at least a tenth of the body's length squared.
    expect(area).toBeGreaterThan(0.1)
    expect(driftTop).toBeGreaterThan(sphinxCrownHeight('skyline') * 0.4)
    // The skyline drift is the site's drift, drawn true.
    expect(sphinxDriftBounds('skyline')).toEqual(sphinxDriftBounds())
    geo.dispose()
  })

  it("the bird's-eye level is the one definition under its documented travel-scale emphasis", () => {
    const e = sphinxEmphasis('landmark')
    expect(e).toMatchObject(SPHINX_FORM.emphasis.landmark)
    expect(e.head).toBeGreaterThan(1)
    // Every landmark part is a definition part: the head block scaled about
    // the anchor, the back ridge widened, the forepaws lengthened (rear end
    // fixed), lifted, spread and widened.
    const a = SPHINX_HEAD_ANCHOR
    for (const p of sphinxPartsFor('landmark')) {
      const src = SPHINX_PARTS.find((q) => q.id === p.id)!
      if (p.id.startsWith('foreleg')) {
        expect(src.burial).toBe('buried')
        expect(p.radii[0]).toBeCloseTo(src.radii[0] * e.pawReach, 9)
        expect(p.radii[1]).toBeCloseTo(src.radii[1] * e.pawLift, 9)
        expect(p.radii[2]).toBeCloseTo(src.radii[2] * e.pawWidth, 9)
        expect(p.centre[0] - p.radii[0]).toBeCloseTo(src.centre[0] - src.radii[0], 9)
        expect(p.centre[2]).toBeCloseTo(src.centre[2] * e.pawSpread, 9)
        continue
      }
      const k = p.group === 'head' || p.id === 'neck' ? e.head : 1
      const w = p.id === 'spine' ? e.spineWidth : 1
      for (let i = 0; i < 3; i++) {
        expect(p.radii[i]).toBeCloseTo(src.radii[i] * k * (i === 2 ? w : 1), 9)
        expect(p.centre[i]).toBeCloseTo(a[i] + (src.centre[i] - a[i]) * k, 9)
      }
    }
    // The site is drawn true; the skyline true in proportion (head 1), its
    // nemes drawn as the derived block.
    expect(sphinxEmphasis('site-full')).toEqual(sphinxEmphasis())
    const sky = sphinxEmphasis('skyline')
    expect(sky).toMatchObject(SPHINX_FORM.emphasis.skyline)
    expect({ ...sky, stoneShade: 1, headBlock: false, lappetFlare: 1 }).toEqual(sphinxEmphasis())
  })

  it('from above the landmark reads paws, body line and head: two stone paw tongues ahead of the chest, the notch open between them', () => {
    const parts = sphinxPartsFor('landmark')
    const pawR = parts.find((p) => p.id === 'forelegR')!
    const pawL = parts.find((p) => p.id === 'forelegL')!
    expect(pawR.tone).toBe('limestone')
    expect(pawL.centre[2]).toBeCloseTo(-pawR.centre[2], 9)
    // Parallel tongues: both run along the body axis, side by side.
    expect(pawR.centre[0]).toBeCloseTo(pawL.centre[0], 9)
    const chest = SPHINX_PARTS.find((p) => p.id === 'chest')!
    const tip = pawR.centre[0] + pawR.radii[0]
    // Reaching forward of the chest (over a tenth of the body length)...
    expect(tip - (chest.centre[0] + chest.radii[0])).toBeGreaterThan(0.1)
    // ...standing out of the ground, with no sand over them...
    const mid = pawR.centre[0] + pawR.radii[0] * 0.5
    expect(pawR.centre[1] + pawR.radii[1]).toBeGreaterThan(0.06)
    // ...joined to the body: the paw's root lies within the chest's width,
    // under the shoulders, and its inner edge inside the chest's flank...
    const root = pawR.centre[0] - pawR.radii[0]
    expect(root).toBeLessThan(chest.centre[0])
    expect(pawR.centre[2] - pawR.radii[2]).toBeLessThan(chest.radii[2])
    // ...short enough to stay a paw: about a third of the body length at most...
    expect(2 * pawR.radii[0]).toBeLessThanOrEqual(0.35)
    // ...and the notch between them open ground, at least a paw's width wide.
    const gap = 2 * (pawR.centre[2] - pawR.radii[2])
    expect(gap).toBeGreaterThan(2 * pawR.radii[2])
    for (const p of parts) expect(partLevel(p, mid, 0.01, 0), p.id).toBeGreaterThan(1)
    // The body line: the back ridge reads wider in plan than at the site.
    const plan = (lod: SphinxLod, ids: string[]) => {
      let w = 0
      for (const p of sphinxPartsFor(lod).filter((q) => ids.some((id) => q.id.startsWith(id))))
        for (const z of sampleSurfaceOf(p)) w = Math.max(w, Math.abs(z))
      return w
    }
    expect(plan('landmark', ['spine'])).toBeGreaterThan(plan('site-full', ['spine']) * 2)
    // The back line runs from the haunches to the shoulders in stone.
    const spine = parts.find((p) => p.id === 'spine')!
    expect(spine.centre[0] - spine.radii[0]).toBeLessThan(-0.25)
    expect(spine.centre[0] + spine.radii[0]).toBeGreaterThan(0.2)
    // The head-and-nemes block is wider in plan than the neck and the back ridge.
    expect(plan('landmark', ['nemes', 'wing'])).toBeGreaterThan(plan('landmark', ['neck']) * 2)
    expect(plan('landmark', ['nemes', 'wing'])).toBeGreaterThan(plan('landmark', ['spine']) * 1.5)
  })

  it('the landmark draws no drift: no untextured sand patch beside the travel ground (owner picture check 11.11.2026)', () => {
    expect(SPHINX_FORM.lods.landmark.driftCells).toBe(0)
    const geo = buildSphinxGeometry('landmark')
    const pos = geo.getAttribute('position')
    const parts = sphinxPartsFor('landmark')
    // Every vertex is stone: on a drawn part, none on a drift.
    for (let i = 0; i < pos.count; i++) {
      const on = parts.some((p) => Math.abs(partLevel(p, pos.getX(i), pos.getY(i), pos.getZ(i)) - 1) < 1e-3)
      expect(on, `landmark vertex ${i}`).toBe(true)
    }
    geo.dispose()
  })

  it('at the landmark the stone is the limestone hue under a uniform shade — in the emitted vertex colours', () => {
    const site = new THREE.Color(SPHINX_FORM.tones.limestone)
    const shade = SPHINX_FORM.emphasis.landmark.stoneShade
    expect(shade).toBeLessThan(1)
    const want = site.clone().multiplyScalar(shade)
    // Read the built geometry: a vertex on a limestone part (and on no part of
    // another tone) carries the shaded limestone, within the ±5 % jitter.
    const geo = buildSphinxGeometry('landmark')
    const pos = geo.getAttribute('position')
    const col = geo.getAttribute('color')
    const parts = sphinxPartsFor('landmark')
    const on = (p: SphinxPart, i: number) => Math.abs(partLevel(p, pos.getX(i), pos.getY(i), pos.getZ(i)) - 1) < 1e-3
    let n = 0
    for (let i = 0; i < pos.count; i++) {
      const tones = new Set(parts.filter((p) => on(p, i)).map((p) => p.tone))
      if (tones.size !== 1 || !tones.has('limestone')) continue
      n++
      const c = [col.getX(i), col.getY(i), col.getZ(i)]
      const w = [want.r, want.g, want.b]
      for (let k = 0; k < 3; k++) expect(c[k] / w[k], `vertex ${i} channel ${k}`).toBeGreaterThan(0.949)
      for (let k = 0; k < 3; k++) expect(c[k] / w[k], `vertex ${i} channel ${k}`).toBeLessThan(1.051)
      // One factor for all three channels: the hue is the limestone's.
      expect(c[0] / c[2]).toBeCloseTo(want.r / want.b, 6)
    }
    // Paws, spine, chest, neck and shoulder tops: hundreds of stone vertices.
    expect(n).toBeGreaterThan(300)
    geo.dispose()
  })

  it('the skyline outline reads as a crouching figure with a raised head', () => {
    // Side silhouette (max height per slice along the body) of the coarsest level.
    const geo = buildSphinxGeometry('skyline')
    const pos = geo.getAttribute('position')
    let head = 0
    let back = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      if (x > 0.2) head = Math.max(head, y)
      else if (x < 0.1) back = Math.max(back, y)
    }
    expect(head).toBeGreaterThan(back * 1.3)
    geo.dispose()
  })

  it("face-on the skyline head is the nemes' flat-topped trapezoid widening to the shoulders, the lappets joined to it", () => {
    const block = sphinxHeadBlock()
    // Derived from the nemes parts: it spans exactly their extent.
    const srcs = SPHINX_CLEAR_PARTS.filter((p) => (SPHINX_HEAD_BLOCK_SOURCES as readonly string[]).includes(p.id))
    const pts = srcs.flatMap((p) => sampleSurface(p, 64, 48).map((q) => q.p))
    const ys = pts.map((q) => q[1])
    expect(block.centre[1] + block.radii[1]).toBeCloseTo(Math.max(...ys), 6)
    expect(block.centre[1] - block.radii[1]).toBeCloseTo(Math.min(...ys), 6)
    // …and laterally: the DRAWN block is as wide as its sources (no loss to
    // the superellipsoid's contraction), its crown as wide as theirs.
    const srcMax = Math.max(...pts.map((q) => Math.abs(q[2])))
    const srcTop = Math.max(...pts.filter((q) => q[1] >= Math.max(...ys) - (Math.max(...ys) - Math.min(...ys)) * 0.25).map((q) => Math.abs(q[2])))
    const drawn = headBlockWidths(block)
    expect(Math.abs(drawn.max / srcMax - 1)).toBeLessThan(0.01)
    expect(Math.abs(drawn.top / srcTop - 1)).toBeLessThan(0.02)
    const flared = headBlockWidths(sphinxHeadBlock(SPHINX_FORM.emphasis.skyline.lappetFlare))
    expect(Math.abs(flared.max / (srcMax * SPHINX_FORM.emphasis.skyline.lappetFlare) - 1)).toBeLessThan(0.01)
    // Depth: front and back as far as the sources reach.
    const xs = pts.map((q) => q[0])
    expect(block.centre[0] + block.radii[0]).toBeCloseTo(Math.max(...xs), 6)
    expect(block.centre[0] - block.radii[0]).toBeCloseTo(Math.min(...xs), 6)
    // The face-on outline: the half-width per height band, top to bottom.
    const sky = sphinxPartsFor('skyline').find((p) => p.id === 'headBlock')!
    // Scanned through the solid (partLevel ≤ 1), not from surface samples,
    // which crowd at a flat superellipsoid's crown and foot.
    const top = sky.centre[1] + sky.radii[1]
    const h = 2 * sky.radii[1]
    const bands = 8
    const half: number[] = []
    for (let k = 0; k < bands; k++) {
      const y = top - (h * (k + 0.5)) / bands
      let w = 0
      for (let i = 0; i <= 40; i++) {
        const x = sky.centre[0] - sky.radii[0] + (2 * sky.radii[0] * i) / 40
        for (let z = 0; z <= 0.3; z += 0.001) if (partLevel(sky, x, y, z) <= 1) w = Math.max(w, z)
      }
      half.push(w)
    }
    // Flat-topped: already most of the crown's width in the top band…
    expect(half[0]).toBeGreaterThan(half[1] * 0.75)
    // …widening steadily downward (one outline, no lobes hanging beside it)…
    for (let k = 1; k < bands - 1; k++) expect(half[k], `band ${k}`).toBeGreaterThanOrEqual(half[k - 1] - 1e-3)
    // …to the shoulders: at least twice as wide below as at the crown.
    expect(Math.max(...half)).toBeGreaterThan(half[0] * 2)
    // The lappets' foot runs into the drift at the chest (joined to the body),
    // and the face stands inside the outline, in front of it.
    expect(sky.centre[1] - sky.radii[1]).toBeLessThan(sphinxDriftHeight(sky.centre[0], 0, 'skyline'))
    const face = sphinxPartsFor('skyline').find((p) => p.id === 'face')!
    expect(face.centre[0] + face.radii[0]).toBeGreaterThan(sky.centre[0] + sky.radii[0])
    expect(face.radii[2]).toBeLessThan(half[0])
    // No separate wing lobes remain on the skyline.
    expect(sphinxPartsFor('skyline').some((p) => p.id.startsWith('wing') || p.id.startsWith('lappet'))).toBe(false)
  })

  it('the distant levels\' own parts meet each other only at real angles (transformed paws, widened spine, head block)', () => {
    const deg = (r: number) => (r * 180) / Math.PI
    const crossing = (a: readonly number[], b: readonly number[]) =>
      deg(Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))))
    const gradient = (p: SphinxPart, x: number, y: number, z: number) => {
      const e = 1e-5
      const g = [
        partLevel(p, x + e, y, z) - partLevel(p, x - e, y, z),
        partLevel(p, x, y + e, z) - partLevel(p, x, y - e, z),
        partLevel(p, x, y, z + e) - partLevel(p, x, y, z - e),
      ]
      const l = Math.hypot(g[0], g[1], g[2])
      return g.map((v) => v / l)
    }
    let contacts = 0
    for (const lod of ['landmark', 'skyline'] as const) {
      const parts = sphinxPartsFor(lod)
      for (const a of parts) {
        for (const b of parts) {
          if (a === b) continue
          for (const s of sampleSurface(a, 64, 48)) {
            const level = partLevel(b, s.p[0], s.p[1], s.p[2])
            const r = Math.hypot(s.p[0] - b.centre[0], s.p[1] - b.centre[1], s.p[2] - b.centre[2])
            if (Math.abs(r * (1 - 1 / level)) > 0.0015) continue
            contacts++
            expect(crossing(s.n, gradient(b, s.p[0], s.p[1], s.p[2])), `${lod}: ${a.id} against ${b.id}`).toBeGreaterThan(10)
          }
        }
      }
    }
    // The levels' parts do touch (the check is not vacuous).
    expect(contacts).toBeGreaterThan(0)
  })

  it('the distant levels have nothing to z-fight either: their parts cross the drift and the ground at real angles', () => {
    const deg = (r: number) => (r * 180) / Math.PI
    const crossing = (a: readonly number[], b: readonly number[]) =>
      deg(Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))))
    for (const lod of ['landmark', 'skyline'] as const) {
      const parts = sphinxPartsFor(lod)
      for (const a of parts) {
        for (const s of sampleSurface(a, 64, 48)) {
          const drift = SPHINX_FORM.lods[lod].driftCells > 0
          if (drift && Math.abs(s.p[1] - sphinxDriftHeight(s.p[0], s.p[2], lod)) <= 0.002 && s.p[1] > 0.002)
            expect(crossing(s.n, sphinxDriftNormal(s.p[0], s.p[2], lod)), `${lod} ${a.id} through the drift`).toBeGreaterThan(10)
          // The ground itself (the paws stand on it).
          if (Math.abs(s.p[1]) <= 0.002 && (!drift || sphinxDriftHeight(s.p[0], s.p[2], lod) < 0))
            expect(crossing(s.n, [0, 1, 0]), `${lod} ${a.id} on the ground`).toBeGreaterThan(10)
        }
      }
    }
  })
})

describe('the site levels follow the quality presets (design.md §21)', () => {
  it('low draws the named reduced mesh, high the fullest, each strictly finer', () => {
    expect(SPHINX_SITE_LOD[QUALITY_PRESETS.low.sphinxSiteDetail]).toBe('site-reduced')
    expect(SPHINX_SITE_LOD[QUALITY_PRESETS.high.sphinxSiteDetail]).toBe('site-full')
    const counts = DETAIL_LEVELS.map((l) => triangles(SPHINX_SITE_LOD[QUALITY_PRESETS[l].sphinxSiteDetail]))
    expect(counts[0]).toBeLessThan(counts[1])
    expect(counts[1]).toBeLessThan(counts[2])
    // The distant views are cheaper than any site level.
    expect(triangles('landmark')).toBeLessThan(counts[0])
    expect(triangles('skyline')).toBeLessThan(triangles('landmark'))
  })

  it('only the site mesh carries the banding attribute, and the drift has no banding', () => {
    const site = buildSphinxGeometry('site-reduced', { banding: true })
    const band = site.getAttribute(SPHINX_BAND_ATTRIBUTE)
    expect(band).toBeTruthy()
    const pos = site.getAttribute('position')
    let banded = 0
    for (let i = 0; i < pos.count; i++) {
      const onDrift = Math.abs(pos.getY(i) - sphinxDriftHeight(pos.getX(i), pos.getZ(i), 'site-reduced')) < 1e-6
      if (onDrift) expect(band.getX(i)).toBe(0)
      else if (band.getX(i) > 0) banded++
    }
    expect(banded).toBeGreaterThan(0)
    expect(buildSphinxGeometry('landmark').getAttribute(SPHINX_BAND_ATTRIBUTE)).toBeUndefined()
  })
})
