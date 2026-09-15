// The walkable river bank of a riverside settlement (work-order 482). Pure
// geometry, so all of it is pinned here rather than in a browser: the village
// stays dry, the bank is REACHABLE, the water is on the side the world model
// puts it, the two stretches run opposite ways along the current, and the
// landmark boulder the chief sends the player to is nowhere near any of it.

import { describe, it, expect, beforeAll } from 'vitest'
import {
  BANK_BED_REACH,
  BANK_MAX_GAP,
  BANK_MIN_GAP,
  BANK_SHALLOWS_SPAN,
  BANK_SHORE_HALF,
  bankFillSpot,
  bankPlayRocks,
  bankWaterDepth,
  bankWaterFoot,
  buildRiverBank,
  type PlaceRiverBank,
} from './riverBank'
import { balance } from '../../config/balance'
import { BACKDROP_SCALE, GROUND_DISC_OVERHANG } from './backdrop'
import { insidePlace, isOutsidePlace, maxBoundaryRadius, groundPlateRadius, placeBoundaryRadius } from './boundary'
import { buildLayout, PLACE_RADIUS, WATER_STAND_WORK_RING } from './layout'
import { resolveMove, PLAYER_RADIUS, WALKER_RADIUS, standingClear } from './collision'
import { buildPlaceNavGrid, findPlaceRoute } from './routing'
import { PLACES, RIVERS, VILLAGE_RIVER_CLEARANCE_DEG, placeById, latLonToWorld } from '../../world/geo'
import { RIVER_WIDTH_DEG } from '../../world/riverWidth'
import { communicationRockSite, ROCK_VILLAGE_ID } from '../../world/communicationRock'
import { setupGeodata } from '../../test/geodata'

// The landmark boulder is placed against the REAL terrain (it refuses every wet
// spot — work-order 585), so this file needs the elevation dataset the browser
// has; without it the whole map reads as ocean and no bank exists to place it on.
beforeAll(async () => {
  await setupGeodata()
})

const SEED = 4711
/** The verify lane's world, and the one the F6 reports of work-order 583/584
 *  were taken in — the bank rules have to hold in both. */
const BANK_SEEDS = [SEED, 1425108822]
const village = placeById(ROCK_VILLAGE_ID)
const bank = buildRiverBank(village, PLACE_RADIUS) as PlaceRiverBank

/** Component of a point along a bank direction. */
const dot = (p: { x: number; z: number }, dx: number, dz: number) => p.x * dx + p.z * dz

describe('the PoC village stands on its river (work-order 482)', () => {
  it('has a bank at all, on the Niger', () => {
    expect(bank).not.toBeNull()
    expect(bank.riverId).toBe('niger')
  })

  it('keeps the §4.2 river clearance: the village never reaches into the water', () => {
    expect(bank.axisDeg).toBeGreaterThanOrEqual(VILLAGE_RIVER_CLEARANCE_DEG - 1e-9)
    // Which is the same statement as: the water's edge lies outside the built
    // disc, by the gap the bank rule demands.
    expect(bank.distance).toBeGreaterThanOrEqual(PLACE_RADIUS + BANK_MIN_GAP)
    expect(bank.distance).toBeLessThanOrEqual(PLACE_RADIUS + BANK_MAX_GAP)
  })

  it('lies where the world model puts the river — the same side in both views', () => {
    // The bearing of the nearest river axis from the village, in the bird's-eye
    // view's own world units, must be the bearing of the bank in the settlement.
    let best = Infinity
    let axis = { lat: 0, lon: 0 }
    for (const river of RIVERS) {
      // The course data is (lon, lat) tuples — the raw ~1890 waypoints, read
      // here independently of the densified axis the bank is measured against.
      for (const [lon, lat] of river.points) {
        const d = Math.hypot(lat - village.lat, lon - village.lon)
        if (d < best) {
          best = d
          axis = { lat, lon }
        }
      }
    }
    const here = latLonToWorld(village.lat, village.lon)
    const there = latLonToWorld(axis.lat, axis.lon)
    const len = Math.hypot(there.x - here.x, there.z - here.z)
    const worldBearing = Math.atan2((there.z - here.z) / len, (there.x - here.x) / len)
    const bankBearing = Math.atan2(bank.nz, bank.nx)
    let delta = Math.abs(worldBearing - bankBearing) % (Math.PI * 2)
    if (delta > Math.PI) delta = Math.PI * 2 - delta
    // Within a few degrees: the bank is measured against the DENSIFIED course,
    // the check against the raw control points, so a bend moves it slightly.
    expect(delta).toBeLessThan(0.25)
  })

  it('puts the waterline exactly where the panorama samples water', () => {
    // distance · BACKDROP_SCALE degrees out, plus the band's own half width, is
    // the distance to the axis: the water in the scene begins where the water
    // in the world begins.
    expect(bank.distance * BACKDROP_SCALE + RIVER_WIDTH_DEG).toBeCloseTo(bank.axisDeg, 6)
  })

  it('runs the current along the bank, square to the water', () => {
    expect(Math.hypot(bank.nx, bank.nz)).toBeCloseTo(1, 9)
    expect(Math.hypot(bank.fx, bank.fz)).toBeCloseTo(1, 9)
    expect(dot({ x: bank.fx, z: bank.fz }, bank.nx, bank.nz)).toBeCloseTo(0, 9)
  })

  it('runs DOWNSTREAM the way the course runs, source → mouth', () => {
    // The upper Niger flows north-east out of its Ségou reach: east (+x) and
    // north (−z) in the settlement's own frame.
    expect(bank.fx).toBeGreaterThan(0)
    expect(bank.fz).toBeLessThan(0)
  })
})

