// The walkable Giza monument site (design.md §4.4, point 273; docs/
// giza-1890.md): the pure layout, the collidable monument masses and the
// site-scale geometry's ~1890 casing cues, plus the Giza-vs-Meroë contrast.

import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { appearanceFor, CAST_DRESS } from '../../systems/appearance'
import { garmentMeshName } from '../../render/villagerFigureBody'
import {
  GIZA_AMBIENT,
  GIZA_PYRAMIDS,
  gizaFigure,
  isGizaPerson,
  type GizaPersonRole,
  GIZA_SCALE,
  GIZA_SITE_RADIUS,
  GIZA_SPAWN_Z,
  GIZA_SPHINX,
  buildGizaLayout,
  gizaColliders,
  gizaSphinxColliders,
  pyramidFootprint,
  pyramidMassFootprint,
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
import { ringSpreadWithin } from './panoramaWildlife'
import { spawnPointFree, standingClear, WALKER_RADIUS } from './collision'
import { balance, GIZA_SITE_SCALE } from '../../config/balance'
import { GIZA_PLATEAU } from '../../world/data/gizaPlateau'
import { sampleTerrain } from '../../world/terrain'
import { setupGeodata } from '../../test/geodata'
import { buildGizaPyramids, buildGizaSiteMonuments, gizaSitePyramidParts, buildGizaSiteSphinx, fieldSphinxLength, MEROE_PYRAMIDS } from '../../render/landmarks'
import { onSphinxFootprint, sphinxDriftBounds } from '../../world/sphinx'

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
    // Giza on its real ~52-53° faces vs Meroë ~70°: the two must never be
    // mistaken (docs/giza-1890.md §2).
    for (const p of GIZA_PYRAMIDS) {
      const face = (Math.atan(p.height / pyramidFootprint(p.base)) * 180) / Math.PI
      expect(face).toBeGreaterThan(51)
      expect(face).toBeLessThan(54)
    }
    const meroeMin = Math.min(...MEROE_PYRAMIDS.map((m) => m.height / m.base))
    expect(meroeMin).toBeGreaterThan(2) // every Meroë cone steeper than any Giza mass
    expect(Math.max(...GIZA_PYRAMIDS.map((p) => p.height / p.base))).toBeLessThan(meroeMin)
  })
})

