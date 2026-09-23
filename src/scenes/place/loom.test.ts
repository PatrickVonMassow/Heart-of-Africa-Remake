import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { balance } from '../../config/balance'
import { buildLayout, onWayOut, WATER_PATH_WIDTH } from './layout'
import { sharedLayout } from './layoutHarness'
import { closestOnPolyline } from './lanePlan'
import { standsOnGroundPlate } from './riverBank'
import { standingClear, WALKER_RADIUS } from './collision'
import {
  HELPER_SIDE_OFFSET,
  WEAVER_SIDE_OFFSET,
  loomAround,
  placeLoom,
  stationGround,
  waterAhead,
  WARP_BODY_RADIUS,
  WEAVER_BODY_RADIUS,
} from './loom'

beforeAll(setupGeodata)

const VILLAGES = PLACES.filter((p) => p.kind === 'village').map((p) => p.id)
const SEEDS = [7, 42, 1337, 394349866, 1838110026]

/** Every shipped village layout the assertions below are made against. */
function shippedLooms() {
  const out: Array<{ id: string; seed: number; layout: ReturnType<typeof buildLayout> }> = []
  for (const id of VILLAGES) {
    for (const seed of SEEDS) out.push({ id, seed, layout: sharedLayout(id, seed) })
  }
  return out
}

/**
 * The widest corridor of open ground any stand on the plaza looks at the loom
 * through — recomputed here from the finished layout rather than read back from
 * the placement, so the rule is checked and not merely echoed (work-order 1190).
 *
 * The station's OWN bodies are left out: the warp, its stakes and the weaver are
 * what the line is drawn to, and they stand at the far end of it.
 */
function plazaViewOf(layout: ReturnType<typeof buildLayout>): number {
  const loom = layout.loom
  if (!loom) return 0
  const solids = layout.colliders.filter(
    (c) => Math.hypot(c.x - loom.seat.x, c.z - loom.seat.z) > 4,
  )
  let widest = 0
  for (const ring of [0, 1.5, 3, 4.5, 6]) {
    for (let k = 0; k < (ring ? 8 : 1); k++) {
      const a = (k / 8) * Math.PI * 2
      const x = Math.cos(a) * ring
      const z = 3 + Math.sin(a) * ring
      const dist = Math.hypot(loom.weaver.x - x, loom.weaver.z - z)
      if (dist < 8) continue
      if (!standingClear(layout.colliders, x, z, WALKER_RADIUS)) continue
      for (const half of [0.25, 0.5, 0.75, 1]) {
        if (half <= widest) continue
        let open = true
        for (let step = 0; step <= 64; step++) {
          const t = (step / 64) * ((dist - 2) / dist)
          const px = x + (loom.weaver.x - x) * t
          const pz = z + (loom.weaver.z - z) * t
          if (!standingClear(solids, px, pz, half)) { open = false; break }
        }
        if (open) widest = half
      }
    }
  }
  return widest
}

describe('the village plaza sees the loom (work-order 1190)', () => {
  it('the Bambara plaza always looks at the station over some open ground', () => {
    // Seeds 1337 and 394349866 held no full metre until a household could give
    // way (work-order 1191); every shipped Bambara plan does now. Where a plan
    // still cannot, the placement takes the WIDEST view going, and the floor
    // asserted here is that no plan is seated blind.
    const blind = shippedLooms()
      .filter(({ id }) => id.startsWith('bambara'))
      .filter(({ layout }) => plazaViewOf(layout) <= 0)
      .map(({ id, seed }) => `${id}/${seed}`)
    expect(blind).toEqual([])
  })

  it('a station the placement calls seen is one the plaza really sees, a full metre wide', () => {
    const lying = shippedLooms()
      .filter(({ layout }) => layout.loom?.seenFromPlaza === true && plazaViewOf(layout) < 1)
      .map(({ id, seed }) => `${id}/${seed}`)
    expect(lying).toEqual([])
  })
})

