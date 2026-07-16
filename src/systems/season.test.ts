import { describe, expect, it } from 'vitest'
import { climateZoneAt, COLD_DRESS_THRESHOLD, coldnessAt, dayOfMonthJump, dayOfYear, effectiveWetness, harmattanAt, rainAmount, seasonFogParams, skyOvercastParams, sunDimFactor, wetnessAt } from './season'
import { START_YEAR } from '../config/balance'

/** In-game day for a calendar date in the start year (the store counts from 1 Jan 1890). */
const on = (month: number, dayOfMonth: number, year = START_YEAR): number =>
  (Date.UTC(year, month - 1, dayOfMonth) - Date.UTC(START_YEAR, 0, 1)) / 86400000

const wet = (m: number, lat: number, lon: number, elev = 0) =>
  wetnessAt(on(m, 15), lat, lon, START_YEAR, elev)

// Coordinates of places the research actually names.
const CAIRO = { lat: 30.05, lon: 31.24 }
const ALEXANDRIA = { lat: 31.2, lon: 29.9 }
const KHARTOUM = { lat: 15.5, lon: 32.5 }
const TIMBUKTU = { lat: 16.77, lon: -3.01 }
const KANO = { lat: 12.0, lon: 8.5 }
const ACCRA = { lat: 5.55, lon: -0.2 }
const CONAKRY = { lat: 9.5, lon: -13.7 }
const CONGO = { lat: -1.5, lon: 21.0 }
const NAIROBI = { lat: -1.3, lon: 36.8 }
const ADDIS = { lat: 9.0, lon: 38.7, elev: 2355 } // the plateau
const DANAKIL = { lat: 13.5, lon: 40.5, elev: -100 } // below sea level, same box
const ZAMBEZI = { lat: -17.9, lon: 25.9 }
const CAPE_TOWN = { lat: -33.9, lon: 18.4 }

describe('climateZoneAt (docs/climate-1890.md §3 — regimes, not the game regions)', () => {
  it('Cairo is Saharan, not Mediterranean — the trap a bare parallel falls into', () => {
    // ~25mm/yr: functionally desert, though it sits at 30N on the "north coast".
    expect(climateZoneAt(CAIRO.lat, CAIRO.lon, 0)).not.toBe('mediterranean')
  })

  it('Alexandria IS Mediterranean, 1.2 degrees north of Cairo', () => {
    expect(climateZoneAt(ALEXANDRIA.lat, ALEXANDRIA.lon, 0)).toBe('mediterranean')
  })

  it('splits the Sahara into a winter-rain north and a summer-rain south', () => {
    expect(climateZoneAt(27, 5, 0)).toBe('sahara-north')
    expect(climateZoneAt(21, 5, 0)).toBe('sahara-south')
  })

  it('separates the Guinea coast from the Atlantic-facing west coast by LONGITUDE', () => {
    // The August break is a Gulf-of-Guinea upwelling effect; Conakry is unimodal.
    expect(climateZoneAt(ACCRA.lat, ACCRA.lon, 0)).toBe('guinea-coast')
    expect(climateZoneAt(CONAKRY.lat, CONAKRY.lon, 0)).toBe('west-coast')
  })

  it('gives the Ethiopian highlands their own calendar inside the eastern belt', () => {
    expect(climateZoneAt(ADDIS.lat, ADDIS.lon, ADDIS.elev)).toBe('ethiopian-highlands')
    expect(climateZoneAt(NAIROBI.lat, NAIROBI.lon, 0)).toBe('east-rift')
  })

  it('makes the highlands HIGH — the Danakil in the same bounds is not one', () => {
    // The rule keys on elevation, not on a box drawn round the Horn: the
    // Danakil depression lies below sea level inside those very bounds and
    // runs no kiremt at all. A lat/lon rectangle would call it highland.
    expect(climateZoneAt(DANAKIL.lat, DANAKIL.lon, DANAKIL.elev)).not.toBe('ethiopian-highlands')
    // And the same coordinate flips once it is genuinely high ground.
    expect(climateZoneAt(DANAKIL.lat, DANAKIL.lon, 2000)).toBe('ethiopian-highlands')
  })

  it('puts the Cape in its own zone, not with the plateau above it', () => {
    expect(climateZoneAt(CAPE_TOWN.lat, CAPE_TOWN.lon, 0)).toBe('cape')
    expect(climateZoneAt(ZAMBEZI.lat, ZAMBEZI.lon, 0)).toBe('southern-plateau')
  })
})

