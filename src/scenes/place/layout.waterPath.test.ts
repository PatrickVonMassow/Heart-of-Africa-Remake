// THE WATER PATH AND THE TWO BANK ROCKS (work-order 688; split out of
// `layout.test.ts` under work-order 1178). The adults teach river bearings at
// the water, so the path to it has to exist, stay unobstructed and survive a
// rebuild of the gate — and the lone teaching stone it replaced has to be gone.

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { SEEDS, REPORTED_SEED, WEDGE_SEED, VILLAGES } from './layoutHarness'
import {
  PLAY_ROCK_SPAN,
  PLACE_RADIUS,
  VILLAGE_FIRE,
  WATER_PATH_HEAD_RADII,
  WATER_PATH_WIDTH,
  WATER_STAND_RADIUS,
  buildLayout,
  fenceColliders,
  fencePanels,
} from './layout'
import { boxCollider, standingClear, WALKER_RADIUS } from './collision'
import { closestOnPolyline } from './lanePlan'
import { PLACES, placeById } from '../../world/geo'
import {
  ROCK_VILLAGE_ID,
  ROCK_FOOTPRINT_UNITS,
  communicationRockSite,
} from '../../world/communicationRock'
import { buildRiverBank, inBankPlayLane } from './riverBank'
import { mulberry32 } from '../../world/noise'
import { VILLAGE_SPOTS } from './lifeSpots'
import { WARP_BODY_RADIUS, WEAVER_BODY_RADIUS } from './loom'

// The landmark boulder is placed against the REAL terrain (it refuses every wet
// spot — work-order 585), so this file needs the elevation dataset the browser
// has; without it the whole map reads as ocean and no bank exists to place it on.
beforeAll(async () => {
  await setupGeodata()
})

// THE VILLAGE'S SINGLE TEACHING STONE IS GONE (work-order 688). It stood in the
// open of the PoC village, and a boulder on the village square that everybody
// walked to for no reason is exactly what the user read as meaningless on
// 13.08.2026. The word ROCK is learnt at the two PLAY ROCKS on the bank now
// (work-order 687, pinned in `bankStage.test.ts`), which are large detailed
// variants of the ordinary rock rather than another loose piece of dressing.
describe('no settlement carries a lone teaching stone any more (work-order 688)', () => {
  it('gives every village its two bank rocks instead, and no third stone', () => {
    for (const p of PLACES) {
      const layout = buildLayout(p.id, 42)
      expect('teachingStone' in layout, `${p.id}: the field itself is gone`).toBe(false)
      expect(!!layout.playRocks, `${p.id}: rocks exactly where there is a bank`).toBe(!!layout.bank)
    }
  })

  it('keeps the play rocks markedly larger than the loose rock dressing', () => {
    for (const id of ['nubian-village', 'bambara-village', 'mandinka-village']) {
      const layout = buildLayout(id, 42)
      const rocks = layout.playRocks
      expect(rocks, id).not.toBeNull()
      if (!rocks) continue
      // The scatter runs scale 0.3-1.0 on a 0.5-radius blob, i.e. up to 0.5 m of
      // footprint; a play rock's DRAWN span is PLAY_ROCK_SPAN. It reads as A
      // ROCK rather than as one more pebble — which is a question about what is
      // drawn, not about the collider behind it.
      for (const [, , s] of layout.rocks) {
        expect(ROCK_FOOTPRINT_UNITS * rocks.scale).toBeGreaterThan(s * 0.5 * 2)
      }
    }
  })

  it('keeps the play rocks settlement-sized and the erratic a journey away', () => {
    const layout = buildLayout(ROCK_VILLAGE_ID, 42)
    const rocks = layout.playRocks
    expect(rocks).not.toBeNull()
    if (!rocks) return
    const village = placeById(ROCK_VILLAGE_ID)
    const rock = communicationRockSite(42)
    // SETTLEMENT SCALE, NOT WORLD SCALE. The drawn footprint follows from the
    // instance scale and remains exactly PLAY_ROCK_SPAN. The collider is a
    // SMALLER, separately measured number (see PLAY_ROCK_RADIUS): the span is
    // the stone's widest ring, and it is nowhere near the ground.
    expect(ROCK_FOOTPRINT_UNITS * rocks.scale).toBeCloseTo(PLAY_ROCK_SPAN, 6)
    expect(rocks.r).toBeLessThan(ROCK_FOOTPRINT_UNITS * rocks.scale)
    // Distance: the play rocks are a walk down the bank, the erratic a journey.
    expect(Math.hypot(rocks.upstream.x, rocks.upstream.z)).toBeLessThan(layout.radius + 12)
    expect(Math.hypot(rock.lat - village.lat, rock.lon - village.lon)).toBeGreaterThan(1)
  })
})

