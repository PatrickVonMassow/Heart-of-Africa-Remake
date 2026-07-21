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

  // The rinderpest years (design.md §16, point 133): the Maasai and Sidama
  // vignettes are phase-aware — each phase reads as its own text, all
  // markup-clean, and the German struck text carries Baumann's own words.
  for (const lang of [en, de]) {
    it(`${lang.lang}: the Maasai vignette changes with the plague phase (three distinct texts)`, () => {
      const at = (phase: string) =>
        lang.journal.villageFirstVisit({ place: 'maasai-village', people: 'maasai', phase })
      const texts = [at('preDamaged'), at('struck'), at('aftermath')]
      expect(new Set(texts).size).toBe(3)
      for (const t of texts) {
        expect(t.length).toBeGreaterThan(80)
        expect(stripVoiceMarkup(t)).not.toMatch(/[[\]]/)
      }
    })

    it(`${lang.lang}: the Sidama vignette reads struck through 1892 and aftermath after`, () => {
      const at = (phase: string) =>
        lang.journal.villageFirstVisit({ place: 'sidama-village', people: 'sidama', phase })
      const texts = [at('struck'), at('aftermath')]
      expect(new Set(texts).size).toBe(2)
      for (const t of texts) {
        expect(t.length).toBeGreaterThan(80)
        expect(stripVoiceMarkup(t)).not.toMatch(/[[\]]/)
      }
    })
  }

  it('the German struck text carries Baumann verbatim, never a back-translation', () => {
    const t = de.journal.villageFirstVisit({ place: 'maasai-village', people: 'maasai', phase: 'struck' })
    expect(t).toContain('Hungergestalten')
    expect(t).toContain('vom Honig der Waldbienen')
    expect(t).not.toContain('wandelnde Skelette') // the drifted paraphrase is not his phrase
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

// Return vignettes (design.md §16, point 170): a re-entry after the plague phase
// changed adds a shocked entry describing ONLY the change — one distinct,
// markup-clean text per (people, transition) in both languages.
describe('village return entries (phase-transition vignettes)', () => {
  const transitions = [
    ['maasai', 'preDamaged', 'struck'],
    ['maasai', 'struck', 'aftermath'],
    ['maasai', 'preDamaged', 'aftermath'],
    ['sidama', 'struck', 'aftermath'],
  ] as const

  for (const lang of [en, de]) {
    it(`${lang.lang}: each modelled transition has its own markup-clean return text`, () => {
      const texts = transitions.map(([people, fromPhase, toPhase]) =>
        lang.journal.villageReturn({ place: `${people}-village`, people, fromPhase, toPhase }),
      )
      for (const t of texts) {
        expect(t.length).toBeGreaterThan(80) // a real vignette, not a stub
        expect(stripVoiceMarkup(t)).not.toMatch(/[[\]]/) // markup strips cleanly
      }
      // Every transition reads as its own text, and none falls back to the generic.
      expect(new Set(texts).size).toBe(transitions.length)
      const generic = lang.journal.villageReturn({
        place: 'maasai-village',
        people: 'no-such-people',
        fromPhase: 'struck',
        toPhase: 'aftermath',
      })
      for (const t of texts) expect(t).not.toBe(generic)
      // The generic fallback is itself well-formed markup.
      expect(stripVoiceMarkup(generic)).not.toMatch(/[[\]]/)
    })
  }
})
