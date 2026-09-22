// WHAT THE SETTLEMENT FABRIC OWES THE PEOPLE WALKING IT (points 155/413,
// work-orders 604/688; split out of `layout.test.ts` under work-order 1178).
// A villager can spawn and run an errand, the drawn fence really is the fence
// that stops him, the animals stand on ground they can leave, no two palisades
// grow through each other, and every settlement keeps one way out walkable.

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { SEEDS, REPORTED_SEED, WEDGE_SEED, PORTS, VILLAGES } from './layoutHarness'
import {
  COMPOUND_RING_MIN,
  WAY_OUT_HALF_WIDTH,
  WAY_OUT_INNER,
  WAY_OUT_OUTER,
  buildLayout,
  dwellingCircleRadius,
  fenceColliders,
  fencePanels,
  type PlaceLayout,
} from './layout'
import {
  spawnPointFree,
  standingClear,
  PLAYER_RADIUS,
  WALKER_RADIUS,
  type Collider,
} from './collision'
import { ANIMAL_RADIUS, animalAnchors } from './animalSpots'
import { PLACES, placeById } from '../../world/geo'
import { REGION_PLACE_STYLES } from './regionStyles'

// The landmark boulder is placed against the REAL terrain (it refuses every wet
// spot — work-order 585), so this file needs the elevation dataset the browser
// has; without it the whole map reads as ocean and no bank exists to place it on.
beforeAll(async () => {
  await setupGeodata()
})

// Spawn freedom (point 155): the villager wedged in a Tuareg pocket had walked
// to an errand point a jitter dropped between a stall board, a rock and a hut
// wall. Every errand target must sit on free ground the walker can also LEAVE —
// swept across every place and several seeds against the FULL collider set
// (stalls, rocks and props included, not only buildings).
describe('inhabitant spawn/errand freedom (point 155)', () => {
  it.each(PLACES.map((p) => [p.id] as const))(
    '%s: every errand point has a clear standing circle and an escape direction',
    (id) => {
      for (const s of SEEDS) {
        const layout = buildLayout(id, s)
        for (const [ex, ez] of layout.errands) {
          expect(
            spawnPointFree(layout.colliders, ex, ez, WALKER_RADIUS),
            `${id} seed ${s}: errand (${ex.toFixed(2)}, ${ez.toFixed(2)}) is wedged`,
          ).toBe(true)
        }
      }
    },
  )
})

