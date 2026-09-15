import { describe, expect, it } from 'vitest'
import { clearOfSpoil, digEarthFlight, DIG_ARRIVE_RADIUS, DIG_RIM_DISTANCE, digLocalToWorld, digStandingPlaces, placeGroundHeight, spoilCentre, spoilHeightAt, SPOIL_RADIUS_X } from './placeGround'
import type { DigSite } from './adultWork'
import { bankGroundHeight, buildRiverBank } from './riverBank'
import { placeById } from '../../world/geo'

const site: DigSite = { x: 8, z: -9, kind: 'pit' }
const full = { dug: 18, strikes: 12, completed: true }

describe('one walkable place surface', () => {
  it('is exactly flat beyond excavation footprints, including after work', () => {
    const ground = { bank: null, sites: [site], progress: [full] }
    for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) {
      if (clearOfSpoil(site, x, z, 0)) expect(placeGroundHeight(ground, x, z)).toBe(0)
    }
    expect(placeGroundHeight({ ...ground, sites: [] }, site.x, site.z)).toBe(0)
  })

  it('carries a crossing up and down a continuous mound with no edge step', () => {
    const c = spoilCentre(site)
    const ground = { bank: null, sites: [site], progress: [full] }
    expect(placeGroundHeight(ground, c.x, c.z)).toBeCloseTo(0.54)
    let last = 0
    let peak = 0
    for (let x = -SPOIL_RADIUS_X - 0.1; x <= SPOIL_RADIUS_X + 0.1; x += 0.01) {
      const p = digLocalToWorld(site, 1.65 + x, 0)
      const h = placeGroundHeight(ground, p.x, p.z)
      expect(Math.abs(h - last)).toBeLessThan(0.009)
      peak = Math.max(peak, h)
      last = h
    }
    expect(peak).toBeGreaterThan(0.53)
    expect(last).toBe(0)
    expect(spoilHeightAt(site, undefined, c.x, c.z)).toBeLessThan(peak)
  })

  it('preserves the existing river profile', () => {
    const bank = buildRiverBank(placeById('bambara-village'), 28)
    expect(bank).not.toBeNull()
    if (!bank) return
    for (let d = 0; d < bank.distance + 4; d += 0.2) {
      const x = bank.nx * d
      const z = bank.nz * d
      expect(placeGroundHeight({ bank, sites: [], progress: [] }, x, z)).toBe(bankGroundHeight(bank, x, z))
    }
  })
})

describe('the digging pair works from the rim', () => {
  it('clears the full-grown spoil and each other at every site orientation, including arrival slack', () => {
    for (const kind of ['pit', 'postHole', 'patch'] as const) for (let x = -8; x < 8; x += 0.3) {
      const s = { x, z: 3, kind }
      const spots = digStandingPlaces(s, () => true)!
      expect(spots).not.toBeNull()
      expect(Math.hypot(spots[0].x - spots[1].x, spots[0].z - spots[1].z)).toBeGreaterThan(1.3)
      for (const p of spots) {
        expect(Math.hypot(p.x - s.x, p.z - s.z)).toBeCloseTo(DIG_RIM_DISTANCE)
        for (let a = 0; a < 7; a += 0.2) {
          expect(clearOfSpoil(s, p.x + Math.cos(a) * DIG_ARRIVE_RADIUS, p.z + Math.sin(a) * DIG_ARRIVE_RADIUS, 0.35)).toBe(true)
        }
      }
    }
  })

  it('declines a bout when the fabric cannot give two safe places', () => {
    expect(digStandingPlaces(site, () => false)).toBeNull()
    const first = digStandingPlaces(site, () => true)![0]
    expect(digStandingPlaces(site, (x, z) => Math.hypot(x - first.x, z - first.z) < 0.1)).toBeNull()
  })
})

it('throws earth onto the full-grown mound for both excavation sizes', () => {
  for (const kind of ['pit', 'patch'] as const) for (let clod = 0; clod < 6; clod++) {
    const s = { ...site, kind }
    const start = digEarthFlight(s, full, 0, clod)
    const air = digEarthFlight(s, full, 0.36, clod)
    const end = digEarthFlight(s, full, 0.72, clod)
    const world = digLocalToWorld(s, end.x, end.z)
    expect(start.y).toBe(0.12)
    expect(air.y).toBeGreaterThan(end.y)
    expect(end.y).toBeCloseTo(spoilHeightAt(s, full, world.x, world.z))
    expect(end.y).toBeGreaterThan(0.4)
  }
})

it('uses the layout-selected orientation for the heap and work positions', () => {
  const s = { ...site, rotation: 0 }
  expect(spoilCentre(s)).toEqual({ x: s.x + 1.65, z: s.z })
  const pair = digStandingPlaces(s, () => true)!
  expect(pair.every((p) => p.x < s.x)).toBe(true)
})