describe('Giza site — the monumental first-person scale (design.md §4.4)', () => {
  const real = GIZA_SITE_SCALE.real
  const EYE = 1.5
  const FOV_DEG = 50 // the default camera's vertical field of view (App.tsx)

  it('draws each pyramid at the stated fraction of its real side and height', () => {
    expect(GIZA_SCALE).toBe(0.2)
    for (const p of GIZA_PYRAMIDS) {
      const r = real[p.id]
      expect(2 * pyramidFootprint(p.base)).toBeCloseTo(r.side * GIZA_SCALE, 6)
      expect(p.height).toBeCloseTo(r.height * GIZA_SCALE, 6)
    }
    // Khafre's higher bedrock at the same fraction.
    expect(byId('khafre').ground).toBeCloseTo(real.khafre.bedrock * GIZA_SCALE, 6)
  })

  it('keeps the Sphinx at its stated fraction, never smaller than before', () => {
    expect(GIZA_SPHINX.length).toBeCloseTo(real.sphinxLength * GIZA_SITE_SCALE.sphinxFraction, 6)
    expect(GIZA_SPHINX.length).toBeGreaterThanOrEqual(20)
    // Real proportions are the yardstick: the Sphinx never drops below the
    // pyramids' fraction.
    expect(GIZA_SITE_SCALE.sphinxFraction).toBeGreaterThanOrEqual(GIZA_SCALE)
  })

  it('is markedly larger than the former site masses (Khufu 19.2 m on a 21.2 m side)', () => {
    const khufu = byId('khufu')
    expect(khufu.height).toBeGreaterThan(19.2 * 1.5)
    expect(2 * pyramidFootprint(khufu.base)).toBeGreaterThan(21.2 * 2)
  })

  it('puts every apex far above the frame top from the foot of its face', () => {
    for (const p of GIZA_PYRAMIDS) {
      // Standing against the drawn mass (plinth/skirt included) at its face centre.
      const d = pyramidMassFootprint(p) + 0.15 + WALKER_RADIUS
      const apex = p.ground + p.standing * p.height
      const elev = (Math.atan((apex - EYE) / d) * 180) / Math.PI
      expect(elev, p.id).toBeGreaterThan(FOV_DEG / 2 + 15)
    }
  })

  it('shows all three pyramids in one frame from the arrival point, none hidden', () => {
    const hfov = 2 * Math.atan(Math.tan(((FOV_DEG / 2) * Math.PI) / 180) * (16 / 9))
    const eye: [number, number, number] = [0, EYE, GIZA_SPAWN_Z]
    const apexOf = (p: (typeof GIZA_PYRAMIDS)[number]): [number, number, number] => [p.x, p.ground + p.standing * p.height, p.z]
    const bearings = GIZA_PYRAMIDS.map((p) => Math.atan2(p.x - eye[0], eye[2] - p.z))
    expect(Math.max(...bearings) - Math.min(...bearings)).toBeLessThan(hfov * 0.95)
    // Inside a drawn pyramid volume (cone on its ground, plinth below it).
    const inside = (q: (typeof GIZA_PYRAMIDS)[number], x: number, y: number, z: number) => {
      if (y < q.ground) return Math.max(Math.abs(x - q.x), Math.abs(z - q.z)) <= pyramidMassFootprint(q)
      const half = pyramidFootprint(q.base) * (1 - (y - q.ground) / q.height)
      return half > 0 && Math.max(Math.abs(x - q.x), Math.abs(z - q.z)) <= half
    }
    for (const p of GIZA_PYRAMIDS) {
      const a = apexOf(p)
      // The apex region (just below the summit) must be in sight.
      const target: [number, number, number] = [a[0], a[1] - 0.5, a[2]]
      for (let t = 0.02; t < 0.98; t += 0.005) {
        const x = eye[0] + (target[0] - eye[0]) * t
        const y = eye[1] + (target[1] - eye[1]) * t
        const z = eye[2] + (target[2] - eye[2]) * t
        for (const q of GIZA_PYRAMIDS) if (q !== p) expect(inside(q, x, y, z), `${p.id} hidden by ${q.id}`).toBe(false)
      }
    }
  })

  it('leaves the bird\'s-eye landmark and the Cairo skyline at their own scale (point 82)', () => {
    // Recorded from the field symbol before the site was enlarged: neither the
    // pyramids nor the Sphinx of the distant views may move.
    const want = {
      landmark: [-1.7657, -0.0375, -2.4314, 2.9125, 1.9354, 1.7657, 1.25],
      skyline: [-1.7657, -0.0246, -2.4314, 2.8237, 1.9354, 1.7657, 0.82005],
    }
    for (const lod of ['landmark', 'skyline'] as const) {
      const g = buildGizaPyramids(lod)
      g.computeBoundingBox()
      const b = g.boundingBox!
      const got = [b.min.x, b.min.y, b.min.z, b.max.x, b.max.y, b.max.z, fieldSphinxLength(lod)]
      got.forEach((v, i) => expect(v, `${lod}[${i}]`).toBeCloseTo(want[lod][i], 3))
    }
  })
})

