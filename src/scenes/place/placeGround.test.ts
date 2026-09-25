import { describe, expect, it } from 'vitest'
import { atDigStand, clearOfSpoil, digEarthFlight, DIG_ARRIVE_RADIUS, DIG_RIM_DISTANCE, digLocalToWorld, digStandingPlaces, placeGroundHeight, spoilCentre, spoilHeightAt, SPOIL_RADIUS_X } from './placeGround'
import type { DigSite } from './adultWork'
import { looseRockTop } from './looseRocks'
import { ROCK_RADIUS_UNITS } from '../../render/flora'
import { bankGroundHeight, buildRiverBank } from './riverBank'
import { placeById } from '../../world/geo'
import { PLACE_RADIUS } from './layout'

const site: DigSite = { x: 8, z: -9, kind: 'pit' }
const full = { dug: 18, strikes: 12, completed: true }

describe('one walkable place surface', () => {
  it('is exactly flat beyond excavation footprints, including after work', () => {
    const ground = { bank: null, sites: [site], progress: [full], rocks: [] }
    for (let x = -30; x <= 30; x++) for (let z = -30; z <= 30; z++) {
      if (clearOfSpoil(site, x, z, 0)) expect(placeGroundHeight(ground, x, z)).toBe(0)
    }
    expect(placeGroundHeight({ ...ground, sites: [] }, site.x, site.z)).toBe(0)
  })

  it('carries a crossing up and down a continuous mound with no edge step', () => {
    const c = spoilCentre(site)
    const ground = { bank: null, sites: [site], progress: [full], rocks: [] }
    expect(placeGroundHeight(ground, c.x, c.z)).toBeCloseTo(0.8)
    let last = 0
    let peak = 0
    for (let x = -SPOIL_RADIUS_X - 0.1; x <= SPOIL_RADIUS_X + 0.1; x += 0.01) {
      const p = digLocalToWorld(site, 1.65 + x, 0)
      const h = placeGroundHeight(ground, p.x, p.z)
      expect(Math.abs(h - last)).toBeLessThan(0.013)
      peak = Math.max(peak, h)
      last = h
    }
    expect(peak).toBeGreaterThan(0.53)
    expect(last).toBe(0)
    expect(spoilHeightAt(site, undefined, c.x, c.z)).toBeLessThan(peak)
  })

  // WALKED-OVER STONES ARE PART OF THAT SAME SURFACE (work-order 1149): the
  // player and every villager read this one function, so a stone that raises
  // the ground here is a stone nobody snags on and nobody sinks into.
  it('carries the walk over a small stone and leaves the ground flat beside it', () => {
    const pebble: [number, number, number] = [4, 5, 0.4]
    const boulder: [number, number, number] = [-6, 2, 1]
    const ground = { bank: null, sites: [], progress: [], rocks: [pebble, boulder] }
    // The foot stands on the stone's own drawn top at its centre…
    expect(placeGroundHeight(ground, 4, 5)).toBeCloseTo(looseRockTop(0.4), 9)
    // …the rise ends with the silhouette…
    const r = ROCK_RADIUS_UNITS * 0.4
    expect(placeGroundHeight(ground, 4 + r, 5)).toBe(0)
    expect(placeGroundHeight(ground, 4, 5 + r + 0.01)).toBe(0)
    // …and a stone that stays an obstacle raises nothing at all.
    expect(placeGroundHeight(ground, -6, 2)).toBe(0)
    // Everywhere else the surface is exactly as flat as it was without stones.
    for (let x = -20; x <= 20; x++) for (let z = -20; z <= 20; z++) {
      if (Math.hypot(x - 4, z - 5) > r) expect(placeGroundHeight(ground, x, z)).toBe(0)
    }
  })

  it('carries the foot over the higher of two overlapping rises, never over their sum', () => {
    const a: [number, number, number] = [0, 0, 0.5]
    const b: [number, number, number] = [0.05, 0, 0.45]
    const ground = { bank: null, sites: [], progress: [], rocks: [a, b] }
    expect(placeGroundHeight(ground, 0, 0)).toBeCloseTo(looseRockTop(0.5), 9)
    expect(placeGroundHeight(ground, 0.025, 0)).toBeLessThan(looseRockTop(0.5) + looseRockTop(0.45))
  })

  it('preserves the existing river profile', () => {
    const bank = buildRiverBank(placeById('bambara-village'), PLACE_RADIUS)
    expect(bank).not.toBeNull()
    if (!bank) return
    for (let d = 0; d < bank.distance + 4; d += 0.2) {
      const x = bank.nx * d
      const z = bank.nz * d
      expect(placeGroundHeight({ bank, sites: [], progress: [], rocks: [] }, x, z)).toBe(bankGroundHeight(bank, x, z))
    }
  })
})

describe('the digging pair works from the rim', () => {
  it('clears the full-grown spoil and each other at every site orientation, including arrival slack', () => {
    for (const kind of ['pit', 'postHole', 'patch'] as const) for (let x = -8; x < 8; x += 0.3) {
      const s = { x, z: 3, kind }
      const spots = digStandingPlaces(s, () => true)!
      expect(spots).not.toBeNull()
      // Straight across the hole from each other wherever the ground allows
      // (work-order 1125), which on open ground is every orientation.
      expect(Math.hypot(spots[0].x - spots[1].x, spots[0].z - spots[1].z)).toBeCloseTo(DIG_RIM_DISTANCE * 2)
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
  const [one, other] = digStandingPlaces(s, () => true)!
  // The hole lies BETWEEN the two men (work-order 1125), and neither of them
  // stands on the heap's side of it.
  expect((one.x + other.x) / 2).toBeCloseTo(s.x)
  expect((one.z + other.z) / 2).toBeCloseTo(s.z)
  for (const p of [one, other]) {
    expect(p.x).toBeLessThanOrEqual(s.x)
    expect(clearOfSpoil(s, p.x, p.z)).toBe(true)
  }
})

it('keeps a body at the rim on the stroke and one away from the site off it', () => {
  const s = { ...site, rotation: 0 }
  const [one] = digStandingPlaces(s, () => true)!
  expect(atDigStand(s, one.x, one.z)).toBe(true)
  // The old 2.4 m approach stand is NOT a dig stand (work-order 1125).
  expect(atDigStand(s, s.x + 2.4, s.z)).toBe(false)
  expect(atDigStand(s, s.x, s.z)).toBe(true)
})