// The fence a goat walked through (point 413). The picture draws a continuous
// woven/stone/thorn run between the posts; the collider was one circle per post,
// so the blocked band pinched at every midpoint. Swept over every fence of every
// settlement: along a drawn panel there is no opening an inhabitant fits
// through, and the gates the renderer leaves open stay open.
describe('fence colliders follow the drawn panels (point 413)', () => {
  /** The ring's own post spacing; a wider neighbour distance spans a gate. */
  const postSpacing = (posts: Array<[number, number]>) => {
    let min = Infinity
    for (let i = 0; i < posts.length; i++) {
      const a = posts[i]
      const b = posts[(i + 1) % posts.length]
      const d = Math.hypot(b[0] - a[0], b[1] - a[1])
      if (d > 1e-6 && d < min) min = d
    }
    return min
  }

  it.each(PLACES.map((p) => [p.id] as const))('%s: no gap between neighbouring panel colliders', (id) => {
    for (const s of [...SEEDS, REPORTED_SEED]) {
      const layout = buildLayout(id, s)
      for (const f of layout.fences) {
        const run = fenceColliders(f)
        const n = f.posts.length
        const span = postSpacing(f.posts) * 1.5
        for (let i = 0; i < n; i++) {
          const a = f.posts[i]
          const b = f.posts[(i + 1) % n]
          const len = Math.hypot(b[0] - a[0], b[1] - a[1])
          if (len > span) continue // a gate the renderer leaves open
          // The colliders that can cover this span — its own and its two
          // neighbours. Judged against the FENCE's own run only, so no passing
          // hut can make a hole in the wall look closed.
          const local = [run[(i + n - 1) % n], run[i], run[(i + 1) % n]]
          const steps = 40
          let open = 0
          let worst = 0
          for (let k = 0; k <= steps; k++) {
            const u = k / steps
            const px = a[0] + (b[0] - a[0]) * u
            const pz = a[1] + (b[1] - a[1]) * u
            // A point outside every panel shape: the wall is not there.
            if (standingClear(local, px, pz, 0)) open++
            else open = 0
            worst = Math.max(worst, open * (len / steps))
          }
          expect(
            worst,
            `${id} seed ${s}: ${f.kind} fence opens ${worst.toFixed(2)} m between posts ${i} and ${(i + 1) % n}`,
          ).toBeLessThan(WALKER_RADIUS)
        }
      }
    }
  })

  it.each(PLACES.map((p) => [p.id] as const))('%s: every gate stays walkable', (id) => {
    for (const s of [...SEEDS, REPORTED_SEED]) {
      const layout = buildLayout(id, s)
      for (const f of layout.fences) {
        const run = fenceColliders(f)
        const span = postSpacing(f.posts) * 1.5
        for (let i = 0; i < f.posts.length; i++) {
          const a = f.posts[i]
          const b = f.posts[(i + 1) % f.posts.length]
          if (Math.hypot(b[0] - a[0], b[1] - a[1]) <= span) continue
          const mx = (a[0] + b[0]) / 2
          const mz = (a[1] + b[1]) / 2
          expect(
            standingClear(run, mx, mz, WALKER_RADIUS),
            `${id} seed ${s}: ${f.kind} gate walled shut at (${mx.toFixed(2)}, ${mz.toFixed(2)})`,
          ).toBe(true)
        }
      }
    }
  })

  it.each(PLACES.map((p) => [p.id] as const))('%s: one DRAWN panel per fence collider — the wall cannot outrun the picture', (id) => {
    for (const s of [...SEEDS, REPORTED_SEED]) {
      const layout = buildLayout(id, s)
      // Work-order 583: the scene instanced its fence panels into a buffer with
      // a FIXED capacity while the collider run had none, so a compound whose
      // rings asked for more panels than the buffer held drew the overflow
      // nowhere — and the player met a wall in open sand. The two lists are one
      // run seen twice; counting them here is what keeps them that way.
      const panels = fencePanels(layout.fences)
      const colliders = layout.fences.flatMap((f) => fenceColliders(f))
      expect(panels.length, `${id} seed ${s}`).toBe(colliders.length)
      for (const kind of ['thorn', 'woven', 'stone'] as const) {
        const drawn = panels.filter((p) => p.kind === kind).length
        const posts = layout.fences.filter((f) => f.kind === kind).reduce((a, f) => a + f.posts.length, 0)
        expect(drawn, `${id} seed ${s}: ${kind}`).toBe(posts)
      }
      // Every panel stands ON its post, facing the next one — the same frame the
      // collider capsule is built in.
      for (const p of panels) {
        expect(layout.fences.some((f) => f.posts.some(([x, z]) => Math.hypot(x - p.x, z - p.z) < 1e-9))).toBe(true)
      }
    }
  })

  it('a compound village really does ask for more panels than the old ceiling held', () => {
    // The regression in one number: a woven run longer than the fixed buffer of
    // 160 the scene used to carry. The test above already proves draw and
    // collider agree; this line is what says the defect was real. It asks the
    // WORLDS rather than one seed — the compound walls are sized from the huts
    // they enclose (work-order 604), so which seed holds the longest run moved.
    let most = 0
    for (const id of VILLAGES.map((p) => p.id))
      for (const s of [...SEEDS, REPORTED_SEED, WEDGE_SEED, 1, 2, 3, 4, 5, 6, 7, 8])
        most = Math.max(most, fencePanels(buildLayout(id, s).fences).filter((p) => p.kind === 'woven').length)
    expect(most).toBeGreaterThan(160)
  })
})

// The animals' grazing spots (point 413): a goat anchor was a bare radius around
// the centre, validated against nothing — it could sit inside a tent or a rock,
// and the wobble drove the animal in and out of it forever. Swept over every
// settlement of every region, with the seed and count the scene really uses.
describe('animal anchors stand on free ground (point 413)', () => {
  const localSeed = (seed: number, placeId: string) => {
    let hash = 0
    for (const c of placeId) hash = (hash * 31 + c.charCodeAt(0)) | 0
    return (seed ^ hash) >>> 0
  }

  it.each(VILLAGES.map((p) => [p.id] as const))('%s: every animal anchor is clear and can be left', (id) => {
    for (const s of SEEDS) {
      const layout = buildLayout(id, s)
      const anchors = animalAnchors(localSeed(s, id), layout.pen ? 4 : 3, layout.pen, layout.colliders)
      expect(anchors.length).toBeGreaterThan(0)
      for (const a of anchors) {
        expect(
          spawnPointFree(layout.colliders, a.x, a.z, ANIMAL_RADIUS),
          `${id} seed ${s}: animal anchor (${a.x.toFixed(2)}, ${a.z.toFixed(2)}) is wedged`,
        ).toBe(true)
      }
    }
  })
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
        const worst = worstFencePair(buildLayout(id, s))
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
      const layout = buildLayout(id, s)
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
      const layout = buildLayout(id, seed)
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
  // 7). They are a bar on the price, not a target.
  it.each([...PORTS, ...VILLAGES].map((p) => [p.id] as const))('%s: the dressing is not thinned out for it', async (id) => {
    for (const seed of [...SEEDS, REPORTED_SEED, WEDGE_SEED, 1, 2, 3]) {
      await new Promise((resolve) => setTimeout(resolve, 0))
      const layout = buildLayout(id, seed)
      expect(layout.flora.length, `${id} seed ${seed}: flora`).toBeGreaterThanOrEqual(6)
      expect(layout.rocks.length, `${id} seed ${seed}: rocks`).toBeGreaterThanOrEqual(11)
    }
  })
})
