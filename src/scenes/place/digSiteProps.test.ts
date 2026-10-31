// THE SET-DOWN PROPS BESIDE A DIG SITE ARE SOLID (user report "Er steht mitten
// in den Körben und die haben auch keine Kollisionsabfrage"): a villager stood
// hip-deep in the two grain baskets beside a compound's store pit. The baskets,
// the seedling tray and the laid posts are settlement colliders now, so no
// villager's route runs through one and no villager stands in one — checked on
// the planned routes to every place a villager walks to, and on the errand
// villagers walked through a working day on the scene's own routing.

import { beforeAll, describe, expect, it } from 'vitest'
import { SHIPPED_VOCABULARY } from '../../communication/vocabulary'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { mulberry32 } from '../../world/noise'
import { createAdultWork, goalOf, stepAdultWork, taskOf, workArrivalRadius, type AdultWorkView } from './adultWork'
import { insidePlace } from './boundary'
import { escapeToFree, nudgeToFree, resolveMove, standingClear, WALKER_RADIUS, type Collider } from './collision'
import { SEEDS, VILLAGES, sharedLayout } from './layoutHarness'
import type { PlaceLayout } from './layout'
import { digFurnitureColliders, digStandingPlaces } from './placeGround'
import { advancePlaceRoute, buildPlaceNavGrid, findPlaceRoute, navClearBetween, type NavPoint } from './routing'

beforeAll(async () => {
  await setupGeodata()
})

const NPC_RADIUS = WALKER_RADIUS
/** `PlaceLife`'s waypoint radius for the errand villagers' routes (m). */
const WAYPOINT_RADIUS = 1.2
/** How far a body may graze a prop before it counts as inside (m): far below
 *  a visible clip. */
const GRAZE = 0.03
/** A villager whose centre comes this close to a prop's edge is beside it (m). */
const BESIDE = 1.5
/** The simulated working day (s). */
const WORKING_DAY_SECONDS = 1800

