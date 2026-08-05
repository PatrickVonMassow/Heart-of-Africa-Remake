// Arrival texts of every walkable place (design.md §16, CLAUDE.md §7.1 pt. 8,
// point 394). THE COMPLETENESS GATE: this suite walks `PLACES` — ports,
// villages, the monument site, and whatever kind is added next — and fails when
// a place has no first-entry text in EITHER language. A new walkable place
// therefore cannot ship silent; it is the same shape as the QUALITY_PRESETS
// gate. The return texts are covered where a situation is modelled at all.
import { describe, expect, it } from 'vitest'
import { en } from './en'
import { de } from './de'
import { resolveText } from './index'
import type { Strings } from './types'
import { PLACES, PLACE_KINDS, placeById, type PlaceDef } from '../world/geo'
import { firstArrivalEntry, returnArrivalEntry } from '../journal/arrival'
import { placeSituationAt, STEADY } from '../systems/placeSituation'
import { stripVoiceMarkup } from '../journal/voiceMarkup'
import { START_YEAR } from '../config/balance'

const LANGS: Array<[string, Strings]> = [
  ['en', en],
  ['de', de],
]

/** Every situation a place can stand in across the game's whole window —
 *  sampled every ~10 days from 1890 into 1896, so a seasonal driver (Berbera's
 *  fair, the Nile flood at Giza) contributes each of its readings. */
function situationsOf(place: PlaceDef): string[] {
  const seen = new Set<string>()
  for (let day = 0; day <= 2200; day += 10) seen.add(placeSituationAt(place, day, START_YEAR))
  return [...seen]
}

/** The first-entry text of a place in one language, at one situation. */
function firstText(lang: Strings, place: PlaceDef, situation: string): string {
  return resolveText(lang, firstArrivalEntry(place, situation).text)
}

describe('first-entry texts cover every walkable place (point 394)', () => {
  it('the roster holds all three kinds, so the sweep is not a village-only sweep', () => {
    for (const kind of PLACE_KINDS) {
      expect(PLACES.some((p) => p.kind === kind), `no place of kind ${kind}`).toBe(true)
    }
  })

  for (const [name, lang] of LANGS) {
    it(`${name}: every place has its own first-entry text, in every situation it can reach`, () => {
      const byPlace = new Map<string, string>()
      for (const place of PLACES) {
        for (const situation of situationsOf(place)) {
          const text = firstText(lang, place, situation)
          const where = `${name}/${place.id}@${situation}`
          // A real arrival text, not a stub and not the raw key.
          expect(text.length, where).toBeGreaterThan(80)
          expect(text, where).not.toContain('journal.')
          // The markup is additive: stripping it leaves well-formed prose.
          expect(stripVoiceMarkup(text), where).not.toMatch(/[[\]]/)
          if (!byPlace.has(place.id)) byPlace.set(place.id, text)
        }
      }
      // Written FOR the place: no two places share an arrival text.
      expect(new Set(byPlace.values()).size).toBe(PLACES.length)
    })

    it(`${name}: no place falls back to its kind's generic arrival text`, () => {
      // The generic fallback of each kind, obtained through ids that have no
      // text of their own. It interpolates the place NAME, so a place without
      // its own text renders the same prose around a different name — the
      // comparison is therefore made with the name blanked out on both sides,
      // else a missing text hides behind its own place name (it did: the first
      // cut of this gate passed with a port's vignette deleted).
      const blank = (text: string, name: string) => text.split(name).join('§')
      const generic = new Map<string, string>()
      for (const kind of PLACE_KINDS) {
        const sample = PLACES.find((p) => p.kind === kind) as PlaceDef
        const doctored = { ...sample, id: 'no-such-place', peopleId: 'no-such-people' }
        // The doctored id resolves to no name at all, which renders as
        // "undefined" exactly where the place name would stand.
        generic.set(kind, blank(firstText(lang, doctored, STEADY), 'undefined'))
      }
      for (const place of PLACES) {
        const placeName = (lang.places as Record<string, string>)[place.id]
        for (const situation of situationsOf(place)) {
          expect(
            blank(firstText(lang, place, situation), placeName),
            `${name}/${place.id}@${situation} has no text of its own`,
          ).not.toBe(generic.get(place.kind))
        }
      }
      // The fallbacks are themselves well-formed — a future place is never
      // journaled with broken markup while its own text is being written.
      for (const text of generic.values()) expect(stripVoiceMarkup(text)).not.toMatch(/[[\]]/)
    })
  }
})

describe('return texts describe the change (points 170/394)', () => {
  // Only a place whose situation is MODELLED can ever write a return entry.
  const modelled = PLACES.filter((p) => situationsOf(p).some((s) => s !== STEADY))

  it('the modelled set holds all three kinds — ports and the monument site too', () => {
    expect(modelled.map((p) => p.id)).toContain('berbera') // the fair season
    expect(modelled.map((p) => p.id)).toContain('giza') // the Nile flood
    expect(modelled.some((p) => p.kind === 'village')).toBe(true) // the plague phase
  })

  for (const [name, lang] of LANGS) {
    it(`${name}: every reachable transition has its own markup-clean return text`, () => {
      for (const place of modelled) {
        const situations = situationsOf(place)
        if (situations.length < 2) continue // a constant situation never returns
        const texts = new Set<string>()
        for (const from of situations) {
          for (const to of situations) {
            if (from === to) continue
            const text = resolveText(lang, returnArrivalEntry(place, from, to).text)
            const where = `${name}/${place.id} ${from}→${to}`
            expect(text.length, where).toBeGreaterThan(80)
            expect(stripVoiceMarkup(text), where).not.toMatch(/[[\]]/)
            texts.add(text)
          }
        }
        // Each direction reads as its own text — never one text for both ways.
        expect(texts.size, `${name}/${place.id}: transitions share a text`).toBeGreaterThan(1)
      }
    })
  }

  it('the Berbera and Giza return texts name their own change, not the other place', () => {
    const berbera = resolveText(en, returnArrivalEntry(placeById('berbera'), 'fair', 'deserted').text)
    const giza = resolveText(en, returnArrivalEntry(placeById('giza'), 'lowWater', 'flood').text)
    expect(berbera).toMatch(/emptied/i)
    expect(giza).toMatch(/flood|island/i)
  })
})

describe('arrival titles (point 394)', () => {
  for (const [name, lang] of LANGS) {
    it(`${name}: every place's first-entry title names the place`, () => {
      for (const place of PLACES) {
        const title = resolveText(lang, firstArrivalEntry(place, STEADY).title)
        expect(title.length, `${name}/${place.id}`).toBeGreaterThan(2)
        expect(title, `${name}/${place.id}`).toContain(
          (lang.places as Record<string, string>)[place.id],
        )
      }
    })
  }
})
