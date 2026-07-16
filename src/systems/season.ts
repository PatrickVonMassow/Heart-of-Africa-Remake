// Seasons and region-typical weather (design.md §19, TASKS point 120).
//
// Derives the season from the in-game date and the PLACE — latitude and
// longitude, not the game's five regions. That is deliberate: `regionAt()`
// bands the continent for gameplay, but each of its regions spans many degrees
// of latitude and several rainfall regimes. The north region alone holds the
// Mediterranean winter rain, the hyper-arid Sahara and the Sahel's summer
// monsoon; keying the weather to it would be wrong three times over.
//
// The month profiles below come from `docs/climate-1890.md`, which sources them
// and marks where a modern normal is being applied backwards to 1890. Three
// findings from that research shape this module and must not be "simplified"
// away:
//
//  * Do NOT derive rain from the convergence line's latitude. The rainband lags
//    400+ km SOUTH of it, so a naive sun-following model rains on the Sahara
//    every August. The profiles here encode the rain, not the convergence.
//  * East Africa is not derivable from that sweep at all (Nicholson 2018 holds
//    the classic explanation "not tenable"), so its bimodal calendar is stated
//    outright rather than computed.
//  * The Sahel around 1890 was WET — the game's window sits inside the
//    1870-1895 humid period. Its dry-season floor is therefore lifted, not the
//    modern drought image.

/**
 * Rainfall regimes across the game world. These are climate zones, NOT the
 * game's RegionId — see the module comment.
 */
export type ClimateZone =
  | 'mediterranean' // north coast: winter rain, dry summer
  | 'sahara-north' // ~25-31N: sparse WINTER rain (Mediterranean cyclones)
  | 'sahara-south' // ~18-25N: sparse SUMMER rain (the rainband's far edge)
  | 'sahel' // ~11-18N: one summer wet season, length graded by latitude
  | 'guinea-coast' // ~4-10N, ~6W-2E: bimodal, with the August "little dry season"
  | 'west-coast' // ~4-10N, west of ~10W: UNIMODAL, not the Guinea regime
  | 'congo' // ~5S-5N: rain every month, two maxima
  | 'congo-north' // north of the basin's equatorial belt: unimodal
  | 'atlantic-equatorial' // Gabon/south Cameroon: equatorial but with a hard Jun-Sep dry
  | 'ethiopian-highlands' // kiremt + belg
  | 'east-rift' // bimodal: long rains MAM, short rains OND
  | 'horn' // Somalia/Ogaden: bimodal but ARID — Swayne's period four seasons
  | 'southern-plateau' // ~12-25S: summer rain
  | 'cape' // south of ~30S: winter rain — OPPOSITE to the rest of the south

/**
 * Relative rainfall by month (index 0 = January), 0 = effectively rainless,
 * 1 = the zone's own peak. These are SHAPES, not millimetres: a Saharan 1 is a
 * trace and a Congo 1 is a downpour. Absolute wetness comes from `zoneWetness`.
 */
