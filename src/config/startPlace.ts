// A DEBUG start place, chosen from the URL (user 09.08.2026).
//
// design.md fixes the run's start at Cairo in 1890, and CLAUDE.md §2 forbids
// overriding a value the design states concretely. This is therefore not a
// change of the start: the DEFAULT stays Cairo, and only an explicit
// `?start=<placeId>` moves it, for testing a settlement without walking the
// continent first. The user asked for the Bambara village while the
// communication PoC is under repair — that village is where it is taught.
//
// It works in the PRODUCTION build on purpose, exactly like `?bench` and unlike
// the DEV-only `?seed`: the user tests the DEPLOYED page, so a dev-only switch
// would never reach him. The cost is that anyone who guesses the parameter can
// start elsewhere, which is harmless — every start state it can produce is one
// the game can reach by playing.
//
// Pure: no store, no window. The caller passes the search string.

import { PLACES } from '../world/geo'

/** The parameter's name — one place, so a test and the reader agree. */
export const START_PARAM = 'start'

/**
 * The place id the URL asks the run to start in, or null for the design's own
 * start. An id no place carries returns null rather than throwing: a mistyped
 * link must open the ordinary game, never a broken one.
 */
export function startPlaceFromUrl(search: string): string | null {
  const value = new URLSearchParams(search).get(START_PARAM)
  if (value === null) return null
  return PLACES.some((p) => p.id === value) ? value : null
}
