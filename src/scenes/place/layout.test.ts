import { digFurnitureFootprints } from './digSiteAppearance'
import { digLocalToWorld, digStandingPlaces, placeGroundHeight, spoilCentre, SPOIL_RADIUS_X } from './placeGround'
// Pure layout invariants (design.md §2.6/§4.5, point 15): ports grow an
// organic lane fabric whose buildings front the lanes with their door side,
// villages follow their people's period-accurate organising principle, and
// everywhere doors stay reachable, windows keep a clear line outward and no
// building stands on a lane.

import { beforeAll, describe, expect, it } from 'vitest'
import {
  CENTRAL_GROUND_RADIUS,
  COMPOUND_RING_MIN,
  DIG_SITE_ANCHOR_REACH,
  DIG_SITE_FIELD_BAND,
  PLAY_ROCK_SPAN,
  PLACE_RADIUS,
  VILLAGE_FIRE,
  WATER_PATH_HEAD_RADII,
  WATER_PATH_WIDTH,
  WATER_STAND_RADIUS,
  WAY_OUT_HALF_WIDTH,
  WAY_OUT_INNER,
  WAY_OUT_OUTER,
  buildLayout,
  dwellingCircleRadius,
  fenceColliders,
  fencePanels,
  type PlaceLayout,
  type Interactive,
  type DwellingDef,
} from './layout'
import { boxCollider, spawnPointFree, standingClear, PLAYER_RADIUS, WALKER_RADIUS, type CircleCollider, type Collider } from './collision'
import { ANIMAL_RADIUS, animalAnchors } from './animalSpots'
import { closestOnPolyline } from './lanePlan'
import { PLACES, placeById } from '../../world/geo'
import { ROCK_VILLAGE_ID, ROCK_FOOTPRINT_UNITS, communicationRockSite } from '../../world/communicationRock'
import { bankGroundHeight, buildRiverBank, inBankPlayLane } from './riverBank'
import { CLIMB_ROCK_TOP, climbBoulder, looseRock, looseRockIsGround, looseRockRadius, looseRockTop } from './looseRocks'
import { pinchesPassage } from './wedgeCarve'
import { mulberry32 } from '../../world/noise'
import { balance } from '../../config/balance'
import { setupGeodata } from '../../test/geodata'
import { REGION_PLACE_STYLES, VILLAGE_PLANS } from './regionStyles'
import { LOOM_SPOT, VILLAGE_SPOTS } from './lifeSpots'

// The landmark boulder is placed against the REAL terrain (it refuses every wet
// spot — work-order 585), so this file needs the elevation dataset the browser
// has; without it the whole map reads as ocean and no bank exists to place it on.
beforeAll(async () => {
  await setupGeodata()
})

const SEEDS = [7, 42, 1337]
/** The world of the F6 reports behind work-order 583/584. */
const REPORTED_SEED = 1425108822
/** The world of the "Ich hänge fest" report behind work-order 604. */
const WEDGE_SEED = 1941555626
const PORTS = PLACES.filter((p) => p.kind === 'port')
const VILLAGES = PLACES.filter((p) => p.kind === 'village')

/** Circle-approximated body radius of a solid building. */
const bodyR = (d: DwellingDef) => d.r
const interactiveR = (it: Interactive, port: boolean) =>
  port ? 3.2 : it.type === 'market' ? 2.9 : 3.35

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
    const functional = layout.interactives
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

