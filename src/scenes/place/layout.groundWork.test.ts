// THE GROUND WORK AND THE STONES AROUND IT (work-orders 483/1149; split out of
// `layout.test.ts` under work-order 1178). Where a villager digs, that he can
// stand in it and leave it again, and that the loose stones are either walked
// over or walked around — never both and never neither.

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { SEEDS, PORTS, VILLAGES,
  sharedLayout } from './layoutHarness'
import { digFurnitureFootprints } from './digSiteAppearance'
import {
  digLocalToWorld,
  digStandingPlaces,
  placeGroundHeight,
  spoilCentre,
  SPOIL_RADIUS_X,
} from './placeGround'
import {
  CENTRAL_GROUND_RADIUS,
  DIG_SITE_ANCHOR_REACH,
  DIG_SITE_FIELD_BAND,
  } from './layout'
import { standingClear, WALKER_RADIUS, type CircleCollider } from './collision'
import { closestOnPolyline } from './lanePlan'
import { ROCK_VILLAGE_ID } from '../../world/communicationRock'
import { bankGroundHeight, inBankPlayLane } from './riverBank'
import {
  CLIMB_ROCK_TOP,
  climbBoulder,
  looseRock,
  looseRockIsGround,
  looseRockRadius,
  looseRockTop,
} from './looseRocks'
import { pinchesPassage } from './wedgeCarve'
import { balance } from '../../config/balance'

// The landmark boulder is placed against the REAL terrain (it refuses every wet
// spot — work-order 585), so this file needs the elevation dataset the browser
// has; without it the whole map reads as ocean and no bank exists to place it on.
beforeAll(async () => {
  await setupGeodata()
})

