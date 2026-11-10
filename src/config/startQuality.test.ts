import { describe, expect, it } from 'vitest'
import { DETAIL_LEVELS } from './quality'
import { startQualityFromUrl } from './startQuality'

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
