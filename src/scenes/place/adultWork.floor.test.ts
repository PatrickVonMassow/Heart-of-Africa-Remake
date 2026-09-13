import { beforeAll, expect, it, vi } from 'vitest'
import { resetDevAsserts } from '../../systems/devAssert'
import { balance } from '../../config/balance'
import { PLACES } from '../../world/geo'
import { mulberry32 } from '../../world/noise'
import { setupGeodata } from '../../test/geodata'
import { buildLayout } from './layout'
import { insidePlace } from './boundary'
import { nudgeToFree, resolveMove, standingClear, WALKER_RADIUS } from './collision'
import { buildPlaceNavGrid, findPlaceRoute, navClearBetween, type NavPoint } from './routing'
import { createAdultWork, goalOf, stepAdultWork, WORK_ARRIVE_RADIUS, type AdultWorkView } from './adultWork'

beforeAll(setupGeodata)

it('measures the hold above complete healthy exchanges on every shipped village layout', () => {
  const cfg = balance.villageLife.adultErrands
  const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
  let stuckExchanges = 0
  let longest = { seconds: 0, id: '', seed: 0, situation: '' }
  let dig = 0, water = 0
  for (const { id } of PLACES.filter((p) => p.kind === 'village')) {
    for (const seed of [7, 42, 1337]) {
      const layout = buildLayout(id, seed)
      const bounds = { radius: layout.radius, bank: layout.bank }
      const nav = buildPlaceNavGrid(bounds, layout.colliders, WALKER_RADIUS)
      const rand = mulberry32(seed + 30011)
      // A pair completes the catalogue without a deliberately obstructing third
      // body. This measures healthy task travel through the actual collider/nav
      // geometry; crowd stalls belong to the forcing tests, not the healthy bound.
      const people = [0, 1].map((i) => {
        const [x, z] = nudgeToFree(layout.colliders, i ? -7 : 7, 0, WALKER_RADIUS)
        return { x, z, free: true }
      })
      resetDevAsserts()
      const stalled = [0, 0]
      const state = createAdultWork(people.length, cfg)
      const routes: Array<{ goal: NavPoint; points: NavPoint[] | null } | null> = [null, null]
      const view: AdultWorkView = {
        villagers: people,
        geography: {
          waterHead: layout.waterPath?.head ?? null,
          waterFoot: layout.waterPath?.foot ?? null,
          waterFill: layout.waterPath?.fill ?? null,
          waterStand: layout.waterStand,
          digSites: layout.digSites,
        },
        standable: (x, z) => insidePlace(bounds, x, z, WALKER_RADIUS * 2) && standingClear(layout.colliders, x, z, WALKER_RADIUS),
        childrenHear: () => false,
        invitationClear: (x, z) => {
          const margin = balance.communication.hearingRadius + WORK_ARRIVE_RADIUS
          return !(layout.playGround && Math.hypot(x - layout.playGround.x, z - layout.playGround.z) - layout.playGround.radius <= margin) &&
            ![layout.waterPath?.foot, layout.playRocks?.upstream, layout.playRocks?.downstream]
              .some((p) => p && Math.hypot(x - p.x, z - p.z) <= margin)
        },
      }
      const starts = new Map<object, { at: number; situation: string }>()
      const dt = 0.1
      let completed = 0
      for (let clock = 0; clock < 1200; clock += dt) {
        people.forEach((me, i) => {
          const t = state.tasks[i]
          const before = { x: me.x, z: me.z }
          me.free = !t
          if (!t || t.arrived) return
          stalled[i] += dt
          const goal = goalOf(t)
          if (!routes[i] || Math.hypot(routes[i]!.goal.x - goal.x, routes[i]!.goal.z - goal.z) > 0.01) {
            routes[i] = { goal: { ...goal }, points: findPlaceRoute(nav, me, goal) }
          }
          const clear = navClearBetween(nav, me.x, me.z, goal.x, goal.z)
          if (clear) routes[i]!.points = null
          else if (!routes[i]!.points) routes[i]!.points = findPlaceRoute(nav, me, goal)
          const route = routes[i]!.points
          while (route && route.length > 1 && Math.hypot(route[0].x - me.x, route[0].z - me.z) <= 1e-6) route.shift()
          const aim = route?.length ? route[0] : goal
          const distance = Math.hypot(aim.x - me.x, aim.z - me.z)
          const step = Math.min(distance, cfg.pace * dt)
          if (distance === 0) return
          const x = me.x + (aim.x - me.x) / distance * step, z = me.z + (aim.z - me.z) / distance * step
          if (!insidePlace(bounds, x, z, WALKER_RADIUS * 2)) return
          const next = resolveMove(layout.colliders, x, z, WALKER_RADIUS, [me.x, me.z])
          me.x = next[0]; me.z = next[1]
          if (Math.hypot(me.x - before.x, me.z - before.z) >= step * 0.25) stalled[i] = 0
        })
        const tasks = [...state.tasks]
        const walking = tasks.flatMap((t, i) => t && !t.arrived ? [i] : [])
        const errorCount = errors.mock.calls.length
        const forcedCount = state.floor?.forcedCount ?? 0
        const word = stepAdultWork(state, view, dt, cfg, rand)
        if ((state.floor?.forcedCount ?? 0) > forcedCount || errors.mock.calls.length > errorCount) {
          // A nav obstruction is not a healthy situation. Prove it was stalled,
          // rather than quietly excluding a slow but moving exchange from the maximum.
          expect(walking.length, `${id}/${seed}: forcing must have a physical stall ${errors.mock.calls.slice(errorCount).flat().join(' ')}`).toBeGreaterThan(0)
          expect(walking.every((i) => stalled[i] >= cfg.stallSeconds), `${id}/${seed}: ${stalled} clock=${clock} ${errors.mock.calls.slice(errorCount).flat().join(' ')} ${JSON.stringify(tasks)}`).toBe(true)
          stuckExchanges++
          if (word) starts.delete(tasks[word.speaker]!.speechOwner!)
          continue
        }
        if (!word) continue
        const task = tasks[word.speaker]!
        const owner = task.speechOwner ?? task
        if (word.purpose === 'invitation' || word.id === 'water-out') {
          starts.set(owner, { at: clock, situation: word.id })
        } else {
          const start = starts.get(owner)
          expect(start, `${id}/${seed}: second word must follow its own first`).toBeDefined()
          const seconds = clock - start!.at
          if (seconds > longest.seconds) longest = { seconds, id, seed, situation: start!.situation }
          starts.delete(owner)
          completed++
          if (word.concept === 'DIG') dig++
          else water++
        }
      }
      if (layout.digSites.length) expect(completed, `${id}/${seed} completes real exchanges`).toBeGreaterThan(0)
    }
  }
  expect(dig).toBeGreaterThan(0)
  expect(water).toBeGreaterThan(0)
  errors.mockRestore()
  resetDevAsserts()
  console.info('Measured longest healthy speech situation:', longest, { stuckExchanges })
  expect(balance.communication.speechHoldSeconds, JSON.stringify(longest)).toBeGreaterThan(longest.seconds)
  expect(balance.communication.speechHoldSeconds).toBeLessThan(cfg.errandSeconds)
}, 120000)
