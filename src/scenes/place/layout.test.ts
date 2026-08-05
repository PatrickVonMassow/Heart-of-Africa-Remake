// Pure layout invariants (design.md §2.6/§4.5, point 15): ports grow an
// organic lane fabric whose buildings front the lanes with their door side,
// villages follow their people's period-accurate organising principle, and
// everywhere doors stay reachable, windows keep a clear line outward and no
// building stands on a lane.

import { describe, expect, it } from 'vitest'
import { buildLayout, fenceColliders, type PlaceLayout, type Interactive, type DwellingDef } from './layout'
import { spawnPointFree, standingClear, WALKER_RADIUS } from './collision'
import { ANIMAL_RADIUS, animalAnchors } from './animalSpots'
import { closestOnPolyline } from './lanePlan'
import { PLACES, placeById } from '../../world/geo'
import { ROCK_VILLAGE_ID, ROCK_HEIGHT_UNITS, communicationRockSite } from '../../world/communicationRock'
import { VILLAGE_PLANS } from './regionStyles'

const SEEDS = [7, 42, 1337]
const PORTS = PLACES.filter((p) => p.kind === 'port')
const VILLAGES = PLACES.filter((p) => p.kind === 'village')

/** Circle-approximated body radius of a solid building. */
const bodyR = (d: DwellingDef) => d.r
const interactiveR = (it: Interactive, port: boolean) =>
  it.type === 'villager' ? 0 : port ? 3.2 : it.type === 'market' ? 2.9 : 3.35

interface Body {
  x: number
  z: number
  r: number
}

function solidBodies(layout: PlaceLayout, port: boolean): Body[] {
  const bodies: Body[] = layout.dwellings.map((d) => ({ x: d.x, z: d.z, r: bodyR(d) }))
  for (const it of layout.interactives) {
    const r = interactiveR(it, port)
    if (r > 0) bodies.push({ x: it.pos[0], z: it.pos[1], r })
  }
  return bodies
}

/** Interior samples of a lane centreline (ends trimmed — lanes may END at a door). */
function laneSamples(points: Array<[number, number]>, trim = 1.4, step = 0.6): Array<[number, number]> {
  const samples: Array<[number, number]> = []
  let total = 0
  const segs: Array<{ ax: number; az: number; dx: number; dz: number; len: number; start: number }> = []
  for (let i = 0; i + 1 < points.length; i++) {
    const len = Math.hypot(points[i + 1][0] - points[i][0], points[i + 1][1] - points[i][1])
    segs.push({
      ax: points[i][0],
      az: points[i][1],
      dx: points[i + 1][0] - points[i][0],
      dz: points[i + 1][1] - points[i][1],
      len,
      start: total,
    })
    total += len
  }
  for (let s = trim; s <= total - trim; s += step) {
    const seg = segs.find((g) => s >= g.start && s <= g.start + g.len)
    if (!seg || seg.len === 0) continue
    const t = (s - seg.start) / seg.len
    samples.push([seg.ax + seg.dx * t, seg.az + seg.dz * t])
  }
  return samples
}

describe('village plan mapping (design.md §4.5)', () => {
  it('maps every people to a period-accurate plan', () => {
    for (const v of VILLAGES) {
      expect(VILLAGE_PLANS[v.peopleId ?? ''], v.id).toBeTruthy()
    }
  })

  it('the Bemba get no cattle plan (docs/peoples-1890.md §5.1)', () => {
    // They lived in the tsetse belt by citemene finger millet and kept no
    // cattle, so the Central Cattle Pattern ring — which the game mapped them
    // to, kraal and all — was the wrong organising principle for them.
    expect(VILLAGE_PLANS.bemba).not.toBe('ring')
    expect(VILLAGE_PLANS.bemba).toBe('compound')
  })
})