describe('the bank is REACHABLE, and the village stays dry', () => {
  const layout = buildLayout(ROCK_VILLAGE_ID, SEED)

  it('carries the bank into the layout', () => {
    expect(layout.bank).not.toBeNull()
    expect(layout.bank?.riverId).toBe('niger')
  })

  it('the bank point a villager stands at is inside the walkable region', () => {
    expect(isOutsidePlace(layout, bank.bank.x, bank.bank.z)).toBe(false)
    // And with a walker's clearance to spare, so it can stand there.
    expect(insidePlace(layout, bank.bank.x, bank.bank.z, WALKER_RADIUS * 2)).toBe(true)
    // It is genuinely OUT at the water, not a token step past the huts.
    expect(Math.hypot(bank.bank.x, bank.bank.z)).toBeGreaterThan(PLACE_RADIUS)
  })

  it('so are both stretches, with a walker’s clearance', () => {
    for (const p of [bank.upstream, bank.downstream]) {
      expect(isOutsidePlace(layout, p.x, p.z)).toBe(false)
      expect(insidePlace(layout, p.x, p.z, WALKER_RADIUS * 2)).toBe(true)
      expect(standingClear(layout.colliders, p.x, p.z, WALKER_RADIUS)).toBe(true)
    }
  })

  it('the two stretches run in OPPOSITE senses along the flow', () => {
    const up = dot({ x: bank.upstream.x - bank.bank.x, z: bank.upstream.z - bank.bank.z }, bank.fx, bank.fz)
    const down = dot({ x: bank.downstream.x - bank.bank.x, z: bank.downstream.z - bank.bank.z }, bank.fx, bank.fz)
    expect(up).toBeLessThan(-4)
    expect(down).toBeGreaterThan(4)
    // Mirrored, so the only thing that differs between the two pictures is the
    // direction (the rule the UPSTREAM/DOWNSTREAM teaching rests on).
    expect(up).toBeCloseTo(-down, 6)
  })

  it.each(BANK_SEEDS)('at seed %d the centre and every built thing stay dry', (seed) => {
    const layout = buildLayout(ROCK_VILLAGE_ID, seed)
    const wet = (x: number, z: number, r: number) => dot({ x, z }, bank.nx, bank.nz) + r >= bank.distance
    expect(wet(0, 0, 0)).toBe(false)
    for (const d of layout.dwellings) expect(wet(d.x, d.z, d.r), `dwelling at ${d.x},${d.z}`).toBe(false)
    for (const it of layout.interactives) expect(wet(it.pos[0], it.pos[1], 3.4)).toBe(false)
    for (const [x, z, s] of layout.rocks) expect(wet(x, z, 0.35 + s * 0.5)).toBe(false)
    for (const f of layout.flora) expect(wet(f.x, f.z, 0.45)).toBe(false)
    for (const s of layout.digSites) expect(wet(s.x, s.z, 1)).toBe(false)
    // The play rocks are the exception the rule is stated against: they stand ON
    // the bank by design (work-order 687), inland of the waterline but past the
    // built ground, so what is asserted of them is the ground plate, not dryness
    // of the village kind. `bankStage.test.ts` carries that.
    if (layout.waterPath) expect(wet(layout.waterPath.head.x, layout.waterPath.head.z, 0.5)).toBe(false)
  })

  it.each(BANK_SEEDS)('THE WATER IS NOT A WALL at seed %d: nothing invisible stands at the waterline', (seed) => {
    const layout = buildLayout(ROCK_VILLAGE_ID, seed)
    // Work-order 584, from the F6 report "Ich laufe hier gegen das Wasser wie
    // gegen eine Wand": a collider ran along the waterline and stopped the
    // player a metre short of the bank his village exists to let him reach.
    // Swept in the bank's own frame: from the top of the bank out to the wade
    // limit, along the whole stretch the walkable lobe covers, nothing solid may
    // stand. Every collider belongs to something the renderer draws, and past
    // the top of the bank the renderer draws only shore and water.
    for (let along = -12; along <= 12; along += 1) {
      for (let out = bank.walkEdge; out <= bank.wadeEdge; out += 0.25) {
        const x = bank.nx * out + bank.fx * along
        const z = bank.nz * out + bank.fz * along
        expect(
          standingClear(layout.colliders, x, z, PLAYER_RADIUS),
          `collider ${out.toFixed(2)} m out, ${along} m along the bank`,
        ).toBe(true)
      }
    }
  })

  it.each(BANK_SEEDS)('at seed %d a walk from the village centre into the river WADES, and is handed on to the map', (seed) => {
    const layout = buildLayout(ROCK_VILLAGE_ID, seed)
    // The state the decision names (work-order 584): he crosses the waterline,
    // walks on until the water is at his wading depth, and there — out of his
    // depth, where the river is swum — the settlement ends. Never a dead stop
    // inside it.
    // The route is the settlement's own — he walks round the huts and the fence
    // the way anyone crossing a village does, and the only thing under test is
    // what happens where the ground meets the water.
    const grid = buildPlaceNavGrid(layout, layout.colliders, PLAYER_RADIUS)
    const target = { x: bank.nx * bank.wadeEdge, z: bank.nz * bank.wadeEdge }
    const route = findPlaceRoute(grid, { x: 0, z: 0 }, target)
    expect(route, 'no way from the village centre to the water').not.toBeNull()
    // One step past the wade limit, so the walk ends by LEAVING rather than by
    // arriving — the traveller does not stop at the water, he goes on into it.
    const legs = [...route!, { x: bank.nx * (bank.wadeEdge + 2), z: bank.nz * (bank.wadeEdge + 2) }]

    const STEP = 0.1
    let x = 0
    let z = 0
    let left = false
    let wettest = -Infinity
    for (const leg of legs) {
      for (let i = 0; i < 4000 && !left; i++) {
        const dxl = leg.x - x
        const dzl = leg.z - z
        const d = Math.hypot(dxl, dzl)
        if (d < STEP) break
        const [px, pz] = resolveMove(layout.colliders, x + (dxl / d) * STEP, z + (dzl / d) * STEP, PLAYER_RADIUS, [x, z])
        const out = dot({ x, z }, bank.nx, bank.nz)
        // Past the top of the bank there is nothing left to slide along: a step
        // that gains nothing there is the dead stop the report described.
        if (out > bank.walkEdge - 1) {
          expect(Math.hypot(px - x, pz - z), `dead stop ${out.toFixed(2)} m out`).toBeGreaterThan(STEP * 0.9)
        }
        x = px
        z = pz
        const now = dot({ x, z }, bank.nx, bank.nz)
        if (now > bank.walkEdge) wettest = Math.max(wettest, bankWaterDepth(bank, now))
        left = isOutsidePlace(layout, x, z)
      }
      if (left) break
    }
    expect(left, 'the walk into the river never left the settlement').toBe(true)
    // He got PAST the waterline, and stood in water up to the stated depth.
    expect(dot({ x, z }, bank.nx, bank.nz)).toBeGreaterThan(bank.distance)
    expect(wettest).toBeCloseTo(balance.bankWadeDepth, 1)
  })

  it('the wade limit is solved on the drawn shore, not stated beside it', () => {
    expect(bankWaterDepth(bank, bank.wadeEdge)).toBeCloseTo(balance.bankWadeDepth, 9)
    expect(bank.wadeEdge).toBeGreaterThan(bank.distance)
    expect(bank.wadeEdge).toBeLessThan(bank.distance + BANK_SHALLOWS_SPAN + 1e-9)
  })

  it('the drawn ground reaches every walkable point — plate inland, shore at the water', () => {
    const discEdge = layout.radius + GROUND_DISC_OVERHANG
    // Half-length of the drawn shore strip, as PlaceScene builds it.
    const shoreHalf = Math.sqrt(Math.max(1, discEdge * discEdge - bank.walkEdge * bank.walkEdge))
    for (let j = 0; j < 720; j++) {
      const angle = (j / 720) * Math.PI * 2
      const plate = groundPlateRadius(layout, angle, discEdge)
      // ... never past the top of the bank, where the shore takes over.
      const rim = { x: Math.cos(angle) * plate, z: Math.sin(angle) * plate }
      expect(dot(rim, bank.nx, bank.nz)).toBeLessThanOrEqual(bank.walkEdge + 1e-6)
      // The player can never stand on ground the scene does not draw: out to the
      // boundary the plate carries him, and past the top of the bank the shore
      // strip does — along its whole length, and no further out than the bed.
      const edge = placeBoundaryRadius(layout, angle)
      const p = { x: Math.cos(angle) * edge, z: Math.sin(angle) * edge }
      const out = dot(p, bank.nx, bank.nz)
      if (out <= bank.walkEdge + 1e-9) {
        expect(plate + 1e-9, `plate at ${angle.toFixed(3)}`).toBeGreaterThanOrEqual(edge)
      } else {
        expect(out, `shore at ${angle.toFixed(3)}`).toBeLessThanOrEqual(bank.distance + BANK_BED_REACH)
        expect(Math.abs(dot(p, bank.fx, bank.fz)), `shore at ${angle.toFixed(3)}`).toBeLessThanOrEqual(shoreHalf)
      }
    }
  })

  it('leaves the shore strip room between the top of the bank and the water', () => {
    expect(bank.walkEdge).toBeCloseTo(bank.distance - BANK_SHORE_HALF, 9)
  })
})