describe('a household gives way to the plaza’s view (work-order 1191)', () => {
  const plazaStands = () => {
    const out: Array<[number, number]> = [[0, 3]]
    for (const ring of [1.5, 3, 4.5, 6]) {
      for (let k = 0; k < 8; k++) out.push([Math.cos((k / 8) * Math.PI * 2) * ring, 3 + Math.sin((k / 8) * Math.PI * 2) * ring])
    }
    return out
  }

  it('at seed 42 every village’s plaza sees its loom, and the shipped Bambara plan’s does', () => {
    const unseen = [...VILLAGES.map((id) => [id, 42] as const), ['bambara-village', 394349866] as const]
      .filter(([id, seed]) => sharedLayout(id, seed).loom?.seenFromPlaza !== true)
      .map(([id, seed]) => `${id}/${seed}`)
    expect(unseen).toEqual([])
  })

  it('a station a household gave way for is near enough to read — within 17 m of a stand', () => {
    // A plan that can afford no household keeps the far seat it had before.
    const far = shippedLooms()
      .filter(({ layout }) => layout.loom?.seenFromPlaza === true && layout.gaveWayToLoom.households > 0)
      .filter(({ layout }) => {
        const w = layout.loom!.weaver
        return Math.min(...plazaStands().map(([x, z]) => Math.hypot(w.x - x, w.z - z))) > 17
      })
      .map(({ id, seed }) => `${id}/${seed}`)
    expect(far).toEqual([])
  })

  it('the station stands clear of every dwelling left standing, on the river’s axis', () => {
    const crossing: string[] = []
    for (const { id, seed, layout } of shippedLooms()) {
      const loom = layout.loom
      if (!loom) continue
      if (layout.bank) expect(loom.fx * layout.bank.fx + loom.fz * layout.bank.fz).toBeCloseTo(1, 6)
      for (const g of stationGround(loom, balance.villageLife.loom)) {
        const hit = layout.dwellings.find((d) => Math.hypot(g.x - d.x, g.z - d.z) < d.r + g.r)
        if (hit) crossing.push(`${id}/${seed}: ${hit.kind} at ${hit.x.toFixed(1)},${hit.z.toFixed(1)}`)
      }
    }
    expect(crossing).toEqual([])
  })

  it('what was left unbuilt is named, and nothing is where the line was already open', () => {
    // Fang@42 keeps its nominal seat with the view open past every hut.
    expect(sharedLayout('fang-village', 42).gaveWayToLoom).toEqual({ households: 0, dwellings: 0, rebuilt: 0 })
    const bambara = sharedLayout('bambara-village', 394349866)
    expect(bambara.gaveWayToLoom.households).toBeGreaterThan(0)
    expect(bambara.gaveWayToLoom.dwellings).toBeGreaterThanOrEqual(bambara.gaveWayToLoom.households)
    // A compound goes whole, and the cluster keeps at least three of them.
    expect(bambara.fences.filter((f) => f.kind === 'woven').length).toBeGreaterThanOrEqual(3)
  })
})

