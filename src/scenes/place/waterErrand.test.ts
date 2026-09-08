// THE WATER ERRAND'S GEOGRAPHY (work-order 1065, PART B).
//
// The user could not tell that water was being fetched: the carrier stopped
// 2.7 m up the bank, the jar flipped from empty to full with no act, and no
// water showed in it. The module tests cover the errand's shape; what is
// measured here is the GROUND it happens on — the spot at the water, the stand
// in the village — and the pose that dips the jar.

import { describe, expect, it } from 'vitest'
import { buildLayout, VILLAGE_FIRE, VILLAGE_WATER_STAND, WATER_STAND_RADIUS, type PlaceLayout } from './layout'
import { PLACES } from '../../world/geo'
import { WALKER_RADIUS, standingClear } from './collision'
import { BANK_FILL_DEPTH, bankWaterDepth, bankShoreHeight } from './riverBank'
import { insidePlace } from './boundary'
import { balance } from '../../config/balance'
import { fillPose, REST_POSE } from '../../render/gesture'
import {
  createAdultWork,
  goalOf,
  stepAdultWork,
  FILL_ARRIVE_RADIUS,
  WORK_ARRIVE_RADIUS,
  type AdultWorkView,
} from './adultWork'

const RIVER_VILLAGES = ['nubian-village', 'bambara-village', 'mandinka-village']
const VILLAGES = PLACES.filter((p) => p.kind === 'village').map((p) => p.id)
/** The margin a villager's walk is tested with (`PlaceLife`'s `standable`). */
const NPC_MARGIN = WALKER_RADIUS * 2
const ERRAND_CFG = balance.villageLife.adultErrands

/** The view `ErrandVillagers` gives the work module, over a real village: the
 *  same ground test, the same geography, nobody within earshot. */
function errandView(layout: PlaceLayout): AdultWorkView {
  const path = layout.waterPath
  return {
    villagers: Array.from({ length: ERRAND_CFG.villagerCount }, (_, i) => {
      const a = (i / ERRAND_CFG.villagerCount) * Math.PI * 2
      return { x: Math.cos(a) * 7, z: Math.sin(a) * 7, free: true }
    }),
    geography: {
      waterHead: path ? { x: path.head.x, z: path.head.z } : null,
      waterFoot: path ? { x: path.foot.x, z: path.foot.z } : null,
      waterStand: path ? { x: VILLAGE_WATER_STAND[0], z: VILLAGE_WATER_STAND[1] } : null,
      waterFill: path ? { x: path.fill.x, z: path.fill.z } : null,
      digSites: layout.digSites,
    },
    standable: (x, z) =>
      standingClear(layout.colliders, x, z, WALKER_RADIUS) &&
      insidePlace({ radius: layout.radius, bank: layout.bank }, x, z, NPC_MARGIN),
    invitationClear: () => true,
    childrenHear: () => false,
  }
}

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

/** The least water the jar may go under at the WORST arrival. Below this the
 *  dip is arithmetic rather than a picture. */
const MIN_DIP = 0.1

describe('the carrier stands in water where he actually STOPS (work-order 1065)', () => {
  // THE DEFECT THIS PINS (measured 08.09.2026 on a quiet machine): the fill spot
  // itself was in the water, and the carrier still dipped the jar into air. He
  // stops anywhere inside his arrival radius of that spot, and the shared 1.1 m
  // is, on the shore's own slope, some 18 cm of height — enough to leave him
  // 8 cm ABOVE the drawn water surface. A nominal spot is not a standing place:
  // what has to be in the water is the ground under his feet at arrival.
  for (const id of RIVER_VILLAGES) {
    it(`${id}: the worst arrival on the fill leg is still under water`, () => {
      const layout = buildLayout(id, 42)
      const bank = layout.bank!
      const path = layout.waterPath!
      const fillOut = path.fill.x * bank.nx + path.fill.z * bank.nz
      // The worst stop is the one furthest back up the slope: straight inland by
      // the whole arrival radius.
      const worstOut = fillOut - FILL_ARRIVE_RADIUS
      const depth = bankWaterDepth(bank, worstOut)
      expect(
        depth,
        `${id}: stopping ${FILL_ARRIVE_RADIUS} m short of the fill spot leaves him in ` +
          `${(depth * 100).toFixed(0)} cm of water`,
      ).toBeGreaterThan(MIN_DIP)
      // ...and his feet are below the village plate, i.e. on the shore.
      expect(bankShoreHeight(bank, worstOut)).toBeLessThan(0)
      // The shared radius is what put him on dry ground; the tight one is the fix.
      expect(bankWaterDepth(bank, fillOut - WORK_ARRIVE_RADIUS)).toBeLessThan(0)
      expect(FILL_ARRIVE_RADIUS).toBeLessThan(WORK_ARRIVE_RADIUS)
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
      // ...and there is free ground to speak from all round it. Both men of the
      // errand take a join stand-off beside the stand, so a stand walled in on
      // every side would never be reached.
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

describe('the errand sends both men to ground they can stand on (work-order 1065)', () => {
  for (const id of RIVER_VILLAGES) {
    it(`${id}: neither man of the errand is sent onto ground he cannot stand on`, () => {
      // THE DEFECT THIS PINS (measured 08.09.2026, five of six polish runs on a
      // quiet machine): the sender's goal was the stand's own spot. A collider
      // 0.62 m across leaves a walker of 0.30 m a ring 18 cm wide inside the
      // 1.10 m arrival radius, and the walk steers round obstacles rather than
      // into them — so he circled the stand, never arrived, never spoke, and the
      // village fetched no water at all until the errand expired.
      const layout = buildLayout(id, 42)
      const view = errandView(layout)
      const state = createAdultWork(view.villagers.length, ERRAND_CFG)
      stepAdultWork(state, view, ERRAND_CFG.intervalSeconds, ERRAND_CFG, () => 0.5)
      const water = state.tasks.filter((task) => task?.situation === 'water-out')
      expect(water, `${id} staged no water errand`).toHaveLength(2)
      for (const task of water) {
        const goal = goalOf(task!)
        expect(
          view.standable(goal.x, goal.z),
          `${id}: the ${task!.role} is sent to ${goal.x.toFixed(2)}/${goal.z.toFixed(2)}, where nobody can stand`,
        ).toBe(true)
      }
      // ...and they are not sent to the same place either.
      const [a, b] = water.map((task) => goalOf(task!))
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(1)
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
