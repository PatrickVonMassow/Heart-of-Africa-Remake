// The walkable Giza monument site (design.md §4.4, point 273; docs/
// giza-1890.md): the pure layout, the collidable monument masses and the
// site-scale geometry's ~1890 casing cues, plus the Giza-vs-Meroë contrast.

import { describe, expect, it } from 'vitest'
import {
  GIZA_PYRAMIDS,
  GIZA_SITE_RADIUS,
  GIZA_SLOPE,
  GIZA_SPHINX,
  buildGizaLayout,
  gizaColliders,
  pyramidFootprint,
} from './gizaSite'
import { spawnPointFree, standingClear, WALKER_RADIUS } from './collision'
import { buildGizaSiteMonuments, MEROE_PYRAMIDS, SPHINX_BURIAL_DEPTH } from '../../render/landmarks'

const byId = (id: string) => GIZA_PYRAMIDS.find((p) => p.id === id)!

describe('Giza site — the three great pyramids and the Sphinx (docs/giza-1890.md)', () => {
  it('has exactly the three great pyramids in a SW-diagonal row', () => {
    expect(GIZA_PYRAMIDS.map((p) => p.id)).toEqual(['khufu', 'khafre', 'menkaure'])
    const khufu = byId('khufu')
    const khafre = byId('khafre')
    const menkaure = byId('menkaure')
    // Khufu in the NE (+x east, −z north), Menkaure in the SW — the real row.
    expect(khufu.x).toBeGreaterThan(khafre.x)
    expect(khufu.z).toBeLessThan(khafre.z)
    expect(menkaure.x).toBeLessThan(khafre.x)
    expect(menkaure.z).toBeGreaterThan(khafre.z)
  })

  it('sizes them right: Khufu the largest mass, Menkaure much smaller (~0.44×)', () => {
    const khufu = byId('khufu')
    const menkaure = byId('menkaure')
    expect(khufu.base).toBeGreaterThan(byId('khafre').base)
    expect(byId('khafre').base).toBeGreaterThan(menkaure.base)
    const ratio = menkaure.base / khufu.base
    expect(ratio).toBeGreaterThan(0.35)
    expect(ratio).toBeLessThan(0.55)
  })

  it('makes Khafre read as tall as Khufu on its higher bedrock', () => {
    const khufu = byId('khufu')
    const khafre = byId('khafre')
    // Khafre is built a touch lower but stands on a bedrock plinth, so its
    // total apex height reaches Khufu's (the real plateau trick).
    expect(khafre.ground).toBeGreaterThan(0)
    expect(khafre.ground + khafre.height).toBeGreaterThanOrEqual(khufu.ground + khufu.standing * khufu.height)
  })

  it('carries the period cues: blunt Khufu, Khafre cap, Menkaure granite skirt', () => {
    expect(byId('khufu').standing).toBeLessThan(1) // apex quarried away → blunt top
    expect(byId('khufu').cap).toBe(false)
    expect(byId('khafre').cap).toBe(true) // the one surviving casing cap
    expect(byId('khafre').standing).toBe(1)
    expect(byId('menkaure').skirt).toBe(true) // red-granite lower casing
    expect(byId('khafre').skirt).toBe(false)
  })

  it('stays clearly flatter than the steep Meroë (Nubian) pyramids', () => {
    // Giza ~52° (height ≈ 1.28·base) vs Meroë ~70° (height ≈ 2.6·base): the two
    // must never be mistaken (docs/giza-1890.md §2).
    expect(GIZA_SLOPE).toBeCloseTo(1.28, 2)
    for (const p of GIZA_PYRAMIDS) expect(p.height / p.base).toBeCloseTo(GIZA_SLOPE, 5)
    const meroeMin = Math.min(...MEROE_PYRAMIDS.map((m) => m.height / m.base))
    expect(meroeMin).toBeGreaterThan(2) // every Meroë cone steeper than any Giza mass
    expect(Math.max(...GIZA_PYRAMIDS.map((p) => p.height / p.base))).toBeLessThan(meroeMin)
  })
})