// THE VILLAGE'S SINGLE TEACHING STONE IS GONE (work-order 688). It stood in the
// open of the PoC village, and a boulder on the village square that everybody
// walked to for no reason is exactly what the user read as meaningless on
// 13.08.2026. The word ROCK is learnt at the two PLAY ROCKS on the bank now
// (work-order 687, pinned in `bankStage.test.ts`), which are large detailed
// variants of the ordinary rock rather than another loose piece of dressing.
describe('no settlement carries a lone teaching stone any more (work-order 688)', () => {
  it('gives every village its two bank rocks instead, and no third stone', () => {
    for (const p of PLACES) {
      const layout = buildLayout(p.id, 42)
      expect('teachingStone' in layout, `${p.id}: the field itself is gone`).toBe(false)
      expect(!!layout.playRocks, `${p.id}: rocks exactly where there is a bank`).toBe(!!layout.bank)
    }
  })

  it('keeps the play rocks markedly larger than the loose rock dressing', () => {
    for (const id of ['nubian-village', 'bambara-village', 'mandinka-village']) {
      const layout = buildLayout(id, 42)
      const rocks = layout.playRocks
      expect(rocks, id).not.toBeNull()
      if (!rocks) continue
      // The scatter runs scale 0.3-1.0 on a 0.5-radius blob, i.e. up to 0.5 m of
      // footprint; a play rock's DRAWN span is PLAY_ROCK_SPAN. It reads as A
      // ROCK rather than as one more pebble — which is a question about what is
      // drawn, not about the collider behind it.
      for (const [, , s] of layout.rocks) {
        expect(ROCK_FOOTPRINT_UNITS * rocks.scale).toBeGreaterThan(s * 0.5 * 2)
      }
    }
  })

  it('keeps the play rocks settlement-sized and the erratic a journey away', () => {
    const layout = buildLayout(ROCK_VILLAGE_ID, 42)
    const rocks = layout.playRocks
    expect(rocks).not.toBeNull()
    if (!rocks) return
    const village = placeById(ROCK_VILLAGE_ID)
    const rock = communicationRockSite(42)
    // SETTLEMENT SCALE, NOT WORLD SCALE. The drawn footprint follows from the
    // instance scale and remains exactly PLAY_ROCK_SPAN. The collider is a
    // SMALLER, separately measured number (see PLAY_ROCK_RADIUS): the span is
    // the stone's widest ring, and it is nowhere near the ground.
    expect(ROCK_FOOTPRINT_UNITS * rocks.scale).toBeCloseTo(PLAY_ROCK_SPAN, 6)
    expect(rocks.r).toBeLessThan(ROCK_FOOTPRINT_UNITS * rocks.scale)
    // Distance: the play rocks are a walk down the bank, the erratic a journey.
    expect(Math.hypot(rocks.upstream.x, rocks.upstream.z)).toBeLessThan(layout.radius + 12)
    expect(Math.hypot(rock.lat - village.lat, rock.lon - village.lon)).toBeGreaterThan(1)
  })
})

