// The village cook-fire's rain shelter (design.md §19.10, TASKS point 256).
// Pure: a people id gives whether that village keeps its cooking fire under an
// open-sided thatched cook-shelter (a canopy on posts), the period-accurate,
// cheap-to-render answer researched in `docs/peoples-1890.md` §9.
//
// This predicate is deliberately NARROW, on the research's own accuracy guard
// (peoples-1890 §9.4/§9.5), not a shortcut:
//
//  * SHOWN — a separate cook-hut / kitchen structure / open-sided shelter is
//    PERIOD-attested or safely inferable for the compound-building peoples:
//    Baganda (Roscoe's cooking-sheds), Hausa (compound kitchen + rumfa shade
//    roof), Bambara and Mandinka (the savanna compound kitchen pattern), Bemba
//    and Lunda (the open-sided insaka form + kitchen), Swahili (coast-house
//    kitchens). The open-sided canopy is the attested open end of that
//    spectrum, keeps the fire visible, and is one cheap primitive.
//  * NOT SHOWN — everyone else. Where the people keep the hearth INDOORS on
//    the evidence (Zulu, Maasai, Fang, Mbuti) the yard fire goes out under
//    rain instead (point 348, `yardFireOut`); the San, the thin-evidence and the
//    GAP peoples keep an open fire the rain damps; the rainless desert points
//    are moot. The full per-people decision is `FIRE_RAIN_DECISIONS` below.

import { balance } from '../config/balance'
import { fireRainFactor } from './season'

/**
 * How a people's village fire answers rain (point 348), decided per people from
 * `docs/peoples-1890.md` §9.4/§9.6 — the §19.13 dress rule's model: a change
 * only where the record carries it, a recorded "no change" everywhere else.
 *
 *  * `shelter` — the fire stands under the cook-shelter canopy and burns on
 *    (point 256; a kitchen structure attested or safely inferable).
 *  * `indoor`  — the people keep the hearth INSIDE the dwelling: past
 *    `balance.fire.indoorRainThreshold` the yard fire is out and its life is
 *    indoors; it is lit again when the rain passes.
 *  * `open`    — the fire stays in the open and is beaten down by rain (point
 *    256): the San's attested open hearth, and every people whose rain-time
 *    hearth the record does not settle (GAP / THIN — no answer invented).
 *  * `moot`    — effectively rainless; the question never arises.
 */
export type FireRainBehaviour = 'shelter' | 'indoor' | 'open' | 'moot'

/** The decision per people id, with the §9.4 evidence grade it rests on. */
export const FIRE_RAIN_DECISIONS: Readonly<Record<string, { behaviour: FireRainBehaviour; evidence: string }>> = {
  baganda: { behaviour: 'shelter', evidence: 'PERIOD-adjacent, Roscoe p. 435 cooking-sheds' },
  hausa: { behaviour: 'shelter', evidence: 'MODERN dakin girki/rumfa + Barth period courtyard kitchens' },
  bambara: { behaviour: 'shelter', evidence: 'INFERRED savanna compound kitchen' },
  mandinka: { behaviour: 'shelter', evidence: 'INFERRED savanna compound kitchen' },
  bemba: { behaviour: 'shelter', evidence: 'RETRO-APPLIED insaka (Richards)' },
  lunda: { behaviour: 'shelter', evidence: 'MODERN, extrapolated meeting shelter + kitchen' },
  swahili: { behaviour: 'shelter', evidence: 'MODERN, THIN coast-house kitchens' },
  zulu: { behaviour: 'indoor', evidence: 'PERIOD, Grout 1864 pp. 98-99: wet weather gathers the household round the hut hearth' },
  maasai: { behaviour: 'indoor', evidence: 'PERIOD, Thomson pp. 242-3 + Hollis 1905: hearth in the hide-proofed hut' },
  fang: { behaviour: 'indoor', evidence: 'PERIOD, Kingsley: closed bark house; Tessmann located' },
  mbuti: { behaviour: 'indoor', evidence: 'RETRO-APPLIED: a hearth at each leaf hut (Schebesta, Turnbull)' },
  san: { behaviour: 'open', evidence: 'PERIOD open hearth (Passarge); no roof in any source' },
  pedi: { behaviour: 'open', evidence: 'THIN, inferred indoor hearth: not enough to move the fire' },
  sidama: { behaviour: 'open', evidence: 'MODERN, THIN interior hearth: not enough to move the fire' },
  berbers: { behaviour: 'open', evidence: 'MODERN, THIN indoor hearth: not enough to move the fire' },
  somali: { behaviour: 'open', evidence: 'GAP: hearth placement in the gu rains unknown' },
  mongo: { behaviour: 'open', evidence: 'GAP' },
  banda: { behaviour: 'open', evidence: 'GAP' },
  bambundu: { behaviour: 'open', evidence: 'GAP' },
  wayeyi: { behaviour: 'open', evidence: 'GAP' },
  tuareg: { behaviour: 'moot', evidence: 'effectively rainless (climate-1890.md)' },
  nubians: { behaviour: 'moot', evidence: 'effectively rainless (climate-1890.md)' },
}

/** The decided rain behaviour of a people's village fire; `undefined` for an
 *  unknown id (the roster sweep fails on that), `open` for no id at all. */
export function fireRainBehaviour(peopleId?: string): FireRainBehaviour | undefined {
  if (!peopleId) return 'open'
  return FIRE_RAIN_DECISIONS[peopleId]?.behaviour
}

/**
 * Whether this people's village fire stands under a cook-shelter canopy
 * (design.md §19.10, point 256). Attested/inferable compound peoples get it;
 * everyone else does not (peoples-1890 §9.5). Unknown/absent ids get no canopy.
 */
export function fireHasCookShelter(peopleId?: string): boolean {
  return fireRainBehaviour(peopleId) === 'shelter'
}

/**
 * Whether the yard fire is OUT at rain amount `rain` (0..1, `rainAmount`):
 * only for an `indoor` people, at and above `balance.fire.indoorRainThreshold`
 * (point 348). Pure and deterministic — the same rain gives the same answer,
 * and it is lit again as soon as the rain falls back below the threshold.
 */
export function yardFireOut(peopleId: string | undefined, rain: number): boolean {
  return fireRainBehaviour(peopleId) === 'indoor' && rain > 0 && rain >= balance.fire.indoorRainThreshold
}

/** The rain factor of a fire, roofed or open, at `rain` 0..1 (point 256): the
 *  one rule the village fire pit and the fishers' fire (point 1275) share. */
export function shelteredFireRainFactor(rain: number, sheltered: boolean): number {
  return fireRainFactor(rain, sheltered, balance.fire.shelteredRainDamp, balance.fire.openRainDamp)
}

/** Whether this people's fires stand under a cook-shelter, and the factor that
 *  `rain` damps their flame and light by. Read for the village fire pit and the
 *  fishers' fire alike, so a riverside village never keeps two answers. */
export function fireShelterResponse(peopleId: string | undefined, rain: number): { sheltered: boolean; rainFactor: number } {
  const sheltered = fireHasCookShelter(peopleId)
  return { sheltered, rainFactor: shelteredFireRainFactor(rain, sheltered) }
}
