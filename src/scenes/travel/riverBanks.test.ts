// Confluence bank rule (design.md §11.3; user-reported artifact): a ribbon
// edge whose outside probe lands in ANOTHER channel's band is interior water
// and must carry no bank treatment — while ordinary banks, including the own
// river's bends, keep theirs.
import { describe, it, expect } from 'vitest'
import {
  buildBankIndex,
  buildJuniorPairs,
  edgeIsInterior,
  mergeFactorAt,
  SELF_ARC_EXCLUSION,
  type BankAxisSample,
} from './riverBanks'

const BAND = 0.17

/** A straight north-south main river at lon 30, and a tributary approaching
 *  from the east that ends on the main axis (a confluence at lat 10). */
function twoRivers(): BankAxisSample[] {
  const samples: BankAxisSample[] = []
  for (let i = 0; i < 100; i++) samples.push({ riverId: 'main', index: i, lat: 6 + i * 0.08, lon: 30 })
  for (let i = 0; i < 40; i++) samples.push({ riverId: 'trib', index: i, lat: 10, lon: 33.2 - i * 0.08 })
  return samples
}

describe('edgeIsInterior (confluence bank masking)', () => {
  const samples = buildBankIndex(twoRivers())

  it('a tributary edge probe inside the main band is interior (no bank line)', () => {
    // The tributary's last samples sit on the main axis; a probe just north of
    // its edge near the mouth falls inside the main river's band.
    expect(edgeIsInterior(10.05, 30.05, 'trib', 39, samples, BAND)).toBe(true)
  })

  it('the same probe judged for the MAIN river is its own band — not interior', () => {
    // For the main river the nearby own samples are arc-excluded, and the
    // tributary's mouth samples are ~0.05° away... the main edge right at the
    // junction is legitimately interior too (the tributary opens into it).
    expect(edgeIsInterior(10.0, 30.2, 'main', 50, samples, BAND)).toBe(true)
    // But well upstream of the junction the main bank is real again.
    expect(edgeIsInterior(7.0, 30.24, 'main', 12, samples, BAND)).toBe(false)
  })

  it('a bank probe on open land is never interior', () => {
    // Perpendicular to the tributary's east-west axis: north of it, clear of
    // both bands (the main river runs 1.5° further west).
    expect(edgeIsInterior(10.245, 32.5, 'trib', 20, samples, BAND)).toBe(false)
  })

  it('own bends inside the arc exclusion never mask the own bank', () => {
    // A sharply bending single river: neighbouring own samples surround the
    // probe, but within the exclusion window they must not count.
    const bend: BankAxisSample[] = []
    for (let i = 0; i < SELF_ARC_EXCLUSION; i++) bend.push({ riverId: 'solo', index: i, lat: 5 + i * 0.04, lon: 20 + i * 0.04 })
    expect(edgeIsInterior(5.2, 20.2, 'solo', 5, buildBankIndex(bend), BAND)).toBe(false)
  })

  it('a distant loop of the own river DOES count as other water', () => {
    const loop: BankAxisSample[] = [
      { riverId: 'solo', index: 0, lat: 5, lon: 20 },
      { riverId: 'solo', index: 200, lat: 5.05, lon: 20.05 }, // oxbow returning
    ]
    expect(edgeIsInterior(5.02, 20.02, 'solo', 0, buildBankIndex(loop), BAND)).toBe(true)
  })
})

describe('edgeIsInterior boundary exactness (point 173 hardening)', () => {
  // A single foreign-river sample at the origin, so the probe distance is
  // controlled precisely (no neighbouring samples to muddy the closest pick).
  const oneSample = (riverId: string, index: number) =>
    buildBankIndex([{ riverId, index, lat: 0, lon: 0 }])

  it('the band distance is exact: AT bandDeg is not interior, a hair inside it is', () => {
    const idx = oneSample('other', 0)
    // Probe due north of the sample at exactly bandDeg — not "< bandDeg".
    expect(edgeIsInterior(0.1, 0, 'self', 999, idx, 0.1)).toBe(false)
    expect(edgeIsInterior(0.1 - 1e-6, 0, 'self', 999, idx, 0.1)).toBe(true)
  })

  it('the self-arc exclusion is exact: |i-self|===12 is excluded, 13 counts', () => {
    // Same riverId as the query, probe right on the sample (distance 0, well
    // inside any positive band) — only the index gap decides.
    const idxAt = (sampleIndex: number) => oneSample('r', sampleIndex)
    expect(edgeIsInterior(0, 0, 'r', 88, idxAt(100), 0.1)).toBe(false) // |100-88| = 12: excluded
    expect(edgeIsInterior(0, 0, 'r', 87, idxAt(100), 0.1)).toBe(true) // |100-87| = 13: counts
    // The exclusion is symmetric (index above or below self).
    expect(edgeIsInterior(0, 0, 'r', 112, idxAt(100), 0.1)).toBe(false) // |100-112| = 12
    expect(edgeIsInterior(0, 0, 'r', 113, idxAt(100), 0.1)).toBe(true) // |100-113| = 13
  })
})

