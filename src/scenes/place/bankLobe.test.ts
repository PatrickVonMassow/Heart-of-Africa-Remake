// THE BANK IS SYMMETRIC (work-order 1245; work-order 1237 had widened only the
// downstream side): the walkable ground reaches the water to about s = ±45 m on
// both sides of the settlement's bank normal. The children's stretch sits in the
// upstream half (centre s ≈ −29), the water path beyond its upstream end, the
// dugout's lane in the downstream half. And the scene draws that ground: plate,
// shore, water and the backdrop's rim follow the lobe on both sides, on every
// riverside village — the extent check of item 10, which names a failing
// village.

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { balance } from '../../config/balance'
import {
  BANK_BED_REACH,
  BANK_DISC_SHIFT_EASE_ANGLE,
  BANK_FADE_ANGLE,
  BANK_PLATEAU_ANGLE,
  BANK_STRETCH_MAX_SPAN,
  BANK_STRETCH_MIN_SPAN,
  bankFillSpot,
  bankPlayRocks,
  bankWaterFoot,
  buildRiverBank,
  type PlaceRiverBank,
} from './riverBank'
import {
  bankDrawnReach,
  groundDiscShift,
  groundPlateRadius,
  inBankArc,
  insidePlace,
  maxBoundaryRadius,
  placeBoundaryRadius,
} from './boundary'
import { BACKDROP_INNER_OFFSET, GROUND_DISC_OVERHANG } from './backdrop'
import { PLACE_RADIUS } from './layout'
import { sharedLayout } from './layoutHarness'
import { RIVER_HALF_LENGTH } from '../../render/placeRiver'

beforeAll(setupGeodata)

const SEEDS = [4711, 1425108822]

function riverVillages(): Array<{ id: string; bank: PlaceRiverBank }> {
  const out: Array<{ id: string; bank: PlaceRiverBank }> = []
  for (const p of PLACES.filter((q) => q.kind === 'village')) {
    const bank = buildRiverBank(p, PLACE_RADIUS)
    if (bank) out.push({ id: p.id, bank })
  }
  return out
}

/** A point on the bank frame: `s` downstream, `out` along the normal. */
const onBank = (b: PlaceRiverBank, s: number, out: number) => ({
  x: b.nx * out + b.fx * s,
  z: b.nz * out + b.fz * s,
})
const alongOf = (b: PlaceRiverBank, p: { x: number; z: number }) => p.x * b.fx + p.z * b.fz
const normalOf = (b: PlaceRiverBank) => Math.atan2(b.nz, b.nx)
/** +1 where a bearing offset leans downstream, −1 upstream. */
const downSign = (b: PlaceRiverBank) => (Math.sin(Math.atan2(b.fz, b.fx) - normalOf(b)) >= 0 ? 1 : -1)

describe('the symmetric bank plateau (work-order 1245 item 8)', () => {
  it('has riverside villages to measure', () => {
    expect(riverVillages().length).toBeGreaterThanOrEqual(3)
  })

  it.each(riverVillages().map((v) => [v.id, v.bank] as const))(
    '%s: walkable to the water to about s = ±45 m on both sides',
    (_id, bank) => {
      const bounds = { radius: PLACE_RADIUS, bank }
      const reach = bank.walkEdge * Math.tan(BANK_PLATEAU_ANGLE)
      expect(reach).toBeGreaterThan(44)
      expect(reach).toBeLessThan(47)
      const n = normalOf(bank)
      for (const s of [-45, -40, -30, -20, 0, 20, 30, 40, 45]) {
        const p = onBank(bank, s, bank.distance)
        expect(insidePlace(bounds, p.x, p.z), `s=${s}`).toBe(true)
      }
      for (const sign of [-1, 1]) {
        for (const delta of [0.1, 0.3, 0.6, BANK_PLATEAU_ANGLE - 1e-3]) {
          expect(placeBoundaryRadius(bounds, n + sign * delta)).toBeCloseTo(bank.wadeEdge / Math.cos(delta), 9)
        }
        expect(placeBoundaryRadius(bounds, n + sign * (BANK_FADE_ANGLE + 1e-3))).toBe(PLACE_RADIUS)
        expect(inBankArc(bank, n + sign * (BANK_FADE_ANGLE - 1e-3))).toBe(true)
        expect(inBankArc(bank, n + sign * (BANK_FADE_ANGLE + 1e-3))).toBe(false)
        // Mirror images: the same radius at the same offset either side.
        for (const delta of [0.2, 0.7, 0.95]) {
          expect(placeBoundaryRadius(bounds, n + sign * delta)).toBeCloseTo(placeBoundaryRadius(bounds, n - sign * delta), 9)
        }
      }
      expect(maxBoundaryRadius(bounds)).toBeGreaterThanOrEqual(bank.wadeEdge / Math.cos(BANK_PLATEAU_ANGLE))
    },
  )

  it.each(riverVillages().map((v) => [v.id, v.bank] as const))(
    '%s: the stretch is centred about 29 m upstream, its span in [14, 21] m, the water path beyond it',
    (_id, bank) => {
      const up = alongOf(bank, bank.upstream)
      const down = alongOf(bank, bank.downstream)
      const span = down - up
      expect(span).toBeGreaterThanOrEqual(BANK_STRETCH_MIN_SPAN)
      expect(span).toBeLessThanOrEqual(BANK_STRETCH_MAX_SPAN + 1e-9)
      expect((up + down) / 2).toBeCloseTo(balance.villageLife.bankGame.stretchCentre, 9)
      expect(Math.abs(balance.villageLife.bankGame.stretchCentre + 29)).toBeLessThanOrEqual(1.5)
      // Its upstream reach: from the stretch's upstream end to the plateau's end.
      const plateau = bank.walkEdge * Math.tan(BANK_PLATEAU_ANGLE)
      expect(up).toBeGreaterThan(-plateau)
      // The villagers' bank point is the stretch's middle.
      expect(alongOf(bank, bank.bank)).toBeCloseTo((up + down) / 2, 9)
      // The play rocks keep the stretch's along-bank places, pulled straight inland.
      const rocks = bankPlayRocks(bank)
      expect(alongOf(bank, rocks.upstream)).toBeCloseTo(up, 9)
      expect(alongOf(bank, rocks.downstream)).toBeCloseTo(down, 9)
      // The water path lands upstream of the stretch, by the calibrated
      // distance, on walkable ground; its fill spot lies on the same bearing
      // out in the water, walkable with a walker's margin.
      const foot = bankWaterFoot(bank)
      const fill = bankFillSpot(bank)
      expect(alongOf(bank, foot)).toBeLessThan(up)
      expect(up - alongOf(bank, foot)).toBeGreaterThan(balance.villageLife.adultErrands.waterFootBeyond - 1)
      expect(Math.atan2(foot.z, foot.x)).toBeCloseTo(Math.atan2(fill.z, fill.x), 6)
      expect(insidePlace({ radius: PLACE_RADIUS, bank }, foot.x, foot.z, 0.6)).toBe(true)
      expect(insidePlace({ radius: PLACE_RADIUS, bank }, fill.x, fill.z, 0.6)).toBe(true)
    },
  )
})