const MONTH_PROFILE: Record<ClimateZone, readonly number[]> = {
  // Nov-Mar core, Jun-Aug bone dry (Algiers ~600mm, Alexandria 235mm).
  mediterranean: [1, 0.85, 0.6, 0.35, 0.15, 0.02, 0, 0.02, 0.2, 0.5, 0.9, 1],
  // Winter regime, and even at its "peak" this is a trace.
  'sahara-north': [1, 0.9, 0.7, 0.4, 0.15, 0.05, 0, 0, 0.05, 0.3, 0.6, 0.9],
  // Summer regime: the rainband's far northern edge, Jul-Sep only.
  'sahara-south': [0, 0, 0, 0, 0.05, 0.2, 0.7, 1, 0.5, 0.05, 0, 0],
  // ~90% of the rain falls Jun-Sep, peaking August; harvest October.
  sahel: [0, 0, 0, 0.02, 0.12, 0.45, 0.85, 1, 0.7, 0.15, 0.01, 0],
  // Two maxima (Jun, Oct) with the upwelling-driven August break between them.
  'guinea-coast': [0.08, 0.15, 0.4, 0.7, 0.9, 1, 0.75, 0.45, 0.8, 0.95, 0.5, 0.15],
  // Unimodal Apr/May-Oct/Nov — the country Guinea is NOT the Guinea regime.
  'west-coast': [0.02, 0.03, 0.1, 0.35, 0.6, 0.85, 1, 1, 0.9, 0.6, 0.2, 0.05],
  // Bimodal Mar-May + Sep-Nov, and NO dry month at all.
  congo: [0.5, 0.55, 0.85, 1, 0.8, 0.45, 0.4, 0.55, 0.85, 1, 0.9, 0.6],
  // North of the equatorial belt the basin is unimodal, dry Jan-Mar.
  'congo-north': [0.05, 0.08, 0.2, 0.5, 0.75, 0.9, 1, 0.95, 0.8, 0.5, 0.2, 0.08],
  // Köppen As: rains Mar-May and Sep-Nov (peak October), a HARD big dry season
  // Jun-Sep and a small dry Dec-Feb. Kingsley on this ground, PERIOD: the
  // country is "absolutely impassable… except during the dry season".
  'atlantic-equatorial': [0.15, 0.25, 0.6, 0.85, 0.8, 0.15, 0.05, 0.1, 0.5, 1, 0.9, 0.3],
  // belg Feb-May (minor), kiremt Jun-Sep (65-95% of the annual total), bega dry.
  'ethiopian-highlands': [0.05, 0.2, 0.4, 0.45, 0.35, 0.6, 1, 0.95, 0.55, 0.1, 0.05, 0.03],
  // Long rains Mar-May (peak Apr), short rains Oct-Dec (peak Nov).
  'east-rift': [0.15, 0.15, 0.6, 1, 0.7, 0.15, 0.1, 0.1, 0.2, 0.6, 0.85, 0.5],
  // Swayne's PERIOD four seasons (1895, fieldwork 1885-93 — the game's own
  // decade), which docs/peoples-1890.md §7.1 records as DISAGREEING with the
  // modern calendar; the period table wins: jilal (Jan-Mar/Apr) the driest with
  // great heat, gu (Apr-Jun) the main rains, haga (Jul-Sep) hot and dry with the
  // karif wind, dayr (Oct-Dec) the lesser rains.
  horn: [0.02, 0.02, 0.08, 0.6, 1, 0.45, 0.06, 0.05, 0.12, 0.55, 0.8, 0.25],
  // Summer rain Nov-Mar, peak Jan-Feb; bone dry Jun-Aug.
  'southern-plateau': [1, 0.95, 0.7, 0.3, 0.1, 0.03, 0.02, 0.03, 0.1, 0.4, 0.8, 0.95],
  // Winter rain Apr-Oct — the inverse of the plateau above it.
  cape: [0.1, 0.12, 0.3, 0.6, 0.85, 1, 1, 0.85, 0.6, 0.4, 0.15, 0.1],
}

/**
 * How wet each zone is at its own peak, 0..1 — the scale the shapes above are
 * measured against, so a Saharan peak cannot read like a Congo one.
 */
const ZONE_WETNESS: Record<ClimateZone, number> = {
  mediterranean: 0.5,
  'sahara-north': 0.04, // ~31% of the Sahara gets <=10mm/yr; this is a trace
  'sahara-south': 0.06,
  sahel: 0.75, // lifted: 1890 sits in the 1870-1895 humid period
  'guinea-coast': 0.85,
  'west-coast': 1, // up to 4000mm/yr
  congo: 0.95,
  'congo-north': 0.85,
  'atlantic-equatorial': 0.9, // Gabon is very wet in its rains (~1800-3000mm/yr)
  'ethiopian-highlands': 0.7,
  'east-rift': 0.6,
  horn: 0.3, // arid: the Horn is far drier than the rift it borders
  'southern-plateau': 0.65,
  cape: 0.5,
}

/** Cairo and the eastern Libyan Desert: rainless enough that any rain is wrong. */
function isHyperArid(lat: number, lon: number): boolean {
  // The eastern Sahara (Libyan Desert) averages ~0.5mm/yr — rainless for years.
  return lat >= 22 && lat <= 31 && lon >= 22 && lon <= 33
}

/** Metres above which the Horn's terrain runs the kiremt/belg calendar. */
export const HIGHLAND_ELEVATION_M = 1500

