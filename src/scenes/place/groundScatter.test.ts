// The settlement's grass scatter (work-order 585). What matters here is the one
// rule the loose dressing broke: nothing stands on the shore. At the reported
// seed two tufts of the Bambara village stood out over the Niger — drawn on the
// flat plate while the ground under them had already sloped into the water — so
// the scatter is checked against the bank the settlement actually has.
// THE DATASET IS LOADED FIRST, and that is not ceremony (four-eyes review by
// GPT-5.6 Sol, 11.08.2026): without `setupGeodata()` the terrain reads as OCEAN
// EVERYWHERE in this layer, so a shore rule checked against it is checked against
// a world with no shore — the file would pass with the bug it was written for.
import { describe, it, expect, beforeAll } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { scatterGrassTufts } from './groundScatter'
import { buildLayout, PLACE_RADIUS } from './layout'
import { standsOnGroundPlate, BANK_DRESSING_CLEARANCE } from './riverBank'
import { ROCK_VILLAGE_ID } from '../../world/communicationRock'
import { PLACES } from '../../world/geo'

/** The world of the F6 report the point was filed from. */
const REPORTED_SEED = 1425108822
const SEEDS = [7, 42, 1337, REPORTED_SEED]

beforeAll(async () => {
  await setupGeodata()
})

describe('the grass scatter keeps off the shore', () => {
  it.each(SEEDS)('seed %i: no tuft of the river village stands past the top of the bank', (seed) => {
    const layout = buildLayout(ROCK_VILLAGE_ID, seed)
    expect(layout.bank).not.toBeNull()
    const bank = layout.bank!
    const tufts = scatterGrassTufts({
      placeId: ROCK_VILLAGE_ID,
      seed,
      isPort: false,
      grassFactor: 1,
      radius: layout.radius,
      bank,
    })
    expect(tufts.length).toBeGreaterThan(20) // the cover is still a cover
    for (const [x, z] of tufts) {
      const out = x * bank.nx + z * bank.nz
      expect(out, `tuft at ${x.toFixed(1)}/${z.toFixed(1)}`).toBeLessThanOrEqual(
        bank.walkEdge - BANK_DRESSING_CLEARANCE + 1e-9,
      )
      // ... which is well short of the waterline, so no tuft is ever drawn on water.
      expect(out).toBeLessThan(bank.distance)
    }
  })

  it('the same scatter WITHOUT a bank keeps every tuft it drew', () => {
    // Only the shore rule may remove a tuft: a settlement with no river must
    // still get the full cover, or the fix would have thinned every village.
    const withBank = scatterGrassTufts({
      placeId: ROCK_VILLAGE_ID,
      seed: REPORTED_SEED,
      isPort: false,
      grassFactor: 1,
      radius: PLACE_RADIUS,
      bank: null,
    })
    expect(withBank).toHaveLength(70)
  })

  it('is deterministic per place and seed, and differs between the two', () => {
    const at = (placeId: string, seed: number) =>
      JSON.stringify(scatterGrassTufts({ placeId, seed, isPort: false, grassFactor: 1, radius: PLACE_RADIUS, bank: null }))
    expect(at(ROCK_VILLAGE_ID, 42)).toBe(at(ROCK_VILLAGE_ID, 42))
    expect(at(ROCK_VILLAGE_ID, 42)).not.toBe(at(ROCK_VILLAGE_ID, 43))
    expect(at(ROCK_VILLAGE_ID, 42)).not.toBe(at('hausa-village', 42))
  })

  it('a port carries the thinner cover, and the density factor scales it', () => {
    const port = scatterGrassTufts({ placeId: 'cairo', seed: 42, isPort: true, grassFactor: 1, radius: PLACE_RADIUS, bank: null })
    expect(port).toHaveLength(30)
    const sparse = scatterGrassTufts({ placeId: 'cairo', seed: 42, isPort: true, grassFactor: 0.5, radius: PLACE_RADIUS, bank: null })
    expect(sparse).toHaveLength(15)
  })

  it('every settlement that HAS a bank scatters clear of it', () => {
    for (const place of PLACES) {
      const layout = buildLayout(place.id, REPORTED_SEED)
      if (!layout.bank) continue
      const tufts = scatterGrassTufts({
        placeId: place.id,
        seed: REPORTED_SEED,
        isPort: place.kind === 'port',
        grassFactor: 1,
        radius: layout.radius,
        bank: layout.bank,
      })
      for (const [x, z] of tufts) {
        expect(standsOnGroundPlate(layout.bank, x, z), `${place.id} tuft at ${x.toFixed(1)}/${z.toFixed(1)}`).toBe(true)
      }
    }
  })
})