describe('the landmark boulder is nowhere near the settlement (work-order 482 item 6)', () => {
  it('lies far outside the walkable region, upstream', () => {
    const layout = buildLayout(ROCK_VILLAGE_ID, SEED)
    for (const seed of [1, 7, 42, 1337, 90210]) {
      const rock = communicationRockSite(seed)
      // Expressed in the settlement's own frame (the panorama's scale).
      const x = (rock.lon - village.lon) / BACKDROP_SCALE
      const z = -(rock.lat - village.lat) / BACKDROP_SCALE
      expect(isOutsidePlace(layout, x, z)).toBe(true)
      expect(Math.hypot(x, z)).toBeGreaterThan(maxBoundaryRadius(layout) * 5)
      // And it stands on the same river the bank belongs to.
      expect(rock.upstreamDeg).toBeGreaterThan(1)
    }
  })
})

describe('a bank exists only where the geography carries one', () => {
  it('no port grows one — a port sits AT its river by design (§4.2 exemption)', () => {
    for (const place of PLACES.filter((p) => p.kind === 'port')) {
      expect(buildRiverBank(place, 30 + (place.size ?? 2) * 6), place.id).toBeNull()
    }
  })

  it('no monument site grows one', () => {
    for (const place of PLACES.filter((p) => p.kind === 'monument')) {
      expect(buildRiverBank(place, PLACE_RADIUS), place.id).toBeNull()
    }
  })

  it('a village away from every river has none, and the riverside ones all do', () => {
    const withBank = PLACES.filter((p) => p.kind === 'village' && buildRiverBank(p, PLACE_RADIUS)).map((p) => p.id)
    expect(withBank).toContain(ROCK_VILLAGE_ID)
    expect(withBank).not.toContain('san-village')
    expect(withBank).not.toContain('maasai-village')
    // Every one of them stands on a real course, at the water's edge.
    for (const id of withBank) {
      const b = buildRiverBank(placeById(id), PLACE_RADIUS) as PlaceRiverBank
      expect(RIVERS.some((r) => r.id === b.riverId), id).toBe(true)
      expect(b.distance, id).toBeGreaterThan(PLACE_RADIUS)
    }
  })

  it('every place in the roster still builds a layout, bank or no bank', () => {
    for (const place of PLACES) {
      const layout = buildLayout(place.id, SEED)
      expect(layout.radius, place.id).toBeGreaterThan(0)
      if (place.kind !== 'village') expect(layout.bank, place.id).toBeNull()
    }
  })
})