describe('wetnessAt (the findings that must survive any refactor)', () => {
  it('never rains on Cairo — June to September are absolutely rainless', () => {
    for (const m of [6, 7, 8, 9]) expect(wet(m, CAIRO.lat, CAIRO.lon)).toBe(0)
    // And the game starts there, so the whole year stays essentially dry.
    for (let m = 1; m <= 12; m++) expect(wet(m, CAIRO.lat, CAIRO.lon)).toBeLessThan(0.05)
  })

  it('does NOT rain on the Sahara in August — the naive sun-following trap', () => {
    // The rainband lags 400+ km south of the convergence line. Deep desert at
    // 25N must stay dry at the exact moment the line is at its northernmost.
    expect(wet(8, 25, 10)).toBeLessThan(0.05)
    // While the Sahel, 10 degrees south, is at its peak in the same week.
    expect(wet(8, KANO.lat, KANO.lon)).toBeGreaterThan(0.5)
  })

  it('peaks the Sahel in August and empties it by January', () => {
    expect(wet(8, KHARTOUM.lat, KHARTOUM.lon)).toBeGreaterThan(wet(1, KHARTOUM.lat, KHARTOUM.lon))
    expect(wet(1, KHARTOUM.lat, KHARTOUM.lon)).toBeLessThan(0.05)
  })

  it('shortens the Sahel season with latitude — long in the south, brief in the north', () => {
    // Both peak in August, but the northern shoulders retreat.
    const southJune = wet(6, 11.5, 5)
    const northJune = wet(6, 17.5, 5)
    expect(southJune).toBeGreaterThan(northJune)
    expect(wet(8, 11.5, 5)).toBeGreaterThan(wet(8, 17.5, 5))
  })

  it('keeps the Sahel WET — 1890 sits inside the 1870-1895 humid period', () => {
    // The modern drought image is wrong for the game's window: at its peak the
    // Sahel must read clearly wet, not marginal.
    expect(wet(8, KANO.lat, KANO.lon)).toBeGreaterThan(0.6)
    expect(wet(8, TIMBUKTU.lat, TIMBUKTU.lon)).toBeGreaterThan(0.15)
  })

  it('gives the Congo rain in EVERY month — it has no dry season at all', () => {
    for (let m = 1; m <= 12; m++) expect(wet(m, CONGO.lat, CONGO.lon)).toBeGreaterThan(0.3)
  })

  it('runs the Congo bimodally, with maxima around April and October', () => {
    expect(wet(4, CONGO.lat, CONGO.lon)).toBeGreaterThan(wet(7, CONGO.lat, CONGO.lon))
    expect(wet(10, CONGO.lat, CONGO.lon)).toBeGreaterThan(wet(7, CONGO.lat, CONGO.lon))
  })

  it('gives the Guinea coast its August break between two maxima', () => {
    const acc = (m: number) => wet(m, ACCRA.lat, ACCRA.lon)
    expect(acc(8)).toBeLessThan(acc(6)) // below the first maximum
    expect(acc(8)).toBeLessThan(acc(10)) // and below the second
    expect(acc(6)).toBeGreaterThan(0.5)
    expect(acc(10)).toBeGreaterThan(0.5)
  })

  it('leaves the west coast unimodal — no August break at Conakry', () => {
    const con = (m: number) => wet(m, CONAKRY.lat, CONAKRY.lon)
    expect(con(8)).toBeGreaterThan(con(6)) // August is the PEAK here, not a dip
    expect(con(8)).toBeGreaterThan(con(10))
  })

  it('runs East Africa bimodally: long rains MAM, short rains OND, dry between', () => {
    const nb = (m: number) => wet(m, NAIROBI.lat, NAIROBI.lon)
    expect(nb(4)).toBeGreaterThan(nb(7)) // long rains over the Jun-Sep dry
    expect(nb(11)).toBeGreaterThan(nb(7)) // short rains over it too
    expect(nb(4)).toBeGreaterThan(nb(11)) // and the long rains are the bigger
  })

  it('gives Ethiopia its kiremt peak in Jul/Aug and a bega dry Oct-Jan', () => {
    const ad = (m: number) => wet(m, ADDIS.lat, ADDIS.lon, ADDIS.elev)
    expect(ad(7)).toBeGreaterThan(ad(3)) // kiremt over belg
    expect(ad(12)).toBeLessThan(0.1) // bega
  })

  it('runs the Cape OPPOSITE to the plateau above it — the sharpest contrast', () => {
    // July: Cape wet, plateau bone dry. January: exactly reversed.
    expect(wet(7, CAPE_TOWN.lat, CAPE_TOWN.lon)).toBeGreaterThan(wet(7, ZAMBEZI.lat, ZAMBEZI.lon))
    expect(wet(1, ZAMBEZI.lat, ZAMBEZI.lon)).toBeGreaterThan(wet(1, CAPE_TOWN.lat, CAPE_TOWN.lon))
  })

  it('is smooth across the turn of the year — no seam at 31 December', () => {
    const a = wetnessAt(on(12, 31), ZAMBEZI.lat, ZAMBEZI.lon, START_YEAR, 0)
    const b = wetnessAt(on(1, 1, START_YEAR + 1), ZAMBEZI.lat, ZAMBEZI.lon, START_YEAR, 0)
    expect(Math.abs(a - b)).toBeLessThan(0.05)
  })

  it('stays in 0..1 everywhere, all year — no coordinate escapes the range', () => {
    for (let lat = -35; lat <= 37; lat += 4) {
      for (let lon = -18; lon <= 51; lon += 6) {
        for (let m = 1; m <= 12; m += 2) {
          const w = wet(m, lat, lon)
          expect(w).toBeGreaterThanOrEqual(0)
          expect(w).toBeLessThanOrEqual(1)
        }
      }
    }
  })
})