/**
 * The climate zone at a place (design.md §19; `docs/climate-1890.md` §3).
 *
 * `elevationM` is required rather than sampled here, and rather than defaulted:
 * the module stays pure (the DEM is loaded async and `elevationAt` returns a
 * silent 0 before it is), and a default would let the highland rule pass tests
 * while never firing in the game.
 *
 * Note the Mediterranean gate: a bare parallel is wrong in BOTH directions.
 * Cairo (30.05N) is functionally Saharan at ~25mm/yr while Alexandria (31.2N)
 * is genuinely Mediterranean at 235mm — a 10x gradient across ~1.2 degrees. So
 * the coast itself, not just the latitude, has to qualify.
 */
export function climateZoneAt(lat: number, lon: number, elevationM: number): ClimateZone {
  if (lat <= -30) return 'cape'
  if (lat <= -12) return 'southern-plateau'
  // The Ethiopian highlands run their own calendar — but they are HIGHLANDS,
  // defined by elevation, not by a box drawn on the map. The Danakil depression
  // sits inside the same bounds and lies below sea level; it runs no kiremt.
  if (lat >= 6 && lat <= 15 && lon >= 35 && lon <= 42 && elevationM >= HIGHLAND_ELEVATION_M) {
    return 'ethiopian-highlands'
  }
  // The Horn, and it needs its own rule: east-rift stops at 6N, so everything
  // above it out here fell through to the tropical fallback — the Somali village
  // moved into the Haud would have been given the CONGO's rains. Found by the
  // village-move conflict check, not by a test.
  if (lat >= 6 && lat < 12.5 && lon >= 42) return 'horn'
  if (lat >= -12 && lat < 6 && lon >= 31.5) return 'east-rift'
  if (lat >= -5 && lat <= 5 && lon >= 12 && lon < 31.5) return 'congo'
  if (lat > 5 && lat < 11 && lon >= 12 && lon < 31.5) return 'congo-north'
  if (lat >= -12 && lat < -5 && lon >= 12 && lon < 31.5) return 'southern-plateau'
  // West Africa, split by longitude: the August break is an upwelling effect off
  // the Gulf of Guinea and does not reach the Atlantic-facing coast at 10-15W.
  if (lat >= 4 && lat < 11 && lon >= -6 && lon < 12) return 'guinea-coast'
  if (lat >= 4 && lat < 11 && lon < -6) return 'west-coast'
  // Gabon / Rio Muni / south Cameroon: equatorial, but NOT the basin regime.
  // Woleu-Ntem is Köppen As with a hard Jun-Sep dry season, so the congo row's
  // "rain every month" is the wrong year here. This rule closes the hole that
  // sent the whole Atlantic equator to the desert default (see below).
  if (lat >= -5 && lat < 4 && lon >= 7 && lon < 12) return 'atlantic-equatorial'
  if (lat >= 11 && lat < 18) return 'sahel'
  if (lat >= 18 && lat < 25) return 'sahara-south'
  // Mediterranean only on the coast proper; inland at the same latitude is desert.
  if (lat >= 31 && isNearNorthCoast(lat, lon)) return 'mediterranean'
  // The fallback is a DESERT, so it must never be reachable from the tropics.
  // It was: the rules above leave a hole between the congo row (which demands
  // lon >= 12) and the guinea-coast row (which demands lat >= 4), and every
  // equatorial coordinate west of 12E fell through it to 'sahara-north' — the
  // Fang village at 1.8N/11.5E, in rainforest, sampled 0.000 wetness in July,
  // the peak of its own rains. Whatever is added here, keep this guard: a
  // tropical coordinate reaching a Saharan default is a bug, not a climate.
  if (lat > -25 && lat < 18) return 'congo-north'
  return 'sahara-north'
}

/** Roughly "within reach of the north coast or the Atlantic-facing Maghreb". */
function isNearNorthCoast(lat: number, lon: number): boolean {
  if (lon >= -10 && lon <= 11) return lat >= 31 // Maghreb: Atlantic + western Med
  if (lon > 11 && lon <= 26) return lat >= 31.5 // Libyan coast, incl. the Sidra bight
  if (lon > 26 && lon <= 35) return lat >= 31 // the Egyptian coast: Alexandria in, Cairo out
  return false
}

/**
 * The last in-game day the calendar may reach: 31 December 1895 (design.md
 * §5.1). TEMPORARY: while the expedition deadline is suspended, the date runs
 * to the end of the game's window and STOPS there rather than the run ending.
 */
export const LAST_YEAR = 1895

