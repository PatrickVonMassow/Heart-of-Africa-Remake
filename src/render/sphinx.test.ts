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
  sphinxHeadBlock,
  sphinxPartsFor,
  type SphinxLod,
} from '../world/sphinx'
import { PALETTE, PALETTE_ALT } from '../world/terrainPalette'
import { farTerrainColor } from '../scenes/travel/farColor'
import { buildSphinxGeometry, sphinxDriftTone, SPHINX_BAND_ATTRIBUTE } from './sphinx'

/** The z of a part's surface samples (its half-width in plan). */
const sampleSurfaceOf = (p: (typeof SPHINX_PARTS)[number]) => sampleSurface(p, 24, 16).map((s) => s.p[2])

/** A level's drawn footprint: its drift's bounds joined with its drawn parts'
 *  extents (the bird's-eye paws are stone, standing past the drift). */
function drawnBounds(lod: SphinxLod) {
  const b = { ...sphinxDriftBounds(lod) }
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

const onDriftAt = (lod: SphinxLod, x: number, y: number, z: number) => Math.abs(y - sphinxDriftHeight(x, z, lod)) < 1e-6

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

  it('the skyline level carries the drift: the mound is present and stands over half the crown height', () => {
    const geo = buildSphinxGeometry('skyline')
    const pos = geo.getAttribute('position')
    let driftTop = 0
    let driftVerts = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      if (Math.abs(y - sphinxDriftHeight(pos.getX(i), pos.getZ(i), 'skyline')) > 1e-6) continue
      driftVerts++
      driftTop = Math.max(driftTop, y)
    }
    expect(driftVerts).toBeGreaterThan(100)
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
      const k = p.group === 'head' ? e.head : 1
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
    expect({ ...sky, stoneShade: 1, headBlock: false }).toEqual(sphinxEmphasis())
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
    // Reaching well forward of the chest (a fifth of the body length)...
    expect(tip - (chest.centre[0] + chest.radii[0])).toBeGreaterThan(0.2)
    // ...standing out of the ground, with no sand over them...
    const mid = pawR.centre[0] + pawR.radii[0] * 0.5
    expect(pawR.centre[1] + pawR.radii[1]).toBeGreaterThan(0.06)
    expect(sphinxDriftHeight(mid, pawR.centre[2], 'landmark')).toBeLessThan(0)
    // ...and the notch between them open ground, at least a paw's width wide.
    const gap = 2 * (pawR.centre[2] - pawR.radii[2])
    expect(gap).toBeGreaterThan(2 * pawR.radii[2])
    expect(sphinxDriftHeight(mid, 0, 'landmark')).toBeLessThan(0)
    for (const p of parts) expect(partLevel(p, mid, 0.01, 0), p.id).toBeGreaterThan(1)
    // The body line: the back ridge reads wider in plan than at the site.
    const plan = (lod: SphinxLod, ids: string[]) => {
      let w = 0
      for (const p of sphinxPartsFor(lod).filter((q) => ids.some((id) => q.id.startsWith(id))))
        for (const z of sampleSurfaceOf(p)) w = Math.max(w, Math.abs(z))
      return w
    }
    expect(plan('landmark', ['spine'])).toBeGreaterThan(plan('site-full', ['spine']) * 2)
    // The body swell: the drift is higher over the shoulders than at the paws' root.
    expect(sphinxDriftHeight(0.16, 0.1, 'landmark')).toBeGreaterThan(sphinxDriftHeight(0.3, pawR.centre[2], 'landmark'))
    // The head-and-nemes block is wider in plan than the neck and the back ridge.
    expect(plan('landmark', ['nemes', 'wing'])).toBeGreaterThan(plan('landmark', ['neck']) * 2)
    expect(plan('landmark', ['nemes', 'wing'])).toBeGreaterThan(plan('landmark', ['spine']) * 1.5)
  })

  it('the landmark drift is the desert ground\'s sand tone, at most slightly shaded — never grey or white', () => {
    // The travel ground's desert tone, as the far-terrain sheet bakes it.
    const tint = PALETTE.desert.map((v, i) => (v + PALETTE_ALT.desert[i]) / 2) as [number, number, number]
    const ground = farTerrainColor(tint, [1, 0, 0, 0])
    const geo = buildSphinxGeometry('landmark')
    const pos = geo.getAttribute('position')
    const col = geo.getAttribute('color')
    let n = 0
    for (let i = 0; i < pos.count; i++) {
      if (!onDriftAt('landmark', pos.getX(i), pos.getY(i), pos.getZ(i))) continue
      n++
      const c = [col.getX(i), col.getY(i), col.getZ(i)]
      // Same hue: each channel's share of the ground's within 3 %.
      const sum = c[0] + c[1] + c[2]
      const gsum = ground[0] + ground[1] + ground[2]
      for (let k = 0; k < 3; k++) expect(Math.abs(c[k] / sum - ground[k] / gsum), `hue ${k}`).toBeLessThan(0.03)
      // Never lighter than the ground (jitter aside), at most a light shade darker.
      expect(sum / gsum).toBeLessThan(1.03)
      expect(sum / gsum).toBeGreaterThan(0.6)
      // Saturated sand, not grey: red at least three times blue.
      expect(c[0] / c[2]).toBeGreaterThan(3)
    }
    expect(n).toBeGreaterThan(500)
    // The other levels keep the site's sand.
    const sand = new THREE.Color(SPHINX_FORM.tones.sand)
    expect(sphinxDriftTone('skyline')).toEqual([sand.r, sand.g, sand.b])
    expect(sphinxDriftTone('site-full')).toEqual([sand.r, sand.g, sand.b])
    geo.dispose()
  })

  it('the landmark drift has no grid steps: its rim runs on the zero contour and feathers into the ground', () => {
    const geo = buildSphinxGeometry('landmark')
    const pos = geo.getAttribute('position')
    const nor = geo.getAttribute('normal')
    const col = geo.getAttribute('color')
    const idx = geo.index!
    const drift = (i: number) => onDriftAt('landmark', pos.getX(i), pos.getY(i), pos.getZ(i))
    // Boundary edges of the drift's sheet: edges used by exactly one drift triangle.
    const use = new Map<string, number>()
    const key = (a: number, b: number) => (a < b ? `${a}:${b}` : `${b}:${a}`)
    for (let t = 0; t < idx.count; t += 3) {
      const v = [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)]
      if (!v.every(drift)) continue
      // Nothing of the drift is drawn under the ground.
      for (const i of v) expect(pos.getY(i), `drift vertex ${i} under the ground`).toBeGreaterThan(-1e-6)
      for (let k = 0; k < 3; k++) {
        const e = key(v[k], v[(k + 1) % 3])
        use.set(e, (use.get(e) ?? 0) + 1)
      }
    }
    const ground = sphinxDriftTone('landmark')
    let rim = 0
    for (const [e, count] of use) {
      if (count !== 1) continue
      for (const i of e.split(':').map(Number)) {
        rim++
        // On the contour: the drift meets the ground exactly here (no cell
        // corner standing above it, so no step)...
        expect(Math.abs(pos.getY(i)), `rim vertex ${i}`).toBeLessThan(1e-6)
        // ...lit like the flat ground (feathered normal)...
        expect(nor.getY(i)).toBeGreaterThan(0.999)
        // ...and in the ground's own tone, unshaded (jitter aside).
        for (let k = 0; k < 3; k++) expect(Math.abs([col.getX(i), col.getY(i), col.getZ(i)][k] / ground[k] - 1)).toBeLessThan(0.035)
      }
    }
    expect(rim).toBeGreaterThan(100)
    // Away from the rim the true drift normal returns (the swell still shades).
    let steep = 0
    for (let i = 0; i < pos.count; i++) {
      if (!drift(i) || pos.getY(i) < SPHINX_FORM.landmarkDrift.rimFeather) continue
      const n = sphinxDriftNormal(pos.getX(i), pos.getZ(i), 'landmark')
      expect(Math.abs(nor.getY(i) - n[1])).toBeLessThan(1e-4)
      if (n[1] < 0.8) steep++
    }
    expect(steep).toBeGreaterThan(0)
    geo.dispose()
  })

  it('at the landmark the stone reads darker than the sand, in the same limestone hue', () => {
    const geo = buildSphinxGeometry('landmark')
    const pos = geo.getAttribute('position')
    const col = geo.getAttribute('color')
    let stone = 0
    let stoneN = 0
    let sand = 0
    let sandN = 0
    for (let i = 0; i < pos.count; i++) {
      const lum = col.getX(i) + col.getY(i) + col.getZ(i)
      const onDrift = Math.abs(pos.getY(i) - sphinxDriftHeight(pos.getX(i), pos.getZ(i), 'landmark')) < 1e-6
      if (onDrift) {
        sand += lum
        sandN++
      } else {
        stone += lum
        stoneN++
      }
    }
    expect(stone / stoneN).toBeLessThan((sand / sandN) * 0.6)
    // A uniform shade: the hue is the site's limestone, not a new colour.
    const site = new THREE.Color(SPHINX_FORM.tones.limestone)
    const shaded = site.clone().multiplyScalar(SPHINX_FORM.emphasis.landmark.stoneShade)
    expect(shaded.r / shaded.b).toBeCloseTo(site.r / site.b, 9)
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
    const ys = srcs.flatMap((p) => sampleSurface(p, 32, 24).map((q) => q.p[1]))
    expect(block.centre[1] + block.radii[1]).toBeCloseTo(Math.max(...ys), 6)
    expect(block.centre[1] - block.radii[1]).toBeCloseTo(Math.min(...ys), 6)
    // The face-on outline: the half-width per height band, top to bottom.
    const sky = sphinxPartsFor('skyline').find((p) => p.id === 'headBlock')!
    const samples = sampleSurface(sky, 48, 48).map((q) => q.p)
    const top = sky.centre[1] + sky.radii[1]
    const h = 2 * sky.radii[1]
    const bands = 8
    const half: number[] = []
    for (let k = 0; k < bands; k++) {
      const y1 = top - (h * k) / bands
      const y0 = y1 - h / bands
      half.push(Math.max(0, ...samples.filter((q) => q[1] <= y1 && q[1] > y0).map((q) => Math.abs(q[2]))))
    }
    // Flat-topped: already most of the crown's width in the top band…
    expect(half[0]).toBeGreaterThan(half[1] * 0.75)
    // …widening steadily downward (one outline, no lobes hanging beside it)…
    for (let k = 1; k < bands - 1; k++) expect(half[k], `band ${k}`).toBeGreaterThanOrEqual(half[k - 1] - 1e-3)
    // …to the shoulders: at least half again as wide below as at the crown.
    expect(Math.max(...half)).toBeGreaterThan(half[0] * 1.5)
    // The lappets' foot runs into the drift at the chest (joined to the body),
    // and the face stands inside the outline, in front of it.
    expect(sky.centre[1] - sky.radii[1]).toBeLessThan(sphinxDriftHeight(sky.centre[0], 0, 'skyline'))
    const face = sphinxPartsFor('skyline').find((p) => p.id === 'face')!
    expect(face.centre[0] + face.radii[0]).toBeGreaterThan(sky.centre[0] + sky.radii[0])
    expect(face.radii[2]).toBeLessThan(half[0])
    // No separate wing lobes remain on the skyline.
    expect(sphinxPartsFor('skyline').some((p) => p.id.startsWith('wing') || p.id.startsWith('lappet'))).toBe(false)
  })

  it('the distant levels have nothing to z-fight either: their parts cross each other and the drift at real angles', () => {
    const deg = (r: number) => (r * 180) / Math.PI
    const crossing = (a: readonly number[], b: readonly number[]) =>
      deg(Math.acos(Math.min(1, Math.abs(a[0] * b[0] + a[1] * b[1] + a[2] * b[2]))))
    for (const lod of ['landmark', 'skyline'] as const) {
      const parts = sphinxPartsFor(lod)
      for (const a of parts) {
        for (const s of sampleSurface(a, 64, 48)) {
          if (Math.abs(s.p[1] - sphinxDriftHeight(s.p[0], s.p[2], lod)) <= 0.002 && s.p[1] > 0.002)
            expect(crossing(s.n, sphinxDriftNormal(s.p[0], s.p[2], lod)), `${lod} ${a.id} through the drift`).toBeGreaterThan(10)
          // The ground itself (the paws stand on it).
          if (Math.abs(s.p[1]) <= 0.002 && sphinxDriftHeight(s.p[0], s.p[2], lod) < 0)
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
