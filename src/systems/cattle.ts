// Who kept cattle around 1890, and how many stand in a kraal at a date
// (work-order 359; research docs/peoples-1890.md §8.8, design.md §19.10).
//
// Every people of the roster resolves to ONE decided arrangement, each with the
// section it rests on or a guess with its reason (the dress table's rule). Only a
// `kraal` people keeps its cattle in the village enclosure the player walks
// past; a `herded` people owned cattle that stood elsewhere (with Fulani
// herdsmen, in the house byre, out at pasture), so the village shows none. The
// herd size follows the rinderpest phase of the VISIT DATE through the very
// function the first-visit vignette reads (`rinderpestPhaseAtDay`), so the kraal
// can never stand full while the journal speaks of the emutai.

import { VILLAGE_CATTLE } from '../config/balance'
import { rinderpestPhase, rinderpestPhaseAtDay } from './rinderpest'

export type CattleArrangement = 'kraal' | 'herded' | 'camels' | 'none'

type CattleSource = { section: string } | { guess: string }

interface CattleEntry {
  arrangement: CattleArrangement
  source: CattleSource
}

/** The per-people decision (docs/peoples-1890.md §8.8 carries the reasoning). */
export const PEOPLE_CATTLE: Record<string, CattleEntry> = {
  // The Central Cattle Pattern: the byre at the centre of the homestead.
  zulu: { arrangement: 'kraal', source: { section: '§8.8 Zulu — the isibaya at the umuzi centre' } },
  pedi: { arrangement: 'kraal', source: { section: '§1 "round huts about the cattle kraal"; §8.8' } },
  maasai: { arrangement: 'kraal', source: { section: '§4.0 the enkang kraal; §8.8' } },
  // Camel peoples: immune herds (FAO), no cattle in the camp.
  somali: { arrangement: 'camels', source: { section: '§5.1 camels are immune' } },
  tuareg: { arrangement: 'camels', source: { section: '§5.1; §4.0.1 camel caravans' } },
  // Cattle owned, but not standing in the village the player walks.
  hausa: { arrangement: 'herded', source: { section: '§4.0.1 Fulani herdsmen; §8.8' } },
  bambara: { arrangement: 'herded', source: { section: '§4.0.1 Fulani herdsmen; §8.8' } },
  mandinka: { arrangement: 'herded', source: { section: '§4.0.1 Fulani herdsmen; §8.8' } },
  nubians: { arrangement: 'herded', source: { section: '§5.1 Sanat Sitta took the herds; §8.8' } },
  sidama: { arrangement: 'herded', source: { section: '§5 Kifu Qen; §8.8 the house byre' } },
  baganda: { arrangement: 'herded', source: { section: '§5.1 cattle mainly as manure; §8.8' } },
  berbers: {
    arrangement: 'herded',
    source: { guess: 'High Atlas agro-pastoralists: sheep and goats on the hill pastures, a few cattle stabled in the house (§8.8)' },
  },
  wayeyi: {
    arrangement: 'herded',
    source: { guess: 'cattle held largely as Batawana loan cattle out on the flood-plain grazing, not in the village (§8.8)' },
  },
  // No cattle: the tsetse belt, the forest, the hunters, the stone town.
  bemba: { arrangement: 'none', source: { section: '§5.1 the Bemba were not a cattle people' } },
  fang: { arrangement: 'none', source: { section: '§5.1 tsetse-belt regions had few cattle; §8.8' } },
  mongo: { arrangement: 'none', source: { section: '§5.1 tsetse-belt regions had few cattle; §8.8' } },
  mbuti: { arrangement: 'none', source: { section: '§4.1 forest hunters; §8.8' } },
  banda: { arrangement: 'none', source: { section: '§5.1 tsetse-belt regions had few cattle; §8.8' } },
  lunda: { arrangement: 'none', source: { section: '§4.0.5 sedentary cultivators; §5.1 tsetse; §8.8' } },
  san: { arrangement: 'none', source: { section: '§4.1 client herding for Tswana cattle-holders; §8.8' } },
  bambundu: {
    arrangement: 'none',
    source: { guess: 'Kwanza valley in the tsetse belt, small stock only; the record is silent (§8.8)' },
  },
  swahili: {
    arrangement: 'none',
    source: { guess: 'Lamu is a coral-stone trading town; cattle are not part of its street (§8.8)' },
  },
}

/** The decided arrangement for a people; throws on an undecided one, so a new
 *  people cannot ship without the decision (the dress sweep's rule). */
export function cattleArrangement(peopleId: string): CattleArrangement {
  const e = PEOPLE_CATTLE[peopleId]
  if (!e) throw new Error(`cattle: no decided arrangement for people "${peopleId}"`)
  return e.arrangement
}

/**
 * Head of cattle standing in a people's village kraal at an in-game date
 * (month 1..12). Zero for every people that is not a `kraal` people. Pure.
 */
export function kraalHerdSize(peopleId: string, year: number, month: number): number {
  if (cattleArrangement(peopleId) !== 'kraal') return 0
  const c = VILLAGE_CATTLE
  const phase = rinderpestPhase(peopleId, year, month)
  let share: number
  if (phase === 'aftermath') {
    share = Math.min(1, c.aftermath.share + Math.max(0, year - c.aftermath.firstYear) * c.aftermath.perYear)
  } else {
    share = c.phaseShare[phase]
  }
  return Math.round(c.fullHerd * share)
}

/** The calendar date of an in-game day — the date glue `rinderpestPhaseAtDay`
 *  (and through it the first-visit vignette's `placeSituationAt`) uses. */
function dateOfDay(day: number, startYear: number): { year: number; month: number } {
  const d = new Date(Date.UTC(startYear, 0, 1) + Math.floor(day) * 86400000)
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

/** The herd at an in-game day. Its phase is the vignette's phase for that day
 *  (pinned against `rinderpestPhaseAtDay` in cattle.test.ts). */
export function kraalHerdSizeAtDay(peopleId: string, day: number, startYear: number): number {
  const { year, month } = dateOfDay(day, startYear)
  return kraalHerdSize(peopleId, year, month)
}

/** The rinderpest phase the herd was sized by — the vignette's own. */
export function kraalPhaseAtDay(peopleId: string, day: number, startYear: number): ReturnType<typeof rinderpestPhaseAtDay> {
  const { year, month } = dateOfDay(day, startYear)
  return rinderpestPhase(peopleId, year, month)
}