/** Days from the start of `startYear` to 31 December of `LAST_YEAR`. */
export function lastDay(startYear: number): number {
  return (Date.UTC(LAST_YEAR, 11, 31) - Date.UTC(startYear, 0, 1)) / 86400000
}

/**
 * The calendar's ceiling (design.md §5.1): time never runs past 31.12.1895 —
 * it stands still there. Applied at every place the day advances, so travel,
 * drift, ferries and events all stop at the same wall.
 */
export function clampDay(day: number, startYear: number): number {
  return Math.min(day, lastDay(startYear))
}

/**
 * Debug (design.md §21.1): the in-game day one year later (`+1`) or earlier
 * (`-1`), keeping the month and day-of-month, clamped to the game's window
 * 1890..1895. Returns the unchanged day at either end, so the keys simply stop.
 */
export function dayOfYearJump(day: number, delta: number, startYear: number): number {
  const d = new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000)
  const year = d.getUTCFullYear() + delta
  if (year < startYear || year > LAST_YEAR) return day
  const jumped = (Date.UTC(year, d.getUTCMonth(), d.getUTCDate()) - Date.UTC(startYear, 0, 1)) / 86400000
  return clampDay(jumped, startYear)
}

/** The number row, left to right: on a German keyboard 1..9 0 ß ´ — twelve
 *  adjacent keys for the twelve months (design.md §21.1). Physical `code`s,
 *  so the mapping follows the ROW, not the layout's characters. */
export const MONTH_KEYS = [
  'Digit1', 'Digit2', 'Digit3', 'Digit4', 'Digit5', 'Digit6',
  'Digit7', 'Digit8', 'Digit9', 'Digit0', 'Minus', 'Equal',
]

/**
 * Debug (design.md §21.1): the in-game day for the 15th of `month` (1..12) in
 * the year `day` currently falls in — the season selector's calendar twin, so
 * the seasons can be stepped through month by month.
 *
 * Keeps the YEAR deliberately: jumping the month must not end the expedition
 * or rewrite its progress. Mid-month (the 15th) rather than the 1st, because
 * the wetness curve interpolates between month midpoints — the 15th is where
 * a month's profile value actually reads.
 */
export function dayOfMonthJump(day: number, month: number, startYear: number): number {
  const m = Math.min(12, Math.max(1, Math.round(month)))
  const year = new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000).getUTCFullYear()
  return (Date.UTC(year, m - 1, 15) - Date.UTC(startYear, 0, 1)) / 86400000
}

/** Continuous day of the year, 0..365 (fractional), from the in-game day. */
export function dayOfYear(day: number, startYear: number): number {
  const ms = Date.UTC(startYear, 0, 1) + day * 86400000
  const d = new Date(ms)
  const yearStart = Date.UTC(d.getUTCFullYear(), 0, 1)
  return (ms - yearStart) / 86400000
}

/** Coldness at or above which the cold-weather dress of §19.13 is worn. */
export const COLD_DRESS_THRESHOLD = 0.5

/** Peak of the cold season: mid-July in the south, mid-January in the north. */
const SOUTHERN_WINTER_DOY = 196
const NORTHERN_WINTER_DOY = 15

/**
 * How cold a place reads, 0 (never cold) .. 1 (the coldest the game's inhabited
 * ground gets). Drives the cold-weather dress of §19.13 — NOT a temperature in
 * degrees: `docs/climate-1890.md` carries no per-region monthly temperature
 * table, so inventing one would be a false precision. What it does encode is
 * what the research does support:
 *
 * - A seasonal swing that only exists AWAY from the equator. The research fixes
 *   the cold season by hemisphere at the two ranges that actually take snow:
 *   the Drakensberg Jun-Aug (austral winter) and the High Atlas Nov-Apr. In the
 *   tropics the annual temperature swing is small, so the amplitude falls off
 *   toward the equator and a Maasai or Baganda village is never "cold".
 * - Elevation: the highlands are cool the year round (the ~6.5 °C/km lapse is
 *   why the 0 °C isotherm sits at ~4,750 m on the equator per the research).
 *
 * `elevationM` is required for the same reason `climateZoneAt` requires it:
 * `elevationAt` silently returns 0 before the DEM loads, and a defaulted
 * parameter would hide that.
 */
