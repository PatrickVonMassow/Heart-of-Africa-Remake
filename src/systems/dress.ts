// Cold-weather dress of the settlement inhabitants (design.md §19.13, TASKS
// point 120g). Pure: a people plus a coldness gives the cloak worn over the
// everyday dress, or none.
//
// This module is deliberately NARROW, and that is the finding, not a shortcut.
// `docs/peoples-1890.md` §2.6 asked exactly this question — "does the same
// person wear more in the cold?" — and the answer is yes for ONE of the game's
// peoples, from a period source, and evidence-absent for the rest:
//
//  * Zulu — YES, and directly. Franz Mayr (Anthropos 2(4), 1907; PERIOD) on the
//    isipuku ox-hide cloak: "greased and worn by day in cold weather as a cloak
//    by males and females. During the night this cloak served as sleeping
//    blanket." And: "On journeys or in cold weather women, like men, protect
//    themselves with blankets which take the place of the… skins formerly used
//    as cloaks." The cloak is ADDED OVER the everyday dress — the same figure,
//    visibly more.
//  * Tuareg, Sahel peoples (Hausa, Bambara, Mandinka) — NO. The research is
//    explicit: "Sahel harmattan: EVIDENCE ABSENT — do not invent", and the only
//    seasonal Tuareg claims found were 20th-century tourism copy. CLAUDE §2
//    forbids inventing design content, so they get nothing.
//  * San — the fur kaross as a cold-weather covering is reported, but from
//    TERTIARY sources only; the research marks the seasonal claim THIN.
//  * Ethiopian highlands (Sidama) — the principle is supported by Parkyns
//    (PERIOD: the poor wrapped in a single sheet "by day and by night"), but no
//    period account of kiremt-season dress was found, and the gabi-for-cold-
//    months detail is modern and thin.
//  * Basotho — period-correct blanket, but the game HAS no Basotho village and
//    the research warns outright: "Lesotho is not Zululand." The Pedi are a
//    different people; extending Mayr or the blanket to them would be exactly
//    the extrapolation §2.6 warns against.
//
// The structural inference the research does allow — that dress here is cloaks
// and wraps, so the honest seasonal signal is often HOW a garment is worn
// rather than how many are worn — is not modelled: at the figures' primitive
// fidelity a differently-drawn wrap would not read. Recorded as open in
// design.md §19.13 rather than faked.

import { COLD_DRESS_THRESHOLD } from './season'

/**
 * The Zulu cloak palette for 1890 — Mayr's "mid-transition", where both the
 * Skin-Zulu and the Blanket-Zulu are visible:
 *  * greased hide, which "appeared then black" (Mayr);
 *  * hide with red ochre (ibomvu) mixed into the grease (Mayr);
 *  * a PLAIN trade blanket — plain on purpose: the iconic patterned "Victoria
 *    England" design dates to 1897 and is an anachronism here.
 */
const ZULU_COLD_CLOAKS = ['#2a2420', '#6e3226', '#b9b2a4'] as const

/** Cloaks worn over the everyday dress, by people. Absent = no evidence. */
const COLD_CLOAKS: Record<string, readonly string[]> = {
  zulu: ZULU_COLD_CLOAKS,
}

/**
 * The cold-weather cloaks a people wears at this coldness, or null for "the
 * everyday dress, unchanged" — which is the correct answer for every people the
 * research found no period evidence for.
 */
export function coldCloaksFor(peopleId: string, coldness: number): readonly string[] | null {
  if (coldness < COLD_DRESS_THRESHOLD) return null
  return COLD_CLOAKS[peopleId] ?? null
}

/**
 * Pick a figure's cloak deterministically from its everyday cloth, so a village
 * shows Mayr's mid-transition mix rather than a uniform issue — without
 * threading a seed through every life vignette.
 *
 * Keyed on the cloth's POSITION in the settlement's own palette, not on a hash
 * of its colour: a village has only a handful of cloth colours, and hashing so
 * few strings collides badly — with the real southern palette two of the three
 * cloths hashed to the same cloak and the greased black hide, the most
 * characteristic of the three, never appeared at all. Indexing spreads the
 * cloaks evenly by construction. Cloth outside the palette falls back to the
 * hash rather than to a default cloak.
 */
export function cloakForCloth(
  cloaks: readonly string[],
  palette: readonly string[],
  cloth: string,
): string {
  const i = palette.indexOf(cloth)
  if (i >= 0) return cloaks[i % cloaks.length]
  // Fallback for cloth outside the palette. The avalanche step is not
  // decoration: a plain `hash * 31` taken mod a 3-cloak palette collides on
  // structured inputs — six near-identical colour strings all drew the SAME
  // cloak — because the low bits of such a hash barely move.
  let hash = 0
  for (const c of cloth) hash = (hash * 31 + c.charCodeAt(0)) | 0
  hash ^= hash >>> 16
  hash = Math.imul(hash, 0x45d9f3b)
  hash ^= hash >>> 16
  return cloaks[Math.abs(hash) % cloaks.length]
}
