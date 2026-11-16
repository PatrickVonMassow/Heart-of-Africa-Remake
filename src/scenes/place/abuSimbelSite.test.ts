// The walkable Abu Simbel site (design.md §4.4, point 379): the pure layout,
// the collidable masses of the two rock temples and the 1890 state the site
// encodes (the fallen colossus, the northern drift, the open doorway).

import { describe, expect, it } from 'vitest'
import { ABU_SIMBEL_SITE } from '../../config/balance'
import {
  GREAT_COLOSSI,
  THRONE_DEPTH,
  abuSimbelColliders,
  buildAbuSimbelLayout,
  cliffToSite,
  driftCrestAt,
  fallenFragments,
  siteToCliff,
} from './abuSimbelSite'
import { buildLayout } from './layout'
import { standingClear, WALKER_RADIUS } from './collision'

const S = ABU_SIMBEL_SITE

describe('Abu Simbel site — the Great Temple and the small temple (point 379)', () => {
  it('seats four colossi south to north, the second from the south fallen', () => {
    expect(GREAT_COLOSSI).toHaveLength(4)
    const us = GREAT_COLOSSI.map((c) => c.u)
    expect([...us].sort((a, b) => a - b)).toEqual(us)
    expect(GREAT_COLOSSI.map((c) => c.fallen)).toEqual([false, true, false, false])
    // Head and torso lie in front of the fallen figure's feet, not on the face.
    for (const f of fallenFragments(GREAT_COLOSSI[1])) expect(f.v).toBeGreaterThan(THRONE_DEPTH)
  })

  it('pours the drift down from the north: deepest at the northern colossus, none at the southern', () => {
    const south = GREAT_COLOSSI[0]
    const north = GREAT_COLOSSI[3]
    expect(driftCrestAt(south.u)).toBe(0)
    expect(driftCrestAt(north.u)).toBeGreaterThan(0.5 * north.height)
    // The doorway between the inner colossi stays open (Belzoni 1817).
    expect(driftCrestAt(0)).toBeLessThan(S.great.door.height)
  })

  it('places the small temple downstream of the great facade without overlap', () => {
    const greatEnd = (S.great.width * S.scale) / 2
    const smallStart = (S.small.u - S.small.width / 2) * S.scale
    expect(smallStart).toBeGreaterThan(greatEnd)
    expect(S.small.statueU).toHaveLength(6)
  })

  it('turns the cliff frame into the site frame and back without drift', () => {
    for (const [u, v] of [[0, 0], [13.5, 4], [-60, 20], [55, -10]]) {
      const p = cliffToSite(u, v)
      const back = siteToCliff(p.x, p.z)
      expect(back.u).toBeCloseTo(u, 9)
      expect(back.v).toBeCloseTo(v, 9)
    }
  })

  it('makes every colossus and the rock a collider, and leaves the spawn standing clear', () => {
    const colliders = abuSimbelColliders()
    for (const c of GREAT_COLOSSI) {
      const p = cliffToSite(c.u, THRONE_DEPTH / 2)
      expect(standingClear(colliders, p.x, p.z, WALKER_RADIUS)).toBe(false)
    }
    const rock = cliffToSite(0, -S.cliff.depth / 2)
    expect(standingClear(colliders, rock.x, rock.z, WALKER_RADIUS)).toBe(false)
    const layout = buildAbuSimbelLayout(0)
    expect(standingClear(layout.colliders, layout.spawnX!, layout.spawnZ, WALKER_RADIUS)).toBe(true)
    expect(Math.hypot(layout.spawnX!, layout.spawnZ)).toBeLessThan(layout.radius)
  })

  it('is the layout the monument map point builds, with no trade, elder or crowd', () => {
    const layout = buildLayout('abu-simbel', 0)
    expect(layout.radius).toBe(S.radius)
    expect(layout.interactives).toEqual([])
    expect(layout.dwellings).toEqual([])
    expect(layout.errands).toEqual([])
  })
})