describe('the loom lies on the river’s axis (work-order 1157 item 4)', () => {
  it('every shipped village layout carries a loom', () => {
    const missing = shippedLooms().filter(({ layout }) => layout.loom === null)
      .map(({ id, seed }) => `${id}/${seed}`)
    expect(missing).toEqual([])
  })

  it('the warp’s heading is the bank’s downstream heading, not a fixed one', () => {
    const off: string[] = []
    for (const { id, seed, layout } of shippedLooms()) {
      const { loom, bank } = layout
      if (!loom || !bank) continue
      // The warp runs from stake to stake; its unit vector must be the bank's
      // own, to within the floating-point noise of deriving it twice.
      const dx = loom.downstream.x - loom.upstream.x
      const dz = loom.downstream.z - loom.upstream.z
      const length = Math.hypot(dx, dz)
      const cos = (dx / length) * bank.fx + (dz / length) * bank.fz
      if (cos < Math.cos(0.02)) off.push(`${id}/${seed}: cos=${cos.toFixed(4)}`)
      if (!loom.onRiverAxis) off.push(`${id}/${seed}: loom does not claim the river axis`)
    }
    expect(off).toEqual([])
  })

  it('a village with no river lays the warp on the tangent and names no direction', () => {
    const station = placeLoom({
      bank: null,
      nominal: [-8.5, -7],
      walkRadius: 30,
      free: () => true,
      sightClear: () => true,
      nominalWaterOff: Infinity,
      plazaView: () => Infinity,
      toChildren: () => Infinity,
      waterPathHead: null,
      onWaterLane: () => false,
      clearance: balance.communication.talk.reach,
      geometry: balance.villageLife.loom,
    })
    expect(station).not.toBeNull()
    expect(station!.onRiverAxis).toBe(false)
    // The tangent is perpendicular to the seat's own bearing.
    const radial = Math.hypot(station!.seat.x, station!.seat.z)
    const dot = (station!.seat.x / radial) * station!.fx + (station!.seat.z / radial) * station!.fz
    expect(Math.abs(dot)).toBeLessThan(1e-9)
  })

  it('a bankless seat swept away from its nominal spot keeps the tangent of where it LANDS', () => {
    // The nominal wedge is blocked, so the sweep settles the seat a quarter
    // turn round. The warp must be the tangent THERE — with the nominal
    // tangent kept, the bodies would stand along the threads (Astra, pass 8).
    const nominal: [number, number] = [-8.5, -7]
    const nominalAngle = Math.atan2(nominal[1], nominal[0])
    const wedge = (x: number, z: number) => {
      const d = Math.atan2(z, x) - nominalAngle
      return Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) > Math.PI / 3
    }
    const station = placeLoom({
      bank: null,
      nominal,
      walkRadius: 30,
      free: wedge,
      sightClear: () => true,
      nominalWaterOff: Infinity,
      plazaView: () => Infinity,
      toChildren: () => Infinity,
      waterPathHead: null,
      onWaterLane: () => false,
      clearance: balance.communication.talk.reach,
      geometry: balance.villageLife.loom,
    })
    expect(station).not.toBeNull()
    const d = Math.atan2(station!.seat.z, station!.seat.x) - nominalAngle
    expect(Math.abs(Math.atan2(Math.sin(d), Math.cos(d)))).toBeGreaterThan(Math.PI / 4)
    const radial = Math.hypot(station!.seat.x, station!.seat.z)
    const dot = (station!.seat.x / radial) * station!.fx + (station!.seat.z / radial) * station!.fz
    expect(Math.abs(dot)).toBeLessThan(1e-9)
    // And the across-warp axis, which places the two bodies, is perpendicular
    // to the warp itself.
    expect(Math.abs(station!.ax * station!.fx + station!.az * station!.fz)).toBeLessThan(1e-9)
  })
})

describe('the weaver sits in the MIDDLE of the warp (item 5)', () => {
  it('her seat is the midpoint, in every shipped layout', () => {
    const off: string[] = []
    for (const { id, seed, layout } of shippedLooms()) {
      const loom = layout.loom
      if (!loom) continue
      const toUp = Math.hypot(loom.seat.x - loom.upstream.x, loom.seat.z - loom.upstream.z)
      const toDown = Math.hypot(loom.seat.x - loom.downstream.x, loom.seat.z - loom.downstream.z)
      if (Math.abs(toUp - toDown) > 1e-6) off.push(`${id}/${seed}: ${toUp.toFixed(3)} vs ${toDown.toFixed(3)}`)
      if (Math.abs(toUp - balance.villageLife.loom.warpHalf) > 1e-6) {
        off.push(`${id}/${seed}: half warp ${toUp.toFixed(3)}`)
      }
    }
    expect(off).toEqual([])
  })

  it('BOTH call targets lie on opposite sides of her, so neither is “toward me”', () => {
    // This is the whole reason the seat is load-bearing: from an end, one call
    // would send the helper away and the other toward her, and the player could
    // learn the pair as come/go and still finish the puzzle.
    const off: string[] = []
    for (const { id, seed, layout } of shippedLooms()) {
      const loom = layout.loom
      if (!loom) continue
      // Along the WARP the two stands lie on opposite sides of the seat...
      const project = (p: { x: number; z: number }) =>
        (p.x - loom.seat.x) * loom.fx + (p.z - loom.seat.z) * loom.fz
      const up = project(loom.tend.upstream)
      const down = project(loom.tend.downstream)
      if (up >= 0 || down <= 0) off.push(`${id}/${seed}: stands at ${up.toFixed(2)} / ${down.toFixed(2)}`)
      // ...and BOTH are further from the weaver than the helper's own place
      // beside her, so neither call can be read as "come here".
      const home = Math.hypot(loom.helperHome.x - loom.weaver.x, loom.helperHome.z - loom.weaver.z)
      for (const stand of [loom.tend.upstream, loom.tend.downstream]) {
        const away = Math.hypot(stand.x - loom.weaver.x, stand.z - loom.weaver.z)
        if (away <= home + 1) off.push(`${id}/${seed}: a stand only ${away.toFixed(2)} m from her`)
      }
    }
    expect(off).toEqual([])
  })
})

