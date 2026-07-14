// Landmark geometry builders (design.md §4.4): every builder yields a
// non-empty, vertex-colored geometry; the two shape-critical ones are pinned
// by their proportions (Table Mountain's flat wide profile, the minaret is
// covered live via the mosque dwelling in the polish suite).
import { describe, it, expect } from 'vitest'
import {
  buildMeroePyramids,
  buildGizaPyramids,
  buildStoneCity,
  buildRockChurches,
  buildCoastalRuins,
  buildStelae,
  buildCastles,
  buildCliffDwellings,
  buildCrater,
  buildVolcano,
  buildDelta,
  buildWetland,
  buildTableMountain,
} from './landmarks'

const BUILDERS = {
  buildMeroePyramids,
  buildGizaPyramids,
  buildStoneCity,
  buildRockChurches,
  buildCoastalRuins,
  buildStelae,
  buildCastles,
  buildCliffDwellings,
  buildCrater,
  buildVolcano,
  buildDelta,
  buildWetland,
  buildTableMountain,
}

describe('landmark builders', () => {
  it.each(Object.entries(BUILDERS))('%s yields a non-empty vertex-colored geometry', (_name, build) => {
    const geo = build()
    expect(geo.attributes.position.count).toBeGreaterThan(0)
    expect(geo.attributes.color?.count).toBe(geo.attributes.position.count)
    geo.dispose()
  })

  it('the sites stay within the travel-marker footprint, grounded at y=0', () => {
    for (const [name, build] of Object.entries(BUILDERS)) {
      if (name === 'buildTableMountain') continue // skyline scale by design
      if (name === 'buildMeroePyramids') continue // deliberately oversized (own pin below)
      if (name === 'buildGizaPyramids') continue // deliberately oversized (own pin below)
      const geo = build()
      geo.computeBoundingBox()
      const b = geo.boundingBox
      expect(b, name).toBeTruthy()
      if (!b) continue
      expect(b.min.y, name).toBeGreaterThanOrEqual(-0.1) // origin at the ground
      expect(Math.max(b.max.x - b.min.x, b.max.z - b.min.z), name).toBeLessThan(6)
      geo.dispose()
    }
  })

  it('Giza: three flat-sided great pyramids with the Sphinx, Khufu tallest', () => {
    const geo = buildGizaPyramids()
    geo.computeBoundingBox()
    const b = geo.boundingBox
    expect(b).toBeTruthy()
    if (!b) return
    expect(b.min.y).toBeGreaterThanOrEqual(-0.1) // grounded
    // Khufu (base half-extent 1.6, Old-Kingdom slope) peaks at ~2 — a compact
    // symbol: the field stands only ~4 world units from Cairo's marker.
    expect(b.max.y).toBeGreaterThan(1.7)
    expect(b.max.y).toBeLessThan(3)
    const footprint = Math.max(b.max.x - b.min.x, b.max.z - b.min.z)
    expect(footprint).toBeGreaterThan(3.5)
    expect(footprint).toBeLessThan(8)
    geo.dispose()
  })

  it('the Meroë pyramid field is unmistakable at travel zoom (user request)', () => {
    const geo = buildMeroePyramids()
    geo.computeBoundingBox()
    const b = geo.boundingBox
    expect(b).toBeTruthy()
    if (!b) return
    expect(b.min.y).toBeGreaterThanOrEqual(-0.1) // grounded
    // Well above tree height (acacia ~2, baobab ~2.6) but no mountain.
    expect(b.max.y).toBeGreaterThan(3)
    expect(b.max.y).toBeLessThan(8)
    // A spread field, still bounded as a point landmark.
    const footprint = Math.max(b.max.x - b.min.x, b.max.z - b.min.z)
    expect(footprint).toBeGreaterThan(6)
    expect(footprint).toBeLessThan(14)
    geo.dispose()
  })

  it('Table Mountain reads as a broad flat-topped massif', () => {
    const geo = buildTableMountain()
    geo.computeBoundingBox()
    const b = geo.boundingBox
    expect(b).toBeTruthy()
    if (!b) return
    const width = b.max.x - b.min.x
    const height = b.max.y - b.min.y
    expect(width).toBeGreaterThan(150) // skyline scale incl. flanking peaks
    expect(width / height).toBeGreaterThan(5) // wide, not a spire
    // Flat top: many vertices share the plateau height near max.y.
    const pos = geo.attributes.position
    let plateau = 0
    for (let i = 0; i < pos.count; i++) if (pos.getY(i) > b.max.y - 2.5) plateau++
    expect(plateau).toBeGreaterThan(12)
    geo.dispose()
  })
})