describe('Giza site — collision and the walkable layout', () => {
  it('makes each pyramid and the Sphinx a solid collidable mass', () => {
    const colliders = gizaColliders()
    // Three oriented pyramid boxes + the Sphinx's footprint circles.
    expect(colliders.filter((c) => c.kind === 'box').length).toBe(3)
    expect(colliders.filter((c) => c.kind !== 'box').length).toBe(gizaSphinxColliders().length)
    // A point at each pyramid's centre is blocked (inside the mass).
    for (const p of GIZA_PYRAMIDS) {
      expect(standingClear(colliders, p.x, p.z, WALKER_RADIUS)).toBe(false)
    }
    expect(standingClear(colliders, GIZA_SPHINX.x, GIZA_SPHINX.z, WALKER_RADIUS)).toBe(false)
  })

  it('the footprint half-extent matches the 45°-rotated base square', () => {
    expect(pyramidFootprint(10)).toBeCloseTo(10 * Math.SQRT1_2, 6)
  })

  it("each pyramid's collider is its whole DRAWN mass, plinth and skirt included (point 378)", () => {
    // The reported bug: the box followed the cone alone, so the traveller
    // walked into Khafre's plinth and Menkaure's skirt.
    // Each pyramid's own drawn parts (cone, plinth, skirt), as the renderer builds them.
    const reach = GIZA_PYRAMIDS.map((p) => {
      let r = 0
      for (const part of gizaSitePyramidParts(p, 0)) {
        const pos = part.attributes.position
        for (let i = 0; i < pos.count; i++) r = Math.max(r, Math.abs(pos.getX(i) - p.x), Math.abs(pos.getZ(i) - p.z))
      }
      return r
    })
    const boxes = gizaColliders().filter((c) => c.kind === 'box')
    GIZA_PYRAMIDS.forEach((p, j) => {
      const box = boxes[j]
      expect(box.kind === 'box' && box.x === p.x && box.z === p.z).toBe(true)
      if (box.kind !== 'box') return
      // The collider's half extents (less the near-plane margin) are the drawn reach.
      expect(box.hx - 0.15, p.id).toBeCloseTo(reach[j], 3)
      expect(box.hz - 0.15, p.id).toBeCloseTo(reach[j], 3)
    })
    // Khafre's plinth and Menkaure's skirt really do reach past the bare cone.
    expect(reach[1]).toBeGreaterThan(pyramidFootprint(byId('khafre').base) * 1.1)
    expect(reach[2]).toBeGreaterThan(pyramidFootprint(byId('menkaure').base))
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
    const southmost = Math.max(...GIZA_PYRAMIDS.map((p) => p.z + pyramidMassFootprint(p)))
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
      const h = pyramidMassFootprint(p)
      const reach = Math.hypot(Math.abs(p.x) + h, Math.abs(p.z) + h) // the farthest corner
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
    const ringSpan = balance.panoramaWildlife.ringInner + balance.panoramaWildlife.openPlainRingSpread
    expect(GIZA_SITE_RADIUS).toBe(openPlainWalkRadius(ringSpan))
    // The bound itself: the outermost drifting silhouette still stands clearly
    // in FRONT of the captured band, and one metre more would not.
    const ringOuter = (r: number) => r + BACKDROP_INNER_OFFSET + ringSpan
    expect(ringOuter(GIZA_SITE_RADIUS)).toBe(PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE)
    expect(ringOuter(GIZA_SITE_RADIUS + 1)).toBeGreaterThan(PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE)
    // The silhouette ring there compresses to exactly that open-plain span.
    expect(
      ringSpreadWithin(GIZA_SITE_RADIUS + BACKDROP_INNER_OFFSET, balance.panoramaWildlife.ringInner, balance.panoramaWildlife.ringSpread, PANORAMA_RADIUS - PANORAMA_RING_CLEARANCE),
    ).toBe(balance.panoramaWildlife.openPlainRingSpread)
    // The ground plate stays well inside the band it is drawn in front of.
    expect(GIZA_SITE_RADIUS + GROUND_DISC_OVERHANG).toBeLessThan(PANORAMA_RADIUS)
    // And the silhouettes never end up inside the walkable area (point 181).
    expect(GIZA_SITE_RADIUS + BACKDROP_INNER_OFFSET + balance.panoramaWildlife.ringInner).toBeGreaterThan(
      GIZA_SITE_RADIUS,
    )
  })

  it('leaves open desert past the monuments instead of a wall a few strides out', () => {
    // The point-390 defect: standing beside a pyramid, the edge fell ~18 m past
    // the outermost mass. The monumental masses (design.md §4.4) now fill the
    // disc's diameter, so the margin is measured exactly — at the farthest
    // drawn corner — and must stay past that defect's distance. Away from the
    // NE/SW corners of the row the open sand runs much farther.
    const cluster = Math.max(
      ...GIZA_PYRAMIDS.map((p) => {
        const h = pyramidMassFootprint(p)
        return Math.hypot(Math.abs(p.x) + h, Math.abs(p.z) + h)
      }),
      ...gizaSphinxColliders().flatMap((c) => [Math.hypot(c.x1, c.z1) + c.r, Math.hypot(c.x2, c.z2) + c.r]),
    )
    expect(GIZA_SITE_RADIUS - cluster).toBeGreaterThan(17)
  })
})

