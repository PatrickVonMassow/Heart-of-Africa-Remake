// In-world language lore (design.md §13.2): the regional direction words, the
// landmark glossary and the unspecific-knowledge words are fixed constants that
// the hint texts weave in. Pure data, no browser.
import { describe, it, expect } from 'vitest'
import { DIRECTION_WORDS, GLOSSARY, UNSPECIFIC_WORDS } from './lore'
import type { RegionId } from './geo'

const REGIONS: RegionId[] = ['north', 'west', 'central', 'east', 'south']

describe('direction words (design.md §13.2)', () => {
  it('every region has all four non-empty direction words', () => {
    for (const r of REGIONS) {
      const w = DIRECTION_WORDS[r]
      expect(Object.keys(w).sort()).toEqual(['east', 'north', 'south', 'west'])
      for (const word of Object.values(w)) expect(word.length).toBeGreaterThan(0)
    }
  })

  it('carries the design.md-fixed words verbatim', () => {
    expect(DIRECTION_WORDS.north.north).toBe('Nivera')
    expect(DIRECTION_WORDS.west.north).toBe('koko')
    expect(DIRECTION_WORDS.west.east).toBe('Katula')
    expect(DIRECTION_WORDS.west.south).toBe('Phuthswama')
    expect(DIRECTION_WORDS.west.west).toBe('Mimbumi')
    expect(DIRECTION_WORDS.east.north).toBe('Relolo')
    expect(DIRECTION_WORDS.east.south).toBe('Dethamee')
  })

  it("the south's directions are the season words (design.md §13.2)", () => {
    expect(DIRECTION_WORDS.south).toEqual({ north: 'summer', south: 'winter', east: 'spring', west: 'autumn' })
  })
})

describe('glossary + unspecific words (design.md §13.2/§13.3)', () => {
  it('names the landmarks in the local tongue', () => {
    expect(GLOSSARY.congo).toBe('Mongdamara')
    expect(GLOSSARY.zambezi).toBe('Lastwana')
    expect(GLOSSARY.kilimanjaro).toBe('Unumpara')
    expect(GLOSSARY.victoriaFalls).toBe('Gumba lu Untoba')
    expect(GLOSSARY.elephants).toBe('Galumba')
  })

  it('has three unspecific-knowledge words including "Oz Oz"', () => {
    expect(UNSPECIFIC_WORDS).toContain('Oz Oz')
    expect(UNSPECIFIC_WORDS.length).toBe(3)
    for (const w of UNSPECIFIC_WORDS) expect(w.length).toBeGreaterThan(0)
  })
})
