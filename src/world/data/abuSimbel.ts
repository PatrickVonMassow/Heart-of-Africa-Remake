// The rock temples of Abu Simbel are ONE real site that two systems declare
// (design.md §4.4), exactly as the Giza plateau is (./gizaPlateau): the built
// cultural landmark with its first-sighting entry and discovery bounty
// (data/landmarks.ts) and the ENTERABLE monument map point (geo.ts). Both read
// THIS constant, so the two records stay bit-identical and only the map
// point's label renders (geo.ts landmarkLabelHiddenByMapPoint).
//
// The anchor is the temples' ORIGINAL ~1890 position on the west bank, before
// the 1964-68 relocation lifted them ~65 m and set them ~200 m back from the
// river (docs/205-world-accuracy-findings.md §F). The relocated Great Temple
// stands at ~22.337 N, 31.626 E; 200 m toward the river is ~0.002° east. That
// offset is ~0.02 world units at 10 units/° — far below what the map resolves —
// so the original anchor is the relocated one nudged riverward and the rendered
// river band decides the rest: the field is pushed off the Nile by its own
// radius plus the band (riverClearance), which keeps it on the WEST bank (the
// model's Nile axis runs east of the anchor at this latitude).

import { RIVER_WIDTH_DEG } from '../riverWidth'
import { clearedOfRiversBy } from '../riverClearance'

/** Rendered spread of the bird's-eye temple cliff from its mount, degrees. */
export const ABU_SIMBEL_FIELD_RADIUS_DEG = 0.3

/** The original (pre-1964) Great Temple, ~200 m riverward of today's site. */
const ABU_SIMBEL_ANCHOR = { lat: 22.336, lon: 31.628 }

/** The one position of Abu Simbel — landmark AND monument map point. */
export const ABU_SIMBEL: { readonly lat: number; readonly lon: number } = clearedOfRiversBy(
  ABU_SIMBEL_ANCHOR.lat,
  ABU_SIMBEL_ANCHOR.lon,
  RIVER_WIDTH_DEG + ABU_SIMBEL_FIELD_RADIUS_DEG,
)
