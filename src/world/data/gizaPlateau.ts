// The Giza plateau is ONE real site that two systems declare (design.md §4.4):
// the built cultural landmark with its pyramid field, first-sighting entry and
// discovery bounty (data/landmarks.ts) and the ENTERABLE monument map point of
// point 273 (geo.ts). Both used to carry their own hand-placed coordinate and
// had drifted ~0.3° apart, so the bird's-eye view drew the plateau twice, in
// two places, with two labels. Both now derive from THIS constant, which is
// therefore the single source of the site's position and cannot drift again.
//
// The anchor is the real plateau's latitude just west of Cairo across the Nile
// (design.md §4.4) — the position the point-82 skyline and the world.test rim
// sweep were calibrated against — resolved ONCE against the rendered river
// band by the pyramid field's own radius, which is the larger of the two
// systems' clearances. Both consumers may run their own (smaller) clearance
// pass over it: it finds the anchor already clear and returns it unchanged, so
// the two records resolve to bit-identical coordinates.

import { RIVER_WIDTH_DEG } from '../riverWidth'
import { clearedOfRiversBy } from '../riverClearance'

/** Rendered spread of the Giza field from its mount (Sphinx east end), degrees. */
export const GIZA_FIELD_RADIUS_DEG = 0.35

/** Raw anchor: the real plateau, west of the Nile at Cairo's latitude. */
const GIZA_ANCHOR = { lat: 29.98, lon: 30.59 }

/** The one position of the Giza plateau — landmark AND monument map point. */
export const GIZA_PLATEAU: { readonly lat: number; readonly lon: number } = clearedOfRiversBy(
  GIZA_ANCHOR.lat,
  GIZA_ANCHOR.lon,
  RIVER_WIDTH_DEG + GIZA_FIELD_RADIUS_DEG,
)
