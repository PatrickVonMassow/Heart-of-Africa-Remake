// Point 348 (a)/(b): the flame stands on the hearth at every size the rain
// rule can produce, and the hearth collider is in the set every walker target
// is validated against, with no walker target inside it.

import { beforeAll, describe, expect, it } from 'vitest'
import { ConeGeometry } from 'three'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import {
  FISHERY_FLAME_HEIGHT,
  fisheryFlameScale,
  flameBaseY,
  flameGeometryLift,
  HEARTH_RADIUS,
  HEARTH_STONE_RADIUS,
  HEARTH_STONE_RING,
  HEARTH_TOP,
  hearthColliderRadius,
  VILLAGE_FLAME_HEIGHT,
  villageFlameScale,
} from './hearth'
import { VILLAGE_FIRE } from './layout'
import { villageLifeProps } from './lifeSpots'
import { SEEDS, sharedLayout } from './layoutHarness'
import { WALKER_RADIUS } from './collision'

beforeAll(async () => {
  await setupGeodata()
})

/** Every rain factor the rule can produce, 0 (drowned) to 1 (dry). */
const RAIN_FACTORS = Array.from({ length: 21 }, (_, i) => i / 20)

describe('the flame stands on the hearth (point 348 (a))', () => {
  it('the village flame base stays at hearth height across the whole scale range', () => {
    const lift = flameGeometryLift(VILLAGE_FLAME_HEIGHT)
    for (const rf of RAIN_FACTORS) {
      const s = villageFlameScale(rf)
      expect(flameBaseY(HEARTH_TOP, s, lift, VILLAGE_FLAME_HEIGHT)).toBeCloseTo(HEARTH_TOP, 9)
    }
  })

  it('the fishers\' flame base stays at hearth height across flicker and rain', () => {
    const lift = flameGeometryLift(FISHERY_FLAME_HEIGHT)
    for (const rf of RAIN_FACTORS) {
      for (let t = 0; t < 2; t += 0.037) {
        const s = fisheryFlameScale(t, rf)
        expect(flameBaseY(HEARTH_TOP, s, lift, FISHERY_FLAME_HEIGHT)).toBeCloseTo(HEARTH_TOP, 9)
      }
    }
  })

  it('the old centre-scaled mounting floats — the negative control the fix answers', () => {
    // The pre-348 cone: centred geometry at y 0.42; at the smallest size its
    // base hung well above the pit.
    const smallest = villageFlameScale(0)
    expect(flameBaseY(0.42, smallest, 0, VILLAGE_FLAME_HEIGHT) - HEARTH_TOP).toBeGreaterThan(0.1)
  })

  it('the lifted cone geometry really has its base at local 0', () => {
    const g = new ConeGeometry(0.3, VILLAGE_FLAME_HEIGHT, 8).translate(0, flameGeometryLift(VILLAGE_FLAME_HEIGHT), 0)
    g.computeBoundingBox()
    expect(g.boundingBox!.min.y).toBeCloseTo(0, 9)
    expect(g.boundingBox!.max.y).toBeCloseTo(VILLAGE_FLAME_HEIGHT, 9)
  })
})

describe('the hearth collider (point 348 (b))', () => {
  it('covers the drawn stone ring and adds the calibratable clearance', () => {
    expect(HEARTH_RADIUS).toBeCloseTo(HEARTH_STONE_RING + HEARTH_STONE_RADIUS, 9)
    expect(hearthColliderRadius()).toBeCloseTo(HEARTH_RADIUS + balance.fire.hearthClearance, 5)
    expect(hearthColliderRadius()).toBeGreaterThan(HEARTH_RADIUS)
  })

  it('follows a debug edit of the clearance', () => {
    const was = balance.fire.hearthClearance
    try {
      balance.fire.hearthClearance = 0.5
      expect(villageLifeProps(VILLAGE_FIRE, 'zulu-village')[0].r).toBeCloseTo(HEARTH_RADIUS + 0.5, 5)
    } finally {
      balance.fire.hearthClearance = was
    }
  })

  const villages = PLACES.filter((p) => p.kind === 'village').map((p) => [p.id] as const)
  it.each(villages)('%s: the hearth collider is in the walker set, and no errand target stands inside it', (id) => {
    const r = hearthColliderRadius()
    for (const s of SEEDS) {
      const layout = sharedLayout(id, s)
      const hearth = layout.colliders.find(
        (c) => (c.kind === undefined || c.kind === 'circle') && c.x === VILLAGE_FIRE[0] && c.z === VILLAGE_FIRE[1] && c.r === r,
      )
      expect(hearth, `${id} seed ${s}: no hearth collider`).toBeTruthy()
      for (const [ex, ez] of layout.errands) {
        expect(
          Math.hypot(ex - VILLAGE_FIRE[0], ez - VILLAGE_FIRE[1]),
          `${id} seed ${s}: errand (${ex.toFixed(2)}, ${ez.toFixed(2)}) inside the hearth`,
        ).toBeGreaterThanOrEqual(r + WALKER_RADIUS - 1e-6)
      }
    }
  })
})