// The village's ground work (work-order point 483): the patches the adults teach
// DIG at. A villager is SENT to one and digs there, so a patch that sits under a
// hut or on a lane teaches nothing — the placement is checked like every other
// errand target.
describe('the ground work villagers dig at (work-order 483)', () => {
  it.each([['bambara-village', 29], ['mandinka-village', 48]] as const)(
    'keeps both purposes in a narrow anchored space: %s seed %i', (id, seed) => {
    const layout = sharedLayout(id, seed)
    expect(layout.digSites).toHaveLength(2)
    expect(layout.digSites.some((site) => site.kind === 'patch')).toBe(true)
    for (const site of layout.digSites) {
      expect(site.x * layout.bank!.nx + site.z * layout.bank!.nz).toBeLessThan(0)
      const heap = spoilCentre(site)
      expect(standingClear(layout.colliders, heap.x, heap.z, SPOIL_RADIUS_X)).toBe(true)
      expect(digStandingPlaces(site, (x, z) => standingClear(layout.colliders, x, z, WALKER_RADIUS))).not.toBeNull()
    }
  })

  it.each(SEEDS)('seed %i: every village has two distinct inland purposes, each on its own spot', (seed) => {
    for (const v of VILLAGES) {
      const layout = sharedLayout(v.id, seed)
      expect(layout.digSites, v.id).toHaveLength(2)
      expect(layout.digSites.filter((s) => s.kind === 'patch'), v.id).toHaveLength(1)
      expect(layout.digSites.some((s) => s.kind === 'pit' || s.kind === 'postHole'), v.id).toBe(true)
      if (layout.bank) for (const site of layout.digSites) {
        expect(site.x * layout.bank.nx + site.z * layout.bank.nz, v.id).toBeLessThan(0)
      }
      for (let i = 0; i < layout.digSites.length; i++) {
        for (let j = i + 1; j < layout.digSites.length; j++) {
          const a = layout.digSites[i]
          const b = layout.digSites[j]
          expect(Math.hypot(a.x - b.x, a.z - b.z), `${v.id} ${a.kind}/${b.kind}`).toBeGreaterThan(2)
        }
      }
    }
  })

  it.each(SEEDS)('seed %i: a villager can stand in the ground work, and leave it again', (seed) => {
    for (const v of VILLAGES) {
      const layout = sharedLayout(v.id, seed)
      for (const site of layout.digSites) {
        const where = `${v.id} ${site.kind}`
        // Inside the walkable disc, away from the arrival corridor's edge.
        expect(Math.hypot(site.x, site.z), where).toBeLessThan(layout.radius - 1)
        // Free ground against the FULL collider set (point 155), and reachable:
        // the dig site is a target a walker heads for like any errand point.
        expect(standingClear(layout.colliders, site.x, site.z, WALKER_RADIUS), where).toBe(true)
        expect(digStandingPlaces(site, (x, z) => standingClear(layout.colliders, x, z, WALKER_RADIUS)), where).not.toBeNull()
        const heap = spoilCentre(site)
        expect(standingClear(layout.colliders, heap.x, heap.z, SPOIL_RADIUS_X), where).toBe(true)
        for (const prop of digFurnitureFootprints(site.kind)) {
          const p = digLocalToWorld(site, prop.x, prop.z)
          expect(Math.hypot(p.x, p.z) + prop.radius, where).toBeLessThan(layout.radius)
          expect(standingClear(layout.colliders, p.x, p.z, prop.radius), where).toBe(true)
        }
        // No lane runs through it: the ground work never blocks the path net.
        for (const path of layout.paths) {
          expect(closestOnPolyline(path.points, site.x, site.z).dist, where).toBeGreaterThan(
            path.width / 2,
          )
        }
      }
    }
  })

  it('leaves the ground passable: turned earth is walked over, not collided with', () => {
    const layout = sharedLayout(ROCK_VILLAGE_ID, 42)
    for (const site of layout.digSites) {
      const own = layout.colliders.filter(
        (c) => 'r' in c && Math.hypot((c as { x: number }).x - site.x, (c as { z: number }).z - site.z) < 0.5,
      )
      expect(own, site.kind).toHaveLength(0)
    }
  })

  it.each(SEEDS)('seed %i: leaves the open central ground alone', (seed) => {
    for (const v of VILLAGES) {
      const layout = sharedLayout(v.id, seed)
      for (const site of layout.digSites) {
        // Nobody digs on the village square: the picture of men digging in the
        // middle beside a pointless boulder is what work-order 688 removed.
        expect(Math.hypot(site.x, site.z), `${v.id} ${site.kind}`).toBeGreaterThanOrEqual(
          CENTRAL_GROUND_RADIUS,
        )
      }
    }
  })

  it.each(SEEDS)('seed %i: keeps every work site out of the children`s earshot', (seed) => {
    for (const v of VILLAGES) {
      const layout = sharedLayout(v.id, seed)
      const earshot = balance.communication.hearingRadius
      for (const site of layout.digSites) {
        const where = `${v.id} ${site.kind}`
        if (layout.playGround) {
          const toRim =
            Math.hypot(site.x - layout.playGround.x, site.z - layout.playGround.z) - layout.playGround.radius
          expect(toRim, `${where}: inside the roaming quarter's earshot`).toBeGreaterThanOrEqual(earshot)
        }
        for (const rock of layout.playRocks ? [layout.playRocks.upstream, layout.playRocks.downstream] : []) {
          expect(
            Math.hypot(site.x - rock.x, site.z - rock.z),
            `${where}: inside the bank stage's earshot`,
          ).toBeGreaterThanOrEqual(earshot)
        }
      }
    }
  })

  it('puts each site where its own work belongs', () => {
    // The anchor is a first-pass rule with a documented fallback (a ksar cannot
    // always give one), so this pins that the rule is doing real work rather
    // than that it never yields.
    let anchored = 0
    let total = 0
    for (const seed of SEEDS) {
      for (const v of VILLAGES) {
        const layout = sharedLayout(v.id, seed)
        for (const site of layout.digSites) {
          total++
          const toCompound = layout.dwellings.reduce(
            (best, d) => Math.min(best, Math.hypot(site.x - d.x, site.z - d.z) - d.r),
            Infinity,
          )
          const toLane = layout.paths.reduce(
            (best, p) => Math.min(best, closestOnPolyline(p.points, site.x, site.z).dist - p.width / 2),
            Infinity,
          )
          const ok =
            site.kind === 'pit'
              ? toCompound <= DIG_SITE_ANCHOR_REACH
              : site.kind === 'postHole'
                ? toLane <= DIG_SITE_ANCHOR_REACH
                : Math.hypot(site.x, site.z) >= layout.radius * DIG_SITE_FIELD_BAND
          if (ok) anchored++
        }
      }
    }
    expect(total).toBeGreaterThan(100)
    expect(anchored).toBe(total)
  })

  it('gives ports none: the teaching is a village matter', () => {
    for (const p of PORTS) expect(sharedLayout(p.id, 42).digSites, p.id).toEqual([])
  })

  it('places them deterministically, like everything else in the layout', () => {
    expect(sharedLayout(ROCK_VILLAGE_ID, 42).digSites).toEqual(sharedLayout(ROCK_VILLAGE_ID, 42).digSites)
    expect(sharedLayout(ROCK_VILLAGE_ID, 42).digSites).not.toEqual(sharedLayout(ROCK_VILLAGE_ID, 7).digSites)
  })
})

