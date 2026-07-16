// Seasonal presence in the settlements (design.md §19.13, TASKS point 142):
// "the young men are gone". The research's best-attested life mechanic — the
// settlement stands, but part of its people are away with the season — and its
// equally important negative: the sedentary peoples are NEVER away.
//
// Evidence per entry (docs/peoples-1890.md §4):
//  * Maasai — PERIOD (Thomson, §7.1): the camp moves "up from the plains to the
//    highlands in the DRY season and vice versa in the wet season" — the
//    counter-intuitive direction, period-sourced. So in the local dry months
//    part of the village is at the dry-season camps.
//  * Tuareg — MODERN/RETRO-APPLIED, and an extrapolation the research marks:
//    Aïr men spend "five to seven months each year" on the Bilma/Kano caravans;
//    the game's village is Ahaggar. INFERRED window: the great autumn caravan
//    departs after the rains — men away roughly October-February.
//  * Hausa/Bambara/Mandinka — PERIOD (Barth, §4.9): the RAINS move the farmers
//    out to the field huts; the village reads emptier in its wet months. (The
//    §4.9 finding that inverts the indoor/outdoor intuition.)
//  * Bemba, Lunda — §4.0.5: sedentary, "no month empties them". The negative
//    case, asserted so the mechanic never becomes universal.
//  * Everyone else: full presence — no evidence, no invention.
//
// The SHAPE, from the research: "a camp of women, children and elders" — so the
// factor thins the adult WALKERS about the settlement, never the children or
// the elder.

import { dayOfYear } from './season'

interface AwayRule {
  /** First and last day-of-year of the away window (may wrap the year end). */
  fromDoy: number
  toDoy: number
  /** Fraction of the usual adult walkers PRESENT during the window. */
  presence: number
}

const AWAY: Record<string, AwayRule> = {
  // East-rift long dry season Jun-Sep: the herders are at the highland camps.
  maasai: { fromDoy: 152, toDoy: 273, presence: 0.45 },
  // The autumn caravan and its Kano onward leg: roughly October-February.
  tuareg: { fromDoy: 274, toDoy: 59, presence: 0.5 },
  // The Sahel rains Jun-Sep: all hands at the field huts by day.
  hausa: { fromDoy: 152, toDoy: 273, presence: 0.6 },
  bambara: { fromDoy: 152, toDoy: 273, presence: 0.6 },
  mandinka: { fromDoy: 152, toDoy: 273, presence: 0.6 },
}

/**
 * The fraction of a people's usual adult walkers present on this day, 0..1.
 * 1 for every people without a researched away season — including, asserted,
 * the sedentary Bemba and Lunda.
 */
export function presenceAt(peopleId: string, day: number, startYear: number): number {
  const rule = AWAY[peopleId]
  if (!rule) return 1
  const doy = dayOfYear(day, startYear)
  const inWindow =
    rule.fromDoy <= rule.toDoy
      ? doy >= rule.fromDoy && doy <= rule.toDoy
      : doy >= rule.fromDoy || doy <= rule.toDoy // wraps the year end
  return inWindow ? rule.presence : 1
}
