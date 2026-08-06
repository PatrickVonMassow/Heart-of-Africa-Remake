// Jump-to targets of the debug menu (design.md §21.3): the picker lists every
// NAMED map point — ports, villages, monument sites, mountains, waterfalls,
// lakes, the built cultural landmarks and natural sites, the elephant graveyard
// and the tomb.
//
// A jump to an ENTERABLE place puts the traveller straight INSIDE it, in the
// first-person view: that is what a jump to a settlement is for, and what the
// jump effectively did before entry became key-only (point 244) — landing on
// the marker used to trigger the automatic entry. It goes through the ORDINARY
// entry path, so discovery, the port checkpoint and the orientation markers all
// happen exactly as on a walked-in entry; a debug jump is meant to reach the
// real state, not a special one. Every other target stays a bird's-eye jump.
//
// The classification is pure so the whole picker can be swept in the unit
// layer. It keys on the place ROSTER, not on the picker's grouping: Giza is
// listed twice (as the monument map point and as the cultural landmark of the
// same site, geo.ts landmarkLabelHiddenByMapPoint) and both entries must enter.

import { PLACES } from '../world/geo'

/**
 * The enterable place a jump-to picker value names, or null when the target is
 * a bird's-eye one (a landmark, the graveyard `#graveyard`, the tomb `#grave`).
 */
export function jumpTargetPlaceId(value: string): string | null {
  return PLACES.some((p) => p.id === value) ? value : null
}
