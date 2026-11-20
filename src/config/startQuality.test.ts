import { describe, expect, it } from 'vitest'
import { DETAIL_LEVELS } from './quality'
import { isWeakAdapter, startDetailLevelForAdapter, startQualityFromUrl } from './startQuality'

describe('startQualityFromUrl', () => {
  it('reads each level name', () => {
    for (const level of DETAIL_LEVELS) expect(startQualityFromUrl(`?quality=${level}`)).toBe(level)
  })

  it('is case-insensitive', () => {
    expect(startQualityFromUrl('?quality=LOW')).toBe('low')
    expect(startQualityFromUrl('?quality=High')).toBe('high')
    expect(startQualityFromUrl('?quality=mEdIuM')).toBe('medium')
  })

  it('returns null for an unknown, empty or missing value', () => {
    expect(startQualityFromUrl('?quality=ultra')).toBeNull()
    expect(startQualityFromUrl('?quality=')).toBeNull()
    expect(startQualityFromUrl('?quality')).toBeNull()
    expect(startQualityFromUrl('')).toBeNull()
    expect(startQualityFromUrl('?lang=de')).toBeNull()
  })

  it('finds the parameter among others, in either order', () => {
    expect(startQualityFromUrl('?bench=short&quality=low')).toBe('low')
    expect(startQualityFromUrl('?quality=low&bench=short')).toBe('low')
  })

  it('reads the first occurrence of a repeated parameter', () => {
    expect(startQualityFromUrl('?quality=low&quality=high')).toBe('low')
    expect(startQualityFromUrl('?quality=bogus&quality=high')).toBeNull()
  })
})

describe('startDetailLevelForAdapter (point 1562)', () => {
  it('puts the weak notebooks on low', () => {
    expect(startDetailLevelForAdapter('amd rdna-2', 1.75)).toBe('low')
    expect(startDetailLevelForAdapter('intel gen-8', 1)).toBe('low')
    expect(startDetailLevelForAdapter('ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)', 1)).toBe('low')
    expect(startDetailLevelForAdapter('ANGLE (AMD, AMD Radeon(TM) Graphics Direct3D11 vs_5_0 ps_5_0, D3D11)', 1)).toBe('low')
  })

  it('keeps medium for strong, unknown and software adapters', () => {
    expect(startDetailLevelForAdapter('nvidia lovelace', 1.75)).toBe('medium')
    expect(startDetailLevelForAdapter('amd rdna-3', 1.75)).toBe('medium')
    expect(startDetailLevelForAdapter('intel xe-hpg', 1)).toBe('medium')
    expect(startDetailLevelForAdapter('ANGLE (Intel, Intel(R) Arc(TM) A770 Graphics Direct3D11)', 1)).toBe('medium')
    expect(startDetailLevelForAdapter('unknown', 2)).toBe('medium')
    expect(startDetailLevelForAdapter('ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero)), SwiftShader driver)', 1)).toBe('medium')
  })

  it('needs a notebook-like dpr for an architecture-only AMD name', () => {
    expect(startDetailLevelForAdapter('amd rdna-2', 1)).toBe('medium')
    expect(startDetailLevelForAdapter('amd rdna-2', 1.25)).toBe('low')
  })

  it('isWeakAdapter takes its rules as a calibratable argument', () => {
    expect(isWeakAdapter('nvidia lovelace', 1, [{ pattern: /nvidia/ }])).toBe(true)
    expect(isWeakAdapter('nvidia lovelace', 1, [])).toBe(false)
  })
})
