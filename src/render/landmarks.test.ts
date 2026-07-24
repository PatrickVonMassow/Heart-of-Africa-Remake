// Landmark geometry builders (design.md §4.4): every builder yields a
// non-empty, vertex-colored geometry; the two shape-critical ones are pinned
// by their proportions (Table Mountain's flat wide profile, the minaret is
// covered live via the mosque dwelling in the polish suite).
import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import {
  buildMeroePyramids,
  buildGizaPyramids,
  buildSphinx,
  SPHINX_BURIAL_DEPTH,
  buildStoneCity,
  buildRockChurches,
  buildCoastalRuins,
  buildStelae,
  buildCastles,
  buildCliffDwellings,
  buildCrater,
  buildVolcano,
  buildDelta,
  buildDeltaWater,
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
  buildDeltaWater,
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
    // The field reaches BELOW the ground now: the Sphinx it embeds lies buried
    // to the shoulders as it did in 1890 (point 279), so the floor is its sunk
    // body rather than the pyramids' bases.
    expect(b.min.y).toBeGreaterThanOrEqual(-SPHINX_BURIAL_DEPTH - 0.1)
    // Khufu (base half-extent 1.6, Old-Kingdom slope) peaks at ~2 — a compact
    // symbol: the field stands only ~4 world units from Cairo's marker.
    expect(b.max.y).toBeGreaterThan(1.7)
    expect(b.max.y).toBeLessThan(3)
    const footprint = Math.max(b.max.x - b.min.x, b.max.z - b.min.z)
    expect(footprint).toBeGreaterThan(3.5)
    expect(footprint).toBeLessThan(8)
    geo.dispose()
  })

  it('the Sphinx reads as a couchant lion under the nemes (user request)', () => {
    const geo = buildSphinx()
    geo.computeBoundingBox()
    const b = geo.boundingBox
    expect(b).toBeTruthy()
    if (!b) return
    const length = b.max.x - b.min.x
    const width = b.max.z - b.min.z
    // Couchant: clearly longer than tall, and longer than wide. Measured over
    // the WHOLE lion, buried body included — that is the shape this builder
    // describes, whether or not the sand happens to cover it.
    const bodyHeight = b.max.y - b.min.y
    expect(length / bodyHeight).toBeGreaterThan(1.6)
    expect(length / width).toBeGreaterThan(2)
    // The fore paws stretch forward well beyond the chest front (chest face
    // at x ≈ 0.39): the +x extreme is the paw tips.
    expect(b.max.x).toBeGreaterThan(0.7)
    // Distinctly more parts than the old three-box stand-in (72 vertices).
    expect(geo.attributes.position.count).toBeGreaterThan(200)
    geo.dispose()
  })

  it('the Sphinx stands buried to the shoulders, as it did in 1890 (point 279)', () => {
    // Until Baraize's 1925-36 excavation the body lay under the sand: Caviglia
    // cleared the chest in 1817 and Mariette in 1853, and both times the sand
    // took it back. A ~1890 expedition sees a head and nemes out of a drift.
    // The regression this pins is the modern postcard — the freestanding lion
    // the builder used to make, which also mounted at 13x as Cairo's skyline.
    const geo = buildSphinx()
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    let minY = Infinity
    let maxY = -Infinity
    let aboveMinX = Infinity
    let aboveMaxX = -Infinity
    let above = 0
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i)
      const y = pos.getY(i)
      if (y < minY) minY = y
      if (y > maxY) maxY = y
      // Count only what genuinely clears the sand, not the drift's own rim.
      if (y > 0.09) {
        above += 1
        if (x < aboveMinX) aboveMinX = x
        if (x > aboveMaxX) aboveMaxX = x
      }
    }
    // The body really is sunk, not merely shortened.
    expect(minY).toBeLessThanOrEqual(-SPHINX_BURIAL_DEPTH + 1e-6)
    // Something still stands proud — the head under its nemes.
    expect(above).toBeGreaterThan(0)
    expect(maxY).toBeGreaterThan(0.2)
    // And it is only the HEAD: what clears the sand spans a small part of the
    // lion's length, near the front, nowhere near the paws out at x > 0.7.
    expect(aboveMaxX - aboveMinX).toBeLessThan(0.35)
    expect(aboveMaxX).toBeLessThan(0.6)
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

  it('the Sudd reads as a lobed marsh reaching along its riverward axis (point 189)', () => {
    const geo = buildWetland()
    geo.computeBoundingBox()
    const b = geo.boundingBox
    expect(b).toBeTruthy()
    if (!b) return
    // Elongated along +z (the riverward tongue the scene aims at the channel),
    // clearly wider than the old 4.2-unit detached pond disc — while staying
    // inside the shared < 6-unit travel-marker footprint of the family.
    expect(b.max.z - b.min.z).toBeGreaterThan(5)
    expect(b.max.x - b.min.x).toBeGreaterThan(4.2)
    expect(b.max.z).toBeGreaterThan(2.6) // the tongue actually reaches riverward
    // Marsh, not pond: a dense papyrus cover (each papyrus adds many vertices —
    // the count is far above the six flat sheets alone).
    expect(geo.attributes.position.count).toBeGreaterThan(2000)
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
