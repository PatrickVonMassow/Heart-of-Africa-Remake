// Bird's-eye settlement entry (design.md §2.3): the candidate + Space-gate
// helpers. Entering is movement-based but confirmed with the Space use key —
// reaching the enter radius never enters on its own, and a water cell blocks it.
import { describe, it, expect } from 'vitest'
import {
  enterHintName,
  settlementCollisionRadius,
  settlementColliders,
  settlementEnterCandidate,
  settlementToEnter,
  shouldEnterSettlement,
  type EnterablePlace,
} from './settlementEntry'
import { de } from '../../i18n/de'
import { en } from '../../i18n/en'
import {
  KNOWN_FROM_START_PLACES,
  PLACES as GEO_PLACES,
  PORT_RIVER_CLEARANCE_DEG,
  UNITS_PER_DEGREE,
  latLonToWorld,
  placeById,
} from '../../world/geo'
import { RIVER_WIDTH_DEG } from '../../world/riverWidth'
import { resolveTravelMove } from '../../systems/movement'
import { balance } from '../../config/balance'

const PLACES: EnterablePlace[] = [
  { id: 'cairo', x: 0, z: 0 },
  { id: 'boma', x: 100, z: 100 },
]
const R = 2.5 // enter radius

describe('settlementEnterCandidate (design.md §2.3)', () => {
  it('names the settlement whose enter radius the traveller is within', () => {
    expect(settlementEnterCandidate(1, 0, PLACES, R, false)).toBe('cairo')
    expect(settlementEnterCandidate(101, 100, PLACES, R, false)).toBe('boma')
  })

  it('is null outside every enter radius', () => {
    expect(settlementEnterCandidate(50, 50, PLACES, R, false)).toBeNull()
    // Just past the radius: no candidate (exactly on the radius still counts).
    expect(settlementEnterCandidate(R + 0.01, 0, PLACES, R, false)).toBeNull()
    expect(settlementEnterCandidate(R, 0, PLACES, R, false)).toBe('cairo')
  })

  it('blocks entry on a water cell even inside the radius (river/lake guard)', () => {
    // On land the traveller could enter; the water guard turns it off so a
    // riverside village is never pulled in by a canoe drift (design.md §2.3).
    expect(settlementEnterCandidate(1, 0, PLACES, R, false)).toBe('cairo')
    expect(settlementEnterCandidate(1, 0, PLACES, R, true)).toBeNull()
  })
})

describe('shouldEnterSettlement (design.md §2.3)', () => {
  it('enters only on a real Space press, never automatically on radius', () => {
    // A candidate is present but no key was pressed → no entry (not auto-enter).
    expect(shouldEnterSettlement('cairo', false, false)).toBe(false)
    // The Space press confirms entry.
    expect(shouldEnterSettlement('cairo', true, false)).toBe(true)
  })

  it('never enters without a candidate', () => {
    expect(shouldEnterSettlement(null, true, false)).toBe(false)
  })

  it('is blocked while a dialog is open or the run is over (checkpoint safety)', () => {
    expect(shouldEnterSettlement('cairo', true, true)).toBe(false)
  })
})

describe('enterHintName — the enter hint hides an undiscovered name (points 287/318)', () => {
  it('shows the name for a discovered place', () => {
    expect(enterHintName(true, 'Cairo', en.unknownPlaces.port)).toBe('Cairo')
    expect(enterHintName(true, 'Maasai Village', en.unknownPlaces.village)).toBe('Maasai Village')
  })

  it('reads the kind placeholder for an undiscovered place, matching its §17.2 map label', () => {
    expect(enterHintName(false, 'Maasai Village', en.unknownPlaces.village)).toBe('Unknown village')
    expect(enterHintName(false, 'Kilimanjaro', de.unknownPlaces.mountain)).toBe('Unbekannter Berg')
    // The real name never leaks through the hint while undiscovered.
    expect(enterHintName(false, 'Maasai Village', en.unknownPlaces.village)).not.toContain('Maasai')
    // …and the placeholder is never the bare "?" it replaced (point 318).
    expect(enterHintName(false, 'Maasai Village', en.unknownPlaces.village)).not.toBe('?')
  })
})

