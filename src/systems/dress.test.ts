import { describe, expect, it } from 'vitest'
import { cloakForCloth, coldCloaksFor, seasonalDressFor, wearsByRank } from './dress'
import { COLD_DRESS_THRESHOLD, coldnessAt, harmattanAt, karifAt } from './season'

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
    // The list SHRANK when point 137's deeper pass reached the sources — the
    // Tuareg, Hausa and San are now dressed on period evidence (see the
    // seasonalDressFor block below). These are the ones still standing bare, and
    // each for a stated reason: no period account of Sidama or Bambara/Mandinka
    // cold-season dress exists; "Lesotho is not Zululand", so the Basotho blanket
    // never reaches the Pedi (whose village sits at 853 m and has no frost
    // anyway); Thomson puts the Berber women's seasonal garments UNDERNEATH the
    // outer sheet, i.e. invisible; the Maasai answer the rains with hides on the
    // HUT; and the basin peoples have no season to dress for.
    for (const people of [
      'bambara', 'mandinka', 'sidama', 'pedi', 'berbers', 'maasai', 'baganda',
      'nubians', 'bemba', 'lunda', 'bambundu', 'mongo', 'mbuti', 'banda', 'fang',
    ]) {
      expect(seasonalDressFor(people, { coldness: 1, harmattan: 1, karif: 1 })).toBeNull()
    }
  })

  it('an unknown people is never dressed by guesswork', () => {
    expect(coldCloaksFor('not-a-people', 1)).toBeNull()
  })

  it('the near miss stays bare even where its own ground IS cold', () => {
    // The trap the research names by name: the Pedi sit deep in the austral
    // south, so the coldness model reaches the threshold for them — and they
    // still wear nothing extra, because the blanket that looks like theirs
    // belongs to a people the game does not have. Coldness must never imply a
    // cloak. (The San were the other half of this test until the deeper pass
    // found Passarge; they are now dressed, on evidence.)
    const pediWinter = coldnessAt(JULY, PEDI.lat, PEDI.lon, START, 1000)
    expect(pediWinter).toBeGreaterThan(COLD_DRESS_THRESHOLD)
    expect(seasonalDressFor('pedi', { coldness: pediWinter, harmattan: 0, karif: 0 })).toBeNull()
    // The contrast that makes the point: the San's Kalahari is cold on the same
    // day and they DO dress — because Passarge went and looked, not because
    // their ground is colder. Evidence decides, never the thermometer.
    const sanWinter = coldnessAt(JULY, SAN.lat, SAN.lon, START, 1175)
    expect(sanWinter).toBeGreaterThan(COLD_DRESS_THRESHOLD)
    expect(seasonalDressFor('san', { coldness: sanWinter, harmattan: 0, karif: 0 })).not.toBeNull()
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

describe('seasonalDressFor (point 137 — six peoples, and the rest is a finding)', () => {
  const NONE = { coldness: 0, harmattan: 0, karif: 0 }
  const ALL = { coldness: 1, harmattan: 1, karif: 1 }

  it('dresses exactly the six the record supports, and nobody else', () => {
    const dressed = [
      'zulu', 'tuareg', 'hausa', 'san', 'wayeyi', 'somali',
    ].filter((p) => seasonalDressFor(p, ALL) !== null)
    expect(dressed).toHaveLength(6)
    expect(seasonalDressFor('not-a-people', ALL)).toBeNull()
  })

  it('every one of them sheds it when its own driver rests', () => {
    for (const p of ['zulu', 'tuareg', 'hausa', 'san', 'wayeyi', 'somali']) {
      expect(seasonalDressFor(p, NONE)).toBeNull()
    }
  })

  it('keys each people to ITS OWN driver — the drivers are not interchangeable', () => {
    // The Hausa answer the harmattan, not the cold: at 12N the annual swing is
    // small and coldnessAt correctly says so, while the January dawn is real.
    expect(seasonalDressFor('hausa', { coldness: 1, harmattan: 0, karif: 0 })).toBeNull()
    expect(seasonalDressFor('hausa', { coldness: 0, harmattan: 1, karif: 0 })).not.toBeNull()
    // The Somali answer the karif — a wind in the HOT season, so coldness alone
    // must not dress them.
    expect(seasonalDressFor('somali', { coldness: 1, harmattan: 1, karif: 0 })).toBeNull()
    expect(seasonalDressFor('somali', { coldness: 0, harmattan: 0, karif: 1 })).not.toBeNull()
    // And the Zulu answer the cold, not a wind that never reaches them.
    expect(seasonalDressFor('zulu', { coldness: 0, harmattan: 1, karif: 1 })).toBeNull()
  })

  it('gates the two the sources gate: the cold is a CLASS experience', () => {
    // Barth: "Only the wealthier amongst them can afford the 'zenne'" — and his
    // schoolboys sat at a pre-dawn fire "with scarcely a rag of a shirt on".
    // His Tuareg chief ENVIED the bernus rather than owning one.
    expect(seasonalDressFor('hausa', ALL)!.rankOnly).toBe(true)
    expect(seasonalDressFor('tuareg', ALL)!.rankOnly).toBe(true)
    // The others are not gated: Mayr's isipuku is worn "by males and females".
    for (const p of ['zulu', 'san', 'wayeyi', 'somali']) {
      expect(seasonalDressFor(p, ALL)!.rankOnly).toBe(false)
    }
  })

  it('draws the Somali tobe over the HEAD and everything else over the shoulders', () => {
    // Swayne: "In cold weather the head is muffled up in it after the fashion of
    // an Algerian 'burnouse.'" It is the one head-wear case in the record.
    expect(seasonalDressFor('somali', ALL)!.wear).toBe('head')
    for (const p of ['zulu', 'tuareg', 'hausa', 'san', 'wayeyi']) {
      expect(seasonalDressFor(p, ALL)!.wear).toBe('shoulders')
    }
  })

  it('the six actually reach their thresholds where they live — model and rule agree', () => {
    // Useless apart: a rule nobody's climate ever triggers would pass every test
    // above and never show in the game. Each people at its own village, in the
    // month its own source names.
    const drivers = (day: number, lat: number, lon: number, el: number) => ({
      coldness: coldnessAt(day, lat, lon, START, el),
      harmattan: harmattanAt(day, lat, lon, START),
      karif: karifAt(day, lat, lon, START, el),
    })
    // Zulu, austral winter; Tuareg, Ahaggar at 2110 m in December; San, Kalahari
    // in July; Wayeyi in July; Hausa, Kano in the January harmattan; Somali, the
    // Haud in the August karif.
    expect(seasonalDressFor('zulu', drivers(JULY, -28.4, 31.3, 671))).not.toBeNull()
    expect(seasonalDressFor('tuareg', drivers(JANUARY, 23.2, 5.8, 2110))).not.toBeNull()
    expect(seasonalDressFor('san', drivers(JULY, -22.5, 21.0, 1175))).not.toBeNull()
    expect(seasonalDressFor('wayeyi', drivers(JULY, -19.0, 22.5, 976))).not.toBeNull()
    expect(seasonalDressFor('hausa', drivers(JANUARY, 12.0, 8.5, 486))).not.toBeNull()
    expect(seasonalDressFor('somali', drivers(227, 9.0, 45.0, 964))).not.toBeNull()
    // And each is bare in its own opposite season.
    expect(seasonalDressFor('zulu', drivers(JANUARY, -28.4, 31.3, 671))).toBeNull()
    expect(seasonalDressFor('hausa', drivers(227, 12.0, 8.5, 486))).toBeNull()
    expect(seasonalDressFor('somali', drivers(JANUARY, 9.0, 45.0, 964))).toBeNull()
  })
})

describe('wearsByRank (point 137d — the cold is a class experience)', () => {
  const SOUTH_CLOTH = ['#3a5a8a', '#8a4a2a', '#c2b090']

  it('dresses the notable and leaves the rest bare', () => {
    // Barth: "Only the wealthier amongst them can afford the 'zenne'", while his
    // schoolboys sat at a pre-dawn fire "with scarcely a rag of a shirt on".
    expect(wearsByRank(SOUTH_CLOTH[0], SOUTH_CLOTH)).toBe(true)
    expect(wearsByRank(SOUTH_CLOTH[1], SOUTH_CLOTH)).toBe(false)
    expect(wearsByRank(SOUTH_CLOTH[2], SOUTH_CLOTH)).toBe(false)
  })

  it('keeps the proportion a MINORITY — a village of plaids would erase the finding', () => {
    const worn = SOUTH_CLOTH.filter((c) => wearsByRank(c, SOUTH_CLOTH)).length
    expect(worn).toBeGreaterThan(0) // somebody has one, or the rule is invisible
    expect(worn / SOUTH_CLOTH.length).toBeLessThan(0.5)
  })

  it('is stable per figure and never dresses an off-palette stranger', () => {
    expect(wearsByRank(SOUTH_CLOTH[0], SOUTH_CLOTH)).toBe(wearsByRank(SOUTH_CLOTH[0], SOUTH_CLOTH))
    expect(wearsByRank('#123456', SOUTH_CLOTH)).toBe(false)
  })
})
