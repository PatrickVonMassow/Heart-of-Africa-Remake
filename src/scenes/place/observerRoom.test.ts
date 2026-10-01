// THE ROOM TO WATCH A SCENE FROM (work-order 1252).
//
// Every scene ground a village plays — the children's quarter, the bank stage,
// the dig sites, the water errand, the loom and the chief's hut — must keep
// `balance.observerMargin` of walkable ground before the boundary, so stepping
// aside to watch never leaves the village. The extents are measured here from
// the layout's own fields, NOT from `layout.observed`, so a scene the layout
// forgets to hand the boundary fails. Toward the river the wade limit stays the
// edge on purpose: boundary points ON the wade line are the water, not land.

import { beforeAll, describe, expect, it } from 'vitest'
import { sharedLayout } from './layoutHarness'
import { BOUNDARY_LUT_SIZE, buildBoundaryLut, placeBoundaryRadius, type PlaceBounds } from './boundary'
import { digLocalToWorld, DIG_RIM_DISTANCE, spoilCentre, SPOIL_RADIUS_X } from './placeGround'
import { digFurnitureFootprints } from './digSiteAppearance'
import { stationGround } from './loom'
import { WALKER_RADIUS } from './collision'
import { BANK_PLAY_LANE_HALF } from './riverBank'
import type { PlaceLayout } from './layout'
import { setupGeodata } from '../../test/geodata'
import { PLACES } from '../../world/geo'
import { balance } from '../../config/balance'

beforeAll(setupGeodata)

const VILLAGES = PLACES.filter((p) => p.kind === 'village').map((p) => p.id)
const SEEDS = [7, 42, 1337]
/** The user's village, at the seeds its reports and harnesses name. */
const BAMBARA_SEEDS = [1, 9, 99, 236333330, 1239784450, 2972259115]
const SAMPLES = 2048

interface Part { what: string; x: number; z: number; r: number }

/** Every scene ground's extent, from the layout's own fields. */
function sceneParts(l: PlaceLayout): Part[] {
  const parts: Part[] = []
  if (l.playGround) parts.push({ what: 'quarter', x: l.playGround.x, z: l.playGround.z, r: l.playGround.radius })
  if (l.playRocks) {
    const { upstream: u, downstream: d, r } = l.playRocks
    parts.push({ what: 'bank rock', ...u, r }, { what: 'bank rock', ...d, r })
    for (let k = 0; k <= 16; k++) {
      const t = k / 16
      parts.push({ what: 'bank lane', x: u.x + (d.x - u.x) * t, z: u.z + (d.z - u.z) * t, r: BANK_PLAY_LANE_HALF })
    }
  }
  for (const site of l.digSites) {
    const heap = spoilCentre(site)
    parts.push({ what: 'dig spoil', x: heap.x, z: heap.z, r: SPOIL_RADIUS_X })
    parts.push({ what: 'dig stand', x: site.x, z: site.z, r: DIG_RIM_DISTANCE + WALKER_RADIUS })
    for (const f of digFurnitureFootprints(site.kind)) {
      parts.push({ what: 'dig furniture', ...digLocalToWorld(site, f.x, f.z), r: f.radius })
    }
  }
  if (l.waterStand) parts.push({ what: 'water stand', ...l.waterStand, r: 0.6 })
  if (l.waterPath) {
    parts.push({ what: 'water head', ...l.waterPath.head, r: 0 })
    parts.push({ what: 'water foot', ...l.waterPath.foot, r: 0 })
    parts.push({ what: 'water fill', ...l.waterPath.fill, r: 0 })
  }
  if (l.loom) {
    for (const g of stationGround(l.loom, balance.villageLife.loom)) parts.push({ what: `loom ${g.kind}`, x: g.x, z: g.z, r: g.r })
  }
  for (const it of l.interactives) {
    if (it.type !== 'chief') continue
    parts.push({ what: 'chief hut', x: it.pos[0], z: it.pos[1], r: 3.35 })
    if (it.door) parts.push({ what: 'chief door', x: it.door[0], z: it.door[1], r: WALKER_RADIUS })
  }
  return parts
}

/** The boundary as LAND segments: points on the wade line are the river. */
function landSegments(bounds: PlaceBounds): Array<[number, number, number, number]> {
  const bank = bounds.bank
  const pts: Array<[number, number, boolean]> = []
  for (let j = 0; j < SAMPLES; j++) {
    const a = (j / SAMPLES) * Math.PI * 2
    const r = placeBoundaryRadius(bounds, a)
    const x = Math.cos(a) * r
    const z = Math.sin(a) * r
    const water = !!bank && x * bank.nx + z * bank.nz >= bank.wadeEdge - 1e-6
    pts.push([x, z, !water])
  }
  const segs: Array<[number, number, number, number]> = []
  for (let j = 0; j < SAMPLES; j++) {
    const p = pts[j]
    const q = pts[(j + 1) % SAMPLES]
    if (p[2] && q[2]) segs.push([p[0], p[1], q[0], q[1]])
  }
  return segs
}

