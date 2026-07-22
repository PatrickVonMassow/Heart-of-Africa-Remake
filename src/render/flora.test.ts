import { describe, expect, it } from 'vitest'
import {
  buildAcacia,
  buildBush,
  buildDeadTree,
  buildGrassTuft,
  buildJungleTree,
  buildKopje,
  buildPalm,
  buildPapyrus,
  buildRock,
  buildTermiteMound,
  buildBaobab,
  splitFoliage,
} from './flora'
import type * as THREE from 'three/webgpu'
import { FLORA_COLOR_LIFT, seasonTintCpu } from './seasonTint'

// The baked foliage attribute (point 144 retry). The 16.07 critical bug: the
// dry-season collapse keyed on the per-vertex JITTERED colour, so neighbouring
// vertices of one crown moved by different amounts and the trees tore into
// screen-wide shards. The fix is this attribute — set per PART at build time,
// identical across a part by construction, so a part moves as one.
const foliageOf = (geo: THREE.BufferGeometry) => {
  const attr = geo.attributes.foliage
  expect(attr, 'every flora geometry must carry the foliage attribute').toBeDefined()
  const arr = attr.array as Float32Array
  let ones = 0
  let twos = 0
  for (const v of arr) {
    // The attribute holds whole CLASSES (0 never moves, 1 crown collapse,
    // 2 ground sprout — point 151) — any in-between value would mean a
    // vertex-level mask again, which is the exact thing that tore.
    expect(v === 0 || v === 1 || v === 2).toBe(true)
    if (v === 1) ones++
    if (v === 2) twos++
  }
  return { ones, twos, total: arr.length }
}

describe('the baked foliage attribute (point 144 — per part, binary, never colour-derived)', () => {
  it('every builder carries it, so one shared material can rely on it', () => {
    for (const build of [
      buildAcacia, buildJungleTree, () => buildPalm(false), () => buildPalm(true),
      buildBush, buildRock, buildBaobab, buildTermiteMound, buildDeadTree,
      buildPapyrus, buildKopje, buildGrassTuft,
    ]) {
      foliageOf(build())
    }
  })

  it('trees split trunk from crown: both classes present, nothing sprouts', () => {
    // buildPalm(true) is the taller "detailed" variant (point 173): it still
    // carries the same trunk/crown split as the default palm, not a third class.
    for (const build of [buildAcacia, buildJungleTree, buildBaobab, () => buildPalm(false), () => buildPalm(true)]) {
      const { ones, twos, total } = foliageOf(build())
      expect(ones).toBeGreaterThan(0) // there is foliage to collapse
      expect(ones).toBeLessThan(total) // and a trunk that never moves
      expect(twos).toBe(0) // a crown bares — it never sinks into the soil
    }
  })

  it('ground flora is all sprout class, dead wood and stone never move', () => {
    // Bush, grass and papyrus are anchored at the soil and sprout/withdraw
    // there (point 151) — every vertex carries class 2.
    for (const build of [buildBush, buildGrassTuft, buildPapyrus]) {
      const g = foliageOf(build())
      expect(g.twos).toBe(g.total)
    }
    for (const build of [buildRock, buildTermiteMound, buildDeadTree, buildKopje]) {
      const g = foliageOf(build())
      expect(g.ones + g.twos).toBe(0) // dead wood and stone never collapse
    }
  })
})

