// THE WAY OUT, AND THE PALISADES THAT COULD SHUT IT (work-orders 604/688;
// split out of `layout.test.ts` under work-order 1178). The two subjects that
// sweep every settlement with a walkability probe and cost the most of the
// file, and they answer one question between them: can the player still get
// out of the place he walked into?

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { SEEDS, REPORTED_SEED, WEDGE_SEED, PORTS, VILLAGES , sharedLayout } from './layoutHarness'
import {
  COMPOUND_RING_MIN,
  WAY_OUT_HALF_WIDTH,
  WAY_OUT_INNER,
  WAY_OUT_OUTER,
  dwellingCircleRadius,
  fenceColliders,
  type PlaceLayout,
} from './layout'
import { PLAYER_RADIUS, type Collider } from './collision'
import { placeById } from '../../world/geo'
import { REGION_PLACE_STYLES } from './regionStyles'

// The landmark boulder is placed against the REAL terrain (it refuses every wet
// spot — work-order 585), so this file needs the elevation dataset the browser
// has; without it the whole map reads as ocean and no bank exists to place it on.
beforeAll(async () => {
  await setupGeodata()
})

describe('no two palisades cross (work-order 604)', () => {
  /** Distance between the SURFACES of two capsule/circle colliders. */
  const gap = (a: Collider, b: Collider) => {
    const pts = (c: Collider): Array<[number, number]> =>
      c.kind === 'segment'
        ? Array.from({ length: 21 }, (_, i) => [c.x1 + ((c.x2 - c.x1) * i) / 20, c.z1 + ((c.z2 - c.z1) * i) / 20])
        : c.kind === 'box'
          ? [[c.x, c.z]]
          : [[c.x, c.z]]
    const radius = (c: Collider) => (c.kind === 'box' ? Math.hypot(c.hx, c.hz) : c.r)
    let best = Infinity
    for (const [ax, az] of pts(a))
      for (const [bx, bz] of pts(b)) best = Math.min(best, Math.hypot(ax - bx, az - bz))
    return best - radius(a) - radius(b)
  }

  /** The worst approach between the colliders of two DIFFERENT fence runs. */
  const worstFencePair = (layout: PlaceLayout) => {
    const runs = layout.fences.map((f) => fenceColliders(f))
    let worst = Infinity
    for (let i = 0; i < runs.length; i++)
      for (let j = i + 1; j < runs.length; j++)
        for (const a of runs[i])
          for (const b of runs[j]) {
            if (Math.hypot(centre(a)[0] - centre(b)[0], centre(a)[1] - centre(b)[1]) > 6) continue
            worst = Math.min(worst, gap(a, b))
          }
    return worst
  }
  const centre = (c: Collider): [number, number] =>
    c.kind === 'segment' ? [(c.x1 + c.x2) / 2, (c.z1 + c.z2) / 2] : [c.x, c.z]

  it.each(VILLAGES.map((p) => [p.id] as const))(
    '%s: two fence runs always leave the player room to walk between them',
    (id) => {
      for (const s of [...SEEDS, REPORTED_SEED, WEDGE_SEED, 1, 2, 3, 4, 5, 6]) {
        const worst = worstFencePair(sharedLayout(id, s))
        expect(
          worst,
          `${id} seed ${s}: two fence runs approach to ${worst.toFixed(2)} m`,
        ).toBeGreaterThan(2 * PLAYER_RADIUS)
      }
    },
  )

  // The witness: the reported world had two Bambara compound palisades running
  // THROUGH each other, and the traveller was pressed into the sliver where they
  // crossed. The old rule is replayed here — five compounds on a hand-picked
  // angle set, two of them 0.8 rad apart at ~15 m — and the same measurement
  // that passes above finds the crossing in it.
  it('the pre-fix compound spacing put two rings through each other', () => {
    const oldAngles = [0.1, 2.3, 3.35, 4.15, 5.5]
    const rings = oldAngles.map((a) => [Math.cos(a) * 15, Math.sin(a) * 15] as [number, number])
    let closest = Infinity
    for (let i = 0; i < rings.length; i++)
      for (let j = i + 1; j < rings.length; j++)
        closest = Math.min(closest, Math.hypot(rings[i][0] - rings[j][0], rings[i][1] - rings[j][1]))
    // Two rings of the smallest radius the plan draws already overlap at that
    // spacing — before a single hut widens either of them.
    expect(closest).toBeLessThan(2 * COMPOUND_RING_MIN)
  })

  // Rule 1 of the same repair: a compound's wall ENCLOSES its huts instead of
  // growing through them. Checked across every village, because the placement
  // rule that enforces it is the shared one.
  it.each(VILLAGES.map((p) => [p.id] as const))('%s: no dwelling grows through a fence', (id) => {
    const style = REGION_PLACE_STYLES[placeById(id).region]
    for (const s of [...SEEDS, REPORTED_SEED, WEDGE_SEED, 1, 2, 3]) {
      const layout = sharedLayout(id, s)
      const runs = layout.fences.flatMap((f) => fenceColliders(f))
      for (const d of layout.dwellings) {
        const body = dwellingCircleRadius(d, style)
        if (body === null) continue
        for (const c of runs) {
          const g = gap({ x: d.x, z: d.z, r: body }, c)
          expect(
            g,
            `${id} seed ${s}: ${d.kind} at ${d.x.toFixed(1)},${d.z.toFixed(1)} crosses a fence`,
          ).toBeGreaterThan(-0.5)
        }
      }
    }
  })
})