export function coldnessAt(
  day: number,
  lat: number,
  lon: number,
  startYear: number,
  elevationM: number,
): number {
  void lon // no longitudinal term in the model; kept for the shape of wetnessAt
  const doy = dayOfYear(day, startYear)
  const winterPeak = lat < 0 ? SOUTHERN_WINTER_DOY : NORTHERN_WINTER_DOY
  // 1 at the winter peak, 0 at the summer peak.
  const seasonal = Math.cos((2 * Math.PI * (doy - winterPeak)) / 365) * 0.5 + 0.5
  // The swing needs latitude: at the equator there is effectively none, and by
  // the game's southern edge (~-34°) it is the whole story.
  const amplitude = Math.min(1, Math.abs(lat) / 35)
  // Height is cold regardless of the month.
  const elevation = Math.min(1, Math.max(0, elevationM) / 3000)
  return Math.min(1, seasonal * amplitude + elevation * 0.6)
}

// The harmattan (docs/climate-1890.md): the West African winter dust wind.
// Core late November to mid-March, worst in January, reaching ~5N to ~20N.
const HARMATTAN_PEAK_DOY = 15 // mid-January, the worst of it
const HARMATTAN_HALF_WIDTH_DAYS = 58 // late Nov .. mid-Mar around the peak
const HARMATTAN_LAT_CORE = [10, 18] as const
const HARMATTAN_LAT_FADE = 4
/**
 * East of the Chad basin the wind is not the harmattan — it is a WEST African
 * phenomenon, blowing off the Sahara toward the Gulf of Guinea. INFERRED: the
 * research gives the latitude band (~5-20N) but no longitude, so this eastern
 * bound is reasoned from what the harmattan IS, not read off a source.
 */
const HARMATTAN_LON_EAST = 25
const HARMATTAN_LON_FADE = 6

/**
 * How hard the harmattan blows at a place and time, 0 .. 1 (design.md §19.13).
 *
 * Deliberately NOT folded into `coldnessAt`, though the research stresses the
 * cold: the harmattan is a SWING, not a cold season — "cold at dawn and hot by
 * afternoon — the swing is the phenomenon", with a 15-20 °C diurnal range. A
 * place under it is not cold at noon, so adding it to coldness would dress a
 * Hausa villager for a chill he does not have at midday. It is its own driver,
 * and the dress and the sky each read what they need from it.
 *
 * The other half of why this exists: `coldnessAt`'s amplitude falls off toward
 * the equator (correctly — the annual swing does), so the Sahel reads "never
 * cold" all year. That is right about the ANNUAL swing and wrong about the
 * January dawn, and only a separate driver can hold both.
 */
export function harmattanAt(day: number, lat: number, lon: number, startYear: number): number {
  const doy = dayOfYear(day, startYear)
  // Distance from the January peak, wrapped across the year end (the season
  // straddles it: late Nov .. mid Mar).
  const raw = Math.abs(doy - HARMATTAN_PEAK_DOY)
  const dist = Math.min(raw, 365 - raw)
  const season = Math.max(0, 1 - dist / HARMATTAN_HALF_WIDTH_DAYS)
  // Full strength across the core band, fading out to either side.
  const [south, north] = HARMATTAN_LAT_CORE
  let band = 1
  if (lat < south) band = Math.max(0, 1 - (south - lat) / HARMATTAN_LAT_FADE)
  else if (lat > north) band = Math.max(0, 1 - (lat - north) / HARMATTAN_LAT_FADE)
  const west = lon > HARMATTAN_LON_EAST
    ? Math.max(0, 1 - (lon - HARMATTAN_LON_EAST) / HARMATTAN_LON_FADE)
    : 1
  return season * band * west
}

/**
 * The zone's own month curve at this day, 0 (its driest) .. 1 (its own peak) —
 * the shape before the zone's absolute scale is applied. Shared by the absolute
 * `wetnessAt` and the relative `floraGreennessAt` so the two can never drift.
 */
function zoneShapeAt(day: number, zone: ClimateZone, startYear: number): number {
  const profile = MONTH_PROFILE[zone]
  // Month positions are their midpoints, so the curve peaks mid-month.
  const t = (dayOfYear(day, startYear) / 365.25) * 12 - 0.5
  const i = Math.floor(t)
  const f = t - i
  const a = profile[((i % 12) + 12) % 12]
  const b = profile[((i + 1) % 12 + 12) % 12]
  const smooth = f * f * (3 - 2 * f) // smoothstep: no kink at the month boundary
  return a + (b - a) * smooth
}