describe('effectiveWetness (the debug override is the testing tool, §21)', () => {
  it('returns the derived value when no override is set', () => {
    expect(effectiveWetness(on(8, 15), KANO.lat, KANO.lon, START_YEAR, 0, null)).toBe(
      wet(8, KANO.lat, KANO.lon),
    )
  })

  it('an override wins over the calendar, clamped to 0..1', () => {
    expect(effectiveWetness(on(8, 15), KANO.lat, KANO.lon, START_YEAR, 0, 0)).toBe(0)
    expect(effectiveWetness(on(1, 15), CAIRO.lat, CAIRO.lon, START_YEAR, 0, 1)).toBe(1)
    expect(effectiveWetness(on(1, 15), CAIRO.lat, CAIRO.lon, START_YEAR, 0, 7)).toBe(1)
    expect(effectiveWetness(on(1, 15), CAIRO.lat, CAIRO.lon, START_YEAR, 0, -3)).toBe(0)
  })
})

describe('seasonFogParams (point 120c — the wet season closes the sight lines)', () => {
  it('dry season is the identity: nothing changes', () => {
    expect(seasonFogParams(0, 1)).toEqual({ rangeFactor: 1, grayMix: 0 })
  })

  it('strength 0 disables the whole seasonal look regardless of wetness', () => {
    expect(seasonFogParams(1, 0)).toEqual({ rangeFactor: 1, grayMix: 0 })
  })

  it('full wet season pulls the fog in and grays the light', () => {
    const p = seasonFogParams(1, 1)
    expect(p.rangeFactor).toBeLessThan(1)
    expect(p.rangeFactor).toBeGreaterThan(0.5) // never claustrophobic
    expect(p.grayMix).toBeGreaterThan(0.3)
    expect(p.grayMix).toBeLessThanOrEqual(1)
  })

  it('scales monotonically with wetness', () => {
    expect(seasonFogParams(0.5, 1).rangeFactor).toBeGreaterThan(seasonFogParams(1, 1).rangeFactor)
    expect(seasonFogParams(0.5, 1).grayMix).toBeLessThan(seasonFogParams(1, 1).grayMix)
  })
})

