// i18n completeness for the world roster (TASKS point 207 (v) — a metamorphic /
// data-integrity relation: display of a name is discovery-gated, but the name
// itself must EXIST in BOTH languages for every place and landmark the game can
// name. A missing entry is a real user-visible bug (a blank label or a fallback
// id shown on discovery), so this test pins that the language files stay
// exhaustive as the roster grows.
import { describe, it, expect } from 'vitest'
import { en } from './en'
import { de } from './de'
import { PLACES } from '../world/geo'
import {
  MOUNTAINS,
  WATERFALLS,
  CULTURAL_LANDMARKS,
  NATURAL_SITES,
} from '../world/data/landmarks'
import { LAKES } from '../world/data/lakes'

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0

describe('i18n name completeness', () => {
  it('every place has a non-empty localized name in both languages', () => {
    for (const p of PLACES) {
      expect(nonEmpty((en.places as Record<string, string>)[p.id]), `en place ${p.id}`).toBe(true)
      expect(nonEmpty((de.places as Record<string, string>)[p.id]), `de place ${p.id}`).toBe(true)
    }
  })

  it('every landmark (mountains, waterfalls, lakes, cultural, natural) has a name in both languages', () => {
    const ids = [
      ...MOUNTAINS.map((m) => m.id),
      ...WATERFALLS.map((w) => w.id),
      ...LAKES.map((l) => l.id),
      ...CULTURAL_LANDMARKS.map((c) => c.id),
      ...NATURAL_SITES.map((n) => n.id),
    ]
    for (const id of ids) {
      expect(nonEmpty((en.landmarks as Record<string, string>)[id]), `en landmark ${id}`).toBe(true)
      expect(nonEmpty((de.landmarks as Record<string, string>)[id]), `de landmark ${id}`).toBe(true)
    }
  })

  it('the elephant graveyard is named in both languages', () => {
    expect(nonEmpty((en.landmarks as Record<string, string>)['elephant-graveyard'])).toBe(true)
    expect(nonEmpty((de.landmarks as Record<string, string>)['elephant-graveyard'])).toBe(true)
  })
})