// The karif (docs/peoples-1890.md §7.1, Swayne 1895): the Horn's south-west
// monsoon, blowing through haga (Jul-Sep). Its cold is ALTITUDE-GATED, and that
// is the whole point — Swayne: "It is hot in Guban, with sand-storms, but COLD
// on the Haud and other parts of the high interior."
const KARIF_PEAK_DOY = 227 // mid-August, the middle of haga
const KARIF_HALF_WIDTH_DAYS = 46 // Jul .. Sep around the peak
const KARIF_LAT = [5, 12.5] as const
const KARIF_LON_WEST = 42
const KARIF_HIGHLAND_M = [600, 1000] as const // Guban below, the Haud/Ogo above

/**
 * How hard the karif blows COLD at a place and time, 0 .. 1 (design.md §19.13).
 *
 * A third driver beside `coldnessAt` and `harmattanAt`, and it has to be, for
 * two reasons the research forces:
 *
 * - It is a WIND IN THE HOT SEASON. `coldnessAt` reads July at 9N as the
 *   northern SUMMER and returns almost nothing — correctly, for the annual
 *   temperature swing. But Swayne's period table names haga (Jul-Sep) as "the
 *   hot weather" and puts the cold in it anyway, carried by the wind. The
 *   intuitive reading is wrong twice over: jilal, "the driest season; great
 *   heat", is Jan-Apr and is NOT the cold one.
 * - It is gated by ALTITUDE, not latitude: the same wind that chills the Haud
 *   bakes the Guban lowland. That is why the Somali village was moved into the
 *   Haud (9.0N, 964 m) — at its old 349 m the cold never applied to it.
 */
export function karifAt(
  day: number,
  lat: number,
  lon: number,
  startYear: number,
  elevationM: number,
): number {
  const doy = dayOfYear(day, startYear)
  const raw = Math.abs(doy - KARIF_PEAK_DOY)
  const dist = Math.min(raw, 365 - raw)
  const season = Math.max(0, 1 - dist / KARIF_HALF_WIDTH_DAYS)
  const [south, north] = KARIF_LAT
  if (lat < south || lat > north || lon < KARIF_LON_WEST) return 0
  // Hot in Guban, cold on the high interior — the gate IS the finding.
  const [low, high] = KARIF_HIGHLAND_M
  const highland = Math.min(1, Math.max(0, (elevationM - low) / (high - low)))
  return season * highland
}

/**
 * Wetness at a place and time, 0 (rainless) .. 1 (the wettest the world gets).
 * Interpolated smoothly across the month profile so a season arrives and fades
 * rather than switching on a month boundary.
 */
/**
 * Wetness the game should act on: the debug override when set (design.md §21 —
 * the season selector is the testing tool), else the date-derived value.
 */
export function effectiveWetness(
  day: number,
  lat: number,
  lon: number,
  startYear: number,
  elevationM: number,
  override: number | null,
): number {
  if (override !== null) return Math.min(1, Math.max(0, override))
  return wetnessAt(day, lat, lon, startYear, elevationM)
}

/**
 * How the wet season reads in the travel atmosphere (design.md §19 seasons,
 * point 120c): rain-heavy air shortens the sight lines and grays the fog
 * toward an overcast tone. `strength` is the calibratable master factor
 * (`balance.season.weatherStrength`); 0 disables the whole seasonal look.
 * Pure, so the boundaries are testable: dry (wet=0) must return the identity.
 */
export function seasonFogParams(
  wetness: number,
  strength: number,
): { rangeFactor: number; grayMix: number } {
  const w = Math.min(1, Math.max(0, wetness)) * Math.min(1, Math.max(0, strength))
  return {
    // Sight lines close in as the rains stand over the land — at full wetness
    // the fog planes pull in to ~60% of the dry-season preset.
    rangeFactor: 1 - 0.4 * w,
    // And the light grays: how far the fog/sky color mixes toward overcast.
    grayMix: 0.55 * w,
  }
}

/** The overcast tone seasonFogParams' grayMix mixes toward. */
export const RAIN_GRAY = '#aeb6ba'

