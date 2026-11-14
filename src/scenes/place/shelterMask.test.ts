import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { REGION_PLACE_STYLES } from './regionStyles'
import { buildLayout } from './layout'
import { hutRoofProfile, shedRoofProfile, HUT_CONE_EAVE } from './roofClearance'
import { bakeShelterMask, dripBand, edgeCover, placeShelters, roofEdgeDistance, shelterAt } from './shelterMask'

const PARAMS = { crownCover: 0.75, edgeSoftM: 0.45, dripOffsetM: 0.3, dripHalfWidthM: 0.35 }
const SIZE = 256
const EXTENT = 20

// One cone-roofed hut of radius 2 at (5, -3): its eave reaches 2 · 1.45 = 2.9 m.
const HUT = { ...hutRoofProfile('cone', 2, 2.5, false), x: 5, z: -3 }
const EAVE = 2 * HUT_CONE_EAVE

describe('bakeShelterMask — one hut', () => {
  const mask = bakeShelterMask([HUT], [], EXTENT, SIZE, PARAMS)
  const along = (d: number) => shelterAt(mask, HUT.x + d, HUT.z)

  it('is high under the roof footprint', () => {
    expect(along(0).cover).toBeGreaterThan(0.99)
    expect(along(EAVE - 1).cover).toBeGreaterThan(0.99)
  })

  it('falls off across a soft margin at the eave, not a hard edge', () => {
    const atRim = along(EAVE).cover
    expect(atRim).toBeGreaterThan(0.2)
    expect(atRim).toBeLessThan(0.8)
    // Monotone across the margin, with intermediate values on both sides.
    let prev = Infinity
    for (let d = EAVE - 0.6; d <= EAVE + 0.6; d += 0.1) {
      const c = along(d).cover
      expect(c).toBeLessThanOrEqual(prev + 1e-6)
      prev = c
    }
    expect(along(EAVE - 0.25).cover).toBeLessThan(1)
    expect(along(EAVE + 0.25).cover).toBeGreaterThan(0)
  })

  it('is zero well outside it', () => {
    expect(along(EAVE + 2).cover).toBe(0)
    expect(shelterAt(mask, -15, 15).cover).toBe(0)
  })

  it('carries a drip band just outside the eaves and nowhere else', () => {
    expect(along(EAVE + PARAMS.dripOffsetM).drip).toBeGreaterThan(0.5)
    expect(along(0).drip).toBe(0)
    expect(along(EAVE + 2).drip).toBe(0)
  })

  it('reads open ground past the grid and on its border ring', () => {
    expect(shelterAt(mask, 100, 0)).toEqual({ cover: 0, drip: 0 })
    for (let i = 0; i < SIZE; i++) {
      expect(mask.cover[i]).toBe(0)
      expect(mask.cover[(SIZE - 1) * SIZE + i]).toBe(0)
    }
  })
})

describe('bakeShelterMask — one tree crown', () => {
  const crown = { x: -6, z: 4, r: 2.5 }
  const mask = bakeShelterMask([], [crown], EXTENT, SIZE, PARAMS)
  const along = (d: number) => shelterAt(mask, crown.x, crown.z + d)

  it('is high under its radius, soft at the edge and zero well outside', () => {
    expect(along(0).cover).toBeCloseTo(PARAMS.crownCover, 2)
    expect(along(crown.r - 1).cover).toBeCloseTo(PARAMS.crownCover, 2)
    const atRim = along(crown.r).cover
    expect(atRim).toBeGreaterThan(0.1)
    expect(atRim).toBeLessThan(PARAMS.crownCover - 0.1)
    expect(along(crown.r + 2).cover).toBe(0)
  })

  it('drips no eave line', () => {
    expect(along(crown.r + PARAMS.dripOffsetM).drip).toBe(0)
  })
})

describe('roofEdgeDistance', () => {
  it('measures a rotated rectangle in its own frame', () => {
    const shed = shedRoofProfile({ x: 0, z: 0, rot: Math.PI / 2, r: 2, h: 2 })
    expect(shed.shape).toBe('rect')
    // Rotated a quarter turn, the local hx (along x) lies along world z.
    expect(roofEdgeDistance(shed, 0, shed.hx + 1)).toBeCloseTo(1, 6)
    expect(roofEdgeDistance(shed, shed.hz + 1, 0)).toBeCloseTo(1, 6)
    expect(roofEdgeDistance(shed, 0, 0)).toBeLessThan(0)
  })

  it('measures a disc from its rim', () => {
    expect(roofEdgeDistance(HUT, HUT.x + EAVE + 1, HUT.z)).toBeCloseTo(1, 6)
  })
})

describe('edgeCover / dripBand', () => {
  it('ramps 1 → 0.5 → 0 across the rim', () => {
    expect(edgeCover(-1, 0.45)).toBe(1)
    expect(edgeCover(0, 0.45)).toBeCloseTo(0.5, 6)
    expect(edgeCover(1, 0.45)).toBe(0)
  })

  it('a zero-width drip band bakes no drip line', () => {
    expect(dripBand(0.3, 0.3, 0)).toBe(0)
    const mask = bakeShelterMask([HUT], [], EXTENT, SIZE, { ...PARAMS, dripHalfWidthM: 0 })
    expect(Math.max(...mask.drip)).toBe(0)
  })
})

describe('placeShelters — a real village', () => {
  const layout = buildLayout('bambara-village', 7)
  const style = REGION_PLACE_STYLES.west

  it('takes every flora slot as a crown and drops unroofed cook-shelters', () => {
    const roofed = placeShelters(layout, style, 'village', true)
    const open = placeShelters(layout, style, 'village', false)
    expect(roofed.crowns).toHaveLength(layout.flora.length)
    expect(roofed.roofs.some((r) => r.what === 'cook shelter')).toBe(true)
    expect(open.roofs.some((r) => r.what === 'cook shelter')).toBe(false)
    expect(open.roofs.length).toBeGreaterThan(layout.dwellings.length - 1)
  })

  it('bakes cover under every dwelling', () => {
    const { roofs, crowns } = placeShelters(layout, style, 'village', true)
    const mask = bakeShelterMask(roofs, crowns, layout.radius + 14, 512, balance.rain)
    for (const d of layout.dwellings) expect(shelterAt(mask, d.x, d.z).cover).toBeGreaterThan(0.9)
  })
})
