// THE SETTLEMENT'S RIVER CARRIED INTO THE BACKDROP (work-order 1250): no strip
// of map land may lie on the drawn water, and the far bank is left alone.

import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { BACKDROP_RIVER_Y, backdropRiverFill, mapWaterAt } from './backdropRiver'
import { PLACE_RADIUS } from './layout'
import { BANK_BED_REACH, BANK_WATER_DROP, buildRiverBank } from './riverBank'

beforeAll(setupGeodata)

/** A bank along +x with the water toward +z, its waterline 40 m out. */
const BANK = { nx: 0, nz: 1, fx: 1, fz: 0, distance: 40 }
const DRAWN = { up: 50, down: 50 }

describe('the backdrop continues the settlement river (work-order 1250)', () => {
  it('lies just under the drawn water, so the drawn surface wins where both are drawn', () => {
    expect(BACKDROP_RIVER_Y).toBeLessThan(-BANK_WATER_DROP)
    expect(BACKDROP_RIVER_Y).toBeGreaterThan(-BANK_WATER_DROP - 0.2)
  })

  it('fills map land between the waterline and the map river, and not a metre past it', () => {
    // The map's river begins 60 m out: 20 m past the drawn waterline.
    const fill = backdropRiverFill(BANK, (_x, z) => z >= 60 && z <= 90, DRAWN)
    for (const along of [-200, -60, 0, 60, 200]) {
      expect(fill(along, 39)).toBe(false) // the bank above the waterline stays ground
      expect(fill(along, 40)).toBe(true)
      expect(fill(along, 59)).toBe(true)
      expect(fill(along, 60)).toBe(false) // the map's own water from here on
      expect(fill(along, 120)).toBe(false) // and the far bank is never touched
    }
  })

  it('keeps the drawn band as water alongside the drawn river even where the map river lies beyond reach', () => {
    const reach = balance.backdropRiverFillReach
    const far = BANK.distance + reach + 20
    const fill = backdropRiverFill(BANK, (_x, z) => z >= far, DRAWN)
    expect(fill(0, BANK.distance + BANK_BED_REACH)).toBe(true)
    expect(fill(0, BANK.distance + BANK_BED_REACH + 1)).toBe(false)
    // Past the drawn river's reach nothing is invented where the map has no water near.
    expect(fill(DRAWN.down + 10, BANK.distance + 1)).toBe(false)
    expect(fill(-DRAWN.up - 10, BANK.distance + 1)).toBe(false)
  })

  it('keeps the far bank of a narrow map river that ends inside the drawn band', () => {
    // The map's river runs from 42 to 46 m out, wholly inside the drawn band.
    const fill = backdropRiverFill(BANK, (_x, z) => z >= 42 && z <= 46, DRAWN)
    expect(fill(0, 41)).toBe(true)
    expect(fill(0, 44)).toBe(true)
    expect(fill(0, 47)).toBe(false) // the far shore beyond the map river
    expect(fill(0, BANK.distance + BANK_BED_REACH)).toBe(false)
  })

  it('answers false everywhere without a bank', () => {
    const fill = backdropRiverFill(null, () => true, DRAWN)
    expect(fill(0, 45)).toBe(false)
  })

  it('leaves no map land on the river in front of the Bambara village bank', () => {
    const place = PLACES.find((p) => p.id === 'bambara-village')!
    const bank = buildRiverBank(place, PLACE_RADIUS)!
    for (const seed of [42, 2425147265]) {
      const map = mapWaterAt(place.lat, place.lon, seed)
      const fill = backdropRiverFill(bank, map, DRAWN)
      // Along the visible bank, every spot from the waterline out to where the
      // map's river begins is water in the backdrop: map water, or filled.
      for (let along = -120; along <= 120; along += 4) {
        const line = (out: number) => ({ x: bank.nx * out + bank.fx * along, z: bank.nz * out + bank.fz * along })
        const outs = Array.from({ length: balance.backdropRiverFillReach + 1 }, (_, k) => bank.distance + k)
        // A line whose map river lies beyond the fill reach, past the drawn
        // river, is the map's own business (a river bending away).
        if (Math.abs(along) > DRAWN.down && !outs.some((o) => map(line(o).x, line(o).z))) continue
        let reachedMap = false
        for (let out = bank.distance; out <= bank.distance + balance.backdropRiverFillReach; out += 1) {
          const x = bank.nx * out + bank.fx * along
          const z = bank.nz * out + bank.fz * along
          if (map(x, z)) reachedMap = true
          if (!reachedMap) expect(fill(x, z), `seed ${seed} along ${along} out ${out}`).toBe(true)
        }
      }
    }
  })
})
