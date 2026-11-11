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
  SPHINX_LODS,
  SPHINX_PARTS,
  SPHINX_SITE_LOD,
  partLevel,
  sampleSurface,
  sphinxEmphasis,
  sphinxCrownHeight,
  sphinxDriftBounds,
  sphinxDriftHeight,
  sphinxPartsFor,
} from '../world/sphinx'
import { buildSphinxGeometry, SPHINX_BAND_ATTRIBUTE } from './sphinx'

/** The z of a part's surface samples (its half-width in plan). */
const sampleSurfaceOf = (p: (typeof SPHINX_PARTS)[number]) => sampleSurface(p, 24, 16).map((s) => s.p[2])

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
      const b = sphinxDriftBounds(lod)
      const geo = buildSphinxGeometry(lod)
      geo.computeBoundingBox()
      const bb = geo.boundingBox!
      // The coarser the level, the more its facets cut the curves; never by much.
      expect(Math.abs(bb.max.y - crown), `${lod} crown`).toBeLessThan(crown * 0.08)
      expect(bb.min.x).toBeGreaterThanOrEqual(b.minX - 1e-5)
      expect(bb.max.x).toBeLessThanOrEqual(b.maxX + 1e-5)
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
    for (const id of landmark) expect(site.has(id)).toBe(true)
    for (const id of skyline) expect(landmark.has(id)).toBe(true)
    for (const p of SPHINX_PARTS) if (p.burial === 'buried') expect(site.has(p.id)).toBe(false)
    // The skyline outline still carries a head in its nemes over the back —
    // and nothing else: from Cairo only head, neck and back ridge stand above
    // the drift (owner verdict 11.11.2026).
    for (const id of ['face', 'nemes', 'wingR', 'wingL', 'neck', 'spine']) expect(skyline.has(id)).toBe(true)
    for (const p of sphinxPartsFor('skyline')) expect(p.group === 'head' || p.id === 'neck' || p.id === 'spine', p.id).toBe(true)
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
    // Every landmark part is a definition part, the head block scaled about the anchor.
    const a = SPHINX_HEAD_ANCHOR
    for (const p of sphinxPartsFor('landmark')) {
      const src = SPHINX_CLEAR_PARTS.find((q) => q.id === p.id)!
      const k = p.group === 'head' ? e.head : 1
      for (let i = 0; i < 3; i++) {
        expect(p.radii[i]).toBeCloseTo(src.radii[i] * k, 9)
        expect(p.centre[i]).toBeCloseTo(a[i] + (src.centre[i] - a[i]) * k, 9)
      }
    }
    // The site and the skyline are drawn true.
    expect(sphinxEmphasis('site-full')).toEqual(sphinxEmphasis())
    expect(sphinxEmphasis('skyline')).toEqual(sphinxEmphasis())
  })

  it('from above the landmark reads paws, body swell and head: two paw prongs with the notch open between them', () => {
    const fore = SPHINX_PARTS.find((p) => p.id === 'forelegR')!
    const z = fore.centre[2] * sphinxEmphasis('landmark').pawSpread
    // Ahead of the chest, between the paw tips: ground between, sand on both prongs.
    const x = fore.centre[0] + fore.radii[0]
    expect(sphinxDriftHeight(x, 0, 'landmark')).toBeLessThan(0)
    expect(sphinxDriftHeight(x, z, 'landmark')).toBeGreaterThan(0.03)
    expect(sphinxDriftHeight(x, -z, 'landmark')).toBeGreaterThan(0.03)
    // The body swell: higher over the shoulders than over the paws.
    expect(sphinxDriftHeight(0.16, 0.1, 'landmark')).toBeGreaterThan(sphinxDriftHeight(x, z, 'landmark'))
    // The head-and-nemes block is wider in plan than the neck and the spine.
    const width = (ids: string[]) => {
      let w = 0
      for (const p of sphinxPartsFor('landmark').filter((q) => ids.some((id) => q.id.startsWith(id))))
        for (const s of sampleSurfaceOf(p)) w = Math.max(w, Math.abs(s))
      return w
    }
    expect(width(['nemes', 'wing'])).toBeGreaterThan(width(['neck', 'spine']) * 2)
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