// Point 206 (Central reopen): the jungle crown hexes pass through THREE.Color's
// sRGB->linear conversion and had landed at linear luminance 0.066-0.092 —
// 2-2.7x darker than every other crown — so after the global FLORA_COLOR_LIFT
// they still read near-black in the always-lush, sun-dimmed Congo while savanna
// crowns lit fine. This gate evaluates the SHADER's own colour path purely
// (linear vertex colour -> seasonTintCpu, the lock-step mirror of
// seasonTintNode -> the shared lift) and floors the Central-jungle crown
// luminance at max greenness, while pinning the savanna acacia unchanged.
describe('crown albedo luminance floor (point 206 — Central jungle reads lit, savanna unchanged)', () => {
  // Rec.709 luminance of a linear rgb triple.
  const luminance = (c: [number, number, number]) => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

  // Mean linear crown colour as the flora material sees it (the vertex 'color'
  // attribute of the splitFoliage crown part — jitter is mean-1 by construction).
  const meanCrownColor = (geo: THREE.BufferGeometry): [number, number, number] => {
    const { base, crown } = splitFoliage(geo)
    base.dispose()
    const col = crown.attributes.color.array as Float32Array
    const mean: [number, number, number] = [0, 0, 0]
    const n = col.length / 3
    for (let i = 0; i < n; i++) {
      mean[0] += col[i * 3]
      mean[1] += col[i * 3 + 1]
      mean[2] += col[i * 3 + 2]
    }
    crown.dispose()
    return [mean[0] / n, mean[1] / n, mean[2] / n]
  }

  const lift = (c: [number, number, number]): [number, number, number] => [
    c[0] * FLORA_COLOR_LIFT,
    c[1] * FLORA_COLOR_LIFT,
    c[2] * FLORA_COLOR_LIFT,
  ]

  it('the jungle crown stays clearly above near-black at max greenness (the Congo state)', () => {
    // The Congo's season field is pinned at full lush (tint 1) year round —
    // the exact state the user saw near-black. The old hexes evaluated to
    // ~0.13 here; the floor at 0.18 fails them and passes the lifted palette
    // (~0.25) with margin on both sides.
    const jungle = meanCrownColor(buildJungleTree())
    const lit = lift(seasonTintCpu(jungle, 1))
    expect(luminance(lit)).toBeGreaterThan(0.18)
  })

  it('the jungle crown keeps a green-dominant, deep hue (lit foliage, not a lime-bright lift)', () => {
    const jungle = meanCrownColor(buildJungleTree())
    const lit = lift(seasonTintCpu(jungle, 1))
    // Green stays the dominant channel by a wide margin…
    expect(lit[1]).toBeGreaterThan(lit[0] * 2)
    expect(lit[1]).toBeGreaterThan(lit[2] * 2)
    // …and the crown stays darker than the savanna acacia at ITS ordinary
    // neutral tint — the jungle remains the deeper green of the two.
    const acacia = meanCrownColor(buildAcacia())
    const acaciaLit = lift(seasonTintCpu(acacia, 0.5))
    expect(luminance(lit)).toBeLessThan(luminance(acaciaLit))
  })

  it('the savanna acacia crown is unchanged by the Central fix (regression pin)', () => {
    // The acacia's authored pair #6e7c2f/#5f6e28 means a linear crown
    // luminance of ~0.17; at the neutral mid-year tint the seasonTint returns
    // the colour untouched, so lifted luminance sits at ~0.32. A drift out of
    // this band means the savanna look moved — which point 206 must not do.
    const acacia = meanCrownColor(buildAcacia())
    expect(luminance(seasonTintCpu(acacia, 0.5))).toBeCloseTo(luminance(acacia), 10) // neutral = untouched
    const lum = luminance(lift(acacia))
    expect(lum).toBeGreaterThan(0.28)
    expect(lum).toBeLessThan(0.37)
  })

  it('seasonTintCpu max-lush never collapses a green crown toward black (the recolour is luma-preserving-ish)', () => {
    // The lush recolour is luma-keyed (seasonTint.ts): for a green-dominant
    // crown it deepens the hue but must keep at least ~80% of the luminance —
    // the tint can never be the thing that blackens a crown.
    for (const build of [buildJungleTree, buildAcacia, () => buildPalm(false)]) {
      const c = meanCrownColor(build())
      expect(luminance(seasonTintCpu(c, 1))).toBeGreaterThan(luminance(c) * 0.8)
    }
  })
})

