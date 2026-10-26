// THE SET-DOWN PROPS BESIDE A DIG SITE ARE SOLID (user report "Er steht mitten
// in den Körben und die haben auch keine Kollisionsabfrage"): a villager stood
// hip-deep in the two grain baskets beside a compound's store pit. The baskets,
// the seedling tray and the laid posts are settlement colliders now, so no
// villager's route runs through one and no villager stands in one — checked on
// the planned routes to every place a villager walks to, and on every body of
// the settlement stepped through a long working stretch.

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { SEEDS, VILLAGES, sharedLayout } from './layoutHarness'
import { digFurnitureColliders, digStandingPlaces } from './placeGround'
import { standingClear, type Collider } from './collision'
import { buildPlaceNavGrid, findPlaceRoute, type NavPoint } from './routing'
import { createInhabitantSet } from './inhabitantBodies'
import { crowd, NPC_RADIUS } from './tagShuffleHarness'
import type { PlaceLayout } from './layout'

beforeAll(async () => {
  await setupGeodata()
})

/** How far a body may graze a prop before it counts as inside (m): the
 *  separation's per-frame residue, far below a visible clip. */
const GRAZE = 0.03

const propsOf = (layout: PlaceLayout): Collider[] => layout.digSites.flatMap(digFurnitureColliders)

function expectClear(props: Collider[], p: NavPoint, radius: number, where: string) {
  expect(standingClear(props, p.x, p.z, radius), `${where} at ${p.x.toFixed(2)}, ${p.z.toFixed(2)}`).toBe(true)
}

describe('the props set down beside a dig site are obstacles (point 1418)', () => {
  it.each(SEEDS)('seed %i: every prop is in the settlement collider set', (seed) => {
    for (const v of VILLAGES) {
      const layout = sharedLayout(v.id, seed)
      const keys = new Set(layout.colliders.map((c) => JSON.stringify(c)))
      expect(layout.digSites.length, v.id).toBeGreaterThan(0)
      for (const prop of propsOf(layout)) expect(keys.has(JSON.stringify(prop)), v.id).toBe(true)
    }
  })

  it.each(SEEDS)('seed %i: no villager route point lies in a prop', (seed) => {
    for (const v of VILLAGES) {
      const layout = sharedLayout(v.id, seed)
      const props = propsOf(layout)
      const nav = buildPlaceNavGrid(layout, layout.colliders, NPC_RADIUS)
      const standable = (x: number, z: number) => standingClear(layout.colliders, x, z, NPC_RADIUS)
      // Every place a villager walks to: the stroll targets, the diggers' rim
      // places and the water path's stops.
      const goals: NavPoint[] = layout.digSites.flatMap((site) => [
        { x: site.x, z: site.z },
        ...(digStandingPlaces(site, standable) ?? []),
      ])
      if (layout.waterPath) goals.push(layout.waterPath.head, layout.waterPath.foot, layout.waterPath.fill)
      for (const goal of goals) expectClear(props, goal, NPC_RADIUS - GRAZE, `${v.id} goal`)
      // From the villagers' spawn ring, across the settlement to each goal.
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const from = { x: Math.cos(a) * 7, z: Math.sin(a) * 7 }
        if (!standable(from.x, from.z)) continue
        for (const goal of goals) {
          for (const p of findPlaceRoute(nav, from, goal) ?? []) expectClear(props, p, NPC_RADIUS - GRAZE, `${v.id} route`)
        }
      }
    }
  })

  /** Each village's closest approach of an errand villager to a dig site. */
  const nearestBySite = new Map<string, number>()
  // A long working stretch of the whole settlement, stepped as `PlaceLife`
  // steps it: the errand villagers strolling to the dig sites and working
  // there, the porters and the fixed vignette adults, all in one body set.
  it.each(VILLAGES.map((v) => v.id))('%s: no villager stands in a prop over a working day', (id) => {
    const layout = sharedLayout(id, 42)
    const props = propsOf(layout)
    const set = createInhabitantSet()
    const settlement = crowd(set, id, layout, 42)
    const bodies = [...settlement.standing, ...settlement.porters, ...settlement.walkers]
    const dt = 1 / 20
    const seconds = 900
    let nearest = Infinity
    for (let f = 0; f < seconds / dt; f++) {
      settlement.step(dt, f * dt)
      for (const b of bodies) {
        if (standingClear(props, b.x, b.z, NPC_RADIUS - GRAZE)) continue
        expect.fail(`${id}: a villager stands in a prop at ${b.x.toFixed(2)}, ${b.z.toFixed(2)} after ${(f * dt).toFixed(1)} s`)
      }
      for (const b of settlement.walkers) {
        for (const site of layout.digSites) nearest = Math.min(nearest, Math.hypot(b.x - site.x, b.z - site.z))
      }
    }
    nearestBySite.set(id, nearest)
  })

  // The stretch really took the villagers to the dig sites, beside the props.
  // Not in every village: the harness walks a stroll in a straight line, and
  // in berber-village@42 that line ends at a fence with or without the props
  // (measured: 3.20 m either way), where the scene's own walker routes round.
  it('took the villagers beside the props in nearly every village', () => {
    const reached = [...nearestBySite.values()].filter((d) => d < 2.5).length
    expect(nearestBySite.size).toBe(VILLAGES.length)
    expect(reached).toBeGreaterThanOrEqual(VILLAGES.length - 2)
  })
})