describe('the drawn scene reaches the bank on both sides (work-order 1245 item 10)', () => {
  const cases = riverVillages().flatMap((v) => SEEDS.map((seed) => [v.id, seed] as const))

  it.each(cases)('%s @%i: plate, shore, water, routing and backdrop rim cover the whole lobe', (id, seed) => {
    const layout = sharedLayout(id, seed)
    const bank = layout.bank!
    expect(bank).toBeTruthy()
    const discEdge = layout.radius + GROUND_DISC_OVERHANG
    const reach = bankDrawnReach(layout, discEdge)
    const n = normalOf(bank)
    const down = downSign(bank)
    for (const sign of [-down, down]) {
      const side = sign === down ? 'down' : 'up'
      const drawn = sign === down ? reach.down : reach.up
      // Every walkable point stands on drawn ground: the plate inland of the
      // top of the bank, the shore strip beyond it.
      for (let i = 0; i <= 400; i++) {
        const angle = n + sign * (i / 400) * BANK_FADE_ANGLE
        const edge = placeBoundaryRadius(layout, angle)
        const p = { x: Math.cos(angle) * edge, z: Math.sin(angle) * edge }
        const out = p.x * bank.nx + p.z * bank.nz
        if (out <= bank.walkEdge + 1e-9) {
          expect(groundPlateRadius(layout, angle, discEdge) + 1e-9, `${side} plate ${angle.toFixed(3)}`).toBeGreaterThanOrEqual(edge)
        } else {
          expect(out).toBeLessThanOrEqual(bank.distance + BANK_BED_REACH)
          expect(Math.abs(alongOf(bank, p)), `${side} shore ${angle.toFixed(3)}`).toBeLessThanOrEqual(drawn)
        }
        // Past the ease, the backdrop's rim starts beyond the last walkable step.
        if ((i / 400) * BANK_FADE_ANGLE >= BANK_DISC_SHIFT_EASE_ANGLE) {
          const rim = layout.radius + BACKDROP_INNER_OFFSET + groundDiscShift(layout, angle)
          expect(rim, `${side} rim ${angle.toFixed(3)}`).toBeGreaterThan(edge)
        }
      }
    }
    // The two sides are drawn alike, out past the plateau's end (≈ 60 m from
    // the centre at the waterline), and the water runs as far as the shore.
    expect(reach.up).toBeCloseTo(reach.down, 6)
    const plateauEnd = bank.walkEdge * Math.tan(BANK_PLATEAU_ANGLE)
    expect(reach.up).toBeGreaterThan(plateauEnd)
    expect(Math.max(RIVER_HALF_LENGTH, reach.up)).toBeGreaterThan(plateauEnd)
    // Routing (the villagers' collision grid) covers the whole lobe.
    const upEnd = onBank(bank, -plateauEnd, bank.wadeEdge)
    expect(maxBoundaryRadius(layout)).toBeGreaterThanOrEqual(Math.hypot(upEnd.x, upEnd.z) - 1e-6)
    expect(Math.hypot(upEnd.x, upEnd.z)).toBeGreaterThan(58)
  })
})
