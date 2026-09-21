// THE ROOM THE SETTLEMENT GIVES ITS TEACHING VOICES (work-order 1173).
//
// Point 688 §6 rules that the adults' village core, the children's roaming
// quarter and the bank stage must each clear the others by the hearing radius,
// so a learner can tell one teaching voice from another. That held by luck
// rather than by construction: the clearance came out at EXACTLY the radius on
// most shipped villages, bought by shrinking the children's ground to its floor.
//
// What is asserted here is the CONSTRUCTION. Every shipped settlement is
// measured, and a layout that cannot give all three is named — never waved
// through, and never satisfied by a single village that happens to be roomy.

import { beforeAll, describe, expect, it } from 'vitest'
import { buildLayout, PLACE_RADIUS, PLACE_RADIUS_BASE, VILLAGE_FIRE } from './layout'
import { villageAdultStations } from './lifeSpots'
import { BANK_STRETCH_MAX_SPAN, BANK_STRETCH_MIN_SPAN } from './riverBank'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { balance } from '../../config/balance'

beforeAll(setupGeodata)

const VILLAGES = PLACES.filter((p) => p.kind === 'village')
const SEEDS = [7, 42, 1337]

/** Distance from a point to a disc's rim, negative inside it. */
const toDisc = (x: number, z: number, d: { x: number; z: number; radius: number }): number =>
  Math.hypot(x - d.x, z - d.z) - d.radius

describe('the settlement gives every teaching voice its own room', () => {
  it('derives the walkable radius from the one calibratable factor', () => {
    // The point is done only when the factor alone moves the settlement, so no
    // caller may hold a radius of its own.
    expect(PLACE_RADIUS).toBeCloseTo(PLACE_RADIUS_BASE * balance.settlementRoom, 9)
    expect(balance.settlementRoom).toBeGreaterThan(1)
  })

  it.each(SEEDS)('seed %i: keeps the three teaching areas a hearing radius apart', (seed) => {
    const reach = balance.communication.talk.reach
    let withBank = 0
    for (const v of VILLAGES) {
      const layout = buildLayout(v.id, seed)
      const quarter = layout.playGround
      expect(quarter, `${v.id}: no children's quarter at all`).not.toBeNull()
      if (!quarter) continue

      // 1. THE ADULTS' CORE against the children's quarter. The stations are
      //    where the village's own teaching voices stand.
      for (const [sx, sz] of villageAdultStations(VILLAGE_FIRE, v.id)) {
        expect(
          toDisc(sx, sz, quarter),
          `${v.id}: an adult station stands inside the children's earshot`,
        ).toBeGreaterThanOrEqual(reach - 1e-9)
      }

      if (!layout.playRocks) continue
      withBank++
      const stage = [layout.playRocks.upstream, layout.playRocks.downstream]

      // 2. THE ADULTS' CORE against the bank stage.
      for (const [sx, sz] of villageAdultStations(VILLAGE_FIRE, v.id)) {
        for (const rock of stage) {
          expect(
            Math.hypot(sx - rock.x, sz - rock.z),
            `${v.id}: an adult station stands inside the bank stage's earshot`,
          ).toBeGreaterThanOrEqual(reach - 1e-9)
        }
      }

      // 3. THE CHILDREN'S QUARTER against their own bank stage. The two are one
      //    game's two halves and still have to be told apart by ear.
      for (const rock of stage) {
        expect(
          toDisc(rock.x, rock.z, quarter),
          `${v.id}: the bank stage stands inside the roaming quarter's earshot`,
        ).toBeGreaterThanOrEqual(reach - 1e-9)
      }
    }
    // A run in which no village carried a bank would assert two of the three
    // rules and quietly skip the third.
    expect(withBank, 'no shipped village carried a bank stage').toBeGreaterThan(0)
  })

  it.each(SEEDS)('seed %i: keeps the running stretch a run at every settlement size', (seed) => {
    let measured = 0
    for (const v of VILLAGES) {
      const layout = buildLayout(v.id, seed)
      if (!layout.playRocks) continue
      measured++
      const { upstream, downstream } = layout.playRocks
      const span = Math.hypot(upstream.x - downstream.x, upstream.z - downstream.z)
      // Long enough to read as a run from its own end (687 §6) ...
      expect(span, `${v.id}: the stretch is a scuffle, not a run`).toBeGreaterThanOrEqual(BANK_STRETCH_MIN_SPAN)
      // ... and short enough that running it is not a march. The bank moves out
      // with the village's margin off the water, and the stretch is an angle on
      // it, so without this bound growing the settlement stretches the game.
      expect(span, `${v.id}: the stretch has become a march`).toBeLessThanOrEqual(BANK_STRETCH_MAX_SPAN + 1e-9)
    }
    expect(measured, 'no stretch was measured').toBeGreaterThan(0)
  })

  it('leaves the children ground to play on, not merely a legal minimum', () => {
    // The clearance above can always be bought by shrinking the quarter to its
    // floor, which is what the tight disc did: every village came out at the
    // hearing radius exactly, with a 4 m ground. The room is only real if the
    // quarters are bigger than that floor on a decent share of the villages.
    let roomy = 0
    for (const v of VILLAGES) {
      const g = buildLayout(v.id, 42).playGround
      if (g && g.radius > 4) roomy++
    }
    expect(roomy, 'every village still plays on the smallest ground allowed').toBeGreaterThan(VILLAGES.length / 3)
  })
})
