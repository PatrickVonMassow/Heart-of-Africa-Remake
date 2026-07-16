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
  | 'ethiopian-highlands' // kiremt + belg
  | 'east-rift' // bimodal: long rains MAM, short rains OND
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
  // belg Feb-May (minor), kiremt Jun-Sep (65-95% of the annual total), bega dry.
  'ethiopian-highlands': [0.05, 0.2, 0.4, 0.45, 0.35, 0.6, 1, 0.95, 0.55, 0.1, 0.05, 0.03],
  // Long rains Mar-May (peak Apr), short rains Oct-Dec (peak Nov).
  'east-rift': [0.15, 0.15, 0.6, 1, 0.7, 0.15, 0.1, 0.1, 0.2, 0.6, 0.85, 0.5],
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
  'ethiopian-highlands': 0.7,
  'east-rift': 0.6,
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
  if (lat >= -12 && lat < 6 && lon >= 31.5) return 'east-rift'
  if (lat >= -5 && lat <= 5 && lon >= 12 && lon < 31.5) return 'congo'
  if (lat > 5 && lat < 11 && lon >= 12 && lon < 31.5) return 'congo-north'
  if (lat >= -12 && lat < -5 && lon >= 12 && lon < 31.5) return 'southern-plateau'
  // West Africa, split by longitude: the August break is an upwelling effect off
  // the Gulf of Guinea and does not reach the Atlantic-facing coast at 10-15W.
  if (lat >= 4 && lat < 11 && lon >= -6 && lon < 12) return 'guinea-coast'
  if (lat >= 4 && lat < 11 && lon < -6) return 'west-coast'
  if (lat >= 11 && lat < 18) return 'sahel'
  if (lat >= 18 && lat < 25) return 'sahara-south'
  // Mediterranean only on the coast proper; inland at the same latitude is desert.
  if (lat >= 31 && isNearNorthCoast(lat, lon)) return 'mediterranean'
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
 * Climate component and read by the sun and rain — a frame-scratch global in
 * the mould of Wildlife's LION_STATE, so the lighting does not need a second
 * wetness derivation of its own.
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
  const profile = MONTH_PROFILE[zone]
  // Month positions are their midpoints, so the curve peaks mid-month.
  const t = (dayOfYear(day, startYear) / 365.25) * 12 - 0.5
  const i = Math.floor(t)
  const f = t - i
  const a = profile[((i % 12) + 12) % 12]
  const b = profile[((i + 1) % 12 + 12) % 12]
  const smooth = f * f * (3 - 2 * f) // smoothstep: no kink at the month boundary
  const shape = a + (b - a) * smooth
  let wet = shape * ZONE_WETNESS[zone]
  // The Sahel's season shortens sharply with latitude: 4-5 months in the south,
  // 1-2 at 16-18N. Squeeze the shape rather than shifting it — the peak stays
  // August everywhere, only the shoulders retreat.
  if (zone === 'sahel') {
    const north = Math.min(1, Math.max(0, (lat - 11) / 7)) // 0 at 11N, 1 at 18N
    wet *= 1 - north * 0.55
  }
  return Math.min(1, Math.max(0, wet))
}