// THE CHILDREN'S RUNNING LANE IS WALKABLE END TO END (work-order 687,
// cross-vendor review 29.08.2026). The round needs a clear corridor between the
// two play rocks, and the lane test that keeps it clear used to guard the LOOSE
// DRESSING alone — flora and boulders — so the guarantee held against those and
// against nothing else. A hut, a compound fence or one of the hard-placed
// village props reaching into it would have stood there, and a child would have
// spent the run phase driving at solid geometry while the phase clock ran.
//
// This reads the SHIPPED collider set rather than the predicates the placement
// was built from, so it sees whatever put a body there — including the fire pit,
// the loom and the life-spot props, which never pass through `isFree` at all and
// which the rule therefore cannot catch. Measured 29.08.2026 it is clear across
// sixty river layouts for two independent reasons: the rule now refuses the
// lane, and the bank lies where the buildings do not go. Its worth is the day
// either of those stops being true.
describe('nothing solid stands in the children`s running lane (work-order 687)', () => {
  it('sweeps the lane between the play rocks against the full collider set', () => {
    let checked = 0
    for (const id of ['bambara-village', 'maasai-village', 'swahili-village']) {
      for (let seed = 1; seed <= 60; seed++) {
        const layout = buildLayout(id, seed)
        const rocks = layout.playRocks
        if (!rocks) continue
        checked++
        const a = rocks.upstream
        const b = rocks.downstream
        for (let t = 0; t <= 1.0001; t += 0.02) {
          const x = a.x + (b.x - a.x) * t
          const z = a.z + (b.z - a.z) * t
          // The rocks themselves are the lane's ENDS and are meant to be solid;
          // what must stay clear is the running ground between them.
          if (Math.hypot(x - a.x, z - a.z) < rocks.r + 0.35) continue
          if (Math.hypot(x - b.x, z - b.z) < rocks.r + 0.35) continue
          expect(
            standingClear(layout.colliders, x, z, WALKER_RADIUS),
            `${id} seed ${seed}: a body stands ${(t * 100).toFixed(0)} % along the lane`,
          ).toBe(true)
        }
      }
    }
    // The sweep is worthless if it found no lane to sweep.
    expect(checked).toBeGreaterThan(0)
    // A hundred and eighty layouts built and swept: 18 s alone on this machine,
    // and over the default 20 s budget under the full suite's worker contention.
    // A measurement this long carries its own budget, not a flake.
  }, 90_000)

  // AND THE STAGE IS THE ONE THE BANK ACTUALLY SETTLED ON. The play rocks are
  // derived from the bank points, and `settleBankPoints` may pull those inland
  // afterwards, so a stage read before the settling and a bank read after it are
  // two different geometries. Measured today the settling moves nothing at all,
  // which is exactly why the layout re-derives rather than trusts: a divergence
  // with no symptom is one nobody finds until a player stands in it.
  it('returns play rocks derived from the SETTLED bank, not the one before it', () => {
    for (const id of ['bambara-village', 'maasai-village', 'swahili-village']) {
      for (let seed = 1; seed <= 40; seed++) {
        const layout = buildLayout(id, seed)
        if (!layout.bank || !layout.playRocks) continue
        const fromSettled = bankPlayRocks(layout.bank)
        expect(layout.playRocks.upstream, `${id} seed ${seed}`).toEqual(fromSettled.upstream)
        expect(layout.playRocks.downstream, `${id} seed ${seed}`).toEqual(fromSettled.downstream)
      }
    }
  })
})

