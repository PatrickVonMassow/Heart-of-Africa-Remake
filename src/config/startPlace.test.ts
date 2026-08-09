import { describe, expect, it } from 'vitest'
import { START_PARAM, startPlaceFromUrl } from './startPlace'
import { PLACES } from '../world/geo'

describe('startPlaceFromUrl (the debug start place)', () => {
  it('answers null without the parameter, so the design start stands', () => {
    expect(startPlaceFromUrl('')).toBeNull()
    expect(startPlaceFromUrl('?seed=7')).toBeNull()
  })

  it('returns a place the world model really carries', () => {
    expect(startPlaceFromUrl('?start=bambara-village')).toBe('bambara-village')
    expect(startPlaceFromUrl('?seed=7&start=cairo')).toBe('cairo')
  })

  it('falls back to null on an id no place carries — a mistyped link opens the ordinary game', () => {
    expect(startPlaceFromUrl('?start=atlantis')).toBeNull()
    expect(startPlaceFromUrl('?start=')).toBeNull()
    expect(startPlaceFromUrl('?start=BAMBARA-VILLAGE')).toBeNull() // ids are exact
  })

  it('accepts every place in the world model, so no settlement is unreachable for a test', () => {
    for (const p of PLACES) expect(startPlaceFromUrl(`?${START_PARAM}=${p.id}`)).toBe(p.id)
  })
})
