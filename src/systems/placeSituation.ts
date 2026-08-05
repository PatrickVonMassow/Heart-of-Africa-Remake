// The SITUATION a walkable place stands in at a date (design.md §16, point 394).
//
// Every first-person scene is journaled on its first entry, and again when the
// situation it stands in has CHANGED since it was last journaled. This module
// is the single, pure answer to "what situation is this place in today" — the
// generalization of point 170's village phase, not a second mechanism beside
// it: the store stores the returned key per place and compares it on re-entry.
//
// The drivers are the ones the game already models, never invented here:
//   * villages  — the rinderpest phase of `./rinderpest` (design.md §16).
//   * Giza      — the Nile inundation of `./season` (design.md §19.9). Before
//                 the Aswan dam the flood turned the fields between Cairo and
//                 the plateau into a sheet of water every autumn; it is the
//                 one thing about the site that changes within the window.
//   * Berbera   — Burton's documented fair season (docs/peoples-1890.md §4.0.2:
//                 the town holds ~20 000 people over the trading months and by
//                 the first week of April "is again deserted").
// Every other place has no modelled situation yet and reports STEADY, so it is
// journaled once and stays silent — the hook is here, not a second mechanism.

import type { PlaceDef, PlaceKind } from '../world/geo'
import { rinderpestPhaseAtDay } from './rinderpest'
import { nileFloodAt } from './season'

/** A place with no modelled situation: journaled once, never re-fired. */
export const STEADY = 'steady'

/** Nile flood level from which Giza reads as standing above the inundation.
 *  Mid-scale: the flood curve crosses it on the way up and down, so the two
 *  readings each hold for months rather than flickering around a peak. */
export const GIZA_FLOOD_THRESHOLD = 0.5

/** Calendar month (1..12) of an in-game day — the same date glue rinderpest
 *  uses, kept local so this module stays pure and dependency-light. */
export function monthOfDay(day: number, startYear: number): number {
  return new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000).getUTCMonth() + 1
}

/** Burton's Berbera year: the caravan fair fills the town from October and it
 *  empties in April (docs/peoples-1890.md §4.0.2, PERIOD source). */
export function berberaFairActive(month: number): boolean {
  return month >= 10 || month <= 3
}

/**
 * Situation per place KIND. A `Record<PlaceKind, …>` on purpose (the point-335
 * rule): a fourth walkable kind cannot be added without deciding what its
 * situation is — the compiler refuses until it is entered here.
 */
const SITUATION_BY_KIND: Record<PlaceKind, (place: PlaceDef, day: number, startYear: number) => string> = {
  village: (place, day, startYear) => rinderpestPhaseAtDay(place.peopleId ?? '', day, startYear),
  monument: (place, day, startYear) =>
    place.id === 'giza'
      ? nileFloodAt(day, startYear) >= GIZA_FLOOD_THRESHOLD
        ? 'flood'
        : 'lowWater'
      : STEADY,
  port: (place, day, startYear) =>
    place.id === 'berbera' ? (berberaFairActive(monthOfDay(day, startYear)) ? 'fair' : 'deserted') : STEADY,
}

/** The situation key of a place at an in-game day. Pure. */
export function placeSituationAt(place: PlaceDef, day: number, startYear: number): string {
  return SITUATION_BY_KIND[place.kind](place, day, startYear)
}

/**
 * Whether re-entering a place should write a RETURN entry (design.md §16):
 * the situation last journaled here differs from the situation now. A place
 * with no stored situation (never journaled, or a legacy save) stays silent —
 * a change cannot be described against an unknown past.
 */
export function situationChanged(stored: string | undefined, current: string): boolean {
  return stored !== undefined && stored !== current
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__placeSituation = { placeSituationAt }
}
