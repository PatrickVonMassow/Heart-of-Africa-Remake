import { beforeAll, expect, it, vi } from 'vitest'
import { resetDevAsserts } from '../../systems/devAssert'
import { balance } from '../../config/balance'
import { PLACES } from '../../world/geo'
import { mulberry32 } from '../../world/noise'
import { setupGeodata } from '../../test/geodata'
import { buildLayout } from './layout'
import { insidePlace } from './boundary'
import { escapeToFree, resolveMove, standingClear, WALKER_RADIUS } from './collision'
import { advancePlaceRoute, buildPlaceNavGrid, findPlaceRoute, navClearBetween, type NavPoint } from './routing'

/** PlaceLife's own waypoint radius: this simulation walks the route the way the
 *  scene walks it, or it measures a walker the game does not have. */
const WAYPOINT_RADIUS = 1.2
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
      /** ONE rule, asked by the start search and by the work view alike. */
      const invitationClearAt = (x: number, z: number): boolean => {
        const margin = balance.communication.hearingRadius + WORK_ARRIVE_RADIUS
        return !(layout.playGround && Math.hypot(x - layout.playGround.x, z - layout.playGround.z) - layout.playGround.radius <= margin) &&
          ![layout.waterPath?.foot, layout.playRocks?.upstream, layout.playRocks?.downstream]
            .some((p) => p && Math.hypot(x - p.x, z - p.z) <= margin)
      }
      const nav = buildPlaceNavGrid(bounds, layout.colliders, WALKER_RADIUS)
      const rand = mulberry32(seed + 30011)
      // A pair completes the catalogue without a deliberately obstructing third
      // body. This measures healthy task travel through the actual collider/nav
      // geometry; crowd stalls belong to the forcing tests, not the healthy bound.
      // WHERE TWO VILLAGERS MAY STAND TO START A TEACHING. The pair used to be
      // dropped at a fixed +-7 m, which is ground the layout never promised: the
      // children's quarter keeps an earshot around itself and 688 §6 rules that
      // where the areas cannot all clear each other, the ADULTS move. On the
      // room point 1173 gave the settlement, that earshot reaches over the old
      // spots often enough that villages simply never started a task —
      // swahili-village at seed 1337 measured exactly that.
      //
      // So the pair starts where the settlement actually allows a teaching, and
      // THAT such ground exists is asserted rather than assumed.
      const startSpot = (bearing: number): { x: number; z: number } | null => {
        for (let r = 5; r < layout.radius - 2; r += 0.5) {
          for (let k = 0; k < 24; k++) {
            const a = bearing + (k % 2 ? -1 : 1) * Math.ceil(k / 2) * (Math.PI / 12)
            const x = Math.cos(a) * r, z = Math.sin(a) * r
            if (!standingClear(layout.colliders, x, z, WALKER_RADIUS)) continue
            if (!insidePlace(bounds, x, z, WALKER_RADIUS * 2)) continue
            if (!invitationClearAt(x, z)) continue
            return { x, z }
          }
        }
        return null
      }
      const spots = [startSpot(0), startSpot(Math.PI)]
      expect(spots[0], `${id}/${seed}: no ground a teaching pair may stand on`).not.toBeNull()
      expect(spots[1], `${id}/${seed}: no second ground a teaching pair may stand on`).not.toBeNull()
      const people = spots.map((p) => ({ x: p!.x, z: p!.z, free: true }))
      resetDevAsserts()
      const recent: NavPoint[][] = [[], []]
      const state = createAdultWork(people.length, cfg)
      const routes: Array<{ goal: NavPoint; points: NavPoint[] | null } | null> = [null, null]
      const stuck = [0, 0]
      const anchors = people.map((p) => [p.x, p.z] as readonly [number, number])
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
        invitationClear: invitationClearAt,
      }
      const starts = new Map<object, { at: number; situation: string }>()
      const dt = 0.1
      let completed = 0
      for (let clock = 0; clock < 1200; clock += dt) {
        people.forEach((me, i) => {
          const t = state.tasks[i]
          me.free = !t
          if (!t || t.arrived) return
          const goal = goalOf(t)
          if (!routes[i] || Math.hypot(routes[i]!.goal.x - goal.x, routes[i]!.goal.z - goal.z) > 0.01) {
            routes[i] = { goal: { ...goal }, points: findPlaceRoute(nav, me, goal) }
          }
          const clear = navClearBetween(nav, me.x, me.z, goal.x, goal.z)
          if (clear) routes[i]!.points = null
          else if (!routes[i]!.points) routes[i]!.points = findPlaceRoute(nav, me, goal)
          const route = routes[i]!.points
          // THE SAME WAYPOINT RADIUS THE SCENE USES (PlaceLife's 1.2 m, through
          // the shared `advancePlaceRoute`). Consuming a waypoint only on EXACT
          // arrival is not what the game does, and it is not reachable either:
          // a walker pushed off a waypoint that sits a hair inside a collider's
          // reach never lands on it to the millimetre, so it turns back for it
          // every frame and oscillates in place at full stride — never stalled,
          // never arrived, and invisible to the escape ladder, which watches for
          // a walker that has STOPPED. Point 1173 measured that on
          // mongo-village at seed 42, where it cost every exchange in the run.
          if (route) advancePlaceRoute(nav, me, route, WAYPOINT_RADIUS)
          const aim = route?.length ? route[0] : goal
          const distance = Math.hypot(aim.x - me.x, aim.z - me.z)
          const step = Math.min(distance, cfg.pace * dt)
          if (distance === 0) return
          const x = me.x + (aim.x - me.x) / distance * step, z = me.z + (aim.z - me.z) / distance * step
          if (!insidePlace(bounds, x, z, WALKER_RADIUS * 2)) return
          const next = resolveMove(layout.colliders, x, z, WALKER_RADIUS, [me.x, me.z])
          const moved = Math.hypot(next[0] - me.x, next[1] - me.z)
          me.x = next[0]; me.z = next[1]
          // THE SAME ESCAPE LADDER THE SCENE WALKS (PlaceLife's household and
          // errand walkers, `balance.walkerUnstuckSeconds`). Without it this
          // simulation is STRICTER than the game and measures a stall the player
          // never sees: a route waypoint set a hair inside a collider's push-out
          // leaves the walker oscillating in place forever, which is exactly what
          // the remedy exists for. Measured on mongo-village at seed 42 once
          // point 1173 gave the settlement its room — the partner halted 2.2 m
          // short of a stand spot that was free, on a line that was clear, and no
          // exchange ever completed.
          if (moved < step * 0.25) {
            stuck[i] += dt
            if (stuck[i] > balance.walkerUnstuckSeconds) {
              const escape = escapeToFree(layout.colliders, me.x, me.z, WALKER_RADIUS, nav, anchors[i])
              me.x = escape.pos[0]; me.z = escape.pos[1]
              routes[i] = null // a route planned from where it no longer stands is worthless
              stuck[i] = 0
            }
          } else stuck[i] = 0
        })
        people.forEach((me, i) => {
          recent[i].push({ x: me.x, z: me.z })
          if (recent[i].length > Math.ceil(cfg.stallSeconds / dt)) recent[i].shift()
        })
        const tasks = [...state.tasks]
        const walking = tasks.flatMap((t, i) => t && !t.arrived ? [i] : [])
        const errorCount = errors.mock.calls.length
        const forcedCount = state.floor?.forcedCount ?? 0
        const word = stepAdultWork(state, view, dt, cfg, rand)
        if ((state.floor?.forcedCount ?? 0) > forcedCount || errors.mock.calls.length > errorCount) {
          // A nav obstruction is not a healthy situation. Prove it was stalled,
          // rather than quietly excluding a slow but moving exchange from the maximum.
          // THE INVARIANT THIS POINT OWNS: the floor never loses a word whose
          // moment had come. An exchange may still be abandoned because the
          // pair never assembled — that is a walking failure and reports under
          // its own name — but `adult-atom-lost` means the floor held a sayable
          // word until its task died, and it must never appear in healthy play.
          const said = errors.mock.calls.slice(errorCount).flat().join(' ')
          expect(said, `${id}/${seed} at ${clock}: the floor lost a word it was holding`).not.toContain('adult-atom-lost')
          expect(walking.length, `${id}/${seed}: forcing must have a physical stall ${said}`).toBeGreaterThan(0)
          const spans = walking.map((i) => Math.max(...recent[i].map((p) => Math.hypot(p.x - recent[i][0].x, p.z - recent[i][0].z))))
          // A walker that has not got anywhere is not always a walker standing
          // perfectly still: one circling a waypoint it cannot clear covers up
          // to the waypoint radius each way and arrives nowhere. The bound is
          // whichever of the two is larger, so this proves what it means to
          // prove — that nothing MOVED ON — rather than a stillness the route
          // walking never produces (point 1173).
          const stallBound = Math.max(WORK_ARRIVE_RADIUS, WAYPOINT_RADIUS)
          expect(spans.every((span) => span <= stallBound + 1e-9), `${id}/${seed}: stalled position spans ${spans}`).toBe(true)
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