describe('Giza site — collision and the walkable layout', () => {
  it('makes each pyramid and the Sphinx a solid collidable mass', () => {
    const colliders = gizaColliders()
    // Three oriented pyramid boxes + one Sphinx circle.
    expect(colliders.filter((c) => c.kind === 'box').length).toBe(3)
    expect(colliders.filter((c) => c.kind !== 'box').length).toBe(1)
    // A point at each pyramid's centre is blocked (inside the mass).
    for (const p of GIZA_PYRAMIDS) {
      expect(standingClear(colliders, p.x, p.z, WALKER_RADIUS)).toBe(false)
    }
    expect(standingClear(colliders, GIZA_SPHINX.x, GIZA_SPHINX.z, WALKER_RADIUS)).toBe(false)
  })

  it('the footprint half-extent matches the 45°-rotated base square', () => {
    expect(pyramidFootprint(10)).toBeCloseTo(10 * Math.SQRT1_2, 6)
  })

  it('builds a bare walkable disc: no huts, no lanes, only the monuments', () => {
    const layout = buildGizaLayout(7)
    expect(layout.radius).toBe(GIZA_SITE_RADIUS)
    expect(layout.interactives).toHaveLength(0)
    expect(layout.dwellings).toHaveLength(0)
    expect(layout.paths).toHaveLength(0)
    expect(layout.fences).toHaveLength(0)
    expect(layout.colliders.length).toBeGreaterThan(0)
  })

  it('keeps the southern spawn point clear of every monument', () => {
    const layout = buildGizaLayout(7)
    // PlaceScene spawns the traveller at (0, radius − 10) facing north.
    expect(standingClear(layout.colliders, 0, layout.radius - 10, 0.35)).toBe(true)
  })

  it('every ambient anchor stands on free ground it can also leave (point 155)', () => {
    const layout = buildGizaLayout(7)
    expect(layout.errands.length).toBeGreaterThan(0)
    for (const [x, z] of layout.errands) {
      expect(spawnPointFree(layout.colliders, x, z, WALKER_RADIUS)).toBe(true)
    }
  })

  it('the whole cluster fits inside the walkable radius with room to walk around', () => {
    for (const p of GIZA_PYRAMIDS) {
      const reach = Math.hypot(p.x, p.z) + pyramidFootprint(p.base)
      expect(reach).toBeLessThan(GIZA_SITE_RADIUS - 8)
    }
  })
})

describe('Giza site — the site-scale monument geometry', () => {
  it('renders the pyramids tall and the Sphinx buried below the sand line', () => {
    const geo = buildGizaSiteMonuments()
    geo.computeBoundingBox()
    const b = geo.boundingBox!
    // The pyramids stand well above person height (giant masses).
    expect(b.max.y).toBeGreaterThan(15)
    // The Sphinx is sunk to the shoulders — the merged field reaches below the
    // ground (buildSphinx's SPHINX_BURIAL_DEPTH, scaled up).
    expect(b.min.y).toBeLessThan(-SPHINX_BURIAL_DEPTH)
  })

  it("carries Khafre's pale casing cap only near Khafre's own apex", () => {
    // Colours are stored LINEAR (THREE.Color converts the sRGB hex), so the
    // brightness sums sit lower than the hex reads: the tawny core peaks ~1.1
    // with jitter while the pale Tura cap stays above 1.6 (same convention as
    // the buildGizaPyramids test).
    const geo = buildGizaSiteMonuments()
    const pos = geo.attributes.position
    const col = geo.attributes.color
    const khafre = byId('khafre')
    let pale = 0
    for (let i = 0; i < pos.count; i++) {
      const bright = col.getX(i) + col.getY(i) + col.getZ(i)
      if (bright <= 1.6) continue
      pale++
      // High on the pyramid and near Khafre's footprint centre — nowhere else.
      expect(pos.getY(i), 'cap sits near the apex').toBeGreaterThan(khafre.ground + khafre.height * 0.6)
      expect(Math.hypot(pos.getX(i) - khafre.x, pos.getZ(i) - khafre.z), 'cap only on Khafre').toBeLessThan(khafre.base * 0.4)
    }
    expect(pale, 'a pale casing cap exists').toBeGreaterThan(0)
  })

  it("carries Menkaure's red-granite skirt only around Menkaure's base", () => {
    // Linear sums again: the granite band is the darkest thing on the plateau
    // (sum < 0.6) and red-dominant; the tawny core and Sphinx face sit above it.
    const geo = buildGizaSiteMonuments()
    const pos = geo.attributes.position
    const col = geo.attributes.color
    const menkaure = byId('menkaure')
    let granite = 0
    for (let i = 0; i < pos.count; i++) {
      const bright = col.getX(i) + col.getY(i) + col.getZ(i)
      if (bright >= 0.6) continue
      granite++
      expect(col.getX(i), 'red granite, not soot').toBeGreaterThan(col.getZ(i) * 1.5)
      expect(pos.getY(i), 'granite sits low at the base').toBeLessThan(menkaure.height * 0.4)
      expect(
        Math.hypot(pos.getX(i) - menkaure.x, pos.getZ(i) - menkaure.z),
        'granite only on Menkaure',
      ).toBeLessThan(menkaure.base * 1.2)
    }
    expect(granite, 'a red-granite skirt exists').toBeGreaterThan(0)
  })
})
