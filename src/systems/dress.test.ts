import { describe, expect, it } from 'vitest'
import { cloakForCloth, coldCloaksFor } from './dress'
import { COLD_DRESS_THRESHOLD, coldnessAt } from './season'

// The peoples' coordinates as the world model places them (src/world/geo.ts).
const ZULU = { lat: -28.4, lon: 31.3 }
const MAASAI = { lat: -2.5, lon: 36.8 }
const TUAREG = { lat: 23.2, lon: 5.8 }
const SAN = { lat: -22.5, lon: 21.0 }
const PEDI = { lat: -24.5, lon: 29.5 }
const BAGANDA = { lat: 0.75, lon: 32.55 }

const START = 1890
// Day-of-year offsets from 01.01.1890 for the months the research names.
const JANUARY = 15
const APRIL = 105
const JULY = 196 // the austral winter peak — Drakensberg snow, Jun-Aug
const OCTOBER = 288

describe('coldnessAt (point 120g — the seasonal swing needs latitude)', () => {
  it('Zululand is cold in the austral winter and not in the summer', () => {
    const winter = coldnessAt(JULY, ZULU.lat, ZULU.lon, START, 100)
    const summer = coldnessAt(JANUARY, ZULU.lat, ZULU.lon, START, 100)
    expect(winter).toBeGreaterThan(COLD_DRESS_THRESHOLD)
    expect(summer).toBeLessThan(COLD_DRESS_THRESHOLD)
  })

  it('the equator has effectively no seasonal swing — a Baganda village is never cold', () => {
    for (const day of [JANUARY, APRIL, JULY, OCTOBER]) {
      expect(coldnessAt(day, BAGANDA.lat, BAGANDA.lon, START, 1200)).toBeLessThan(
        COLD_DRESS_THRESHOLD,
      )
    }
  })

  it('the hemispheres are opposite: the Sahara peaks cold in January, not July', () => {
    const jan = coldnessAt(JANUARY, TUAREG.lat, TUAREG.lon, START, 500)
    const jul = coldnessAt(JULY, TUAREG.lat, TUAREG.lon, START, 500)
    expect(jan).toBeGreaterThan(jul)
  })

  it('height is cold regardless of the month', () => {
    const low = coldnessAt(JANUARY, MAASAI.lat, MAASAI.lon, START, 0)
    const high = coldnessAt(JANUARY, MAASAI.lat, MAASAI.lon, START, 2500)
    expect(high).toBeGreaterThan(low)
  })

  it('stays inside 0..1 across the year, every inhabited latitude and height', () => {
    for (const lat of [-34, -28.4, -12, 0, 12, 23.2, 31.7]) {
      for (let day = 0; day < 365; day += 7) {
        for (const el of [0, 1500, 4000]) {
          const c = coldnessAt(day, lat, 20, START, el)
          expect(c).toBeGreaterThanOrEqual(0)
          expect(c).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('coldCloaksFor (point 120g — evidence-gated, and mostly absent)', () => {
  it('the Zulu add Mayr\'s cloak in the cold — the one period-sourced case', () => {
    expect(coldCloaksFor('zulu', 1)).not.toBeNull()
    expect(coldCloaksFor('zulu', 1)!.length).toBeGreaterThan(1) // Mayr's mid-transition mix
  })

  it('and shed it in the warmth: the cloak is the cold-weather garment, not the dress', () => {
    expect(coldCloaksFor('zulu', 0)).toBeNull()
    expect(coldCloaksFor('zulu', COLD_DRESS_THRESHOLD - 0.01)).toBeNull()
  })

  it('peoples the research found no period evidence for wear nothing extra', () => {
    // "Sahel harmattan: EVIDENCE ABSENT — do not invent"; the Tuareg seasonal
    // claims were 20th-century tourism copy; San is tertiary/THIN; the Sidama
    // kiremt-dress account does not exist; and "Lesotho is not Zululand", so
    // the Basotho blanket does not travel to the Pedi.
    for (const people of ['tuareg', 'hausa', 'bambara', 'mandinka', 'san', 'sidama', 'pedi']) {
      expect(coldCloaksFor(people, 1)).toBeNull()
    }
  })

  it('an unknown people is never dressed by guesswork', () => {
    expect(coldCloaksFor('not-a-people', 1)).toBeNull()
  })

  it('the near misses stay bare even where their own ground IS cold', () => {
    // These two are the traps the research names by name: the San's Kalahari
    // winter is genuinely cold and the Pedi sit deep in the austral south, so
    // the coldness model reaches the threshold for both. They still wear
    // nothing extra — because the evidence is tertiary (San) and belongs to a
    // people the game does not have (the Basotho blanket is not Pedi dress,
    // and "Lesotho is not Zululand"). Coldness must never imply a cloak.
    const sanWinter = coldnessAt(JULY, SAN.lat, SAN.lon, START, 1000)
    const pediWinter = coldnessAt(JULY, PEDI.lat, PEDI.lon, START, 1000)
    expect(sanWinter).toBeGreaterThan(COLD_DRESS_THRESHOLD)
    expect(pediWinter).toBeGreaterThan(COLD_DRESS_THRESHOLD)
    expect(coldCloaksFor('san', sanWinter)).toBeNull()
    expect(coldCloaksFor('pedi', pediWinter)).toBeNull()
  })

  it('the Zulu village actually reaches the threshold in its winter — model and mapping agree', () => {
    // The two halves are useless apart: a cloak nobody ever gets cold enough to
    // wear would pass every test above and never show in the game.
    const winter = coldnessAt(JULY, ZULU.lat, ZULU.lon, START, 100)
    expect(coldCloaksFor('zulu', winter)).not.toBeNull()
    const summer = coldnessAt(JANUARY, ZULU.lat, ZULU.lon, START, 100)
    expect(coldCloaksFor('zulu', summer)).toBeNull()
  })
})

describe('cloakForCloth (point 120g — the village shows a mix, deterministically)', () => {
  // The real southern palette (src/scenes/place/regionStyles.ts) — the Zulu
  // village dresses from exactly these three.
  const SOUTH_CLOTH = ['#3a5a8a', '#8a4a2a', '#c2b090']

  it('always picks a cloak from the palette', () => {
    const cloaks = coldCloaksFor('zulu', 1)!
    for (const cloth of [...SOUTH_CLOTH, 'not-in-the-palette', '']) {
      expect(cloaks).toContain(cloakForCloth(cloaks, SOUTH_CLOTH, cloth))
    }
  })

  it('is stable for the same cloth — a figure does not reshuffle its cloak per frame', () => {
    const cloaks = coldCloaksFor('zulu', 1)!
    expect(cloakForCloth(cloaks, SOUTH_CLOTH, '#3a5a8a')).toBe(
      cloakForCloth(cloaks, SOUTH_CLOTH, '#3a5a8a'),
    )
  })

  it("shows ALL of Mayr's mid-transition on the real southern palette", () => {
    // The regression this replaces: hashing the colour strings collided, two of
    // these three cloths drew the same cloak, and the greased black hide — the
    // Skin-Zulu, the most characteristic of the three — never appeared in the
    // village at all. Indexing the palette spreads them by construction.
    const cloaks = coldCloaksFor('zulu', 1)!
    const worn = new Set(SOUTH_CLOTH.map((c) => cloakForCloth(cloaks, SOUTH_CLOTH, c)))
    expect(worn.size).toBe(cloaks.length)
  })

  it('falls back to a spread rather than a default when the cloth is off-palette', () => {
    const cloaks = coldCloaksFor('zulu', 1)!
    const off = ['#111111', '#222222', '#333333', '#444444', '#555555', '#666666']
    const worn = new Set(off.map((c) => cloakForCloth(cloaks, SOUTH_CLOTH, c)))
    expect(worn.size).toBeGreaterThan(1)
  })
})