// The palm redesign (point 216): the old palm's trunk was a stack of four
// DISCONNECTED, laterally offset cylinder segments (visible gaps on the outside
// of the bend), its crown a ring of flat squashed cones hovering above the top
// segment. The rebuilt palm is pinned structurally: one connected trunk mesh
// spanning the full height, the crown seated exactly on the trunk top, and a
// radial fan of >= 6 feathered fronds — never two crossed billboards.
describe('palm redesign (point 216 — continuous trunk, seated crown, radial frond fan)', () => {
  const positions = (geo: THREE.BufferGeometry) => geo.attributes.position.array as Float32Array

  /**
   * Union-find over shared vertex POSITIONS of a non-indexed part: triangles
   * that touch (share a coordinate-equal vertex) join one component. Returns
   * the component containing the lowest vertex — for the palm's base part that
   * is the trunk — with its vertical span, distinct ring levels and top point.
   */
  const lowestComponent = (geo: THREE.BufferGeometry) => {
    const pos = positions(geo)
    const n = pos.length / 3
    const parent = Array.from({ length: n }, (_, i) => i)
    const find = (i: number): number => {
      while (parent[i] !== i) {
        parent[i] = parent[parent[i]]
        i = parent[i]
      }
      return i
    }
    const union = (a: number, b: number) => {
      const ra = find(a)
      const rb = find(b)
      if (ra !== rb) parent[ra] = rb
    }
    const byPos = new Map<string, number>()
    for (let i = 0; i < n; i++) {
      const k = `${Math.round(pos[i * 3] * 1e4)},${Math.round(pos[i * 3 + 1] * 1e4)},${Math.round(pos[i * 3 + 2] * 1e4)}`
      const first = byPos.get(k)
      if (first === undefined) byPos.set(k, i)
      else union(i, first)
    }
    for (let t = 0; t < n; t += 3) {
      union(t, t + 1)
      union(t, t + 2)
    }
    let lowest = 0
    for (let i = 1; i < n; i++) if (pos[i * 3 + 1] < pos[lowest * 3 + 1]) lowest = i
    const root = find(lowest)
    let minY = Infinity
    let maxY = -Infinity
    let top: [number, number, number] = [0, -Infinity, 0]
    const levels = new Set<number>()
    for (let i = 0; i < n; i++) {
      if (find(i) !== root) continue
      const y = pos[i * 3 + 1]
      minY = Math.min(minY, y)
      maxY = Math.max(maxY, y)
      levels.add(Math.round(y * 1e3))
      if (y > top[1]) top = [pos[i * 3], y, pos[i * 3 + 2]]
    }
    return { minY, maxY, levels: levels.size, top }
  }

  /**
   * Count the crown's fronds by their TIPS: a vertex is a tip candidate when
   * its horizontal radius (about the trunk-top axis) is within 5% of the
   * largest radius in its own azimuth neighbourhood (±0.15 rad) — each frond's
   * pointed tip dominates its own direction. Candidates are then clustered by
   * azimuth; the cluster count is the number of distinct radial fronds, and
   * the largest gap between adjacent clusters measures the radial coverage.
   */
  const frondFan = (crown: THREE.BufferGeometry, cx: number, cz: number) => {
    const pos = positions(crown)
    const n = pos.length / 3
    const az: number[] = []
    const rad: number[] = []
    for (let i = 0; i < n; i++) {
      const dx = pos[i * 3] - cx
      const dz = pos[i * 3 + 2] - cz
      az.push(Math.atan2(dx, dz))
      rad.push(Math.hypot(dx, dz))
    }
    const angDist = (a: number, b: number) => {
      const d = Math.abs(a - b) % (Math.PI * 2)
      return d > Math.PI ? Math.PI * 2 - d : d
    }
    const tips: number[] = []
    for (let i = 0; i < n; i++) {
      let localMax = 0
      for (let j = 0; j < n; j++) {
        if (angDist(az[i], az[j]) <= 0.15) localMax = Math.max(localMax, rad[j])
      }
      if (rad[i] >= localMax * 0.95) tips.push(az[i])
    }
    tips.sort((a, b) => a - b)
    let clusters = 0
    let maxGap = 0
    for (let i = 0; i < tips.length; i++) {
      const next = tips[(i + 1) % tips.length]
      const gap = i === tips.length - 1 ? tips[0] + Math.PI * 2 - tips[i] : next - tips[i]
      maxGap = Math.max(maxGap, gap)
      if (gap > 0.2) clusters++
    }
    if (clusters === 0) clusters = 1 // all tips in one azimuth bundle
    return { clusters, maxGap, maxRadius: Math.max(...rad) }
  }

  for (const [label, detailed, minFronds, minRings, minCrownVerts] of [
    ['travel palm', false, 6, 6, 350],
    ['detailed settlement palm', true, 8, 8, 700],
  ] as const) {
    it(`${label}: the trunk is ONE connected mesh over the full height — no stacked gap segments`, () => {
      const { base, crown } = splitFoliage(buildPalm(detailed))
      const trunk = lowestComponent(base)
      // Rooted at the ground…
      expect(trunk.minY).toBeLessThan(0.01)
      // …and one piece all the way to the crown seat: the connected component
      // spans >= 90% of the base part's full vertical extent (bud included).
      const posB = positions(base)
      let baseMaxY = -Infinity
      for (let i = 1; i < posB.length; i += 3) baseMaxY = Math.max(baseMaxY, posB[i])
      expect(trunk.maxY - trunk.minY).toBeGreaterThan((baseMaxY - trunk.minY) * 0.9)
      // Tessellation floor for the curve: enough distinct ring levels.
      expect(trunk.levels).toBeGreaterThanOrEqual(minRings)
      // The gentle bend is real: the trunk top sits off the root axis.
      expect(Math.abs(trunk.top[0])).toBeGreaterThan(0.25)
      base.dispose()
      crown.dispose()
    })

    it(`${label}: the crown seats exactly at the trunk top and fans >= ${minFronds} fronds radially`, () => {
      const { base, crown } = splitFoliage(buildPalm(detailed))
      const trunk = lowestComponent(base)
      // Seated: some crown vertex coincides with the trunk-top point (the
      // frond stalks are rooted there) — no floating crown above a gap.
      const posC = positions(crown)
      let seatDist = Infinity
      for (let i = 0; i < posC.length; i += 3) {
        seatDist = Math.min(
          seatDist,
          Math.hypot(posC[i] - trunk.top[0], posC[i + 1] - trunk.top[1], posC[i + 2] - trunk.top[2]),
        )
      }
      expect(seatDist).toBeLessThan(0.1)
      // Radial fan about the trunk-top axis: >= minFronds distinct tip
      // directions, no half-empty crown (largest angular hole < 90°). Two
      // crossed billboards would read as 4 directions with 90° holes.
      const fan = frondFan(crown, trunk.top[0], trunk.top[2])
      expect(fan.clusters).toBeGreaterThanOrEqual(minFronds)
      expect(fan.maxGap).toBeLessThan(Math.PI / 2)
      // The fronds reach well out of the bud — a real crown, not a stub.
      expect(fan.maxRadius).toBeGreaterThan(detailed ? 1.6 : 1.1)
      // Arched and drooping: the crown rises above its seat and its drooping
      // layer falls below it.
      let crownMinY = Infinity
      let crownMaxY = -Infinity
      for (let i = 1; i < posC.length; i += 3) {
        crownMinY = Math.min(crownMinY, posC[i])
        crownMaxY = Math.max(crownMaxY, posC[i])
      }
      expect(crownMaxY).toBeGreaterThan(trunk.top[1] + 0.1)
      expect(crownMinY).toBeLessThan(trunk.top[1] - 0.2)
      // Vertex floor: feathered multi-segment blades, not single quads.
      expect(crown.attributes.position.count).toBeGreaterThanOrEqual(minCrownVerts)
      // Collapse path (§19.13): the whole fan is crown class 1 — splitFoliage
      // keeps it on the instance-matrix collapse like every other tree crown.
      for (const v of crown.attributes.foliage.array as Float32Array) expect(v).toBe(1)
      base.dispose()
      crown.dispose()
    })
  }

  it('the build is deterministic: two builds are byte-identical', () => {
    for (const detailed of [false, true]) {
      const a = buildPalm(detailed)
      const b = buildPalm(detailed)
      expect(a.attributes.position.array).toEqual(b.attributes.position.array)
      expect(a.attributes.color.array).toEqual(b.attributes.color.array)
      expect(a.attributes.foliage.array).toEqual(b.attributes.foliage.array)
    }
  })
})