describe('the station keeps its distance and shows the water (items 9 and 10)', () => {
  it('clears every place a child speaks, and the water lane’s head, by the talk reach', () => {
    const reach = balance.communication.talk.reach
    const off: string[] = []
    for (const { id, seed, layout } of shippedLooms()) {
      const { loom, playGround, playRocks, bank, waterPath } = layout
      if (!loom) continue
      const childPlaces: Array<{ x: number; z: number; r: number }> = []
      if (playGround) childPlaces.push({ x: playGround.x, z: playGround.z, r: playGround.radius })
      for (const p of playRocks ? [playRocks.upstream, playRocks.downstream] : []) {
        childPlaces.push({ x: p.x, z: p.z, r: 0 })
      }
      if (bank) childPlaces.push({ x: bank.bank.x, z: bank.bank.z, r: 0 })
      for (const at of [loom.seat, loom.upstream, loom.downstream]) {
        for (const c of childPlaces) {
          const gap = Math.hypot(at.x - c.x, at.z - c.z) - c.r
          if (gap < reach) off.push(`${id}/${seed}: ${gap.toFixed(2)} m to a child’s place`)
        }
        if (waterPath) {
          const gap = Math.hypot(at.x - waterPath.head.x, at.z - waterPath.head.z)
          if (gap < reach) off.push(`${id}/${seed}: ${gap.toFixed(2)} m to the water lane’s head`)
        }
      }
    }
    expect(off).toEqual([])
  })

  it('the river is in the picture from the seat', () => {
    const off: string[] = []
    for (const { id, seed, layout } of shippedLooms()) {
      const { loom, bank, colliders } = layout
      if (!loom || !bank) continue
      const from = loom.weaver
      const target = waterAhead(from, bank)
      // The weaver looks OUT at the water, not across the village at it.
      const out = bank.distance - (from.x * bank.nx + from.z * bank.nz)
      if (out <= 0) off.push(`${id}/${seed}: the seat is past the waterline`)
      const steps = Math.ceil(Math.hypot(target.x - from.x, target.z - from.z) / 0.25)
      for (let k = 1; k < steps; k++) {
        const x = from.x + ((target.x - from.x) * k) / steps
        const z = from.z + ((target.z - from.z) * k) / steps
        // The warp's own colliders lie ON the seat, so they are skipped by
        // starting one sample in; anything else in the line hides the water.
        // The loom's own bodies are not what hides the water from it.
        const solids = colliders.filter((c) => {
          if (c.kind === 'segment') return false
          return Math.hypot(c.x - from.x, c.z - from.z) > 0.01
        })
        if (!standingClear(solids, x, z, 0.2)) {
          off.push(`${id}/${seed}: the water is hidden ${(k / steps * 100) | 0}% of the way out`)
          break
        }
      }
    }
    expect(off).toEqual([])
  })
})

describe('the station gives way to what was there first', () => {
  it('never seals the settlement’s one way out, nor the carriers’ water lane', () => {
    const off: string[] = []
    for (const { id, seed, layout } of shippedLooms()) {
      const { loom, wayOut, radius, waterPath } = layout
      if (!loom) continue
      for (let k = 0; k <= 16; k++) {
        const t = k / 16
        const x = loom.upstream.x + (loom.downstream.x - loom.upstream.x) * t
        const z = loom.upstream.z + (loom.downstream.z - loom.upstream.z) * t
        if (onWayOut(wayOut, radius, x, z, WARP_BODY_RADIUS)) off.push(`${id}/${seed}: warp on the way out`)
        if (waterPath) {
          const d = closestOnPolyline(
            [[waterPath.head.x, waterPath.head.z], [waterPath.foot.x, waterPath.foot.z]],
            x,
            z,
          ).dist
          if (d < WATER_PATH_WIDTH / 2 + WARP_BODY_RADIUS) off.push(`${id}/${seed}: warp across the water lane`)
        }
      }
    }
    expect(off.slice(0, 10)).toEqual([])
  })

  it('leaves a walker room to pass BEYOND each stake, so the wall can be walked round', () => {
    const off: string[] = []
    for (const { id, seed, layout } of shippedLooms()) {
      const loom = layout.loom
      if (!loom) continue
      const own = layout.colliders.filter((c) =>
        c.kind === 'segment'
          ? Math.hypot(c.x1 - loom.upstream.x, c.z1 - loom.upstream.z) > 1e-9
          : c.kind === 'box' || Math.hypot(c.x - loom.weaver.x, c.z - loom.weaver.z) > 1e-9,
      )
      const past = balance.villageLife.loom.warpHalf + WARP_BODY_RADIUS + WALKER_RADIUS * 2
      for (const d of [-past, past]) {
        const x = loom.seat.x + loom.fx * d
        const z = loom.seat.z + loom.fz * d
        if (!standingClear(own, x, z, WALKER_RADIUS)) off.push(`${id}/${seed}: no room past a stake`)
      }
    }
    expect(off.slice(0, 10)).toEqual([])
  })
})

