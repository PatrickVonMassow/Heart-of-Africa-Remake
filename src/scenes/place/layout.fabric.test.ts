// WHAT THE SETTLEMENT FABRIC OWES THE PEOPLE WALKING IT (points 155/413,
// work-orders 604/688; split out of `layout.test.ts` under work-order 1178).
// A villager can spawn and run an errand, the drawn fence really is the fence
// that stops him, the animals stand on ground they can leave, no two palisades
// grow through each other, and every settlement keeps one way out walkable.

import { beforeAll, describe, expect, it } from 'vitest'
import { setupGeodata } from '../../test/geodata'
import { SEEDS, REPORTED_SEED, WEDGE_SEED, VILLAGES } from './layoutHarness'
import { buildLayout, fenceColliders, fencePanels } from './layout'
import { spawnPointFree, standingClear, WALKER_RADIUS } from './collision'
import { ANIMAL_RADIUS, animalAnchors } from './animalSpots'
import { PLACES } from '../../world/geo'

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