// THE THREE RIVER PLACES STAY FAR ENOUGH APART TO BE TOLD APART (points
// 686/687). The village teaches RIVER, UPSTREAM and DOWNSTREAM by WHERE a
// figure stands and walks, so if two of the named points sit within one
// arrival's reach of each other, a walk up the stretch also reads as a walk to
// the water and the direction cannot be learned from the picture at all.
//
// This assertion existed and was DELETED with `adultErrands.test.ts` when the
// six-concept catalogue went (cross-vendor review, 29.08.2026: it was the only
// check of the separation on the REAL layout, and nothing replaced it). It is
// restored here, where the bank itself lives, so it no longer depends on a
// catalogue that may be rebuilt or dropped again. The 2.6 m is the reach the
// retired `placeOf` counted as standing AT a place; the constant went with its
// module, so it is written down here with what it means rather than imported
// from something that no longer exists.
describe('the river places can be told apart (points 686/687)', () => {
  const AT_PLACE_REACH = 2.6
  it('keeps bank, upstream and downstream more than one arrival apart', () => {
    let checked = 0
    for (const id of ['bambara-village', 'maasai-village', 'swahili-village']) {
      for (let seed = 1; seed <= 40; seed++) {
        const layout = buildLayout(id, seed)
        const bank = layout.bank
        if (!bank) continue
        checked++
        const named: Array<[string, { x: number; z: number }]> = [
          ['bank', bank.bank],
          ['upstream', bank.upstream],
          ['downstream', bank.downstream],
        ]
        for (let i = 0; i < named.length; i++) {
          for (let j = i + 1; j < named.length; j++) {
            const d = Math.hypot(named[i][1].x - named[j][1].x, named[i][1].z - named[j][1].z)
            expect(
              d,
              `${id} seed ${seed}: ${named[i][0]} and ${named[j][0]} are ${d.toFixed(2)} m apart`,
            ).toBeGreaterThan(AT_PLACE_REACH * 2)
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(0)
  })
})

// --- Where the water carrier fills his jar (work-order 1087) ---------------
//
// The errand used to stop at `bankWaterFoot`, which sits BANK_STAND_INSET inland
// of the walkable edge: about 2.7 m short of the water, which is why the user
// (06.09.2026) could not tell that water was being fetched. The fill spot is a
// separate point solved on the shore profile, and what is pinned here is that it
// really is AT the water and that standing in it is never wading.
describe('the water carrier fills his jar at the waterline (work-order 1087)', () => {
  // Measured: these three are the places `buildRiverBank` returns a bank for at
  // every seed; every other place is dry.
  const riverVillages = ['nubian-village', 'bambara-village', 'mandinka-village']

  it('stands the carrier ankle-deep, past the waterline and far short of the wade edge', () => {
    let checked = 0
    for (const id of riverVillages) {
      for (let seed = 1; seed <= 20; seed++) {
        const bank = buildLayout(id, seed).bank
        if (!bank) continue
        checked++
        const spot = bankFillSpot(bank)
        // Distance measured along the bank NORMAL, which is the axis the shore
        // profile is written on.
        const out = spot.x * bank.nx + spot.z * bank.nz
        expect(out).toBeGreaterThan(bank.distance)
        expect(bankWaterDepth(bank, out)).toBeCloseTo(balance.bankFillDepth, 6)
        expect(bankWaterDepth(bank, out)).toBeLessThan(balance.bankWadeDepth)
        expect(out).toBeLessThan(bank.wadeEdge)
        // "At the water" is the whole point. Ankle depth puts him about half a
        // metre out on the shallows' slope; what is pinned is that he never
        // leaves the DRAWN shore strip for the open channel, against the 2.7 m
        // up the bank the errand used to halt at.
        expect(out - bank.distance).toBeLessThan(BANK_SHORE_HALF)
      }
    }
    expect(checked).toBe(riverVillages.length * 20)
  })

  it('leaves the path`s landing where it is — only the fill moved', () => {
    const bank = buildLayout('bambara-village', 1).bank
    expect(bank).toBeTruthy()
    if (!bank) return
    const foot = bankWaterFoot(bank)
    const footOut = foot.x * bank.nx + foot.z * bank.nz
    expect(footOut).toBeLessThan(bank.walkEdge)
    // The two lie on one bearing: the carrier walks straight down to the water.
    expect(Math.atan2(foot.z, foot.x)).toBeCloseTo(Math.atan2(bankFillSpot(bank).z, bankFillSpot(bank).x), 6)
  })
})

// --- The village water stand is a place men can reach (work-order 1087) -----
//
// MEASURED 12.09.2026 in the running settlement: a stand whose own footprint was
// clear still left the carrier stalled 4.2 m away, never counted as arrived,
// circling it until the errand's backstop expired. The ring the two men work
// from lay inside the fire's keep-out. What is pinned here is the ring, not the
// spot.
describe('the village water stand can be walked up to (work-order 1087)', () => {
  const riverVillages = ['nubian-village', 'bambara-village', 'mandinka-village']

  it('leaves most of the working ring around it open ground', () => {
    let checked = 0
    for (const id of riverVillages) {
      for (let seed = 1; seed <= 20; seed++) {
        const layout = buildLayout(id, seed)
        const stand = layout.waterStand
        if (!stand) continue
        checked++
        let open = 0
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2
          const x = stand.x + Math.cos(a) * WATER_STAND_WORK_RING
          const z = stand.z + Math.sin(a) * WATER_STAND_WORK_RING
          if (standingClear(layout.colliders, x, z, WALKER_RADIUS)) open++
        }
        expect(open).toBeGreaterThanOrEqual(9)
      }
    }
    // Not every sweep, because a village whose head search gives up its water
    // path keeps no stand either — but most of them, so a silent collapse of the
    // placement still reads here.
    expect(checked).toBeGreaterThan(riverVillages.length * 20 * 0.7)
  })

  it('gives every river village that fetches water a stand at all', () => {
    // A river village with no usable WATER PATH fetches nothing and rightly has
    // no stand (point 1045 owns the walk it cannot find); every village that
    // does fetch must have one, or the return leg has nowhere to go.
    let fetching = 0
    for (const id of riverVillages) {
      for (let seed = 1; seed <= 20; seed++) {
        const layout = buildLayout(id, seed)
        if (!layout.waterPath) continue
        fetching++
        expect(layout.waterStand, `${id} seed ${seed}: a water path but no stand`).toBeTruthy()
      }
    }
    expect(fetching).toBeGreaterThan(riverVillages.length * 20 * 0.7)
  })

  it('never stands one in a drawn lane', () => {
    // A LANE CARRIES NO COLLIDER, so the stand's footprint test cannot see one
    // and a solid body was accepted in the middle of a path people walk:
    // mandinka-village seed 7 put it 0.50 m off the centre of a lane 1.30 m wide.
    for (const id of riverVillages) {
      for (let seed = 1; seed <= 20; seed++) {
        const layout = buildLayout(id, seed)
        const stand = layout.waterStand
        if (!stand) continue
        for (const path of layout.paths) {
          for (let k = 0; k + 1 < path.points.length; k++) {
            const [ax, az] = path.points[k]
            const [bx, bz] = path.points[k + 1]
            const dx = bx - ax
            const dz = bz - az
            const len2 = dx * dx + dz * dz
            const t = len2 < 1e-9 ? 0 : Math.max(0, Math.min(1, ((stand.x - ax) * dx + (stand.z - az) * dz) / len2))
            const gap = Math.hypot(stand.x - (ax + dx * t), stand.z - (az + dz * t))
            expect(gap, `${id} seed ${seed}: the stand sits ${gap.toFixed(2)} m off a lane ${path.width} m wide`)
              .toBeGreaterThan(path.width / 2)
          }
        }
      }
    }
  })

  it('keeps no stand in a village whose water path was given up', () => {
    // The stand is placed while every bank still has a PROVISIONAL path, and the
    // head search may discard that path further down — which left a water stand
    // and its collider standing in a village no adult ever fetches water in.
    // Measured 12.09.2026 at bambara-village, seeds 2 and 7.
    let seenWithoutPath = 0
    for (const id of riverVillages) {
      for (let seed = 1; seed <= 40; seed++) {
        const layout = buildLayout(id, seed)
        if (!layout.waterPath) {
          seenWithoutPath++
          expect(layout.waterStand, `${id} seed ${seed}: a stand with no water path`).toBeNull()
        }
      }
    }
    // The case is only worth its runtime while such a village exists at all.
    expect(seenWithoutPath).toBeGreaterThan(0)
  })
})

// --- The round trip fits inside the errand's backstop (work-order 1087) -----
//
// `errandSeconds` was sized for the errand the water fetch USED to be: a walk
// OUT to the bank, and its own comment still said "some forty metres of village
// away". This point made it a ROUND TRIP — to the stand, on to the water, a dip,
// and the whole way back to report — without re-sizing the budget, though the
// point's own text requires the backstops to cover the added leg. The cost was
// measured in the WebGPU pass of 12.09.2026: "[ASSERT] adult-atom-lost —
// water-back: villager 1 ran out of time with his walk word unspoken". The jar
// was set down, the report never fell, and RIVER is taught by the report.
//
// What is pinned is the ARITHMETIC, not a simulation: the walk the carrier is
// ordered to make, at the pace he makes it, against the budget he is given.
describe('the water errand fits the time it is given (work-order 1087)', () => {
  const riverVillages = ['nubian-village', 'bambara-village', 'mandinka-village']

  it('leaves room for the round trip and a walk that is not a straight line', () => {
    const { errandSeconds, pace } = balance.villageLife.adultErrands
    let worst = 0
    let worstWhere = ''
    let checked = 0
    for (const id of riverVillages) {
      for (let seed = 1; seed <= 20; seed++) {
        const layout = buildLayout(id, seed)
        const stand = layout.waterStand
        if (!stand || !layout.bank) continue
        checked++
        const fill = bankFillSpot(layout.bank)
        // The carrier's own walk to the stand is bounded by the same leg: he is
        // picked in the village, never further out than the water he is sent to.
        const leg = Math.hypot(stand.x - fill.x, stand.z - fill.z)
        const straight = leg * 3 // to the stand, out to the water, and back
        const seconds = straight / pace + balance.bankFillSeconds
        if (seconds > worst) {
          worst = seconds
          worstWhere = `${id} seed ${seed}`
        }
      }
    }
    expect(checked).toBeGreaterThan(riverVillages.length * 20 * 0.7)
    // THE BUDGET IS NOT THE WALK. The backstop has to cover the walk AND what
    // the errand legitimately spends standing still, or it expires on a carrier
    // who is doing everything right. Built from the constants that spend it,
    // with no factor invented for the occasion:
    //   - a DOUBLE of the straight line, because the route bends round huts,
    //     fires and other villagers — an ordinary walk here, not a bad one;
    //   - `dwellSeconds`, which he spends arrived before he moves on;
    //   - `stallSeconds`, the longest a legitimate detour may make no headway
    //     at all before the stall watch lets him go anyway.
    // At the old 180 s this sum did not fit, and the report was the part that
    // fell off the end.
    const { dwellSeconds, stallSeconds } = balance.villageLife.adultErrands
    const needed = worst * 2 + dwellSeconds + stallSeconds
    expect(
      needed,
      `${worstWhere}: the round trip needs ${worst.toFixed(1)} s of straight line, ` +
        `${needed.toFixed(1)} s once it walks round things, dwells and waits, ` +
        `against errandSeconds ${errandSeconds}`,
    ).toBeLessThan(errandSeconds)
  })
})
