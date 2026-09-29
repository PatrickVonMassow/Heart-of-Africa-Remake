// THE BANK IS WIDER DOWNSTREAM (work-order 1237): a separate downstream plateau
// carries the walkable ground to the water out to about s = +45 m, while the
// upstream side, the children's stretch and the water path stay where they were.
// And the scene draws that ground: plate, shore, water and the backdrop's rim
// all follow the widened lobe on every riverside village.

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import {
  BANK_BED_REACH,
  BANK_DOWNSTREAM_FADE_ANGLE,
  BANK_DOWNSTREAM_PLATEAU_ANGLE,
  BANK_FADE_ANGLE,
  BANK_PLATEAU_ANGLE,
  BANK_STRETCH_ANGLE_FRAC,
  bankStretchAngle,
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
const normalOf = (b: PlaceRiverBank) => Math.atan2(b.nz, b.nx)
/** +1 where a bearing offset leans downstream, −1 upstream. */
const downSign = (b: PlaceRiverBank) => (Math.sin(Math.atan2(b.fz, b.fx) - normalOf(b)) >= 0 ? 1 : -1)

describe('the asymmetric bank plateau', () => {
  it('keeps the downstream fade margin equal to the upstream one', () => {
    expect(BANK_DOWNSTREAM_PLATEAU_ANGLE).toBeGreaterThan(BANK_PLATEAU_ANGLE)
    expect(BANK_DOWNSTREAM_FADE_ANGLE - BANK_DOWNSTREAM_PLATEAU_ANGLE).toBeCloseTo(BANK_FADE_ANGLE - BANK_PLATEAU_ANGLE, 12)
    expect(BANK_DOWNSTREAM_FADE_ANGLE).toBeLessThan(Math.PI / 2)
  })

  it('has riverside villages to measure', () => {
    expect(riverVillages().length).toBeGreaterThanOrEqual(3)
  })

  it.each(riverVillages().map((v) => [v.id, v.bank] as const))(
    '%s: walkable to the water downstream to about s = +45 m, upstream unchanged',
    (_id, bank) => {
      const bounds = { radius: PLACE_RADIUS, bank }
      // Downstream: the top of the bank is walkable ground out to s ≈ +45.
      const reachDown = bank.walkEdge * Math.tan(BANK_DOWNSTREAM_PLATEAU_ANGLE)
      expect(reachDown).toBeGreaterThan(44)
      expect(reachDown).toBeLessThan(47)
      for (const s of [20, 30, 40, 45]) {
        const p = onBank(bank, s, bank.distance)
        expect(insidePlace(bounds, p.x, p.z), `s=${s}`).toBe(true)
      }
      // Upstream: still today's ±16.2 m plateau, and past its fade the plain disc.
      const reachUp = bank.walkEdge * Math.tan(BANK_PLATEAU_ANGLE)
      expect(reachUp).toBeGreaterThan(15.5)
      expect(reachUp).toBeLessThan(17)
      const n = normalOf(bank)
      const sign = downSign(bank)
      for (const delta of [0.1, 0.3, BANK_PLATEAU_ANGLE - 1e-3]) {
        expect(placeBoundaryRadius(bounds, n - sign * delta)).toBeCloseTo(bank.wadeEdge / Math.cos(delta), 9)
      }
      expect(placeBoundaryRadius(bounds, n - sign * (BANK_FADE_ANGLE + 1e-3))).toBe(PLACE_RADIUS)
      expect(inBankArc(bank, n - sign * (BANK_FADE_ANGLE + 1e-3))).toBe(false)
      // Downstream: the wade line across the wider plateau, the plain disc past its fade.
      expect(placeBoundaryRadius(bounds, n + sign * (BANK_DOWNSTREAM_PLATEAU_ANGLE - 1e-3)))
        .toBeCloseTo(bank.wadeEdge / Math.cos(BANK_DOWNSTREAM_PLATEAU_ANGLE - 1e-3), 9)
      expect(placeBoundaryRadius(bounds, n + sign * (BANK_DOWNSTREAM_FADE_ANGLE + 1e-3))).toBe(PLACE_RADIUS)
      expect(inBankArc(bank, n + sign * (BANK_FADE_ANGLE + 0.1))).toBe(true)
      // The widest reach is on the downstream side now.
      expect(maxBoundaryRadius(bounds)).toBeGreaterThanOrEqual(bank.wadeEdge / Math.cos(BANK_DOWNSTREAM_PLATEAU_ANGLE))
    },
  )

  it.each(riverVillages().map((v) => [v.id, v.bank] as const))(
    '%s: the children`s stretch and the water path stay on the smaller, upstream angle',
    (_id, bank) => {
      const stretch = bankStretchAngle(bank.walkEdge)
      expect(stretch).toBeLessThanOrEqual(BANK_PLATEAU_ANGLE * BANK_STRETCH_ANGLE_FRAC + 1e-12)
      // The two stretch points mirror each other about the normal.
      const along = (p: { x: number; z: number }) => p.x * bank.fx + p.z * bank.fz
      expect(along(bank.upstream)).toBeCloseTo(-along(bank.downstream), 9)
      // The water path lands upstream, on the upstream plateau.
      const foot = bankWaterFoot(bank)
      expect(along(foot)).toBeLessThan(along(bank.upstream))
      expect(Math.abs(along(foot))).toBeLessThan(bank.walkEdge * Math.tan(BANK_PLATEAU_ANGLE))
    },
  )
})

describe('the drawn scene reaches the widened bank (work-order 1237 item 5)', () => {
  const cases = riverVillages().flatMap((v) => SEEDS.map((seed) => [v.id, seed] as const))

  it.each(cases)('%s @%i: plate, shore, water and backdrop rim cover the downstream lobe', (id, seed) => {
    const layout = sharedLayout(id, seed)
    const bank = layout.bank!
    expect(bank).toBeTruthy()
    const discEdge = layout.radius + GROUND_DISC_OVERHANG
    const reach = bankDrawnReach(layout, discEdge)
    const sign = downSign(bank)
    const n = normalOf(bank)
    // Every walkable point on the downstream side stands on drawn ground: the
    // plate inland of the top of the bank, the shore strip beyond it.
    for (let i = 0; i <= 400; i++) {
      const angle = n + sign * (i / 400) * BANK_DOWNSTREAM_FADE_ANGLE
      const edge = placeBoundaryRadius(layout, angle)
      const p = { x: Math.cos(angle) * edge, z: Math.sin(angle) * edge }
      const out = p.x * bank.nx + p.z * bank.nz
      if (out <= bank.walkEdge + 1e-9) {
        expect(groundPlateRadius(layout, angle, discEdge) + 1e-9, `plate ${angle.toFixed(3)}`).toBeGreaterThanOrEqual(edge)
      } else {
        expect(out).toBeLessThanOrEqual(bank.distance + BANK_BED_REACH)
        expect(p.x * bank.fx + p.z * bank.fz, `shore ${angle.toFixed(3)}`).toBeLessThanOrEqual(reach.down)
      }
      // Past the upstream plateau's angle — the ground the widening adds — the
      // backdrop's rim starts beyond the last walkable step at that bearing.
      if ((i / 400) * BANK_DOWNSTREAM_FADE_ANGLE >= BANK_PLATEAU_ANGLE) {
        const rim = layout.radius + BACKDROP_INNER_OFFSET + groundDiscShift(layout, angle)
        expect(rim, `rim ${angle.toFixed(3)}`).toBeGreaterThan(edge)
      }
    }
    // The upstream side is drawn exactly as before.
    expect(reach.up).toBeCloseTo(Math.sqrt(discEdge * discEdge - bank.walkEdge * bank.walkEdge), 9)
    for (const delta of [0.2, 0.5, 1, 2]) expect(groundDiscShift(layout, n - sign * delta)).toBe(0)
  })
})