describe('the whole warp is a body the village walks round (item 11)', () => {
  it('stands on standable ground over its whole length', () => {
    const off: string[] = []
    for (const { id, seed, layout } of shippedLooms()) {
      const { loom, bank, colliders, radius } = layout
      if (!loom) continue
      // The loom's OWN two bodies — the warp and the weaver at her seat — are
      // not obstacles to themselves.
      const others = colliders.filter((c) =>
        c.kind === 'segment'
          ? Math.hypot(c.x1 - loom.upstream.x, c.z1 - loom.upstream.z) > 1e-9
          : c.kind === 'box' || Math.hypot(c.x - loom.weaver.x, c.z - loom.weaver.z) > 1e-9,
      )
      for (let k = 0; k <= 16; k++) {
        const x = loom.upstream.x + ((loom.downstream.x - loom.upstream.x) * k) / 16
        const z = loom.upstream.z + ((loom.downstream.z - loom.upstream.z) * k) / 16
        if (Math.hypot(x, z) > radius - WALKER_RADIUS) off.push(`${id}/${seed}: warp leaves the settlement`)
        if (!standsOnGroundPlate(bank, x, z, WARP_BODY_RADIUS)) off.push(`${id}/${seed}: warp on the shore`)
        if (!standingClear(others, x, z, WARP_BODY_RADIUS)) off.push(`${id}/${seed}: warp through a solid`)
      }
    }
    expect(off.slice(0, 10)).toEqual([])
  })

  it('the layout carries the warp AND the weaver as colliders', () => {
    for (const { id, seed, layout } of shippedLooms()) {
      const loom = layout.loom
      if (!loom) continue
      // Both ends and the body radius: a zero-length stub at the upstream stake
      // would pass an end-point match and leave the warp walkable.
      const warp = layout.colliders.find(
        (c) =>
          c.kind === 'segment' &&
          Math.hypot(c.x1 - loom.upstream.x, c.z1 - loom.upstream.z) < 1e-9 &&
          Math.hypot(c.x2 - loom.downstream.x, c.z2 - loom.downstream.z) < 1e-9 &&
          c.r === WARP_BODY_RADIUS,
      )
      expect(warp, `${id}/${seed}`).toBeTruthy()
      const seat = layout.colliders.find(
        (c) => c.kind !== 'segment' && c.kind !== 'box' && Math.hypot(c.x - loom.weaver.x, c.z - loom.weaver.z) < 1e-9 && c.r === WEAVER_BODY_RADIUS,
      )
      expect(seat, `${id}/${seed}`).toBeTruthy()
    }
  })
})

describe('loomAround is the one geometry both the layout and the scene read', () => {
  it('lays the stakes and the tending stands off one seat and one axis', () => {
    // Warp along +z, water to +x.
    const station = loomAround({ x: 2, z: -3 }, 0, 1, 1, 0, { warpHalf: 3, tendStand: 2 }, true)
    expect(station.upstream).toEqual({ x: 2, z: -6 })
    expect(station.downstream).toEqual({ x: 2, z: 0 })
    // The stakes are ON the warp; the two bodies are beside it, and on
    // opposite sides — she inland, he between the threads and the water.
    expect(station.weaver.x).toBeCloseTo(2 - WEAVER_SIDE_OFFSET, 9)
    expect(station.helperHome.x).toBeCloseTo(2 + HELPER_SIDE_OFFSET, 9)
    expect(station.tend.upstream).toEqual({ x: 2 + HELPER_SIDE_OFFSET, z: -5 })
    expect(station.tend.downstream).toEqual({ x: 2 + HELPER_SIDE_OFFSET, z: -1 })
  })
})
