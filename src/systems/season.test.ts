import { describe, expect, it } from 'vitest'
import { advanceGroundWetness, climateZoneAt, COLD_DRESS_THRESHOLD, coldnessAt, dayOfMonthJump, dayOfYear, effectiveGreenness, effectiveWetness, fireRainFactor, floraGreennessAt, groundWetnessFactor, hailAt, harmattanAt, harmattanSkyParams, karifAt, nileFloodAt, okavangoFloodAt, seasonalSnowAt, rainAmount, seasonFogParams, SEASON_SLOTS, skyOvercastParams, slotWetness, STRIKE_FIRST_BOLT_SECONDS, STRIKE_HOLD_SECONDS, STRIKE_MIN_GAP_SECONDS, strikeSchedulerStep, sunDimFactor, thunderstormAt, thunderDelaySeconds, WET_ACCUM_DECAY_PER_SEC, WET_ACCUM_RISE_PER_SEC, wetnessAt, type ClimateZone, type StrikeSchedulerState } from './season'
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

  it('keeps the coastal Namib rainless but leaves the semi-arid interior its summer rain (point 223)', () => {
    // The Atlantic fog desert (west of the ~14E escarpment) is hyper-arid: no rain
    // in ANY month — the no-longitudinal-term model would otherwise hand it the
    // interior's summer rain.
    for (const m of [1, 3, 7, 11, 12]) expect(wet(m, -22.5, 13), `Namib coast month ${m}`).toBe(0)
    // The interior at the same band (~15E Kaokoveld) is semi-arid and DOES get
    // Nov-Mar summer rain — it must NOT be dried out with the coast.
    expect(wet(1, -18.3, 15), 'interior January').toBeGreaterThan(0)
  })

  it('extends the fog-desert gate over the Iona/Namibe coast in Angola, sparing the wet interior (point 223)', () => {
    // The northern continuation of the same Benguela-current desert (~15-17S). It
    // sat NORTH of the old gate's -17 edge, so Namibe (~15.2S, 12.2E) greened to
    // 1.0 and rained in January on ~50mm/yr desert — the exact fog-coast-reads-
    // like-its-wet-interior class the longitudinal gap creates.
    for (const m of [1, 3, 7, 11, 12]) expect(wet(m, -15.2, 12.2), `Namibe coast month ${m}`).toBe(0)
    expect(wet(1, -16, 12.5), 'Iona desert January').toBe(0)
    // The named neighbour that must NOT be dried: the Angolan plateau just inland
    // (~15S, 15E) keeps its Nov-Mar summer rain — the escarpment, not the coast.
    expect(wet(1, -15, 15), 'Angolan plateau January').toBeGreaterThan(0.3)
    // And the Okavango's own Angolan source (the flood feeder) is untouched.
    expect(wet(1, -12.5, 16), 'Okavango source January').toBeGreaterThan(0.3)
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

describe('weather x terrain plausibility sweep (point 223 — every settlement in a real regime)', () => {
  // Every port and village heartland (src/world/geo.ts) at its real ~1890
  // position, with an approximate real elevation (the DEM's value in game), the
  // zone the model must place it in, and the calendar class its rainfall must
  // obey. This is the repeatable audit: a settlement drifting into an
  // implausible zone, or a desert sprouting a wet season, fails here.
  type Regime = 'desert' | 'winter-rain' | 'summer-rain' | 'sahel' | 'arid-bimodal'
    | 'guinea-bimodal' | 'equatorial-hard-dry' | 'rainforest' | 'unimodal-summer'
    | 'east-bimodal' | 'kiremt'
  const SETTLEMENTS: Array<{ id: string; lat: number; lon: number; elev: number; zone: ClimateZone; regime: Regime }> = [
    // Ports
    { id: 'cairo', lat: 30.05, lon: 31.55, elev: 20, zone: 'sahara-north', regime: 'desert' },
    { id: 'tangier', lat: 35.6, lon: -5.75, elev: 20, zone: 'mediterranean', regime: 'winter-rain' },
    { id: 'khartoum', lat: 15.5, lon: 32.15, elev: 380, zone: 'sahel', regime: 'sahel' },
    { id: 'st-louis', lat: 15.9, lon: -16.2, elev: 4, zone: 'sahel', regime: 'sahel' },
    { id: 'timbuktu', lat: 16.95, lon: -3.0, elev: 260, zone: 'sahel', regime: 'sahel' },
    { id: 'lagos', lat: 6.55, lon: 3.4, elev: 40, zone: 'guinea-coast', regime: 'guinea-bimodal' },
    { id: 'boma', lat: -5.53, lon: 13.05, elev: 10, zone: 'southern-plateau', regime: 'summer-rain' },
    { id: 'berbera', lat: 10.3, lon: 45.0, elev: 10, zone: 'horn', regime: 'arid-bimodal' },
    { id: 'zanzibar', lat: -6.16, lon: 39.3, elev: 15, zone: 'east-rift', regime: 'east-bimodal' },
    { id: 'capetown', lat: -33.8, lon: 18.5, elev: 30, zone: 'cape', regime: 'winter-rain' },
    // Villages (heartland anchors)
    { id: 'tuareg', lat: 23.2, lon: 5.8, elev: 1400, zone: 'sahara-south', regime: 'desert' },
    { id: 'berber', lat: 31.7, lon: -7.2, elev: 1000, zone: 'mediterranean', regime: 'winter-rain' },
    { id: 'nubian', lat: 21.8, lon: 31.6, elev: 200, zone: 'sahara-south', regime: 'desert' },
    { id: 'bambara', lat: 13.45, lon: -6.27, elev: 300, zone: 'sahel', regime: 'sahel' },
    { id: 'hausa', lat: 12.0, lon: 8.5, elev: 480, zone: 'sahel', regime: 'sahel' },
    { id: 'mandinka', lat: 11.5, lon: -9.0, elev: 350, zone: 'sahel', regime: 'sahel' },
    { id: 'fang', lat: 1.8, lon: 11.5, elev: 642, zone: 'atlantic-equatorial', regime: 'equatorial-hard-dry' },
    { id: 'mongo', lat: -1.5, lon: 21.0, elev: 350, zone: 'congo', regime: 'rainforest' },
    { id: 'mbuti', lat: 1.4, lon: 28.6, elev: 800, zone: 'congo', regime: 'rainforest' },
    { id: 'banda', lat: 6.0, lon: 21.5, elev: 500, zone: 'congo-north', regime: 'unimodal-summer' },
    { id: 'bambundu', lat: -9.3, lon: 15.3, elev: 1100, zone: 'southern-plateau', regime: 'summer-rain' },
    { id: 'lunda', lat: -10.0, lon: 23.4, elev: 1000, zone: 'southern-plateau', regime: 'summer-rain' },
    { id: 'maasai', lat: -2.5, lon: 36.8, elev: 1500, zone: 'east-rift', regime: 'east-bimodal' },
    { id: 'swahili', lat: -2.4, lon: 40.6, elev: 15, zone: 'east-rift', regime: 'east-bimodal' },
    { id: 'somali', lat: 9.0, lon: 45.0, elev: 964, zone: 'horn', regime: 'arid-bimodal' },
    { id: 'sidama', lat: 6.7, lon: 38.4, elev: 1700, zone: 'ethiopian-highlands', regime: 'kiremt' },
    { id: 'baganda', lat: 0.75, lon: 32.55, elev: 1200, zone: 'east-rift', regime: 'east-bimodal' },
    { id: 'wayeyi', lat: -19.0, lon: 22.5, elev: 950, zone: 'southern-plateau', regime: 'summer-rain' },
    { id: 'bemba', lat: -12.5, lon: 31.0, elev: 1400, zone: 'southern-plateau', regime: 'summer-rain' },
    { id: 'pedi', lat: -24.5, lon: 29.5, elev: 1100, zone: 'southern-plateau', regime: 'summer-rain' },
    { id: 'zulu', lat: -28.4, lon: 31.3, elev: 100, zone: 'southern-plateau', regime: 'summer-rain' },
    { id: 'san', lat: -22.5, lon: 21.0, elev: 1000, zone: 'southern-plateau', regime: 'summer-rain' },
  ]

  /** Monthly wetness (mid-month) for a settlement, index 1..12. */
  const curve = (s: { lat: number; lon: number; elev: number }) =>
    Array.from({ length: 12 }, (_, i) => wet(i + 1, s.lat, s.lon, s.elev))
  const peakMonth = (c: number[]) => c.indexOf(Math.max(...c)) + 1

  it('places every settlement in its expected climate zone', () => {
    for (const s of SETTLEMENTS) {
      expect(climateZoneAt(s.lat, s.lon, s.elev), s.id).toBe(s.zone)
    }
  })

  it('gives every settlement a wet/dry calendar plausible for its terrain', () => {
    for (const s of SETTLEMENTS) {
      const c = curve(s) // 0-indexed month m is c[m-1]
      const max = Math.max(...c)
      const min = Math.min(...c)
      const peak = peakMonth(c)
      const rainy = (m: number) => rainAmount(c[m - 1], 1)
      switch (s.regime) {
        case 'desert':
          // A desert renders NO wet-season rain in ANY month — the headline bound.
          expect(max, `${s.id} desert peak`).toBeLessThan(0.1)
          for (let m = 1; m <= 12; m++) expect(rainy(m), `${s.id} desert rain m${m}`).toBe(0)
          break
        case 'winter-rain':
          // Mediterranean / Cape: wet in the local winter, dry in the local summer.
          if (s.lat > 0) {
            expect(c[6], `${s.id} Jul`).toBeLessThan(0.1) // northern summer dry
            expect([12, 1, 2].includes(peak), `${s.id} winter peak (got m${peak})`).toBe(true)
          } else {
            expect(c[0], `${s.id} Jan`).toBeLessThan(0.2) // austral summer dry
            expect(c[6], `${s.id} Jul`).toBeGreaterThan(c[0]) // winter wetter than summer
          }
          break
        case 'sahel':
          // One summer wet season peaking August, bone dry in January.
          expect([7, 8].includes(peak), `${s.id} sahel peak (got m${peak})`).toBe(true)
          expect(c[0], `${s.id} Jan`).toBeLessThan(0.05)
          break
        case 'summer-rain':
          // Southern-plateau: peak in the austral summer (Nov-Mar), dry Jun-Aug.
          expect([11, 12, 1, 2].includes(peak), `${s.id} summer peak (got m${peak})`).toBe(true)
          expect(c[6], `${s.id} Jul`).toBeLessThan(0.1)
          break
        case 'arid-bimodal':
          // The Horn: arid throughout, never a real wet season, but not bone dry.
          expect(max, `${s.id} horn peak`).toBeLessThan(0.35)
          for (let m = 1; m <= 12; m++) expect(rainy(m), `${s.id} horn rain m${m}`).toBe(0)
          break
        case 'guinea-bimodal':
          // Two maxima with the August "little dry season" between them.
          expect(c[7], `${s.id} Aug break`).toBeLessThan(c[5]) // below June
          expect(c[7], `${s.id} Aug break`).toBeLessThan(c[9]) // below October
          break
        case 'equatorial-hard-dry':
          // Gabon (Köppen As): a HARD Jun-Sep dry despite being rainforest-wet.
          expect(c[6], `${s.id} Jul dry`).toBeLessThan(0.2)
          expect(c[9], `${s.id} Oct peak`).toBeGreaterThan(0.7)
          break
        case 'rainforest':
          // The Congo has NO dry month — every month stays genuinely wet.
          expect(min, `${s.id} rainforest min`).toBeGreaterThan(0.3)
          break
        case 'unimodal-summer':
          // Congo-north: one wet season peaking mid-year, dry Jan-Mar.
          expect([6, 7, 8].includes(peak), `${s.id} unimodal peak (got m${peak})`).toBe(true)
          expect(c[0], `${s.id} Jan`).toBeLessThan(0.1)
          break
        case 'east-bimodal':
          // Long rains MAM (the bigger) + short rains OND, dry Jun-Sep between.
          expect(c[3], `${s.id} Apr`).toBeGreaterThan(c[6]) // long rains over the dry
          expect(c[10], `${s.id} Nov`).toBeGreaterThan(c[6]) // short rains over it too
          break
        case 'kiremt':
          // Ethiopian highlands: kiremt peak Jul-Aug, bega dry Dec.
          expect([7, 8].includes(peak), `${s.id} kiremt peak (got m${peak})`).toBe(true)
          expect(c[11], `${s.id} Dec bega`).toBeLessThan(0.1)
          break
      }
    }
  })

  it('never sprouts flora on a true desert settlement, and fully greens a wet-season one', () => {
    const greenPeak = (s: { lat: number; lon: number; elev: number }) => {
      let g = 0
      for (let m = 1; m <= 12; m++) g = Math.max(g, floraGreennessAt(on(m, 15), s.lat, s.lon, START_YEAR, s.elev))
      return g
    }
    for (const s of SETTLEMENTS) {
      if (s.regime === 'desert') expect(greenPeak(s), `${s.id} desert stays bare`).toBeLessThan(0.15)
      if (s.regime === 'sahel' || s.regime === 'summer-rain' || s.regime === 'rainforest') {
        expect(greenPeak(s), `${s.id} greens in its rains`).toBeGreaterThan(0.8)
      }
    }
  })

  it('leaves no west-facing arid coast a wet-season rain (the longitudinal-gap class, point 223)', () => {
    // A latitude/longitude grid over the Benguela-current fog deserts: the whole
    // Namib (Orange to the Angola border) AND its Iona/Namibe continuation must
    // read bone dry in every month — the class the no-longitudinal-term model
    // mis-rains. Each cell here is a coastal desert strip west of the escarpment.
    const coastalDesertCells: Array<[number, number]> = []
    for (let lat = -26; lat <= -15; lat += 1) coastalDesertCells.push([lat, 12], [lat, 13])
    for (const [lat, lon] of coastalDesertCells) {
      for (let m = 1; m <= 12; m++) {
        expect(wet(m, lat, lon), `coastal desert ${lat},${lon} m${m}`).toBe(0)
      }
    }
    // …while one step inland (the escarpment/plateau) keeps its real summer rain.
    expect(wet(1, -20, 16), 'Namibian interior January').toBeGreaterThan(0)
    expect(wet(1, -15, 15), 'Angolan plateau January').toBeGreaterThan(0.3)
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

describe('fireRainFactor (point 256 — the cook-shelter keeps the fire alight in rain)', () => {
  const shelteredDamp = 0.25
  const openDamp = 0.7

  it('is 1 when dry, for both a sheltered and an open fire', () => {
    expect(fireRainFactor(0, true, shelteredDamp, openDamp)).toBe(1)
    expect(fireRainFactor(0, false, shelteredDamp, openDamp)).toBe(1)
  })

  it('damps the OPEN flame as rain rises (an unsheltered fire is drowned toward embers)', () => {
    const dry = fireRainFactor(0, false, shelteredDamp, openDamp)
    const light = fireRainFactor(0.5, false, shelteredDamp, openDamp)
    const heavy = fireRainFactor(1, false, shelteredDamp, openDamp)
    expect(light).toBeLessThan(dry)
    expect(heavy).toBeLessThan(light)
    expect(heavy).toBeCloseTo(1 - openDamp, 6)
  })

  it('keeps the SHELTERED flame near full however hard it rains (it burns on)', () => {
    const heavy = fireRainFactor(1, true, shelteredDamp, openDamp)
    // Only a small steamy dip at full downpour — well above half.
    expect(heavy).toBeGreaterThan(0.5)
    expect(heavy).toBeCloseTo(1 - shelteredDamp, 6)
  })

  it('a sheltered fire always burns brighter than an open one in the same rain', () => {
    for (const rain of [0.3, 0.6, 1]) {
      expect(fireRainFactor(rain, true, shelteredDamp, openDamp)).toBeGreaterThan(
        fireRainFactor(rain, false, shelteredDamp, openDamp),
      )
    }
  })

  it('clamps its inputs and never returns a negative factor', () => {
    expect(fireRainFactor(-1, false, shelteredDamp, openDamp)).toBe(1) // rain clamped to 0
    expect(fireRainFactor(2, false, shelteredDamp, openDamp)).toBeCloseTo(1 - openDamp, 6) // rain clamped to 1
    expect(fireRainFactor(1, false, 0, 2)).toBe(0) // damping clamped, floored at 0
  })
})

describe('groundWetnessFactor (point 225 — the ground wets with intensity AND duration)', () => {
  it('is 0 when dry: no rain and no accumulated soak', () => {
    expect(groundWetnessFactor(0, 0, 1)).toBe(0)
  })

  it('rises with the rain INTENSITY (accumulation held constant)', () => {
    const a = 0.2
    expect(groundWetnessFactor(0.6, a, 1)).toBeGreaterThan(groundWetnessFactor(0.2, a, 1))
    expect(groundWetnessFactor(0.2, a, 1)).toBeGreaterThan(groundWetnessFactor(0, a, 1))
  })

  it('rises with the accumulated DURATION (intensity held constant)', () => {
    const r = 0.3
    expect(groundWetnessFactor(r, 0.8, 1)).toBeGreaterThan(groundWetnessFactor(r, 0.3, 1))
    expect(groundWetnessFactor(r, 0.3, 1)).toBeGreaterThan(groundWetnessFactor(r, 0, 1))
  })

  it('clamps at 1 however hard and long it rains', () => {
    expect(groundWetnessFactor(1, 1, 1)).toBe(1)
    expect(groundWetnessFactor(1, 1, 5)).toBe(1)
  })

  it('the strength scale turns the wet look off (0) and never goes negative', () => {
    expect(groundWetnessFactor(1, 1, 0)).toBe(0)
    expect(groundWetnessFactor(0.5, 0.5, 0)).toBe(0)
  })
})

describe('advanceGroundWetness (point 225 — the leaky-integrator soak)', () => {
  it('rises while it rains and decays when dry', () => {
    const wetter = advanceGroundWetness(0.3, 1, 1)
    expect(wetter).toBeGreaterThan(0.3)
    expect(wetter).toBeCloseTo(0.3 + WET_ACCUM_RISE_PER_SEC, 6)
    const drier = advanceGroundWetness(0.3, 0, 1)
    expect(drier).toBeLessThan(0.3)
    expect(drier).toBeCloseTo(0.3 - WET_ACCUM_DECAY_PER_SEC, 6)
  })

  it('scales the rise with the rain amount (lighter rain soaks slower)', () => {
    expect(advanceGroundWetness(0, 1, 1)).toBeGreaterThan(advanceGroundWetness(0, 0.4, 1))
  })

  it('stays clamped 0..1', () => {
    expect(advanceGroundWetness(1, 1, 10)).toBe(1)
    expect(advanceGroundWetness(0, 0, 10)).toBe(0)
    expect(advanceGroundWetness(0.01, 0, 10)).toBe(0)
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

describe('thunderstormAt (point 166 — lightning+thunder only in a heavy storm)', () => {
  it('never thunders where it never storms — Cairo and the deep Sahara stay clear all window', () => {
    for (let day = 0; day < 365 * 6; day += 1) {
      expect(thunderstormAt(day, CAIRO.lat, CAIRO.lon, START_YEAR, 20)).toBe(0)
      expect(thunderstormAt(day, 25, 10, START_YEAR, 300)).toBe(0)
    }
  })

  it('fires only inside a genuinely heavy storm, and stays a minority of days', () => {
    let stormDays = 0
    for (let day = 0; day < 365; day++) {
      const t = thunderstormAt(day, CONGO.lat, CONGO.lon, START_YEAR, 372)
      if (t > 0) {
        stormDays++
        expect(rainAmount(wet2(day, CONGO.lat, CONGO.lon, 372), 1)).toBeGreaterThanOrEqual(0.6)
      }
    }
    expect(stormDays).toBeGreaterThan(0) // it does happen in the wettest zone
    expect(stormDays).toBeLessThan(200) // but never every day — a minority of the year
  })

  it('is more frequent than hail in the same wet zone (thunder rides most heavy rain)', () => {
    let thunder = 0
    let hail = 0
    for (let day = 0; day < 365 * 2; day++) {
      if (thunderstormAt(day, CONGO.lat, CONGO.lon, START_YEAR, 372) > 0) thunder++
      if (hailAt(day, CONGO.lat, CONGO.lon, START_YEAR, 372) > 0) hail++
    }
    expect(thunder).toBeGreaterThan(hail)
  })

  it('is deterministic — the same day and place always agree', () => {
    for (const day of [200, 210, 220]) {
      expect(thunderstormAt(day, CONGO.lat, CONGO.lon, START_YEAR, 372)).toBe(
        thunderstormAt(day, CONGO.lat, CONGO.lon, START_YEAR, 372),
      )
    }
  })
})

describe('thunderDelaySeconds (point 166 — the flash-to-thunder lag)', () => {
  it('always lands in the distance-plausible 1–4 s band', () => {
    for (let i = 0; i < 500; i++) {
      const d = thunderDelaySeconds(i)
      expect(d).toBeGreaterThanOrEqual(1)
      expect(d).toBeLessThanOrEqual(4)
    }
  })

  it('is deterministic per strike but varies across strikes', () => {
    expect(thunderDelaySeconds(7)).toBe(thunderDelaySeconds(7))
    const spread = new Set([0, 1, 2, 3, 4, 5, 6, 7].map((i) => thunderDelaySeconds(i).toFixed(2)))
    expect(spread.size).toBeGreaterThan(4) // not a constant
  })
})

describe('strikeSchedulerStep (point 166 — every flash re-fires, across the whole storm)', () => {
  const fresh = (): StrikeSchedulerState => ({ nextAt: 0, count: 0, lastOpenAt: 0 })
  const DT = 1 / 60

  /** Drive the scheduler for `seconds`, calling `gate(t)` for the storm strength. */
  const run = (state: StrikeSchedulerState, seconds: number, gate: (t: number) => number, from = 0) => {
    const fires: Array<{ t: number; delay: number }> = []
    for (let t = from; t < from + seconds; t += DT) {
      const d = strikeSchedulerStep(state, gate(t), t)
      if (d !== null) fires.push({ t, delay: d })
    }
    return fires
  }

  it('fires the first bolt after the arm-up, then a SECOND, then N more — never one-shot', () => {
    const state = fresh()
    const fires = run(state, 120, () => 0.8)
    expect(fires.length).toBeGreaterThanOrEqual(8) // many bolts across 2 min, not one
    expect(fires[0].t).toBeCloseTo(STRIKE_FIRST_BOLT_SECONDS, 1)
    for (const f of fires) {
      expect(f.delay).toBeGreaterThanOrEqual(1) // each bolt carries its 1-4 s thunder lag
      expect(f.delay).toBeLessThanOrEqual(4)
    }
    // The trigger re-arms per flash: every successive gap sits in the 4-13 s band.
    for (let i = 1; i < fires.length; i++) {
      const gap = fires[i].t - fires[i - 1].t
      expect(gap).toBeGreaterThanOrEqual(STRIKE_MIN_GAP_SECONDS - DT)
      expect(gap).toBeLessThanOrEqual(13 + DT)
    }
    // And the delay seed advances — the bolts are not one repeated clap.
    expect(new Set(fires.slice(0, 8).map((f) => f.delay.toFixed(3))).size).toBeGreaterThan(4)
  })

  it('survives the travel gate flicker — the regression that made thunder fire at most once', () => {
    // While DRIVING, the per-day/per-cell re-roll flickers the gate roughly
    // every second (day ticks ~1.1/s at travel speed, THUNDERSTORM_CHANCE 0.35).
    // Model that: 0.9 s open, 1.8 s closed, repeating — one continuous rain belt.
    const flicker = (t: number) => (t % 2.7 < 0.9 ? 0.7 : 0)
    // The OLD scheduler (reset to unarmed on the first closed frame) never got
    // past its 2 s arm-up here — zero bolts, ever. The witness:
    const old = { nextAt: 0, count: 0 }
    for (let t = 0; t < 120; t += DT) {
      const s = flicker(t)
      if (s > 0) {
        if (old.nextAt === 0) old.nextAt = t + STRIKE_FIRST_BOLT_SECONDS
        if (t >= old.nextAt) old.count++
      } else {
        old.nextAt = 0
      }
    }
    expect(old.count).toBe(0) // the reported defect: thunder starved while moving
    // The held scheduler keeps firing through the same flicker.
    const state = fresh()
    const fires = run(state, 120, flicker)
    expect(fires.length).toBeGreaterThanOrEqual(5)
    // …and every bolt still fires ON an open-gate frame (no clear-sky thunder).
    for (const f of fires) expect(flicker(f.t)).toBeGreaterThan(0)
  })

  it('never fires while the gate is closed', () => {
    const state = fresh()
    expect(run(state, 60, () => 0).length).toBe(0)
    expect(state.nextAt).toBe(0) // nothing armed by a clear sky
  })

  it('disarms only after a full hold window without the storm, then re-arms fresh', () => {
    const state = fresh()
    const first = run(state, 10, () => 0.8)
    expect(first.length).toBeGreaterThanOrEqual(1)
    // A short off spell (well under the hold) keeps the schedule armed…
    run(state, 5, () => 0, 10)
    expect(state.nextAt).not.toBe(0)
    // …a spell past STRIKE_HOLD_SECONDS disarms it…
    run(state, STRIKE_HOLD_SECONDS + 2, () => 0, 15)
    expect(state.nextAt).toBe(0)
    // …and the NEXT storm starts over with the fresh arm-up, then keeps firing.
    const from = 15 + STRIKE_HOLD_SECONDS + 2
    const again = run(state, 30, () => 0.8, from)
    expect(again.length).toBeGreaterThanOrEqual(2) // re-fires in the new storm too
    expect(again[0].t - from).toBeCloseTo(STRIKE_FIRST_BOLT_SECONDS, 1)
  })

  it('is deterministic over the state — a replay agrees bolt for bolt', () => {
    const a = run(fresh(), 60, () => 0.9)
    const b = run(fresh(), 60, () => 0.9)
    expect(a).toEqual(b)
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