// THE WATER PATH (work-order 688). The adults teach RIVER by fetching water, so
// there has to be a path to fetch it along: a head in the village where both
// carriers speak, a foot at the river where neither does, and a walk between the
// two that crosses neither a building nor the children's running lane.
describe('the village water path (work-order 688)', () => {
  const random = mulberry32(1045)
  const waterSeeds = [...new Set([
    ...SEEDS, REPORTED_SEED, WEDGE_SEED, 1239784450, 2987912600,
    ...Array.from({ length: 120 }, () => Math.floor(random() * 0x100000000)),
  ])]
  let riverVillages: string[] = []
  beforeAll(() => {
    riverVillages = VILLAGES.filter((p) => buildRiverBank(p, PLACE_RADIUS)).map((p) => p.id)
    expect(riverVillages).toContain('bambara-village')
  })

  it('exists exactly where there is a bank', () => {
    for (const p of PLACES) {
      const layout = buildLayout(p.id, 42)
      expect(!!layout.waterPath, p.id).toBe(!!layout.bank)
    }
  })

  it.each(waterSeeds)('seed %i: every river village has a drawn, unobstructed water path and stand', (seed) => {
    for (const id of riverVillages) {
      const layout = buildLayout(id, seed)
      const label = `${id}@${seed}`
      expect(layout.waterPath, label).not.toBeNull()
      expect(layout.waterStand, label).not.toBeNull()
      const path = layout.waterPath!
      const lane = layout.paths.find((p) => p.width === WATER_PATH_WIDTH
        && p.points[0][0] === path.head.x && p.points[0][1] === path.head.z)
      expect(lane, label).toBeDefined()
      expect(lane!.points.at(-1), label).toEqual([path.foot.x, path.foot.z])
      for (let i = 1; i < lane!.points.length; i++) {
        const [ax, az] = lane!.points[i - 1]
        const [bx, bz] = lane!.points[i]
        const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.025)
        for (let k = 0; k <= steps; k++) {
          const x = ax + (bx - ax) * k / steps
          const z = az + (bz - az) * k / steps
          if (!standingClear(layout.colliders, x, z, lane!.width / 2)) {
            expect.fail(`${label}: drawn water lane hits a collider at ${x}, ${z}`)
          }
          if (inBankPlayLane(layout.playRocks, x, z, WALKER_RADIUS + lane!.width / 2)) {
            expect.fail(`${label}: water lane crosses the children's run at ${x}, ${z}`)
          }
        }
      }
    }
  })

  // Seeds whose water lane actually has to cross a compound wall, so the gate
  // branch is exercised rather than merely present. Re-picked by point 1173:
  // the settlement grew, the carriers' lane more often finds a way round the
  // compounds, and the four seeds that used to need a gate stopped needing one —
  // which made every case below pass while testing nothing. These two are what
  // a sweep of the first 2000 seeds still routes through a wall.
  const gatedSeeds = [330, 762]

  it.each(gatedSeeds)('seed %i: gate rebuilding preserves village props and exactly two settled rock colliders', (seed) => {
    const layout = buildLayout('bambara-village', seed)
    const props = [
      { x: VILLAGE_FIRE[0], z: VILLAGE_FIRE[1], r: 1.3 },
      { x: LOOM_SPOT[0], z: LOOM_SPOT[1], r: 1.0 }, // loom
      { x: VILLAGE_SPOTS.talkers[0], z: VILLAGE_SPOTS.talkers[1], r: 0.85 },
      { x: VILLAGE_SPOTS.pounder[0], z: VILLAGE_SPOTS.pounder[1], r: 0.55 },
      { x: VILLAGE_SPOTS.drummer[0], z: VILLAGE_SPOTS.drummer[1], r: 0.8 },
      // No well here: this village draws its water from the river (point 1092).
    ]
    for (const prop of props) expect(layout.colliders).toContainEqual(prop)
    expect(layout.waterStand).not.toBeNull()
    expect(layout.colliders).toContainEqual({ ...layout.waterStand!, r: WATER_STAND_RADIUS })

    expect(layout.playRocks).not.toBeNull()
    const rocks = layout.playRocks!
    const rockColliders = layout.colliders.filter((c) =>
      (c.kind === undefined || c.kind === 'circle') && c.r === rocks.r,
    )
    expect(rockColliders).toHaveLength(2)
    for (const rock of [rocks.upstream, rocks.downstream]) {
      expect(rockColliders).toContainEqual({ x: rock.x, z: rock.z, r: rocks.r })
    }
  })

  it.each(gatedSeeds)('seed %i: the compound crossing is a drawn gate with matching collision', (seed) => {
    const layout = buildLayout('bambara-village', seed)
    const { head, foot } = layout.waterPath!
    const line: Array<[number, number]> = [[head.x, head.z], [foot.x, foot.z]]
    let crossedGates = 0
    for (const fence of layout.fences) {
      const run = fenceColliders(fence)
      expect(layout.colliders).toEqual(expect.arrayContaining(run))
      for (let i = 0; i < run.length; i++) {
        if (run[i].kind === 'segment') continue
        const a = fence.posts[i]
        const b = fence.posts[(i + 1) % fence.posts.length]
        // A gap crossed by the lane must have no bridging wall collider.
        for (let k = 0; k <= 100; k++) {
          const x = a[0] + (b[0] - a[0]) * k / 100
          const z = a[1] + (b[1] - a[1]) * k / 100
          if (closestOnPolyline(line, x, z).dist < WATER_PATH_WIDTH / 2) {
            crossedGates++
            break
          }
        }
      }
    }
    expect(crossedGates, 'the lane actually passes through a compound opening').toBeGreaterThan(0)
    // Woven panels use these exact half-extents in PlaceScene's Fences mesh.
    // A gate-end panel turns toward the next surviving post; test its corners
    // too, so rotating that last short panel cannot hide a drawn obstruction.
    const drawn = fencePanels(layout.fences).filter((p) => p.kind === 'woven')
      .map((p) => boxCollider(p.x, p.z, 0.41, 0.035, p.rot, 0))
    const steps = Math.ceil(Math.hypot(foot.x - head.x, foot.z - head.z) / 0.025)
    for (let k = 0; k <= steps; k++) {
      const x = head.x + (foot.x - head.x) * k / steps
      const z = head.z + (foot.z - head.z) * k / steps
      expect(standingClear(drawn, x, z, WATER_PATH_WIDTH / 2)).toBe(true)
    }
  })

  it.each(SEEDS)('seed %i: runs from the village out to the water', (seed) => {
    for (const id of riverVillages) {
      const layout = buildLayout(id, seed)
      const path = layout.waterPath
      const bank = layout.bank
      expect(path, id).not.toBeNull()
      if (!path || !bank) continue
      // The head stands in the village, at the sweep's own radius, on free
      // ground a villager can speak from.
      const headR = Math.hypot(path.head.x, path.head.z)
      expect(WATER_PATH_HEAD_RADII.map((r) => Math.abs(headR - r) < 1e-6), `${id}: head radius ${headR}`).toContain(true)
      expect(standingClear(layout.colliders, path.head.x, path.head.z, WALKER_RADIUS), `${id}: head is free`).toBe(true)
      // The foot stands AT the water, on the flat plate rather than on the shore.
      const out = path.foot.x * bank.nx + path.foot.z * bank.nz
      expect(out, `${id}: foot is on the plate`).toBeLessThanOrEqual(bank.walkEdge)
      expect(out, `${id}: foot is at the water, not in the village`).toBeGreaterThan(layout.radius * 0.8)
      expect(standingClear(layout.colliders, path.foot.x, path.foot.z, WALKER_RADIUS), `${id}: foot is free`).toBe(true)
      // And the head is nearer the middle than the foot is, so the walk really
      // leads OUT of the settlement.
      expect(Math.hypot(path.head.x, path.head.z)).toBeLessThan(Math.hypot(path.foot.x, path.foot.z))
    }
  })

  it.each(SEEDS)('seed %i: meets the bank OUTSIDE the children`s stretch', (seed) => {
    for (const id of riverVillages) {
      const layout = buildLayout(id, seed)
      const path = layout.waterPath
      const rocks = layout.playRocks
      expect(path, id).not.toBeNull()
      expect(rocks, id).not.toBeNull()
      if (!path || !rocks) continue
      // Not in the running lane at its foot, and not anywhere along its length —
      // a carrier crossing the lane would be read as part of the game.
      for (let t = 0; t <= 40; t++) {
        const x = path.head.x + (path.foot.x - path.head.x) * (t / 40)
        const z = path.head.z + (path.foot.z - path.head.z) * (t / 40)
        expect(
          inBankPlayLane(rocks, x, z, WALKER_RADIUS + WATER_PATH_WIDTH / 2),
          `${id}: the walk crosses the children's lane at t=${t}`,
        ).toBe(false)
      }
      // And the foot lies BEYOND one of the rocks rather than between the two:
      // its distance along the bank from the descent exceeds the stretch's own.
      const bank = layout.bank!
      const along = (p: { x: number; z: number }) => p.x * bank.fx + p.z * bank.fz
      const stretch = Math.max(Math.abs(along(rocks.upstream)), Math.abs(along(rocks.downstream)))
      expect(Math.abs(along(path.foot)), `${id}: foot beyond the stretch`).toBeGreaterThan(stretch)
    }
  })

  it.each(SEEDS)('seed %i: is a drawn lane nothing is built on', (seed) => {
    for (const id of riverVillages) {
      const layout = buildLayout(id, seed)
      const path = layout.waterPath
      expect(path, id).not.toBeNull()
      if (!path) continue
      const lane = layout.paths.find(
        (p) =>
          p.width === WATER_PATH_WIDTH &&
          Math.hypot(p.points[0][0] - path.head.x, p.points[0][1] - path.head.z) < 1e-6,
      )
      expect(lane, `${id}: the water path is in the drawn lane net`).toBeTruthy()
    }
  })
})