function toSegment(x: number, z: number, [ax, az, bx, bz]: [number, number, number, number]): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / len2)) : 0
  return Math.hypot(x - (ax + dx * t), z - (az + dz * t))
}

/** The scene part nearest the land boundary, and its walkable room. */
function tightest(bounds: PlaceBounds, parts: Part[]): { part: Part; room: number } {
  const segs = landSegments(bounds)
  let best = { part: parts[0], room: Infinity }
  for (const part of parts) {
    let d = Infinity
    for (const s of segs) d = Math.min(d, toSegment(part.x, part.z, s))
    if (d - part.r < best.room) best = { part, room: d - part.r }
  }
  return best
}

const margin = balance.observerMargin

describe('every watched scene keeps an observer margin before the boundary', () => {
  it('is one calibratable value, wider than a couple of strides', () => {
    expect(margin).toBeGreaterThanOrEqual(5)
  })

  it.each(SEEDS)('seed %i: every village', (seed) => {
    for (const id of VILLAGES) {
      const l = sharedLayout(id, seed)
      const { part, room } = tightest(l, sceneParts(l))
      expect(room, `${id}@${seed}: ${part.what} at (${part.x.toFixed(1)}, ${part.z.toFixed(1)})`).toBeGreaterThanOrEqual(margin - 0.02)
    }
  })

  it.each(BAMBARA_SEEDS)('seed %i: the Bambara village, river lobe included', (seed) => {
    const l = sharedLayout('bambara-village', seed)
    expect(l.bank, 'the Bambara village stands on its river').not.toBeNull()
    const { part, room } = tightest(l, sceneParts(l))
    expect(room, `${part.what} at (${part.x.toFixed(1)}, ${part.z.toFixed(1)})`).toBeGreaterThanOrEqual(margin - 0.02)
  })

  it('was short without the scene room — the reported shortfall', () => {
    const l = sharedLayout('bambara-village', 42)
    const plain = { radius: l.radius, bank: l.bank }
    expect(tightest(plain, sceneParts(l)).room).toBeLessThan(margin / 2)
  })

  it('leaves ports and monuments on their plain boundary', () => {
    for (const p of PLACES.filter((q) => q.kind !== 'village')) expect(sharedLayout(p.id, 42).observed).toEqual([])
  })
})

/** The band's lookup as the GPU filters it: texel centres at (j + ½) / size,
 *  linear between them, wrapping round the turn. */
function lutAt(lut: Float32Array, angle: number): number {
  const n = lut.length
  const u = (((angle / (Math.PI * 2)) % 1) + 1) % 1
  const f = u * n - 0.5
  const j = Math.floor(f)
  const t = f - j
  return lut[((j % n) + n) % n] * (1 - t) + lut[(((j + 1) % n) + n) % n] * t
}

/** Largest gap between the painted edge (the lookup) and the leave check. */
function bandMismatch(bounds: PlaceBounds): { gap: number; at: number } {
  const lut = buildBoundaryLut(bounds)
  let worst = { gap: 0, at: 0 }
  for (let k = 0; k < BOUNDARY_LUT_SIZE * 8; k++) {
    const a = (k / (BOUNDARY_LUT_SIZE * 8)) * Math.PI * 2
    const gap = Math.abs(lutAt(lut, a) - placeBoundaryRadius(bounds, a))
    if (gap > worst.gap) worst = { gap, at: a }
  }
  return worst
}

describe('the painted edge and the leave check agree round a scene\'s room', () => {
  it('at a lone scene whose room grazes the circle (the review case)', () => {
    const bounds = { radius: 32, observed: [{ x: 50, z: 0, r: 0 }] }
    // The room is there at all, and holds the scene's whole margin disc.
    expect(placeBoundaryRadius(bounds, 0)).toBeCloseTo(50 + margin, 9)
    const { gap } = bandMismatch(bounds)
    expect(gap).toBeLessThan(0.1)
  })

  it.each(SEEDS)('seed %i: in every village', (seed) => {
    for (const id of VILLAGES) {
      const l = sharedLayout(id, seed)
      const scenes = bandMismatch(l)
      const lobe = bandMismatch({ radius: l.radius, bank: l.bank })
      // Never worse than the river lobe alone already is, and never a stride.
      expect(scenes.gap, `${id} at ${scenes.at.toFixed(3)} rad`).toBeLessThanOrEqual(Math.max(0.1, lobe.gap + 1e-6))
    }
  })
})