// OPEN: in these layouts the nav grid finds no route from any standable spawn
// point to the store pit, WITH OR WITHOUT its props; the walkers reach it only
// where the straight line is open (the working day below, run at seed 42 only,
// measures them beside its baskets). A routing gap of the dig site's placement, not of the props,
// reported for its own point. The route test proves for each that the props
// did not cause it, and fails once a route exists so the exception is removed.
const KNOWN_UNROUTABLE_PITS: ReadonlyArray<readonly [string, number]> = [
  ['mandinka-village', 7],
  ['mandinka-village', 42],
  ['sidama-village', 1337],
]

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
      const keys = new Set(props.map((c) => JSON.stringify(c)))
      const withoutProps = buildPlaceNavGrid(layout, layout.colliders.filter((c) => !keys.has(JSON.stringify(c))), NPC_RADIUS)
      const exempt = KNOWN_UNROUTABLE_PITS.some(([id, s]) => id === v.id && s === seed)
      const standable = (x: number, z: number) => standingClear(layout.colliders, x, z, NPC_RADIUS)
      // Every place a villager walks to: the stroll targets, the diggers' rim
      // places and the water path's stops.
      const goals: Array<{ at: NavPoint; pit: boolean }> = layout.digSites.flatMap((site) =>
        [{ x: site.x, z: site.z }, ...(digStandingPlaces(site, standable) ?? [])].map((at) => ({ at, pit: site.kind === 'pit' })))
      if (layout.waterPath) {
        for (const at of [layout.waterPath.head, layout.waterPath.foot, layout.waterPath.fill]) goals.push({ at, pit: false })
      }
      for (const { at } of goals) expectClear(props, at, NPC_RADIUS - GRAZE, `${v.id} goal`)
      // From the villagers' spawn ring, across the settlement to each goal.
      let routes = 0
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2
        const from = { x: Math.cos(a) * 7, z: Math.sin(a) * 7 }
        if (!standable(from.x, from.z)) continue
        for (const { at, pit } of goals) {
          const route = findPlaceRoute(nav, from, at)
          const where = `${v.id}: route from ${from.x.toFixed(1)}, ${from.z.toFixed(1)} to ${at.x.toFixed(1)}, ${at.z.toFixed(1)}`
          if (exempt && pit) {
            // The known pocket: closed with the props AND without them.
            expect(route, `${where} exists now: drop the exception`).toBeNull()
            expect(findPlaceRoute(withoutProps, from, at), `${where} exists without the props`).toBeNull()
            continue
          }
          // A missing route would check nothing: every tested route must exist.
          expect(route, `${where} is missing`).not.toBeNull()
          for (const p of route!) expectClear(props, p, NPC_RADIUS - GRAZE, `${v.id} route`)
          routes++
        }
      }
      expect(routes, v.id).toBeGreaterThan(0)
    }
  })

  // A working day of the errand villagers, stepped as `PlaceLife`'s
  // `ErrandVillagers` steps them: the work module casts the tasks, a man with
  // one walks to `goalOf` it, a man without one strolls to a named place (the
  // water path's head, a dig site) or a free point, and every walk goes round
  // what stands in the way on the settlement's nav grid (`findPlaceRoute`,
  // `advancePlaceRoute` at the scene's 1.2 m waypoint radius), resolves against
  // the colliders and climbs the scene's escape ladder when wedged. Every
  // prop must have had a villager beside it, so the day cannot pass without
  // exercising each one.
  it.each(VILLAGES.map((v) => v.id))('%s: no villager stands in a prop over a working day', (id) => {
    const seed = 42
    const layout = sharedLayout(id, seed)
    const props = propsOf(layout)
    const covered = new Set<number>()
    const cfg = balance.villageLife.adultErrands
    const nav = buildPlaceNavGrid(layout, layout.colliders, NPC_RADIUS)
    const standable = (x: number, z: number) =>
      insidePlace(layout, x, z, NPC_RADIUS * 2) && standingClear(layout.colliders, x, z, NPC_RADIUS)
    const rand = mulberry32((seed + 30011) >>> 0)
    const rim = Math.max(1, layout.radius - NPC_RADIUS * 2)
    // The scene's own stroll targets alone leave a prop unvisited: over six day
    // seeds no villager of bambara-village@42 came closer than 1.55 m to the
    // far basket. So each prop also gets a stroll target just past its far
    // side, and the walk there runs on the same routing and colliders.
    const pastProps = layout.digSites.flatMap((site) => digFurnitureColliders(site).map((prop) => {
      if (prop.kind === 'segment') throw new Error('dig furniture has no segment collider')
      const reach = ('r' in prop ? prop.r : Math.max(prop.hx, prop.hz)) + NPC_RADIUS + 0.2
      const d = Math.hypot(prop.x - site.x, prop.z - site.z) || 1
      const [x, z] = nudgeToFree(layout.colliders, prop.x + ((prop.x - site.x) / d) * reach, prop.z + ((prop.z - site.z) / d) * reach, NPC_RADIUS)
      return { x, z }
    }))
    const named: NavPoint[] = [
      ...(layout.waterPath ? [layout.waterPath.head] : []),
      ...layout.digSites.map((d) => ({ x: d.x, z: d.z })),
      ...pastProps,
    ]
    const people = Array.from({ length: cfg.villagerCount }, (_, i) => {
      const a = (i / cfg.villagerCount) * Math.PI * 2
      const [x, z] = nudgeToFree(layout.colliders, Math.cos(a) * 7, Math.sin(a) * 7, NPC_RADIUS)
      return { x, z, free: true }
    })
    const anchors = people.map((p) => [p.x, p.z] as const)
    const idle = people.map(() => ({ target: null as NavPoint | null, pause: 0, route: null as NavPoint[] | null, routeTo: null as NavPoint | null, stuck: 0 }))
    const work = createAdultWork(people.length, cfg)
    const view: AdultWorkView = {
      vocabulary: SHIPPED_VOCABULARY,
      villagers: people,
      geography: {
        waterHead: layout.waterPath?.head ?? null,
        waterFoot: layout.waterPath?.foot ?? null,
        waterFill: layout.waterPath?.fill ?? null,
        waterStand: layout.waterStand,
        digSites: layout.digSites,
      },
      standable,
      invitationClear: () => true,
      childrenHear: () => false,
    }
    const dt = 0.1
    for (let clock = 0; clock < WORKING_DAY_SECONDS; clock += dt) {
      people.forEach((me, i) => {
        const task = taskOf(work, i)
        me.free = !task
        const state = idle[i]
        let goal: NavPoint | null = null
        if (task) goal = task.arrived ? null : goalOf(task)
        else if (state.pause > 0) state.pause -= dt
        else if (!state.target) {
          if (rand() < 0.55) state.target = named[Math.floor(rand() * named.length) % named.length]
          else {
            const a = rand() * Math.PI * 2
            const d = 4 + rand() * Math.max(1, rim - 6)
            const [x, z] = nudgeToFree(layout.colliders, Math.cos(a) * d, Math.sin(a) * d, NPC_RADIUS)
            state.target = { x, z }
          }
        } else goal = state.target
        if (!goal) {
          state.route = null
          return
        }
        const d = Math.hypot(goal.x - me.x, goal.z - me.z)
        if (d <= (task ? workArrivalRadius(task) : 0.9)) {
          if (!task) {
            state.target = null
            state.pause = 3 + rand() * 6
          }
          state.route = null
          return
        }
        if (state.routeTo && (state.routeTo.x !== goal.x || state.routeTo.z !== goal.z)) state.route = null
        if (navClearBetween(nav, me.x, me.z, goal.x, goal.z)) state.route = null
        else if (!state.route) {
          state.route = findPlaceRoute(nav, me, goal)
          state.routeTo = { x: goal.x, z: goal.z }
        }
        if (state.route) advancePlaceRoute(nav, me, state.route, WAYPOINT_RADIUS)
        const aim = state.route?.length ? state.route[0] : goal
        const ad = Math.hypot(aim.x - me.x, aim.z - me.z)
        if (ad === 0) return
        const step = Math.min(ad, cfg.pace * dt)
        const [x, z] = resolveMove(layout.colliders, me.x + ((aim.x - me.x) / ad) * step, me.z + ((aim.z - me.z) / ad) * step, NPC_RADIUS, [me.x, me.z])
        const moved = Math.hypot(x - me.x, z - me.z)
        me.x = x
        me.z = z
        if (moved < step * 0.25) {
          state.stuck += dt
          if (state.stuck > balance.walkerUnstuckSeconds) {
            const escape = escapeToFree(layout.colliders, me.x, me.z, NPC_RADIUS, nav, anchors[i])
            me.x = escape.pos[0]
            me.z = escape.pos[1]
            state.route = null
            state.stuck = 0
          }
        } else state.stuck = 0
      })
      stepAdultWork(work, view, dt, cfg, rand)
      for (const me of people) {
        if (!standingClear(props, me.x, me.z, NPC_RADIUS - GRAZE)) {
          expect.fail(`${id}: a villager stands in a prop at ${me.x.toFixed(2)}, ${me.z.toFixed(2)} after ${clock.toFixed(1)} s`)
        }
        props.forEach((prop, k) => {
          if (!standingClear([prop], me.x, me.z, BESIDE)) covered.add(k)
        })
      }
    }
    // Every prop had a villager beside it.
    props.forEach((_, k) => {
      expect(covered.has(k), `${id}: no villager came beside prop ${k} in the working day`).toBe(true)
    })
  })
})
