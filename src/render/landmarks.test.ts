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
  buildFieldSphinx,
  fieldSphinxLength,
  fieldSphinxAnchors,
  GIZA_FIELD_CORE_TONE,
  GIZA_FIELD_KHUFU_HEIGHT,
  buildStoneCity,
  buildRockChurches,
  buildCoastalRuins,
  buildStelae,
  AKSUM_EZANA_HEIGHT,
  AKSUM_MINOR_HEIGHTS,
  AKSUM_FALLEN_LENGTH,
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
import { SPHINX_FORM } from '../config/balance'

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
    // The field reaches just BELOW the ground: the Sphinx's drift runs its foot
    // under the sand line (src/world/sphinx.ts), never deeper than its floor.
    expect(b.min.y).toBeLessThan(0)
    expect(b.min.y).toBeGreaterThanOrEqual(-SPHINX_FORM.drift.sink * SPHINX_FORM.field.length - 1e-6)
    // Khufu (base half-extent 1.6, Old-Kingdom slope) peaks just under 2 at
    // its blunt 1890 top — a compact symbol: the field stands only ~4 world
    // units from Cairo's marker.
    expect(b.max.y).toBeGreaterThan(1.7)
    expect(b.max.y).toBeLessThan(3)
    const footprint = Math.max(b.max.x - b.min.x, b.max.z - b.min.z)
    expect(footprint).toBeGreaterThan(3.5)
    expect(footprint).toBeLessThan(8)
    geo.dispose()
  })

  it("Giza carries its 1890 casing cues at skyline scale: blunt Khufu, Khafre's pale cap, no Menkaure error band (point 273)", () => {
    // docs/giza-1890.md §1.1-§1.2/§3: all three lost their smooth Tura casing
    // to centuries of quarrying; Khufu's apex and top courses are gone (a
    // small flat platform, not a point); Khafre ALONE keeps a cap of original
    // smooth casing near its apex — the single most useful visual cue on the
    // plateau. Menkaure's lower courses ARE red Aswan granite in reality, but
    // at this distant skyline / bird's-eye scale the smallest pyramid subtends
    // a few pixels and a red base band read as a floating error stripe (user
    // report, point 273), so it is carried ONLY by the close-range walkable-
    // site geometry. This test pins BOTH the original regression (three
    // identical tawny sharp cones) and the new one (no red band at skyline).
    const geo = buildGizaPyramids()
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    const col = geo.getAttribute('color') as THREE.BufferAttribute
    // Khufu (NE, largest): cut short of its built apex and closed FLAT — a
    // summit platform of several vertices OFF the axis, not a single point.
    const khufuFull = 1.6 * 0.64 * 2
    let khufuTop = 0
    let platform = 0
    for (let i = 0; i < pos.count; i++) {
      if (Math.hypot(pos.getX(i) - 1.3, pos.getZ(i) + 1.3) > 1.7) continue
      khufuTop = Math.max(khufuTop, pos.getY(i))
    }
    expect(khufuTop, 'the top courses are gone').toBeLessThan(khufuFull - 0.08)
    expect(khufuTop, 'still nearly full height').toBeGreaterThan(khufuFull * 0.85)
    for (let i = 0; i < pos.count; i++) {
      const d = Math.hypot(pos.getX(i) - 1.3, pos.getZ(i) + 1.3)
      if (d > 0.04 && d < 0.3 && pos.getY(i) > khufuTop - 0.01) platform++
    }
    expect(platform, 'a flat platform, not a point').toBeGreaterThanOrEqual(4)
    // Khafre (centre): the pale smooth casing cap exists — and ONLY near
    // Khafre's own apex, nowhere else on the plateau. Colours are stored
    // LINEAR (THREE.Color converts the sRGB hex), so the brightness sums sit
    // lower than the hex reads: the tawny core peaks ~1.2 with jitter while
    // the pale cap stays above 2.0.
    const khafreH = 1.5 * 0.64 * 2
    // The field Sphinx is judged by its own tests (src/render/sphinx.test.ts):
    // its footprint is discounted here.
    const sphinxGeo = buildFieldSphinx('landmark')
    sphinxGeo.computeBoundingBox()
    const sb = sphinxGeo.boundingBox!
    sphinxGeo.dispose()
    const inSphinx = (i: number) =>
      pos.getX(i) >= sb.min.x - 1e-6 && pos.getX(i) <= sb.max.x + 1e-6 && pos.getZ(i) >= sb.min.z - 1e-6 && pos.getZ(i) <= sb.max.z + 1e-6 && pos.getY(i) <= sb.max.y + 1e-6
    let pale = 0
    for (let i = 0; i < pos.count; i++) {
      const bright = col.getX(i) + col.getY(i) + col.getZ(i)
      if (bright <= 1.6 || inSphinx(i)) continue
      pale++
      expect(Math.hypot(pos.getX(i), pos.getZ(i)), 'pale casing only on Khafre').toBeLessThan(0.5)
      expect(pos.getY(i), 'pale casing only near the apex').toBeGreaterThan(khafreH * 0.7)
    }
    expect(pale, 'the casing cap exists').toBeGreaterThan(0)
    // Menkaure (SW, smallest): NO dark red band at skyline scale — the granite
    // casing is a close-range cue only (it read as a floating error stripe out
    // here). Nothing on the pyramids is both dark (linear sum < 0.6) and
    // red-dominant; the tawny cores sit brighter. The bird's-eye Sphinx's stone
    // IS drawn darker on purpose (its travel-scale emphasis, the limestone hue
    // kept: src/render/sphinx.test.ts), so its own vertices are discounted.
    const darkRed = (c: THREE.BufferAttribute) => {
      let n = 0
      for (let i = 0; i < c.count; i++) {
        const bright = c.getX(i) + c.getY(i) + c.getZ(i)
        if (bright < 0.6 && c.getX(i) > c.getZ(i) * 1.5) n++
      }
      return n
    }
    const sphinx = buildFieldSphinx('landmark')
    expect(darkRed(col), 'no red granite error band at skyline scale').toBe(darkRed(sphinx.getAttribute('color') as THREE.BufferAttribute))
    sphinx.dispose()
    geo.dispose()
  })

  it('the field Sphinx reads as a couchant figure under sand, east of Khafre (one definition)', () => {
    // The distant levels of the shared definition (src/world/sphinx.ts); its
    // own tests pin the burial, the head and the drift.
    for (const lod of ['landmark', 'skyline'] as const) {
      const geo = buildFieldSphinx(lod)
      geo.computeBoundingBox()
      const b = geo.boundingBox!
      const length = b.max.x - b.min.x
      const width = b.max.z - b.min.z
      // Couchant: much longer than tall, longer than wide (the bird's-eye
      // level's enlarged head and stone-only body make it a little taller).
      expect(length / b.max.y).toBeGreaterThan(lod === 'landmark' ? 2 : 2.5)
      expect(length / width).toBeGreaterThan(1.5)
      // East of Khafre (the field's centre), so the face looks away from it.
      expect(b.min.x).toBeGreaterThan(0)
      geo.dispose()
    }
  })

  it('the skyline Sphinx stands in its real proportion to Khufu, buried in its drift (owner verdict 11.11.2026)', () => {
    // ~20 m head height against Khufu's ~138.5 m: the crown within 0.12-0.17 of
    // Khufu's standing height, measured from the built geometry.
    const geo = buildFieldSphinx('skyline')
    geo.computeBoundingBox()
    const ratio = geo.boundingBox!.max.y / GIZA_FIELD_KHUFU_HEIGHT
    expect(ratio).toBeGreaterThan(0.12)
    expect(ratio).toBeLessThan(0.17)
    expect(ratio).toBeCloseTo(SPHINX_FORM.field.skylineCrownRatio, 2)
    // Smaller than the bird's-eye symbol, which is drawn enlarged.
    expect(fieldSphinxLength('skyline')).toBeLessThan(fieldSphinxLength('landmark'))
    geo.dispose()
  })

  it('the scenes draw the field Sphinx as its own mesh: the pyramids without it, its anchors on it', () => {
    for (const lod of ['landmark', 'skyline'] as const) {
      const all = buildGizaPyramids(lod)
      const bare = buildGizaPyramids(lod, false)
      const sphinx = buildFieldSphinx(lod)
      expect(bare.getAttribute('position').count + sphinx.getAttribute('position').count).toBe(all.getAttribute('position').count)
      sphinx.computeBoundingBox()
      const b = sphinx.boundingBox!
      const a = fieldSphinxAnchors(lod)
      // The crown is the mesh's top; the head's foot lies below it, on the body.
      expect(a.crown[1]).toBeCloseTo(b.max.y, 1)
      expect(a.headBase[1]).toBeLessThan(a.crown[1] * 0.6)
      for (const p of [a.crown, a.headBase]) {
        expect(p[0]).toBeGreaterThan(b.min.x)
        expect(p[0]).toBeLessThan(b.max.x)
      }
      for (const g of [all, bare, sphinx]) g.dispose()
    }
  })

  it("the skyline Sphinx's stone is in the pyramids' tone family, not a darker brown (owner verdict 11.11.2026, 11:02)", () => {
    // The skyline Sphinx's limestone, shaded by its level's emphasis, against
    // the pyramids' core: each channel within 15 % (linear), same hue order.
    const core = new THREE.Color(GIZA_FIELD_CORE_TONE)
    const stone = new THREE.Color(SPHINX_FORM.tones.limestone).multiplyScalar(SPHINX_FORM.emphasis.skyline.stoneShade)
    for (const k of ['r', 'g', 'b'] as const) expect(Math.abs(stone[k] - core[k]) / core[k], k).toBeLessThan(0.15)
    expect(stone.r).toBeGreaterThan(stone.g)
    expect(stone.g).toBeGreaterThan(stone.b)
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

  it('Aksum reads as 1890: one lone giant standing among fallen giants (point 279)', () => {
    // Of the three great royal stelae only King Ezana's still stood — "the
    // only one of the three major royal obelisks that was never broken"; the
    // 33 m Great Stele fell in antiquity and lay broken across the field, and
    // the obelisk the Italians later took to Rome lay fallen beside it. The
    // regression this pins is the inverted field the builder used to make:
    // three standing shafts of similar height and one fallen piece SMALLER
    // than any of them.
    // The lone giant clearly overtops every other standing stele...
    for (const mh of AKSUM_MINOR_HEIGHTS) expect(mh).toBeLessThan(AKSUM_EZANA_HEIGHT * 0.4)
    // ...and the fallen giant outmeasures even the standing one.
    expect(AKSUM_FALLEN_LENGTH).toBeGreaterThan(AKSUM_EZANA_HEIGHT)

    const geo = buildStelae()
    const pos = geo.getAttribute('position') as THREE.BufferAttribute
    let top = 0
    let tallOffAxis = 0
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i)
      top = Math.max(top, y)
      if (y > AKSUM_EZANA_HEIGHT * 0.45 && Math.hypot(pos.getX(i), pos.getZ(i)) > 0.35) tallOffAxis++
    }
    // The giant really stands at its height, and NOTHING off its own axis
    // rises anywhere near it — one lone giant, not a group of three.
    expect(top).toBeGreaterThan(AKSUM_EZANA_HEIGHT - 0.1)
    expect(tallOffAxis).toBe(0)
    // The fallen giant really lies built at its full span: lying material
    // sits at both ends of the fall line (midpoint 0.1/-0.9, bearing 0.5).
    const half = AKSUM_FALLEN_LENGTH / 2
    const ends: Array<[number, number]> = [
      [0.1 + Math.cos(0.5) * half, -0.9 - Math.sin(0.5) * half],
      [0.1 - Math.cos(0.5) * half, -0.9 + Math.sin(0.5) * half],
    ]
    for (const [ex, ez] of ends) {
      let lying = 0
      for (let i = 0; i < pos.count; i++) {
        if (pos.getY(i) > 0.45) continue
        if (Math.hypot(pos.getX(i) - ex, pos.getZ(i) - ez) < 0.3) lying++
      }
      expect(lying, `fallen material at ${ex.toFixed(1)}/${ez.toFixed(1)}`).toBeGreaterThan(0)
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
