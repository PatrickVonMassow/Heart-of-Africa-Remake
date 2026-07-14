// Pure layout invariants (design.md §2.6/§4.5, point 15): ports grow an
// organic lane fabric whose buildings front the lanes with their door side,
// villages follow their people's period-accurate organising principle, and
// everywhere doors stay reachable, windows keep a clear line outward and no
// building stands on a lane.

import { describe, expect, it } from 'vitest'
import { buildLayout, type PlaceLayout, type Interactive, type DwellingDef } from './layout'
import { closestOnPolyline } from './lanePlan'
import { PLACES } from '../../world/geo'
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
        if (id === 'hausa-village' || id === 'mandingo-village') {
          expect(layout.fences.length, `${id}: walled compounds`).toBeGreaterThanOrEqual(3)
          expect(layout.dwellings.some((d) => d.kind === 'granary'), `${id}: granaries inside`).toBe(true)
        }
      }
    },
  )

  it('ports outscale villages in fabric (Cairo vs Boma)', () => {
    const cairo = buildLayout('cairo', seed)
    const boma = buildLayout('boma', seed)
    expect(cairo.radius).toBeGreaterThan(boma.radius)
    expect(cairo.dwellings.length).toBeGreaterThan(boma.dwellings.length)
  })
})