describe('rainAmount and sunDimFactor (point 120c — the visible weather)', () => {
  it('light wet-season air stays rainless: drizzle starts only past the threshold', () => {
    expect(rainAmount(0, 1)).toBe(0)
    expect(rainAmount(0.3, 1)).toBe(0)
    expect(rainAmount(0.45, 1)).toBe(0)
    expect(rainAmount(0.7, 1)).toBeGreaterThan(0)
    expect(rainAmount(1, 1)).toBe(1)
  })

  it('strength 0 turns the rain off entirely', () => {
    expect(rainAmount(1, 0)).toBe(0)
  })

  it('the sun dims to overcast, never to night, and dry is the identity', () => {
    expect(sunDimFactor(0, 1)).toBe(1)
    expect(sunDimFactor(1, 0)).toBe(1)
    expect(sunDimFactor(1, 1)).toBeLessThan(1)
    expect(sunDimFactor(1, 1)).toBeGreaterThanOrEqual(0.55)
  })
})

describe('harmattanAt (point 137 — the West African winter dust wind)', () => {
  const START = 1890
  const JAN = 15
  const APR = 105
  const AUG = 227
  const DEC_10 = 343
  // The game's own villages, so the model is tested where it is actually read.
  const HAUSA = { lat: 12.0, lon: 8.5 }
  const BAMBARA = { lat: 13.45, lon: -6.27 }
  const TUAREG = { lat: 23.2, lon: 5.8 }
  const SOMALI = { lat: 5.5, lon: 45.0 }
  const MAASAI = { lat: -2.5, lon: 36.8 }
  const ZULU = { lat: -28.4, lon: 31.3 }

  it('blows hardest in January over the Sahel — the research names it the worst month', () => {
    expect(harmattanAt(JAN, HAUSA.lat, HAUSA.lon, START)).toBeGreaterThan(0.8)
    expect(harmattanAt(JAN, BAMBARA.lat, BAMBARA.lon, START)).toBeGreaterThan(0.8)
  })

  it('is gone in the wet season — the dust wind is a DRY-season phenomenon', () => {
    expect(harmattanAt(AUG, HAUSA.lat, HAUSA.lon, START)).toBe(0)
    expect(harmattanAt(APR, HAUSA.lat, HAUSA.lon, START)).toBe(0)
  })

  it('straddles the year end: mid-December already blows', () => {
    // The season runs late Nov - mid Mar, so a naive |doy - peak| without the
    // wrap would read December as the far side of the year and return 0.
    expect(harmattanAt(DEC_10, HAUSA.lat, HAUSA.lon, START)).toBeGreaterThan(0)
  })

  it('never reaches the south, and never the east coast', () => {
    for (const day of [JAN, APR, AUG, DEC_10]) {
      expect(harmattanAt(day, MAASAI.lat, MAASAI.lon, START)).toBe(0)
      expect(harmattanAt(day, ZULU.lat, ZULU.lon, START)).toBe(0)
      // The Horn is not West Africa — the harmattan blows toward the Gulf of
      // Guinea, not out of it.
      expect(harmattanAt(day, SOMALI.lat, SOMALI.lon, START)).toBe(0)
    }
  })

  it('fades rather than switching at the band edge', () => {
    // The deep Sahara is past the core band but not cleanly outside it.
    const tuareg = harmattanAt(JAN, TUAREG.lat, TUAREG.lon, START)
    expect(tuareg).toBeLessThan(harmattanAt(JAN, HAUSA.lat, HAUSA.lon, START))
  })

  it('stays inside 0..1 everywhere, every day of the year', () => {
    for (let day = 0; day < 365; day += 5) {
      for (const lat of [-34, -10, 0, 5, 12, 20, 31]) {
        for (const lon of [-17, -6, 8, 25, 45]) {
          const h = harmattanAt(day, lat, lon, START)
          expect(h).toBeGreaterThanOrEqual(0)
          expect(h).toBeLessThanOrEqual(1)
        }
      }
    }
  })

  it('is NOT folded into coldness: the Sahel stays warm by day under it', () => {
    // The research resolves the hot/cold contradiction as a diurnal SWING —
    // cold at dawn, hot by afternoon. A harmattan that raised `coldnessAt`
    // would dress a Hausa villager for a midday chill he does not have.
    expect(harmattanAt(JAN, HAUSA.lat, HAUSA.lon, START)).toBeGreaterThan(0.8)
    expect(coldnessAt(JAN, HAUSA.lat, HAUSA.lon, START, 486)).toBeLessThan(
      COLD_DRESS_THRESHOLD,
    )
  })
})

