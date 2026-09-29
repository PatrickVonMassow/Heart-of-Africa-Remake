// WEAVING IS PARKED (user 29.09.2026): no village lays the weaver's loom, while
// the station's code, strings and tests stay so it can be switched back on.

import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { buildLayout } from './layout'
import { WARP_BODY_RADIUS, WEAVER_BODY_RADIUS } from './loom'

beforeAll(setupGeodata)

const VILLAGES = PLACES.filter((p) => p.kind === 'village').map((p) => p.id)

describe('the weaving scene is off in every village', () => {
  it('ships with the placement switched off', () => {
    expect(balance.villageLife.loom.placed).toBe(false)
  })

  it.each([7, 1838110026])('no village lays a loom, a warp or a weaver (seed %i)', (seed) => {
    expect(VILLAGES.length).toBeGreaterThan(0)
    for (const id of VILLAGES) {
      const layout = buildLayout(id, seed)
      expect(layout.loom, id).toBeNull()
      expect(layout.gaveWayToLoom, id).toEqual({ households: 0, dwellings: 0, rebuilt: 0 })
      expect(layout.colliders.some((c) => c.kind === 'segment' && c.r === WARP_BODY_RADIUS), id).toBe(false)
      expect(layout.colliders.some((c) => c.kind !== 'segment' && c.kind !== 'box' && c.r === WEAVER_BODY_RADIUS), id).toBe(false)
    }
  })

  it('the kept mechanism still lays the loom when the switch is turned back on', () => {
    balance.villageLife.loom.placed = true
    try {
      expect(buildLayout('bambara-village', 7).loom).not.toBeNull()
    } finally {
      balance.villageLife.loom.placed = false
    }
  })
})
