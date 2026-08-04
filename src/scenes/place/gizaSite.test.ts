// The walkable Giza monument site (design.md §4.4, point 273; docs/
// giza-1890.md): the pure layout, the collidable monument masses and the
// site-scale geometry's ~1890 casing cues, plus the Giza-vs-Meroë contrast.

import { beforeAll, describe, expect, it } from 'vitest'
import {
  GIZA_PYRAMIDS,
  GIZA_SITE_RADIUS,
  GIZA_SLOPE,
  GIZA_SPAWN_Z,
  GIZA_SPHINX,
  buildGizaLayout,
  gizaColliders,
  pyramidFootprint,
} from './gizaSite'
import {
  BACKDROP_HEIGHT,
  BACKDROP_INNER_OFFSET,
  BACKDROP_OUTER,
  BACKDROP_SCALE,
  GROUND_DISC_OVERHANG,
  PANORAMA_RADIUS,
  PANORAMA_RING_CLEARANCE,
  openPlainWalkRadius,
} from './backdrop'
import { spawnPointFree, standingClear, WALKER_RADIUS } from './collision'
import { balance } from '../../config/balance'
import { GIZA_PLATEAU } from '../../world/data/gizaPlateau'
import { sampleTerrain } from '../../world/terrain'
import { setupGeodata } from '../../test/geodata'
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
    // PlaceScene spawns the traveller at (0, layout.spawnZ) facing north.
    expect(layout.spawnZ).toBe(GIZA_SPAWN_Z)
    expect(standingClear(layout.colliders, 0, layout.spawnZ, 0.35)).toBe(true)
  })

  it('keeps the arrival distance to the pyramid row as the disc grows (point 390)', () => {
    // The disc was widened so the desert has room; the APPROACH must not widen
    // with it, or entering would drop the traveller far out in empty sand with
    // the monuments shrunk on the horizon. The spawn therefore carries its own
    // value instead of `radius − 10`.
    const layout = buildGizaLayout(7)
    expect(layout.spawnZ).toBeLessThan(layout.radius - 20)
    // Still south of the whole cluster, looking north over the row.
    const southmost = Math.max(...GIZA_PYRAMIDS.map((p) => p.z + pyramidFootprint(p.base)))
    expect(layout.spawnZ).toBeGreaterThan(southmost + 10)
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

describe('Giza site — the walkable sand reaches as far as the picture offers it (point 390)', () => {
  const SEED = 42
  const EYE = 1.5

  beforeAll(async () => {
    // The open-plain sweep classifies the drawn surroundings, which needs the
    // real DEM/vector geodata the browser loads via canvas.
    await setupGeodata()
  })

  /**
   * The measurement the radius rests on: from the site centre, at eye height,
   * how far the DRAWN backdrop ground stays open land before the picture stops
   * offering it. The one honest break is water — the backdrop's relief cannot
   * serve, because it is a compressed miniature anchored to the disc edge and so
   * begins immediately past the plate at any radius.
   */
  function openSandRadii(seed: number, azCount = 720, step = 0.5): number[] {
    const { lat, lon } = GIZA_PLATEAU
    const out: number[] = []
    for (let ai = 0; ai < azCount; ai++) {
      const a = (ai / azCount) * Math.PI * 2
      let d = BACKDROP_OUTER
      for (let r = step; r <= BACKDROP_OUTER; r += step) {
        const smp = sampleTerrain(
          lat - Math.sin(a) * r * BACKDROP_SCALE,
          lon + Math.cos(a) * r * BACKDROP_SCALE,
          seed,
        )
        if (smp.type === 'water' || smp.type === 'ocean') {
          d = r
          break
        }
      }
      out.push(d)
    }
    return out
  }

  it('measures the drawn open sand: unbroken to the backdrop edge except the eastern Nile', () => {
    const radii = openSandRadii(SEED)
    const sorted = radii.slice().sort((a, b) => a - b)
    // The nearest break is the Nile's water band. Seed-independent (it comes
    // from the geodata, not the seeded detail noise) and the number the site
    // radius comment records.
    expect(sorted[0]).toBeGreaterThan(74)
    expect(sorted[0]).toBeLessThan(78)
    // It lies in the EASTERN arc (+x is east in place coordinates).
    const nearestAz = (radii.indexOf(sorted[0]) / radii.length) * 360
    expect(nearestAz > 300 || nearestAz < 100).toBe(true)
    // And it is a local feature, not the surroundings closing in: over half the
    // azimuths still run past 150, and a good quarter reach the backdrop's own
    // outer edge without ever leaving open land.
    expect(sorted[Math.floor(sorted.length / 2)]).toBeGreaterThan(150)
    expect(radii.filter((r) => r >= BACKDROP_OUTER).length / radii.length).toBeGreaterThan(0.25)
    // The relief is no boundary either: at eye height nothing around the site
    // rises above the traveller's own head inside the near field.
    const { lat, lon } = GIZA_PLATEAU
    const centerH = sampleTerrain(lat, lon, SEED).height
    let risen = 0
    for (let ai = 0; ai < 360; ai++) {
      const a = (ai / 360) * Math.PI * 2
      const r = GIZA_SITE_RADIUS + GROUND_DISC_OVERHANG
      const smp = sampleTerrain(lat - Math.sin(a) * r * BACKDROP_SCALE, lon + Math.cos(a) * r * BACKDROP_SCALE, SEED)
      if ((smp.height - centerH) * BACKDROP_HEIGHT > EYE) risen++
    }
    expect(risen).toBeLessThan(360 * 0.5)
  })

  it('takes the LARGEST radius the §2.5 panorama band affords, derived not guessed', () => {
    const ringSpan = balance.panoramaWildlife.ringInner + balance.panoramaWildlife.ringSpread
    expect(GIZA_SITE_RADIUS).toBe(openPlainWalkRadius(ringSpan))
    // The bound itself: the outermost drifting silhouette still stands clearly
    // in FRONT of the captured band, and one metre more would not.
    const ringOuter = (r: number) => r + BACKDROP_INNER_OFFSET + ringSpan
    expect(ringOuter(GIZA_SITE_RADIUS)).toBe(PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE)
    expect(ringOuter(GIZA_SITE_RADIUS + 1)).toBeGreaterThan(PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE)
    // The ground plate stays well inside the band it is drawn in front of.
    expect(GIZA_SITE_RADIUS + GROUND_DISC_OVERHANG).toBeLessThan(PANORAMA_RADIUS)
    // And the silhouettes never end up inside the walkable area (point 181).
    expect(GIZA_SITE_RADIUS + BACKDROP_INNER_OFFSET + balance.panoramaWildlife.ringInner).toBeGreaterThan(
      GIZA_SITE_RADIUS,
    )
  })

  it('leaves real desert past the monuments instead of a wall a few strides out', () => {
    // The reported defect: standing beside a pyramid, the sand ran unbroken to
    // the horizon while the edge fell ~18 m past the outermost mass — a wall a
    // few strides out. It is now ~56 m of open desert.
    const cluster = Math.max(
      ...GIZA_PYRAMIDS.map((p) => Math.hypot(p.x, p.z) + pyramidFootprint(p.base)),
      Math.hypot(GIZA_SPHINX.x, GIZA_SPHINX.z) + GIZA_SPHINX.scale * 0.6,
    )
    expect(GIZA_SITE_RADIUS - cluster).toBeGreaterThan(50)
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
