// Village first-visit vignettes (design.md §16, TASKS pt. 13): every village's
// entry reflects its people's ~1890 way of life — one distinct text per
// people, in both languages, with well-formed voice markup.
import { describe, expect, it } from 'vitest'
import { en } from './en'
import { de } from './de'
import { PLACES } from '../world/geo'
import { stripVoiceMarkup } from '../journal/voiceMarkup'

const villages = PLACES.filter((p) => p.kind === 'village')

describe('village first-visit entries (per-people vignettes)', () => {
  it('covers all villages (each carries a people)', () => {
    expect(villages.length).toBeGreaterThanOrEqual(20)
    for (const v of villages) expect(v.peopleId, v.id).toBeTruthy()
  })

  for (const lang of [en, de]) {
    it(`${lang.lang}: every village gets its own historically flavored text`, () => {
      const texts = villages.map((v) =>
        lang.journal.villageFirstVisit({ place: v.id, people: v.peopleId ?? '' }),
      )
      for (const t of texts) {
        expect(t.length).toBeGreaterThan(80) // a real vignette, not a stub
        expect(stripVoiceMarkup(t)).not.toMatch(/[[\]]/) // markup strips cleanly
      }
      // Variety: no two villages share a text.
      expect(new Set(texts).size).toBe(villages.length)
      // No village falls back to the generic text — every people has its own.
      const generic = lang.journal.villageFirstVisit({
        place: villages[0].id,
        people: 'no-such-people',
      })
      for (const t of texts) expect(t).not.toBe(generic)
    })
  }
})
