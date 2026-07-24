// Landmark geometry builders (design.md §4.4): every builder yields a
// non-empty, vertex-colored geometry; the two shape-critical ones are pinned
// by their proportions (Table Mountain's flat wide profile, the minaret is
// covered live via the mosque dwelling in the polish suite).
import * as THREE from 'three'
import { describe, it, expect } from 'vitest'
import {
  buildMeroePyramids,
  MEROE_PYRAMIDS,
  buildGizaPyramids,
  buildSphinx,
  SPHINX_BURIAL_DEPTH,
  buildStoneCity,
  buildRockChurches,
  buildCoastalRuins,
  buildStelae,
  buildCastles,
  GONDAR_PARAPET,
  GONDAR_TOWER_HEIGHTS,
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

  it('most of Meroë stands broken-topped, as the treasure hunters left it (point 279)', () => {
    // Ferlini dismantled Amanishakheto's pyramid from the top down in 1834 and
    // Lepsius recorded in 1844 that the treasure fever "has brought many a
    // pyramid to ruin" — ~40 Nubian pyramids lost their tops, and the pointed
    // apexes of the modern photograph are 20th-century reconstruction. The
    // regression this pins is the six clean sharp cones the builder used to
    // make.
    const broken = MEROE_PYRAMIDS.filter((p) => p.standing < 1)
    expect(broken.length).toBeGreaterThanOrEqual(4) // most, not all
    expect(MEROE_PYRAMIDS.length - broken.length).toBeGreaterThanOrEqual(1) // some left whole
    // None cut so low that the steep Nubian silhouette stops reading.
    for (const p of broken) expect(p.standing).toBeGreaterThan(0.5)

    // And the geometry really is cut: nothing over a broken pyramid's own
    // footprint reaches its original apex height (not the crown blocks, not
    // the standing corner), while an untouched one still carries its point.
    const geo = buildMeroePyramids()
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const topOver = (p: (typeof MEROE_PYRAMIDS)[number]) => {
      let top = 0
      for (let i = 0; i < pos.count; i++) {
        if (Math.hypot(pos.getX(i) - p.x, pos.getZ(i) - p.z) > p.base * 0.6) continue
        top = Math.max(top, pos.getY(i))
      }
      return top
    }
    for (const p of broken) {
      const label = `broken pyramid at ${p.x.toFixed(1)}/${p.z.toFixed(1)}`
      expect(topOver(p), label).toBeLessThan(p.height - 0.3)
      // The stump is still a pyramid, not a stub.
      expect(topOver(p), label).toBeGreaterThan(p.height * 0.5)
    }
    for (const p of MEROE_PYRAMIDS.filter((q) => q.standing >= 1)) {
      expect(topOver(p), `intact pyramid at ${p.x.toFixed(1)}/${p.z.toFixed(1)}`).toBeGreaterThan(p.height - 0.01)
    }
    geo.dispose()
  })

  it('Gondar stands as the burnt ruin the Mahdists left in 1888 (point 279)', () => {
    // Mahdist forces sacked and burned Gondar in January 1888, two years
    // before the expedition sets out; the intact parapets and conical tower
    // caps of the modern photograph are 20th-century restoration. The
    // regression this pins is the maintained castle the builder used to make:
    // a solid keep, an unbroken eight-merlon parapet, both tower roofs on.
    expect(GONDAR_PARAPET.some((m) => m === 0), 'merlons knocked out').toBe(true)
    const standing = GONDAR_PARAPET.filter((m) => m > 0)
    expect(new Set(standing).size, 'the surviving merlons stand unevenly').toBeGreaterThan(1)

    const geo = buildCastles()
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const topOver = (x: number, z: number, r: number) => {
      let top = 0
      for (let i = 0; i < pos.count; i++) {
        if (Math.hypot(pos.getX(i) - x, pos.getZ(i) - z) > r) continue
        top = Math.max(top, pos.getY(i))
      }
      return top
    }
    // The keep is open to the sky: over its middle there is only the burnt-out
    // floor, no roof slab and no solid block reaching the wall tops.
    expect(topOver(0, 0, 0.3), 'the keep has no roof').toBeLessThan(0.3)
    // Neither tower carries a cap: nothing rises over the tower axis beyond
    // its own broken rim (the removed cones added 0.42 above the shell).
    GONDAR_TOWER_HEIGHTS.forEach((h, i) => {
      const [tx, tz] = i === 0 ? [0.95, 0.55] : [-0.95, -0.55]
      expect(topOver(tx, tz, 0.12), `tower ${i} is roofless`).toBeLessThan(h + 0.05)
    })
    // The two towers do not stand level — one lost its upper courses.
    expect(GONDAR_TOWER_HEIGHTS[0]).not.toBe(GONDAR_TOWER_HEIGHTS[1])
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