// The village's ground work (work-order point 483): the patches the adults teach
// DIG at. A villager is SENT to one and digs there, so a patch that sits under a
// hut or on a lane teaches nothing — the placement is checked like every other
// errand target.
describe('the ground work villagers dig at (work-order 483)', () => {
  it.each([['bambara-village', 29], ['mandinka-village', 48]] as const)(
    'keeps both purposes in a narrow anchored space: %s seed %i', (id, seed) => {
    const layout = buildLayout(id, seed)
    expect(layout.digSites).toHaveLength(2)
    expect(layout.digSites.some((site) => site.kind === 'patch')).toBe(true)
    for (const site of layout.digSites) {
      expect(site.x * layout.bank!.nx + site.z * layout.bank!.nz).toBeLessThan(0)
      const heap = spoilCentre(site)
      expect(standingClear(layout.colliders, heap.x, heap.z, SPOIL_RADIUS_X)).toBe(true)
      expect(digStandingPlaces(site, (x, z) => standingClear(layout.colliders, x, z, WALKER_RADIUS))).not.toBeNull()
    }
  })

  it.each(SEEDS)('seed %i: every village has two distinct inland purposes, each on its own spot', (seed) => {
    for (const v of VILLAGES) {
      const layout = buildLayout(v.id, seed)
      expect(layout.digSites, v.id).toHaveLength(2)
      expect(layout.digSites.filter((s) => s.kind === 'patch'), v.id).toHaveLength(1)
      expect(layout.digSites.some((s) => s.kind === 'pit' || s.kind === 'postHole'), v.id).toBe(true)
      if (layout.bank) for (const site of layout.digSites) {
        expect(site.x * layout.bank.nx + site.z * layout.bank.nz, v.id).toBeLessThan(0)
      }
      for (let i = 0; i < layout.digSites.length; i++) {
        for (let j = i + 1; j < layout.digSites.length; j++) {
          const a = layout.digSites[i]
          const b = layout.digSites[j]
          expect(Math.hypot(a.x - b.x, a.z - b.z), `${v.id} ${a.kind}/${b.kind}`).toBeGreaterThan(2)
        }
      }
    }
  })

  it.each(SEEDS)('seed %i: a villager can stand in the ground work, and leave it again', (seed) => {
    for (const v of VILLAGES) {
      const layout = buildLayout(v.id, seed)
      for (const site of layout.digSites) {
        const where = `${v.id} ${site.kind}`
        // Inside the walkable disc, away from the arrival corridor's edge.
        expect(Math.hypot(site.x, site.z), where).toBeLessThan(layout.radius - 1)
        // Free ground against the FULL collider set (point 155), and reachable:
        // the dig site is a target a walker heads for like any errand point.
        expect(standingClear(layout.colliders, site.x, site.z, WALKER_RADIUS), where).toBe(true)
        expect(digStandingPlaces(site, (x, z) => standingClear(layout.colliders, x, z, WALKER_RADIUS)), where).not.toBeNull()
        const heap = spoilCentre(site)
        expect(standingClear(layout.colliders, heap.x, heap.z, SPOIL_RADIUS_X), where).toBe(true)
        for (const prop of digFurnitureFootprints(site.kind)) {
          const p = digLocalToWorld(site, prop.x, prop.z)
          expect(Math.hypot(p.x, p.z) + prop.radius, where).toBeLessThan(layout.radius)
          expect(standingClear(layout.colliders, p.x, p.z, prop.radius), where).toBe(true)
        }
        // No lane runs through it: the ground work never blocks the path net.
        for (const path of layout.paths) {
          expect(closestOnPolyline(path.points, site.x, site.z).dist, where).toBeGreaterThan(
            path.width / 2,
          )
        }
      }
    }
  })

  it('leaves the ground passable: turned earth is walked over, not collided with', () => {
    const layout = buildLayout(ROCK_VILLAGE_ID, 42)
    for (const site of layout.digSites) {
      const own = layout.colliders.filter(
        (c) => 'r' in c && Math.hypot((c as { x: number }).x - site.x, (c as { z: number }).z - site.z) < 0.5,
      )
      expect(own, site.kind).toHaveLength(0)
    }
  })

  it.each(SEEDS)('seed %i: leaves the open central ground alone', (seed) => {
    for (const v of VILLAGES) {
      const layout = buildLayout(v.id, seed)
      for (const site of layout.digSites) {
        // Nobody digs on the village square: the picture of men digging in the
        // middle beside a pointless boulder is what work-order 688 removed.
        expect(Math.hypot(site.x, site.z), `${v.id} ${site.kind}`).toBeGreaterThanOrEqual(
          CENTRAL_GROUND_RADIUS,
        )
      }
    }
  })

  it.each(SEEDS)('seed %i: keeps every work site out of the children`s earshot', (seed) => {
    for (const v of VILLAGES) {
      const layout = buildLayout(v.id, seed)
      const earshot = balance.communication.hearingRadius
      for (const site of layout.digSites) {
        const where = `${v.id} ${site.kind}`
        if (layout.playGround) {
          const toRim =
            Math.hypot(site.x - layout.playGround.x, site.z - layout.playGround.z) - layout.playGround.radius
          expect(toRim, `${where}: inside the roaming quarter's earshot`).toBeGreaterThanOrEqual(earshot)
        }
        for (const rock of layout.playRocks ? [layout.playRocks.upstream, layout.playRocks.downstream] : []) {
          expect(
            Math.hypot(site.x - rock.x, site.z - rock.z),
            `${where}: inside the bank stage's earshot`,
          ).toBeGreaterThanOrEqual(earshot)
        }
      }
    }
  })

  it('puts each site where its own work belongs', () => {
    // The anchor is a first-pass rule with a documented fallback (a ksar cannot
    // always give one), so this pins that the rule is doing real work rather
    // than that it never yields.
    let anchored = 0
    let total = 0
    for (const seed of SEEDS) {
      for (const v of VILLAGES) {
        const layout = buildLayout(v.id, seed)
        for (const site of layout.digSites) {
          total++
          const toCompound = layout.dwellings.reduce(
            (best, d) => Math.min(best, Math.hypot(site.x - d.x, site.z - d.z) - d.r),
            Infinity,
          )
          const toLane = layout.paths.reduce(
            (best, p) => Math.min(best, closestOnPolyline(p.points, site.x, site.z).dist - p.width / 2),
            Infinity,
          )
          const ok =
            site.kind === 'pit'
              ? toCompound <= DIG_SITE_ANCHOR_REACH
              : site.kind === 'postHole'
                ? toLane <= DIG_SITE_ANCHOR_REACH
                : Math.hypot(site.x, site.z) >= layout.radius * DIG_SITE_FIELD_BAND
          if (ok) anchored++
        }
      }
    }
    expect(total).toBeGreaterThan(100)
    expect(anchored).toBe(total)
  })

  it('gives ports none: the teaching is a village matter', () => {
    for (const p of PORTS) expect(buildLayout(p.id, 42).digSites, p.id).toEqual([])
  })

  it('places them deterministically, like everything else in the layout', () => {
    expect(buildLayout(ROCK_VILLAGE_ID, 42).digSites).toEqual(buildLayout(ROCK_VILLAGE_ID, 42).digSites)
    expect(buildLayout(ROCK_VILLAGE_ID, 42).digSites).not.toEqual(buildLayout(ROCK_VILLAGE_ID, 7).digSites)
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

// A STONE IS EITHER GROUND OR AN OBSTACLE (work-order 1149). The user walked
// into knee-low pebbles: every scattered stone claimed a collider of at least
// half a metre, however small the thing the player saw. The classification is
// pinned in `looseRocks.test.ts`; what must hold HERE is that the settlement's
// own collider set obeys it — over the shipped villages and seeds, so no plan
// keeps a stone that both raises the ground and blocks it.
describe.each(SEEDS)('the loose stones in the collider set (seed %i)', (seed) => {
  it.each(VILLAGES.map((p) => [p.id] as const))('%s: carries only the stones that are walked around', (id) => {
    const layout = buildLayout(id, seed)
    const circles = layout.colliders.filter((c): c is CircleCollider => 'r' in c && 'x' in c)
    let walkedOver = 0
    for (const [x, z, scale] of layout.rocks) {
      const collider = circles.find((c) => Math.hypot(c.x - x, c.z - z) < 1e-9 && Math.abs(c.r - looseRockRadius(scale)) < 1e-9)
      if (looseRockIsGround(scale)) {
        walkedOver++
        // It left the collider set — this is the snag the point removes…
        expect(collider, `${id} seed ${seed}: stone of scale ${scale} still blocks the walk`).toBeUndefined()
        // …and the walking surface carries the foot over it instead.
        expect(placeGroundHeight({ bank: layout.bank, sites: [], progress: [], rocks: layout.rocks }, x, z))
          .toBeCloseTo(bankGroundHeight(layout.bank, x, z) + looseRockTop(scale), 9)
      } else {
        expect(collider, `${id} seed ${seed}: stone of scale ${scale} lost its collider`).toBeTruthy()
        expect(placeGroundHeight({ bank: layout.bank, sites: [], progress: [], rocks: layout.rocks }, x, z))
          .toBeCloseTo(bankGroundHeight(layout.bank, x, z), 9)
      }
    }
    // The scatter really does draw stones on both sides of the cut, so the
    // check is answering about a real settlement rather than an empty case.
    expect(walkedOver, `${id} seed ${seed}: no small stone in the scatter at all`).toBeGreaterThan(0)
  })
})

// THE STONE A CHILD CLIMBS IS PLACED BY THE LAYOUT (work-order 1082). Point 1080
// searched the scatter for it — the nearest instance above a height floor — and
// the user reported the climb missing a second time: at the low end of the
// scatter's size range the "climb" is a step onto a pebble, and raising the floor
// alone sent the climber metres off. So the stone is DERIVED, the way the two
// play rocks are, and what must hold is that every village gets one, that it
// stands where the round can reach it, and that it narrows nothing.
describe.each(SEEDS)('the derived climbing stone (seed %i)', (seed) => {
  it.each(VILLAGES.map((p) => [p.id] as const))('%s: carries one beside the children`s quarter', (id) => {
    const layout = buildLayout(id, seed)
    const quarter = layout.playGround
    expect(quarter, `${id}: a village carries a children's quarter`).toBeTruthy()
    const derived = layout.climbRock
    expect(derived, `${id} seed ${seed}: a derived climbing stone`).not.toBeNull()
    const stone = looseRock(derived!)
    // The round is handed THAT stone rather than searching for one.
    const chosen = climbBoulder(layout.rocks, quarter!, balance.villageLife.bankGame.climbableRockTop, derived)
    expect(chosen).toEqual(stone)
    // It is an ORDINARY entry of the scatter: drawn with the rest, and its
    // collider is the one the climb's approach stops outside of.
    expect(layout.rocks).toContain(derived)
    // A SEGMENT carries `r` too, but no centre — circle is `r` WITH a centre.
    const circles = layout.colliders.filter((c): c is CircleCollider => 'r' in c && 'x' in c)
    const collider = circles.find((c) => Math.hypot(c.x - stone.x, c.z - stone.z) < 1e-9)
    expect(collider?.r).toBeCloseTo(stone.radius, 9)
    // High enough to be a climb rather than a step, every time.
    expect(stone.height).toBeCloseTo(CLIMB_ROCK_TOP, 9)
    expect(stone.height).toBeGreaterThan(balance.villageLife.bankGame.climbableRockTop)
    // OUTSIDE the quarter — the group roams on open ground, not between
    // boulders — and still within a short walk of its rim.
    const away = Math.hypot(stone.x - quarter!.x, stone.z - quarter!.z)
    expect(away).toBeGreaterThanOrEqual(quarter!.radius + stone.radius + WALKER_RADIUS)
    expect(away - quarter!.radius - stone.radius - WALKER_RADIUS).toBeLessThanOrEqual(6)
    // Clear of the children's running lane and of the walk down to the water,
    // the two routes the round itself uses.
    expect(inBankPlayLane(layout.playRocks, stone.x, stone.z, stone.radius)).toBe(false)
    if (layout.bank) {
      const route = closestOnPolyline(
        [[quarter!.x, quarter!.z], [layout.bank.bank.x, layout.bank.bank.z]],
        stone.x,
        stone.z,
      ).dist
      expect(route).toBeGreaterThan(stone.radius)
    }
    // And on a lane nobody walks it off: the settlement's own paths stay clear.
    for (const path of layout.paths) {
      const d = closestOnPolyline(path.points, stone.x, stone.z).dist
      expect(d, `${id} seed ${seed}: stone on a lane`).toBeGreaterThan(path.width / 2)
    }
    // IT NARROWS NOTHING: no boundary already standing is near enough to make
    // the stone half of a pinch pair, which is what would carve a slot out of
    // the children's own ground and squeeze the group along it.
    const others = layout.colliders.filter((c) => c !== collider)
    expect(pinchesPassage(others, stone.x, stone.z, stone.radius, WALKER_RADIUS)).toBe(false)
  })
})
