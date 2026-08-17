// The bird's-eye obstacle query must be COMPLETE over the radius its caller
// searches (work-order 610). The escape key samples the dressing ONCE, at the
// traveller, and then tests candidate spots out to `balance.unstuck.searchRadius`
// scaled to the travel speed — 6.72 world units. A query that only ever looked
// ~4.2 units out therefore judged the outer rings against an empty world and
// could set him down inside a tree nobody had asked about; the next frame's
// resolver pushes him out again, which is a hit papered over, not a placement.
//
// The witness is the pre-fix reach: the same sweep run at the old fixed query
// finds spots whose blocking plant is missing from the list — so this test fails
// on the code it was written against, rather than restating the new one.
import { describe, it, expect, beforeAll } from 'vitest'
import { collidableFloraNear } from './TravelScene'
import { PLACES, latLonToWorld } from '../../world/geo'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'

/** The escape's real search radius in the bird's-eye view: the settlement-scale
 *  value scaled by the speed ratio, exactly as TravelScene scales it. */
const SEARCH_RADIUS = balance.unstuck.searchRadius * (balance.travelSpeed / balance.placeWalkSpeed)
/** The fixed reach the query had before this point — the witness baseline. */
const OLD_REACH = 3
const SEEDS = [1, 42, 777]

beforeAll(async () => {
  await setupGeodata()
})

/** Sample points on land: a grid around the first villages, which stand in
 *  vegetated country rather than on a coast. */
function samplePoints(): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (const p of PLACES.slice(0, 12)) {
    const w = latLonToWorld(p.lat, p.lon)
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) out.push([w.x + dx * 9, w.z + dz * 9])
  }
  return out
}

/** Every collidable plant whose circle reaches into the disc of radius `r`
 *  around (x,z) — read from a deliberately over-wide query, so the expectation
 *  does not depend on the reach under test. */
function within(x: number, z: number, seed: number, r: number): string[] {
  return collidableFloraNear(x, z, seed, 40)
    .filter(([ox, oz, rad]) => Math.hypot(ox - x, oz - z) - rad <= r)
    .map(([ox, oz]) => `${ox.toFixed(3)},${oz.toFixed(3)}`)
}

describe('the travel obstacle query reaches as far as the escape searches (work-order 610)', () => {
  it.each(SEEDS)('seed %i: a query over the search radius omits no plant inside it', (seed) => {
    for (const [x, z] of samplePoints()) {
      const seen = new Set(collidableFloraNear(x, z, seed, SEARCH_RADIUS).map(([ox, oz]) => `${ox.toFixed(3)},${oz.toFixed(3)}`))
      for (const key of within(x, z, seed, SEARCH_RADIUS)) {
        expect(seen.has(key), `plant ${key} inside ${SEARCH_RADIUS.toFixed(2)} u of ${x.toFixed(1)},${z.toFixed(1)} was not returned`).toBe(true)
      }
    }
  })

  it('the pre-fix reach really did miss plants the search can land on', () => {
    // WITNESS: at the old fixed reach the same sweep leaves blocking plants out
    // of the list — the defect this point closes, in numbers.
    let missed = 0
    for (const seed of SEEDS) {
      for (const [x, z] of samplePoints()) {
        const seen = new Set(collidableFloraNear(x, z, seed, OLD_REACH).map(([ox, oz]) => `${ox.toFixed(3)},${oz.toFixed(3)}`))
        for (const key of within(x, z, seed, SEARCH_RADIUS)) if (!seen.has(key)) missed++
      }
    }
    expect(missed).toBeGreaterThan(0)
  })

  it('a wider reach never drops what a narrower one found', () => {
    // Monotone in `reach`: widening the query only adds. A chunk-span bug would
    // show here as a plant that vanishes when the caller asks for more.
    for (const seed of SEEDS) {
      for (const [x, z] of samplePoints().slice(0, 40)) {
        const near = collidableFloraNear(x, z, seed, 2).map(([ox, oz]) => `${ox.toFixed(3)},${oz.toFixed(3)}`)
        const far = new Set(collidableFloraNear(x, z, seed, 20).map(([ox, oz]) => `${ox.toFixed(3)},${oz.toFixed(3)}`))
        for (const key of near) expect(far.has(key)).toBe(true)
      }
    }
  })
})