describe('Giza site — the site-scale monument geometry', () => {
  it('renders the pyramids tall and the Sphinx as its own mesh, its drift running under the ground', () => {
    const geo = buildGizaSiteMonuments()
    geo.computeBoundingBox()
    // The pyramids stand far above person height (giant masses).
    expect(geo.boundingBox!.max.y).toBeGreaterThan(28)
    const sphinx = buildGizaSiteSphinx('standard')
    sphinx.computeBoundingBox()
    const b = sphinx.boundingBox!
    // The drift's foot crosses the ground; the head stands metres above it.
    expect(b.min.y).toBeLessThan(0)
    expect(b.max.y).toBeGreaterThan(4)
    // Its stone carries the banding attribute the site material reads.
    expect(sphinx.getAttribute('sphinxBand')).toBeTruthy()
  })

  it("the Sphinx's collidable mass is its drawn body (point 378)", () => {
    // Sample the drawn footprint in site metres: every point of it is inside a
    // collider, and no collider reaches past it by more than a stride's fraction.
    const capsules = gizaSphinxColliders()
    const L = GIZA_SPHINX.length
    const b = sphinxDriftBounds()
    const inCollider = (x: number, z: number) =>
      capsules.some((c) => {
        const dx = c.x2 - c.x1
        const dz = c.z2 - c.z1
        const t = Math.max(0, Math.min(1, ((x - c.x1) * dx + (z - c.z1) * dz) / (dx * dx + dz * dz || 1)))
        return Math.hypot(x - (c.x1 + t * dx), z - (c.z1 + t * dz)) <= c.r
      })
    const drawn = (x: number, z: number) => onSphinxFootprint((x - GIZA_SPHINX.x) / L, (z - GIZA_SPHINX.z) / L)
    // Sample the UNION of the drift's and the colliders' bounds (plus a margin),
    // so a collider overshooting the drift rectangle is caught too.
    const margin = 1
    const minX = Math.min(GIZA_SPHINX.x + b.minX * L, ...capsules.map((c) => Math.min(c.x1, c.x2) - c.r)) - margin
    const maxX = Math.max(GIZA_SPHINX.x + b.maxX * L, ...capsules.map((c) => Math.max(c.x1, c.x2) + c.r)) + margin
    const minZ = Math.min(GIZA_SPHINX.z + b.minZ * L, ...capsules.map((c) => Math.min(c.z1, c.z2) - c.r)) - margin
    const maxZ = Math.max(GIZA_SPHINX.z + b.maxZ * L, ...capsules.map((c) => Math.max(c.z1, c.z2) + c.r)) + margin
    let covered = 0
    for (let x = minX; x <= maxX; x += 0.2) {
      for (let z = minZ; z <= maxZ; z += 0.2) {
        if (drawn(x, z)) {
          covered++
          expect(inCollider(x, z), `drawn sand at (${x.toFixed(1)}, ${z.toFixed(1)}) collides`).toBe(true)
        } else if (inCollider(x, z)) {
          // Outside the drawn footprint, a collider may only overshoot its rim slightly.
          let near = false
          for (let a = 0; a < 16 && !near; a++) {
            const ang = (a / 16) * Math.PI * 2
            for (let d = 0.05; d <= 0.6 && !near; d += 0.05) near = drawn(x + Math.cos(ang) * d, z + Math.sin(ang) * d)
          }
          expect(near, `collider overshoot at (${x.toFixed(1)}, ${z.toFixed(1)})`).toBe(true)
        }
      }
    }
    expect(covered).toBeGreaterThan(100)
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

describe("Giza's people on the villagers' figure body (docs/giza-1890.md §4.1)", () => {
  const persons = GIZA_AMBIENT.filter((a) => isGizaPerson(a.role))
  const scene = readFileSync(resolve(process.cwd(), 'src/scenes/place/PlaceScene.tsx'), 'utf8')
  const ambient = scene.slice(scene.indexOf('function GizaAmbient('), scene.indexOf('// --- Scene ---'))

  it('draws every person through the shared Figure, at villager stature, and no hand-built body', () => {
    expect(ambient).toContain('<Figure ')
    // No scale prop: the stature is the villagers' (FIGURE_STATURE), the
    // donkey-boy smaller only by his age group.
    expect(/<Figure [^>]*scale=/.test(ambient)).toBe(false)
    expect(scene).not.toContain('RobedFigure')
    expect(ambient).toMatch(/useFigureLook\(placeId, GIZA_PALETTE, 'egyptian'\)/)
  })

  it('gives each role its cast, sex and age group', () => {
    const spec = persons.map((a) => ({ role: a.role, dragoman: a.dragoman, ...gizaFigure(a.role as GizaPersonRole, a.sex, a.dragoman) }))
    for (const s of spec) {
      if (s.role === 'donkeyboy') expect(s.age).toBe('youth')
      else expect(s.age).toBe('adult')
      expect(s.cast).toBe(s.role === 'tourist' ? 'european' : s.role === 'cameleer' ? 'bedouin' : s.dragoman ? 'dragoman' : 'egyptian')
    }
    // one of the guides is the tourists' dragoman
    expect(spec.filter((s) => s.cast === 'dragoman').map((s) => s.role)).toEqual(['guide'])
    // The tourists are a man in the sun helmet and a woman in her hat.
    const tourists = spec.filter((s) => s.role === 'tourist')
    expect(tourists.map((t) => [t.sex, t.hat]).sort()).toEqual([['female', 'ladyHat'], ['male', 'sunHelmet']])
  })

  it('dresses the locals in the galabiya and the tourists in Western dress', () => {
    const dress = (role: GizaPersonRole, sex?: 'female' | 'male', dragoman = false) => {
      const s = gizaFigure(role, sex, dragoman)
      return appearanceFor({ peopleId: s.cast, sex: s.sex, age: s.age, drivers: { coldness: 0, harmattan: 0, karif: 0 }, year: 1890, cloth: s.cloth, palette: [s.cloth], pick: 0.5 })
    }
    const forms = (role: GizaPersonRole, sex?: 'female' | 'male', dragoman = false) => dress(role, sex, dragoman).map((l) => l.form).sort()
    expect(forms('guide')).toEqual(['robe', 'turban'])
    expect(forms('guide', 'male', true)).toEqual(['robe', 'tarboosh'])
    expect(forms('cameleer')).toEqual(['hood', 'robe'])
    expect(forms('donkeyboy')).toEqual(['cap', 'robe'])
    // 1890 Western dress (§4.1): the man's jacket, long trousers and shoes, the
    // woman's long-sleeved gown to the ground and shoes; the brimmed hats are props
    expect(forms('tourist', 'male')).toEqual(['coat', 'shoes', 'trousersLong'])
    expect(forms('tourist', 'female')).toEqual(['gown', 'shoes'])
    const ids = (role: GizaPersonRole, sex?: 'female' | 'male', dragoman = false) => dress(role, sex, dragoman).map(garmentMeshName).sort()
    expect(ids('tourist', 'male')).toEqual(['g-coat-chest', 'g-shoes-feet', 'g-trousersLong-waist'])
    expect(ids('tourist', 'female')).toEqual(['g-gown-chest', 'g-shoes-feet'])
    expect(ids('guide', 'male', true)).toEqual(['g-robe-chest', 'g-tarboosh-crown'])
    expect(gizaFigure('tourist', 'male').hat).toBe('sunHelmet')
    expect(gizaFigure('tourist', 'female').hat).toBe('ladyHat')
    // The figure's own cloth colours the gown.
    expect(dress('guide').find((l) => l.form === 'robe')?.colour).toBe(gizaFigure('guide').cloth)
  })

  it('cites the Giza dress section that exists', () => {
    const doc = readFileSync(resolve(process.cwd(), 'docs/giza-1890.md'), 'utf8')
    expect(doc).toMatch(/^### 4\.1 The cast's dress/m)
    for (const table of Object.values(CAST_DRESS))
      for (const sex of ['male', 'female'] as const)
        for (const cell of Object.values(table[sex]))
          for (const l of cell) {
            const why = 'section' in l.source ? l.source.section : l.source.guess
            expect(why).toMatch(/giza-1890 §4\.1/)
          }
  })
})
