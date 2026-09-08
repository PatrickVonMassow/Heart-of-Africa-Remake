// THE WATER ERRAND'S GEOGRAPHY (work-order 1065, PART B).
//
// The user could not tell that water was being fetched: the carrier stopped
// 2.7 m up the bank, the jar flipped from empty to full with no act, and no
// water showed in it. The module tests cover the errand's shape; what is
// measured here is the GROUND it happens on — the spot at the water, the stand
// in the village — and the pose that dips the jar.

import { describe, expect, it } from 'vitest'
import { buildLayout, VILLAGE_FIRE, VILLAGE_WATER_STAND, WATER_STAND_RADIUS } from './layout'
import { PLACES } from '../../world/geo'
import { WALKER_RADIUS, standingClear } from './collision'
import { BANK_FILL_DEPTH, bankWaterDepth, bankShoreHeight } from './riverBank'
import { insidePlace } from './boundary'
import { balance } from '../../config/balance'
import { fillPose, REST_POSE } from '../../render/gesture'

const RIVER_VILLAGES = ['nubian-village', 'bambara-village', 'mandinka-village']
const VILLAGES = PLACES.filter((p) => p.kind === 'village').map((p) => p.id)
/** The margin a villager's walk is tested with (`PlaceLife`'s `standable`). */
const NPC_MARGIN = WALKER_RADIUS * 2

describe('the carrier goes TO the water (work-order 1065)', () => {
  for (const id of RIVER_VILLAGES) {
    it(`${id}: the fill spot stands in the water, ankle deep`, () => {
      const layout = buildLayout(id, 42)
      const bank = layout.bank!
      const path = layout.waterPath!
      const out = path.fill.x * bank.nx + path.fill.z * bank.nz
      // IN the water: the ground under him is below the surface by the depth
      // the fill was solved for, so the jar goes into drawn river.
      expect(bankWaterDepth(bank, out)).toBeCloseTo(BANK_FILL_DEPTH, 6)
      expect(bankShoreHeight(bank, out)).toBeLessThan(0)
      // ...and nowhere near out of his depth: this is a fill, not a crossing.
      expect(BANK_FILL_DEPTH).toBeLessThan(balance.bankWadeDepth / 2)
    })

    it(`${id}: the fill spot is much nearer the water than the old foot was`, () => {
      const layout = buildLayout(id, 42)
      const bank = layout.bank!
      const path = layout.waterPath!
      const footOut = path.foot.x * bank.nx + path.foot.z * bank.nz
      const fillOut = path.fill.x * bank.nx + path.fill.z * bank.nz
      // The foot stood 2.7 m short of the waterline; the fill stands past it.
      expect(bank.distance - footOut).toBeGreaterThan(2)
      expect(fillOut).toBeGreaterThan(bank.distance)
    })

    it(`${id}: the carrier may actually walk to the fill spot`, () => {
      const layout = buildLayout(id, 42)
      const path = layout.waterPath!
      expect(insidePlace({ radius: layout.radius, bank: layout.bank }, path.fill.x, path.fill.z, NPC_MARGIN)).toBe(true)
      expect(standingClear(layout.colliders, path.fill.x, path.fill.z, WALKER_RADIUS)).toBe(true)
    })
  }
})

describe('the village water stand (work-order 1065)', () => {
  it('stands clear of the cooking fire it belongs to', () => {
    const apart = Math.hypot(VILLAGE_WATER_STAND[0] - VILLAGE_FIRE[0], VILLAGE_WATER_STAND[1] - VILLAGE_FIRE[1])
    // Clear of the fire's own collider (1.3 m) plus its own.
    expect(apart).toBeGreaterThan(1.3 + WATER_STAND_RADIUS)
    // ...and still beside it rather than across the village.
    expect(apart).toBeLessThan(5)
  })

  for (const id of VILLAGES) {
    it(`${id}: is a collider, and two adults can stand at it and be heard`, () => {
      const layout = buildLayout(id, 42)
      const [sx, sz] = VILLAGE_WATER_STAND
      // The stand itself is solid: nothing is built on it and nobody walks
      // through it.
      expect(standingClear(layout.colliders, sx, sz, WALKER_RADIUS)).toBe(false)
      // ...and there is free ground to speak from all round it. The errand puts
      // the sender ON the stand's own spot and the carrier a join stand-off
      // away, so a stand walled in on every side would never be reached.
      let free = 0
      for (let k = 0; k < 12; k++) {
        const a = (k / 12) * Math.PI * 2
        const x = sx + Math.cos(a) * 2.4
        const z = sz + Math.sin(a) * 2.4
        if (
          standingClear(layout.colliders, x, z, WALKER_RADIUS) &&
          insidePlace({ radius: layout.radius, bank: layout.bank }, x, z, NPC_MARGIN)
        ) {
          free++
        }
      }
      expect(free, `${id} has ${free} free bearings round the water stand`).toBeGreaterThanOrEqual(4)
    })
  }
})

describe('the dip that fills the jar (work-order 1065)', () => {
  it('goes down, HOLDS under the water, and comes back up', () => {
    const start = fillPose(0)
    const under = fillPose(0.5)
    const end = fillPose(1)
    // The carrying arm swings down and forward at the dip...
    expect(under.left.pitch).toBeLessThan(start.left.pitch)
    // ...and the trunk folds over the water with it.
    expect(under.lean).toBeGreaterThan(start.lean + 0.4)
    // The middle is a HOLD, not a passing instant: the jar is in the river for
    // a readable moment rather than dabbed at it.
    for (const p of [0.35, 0.5, 0.65]) {
      expect(fillPose(p).lean).toBeCloseTo(under.lean, 6)
      expect(fillPose(p).left.pitch).toBeCloseTo(under.left.pitch, 6)
    }
    // And it comes back up to where it started.
    expect(end.lean).toBeCloseTo(start.lean, 6)
    expect(end.left.pitch).toBeCloseTo(start.left.pitch, 6)
  })

  it('takes the free arm back for balance, so it is not a figure merely bowed', () => {
    const under = fillPose(0.5)
    expect(under.right.pitch).toBeGreaterThan(REST_POSE.right.pitch)
    expect(Math.abs(under.right.roll)).toBeGreaterThan(Math.abs(REST_POSE.right.roll))
  })

  it('is bounded outside its own range', () => {
    expect(fillPose(-3).lean).toBeCloseTo(fillPose(0).lean, 9)
    expect(fillPose(7).lean).toBeCloseTo(fillPose(1).lean, 9)
  })
})
