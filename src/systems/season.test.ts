import { describe, expect, it } from 'vitest'
import { climateZoneAt, COLD_DRESS_THRESHOLD, coldnessAt, dayOfMonthJump, dayOfYear, effectiveGreenness, effectiveWetness, floraGreennessAt, hailAt, harmattanAt, harmattanSkyParams, karifAt, nileFloodAt, okavangoFloodAt, seasonalSnowAt, rainAmount, seasonFogParams, SEASON_SLOTS, skyOvercastParams, slotWetness, sunDimFactor, wetnessAt } from './season'
import { START_YEAR } from '../config/balance'
import { inIceMassif } from '../world/terrain'

/** In-game day for a calendar date in the start year (the store counts from 1 Jan 1890). */
const on = (month: number, dayOfMonth: number, year = START_YEAR): number =>
  (Date.UTC(year, month - 1, dayOfMonth) - Date.UTC(START_YEAR, 0, 1)) / 86400000

const wet = (m: number, lat: number, lon: number, elev = 0) =>
  wetnessAt(on(m, 15), lat, lon, START_YEAR, elev)
/** wetness at a raw in-game day (for day-loop tests). */
const wet2 = (day: number, lat: number, lon: number, elev = 0) =>
  wetnessAt(day, lat, lon, START_YEAR, elev)

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
const FANG = { lat: 1.8, lon: 11.5 } // the game's Fang village — Woleu-Ntem, Gabon
const SOMALI_HAUD = { lat: 9.0, lon: 45.0 } // moved into the Haud (point 137)

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

  it('gives the Horn its own zone — east-rift stops at 6N and the rest fell through', () => {
    // Found by the village-move conflict check (point 137): moving the Somali
    // village into the Haud pushed it out of east-rift's lat < 6 and into the
    // tropical fallback, i.e. the game would have given the Horn the CONGO's
    // unimodal Jun-Sep rains.
    expect(climateZoneAt(SOMALI_HAUD.lat, SOMALI_HAUD.lon, 964)).toBe('horn')
    expect(climateZoneAt(10.3, 45.0, 10)).toBe('horn') // Berbera, the port
    // And it must not swallow its neighbours.
    expect(climateZoneAt(ADDIS.lat, ADDIS.lon, ADDIS.elev)).toBe('ethiopian-highlands')
    expect(climateZoneAt(NAIROBI.lat, NAIROBI.lon, 0)).toBe('east-rift')
  })

  it("runs the Horn on Swayne's PERIOD seasons, which the research says disagree with the modern ones", () => {
    // jilal (Jan-Mar) driest with great heat; gu (Apr-Jun) the main rains;
    // haga (Jul-Sep) hot and dry; dayr (Oct-Dec) the lesser rains.
    const h = (m: number) => wet(m, SOMALI_HAUD.lat, SOMALI_HAUD.lon, 964)
    expect(h(2)).toBeLessThan(0.05) // jilal
    expect(h(5)).toBeGreaterThan(h(11)) // gu is the MAIN rains, dayr the lesser
    expect(h(11)).toBeGreaterThan(h(8)) // dayr over haga
    expect(h(8)).toBeLessThan(0.05) // haga is dry
    // And arid throughout — the Horn is far drier than the rift beside it.
    for (let m = 1; m <= 12; m++) expect(h(m)).toBeLessThan(0.35)
  })

  it('does not send the Atlantic equator to the DESERT — the hole between two rules', () => {
    // Found by the point-137 research, not by the eye: the congo row demands
    // lon >= 12 and the guinea-coast row demands lat >= 4, so every equatorial
    // coordinate west of 12E fell through every rule to the 'sahara-north'
    // fallback. The Fang village sat in rainforest and sampled 0.000 wetness in
    // July, the peak of its own rains.
    expect(climateZoneAt(FANG.lat, FANG.lon, 642)).toBe('atlantic-equatorial')
    expect(wetnessAt(on(10, 15), FANG.lat, FANG.lon, START_YEAR, 642)).toBeGreaterThan(0.5)
  })

  it('gives Gabon its hard Jun-Sep dry season — it is NOT the no-dry-month basin', () => {
    // Woleu-Ntem is Köppen As. Kingsley, PERIOD, on this ground: the country is
    // "absolutely impassable for any human being… except during the dry season".
    const fang = (m: number) => wet(m, FANG.lat, FANG.lon, 642)
    expect(fang(7)).toBeLessThan(0.2) // the big dry
    expect(fang(10)).toBeGreaterThan(0.7) // the October peak
    expect(fang(4)).toBeGreaterThan(0.5) // the Mar-May rains
    // And the contrast that makes the zone worth having: the basin proper, at
    // the same latitude, never dries out.
    expect(wet(7, CONGO.lat, CONGO.lon)).toBeGreaterThan(fang(7))
  })

  it('never lets a tropical coordinate reach the Saharan fallback', () => {
    // The guard, stated as a test: the fallback is a DESERT profile, so any
    // tropical latitude reaching it is a bug rather than a climate.
    for (let lat = -24; lat < 18; lat += 2) {
      for (let lon = -17; lon <= 50; lon += 3) {
        expect(climateZoneAt(lat, lon, 0)).not.toBe('sahara-north')
      }
    }
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

describe('floraGreennessAt (the flora asks "how wet for HERE", not "how wet")', () => {
  const green = (m: number, lat: number, lon: number, elev = 0) =>
    floraGreennessAt(on(m, 15), lat, lon, START_YEAR, elev)

  it('greens the East African plains FULLY in the long rains — the shipped bug', () => {
    // The regression this exists for: the tint was driven by the ABSOLUTE
    // wetness, which is capped at each zone's own peak (east-rift 0.6). The
    // plains therefore reached ~8% green at the height of their own long rains
    // and read as straw all year. The Serengeti greens completely; it simply
    // does so on less water than the Congo.
    expect(green(4, NAIROBI.lat, NAIROBI.lon)).toBeGreaterThan(0.9) // long rains
    expect(green(9, NAIROBI.lat, NAIROBI.lon)).toBeLessThan(0.3) // the dry between
  })

  it('gives every wet-enough zone its full straw-to-green swing across its own year', () => {
    const swing = (lat: number, lon: number, elev = 0) => {
      let lo = 1
      let hi = 0
      for (let m = 1; m <= 12; m++) {
        const g = green(m, lat, lon, elev)
        lo = Math.min(lo, g)
        hi = Math.max(hi, g)
      }
      return hi - lo
    }
    expect(swing(KANO.lat, KANO.lon)).toBeGreaterThan(0.8) // Sahel
    expect(swing(NAIROBI.lat, NAIROBI.lon)).toBeGreaterThan(0.8) // east rift
    expect(swing(ZAMBEZI.lat, ZAMBEZI.lon)).toBeGreaterThan(0.8) // southern plateau
    expect(swing(ADDIS.lat, ADDIS.lon, ADDIS.elev)).toBeGreaterThan(0.8) // highlands
  })

  it('never greens a desert — there is no green there to bleach', () => {
    // The zone scale still gets a say, as a floor: an arid zone stays neutral
    // however sharp its own little wet peak is. Cairo must not sprout in
    // January, when sahara-north's month profile is at its maximum.
    for (let m = 1; m <= 12; m++) {
      expect(green(m, CAIRO.lat, CAIRO.lon)).toBeLessThan(0.1)
      expect(green(m, 27, 5)).toBeLessThan(0.15) // deep sahara-north, profile peak in Jan
    }
  })

  it('still tracks the calendar the absolute wetness tracks — same curve, different scale', () => {
    // The two must never drift: both read the same month profile.
    for (const [lat, lon] of [[KANO.lat, KANO.lon], [NAIROBI.lat, NAIROBI.lon]]) {
      let wetPeak = 0
      let greenPeak = 0
      let wetPeakM = 0
      let greenPeakM = 0
      for (let m = 1; m <= 12; m++) {
        if (wet(m, lat, lon) > wetPeak) { wetPeak = wet(m, lat, lon); wetPeakM = m }
        if (green(m, lat, lon) > greenPeak) { greenPeak = green(m, lat, lon); greenPeakM = m }
      }
      expect(greenPeakM).toBe(wetPeakM)
    }
  })

  it('the debug override still forces it, like the wetness', () => {
    expect(effectiveGreenness(on(1, 15), CAIRO.lat, CAIRO.lon, START_YEAR, 0, 1)).toBe(1)
    expect(effectiveGreenness(on(8, 15), KANO.lat, KANO.lon, START_YEAR, 0, 0)).toBe(0)
  })
})

describe('nileFloodAt (point 138 — the flood is remote-fed, not local rain)', () => {
  const flood = (m: number) => nileFloodAt(on(m, 15), START_YEAR)

  it('crests at Cairo in OCTOBER while Cairo itself is bone dry — the headline', () => {
    // The whole point: the water is the Ethiopian kiremt arriving weeks late, so
    // the river peaks in October at a place that never rains. A build that keyed
    // the flood on local rain would leave Cairo flat all year.
    expect(flood(10)).toBeGreaterThan(0.8)
    expect(wet(10, CAIRO.lat, CAIRO.lon)).toBe(0)
  })

  it('rises through the summer and falls back by the dry season', () => {
    expect(flood(4)).toBeLessThan(0.2) // spring: low water
    expect(flood(6)).toBeGreaterThan(flood(4)) // rising from early June
    expect(flood(10)).toBeGreaterThan(flood(8)) // the crest is October, not August
    expect(flood(1)).toBeLessThan(0.2) // back at the bed by January
  })

  it('lags the source: the highland kiremt peaks BEFORE the Cairo crest', () => {
    // August kiremt at the source, October crest at Cairo — the lag is the model.
    const kiremtAug = wet(8, ADDIS.lat, ADDIS.lon, ADDIS.elev)
    const kiremtOct = wet(10, ADDIS.lat, ADDIS.lon, ADDIS.elev)
    expect(kiremtAug).toBeGreaterThan(kiremtOct) // source already falling in October
    expect(flood(10)).toBeGreaterThan(flood(8)) // while the flood is still rising to it
  })

  it('stays inside 0..1 across the whole 1890-1895 window', () => {
    for (let day = 0; day < 365 * 6; day += 5) {
      const f = nileFloodAt(day, START_YEAR)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
  })
})

describe('okavangoFloodAt (point 139 — the delta floods in the LOCAL DRY SEASON)', () => {
  const DELTA = { lat: -19.5, lon: 22.9 } // the game's okavango landmark
  const flood = (m: number) => okavangoFloodAt(on(m, 15), START_YEAR)

  it('peaks in July-August while the delta sky is at its annual driest — the inversion, asserted so nobody "corrects" it back', () => {
    // Andersson, PERIOD: "Its annual overflow takes place in June, July, and
    // August." Livingstone, PERIOD: "this is the dry season. That the rise is
    // not caused by rains, is evident, from the water being so pure."
    expect(flood(7)).toBeGreaterThan(0.8)
    expect(wet(7, DELTA.lat, DELTA.lon)).toBeLessThan(0.1)
  })

  it('sits low when the LOCAL rains fall — water and sky move in opposition', () => {
    // November-December: Botswana's own rains begin, and the flood recedes.
    expect(flood(12)).toBeLessThan(0.25)
    expect(wet(12, DELTA.lat, DELTA.lon)).toBeGreaterThan(0.4)
  })

  it('lags the Angolan source by roughly half a year', () => {
    // The source rains peak in the austral summer; the pulse arrives mid-year.
    const sourceJan = wet(1, -12.5, 16.0, 1700)
    const sourceJul = wet(7, -12.5, 16.0, 1700)
    expect(sourceJan).toBeGreaterThan(sourceJul) // source: summer rains
    expect(flood(7)).toBeGreaterThan(flood(1)) // delta: winter flood
  })

  it('does not leak the inversion into normal rivers — the Zambezi still peaks WITH its rains', () => {
    // The inversion is the Okavango's own hydrology, not a new global rule.
    expect(wet(1, ZAMBEZI.lat, ZAMBEZI.lon)).toBeGreaterThan(wet(7, ZAMBEZI.lat, ZAMBEZI.lon))
    expect(nileFloodAt(on(10, 15), START_YEAR)).toBeGreaterThan(0.8) // and the Nile keeps October
  })

  it('stays inside 0..1 across the whole 1890-1895 window', () => {
    for (let day = 0; day < 365 * 6; day += 5) {
      const f = okavangoFloodAt(day, START_YEAR)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
    }
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

describe('karifAt (point 137 — the Horn cold that is a WIND in the HOT season)', () => {
  const START = 1890
  const JAN = 15 // jilal — "the driest season; great heat", and NOT the cold one
  const APR = 105
  const AUG = 227 // haga — Swayne's hot weather, and the karif blows
  const HAUD_M = 964 // the moved Somali village
  const GUBAN_M = 60 // the coastal lowland Swayne contrasts it with

  it('blows cold on the Haud in haga — the season the intuition calls hot', () => {
    expect(karifAt(AUG, SOMALI_HAUD.lat, SOMALI_HAUD.lon, START, HAUD_M)).toBeGreaterThan(0.9)
  })

  it('is HOT in Guban at the same moment — the gate is altitude, not latitude', () => {
    // Swayne: "It is hot in Guban, with sand-storms, but cold on the Haud and
    // other parts of the high interior." Same wind, same day, opposite result.
    expect(karifAt(AUG, 10.4, 45.0, START, GUBAN_M)).toBe(0)
  })

  it('does NOT blow in jilal — the harsh dry season is not the cold one', () => {
    expect(karifAt(JAN, SOMALI_HAUD.lat, SOMALI_HAUD.lon, START, HAUD_M)).toBe(0)
    expect(karifAt(APR, SOMALI_HAUD.lat, SOMALI_HAUD.lon, START, HAUD_M)).toBe(0)
  })

  it('stays in the Horn — it is not the harmattan and not a global wind', () => {
    for (const [lat, lon] of [[12.0, 8.5], [-2.5, 36.8], [-28.4, 31.3], [9.0, 38.7]]) {
      expect(karifAt(AUG, lat, lon, START, 2000)).toBe(0)
    }
  })

  it('is why coldnessAt could not carry it: the annual swing says July is summer', () => {
    // The two drivers must disagree here, and that disagreement is the finding.
    expect(karifAt(AUG, SOMALI_HAUD.lat, SOMALI_HAUD.lon, START, HAUD_M)).toBeGreaterThan(0.9)
    expect(coldnessAt(AUG, SOMALI_HAUD.lat, SOMALI_HAUD.lon, START, HAUD_M)).toBeLessThan(
      COLD_DRESS_THRESHOLD,
    )
  })

  it('stays inside 0..1 everywhere, every day', () => {
    for (let day = 0; day < 365; day += 5) {
      for (const lat of [0, 5, 9, 12, 16]) {
        for (const el of [0, 500, 964, 2500]) {
          const k = karifAt(day, lat, 45, START, el)
          expect(k).toBeGreaterThanOrEqual(0)
          expect(k).toBeLessThanOrEqual(1)
        }
      }
    }
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

describe('harmattanSkyParams (point 140 — the look, incl. the counter-intuitive half)', () => {
  it('is the identity with no dust, and at strength 0', () => {
    expect(harmattanSkyParams(0, 1)).toEqual({ paleMix: 0, sunRedden: 0, haloMute: 0, rangeFactor: 1 })
    expect(harmattanSkyParams(1, 0)).toEqual({ paleMix: 0, sunRedden: 0, haloMute: 0, rangeFactor: 1 })
  })

  it('whitens the sky and reddens the noon sun as the dust rises', () => {
    const half = harmattanSkyParams(0.5, 1)
    const full = harmattanSkyParams(1, 1)
    expect(full.paleMix).toBeGreaterThan(half.paleMix)
    expect(full.sunRedden).toBeGreaterThan(half.sunRedden)
  })

  it('MUTES the sunset — the trap, asserted: haloMute RISES with dust', () => {
    // Dobson 1781 / the research: "sunrises and sunsets lose their lustre;
    // haloes may disappear altogether." A build whose halo grows with the dust
    // has the phenomenon backwards.
    const p = harmattanSkyParams(1, 1)
    expect(p.haloMute).toBeGreaterThan(harmattanSkyParams(0.4, 1).haloMute)
    expect(p.haloMute).toBeGreaterThan(0.5)
    expect(p.haloMute).toBeLessThanOrEqual(1)
  })

  it('closes the sight lines harder than the rain does — thick dust, <=1km haze', () => {
    expect(harmattanSkyParams(1, 1).rangeFactor).toBeLessThan(seasonFogParams(1, 1).rangeFactor)
  })
})

describe('seasonalSnowAt + the ice massifs (point 141 — snow only where it was real)', () => {
  it('snows the High Atlas in its Nov-Apr window and bares it in summer', () => {
    expect(seasonalSnowAt(on(2, 15), 'atlas', START_YEAR)).toBeGreaterThan(0.6) // harshest Feb-Mar
    expect(seasonalSnowAt(on(12, 15), 'atlas', START_YEAR)).toBeGreaterThan(0.2) // the window opens
    expect(seasonalSnowAt(on(7, 15), 'atlas', START_YEAR)).toBe(0) // bare Jul-Aug
  })

  it('snows the Drakensberg in the austral winter and never in January', () => {
    expect(seasonalSnowAt(on(7, 15), 'drakensberg', START_YEAR)).toBeGreaterThan(0.6)
    expect(seasonalSnowAt(on(1, 15), 'drakensberg', START_YEAR)).toBe(0)
  })

  it('permanent ice sits ONLY on the three glaciated massifs — the near misses are the test', () => {
    // The three that really carried glaciers in 1890, at 8-12x today's extent:
    expect(inIceMassif(-3.07, 37.35)).toBe(true) // Kilimanjaro
    expect(inIceMassif(-0.15, 37.31)).toBe(true) // Mount Kenya
    expect(inIceMassif(0.39, 29.87)).toBe(true) // Rwenzori
    // And the four the research names as BARE, each for its own reason:
    expect(inIceMassif(1.12, 34.53)).toBe(false) // Elgon — free of glaciation, <200m short
    expect(inIceMassif(13.24, 38.37)).toBe(false) // Ras Dashen — dry when it is cold
    expect(inIceMassif(4.2, 9.17)).toBe(false) // Mount Cameroon — occasional dusting only
    expect(inIceMassif(19.87, 18.55)).toBe(false) // Emi Koussi — snow ~once in seven years
  })
})

describe('hailAt (point 141b — the only defensible white ground at low altitude)', () => {
  it('never hails where it never storms — Cairo and the deep Sahara stay clear all window', () => {
    for (let day = 0; day < 365 * 6; day += 1) {
      expect(hailAt(day, CAIRO.lat, CAIRO.lon, START_YEAR, 20)).toBe(0)
      expect(hailAt(day, 25, 10, START_YEAR, 300)).toBe(0)
    }
  })

  it('is RARE even in the wettest zone — a few days a year, not a season', () => {
    let hailDays = 0
    for (let day = 0; day < 365; day++) {
      if (hailAt(day, CONGO.lat, CONGO.lon, START_YEAR, 372) > 0) hailDays++
    }
    expect(hailDays).toBeGreaterThan(0) // it does exist
    expect(hailDays).toBeLessThan(25) // and stays an event, not weather
  })

  it('fires only inside a genuinely heavy storm', () => {
    for (let day = 0; day < 365; day++) {
      const h = hailAt(day, KANO.lat, KANO.lon, START_YEAR, 486)
      if (h > 0) {
        expect(rainAmount(wet2(day, KANO.lat, KANO.lon, 486), 1)).toBeGreaterThanOrEqual(0.6)
      }
    }
  })

  it('is deterministic — the same day and place always agree', () => {
    for (const day of [200, 210, 220]) {
      expect(hailAt(day, CONGO.lat, CONGO.lon, START_YEAR, 372)).toBe(
        hailAt(day, CONGO.lat, CONGO.lon, START_YEAR, 372),
      )
    }
  })
})

describe('slotWetness (point 167 — the season-field slot must agree with wetnessAt exactly)', () => {
  const congoSlot = SEASON_SLOTS.indexOf('congo')
  const sahelSlot = SEASON_SLOTS.indexOf('sahel')

  it('slot 0 (hyper-arid) is always 0, whatever the day', () => {
    for (const day of [on(1, 15), on(6, 15), on(10, 15)]) {
      expect(slotWetness(day, 0, START_YEAR, 0)).toBe(0)
    }
  })

  it('an out-of-range slot (99, and a negative one) is 0', () => {
    expect(slotWetness(on(8, 15), 99, START_YEAR, 0)).toBe(0)
    expect(slotWetness(on(8, 15), -1, START_YEAR, 0)).toBe(0)
  })

  it('matches wetnessAt exactly for an ordinary zone across the whole year', () => {
    for (let m = 1; m <= 12; m++) {
      const day = on(m, 15)
      expect(slotWetness(day, congoSlot, START_YEAR, CONGO.lat)).toBeCloseTo(
        wetnessAt(day, CONGO.lat, CONGO.lon, START_YEAR, 0),
        9,
      )
    }
  })

  it('applies the same Sahel latitude squeeze as wetnessAt (the peak shortens northward)', () => {
    const day = on(8, 15) // August, the Sahel's peak month
    const south = slotWetness(day, sahelSlot, START_YEAR, 12) // near 11N: near-full
    const north = slotWetness(day, sahelSlot, START_YEAR, 18) // 18N: squeezed hardest
    expect(north).toBeLessThan(south)
    // And it matches wetnessAt exactly at the same latitude (lon 5 sits in the sahel band at 15N).
    expect(slotWetness(day, sahelSlot, START_YEAR, 15)).toBeCloseTo(
      wetnessAt(day, 15, 5, START_YEAR, 0),
      9,
    )
  })
})