describe('settlementToEnter — the press-time decision at the LIVE position (design.md §2.3)', () => {
  it('resolves against the position handed in NOW, not any earlier frame: a press right after a teleport onto the marker enters', () => {
    // The stale-candidate race: the last rendered frame stood far away (its
    // candidate was null), then the traveller teleported onto the marker and
    // Space landed before the next frame. Deriving from the live position must
    // enter — reading the frame-written candidate did nothing.
    expect(settlementToEnter(50, 50, PLACES, R, false, false)).toBeNull() // where the LAST frame stood
    expect(settlementToEnter(1, 0, PLACES, R, false, false)).toBe('cairo') // where the press LANDS
  })

  it('keeps the radius rule: a press outside every enter radius does nothing', () => {
    expect(settlementToEnter(R + 0.01, 0, PLACES, R, false, false)).toBeNull()
    expect(settlementToEnter(R, 0, PLACES, R, false, false)).toBe('cairo')
  })

  it('keeps the water guard: a press on a water cell never enters (river/lake passage)', () => {
    expect(settlementToEnter(1, 0, PLACES, R, true, false)).toBeNull()
  })

  it('keeps the block gate: an open dialog or a finished run never enters', () => {
    expect(settlementToEnter(1, 0, PLACES, R, false, true)).toBeNull()
  })
})

describe('the Giza monument site enters via the same Space pattern (point 273)', () => {
  const ENTERABLE: EnterablePlace[] = GEO_PLACES.map((p) => {
    const w = latLonToWorld(p.lat, p.lon)
    return { id: p.id, x: w.x, z: w.z }
  })
  const RR = balance.placeEnterRadius
  const world = (id: string) => {
    const p = latLonToWorld(placeById(id).lat, placeById(id).lon)
    return { x: p.x, z: p.z }
  }

  it('is a monument in the roster, discovered (known) from the start', () => {
    expect(placeById('giza').kind).toBe('monument')
    expect(KNOWN_FROM_START_PLACES).toContain('giza')
  })

  it('offers the Giza candidate within its enter radius and a Space press enters', () => {
    const g = world('giza')
    expect(settlementEnterCandidate(g.x, g.z, ENTERABLE, RR, false)).toBe('giza')
    expect(settlementToEnter(g.x, g.z, ENTERABLE, RR, false, false)).toBe('giza')
    // A water cell still blocks it, like every settlement (design.md §2.3).
    expect(settlementEnterCandidate(g.x, g.z, ENTERABLE, RR, true)).toBeNull()
  })

  it('never collides with Cairo: standing at one never enters the other', () => {
    const g = world('giza')
    const c = world('cairo')
    expect(settlementEnterCandidate(g.x, g.z, ENTERABLE, RR, false)).toBe('giza')
    expect(settlementEnterCandidate(c.x, c.z, ENTERABLE, RR, false)).toBe('cairo')
    // The two enter discs stay clear of each other (no ambiguous overlap).
    expect(Math.hypot(g.x - c.x, g.z - c.z)).toBeGreaterThan(2 * RR)
  })
})