// THE WATER PATH (work-order 688). The adults teach RIVER by fetching water, so
// there has to be a path to fetch it along: a head in the village where both
// carriers speak, a foot at the river where neither does, and a walk between the
// two that crosses neither a building nor the children's running lane.
describe('the village water path (work-order 688)', () => {
  const random = mulberry32(1045)
  const waterSeeds = [...new Set([
    ...SEEDS, REPORTED_SEED, WEDGE_SEED, 1239784450, 2987912600,
    ...Array.from({ length: 120 }, () => Math.floor(random() * 0x100000000)),
  ])]
  let riverVillages: string[] = []
  beforeAll(() => {
    riverVillages = VILLAGES.filter((p) => buildRiverBank(p, PLACE_RADIUS)).map((p) => p.id)
    expect(riverVillages).toContain('bambara-village')
  })

  it('exists exactly where there is a bank', () => {
    for (const p of PLACES) {
      const layout = buildLayout(p.id, 42)
      expect(!!layout.waterPath, p.id).toBe(!!layout.bank)
    }
  })

  it.each(waterSeeds)('seed %i: every river village has a drawn, unobstructed water path and stand', (seed) => {
    for (const id of riverVillages) {
      const layout = buildLayout(id, seed)
      const label = `${id}@${seed}`
      expect(layout.waterPath, label).not.toBeNull()
      expect(layout.waterStand, label).not.toBeNull()
      const path = layout.waterPath!
      const lane = layout.paths.find((p) => p.width === WATER_PATH_WIDTH
        && p.points[0][0] === path.head.x && p.points[0][1] === path.head.z)
      expect(lane, label).toBeDefined()
      expect(lane!.points.at(-1), label).toEqual([path.foot.x, path.foot.z])
      for (let i = 1; i < lane!.points.length; i++) {
        const [ax, az] = lane!.points[i - 1]
        const [bx, bz] = lane!.points[i]
        const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.025)
        for (let k = 0; k <= steps; k++) {
          const x = ax + (bx - ax) * k / steps
          const z = az + (bz - az) * k / steps
          if (!standingClear(layout.colliders, x, z, lane!.width / 2)) {
            expect.fail(`${label}: drawn water lane hits a collider at ${x}, ${z}`)
          }
          if (inBankPlayLane(layout.playRocks, x, z, WALKER_RADIUS + lane!.width / 2)) {
            expect.fail(`${label}: water lane crosses the children's run at ${x}, ${z}`)
          }
        }
      }
    }
  })

  // Seeds whose water lane actually has to cross a compound wall, so the gate
  // branch is exercised rather than merely present. Re-picked by point 1173:
  // the settlement grew, the carriers' lane more often finds a way round the
  // compounds, and the four seeds that used to need a gate stopped needing one —
  // which made every case below pass while testing nothing. These two are what
  // a sweep of the first 2000 seeds still routes through a wall.
  const gatedSeeds = [330, 762]

  it.each(gatedSeeds)('seed %i: gate rebuilding preserves village props and exactly two settled rock colliders', (seed) => {
    const layout = buildLayout('bambara-village', seed)
    const props = [
      { x: VILLAGE_FIRE[0], z: VILLAGE_FIRE[1], r: 1.3 },
      { x: VILLAGE_SPOTS.talkers[0], z: VILLAGE_SPOTS.talkers[1], r: 0.85 },
      { x: VILLAGE_SPOTS.pounder[0], z: VILLAGE_SPOTS.pounder[1], r: 0.55 },
      { x: VILLAGE_SPOTS.drummer[0], z: VILLAGE_SPOTS.drummer[1], r: 0.8 },
      // No well here: this village draws its water from the river (point 1092).
    ]
    for (const prop of props) expect(layout.colliders).toContainEqual(prop)
    // The loom is no longer a circle at a constant (work-order 1157): the gate
    // rebuild must carry its WARP — a segment from stake to stake — and the
    // weaver beside its middle, both derived from the settled bank.
    const loom = layout.loom
    expect(loom).not.toBeNull()
    expect(layout.colliders).toContainEqual({
      kind: 'segment',
      x1: loom!.upstream.x, z1: loom!.upstream.z,
      x2: loom!.downstream.x, z2: loom!.downstream.z,
      r: WARP_BODY_RADIUS,
    })
    expect(layout.colliders).toContainEqual({ x: loom!.weaver.x, z: loom!.weaver.z, r: WEAVER_BODY_RADIUS })
    expect(layout.waterStand).not.toBeNull()
    expect(layout.colliders).toContainEqual({ ...layout.waterStand!, r: WATER_STAND_RADIUS })

    expect(layout.playRocks).not.toBeNull()
    const rocks = layout.playRocks!
    const rockColliders = layout.colliders.filter((c) =>
      (c.kind === undefined || c.kind === 'circle') && c.r === rocks.r,
    )
    expect(rockColliders).toHaveLength(2)
    for (const rock of [rocks.upstream, rocks.downstream]) {
      expect(rockColliders).toContainEqual({ x: rock.x, z: rock.z, r: rocks.r })
    }
  })

  it.each(gatedSeeds)('seed %i: the compound crossing is a drawn gate with matching collision', (seed) => {
    const layout = buildLayout('bambara-village', seed)
    const { head, foot } = layout.waterPath!
    const line: Array<[number, number]> = [[head.x, head.z], [foot.x, foot.z]]
    let crossedGates = 0
    for (const fence of layout.fences) {
      const run = fenceColliders(fence)
      expect(layout.colliders).toEqual(expect.arrayContaining(run))
      for (let i = 0; i < run.length; i++) {
        if (run[i].kind === 'segment') continue
        const a = fence.posts[i]
        const b = fence.posts[(i + 1) % fence.posts.length]
        // A gap crossed by the lane must have no bridging wall collider.
        for (let k = 0; k <= 100; k++) {
          const x = a[0] + (b[0] - a[0]) * k / 100
          const z = a[1] + (b[1] - a[1]) * k / 100
          if (closestOnPolyline(line, x, z).dist < WATER_PATH_WIDTH / 2) {
            crossedGates++
            break
          }
        }
      }
    }
    expect(crossedGates, 'the lane actually passes through a compound opening').toBeGreaterThan(0)
    // Woven panels use these exact half-extents in PlaceScene's Fences mesh.
    // A gate-end panel turns toward the next surviving post; test its corners
    // too, so rotating that last short panel cannot hide a drawn obstruction.
    const drawn = fencePanels(layout.fences).filter((p) => p.kind === 'woven')
      .map((p) => boxCollider(p.x, p.z, 0.41, 0.035, p.rot, 0))
    const steps = Math.ceil(Math.hypot(foot.x - head.x, foot.z - head.z) / 0.025)
    for (let k = 0; k <= steps; k++) {
      const x = head.x + (foot.x - head.x) * k / steps
      const z = head.z + (foot.z - head.z) * k / steps
      expect(standingClear(drawn, x, z, WATER_PATH_WIDTH / 2)).toBe(true)
    }
  })

  it.each(SEEDS)('seed %i: runs from the village out to the water', (seed) => {
    for (const id of riverVillages) {
      const layout = buildLayout(id, seed)
      const path = layout.waterPath
      const bank = layout.bank
      expect(path, id).not.toBeNull()
      if (!path || !bank) continue
      // The head stands in the village, at the sweep's own radius, on free
      // ground a villager can speak from.
      const headR = Math.hypot(path.head.x, path.head.z)
      expect(WATER_PATH_HEAD_RADII.map((r) => Math.abs(headR - r) < 1e-6), `${id}: head radius ${headR}`).toContain(true)
      expect(standingClear(layout.colliders, path.head.x, path.head.z, WALKER_RADIUS), `${id}: head is free`).toBe(true)
      // The foot stands AT the water, on the flat plate rather than on the shore.
      const out = path.foot.x * bank.nx + path.foot.z * bank.nz
      expect(out, `${id}: foot is on the plate`).toBeLessThanOrEqual(bank.walkEdge)
      expect(out, `${id}: foot is at the water, not in the village`).toBeGreaterThan(layout.radius * 0.8)
      expect(standingClear(layout.colliders, path.foot.x, path.foot.z, WALKER_RADIUS), `${id}: foot is free`).toBe(true)
      // And the head is nearer the middle than the foot is, so the walk really
      // leads OUT of the settlement.
      expect(Math.hypot(path.head.x, path.head.z)).toBeLessThan(Math.hypot(path.foot.x, path.foot.z))
    }
  })

  it.each(SEEDS)('seed %i: meets the bank OUTSIDE the children`s stretch', (seed) => {
    for (const id of riverVillages) {
      const layout = buildLayout(id, seed)
      const path = layout.waterPath
      const rocks = layout.playRocks
      expect(path, id).not.toBeNull()
      expect(rocks, id).not.toBeNull()
      if (!path || !rocks) continue
      // Not in the running lane at its foot, and not anywhere along its length —
      // a carrier crossing the lane would be read as part of the game.
      for (let t = 0; t <= 40; t++) {
        const x = path.head.x + (path.foot.x - path.head.x) * (t / 40)
        const z = path.head.z + (path.foot.z - path.head.z) * (t / 40)
        expect(
          inBankPlayLane(rocks, x, z, WALKER_RADIUS + WATER_PATH_WIDTH / 2),
          `${id}: the walk crosses the children's lane at t=${t}`,
        ).toBe(false)
      }
      // And the foot lies BEYOND one of the rocks rather than between the two:
      // its distance along the bank from the descent exceeds the stretch's own.
      const bank = layout.bank!
      const along = (p: { x: number; z: number }) => p.x * bank.fx + p.z * bank.fz
      const stretch = Math.max(Math.abs(along(rocks.upstream)), Math.abs(along(rocks.downstream)))
      expect(Math.abs(along(path.foot)), `${id}: foot beyond the stretch`).toBeGreaterThan(stretch)
    }
  })

  it.each(SEEDS)('seed %i: is a drawn lane nothing is built on', (seed) => {
    for (const id of riverVillages) {
      const layout = buildLayout(id, seed)
      const path = layout.waterPath
      expect(path, id).not.toBeNull()
      if (!path) continue
      const lane = layout.paths.find(
        (p) =>
          p.width === WATER_PATH_WIDTH &&
          Math.hypot(p.points[0][0] - path.head.x, p.points[0][1] - path.head.z) < 1e-6,
      )
      expect(lane, `${id}: the water path is in the drawn lane net`).toBeTruthy()
    }
  })
})