// Point 233 — confluence/branch overlap masking: at a junction exactly one
// arm (the senior) draws the shared water; the junior arm's vertices fade out
// inside the senior's channel band, so the alpha never doubles and no arm's
// edge crosses the other's water.
describe('buildJuniorPairs (which junction arm yields)', () => {
  const line = (id: string, pts: Array<[number, number]>) => ({
    id,
    pts: pts.map(([lat, lon]) => ({ lat, lon })),
  })
  const BAND = 0.17

  it('a tributary that ENDS on another river yields to it', () => {
    const main = line('main', [[6, 30], [8, 30], [10, 30], [12, 30]])
    const trib = line('trib', [[10, 33], [10, 31.5], [10, 30.05]]) // mouth on the main axis
    const pairs = buildJuniorPairs([main, trib], BAND)
    expect(pairs.has('trib|main')).toBe(true)
    expect(pairs.has('main|trib')).toBe(false)
  })

  it('a distributary branch that STARTS on another river yields to it', () => {
    const main = line('main', [[6, 30], [8, 30], [10, 30], [12, 30]])
    const branch = line('branch', [[8, 30.1], [8, 31.5], [8, 33]]) // head on the main axis
    const pairs = buildJuniorPairs([main, branch], BAND)
    expect(pairs.has('branch|main')).toBe(true)
    expect(pairs.has('main|branch')).toBe(false)
  })

  it('mutual junctions (the shared Khartoum point) yield by data order — the later river fades', () => {
    // Both arms end on each other AND the main stem starts on both: every
    // pair carries indicators on both sides, so data order decides.
    const stem = line('stem', [[10, 30], [12, 30], [14, 30]])
    const armA = line('armA', [[10, 27], [10, 28.5], [10, 30]])
    const armB = line('armB', [[7, 30], [8.5, 30], [10, 30]])
    const pairs = buildJuniorPairs([stem, armA, armB], BAND)
    expect(pairs.has('armA|stem')).toBe(true)
    expect(pairs.has('armB|stem')).toBe(true)
    expect(pairs.has('armB|armA')).toBe(true) // later in data order yields
    expect(pairs.has('stem|armA')).toBe(false)
    expect(pairs.has('stem|armB')).toBe(false)
  })

  it('two channels merely passing near each other carry no relation', () => {
    const a = line('a', [[0, 10], [2, 10], [4, 10]])
    const b = line('b', [[0, 10.2], [2, 10.2], [4, 10.2]]) // parallel, never joining
    expect(buildJuniorPairs([a, b], BAND).size).toBe(0)
  })
})

describe('mergeFactorAt (the junior arm fades inside the senior band)', () => {
  const BAND = 0.17
  // Senior axis: a straight north-south river at lon 30.
  const samples: BankAxisSample[] = []
  for (let i = 0; i < 60; i++) samples.push({ riverId: 'main', index: i, lat: 8 + i * 0.08, lon: 30 })
  const index = buildBankIndex(samples)
  const juniors = new Set(['trib|main'])

  it('a junior vertex ON the senior axis is fully faded', () => {
    expect(mergeFactorAt(10, 30, 'trib', index, BAND, juniors)).toBe(0)
  })

  it('a junior vertex outside the senior band keeps full opacity', () => {
    expect(mergeFactorAt(10, 30 + BAND, 'trib', index, BAND, juniors)).toBe(1)
  })

  it('the fade is smooth and monotone across the senior waterline', () => {
    const deep = mergeFactorAt(10, 30 + BAND * 0.35, 'trib', index, BAND, juniors)
    const mid = mergeFactorAt(10, 30 + BAND * 0.65, 'trib', index, BAND, juniors)
    const outer = mergeFactorAt(10, 30 + BAND * 0.95, 'trib', index, BAND, juniors)
    expect(deep).toBe(0)
    expect(mid).toBeGreaterThan(0)
    expect(mid).toBeLessThan(1)
    expect(outer).toBe(1)
  })

  it('the senior arm never fades — not at the same point, not anywhere', () => {
    // The main river is nobody's junior: its own samples do not count against
    // it, and the junior relation is directional.
    expect(mergeFactorAt(10, 30, 'main', index, BAND, juniors)).toBe(1)
  })

  it('an unrelated river keeps full opacity even inside the band', () => {
    expect(mergeFactorAt(10, 30, 'other', index, BAND, juniors)).toBe(1)
  })
})