describe('skyOvercastParams (point 120g — the sky carries the weather)', () => {
  it('dry weather and strength 0 leave the preset sky untouched', () => {
    expect(skyOvercastParams(0, 1)).toEqual({ grayMix: 0, cloudBoost: 0 })
    expect(skyOvercastParams(1, 0)).toEqual({ grayMix: 0, cloudBoost: 0 })
  })

  it('rain grays the dome and thickens the deck, both rising with the wetness', () => {
    const half = skyOvercastParams(0.5, 1)
    const full = skyOvercastParams(1, 1)
    expect(half.grayMix).toBeGreaterThan(0)
    expect(full.grayMix).toBeGreaterThan(half.grayMix)
    expect(full.cloudBoost).toBeGreaterThan(half.cloudBoost)
  })

  it('grays the dome further than the fog, so a dimmed sun never stands under a blue sky', () => {
    expect(skyOvercastParams(1, 1).grayMix).toBeGreaterThan(seasonFogParams(1, 1).grayMix)
  })

  it('stays within the mix range at full rain — an overcast sky, not a black one', () => {
    const full = skyOvercastParams(1, 1)
    expect(full.grayMix).toBeLessThanOrEqual(1)
    expect(full.cloudBoost).toBeLessThanOrEqual(1)
  })
})

describe('dayOfMonthJump (design.md §21.1 — the month keys)', () => {
  it('lands mid-month, where the wetness curve actually reads the profile', () => {
    // The curve interpolates between month MIDPOINTS, so the 15th is the day
    // that reads a month's own value rather than a blend with its neighbour.
    const d = dayOfMonthJump(0, 8, START_YEAR)
    expect(d).toBe(on(8, 15))
    expect(wetnessAt(d, KANO.lat, KANO.lon, START_YEAR, 0)).toBeGreaterThan(0.6) // Sahel at its August peak
  })

  it('KEEPS the year — jumping a month must not end the expedition', () => {
    const inYear3 = on(6, 20, START_YEAR + 2)
    const jumped = dayOfMonthJump(inYear3, 1, START_YEAR)
    expect(jumped).toBe(on(1, 15, START_YEAR + 2))
    expect(dayOfMonthJump(inYear3, 12, START_YEAR)).toBe(on(12, 15, START_YEAR + 2))
  })

  it('walks the whole year forward in twelve steps, each in its own month', () => {
    for (let m = 1; m <= 12; m++) {
      const d = dayOfMonthJump(0, m, START_YEAR)
      expect(new Date(Date.UTC(START_YEAR, 0, 1) + d * 86400000).getUTCMonth()).toBe(m - 1)
    }
  })

  it('clamps a month outside 1..12 instead of drifting into another year', () => {
    expect(dayOfMonthJump(0, 0, START_YEAR)).toBe(on(1, 15))
    expect(dayOfMonthJump(0, 13, START_YEAR)).toBe(on(12, 15))
  })
})

describe('dayOfYear', () => {
  it('is 0 on the first day of the start year and wraps at the year turn', () => {
    expect(dayOfYear(0, START_YEAR)).toBe(0)
    expect(dayOfYear(on(12, 31), START_YEAR)).toBeGreaterThan(363)
    expect(dayOfYear(on(1, 1, START_YEAR + 1), START_YEAR)).toBe(0)
  })
})