// A STONE IS EITHER GROUND OR AN OBSTACLE (work-order 1149). The user walked
// into knee-low pebbles: every scattered stone claimed a collider of at least
// half a metre, however small the thing the player saw. The classification is
// pinned in `looseRocks.test.ts`; what must hold HERE is that the settlement's
// own collider set obeys it — over the shipped villages and seeds, so no plan
// keeps a stone that both raises the ground and blocks it.
describe.each(SEEDS)('the loose stones in the collider set (seed %i)', (seed) => {
  it.each(VILLAGES.map((p) => [p.id] as const))('%s: carries only the stones that are walked around', (id) => {
    const layout = sharedLayout(id, seed)
    const circles = layout.colliders.filter((c): c is CircleCollider => 'r' in c && 'x' in c)
    let walkedOver = 0
    for (const [x, z, scale] of layout.rocks) {
      const collider = circles.find((c) => Math.hypot(c.x - x, c.z - z) < 1e-9 && Math.abs(c.r - looseRockRadius(scale)) < 1e-9)
      if (looseRockIsGround(scale)) {
        walkedOver++
        // It left the collider set — this is the snag the point removes…
        expect(collider, `${id} seed ${seed}: stone of scale ${scale} still blocks the walk`).toBeUndefined()
        // …and the walking surface carries the foot over it instead.
        expect(placeGroundHeight({ bank: layout.bank, sites: [], progress: [], rocks: layout.rocks }, x, z))
          .toBeCloseTo(bankGroundHeight(layout.bank, x, z) + looseRockTop(scale), 9)
      } else {
        expect(collider, `${id} seed ${seed}: stone of scale ${scale} lost its collider`).toBeTruthy()
        expect(placeGroundHeight({ bank: layout.bank, sites: [], progress: [], rocks: layout.rocks }, x, z))
          .toBeCloseTo(bankGroundHeight(layout.bank, x, z), 9)
      }
    }
    // The scatter really does draw stones on both sides of the cut, so the
    // check is answering about a real settlement rather than an empty case.
    expect(walkedOver, `${id} seed ${seed}: no small stone in the scatter at all`).toBeGreaterThan(0)
  })
})

// THE STONE A CHILD CLIMBS IS PLACED BY THE LAYOUT (work-order 1082). Point 1080
// searched the scatter for it — the nearest instance above a height floor — and
// the user reported the climb missing a second time: at the low end of the
// scatter's size range the "climb" is a step onto a pebble, and raising the floor
// alone sent the climber metres off. So the stone is DERIVED, the way the two
// play rocks are, and what must hold is that every village gets one, that it
// stands where the round can reach it, and that it narrows nothing.
describe.each(SEEDS)('the derived climbing stone (seed %i)', (seed) => {
  it.each(VILLAGES.map((p) => [p.id] as const))('%s: carries one beside the children`s quarter', (id) => {
    const layout = sharedLayout(id, seed)
    const quarter = layout.playGround
    expect(quarter, `${id}: a village carries a children's quarter`).toBeTruthy()
    const derived = layout.climbRock
    expect(derived, `${id} seed ${seed}: a derived climbing stone`).not.toBeNull()
    const stone = looseRock(derived!)
    // The round is handed THAT stone rather than searching for one.
    const chosen = climbBoulder(layout.rocks, quarter!, balance.villageLife.bankGame.climbableRockTop, derived)
    expect(chosen).toEqual(stone)
    // It is an ORDINARY entry of the scatter: drawn with the rest, and its
    // collider is the one the climb's approach stops outside of.
    expect(layout.rocks).toContain(derived)
    // A SEGMENT carries `r` too, but no centre — circle is `r` WITH a centre.
    const circles = layout.colliders.filter((c): c is CircleCollider => 'r' in c && 'x' in c)
    const collider = circles.find((c) => Math.hypot(c.x - stone.x, c.z - stone.z) < 1e-9)
    expect(collider?.r).toBeCloseTo(stone.radius, 9)
    // High enough to be a climb rather than a step, every time.
    expect(stone.height).toBeCloseTo(CLIMB_ROCK_TOP, 9)
    expect(stone.height).toBeGreaterThan(balance.villageLife.bankGame.climbableRockTop)
    // OUTSIDE the quarter — the group roams on open ground, not between
    // boulders — and still within a short walk of its rim.
    const away = Math.hypot(stone.x - quarter!.x, stone.z - quarter!.z)
    expect(away).toBeGreaterThanOrEqual(quarter!.radius + stone.radius + WALKER_RADIUS)
    expect(away - quarter!.radius - stone.radius - WALKER_RADIUS).toBeLessThanOrEqual(6)
    // Clear of the children's running lane and of the walk down to the water,
    // the two routes the round itself uses.
    expect(inBankPlayLane(layout.playRocks, stone.x, stone.z, stone.radius)).toBe(false)
    if (layout.bank) {
      const route = closestOnPolyline(
        [[quarter!.x, quarter!.z], [layout.bank.bank.x, layout.bank.bank.z]],
        stone.x,
        stone.z,
      ).dist
      expect(route).toBeGreaterThan(stone.radius)
    }
    // And on a lane nobody walks it off: the settlement's own paths stay clear.
    for (const path of layout.paths) {
      const d = closestOnPolyline(path.points, stone.x, stone.z).dist
      expect(d, `${id} seed ${seed}: stone on a lane`).toBeGreaterThan(path.width / 2)
    }
    // IT NARROWS NOTHING: no boundary already standing is near enough to make
    // the stone half of a pinch pair, which is what would carve a slot out of
    // the children's own ground and squeeze the group along it.
    const others = layout.colliders.filter((c) => c !== collider)
    expect(pinchesPassage(others, stone.x, stone.z, stone.radius, WALKER_RADIUS)).toBe(false)
  })
})