describe.each(SEEDS)('layout invariants (seed %i)', (seed) => {
  it.each(PLACES.map((p) => [p.id] as const))('%s: windows keep a clear line outward', (id) => {
    const layout = buildLayout(id, seed)
    const port = PORTS.some((p) => p.id === id)
    const bodies = solidBodies(layout, port)
    for (let i = 0; i < bodies.length; i++) {
      for (let j = i + 1; j < bodies.length; j++) {
        const gap = Math.hypot(bodies[i].x - bodies[j].x, bodies[i].z - bodies[j].z) - bodies[i].r - bodies[j].r
        expect(gap, `${id}: bodies ${i}/${j} wall gap`).toBeGreaterThan(0.85)
      }
    }
  })

  it.each(PLACES.map((p) => [p.id] as const))('%s: no building stands on a lane', (id) => {
    const layout = buildLayout(id, seed)
    const port = PORTS.some((p) => p.id === id)
    const bodies = solidBodies(layout, port)
    for (const path of layout.paths) {
      for (const [sx, sz] of laneSamples(path.points)) {
        for (const b of bodies) {
          expect(Math.hypot(sx - b.x, sz - b.z), `${id}: lane sample inside a body`).toBeGreaterThan(b.r - 0.05)
        }
      }
    }
  })

  it.each(PLACES.map((p) => [p.id] as const))('%s: every door is reachable, no corner squeeze', (id) => {
    const layout = buildLayout(id, seed)
    const port = PORTS.some((p) => p.id === id)
    const bodies = solidBodies(layout, port)
    const doors: Array<{ door: [number, number]; owner: Body | null }> = layout.dwellings.map((d) => ({
      door: d.door,
      owner: { x: d.x, z: d.z, r: bodyR(d) },
    }))
    for (const it of layout.interactives) {
      if (it.door) doors.push({ door: it.door, owner: { x: it.pos[0], z: it.pos[1], r: interactiveR(it, port) } })
    }
    for (const { door, owner } of doors) {
      expect(Math.hypot(door[0], door[1]), `${id}: door inside the walkable radius`).toBeLessThan(layout.radius)
      for (const b of bodies) {
        if (owner && b.x === owner.x && b.z === owner.z) continue
        // A standing spot exists directly at the door: no OTHER body covers it.
        expect(Math.hypot(door[0] - b.x, door[1] - b.z), `${id}: door sealed by a neighbour`).toBeGreaterThan(b.r + 0.3)
      }
    }
  })

  it.each(VILLAGES.map((v) => [v.id] as const))('%s: the elder stands clear of every door trigger', (id) => {
    const layout = buildLayout(id, seed)
    const elder = layout.interactives.find((i) => i.type === 'villager')!
    for (const it2 of layout.interactives) {
      if (!it2.door) continue
      expect(
        Math.hypot(elder.pos[0] - it2.door[0], elder.pos[1] - it2.door[1]),
        `${id}: elder vs ${it2.type} door`,
      ).toBeGreaterThan(3.3)
    }
  })

  it.each(PLACES.map((p) => [p.id] as const))('%s: no building corner reaches the walkable edge', (id) => {
    const layout = buildLayout(id, seed)
    for (const d of layout.dwellings) {
      const cornerR =
        d.kind === 'warehouse' ? Math.hypot(d.r, 2.3) : d.kind === 'box' ? d.r * 1.33 : d.kind === 'mosque' ? d.r * 1.29 : d.r
      expect(
        Math.hypot(d.x, d.z) + cornerR,
        `${id}: ${d.kind} corner inside the radius`,
      ).toBeLessThan(layout.radius - 0.85)
    }
  })

  it.each(PLACES.map((p) => [p.id] as const))('%s: the spawn corridor stays clear', (id) => {
    const layout = buildLayout(id, seed)
    const port = PORTS.some((p) => p.id === id)
    for (const b of solidBodies(layout, port)) {
      if (b.z > 5 && b.z < layout.radius) {
        expect(Math.abs(b.x) - b.r, `${id}: body juts into the spawn corridor`).toBeGreaterThan(0.6)
      }
    }
  })

  it.each(PORTS.map((p) => [p.id] as const))('%s: winding lanes, a square, buildings front their lane', (id) => {
    const layout = buildLayout(id, seed)
    // An organic network: main + cross lane + square (+ alleys with size),
    // and the main lanes are genuinely winding, not straight axes.
    expect(layout.paths.length).toBeGreaterThanOrEqual(3)
    expect(layout.paths.some((p) => p.width >= 6), `${id}: a small square exists`).toBe(true)
    const [main, cross] = layout.paths
    let lateral = 0
    for (const lane of [main, cross]) {
      const a = lane.points[0]
      const b = lane.points[lane.points.length - 1]
      const len = Math.hypot(b[0] - a[0], b[1] - a[1])
      for (const [px, pz] of lane.points.slice(1, -1)) {
        lateral += Math.abs(((b[0] - a[0]) * (a[1] - pz) - (a[0] - px) * (b[1] - a[1])) / len)
      }
      expect(lane.points.length, `${id}: lane is a polyline, not an axis`).toBeGreaterThanOrEqual(4)
    }
    expect(lateral, `${id}: lanes are winding`).toBeGreaterThan(1)
    // Six functional buildings, each fronting a lane with its door.
    const functional = layout.interactives.filter((it) => it.type !== 'villager')
    expect(functional).toHaveLength(6)
    for (const it of functional) {
      expect(it.rot, `${id}: ${it.type} carries its yaw`).toBeTypeOf('number')
      const d = Math.min(...layout.paths.map((p) => closestOnPolyline(p.points, it.door![0], it.door![1]).dist))
      expect(d, `${id}: ${it.type} door reachable directly from a lane`).toBeLessThan(3.2)
    }
    // Every dwelling house fronts a lane too (stalls/tents dress the market,
    // the landmark tower is no dwelling).
    for (const d of layout.dwellings) {
      if (d.kind === 'stall' || d.kind === 'tent' || d.kind === 'tower') continue
      const dist = Math.min(...layout.paths.map((p) => closestOnPolyline(p.points, d.door[0], d.door[1]).dist))
      expect(dist, `${id}: ${d.kind} door reachable directly from a lane`).toBeLessThan(3.4)
    }
  })

  it.each(VILLAGES.map((v) => [v.id, VILLAGE_PLANS[v.peopleId ?? '']] as const))(
    '%s: follows its %s plan',
    (id, plan) => {
      const layout = buildLayout(id, seed)
      const huts = layout.dwellings.filter((d) => d.kind === 'hut' || d.kind === 'box' || d.kind === 'tent')
      expect(huts.length, `${id}: the village is inhabited`).toBeGreaterThanOrEqual(6)
      if (plan === 'ring') {
        // Central Cattle Pattern / enkang: cattle enclosure at the centre,
        // huts on the ring, a perimeter fence.
        expect(layout.pen, `${id}: central cattle enclosure`).not.toBeNull()
        expect(layout.fences.length).toBeGreaterThanOrEqual(2)
        for (const h of huts) {
          const r = Math.hypot(h.x, h.z)
          expect(r, `${id}: hut on the ring`).toBeGreaterThan(11.5)
          expect(r, `${id}: hut on the ring`).toBeLessThan(19)
        }
      } else if (plan === 'street') {
        // One cleared wide axis with two facing rows.
        const axis = layout.paths.find((p) => p.width >= 6)
        expect(axis, `${id}: the street axis exists`).toBeTruthy()
        let left = 0
        let right = 0
        for (const h of huts) {
          const c = closestOnPolyline(axis!.points, h.x, h.z)
          expect(Math.hypot(h.door[0] - c.x, h.door[1] - c.z), `${id}: door on the street`).toBeLessThan(6.5)
          if (h.x < c.x) left++
          else right++
        }
        expect(left, `${id}: houses face each other across the street`).toBeGreaterThanOrEqual(2)
        expect(right, `${id}: houses face each other across the street`).toBeGreaterThanOrEqual(2)
      } else if (plan === 'scatter') {
        // No lanes beyond the common paths, no compound fences.
        expect(layout.paths.length).toBe(3)
        const fenceAllowance = id === 'tuareg-village' ? 1 : 0 // the goat pen
        expect(layout.fences.length).toBeLessThanOrEqual(fenceAllowance)
      } else if (plan === 'ksar') {
        // Fortified block: a stone perimeter, dense flat-roofed houses.
        expect(layout.fences.some((f) => f.kind === 'stone'), `${id}: perimeter wall`).toBe(true)
        expect(layout.dwellings.filter((d) => d.kind === 'box').length).toBeGreaterThanOrEqual(8)
      } else if (plan === 'riverstrip' || plan === 'coastrow') {
        // A house band along one shore-parallel lane, doors onto it.
        const shore = layout.paths.find((p) => p.width >= 2 && Math.abs(p.points[0][0]) > 10)
        expect(shore, `${id}: the shore lane exists`).toBeTruthy()
        const boxes = layout.dwellings.filter((d) => d.kind === 'box')
        expect(boxes.length).toBeGreaterThanOrEqual(7)
        for (const b of boxes) {
          const c = closestOnPolyline(shore!.points, b.door[0], b.door[1])
          expect(Math.hypot(b.door[0] - c.x, b.door[1] - c.z), `${id}: door on the shore lane`).toBeLessThan(3.2)
        }
      } else {
        // Compound cluster: lanes to the compound entrances (beyond the 3
        // common paths) and fenced enclosures where the region fences.
        expect(layout.paths.length).toBeGreaterThanOrEqual(6)
        if (id === 'hausa-village' || id === 'mandinka-village') {
          expect(layout.fences.length, `${id}: walled compounds`).toBeGreaterThanOrEqual(3)
          expect(layout.dwellings.some((d) => d.kind === 'granary'), `${id}: granaries inside`).toBe(true)
        }
        if (id === 'bemba-village') {
          // docs/peoples-1890.md §5.1: tsetse belt, citemene millet — no
          // cattle, so no kraal; and no wall either, since the stockade is
          // attested for their VICTIMS, not for Bemba villages themselves.
          expect(layout.pen, `${id}: no livestock pen`).toBeNull()
          expect(layout.fences.length, `${id}: no invented stockade`).toBe(0)
          expect(layout.dwellings.some((d) => d.kind === 'granary'), `${id}: millet granaries`).toBe(true)
        }
      }
    },
  )

  it('timbuktu always builds the Djinguereber mosque', () => {
    // The landmark is guaranteed per run (design.md §4.4) — a fixed-spot-only
    // placement silently skipped it in ~6 % of seeds (found by the polish
    // gate); sweep-verified across a wide seed range here.
    for (let s = seed; s < seed + 40; s++) {
      const layout = buildLayout('timbuktu', s)
      expect(layout.dwellings.some((d) => d.kind === 'mosque'), `seed ${s}`).toBe(true)
    }
  })

  it('ports outscale villages in fabric (Cairo vs Boma)', () => {
    const cairo = buildLayout('cairo', seed)
    const boma = buildLayout('boma', seed)
    expect(cairo.radius).toBeGreaterThan(boma.radius)
    expect(cairo.dwellings.length).toBeGreaterThan(boma.dwellings.length)
  })
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
    for (const s of SEEDS) {
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
    for (const s of SEEDS) {
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

// The communication PoC's TWO stones (work-order 482, user 04.08.2026): a small
// one INSIDE the PoC village, where the adults teach the word for a rock, and a
// far bigger erratic OUTSIDE, upstream, where the message sends the player to
// dig. The transfer between them is the puzzle, so the two must be clearly
// different in size and distance — that difference is checked here, across both
// layers, rather than trusted to two separate files staying in step.
describe('the teaching stone in the PoC village (work-order 482)', () => {
  it.each(SEEDS)('seed %i: stands in the open, inside the walkable area, on its own collider', (seed) => {
    const layout = buildLayout(ROCK_VILLAGE_ID, seed)
    const stone = layout.teachingStone
    expect(stone, 'the PoC village always has its teaching stone').not.toBeNull()
    if (!stone) return
    const d = Math.hypot(stone.x, stone.z)
    // Well inside the walkable disc and away from the very centre, so it is
    // visible from the middle of the village and reachable on foot.
    expect(d).toBeGreaterThan(6)
    expect(d).toBeLessThan(layout.radius - stone.r - 2)
    // Its collider is the drawn stone, and it is the ONLY collider there.
    const own = layout.colliders.filter(
      (c): c is { kind?: 'circle'; x: number; z: number; r: number } =>
        (c.kind === undefined || c.kind === 'circle') &&
        Math.hypot(c.x - stone.x, c.z - stone.z) < 0.01,
    )
    expect(own).toHaveLength(1)
    expect(own[0].r).toBeCloseTo(stone.r, 6)
    // Clear of every other solid body — a player must be able to walk up to it.
    for (const body of solidBodies(layout, false)) {
      expect(Math.hypot(body.x - stone.x, body.z - stone.z)).toBeGreaterThan(body.r + stone.r)
    }
    // A villager errand stands at it (the adults' pointing situations).
    expect(layout.errands.some((e) => Math.hypot(e[0] - stone.x, e[1] - stone.z) < stone.r + 3)).toBe(true)
  })

  it('stands in the PoC village only — no other settlement grows one', () => {
    for (const p of PLACES) {
      if (p.id === ROCK_VILLAGE_ID) continue
      expect(buildLayout(p.id, 42).teachingStone, p.id).toBeNull()
    }
  })

  it('is markedly larger than the loose rock dressing around it', () => {
    const layout = buildLayout(ROCK_VILLAGE_ID, 42)
    const stone = layout.teachingStone
    expect(stone).not.toBeNull()
    if (!stone) return
    // The scatter rocks run scale 0.3-1.0; the teaching stone is well above them
    // so it reads as THE stone rather than one more pebble.
    for (const [, , s] of layout.rocks) expect(stone.scale).toBeGreaterThan(s * 2)
  })

  it('is the SMALL near stone: the erratic upstream is bigger and a journey away', () => {
    const layout = buildLayout(ROCK_VILLAGE_ID, 42)
    const stone = layout.teachingStone
    expect(stone).not.toBeNull()
    if (!stone) return
    const village = placeById(ROCK_VILLAGE_ID)
    const rock = communicationRockSite(42)
    // Size: the erratic is a block of the WORLD scale (1 unit ~ 11 km of map),
    // the teaching stone a boulder of the settlement scale (metres) — different
    // classes of object, compared through the constants both scenes draw from.
    expect(ROCK_HEIGHT_UNITS * 1000).toBeGreaterThan(stone.scale)
    // Distance: the teaching stone is a few steps away, the erratic a journey.
    expect(Math.hypot(stone.x, stone.z)).toBeLessThan(layout.radius)
    expect(Math.hypot(rock.lat - village.lat, rock.lon - village.lon)).toBeGreaterThan(1)
  })
})