/**
 * Rain intensity from wetness (0..1): drizzle starts past the threshold and
 * ramps to full — light wet-season air stays rainless, only genuinely wet
 * periods rain. Pure for the same reason as seasonFogParams.
 */
export function rainAmount(wetness: number, strength: number): number {
  const w = Math.min(1, Math.max(0, wetness)) * Math.min(1, Math.max(0, strength))
  const t = (w - 0.45) / (1 - 0.45)
  const c = Math.min(1, Math.max(0, t))
  return c * c * (3 - 2 * c) // smoothstep above the drizzle threshold
}

/**
 * How the wet season reads on the sky dome: the blue grays toward RAIN_GRAY
 * and the cloud deck thickens. Separate from seasonFogParams because the dome
 * carries the weather further than the fog does — a dimmed sun under a bright
 * blue sky reads as a bug, not as rain. Pure for the same reason.
 */
export function skyOvercastParams(
  wetness: number,
  strength: number,
): { grayMix: number; cloudBoost: number } {
  const w = Math.min(1, Math.max(0, wetness)) * Math.min(1, Math.max(0, strength))
  return { grayMix: 0.75 * w, cloudBoost: 0.8 * w }
}

/**
 * How far the wet season dims the sun (multiplier on the light intensity).
 * Overcast, not night: at full rain the light drops to ~60%.
 */
export function sunDimFactor(wetness: number, strength: number): number {
  const w = Math.min(1, Math.max(0, wetness)) * Math.min(1, Math.max(0, strength))
  return 1 - 0.4 * w
}

/**
 * This frame's effective weather at the traveller, written by the travel
 * Climate component — a frame-scratch global in the mould of Wildlife's
 * LION_STATE. Read by the travel sun-dim (TravelScene) and the dry-season shore
 * catchment (Wildlife). The flora tint no longer reads it: it derives its own
 * greenness per-zone via `effectiveGreenness` from the player's coordinate,
 * because the absolute wetness this holds cannot carry a per-zone flora look.
 */
export const CURRENT_WEATHER = { wetness: 0 }

export function wetnessAt(
  day: number,
  lat: number,
  lon: number,
  startYear: number,
  elevationM: number,
): number {
  if (isHyperArid(lat, lon)) return 0
  const zone = climateZoneAt(lat, lon, elevationM)
  let wet = zoneShapeAt(day, zone, startYear) * ZONE_WETNESS[zone]
  // The Sahel's season shortens sharply with latitude: 4-5 months in the south,
  // 1-2 at 16-18N. Squeeze the shape rather than shifting it — the peak stays
  // August everywhere, only the shoulders retreat.
  if (zone === 'sahel') {
    const north = Math.min(1, Math.max(0, (lat - 11) / 7)) // 0 at 11N, 1 at 18N
    wet *= 1 - north * 0.55
  }
  return Math.min(1, Math.max(0, wet))
}

// The Nile flood (docs/climate-1890.md, point 138). Unregulated in 1890 (no dam
// until 1898): it rises from early June and peaks at Cairo in OCTOBER, the most
// visible cycle in the game and right at the start port.
//
// The one thing a naive build gets wrong: the flood is NOT local rain. Cairo is
// rainless the year round, yet the river there crests in October — because the
// water is the ETHIOPIAN kiremt (Jun-Sep, the Blue Nile's flood) arriving weeks
// late. So the flood samples the highland SOURCE at a lagged day, never
// `wetnessAt` at the river point.
const NILE_SOURCE = { lat: 11.5, lon: 37.0, elevationM: 2000 } // the Blue Nile highlands
// Ethiopian kiremt peaks in Jul/Aug; the crest reaches Cairo ~2 months later.
const NILE_FLOOD_LAG_DAYS = 62
// Low water below this kiremt wetness; full flood at the source's own peak. The
// source is normalised against ITS peak (not against 1) because a highland zone
// tops out at ~0.66, so the flood would otherwise never crest.
const NILE_FLOOD_FLOOR = 0.05
const NILE_FLOOD_PEAK = 0.6

/**
 * The Nile flood level at a day, 0 (low water, at the carved bed) .. 1 (the
 * October crest). Remote-fed and lagged — see the note above. Pure and
 * date-only: the flood is the same length of river everywhere on the Nile, so
 * it takes no coordinate.
 */
