// LOW's flora density lever (point 310): an instance-count factor on top of the
// floraFogFactor radius cut. Pinned here on the REAL savanna placement: the
// thinned share follows the factor, only non-collidable dressing is thinned (so
// no hidden plant keeps a collider), every kind still appears (the land keeps
// reading as savanna, design.md §19.9), and the thinning is deterministic and
// nested so a level change never shuffles plants.
import { beforeAll, describe, expect, it } from 'vitest'
import { placedFloraChunk } from './TravelScene'
import { floraKeptAtDensity, floraThinningKey } from './floraStreaming'
import { QUALITY_PRESETS } from '../../config/quality'
import { setupGeodata } from '../../test/geodata'

beforeAll(async () => {
  await setupGeodata()
})

const COLLIDABLE = new Set(['acacia', 'jungle', 'palm', 'baobab', 'kopje']) // TravelScene COLLIDABLE_FLORA
const SEED = 1

/** Every placed plant of a 9x9-chunk Serengeti savanna square. */
function savannaPlants() {
  const cx = Math.floor((34.8 * 10) / 24)
  const cz = Math.floor((2 * 10) / 24)
  const out = []
  for (let dz = -4; dz <= 4; dz++) for (let dx = -4; dx <= 4; dx++) out.push(...placedFloraChunk(cx + dx, cz + dz, SEED))
  return out
}

describe('flora density preset key', () => {
  it('LOW thins (0 < density < 1); medium and high draw the full dressing', () => {
    expect(QUALITY_PRESETS.low.floraDensity).toBeGreaterThan(0)
    expect(QUALITY_PRESETS.low.floraDensity).toBeLessThan(1)
    expect(QUALITY_PRESETS.medium.floraDensity).toBe(1)
    expect(QUALITY_PRESETS.high.floraDensity).toBe(1)
  })
})

describe('floraKeptAtDensity on the real savanna placement', () => {
  // Filled after the geodata loads (beforeAll above runs first).
  let plants: ReturnType<typeof savannaPlants> = []
  beforeAll(() => {
    plants = savannaPlants()
  })
  const d = QUALITY_PRESETS.low.floraDensity

  it('the sample is a real savanna with both thinnable and collidable kinds', () => {
    expect(plants.length).toBeGreaterThan(300)
    expect(plants.some((p) => COLLIDABLE.has(p.species))).toBe(true)
    expect(plants.some((p) => !COLLIDABLE.has(p.species))).toBe(true)
  })

  it('keeps about the density share of the thinnable dressing', () => {
    const thin = plants.filter((p) => !COLLIDABLE.has(p.species))
    const kept = thin.filter((p) => floraKeptAtDensity(true, p.r4, d)).length
    expect(kept / thin.length).toBeGreaterThan(d - 0.08)
    expect(kept / thin.length).toBeLessThan(d + 0.08)
  })

  it('never thins a collidable plant (no invisible collider)', () => {
    for (const p of plants.filter((q) => COLLIDABLE.has(q.species))) {
      expect(floraKeptAtDensity(false, p.r4, d)).toBe(true)
      expect(floraKeptAtDensity(false, p.r4, 0)).toBe(true)
    }
  })

  it('every dressing kind present at full density is still present at LOW density', () => {
    const kinds = (keep: (p: (typeof plants)[number]) => boolean) =>
      new Set(plants.filter(keep).map((p) => p.species))
    const full = kinds(() => true)
    const low = kinds((p) => floraKeptAtDensity(!COLLIDABLE.has(p.species), p.r4, d))
    expect(low).toEqual(full)
  })

  it('density 1 draws everything; the thinning is nested (kept at 0.4 ⊂ kept at 0.6)', () => {
    for (const p of plants) {
      expect(floraKeptAtDensity(true, p.r4, 1)).toBe(true)
      if (floraKeptAtDensity(true, p.r4, 0.4)) expect(floraKeptAtDensity(true, p.r4, 0.6)).toBe(true)
    }
  })

  it('the thinning key is in [0, 1) and not the coarse hash that sets scale', () => {
    let corr = 0
    for (const p of plants) {
      const k = floraThinningKey(p.r4)
      expect(k).toBeGreaterThanOrEqual(0)
      expect(k).toBeLessThan(1)
      corr += (k - 0.5) * (p.r4 - 0.5)
    }
    // Uncorrelated: thinning does not prefer small or large plants.
    expect(Math.abs(corr / plants.length)).toBeLessThan(0.01)
  })
})