describe('splitFoliage — crown/trunk split for the matrix-borne collapse (point 175)', () => {
  it('splits a tree into an all-crown part and a no-crown remainder, conserving every triangle', () => {
    for (const build of [buildAcacia, buildJungleTree, buildBaobab, () => buildPalm(false)]) {
      const geo = build()
      // The flora geometries are indexed (mergeGeometries of primitives); the
      // split is non-indexed, so its total vertex count equals the source's
      // index count — no triangle lost or duplicated.
      const srcVerts = geo.index ? geo.index.count : geo.attributes.position.count
      const { base, crown } = splitFoliage(geo)
      const bc = base.attributes.position.count
      const cc = crown.attributes.position.count
      expect(bc + cc).toBe(srcVerts)
      expect(cc).toBeGreaterThan(0) // there is a crown to collapse
      expect(bc).toBeGreaterThan(0) // and a trunk that stays put
      // Every crown vertex is foliage class 1; the remainder carries none.
      for (const v of crown.attributes.foliage.array as Float32Array) expect(v).toBe(1)
      for (const v of base.attributes.foliage.array as Float32Array) expect(v).not.toBe(1)
      // Both parts keep the attributes the shared material needs.
      for (const g of [base, crown]) {
        expect(g.attributes.position).toBeDefined()
        expect(g.attributes.normal).toBeDefined()
        expect(g.attributes.color).toBeDefined()
        expect(g.attributes.color.count).toBe(g.attributes.position.count)
      }
    }
  })
})