export function nileFloodAt(day: number, startYear: number): number {
  const kiremt = wetnessAt(
    day - NILE_FLOOD_LAG_DAYS,
    NILE_SOURCE.lat,
    NILE_SOURCE.lon,
    startYear,
    NILE_SOURCE.elevationM,
  )
  return Math.min(1, Math.max(0, (kiremt - NILE_FLOOD_FLOOR) / (NILE_FLOOD_PEAK - NILE_FLOOD_FLOOR)))
}

// The Okavango inversion (docs/peoples-1890.md §4.0.4/§7.3, point 139): the
// delta floods in the middle of the LOCAL DRY SEASON. The Angolan summer rains
// (Nov-Mar) feed the Cubango and Cuito, the pulse shows at the panhandle around
// March-April and reaches the distal delta in JUNE-AUGUST — "while most river
// systems flood during the local rainy season, the Okavango does the opposite".
// PERIOD-confirmed twice: Andersson ("Its annual overflow takes place in June,
// July, and August"), and Livingstone, who deduced the remote origin from the
// water's CLARITY ("this is the dry season. That the rise is not caused by
// rains, is evident, from the water being so pure").
//
// Same shape as the Nile flood — remote rain, months of lag — consuming the
// same pattern; the difference is that the lag is long enough to land the peak
// in the local dry season, which is the proof the abstraction is real and not
// a Nile special case.
const OKAVANGO_SOURCE = { lat: -12.5, lon: 16.0, elevationM: 1700 } // the Angolan highlands
const OKAVANGO_FLOOD_LAG_DAYS = 180 // source peak mid-Jan -> delta peak mid-Jul
const OKAVANGO_FLOOD_FLOOR = 0.05
const OKAVANGO_FLOOD_PEAK = 0.6

/** The Okavango delta's flood level at a day, 0 (low) .. 1 (the July peak). */
export function okavangoFloodAt(day: number, startYear: number): number {
  const angolanRains = wetnessAt(
    day - OKAVANGO_FLOOD_LAG_DAYS,
    OKAVANGO_SOURCE.lat,
    OKAVANGO_SOURCE.lon,
    startYear,
    OKAVANGO_SOURCE.elevationM,
  )
  return Math.min(
    1,
    Math.max(0, (angolanRains - OKAVANGO_FLOOD_FLOOR) / (OKAVANGO_FLOOD_PEAK - OKAVANGO_FLOOD_FLOOR)),
  )
}

/** Below this zone peak a place is too arid to carry green worth bleaching. */
const GREENING_ZONE_FLOOR = 0.5

/**
 * How green the flora should read, 0 (straw) .. 1 (lush) — a RELATIVE reading,
 * unlike `wetnessAt`, and that difference is the whole point.
 *
 * `wetnessAt` is deliberately ABSOLUTE so a Saharan trace cannot rain like a
 * Congo downpour. For the rain and the fog that is right. For the FLORA it is
 * wrong, and it shipped wrong: because every zone is capped at its own peak
 * (east-rift 0.6, sahel 0.75), the absolute reading never approached 1 outside
 * the Congo, so the ground stayed straw all year — the East African plains
 * reached 8% green at the height of their long rains. But the Serengeti greens
 * completely in its rains; it simply does so on less water than the Congo. The
 * honest question for vegetation is "how wet is it here, against what here
 * gets" — which is the month profile itself, before the zone scale is applied.
 *
 * The zone scale still gets a say, as a floor: a desert has no green to bleach,
 * so an arid zone stays neutral however sharp its own little wet peak is. Cairo
 * must not sprout in January.
 */
export function floraGreennessAt(
  day: number,
  lat: number,
  lon: number,
  startYear: number,
  elevationM: number,
): number {
  if (isHyperArid(lat, lon)) return 0
  const zone = climateZoneAt(lat, lon, elevationM)
  const shape = zoneShapeAt(day, zone, startYear)
  const greenable = Math.min(1, ZONE_WETNESS[zone] / GREENING_ZONE_FLOOR)
  return Math.min(1, Math.max(0, shape * greenable))
}

/** `floraGreennessAt` with the §21 debug override applied, like `effectiveWetness`. */
export function effectiveGreenness(
  day: number,
  lat: number,
  lon: number,
  startYear: number,
  elevationM: number,
  override: number | null,
): number {
  if (override !== null) return Math.min(1, Math.max(0, override))
  return floraGreennessAt(day, lat, lon, startYear, elevationM)
}