describe('settlement collision in the bird\'s-eye view (design.md §11)', () => {
  const ENTERABLE: EnterablePlace[] = GEO_PLACES.map((p) => {
    const w = latLonToWorld(p.lat, p.lon)
    return { id: p.id, x: w.x, z: w.z }
  })
  const RR = balance.placeEnterRadius
  const CR = settlementCollisionRadius(RR, balance.placeCollisionFactor)
  const SELF = 0.5 // the traveller body radius the travel scene resolves with
  // Exactly the composition TravelScene uses: the one-way collider list fed to
  // the same swept resolver the tree/animal collision runs through.
  const resolve = (ox: number, oz: number, nx: number, nz: number) =>
    resolveTravelMove(ox, oz, nx, nz, settlementColliders(ox, oz, ENTERABLE, CR, SELF), SELF)
  const dist = (x: number, z: number, p: EnterablePlace) => Math.hypot(x - p.x, z - p.z)

  it('keeps the collision radius at or inside the enter radius (the entry balance)', () => {
    expect(CR).toBeLessThanOrEqual(RR)
    expect(CR).toBeGreaterThan(0)
    // A miscalibrated factor above 1 would stop the traveller before the enter
    // radius and no place could be entered — the resolver clamps it away.
    expect(settlementCollisionRadius(RR, 3)).toBe(RR)
    expect(settlementCollisionRadius(RR, -1)).toBe(0)
  })

  it('stays out of the river band every place keeps clear of (no deflected canoe)', () => {
    // The port clearance is the smaller of the two (geo.ts): the collider must
    // fit inside it, else a riverside settlement would push a passing canoe out
    // of its own channel.
    const portMarginUnits = (PORT_RIVER_CLEARANCE_DEG - RIVER_WIDTH_DEG) * UNITS_PER_DEGREE
    expect(CR).toBeLessThanOrEqual(portMarginUnits)
  })

  it('blocks a walk INTO every place of the roster, from every side, without tunnelling', () => {
    for (const p of ENTERABLE) {
      for (const angle of [0, Math.PI / 3, Math.PI / 2, Math.PI, (4 * Math.PI) / 3, (11 * Math.PI) / 6]) {
        const ux = Math.cos(angle)
        const uz = Math.sin(angle)
        // A deliberately FAST step: from outside, straight through and out the
        // far side in ONE move — it must be caught at the near edge. The reach
        // stays inside the nearest neighbouring place's distance (Cairo/Giza,
        // ~10.8 units), so this measures THIS place's collider only.
        const out = CR + 5
        const ox = p.x + ux * out
        const oz = p.z + uz * out
        const [nx, nz] = resolve(ox, oz, p.x - ux * out, p.z - uz * out)
        expect(dist(nx, nz, p)).toBeGreaterThanOrEqual(CR - 1e-6)
        // Caught on the NEAR side, never popped out beyond the marker.
        expect((nx - p.x) * ux + (nz - p.z) * uz).toBeGreaterThan(0)
      }
    }
  })

  it('leaves the traveller inside the enter radius where it stops him, so Space still enters', () => {
    for (const p of ENTERABLE) {
      const [nx, nz] = resolve(p.x + CR + 5, p.z, p.x, p.z)
      expect(dist(nx, nz, p)).toBeLessThanOrEqual(RR)
      expect(settlementToEnter(nx, nz, ENTERABLE, RR, false, false)).toBe(p.id)
    }
  })

  it('is ONE-WAY: a step from inside the footprint toward the outside is never blocked', () => {
    for (const p of ENTERABLE) {
      for (const angle of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) {
        const ux = Math.cos(angle)
        const uz = Math.sin(angle)
        // From the exact centre (a debug jump, a resumed snapshot, a legacy
        // save) and from just inside the boundary, straight out.
        for (const start of [0, CR * 0.9]) {
          const ox = p.x + ux * start
          const oz = p.z + uz * start
          const tx = p.x + ux * (CR + 6)
          const tz = p.z + uz * (CR + 6)
          const [nx, nz] = resolve(ox, oz, tx, tz)
          expect(nx).toBeCloseTo(tx, 6)
          expect(nz).toBeCloseTo(tz, 6)
        }
      }
    }
  })

  it('lets a walk PAST a place continue (only crossing in is blocked)', () => {
    const p = ENTERABLE[0]
    const [nx, nz] = resolve(p.x + 8, p.z - CR * 3, p.x - 8, p.z - CR * 3)
    expect(nx).toBeCloseTo(p.x - 8, 6)
    expect(nz).toBeCloseTo(p.z - CR * 3, 6)
  })

  it('drops the out-of-reach places from the per-frame collider list', () => {
    const p = ENTERABLE[0]
    // A normal step only ever sees the places it could reach this frame.
    expect(settlementColliders(p.x + 40, p.z, ENTERABLE, CR, SELF, 0.5)).toEqual([])
    expect(settlementColliders(p.x + CR + 0.4, p.z, ENTERABLE, CR, SELF, 0.5).length).toBe(1)
  })
})

describe('no two places\' enter radii overlap (entry is never ambiguous)', () => {
  it('holds for EVERY pair in the roster', () => {
    const pos = GEO_PLACES.map((p) => ({ id: p.id, ...latLonToWorld(p.lat, p.lon) }))
    const clash: string[] = []
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const d = Math.hypot(pos[i].x - pos[j].x, pos[i].z - pos[j].z)
        if (d <= 2 * balance.placeEnterRadius) clash.push(`${pos[i].id}/${pos[j].id} ${d.toFixed(2)}`)
      }
    }
    expect(clash).toEqual([])
  })

  it('names the closest pair, so a new place cannot silently crowd an old one', () => {
    const pos = GEO_PLACES.map((p) => ({ id: p.id, ...latLonToWorld(p.lat, p.lon) }))
    let min = Infinity
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++)
        min = Math.min(min, Math.hypot(pos[i].x - pos[j].x, pos[i].z - pos[j].z))
    // Cairo/Giza are the closest pair (point 273) and still stand well clear.
    expect(min).toBeGreaterThan(2 * balance.placeEnterRadius)
  })
})