// THE WAY OUT OF A SETTLEMENT (work-order 688). The loose dressing used to be
// scattered over the boundary ring as well, and whether a walker could cross
// that ring anywhere without squeezing past a boulder was left to the draw. It
// ran out: at the Bambara village, seed 42, exactly ONE of 180 bearings was open
// before this point rearranged the village and NONE after it, and the browser
// suite's edge-band section reported "every bearing blocked" on both seasons —
// a boundary the player cannot walk out over and a give-way band that cannot be
// read against bare ground anywhere.
describe('every settlement keeps one way out free (work-order 688)', () => {
  /** The crossing as the picture check reads it: bare ground from well inside
   *  the boundary to well outside it, at the way out's own width. */
  const crossingIsClear = (layout: PlaceLayout, bearing: number): string | null => {
    const clear = (ax: number, az: number): string | null => {
      const hit = (x: number, z: number, need: number, what: string) =>
        Math.hypot(x - ax, z - az) < need ? what : null
      for (const c of layout.colliders) {
        const found =
          c.kind === 'segment'
            ? hit(c.x1, c.z1, WAY_OUT_HALF_WIDTH, 'fence') ?? hit(c.x2, c.z2, WAY_OUT_HALF_WIDTH, 'fence')
            : c.kind === 'box'
              ? hit(c.x, c.z, Math.hypot(c.hx, c.hz) + WAY_OUT_HALF_WIDTH, 'building')
              : hit(c.x, c.z, c.r + WAY_OUT_HALF_WIDTH, 'solid')
        if (found) return found
      }
      return null
    }
    for (let d = layout.radius - WAY_OUT_INNER; d <= layout.radius + WAY_OUT_OUTER; d += 1.5) {
      const blocker = clear(Math.cos(bearing) * d, Math.sin(bearing) * d)
      if (blocker) return `${blocker} at ${d.toFixed(1)} m out`
    }
    return null
  }

  // THE SWEEP YIELDS between worlds. This file is the slowest in the unit layer,
  // and a worker that builds settlement after settlement without coming up for
  // air misses its own `onTaskUpdate` RPC: the run then fails with every test
  // green and none named, which is the load signature of point 803 — measured
  // here on an idle machine, twice running, until these two sweeps yielded.
  it.each([...PORTS, ...VILLAGES].map((p) => [p.id] as const))('%s: the way out stays walkable', async (id) => {
    for (const seed of [...SEEDS, REPORTED_SEED, WEDGE_SEED, 1, 2, 3]) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      const layout = sharedLayout(id, seed)
      expect(layout.wayOut, `${id} seed ${seed}: no crossing of the boundary is free`).not.toBeNull()
      expect(
        crossingIsClear(layout, layout.wayOut as number),
        `${id} seed ${seed}: the way out at ${(layout.wayOut as number).toFixed(3)} rad is blocked`,
      ).toBeNull()
    }
  })

  // WHAT THE CROSSING COSTS. The dressing that falls in it is dropped and not
  // drawn again elsewhere, so the price is paid in loose objects — and it has to
  // stay small, because a village stripped of its greenery to buy the corridor
  // would pass the check above and be a worse picture than the one it fixed.
  // Measured over every settlement at eight seeds: 0.74 of the 23 loose objects
  // dropped on average, 5 in the worst layout, and the floors below are the
  // worst kept counts on record (baganda-village seed 7 and tuareg-village seed
  // 7). They are a bar on the price, not a target. The flora floor fell by one
  // when the plaza's line to the loom (work-order 1190) took a tree out of
  // mandinka-village seed 1337: that tree is the view's price, not the way's.
  it.each([...PORTS, ...VILLAGES].map((p) => [p.id] as const))('%s: the dressing is not thinned out for it', async (id) => {
    for (const seed of [...SEEDS, REPORTED_SEED, WEDGE_SEED, 1, 2, 3]) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      const layout = sharedLayout(id, seed)
      expect(layout.flora.length, `${id} seed ${seed}: flora`).toBeGreaterThanOrEqual(5)
      expect(layout.rocks.length, `${id} seed ${seed}: rocks`).toBeGreaterThanOrEqual(11)
    }
  })
})
