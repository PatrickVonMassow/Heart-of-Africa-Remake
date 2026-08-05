// Which journal entry an arrival writes (design.md §16, point 394).
//
// Entering a first-person scene for the FIRST time always writes an entry, and
// re-entering writes one when the place's situation (../systems/placeSituation)
// has changed since it was last journaled. A port, a village and a monument
// share nothing but the fact of arrival, so each kind has its own text key and
// its own sketch; the store only looks the reference up here, and the i18n
// completeness sweep resolves the SAME references, so a place that ships
// without a text fails the unit layer rather than the player's journal.
//
// The village keys keep their point-170 parameter name (`phase`): journal
// entries are stored language-neutrally in the save, so a renamed parameter
// would break the rendering of entries already written.

import type { TextRef } from '../i18n'
import type { PlaceDef, PlaceKind } from '../world/geo'
import type { SketchId } from './sketches'

export interface ArrivalEntry {
  title: TextRef
  text: TextRef
  sketch: SketchId
}

/** Sketch beside the entry, per kind (the pyramids read as the mountain nib). */
const SKETCH_BY_KIND: Record<PlaceKind, SketchId> = {
  port: 'harbor',
  village: 'hut',
  monument: 'mountain',
}

/**
 * First-entry references per kind. A `Record<PlaceKind, …>` on purpose (the
 * point-335 rule): a new walkable kind cannot ship silent — it does not
 * compile until its own arrival text is named here.
 */
const FIRST_BY_KIND: Record<PlaceKind, (place: PlaceDef, situation: string) => ArrivalEntry> = {
  port: (place, situation) => ({
    title: { key: 'journal.titles.arrival', params: { place: place.id } },
    text: { key: 'journal.portFirstVisit', params: { place: place.id, situation } },
    sketch: SKETCH_BY_KIND.port,
  }),
  village: (place, situation) => ({
    title: { key: 'journal.titles.village', params: { place: place.id } },
    text: {
      key: 'journal.villageFirstVisit',
      params: { place: place.id, people: place.peopleId ?? '', phase: situation },
    },
    sketch: SKETCH_BY_KIND.village,
  }),
  monument: (place, situation) => ({
    title: { key: 'journal.titles.monument', params: { place: place.id } },
    text: { key: 'journal.monumentFirstVisit', params: { place: place.id, situation } },
    sketch: SKETCH_BY_KIND.monument,
  }),
}

/** Return-entry references per kind — the entry that describes ONLY what has
 *  changed since the place was last journaled. */
const RETURN_BY_KIND: Record<PlaceKind, (place: PlaceDef, from: string, to: string) => ArrivalEntry> = {
  port: (place, from, to) => ({
    title: { key: 'journal.titles.portReturn', params: { place: place.id } },
    text: {
      key: 'journal.portReturn',
      params: { place: place.id, fromSituation: from, toSituation: to },
    },
    sketch: SKETCH_BY_KIND.port,
  }),
  village: (place, from, to) => ({
    title: { key: 'journal.titles.villageReturn', params: { place: place.id } },
    text: {
      key: 'journal.villageReturn',
      params: { place: place.id, people: place.peopleId ?? '', fromPhase: from, toPhase: to },
    },
    sketch: SKETCH_BY_KIND.village,
  }),
  monument: (place, from, to) => ({
    title: { key: 'journal.titles.monumentReturn', params: { place: place.id } },
    text: {
      key: 'journal.monumentReturn',
      params: { place: place.id, fromSituation: from, toSituation: to },
    },
    sketch: SKETCH_BY_KIND.monument,
  }),
}

/** The entry written when this place is entered for the first time. */
export function firstArrivalEntry(place: PlaceDef, situation: string): ArrivalEntry {
  return FIRST_BY_KIND[place.kind](place, situation)
}

/** The entry written when this place is re-entered in a changed situation. */
export function returnArrivalEntry(place: PlaceDef, from: string, to: string): ArrivalEntry {
  return RETURN_BY_KIND[place.kind](place, from, to)
}
