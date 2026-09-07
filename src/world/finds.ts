// Quest FINDS (design.md §6, docs/communication-poc-spec.md): a thing dug up on
// an errand, carried in the inventory bar and given by USING it before the
// person it is meant for — never by a use key at a door.
//
// A find rides OUTSIDE the pack capacity, is no trade stock and is never sold,
// and it leaves the bar the moment it is given. The list is open: every later
// errand find is added here and behaves the same way.
export const FIND_IDS = ['rockArtefact'] as const

/** One carried quest find. */
export type FindId = (typeof FIND_IDS)[number]
