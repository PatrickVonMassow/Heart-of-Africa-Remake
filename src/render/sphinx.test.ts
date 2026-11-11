// The Great Sphinx's levels of detail (src/render/sphinx.ts) all come from the
// ONE definition (src/world/sphinx.ts): the site mesh, the bird's-eye landmark
// and the Cairo skyline outline cannot drift apart (the lesson of point 338).

import { describe, expect, it } from 'vitest'
import { QUALITY_PRESETS, DETAIL_LEVELS } from '../config/quality'
import {
  SPHINX_LODS,
  SPHINX_PARTS,
  SPHINX_SITE_LOD,
  partLevel,
  sphinxCrownHeight,
  sphinxDriftBounds,
  sphinxDriftHeight,
  sphinxPartsFor,
} from '../world/sphinx'
import { buildSphinxGeometry, SPHINX_BAND_ATTRIBUTE } from './sphinx'

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
        const onDrift = Math.abs(y - sphinxDriftHeight(x, z)) < 1e-6
        expect(onPart || onDrift, `${lod} vertex ${i} (${x.toFixed(3)}, ${y.toFixed(3)}, ${z.toFixed(3)})`).toBe(true)
      }
      geo.dispose()
    }
  })

  it('every level draws the same monument: crown, length and footprint agree', () => {
    const crown = sphinxCrownHeight()
    const b = sphinxDriftBounds()
    for (const lod of SPHINX_LODS) {
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
    // The skyline outline still carries a head in its nemes over the back.
    for (const id of ['face', 'nemes', 'wingR', 'wingL', 'lappetR', 'lappetL', 'neck', 'spine']) expect(skyline.has(id)).toBe(true)
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
      const onDrift = Math.abs(pos.getY(i) - sphinxDriftHeight(pos.getX(i), pos.getZ(i))) < 1e-6
      if (onDrift) expect(band.getX(i)).toBe(0)
      else if (band.getX(i) > 0) banded++
    }
    expect(banded).toBeGreaterThan(0)
    expect(buildSphinxGeometry('landmark').getAttribute(SPHINX_BAND_ATTRIBUTE)).toBeUndefined()
  })
})
