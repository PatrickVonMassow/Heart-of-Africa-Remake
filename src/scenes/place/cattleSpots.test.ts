// The kraal cattle stay inside the pen and out of its fence (work-order 359),
// swept over every real kraal village the world model builds.

import { describe, expect, it } from 'vitest'
import { VILLAGE_CATTLE } from '../../config/balance'
import { buildCattleParts, cattleReach } from '../../render/cattle'
import { cattleArrangement } from '../../systems/cattle'
import { PLACES } from '../../world/geo'
import {
  cattleAnchors,
  cattleBodyCircles,
  cattleHoldRadius,
  clampToHold,
  insidePen,
  surfaceDistance,
  withCattleBodies,
  cattleLiveColliders,
} from './cattleSpots'
import type { CircleCollider, Collider } from './collision'
import { buildLayout } from './layout'

const REACH = cattleReach(buildCattleParts(0))
const KRAAL_VILLAGES = PLACES.filter((p) => p.kind === 'village' && p.peopleId && cattleArrangement(p.peopleId) === 'kraal')

describe('surfaceDistance', () => {
  it('measures circles, segments and boxes', () => {
    expect(surfaceDistance({ x: 0, z: 0, r: 1 }, 3, 0)).toBeCloseTo(2, 9)
    expect(surfaceDistance({ kind: 'segment', x1: -1, z1: 2, x2: 1, z2: 2, r: 0.5 }, 0, 0)).toBeCloseTo(1.5, 9)
    expect(surfaceDistance({ kind: 'box', x: 5, z: 0, hx: 1, hz: 1, rot: 0 }, 0, 0)).toBeCloseTo(4, 9)
    expect(surfaceDistance({ kind: 'box', x: 0, z: 0, hx: 1, hz: 1, rot: 0 }, 0, 0)).toBeLessThan(0)
  })
})

describe('the kraal herd stays inside its pen (every kraal village, several seeds)', () => {
  it('has kraal villages to sweep, each with a pen', () => {
    expect(KRAAL_VILLAGES.map((p) => p.peopleId).sort()).toEqual(['maasai', 'pedi', 'zulu'])
  })

  for (const place of KRAAL_VILLAGES)
    for (const seed of [1, 7, 4242]) {
      it(`${place.id}@${seed}: every beast fits, and every drawn part keeps clear of every collider`, () => {
        const layout = buildLayout(place.id, seed)
        const pen = layout.pen
        expect(pen, 'kraal village without a pen').not.toBeNull()
        if (!pen) return
        const hold = cattleHoldRadius(pen, layout.colliders, REACH)
        expect(hold, 'the pen is too small for one beast').toBeGreaterThan(VILLAGE_CATTLE.moverRadius)
        const anchors = cattleAnchors(seed, VILLAGE_CATTLE.fullHerd, pen, hold, layout.colliders)
        // Wherever the centre is clamped to, the whole body (reach, any facing)
        // keeps the clearance from the fence and everything outside the pen;
        // an object dropped inside the pen keeps the anchor a mover radius off.
        const probes: Array<[number, number]> = anchors.map((a) => [a.x, a.z])
        for (let k = 0; k < 24; k++) {
          const a = (k / 24) * Math.PI * 2
          probes.push(clampToHold(pen, hold, pen.x + Math.cos(a) * 10, pen.z + Math.sin(a) * 10))
        }
        for (const [x, z] of probes) {
          expect(Math.hypot(x - pen.x, z - pen.z)).toBeLessThanOrEqual(hold + 1e-9)
          for (const c of layout.colliders)
            if (!insidePen(pen, c)) expect(surfaceDistance(c, x, z)).toBeGreaterThanOrEqual(REACH + VILLAGE_CATTLE.fenceClearance - 1e-9)
          // And inside the pen's own ring, not merely clear of the posts.
          expect(Math.hypot(x - pen.x, z - pen.z) + REACH).toBeLessThan(pen.r)
        }
        for (const a of anchors)
          for (const c of layout.colliders)
            if (insidePen(pen, c)) expect(surfaceDistance(c, a.x, a.z)).toBeGreaterThanOrEqual(VILLAGE_CATTLE.moverRadius - 1e-9)
        // The full herd stands apart: no two centres closer than two mover radii.
        for (let i = 0; i < anchors.length; i++)
          for (let j = i + 1; j < anchors.length; j++)
            expect(Math.hypot(anchors[i].x - anchors[j].x, anchors[i].z - anchors[j].z)).toBeGreaterThanOrEqual(2 * VILLAGE_CATTLE.moverRadius - 1e-9)
      })
    }
})

describe('each beast is a solid body', () => {
  it('presents a fore and a hind circle along its facing', () => {
    const out: [CircleCollider, CircleCollider] = [
      { x: 0, z: 0, r: 0 },
      { x: 0, z: 0, r: 0 },
    ]
    cattleBodyCircles(1, 2, 0, out)
    expect(out[0].z).toBeCloseTo(2 + VILLAGE_CATTLE.bodyCircleOffset, 9)
    expect(out[1].z).toBeCloseTo(2 - VILLAGE_CATTLE.bodyCircleOffset, 9)
    expect(out[0].x).toBeCloseTo(1, 9)
    cattleBodyCircles(0, 0, Math.PI / 2, out)
    expect(out[0].x).toBeCloseTo(VILLAGE_CATTLE.bodyCircleOffset, 9)
  })

  it('joins the traveller collider set while standing, and leaves it with the scene', () => {
    const base: Collider[] = [{ x: 9, z: 9, r: 1 }]
    expect(withCattleBodies(base)).toBe(base)
    cattleLiveColliders.push({ x: 0, z: 0, r: 0.3 })
    expect(withCattleBodies(base)).toHaveLength(2)
    cattleLiveColliders.length = 0
  })
})
