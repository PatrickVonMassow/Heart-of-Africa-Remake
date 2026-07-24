// Quality-preset completeness + the F9 cycle order (design.md §21, point 276
// part B). The completeness gate is the "sichere Mechanik": every future optical
// feature added as a preset key MUST carry a low/medium/high value or this test
// fails — so a level can never silently miss a setting.
import { describe, it, expect } from 'vitest'
import {
  QUALITY_PRESETS,
  QUALITY_KEYS,
  DETAIL_LEVELS,
  nextDetailLevel,
  type DetailLevel,
  type QualityPreset,
} from './quality'

describe('quality-preset completeness (design.md §21 sort-into-levels gate)', () => {
  it('every level defines EXACTLY the canonical quality keys — no gaps, no extras', () => {
    for (const level of DETAIL_LEVELS) {
      const keys = Object.keys(QUALITY_PRESETS[level]).sort()
      expect(keys, `preset ${level}`).toEqual([...QUALITY_KEYS].sort())
    }
  })

  it('every quality key is DEFINED (never undefined) in all three presets', () => {
    for (const key of QUALITY_KEYS) {
      for (const level of DETAIL_LEVELS) {
        expect(
          QUALITY_PRESETS[level][key],
          `${level}.${String(key)} must be defined`,
        ).not.toBeUndefined()
      }
    }
  })

  it('the canonical key list is non-empty and matches the medium preset shape', () => {
    expect(QUALITY_KEYS.length).toBeGreaterThan(0)
    expect(new Set(QUALITY_KEYS)).toEqual(new Set(Object.keys(QUALITY_PRESETS.medium)))
  })
})

describe('preset calibration invariants (a clear, visible low→high climb)', () => {
  it('sun shadow resolution strictly climbs low < medium < high, high above 2048', () => {
    expect(QUALITY_PRESETS.low.sunShadowResolution).toBeLessThan(QUALITY_PRESETS.medium.sunShadowResolution)
    expect(QUALITY_PRESETS.medium.sunShadowResolution).toBeLessThan(QUALITY_PRESETS.high.sunShadowResolution)
    expect(QUALITY_PRESETS.high.sunShadowResolution).toBeGreaterThan(2048)
  })

  it('low is the frugal floor: dpr capped, all post off, no shadows at all', () => {
    expect(QUALITY_PRESETS.low.dprCap).toBe(1)
    expect(QUALITY_PRESETS.low.ssao).toBe(false)
    expect(QUALITY_PRESETS.low.traa).toBe(false)
    expect(QUALITY_PRESETS.low.bloom).toBe(false)
    // Point 305 (M1-Pro tuning): LOW casts NO sun shadows — the benchmark's
    // biggest remaining lever after dpr + post (952→72 draw calls, ~2 M tris).
    expect(QUALITY_PRESETS.low.sunShadows).toBe(false)
    expect(QUALITY_PRESETS.low.fireShadows).toBe(false)
    expect(QUALITY_PRESETS.low.terrainRefine).toBe(false)
    expect(QUALITY_PRESETS.low.floraFogFactor).toBeLessThan(1)
    expect(QUALITY_PRESETS.low.floraCastShadow).toBe(false)
  })

  it('medium (default) keeps TRAA+Bloom and the 256² campfire shadows, SSAO off', () => {
    expect(QUALITY_PRESETS.medium.dprCap).toBeNull()
    expect(QUALITY_PRESETS.medium.ssao).toBe(false)
    expect(QUALITY_PRESETS.medium.traa).toBe(true)
    expect(QUALITY_PRESETS.medium.bloom).toBe(true)
    expect(QUALITY_PRESETS.medium.fireShadows).toBe(true)
    expect(QUALITY_PRESETS.medium.fireShadowResolution).toBe(256)
    expect(QUALITY_PRESETS.medium.fireShadowSoft).toBe(false)
    expect(QUALITY_PRESETS.medium.terrainRefine).toBe(true)
  })

  it('high is the richest: SSAO on and the soft, higher-res campfire variant', () => {
    expect(QUALITY_PRESETS.high.ssao).toBe(true)
    expect(QUALITY_PRESETS.high.fireShadows).toBe(true)
    expect(QUALITY_PRESETS.high.fireShadowResolution).toBeGreaterThan(QUALITY_PRESETS.medium.fireShadowResolution)
    expect(QUALITY_PRESETS.high.fireShadowSoft).toBe(true)
  })
})

describe('F9 cycle order (design.md §21): medium → low → high → medium', () => {
  it('steps DOWN one level, wrapping the bottom back to the top', () => {
    expect(nextDetailLevel('medium')).toBe('low')
    expect(nextDetailLevel('low')).toBe('high')
    expect(nextDetailLevel('high')).toBe('medium')
  })

  it('a full cycle from the default returns to the default in exactly three steps', () => {
    let level: DetailLevel = 'medium'
    const seen: DetailLevel[] = [level]
    for (let i = 0; i < 3; i++) {
      level = nextDetailLevel(level)
      seen.push(level)
    }
    expect(seen).toEqual(['medium', 'low', 'high', 'medium'])
  })

  it('the cycle is a permutation of all three levels (visits each once per loop)', () => {
    const visited = new Set<DetailLevel>()
    let level: DetailLevel = 'medium'
    for (let i = 0; i < 3; i++) {
      visited.add(level)
      level = nextDetailLevel(level)
    }
    expect(visited).toEqual(new Set<DetailLevel>(['low', 'medium', 'high']))
  })
})

// A tiny compile-time witness that QUALITY_KEYS is exactly keyof QualityPreset.
const _keyCheck: Array<keyof QualityPreset> = QUALITY_KEYS
void _keyCheck
