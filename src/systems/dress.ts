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

/**
 * The Tuareg cold-weather cloak. Barth, PERIOD, in the mountains on 13 December:
 * a cold wind made the chief "shiver and regard with feelings of envy my thick
 * black bernús"; and of the principal people, "a red bernus thrown across their
 * shoulders". Black and red, and — the point of `rankOnly` — a garment the chief
 * envied rather than owned.
 */
const TUAREG_BERNUS = ['#211d1a', '#7a2d24'] as const

/**
 * The Hausa zenne, the shoulder plaid Barth compares to a Highlander's. Kano
 * wove and dyed it: his own export list names the white-and-black thick-thread
 * "gádo" and the dark-blue turkedi, and Kano's indigo is the region's signature.
 */
const HAUSA_ZENNE = ['#e6e2d6', '#2a2a2e', '#26355c'] as const

/**
 * The San ‡nau — a rectangular leather cloak (Passarge, p. 34), the same object
 * whether it hangs from one shoulder or closes over both. One tanned-hide tone,
 * because the CONFIGURATION is the season here, not the colour.
 */
const SAN_NAU = ['#6b5136', '#7d6242'] as const

/** The Wayeyi light caross, made of the goat skins Andersson says they rear for it. */
const WAYEYI_CAROSS = ['#8a7355', '#6d5a42'] as const

/**
 * The Somali tobe: a cotton sheet, and Swayne notes some are "dipped in red clay
 * and are of a bright burnt-sienna colour" — imported cloth, not hide.
 */
const SOMALI_TOBE = ['#e8e4d8', '#a85a35'] as const

/** Which driver a people's seasonal dress answers to (see systems/season.ts). */
export type DressDriver = 'coldness' | 'harmattan' | 'karif'

/** How the wrap sits when the season calls for it. */
export type DressWear = 'shoulders' | 'head'

export interface SeasonalDress {
  /** The wrap's colours; pick per figure with `cloakForCloth`. */
  cloaks: readonly string[]
  /** Only a person of rank or wealth wears it — the poor have nothing extra. */
  rankOnly: boolean
  /** Over the shoulders, or drawn up over the head. */
  wear: DressWear
}

interface DressRule extends SeasonalDress {
  driver: DressDriver
}

/**
 * The seasonal dress of each people the record supports — and ONLY those. The
 * six below are the whole of it; every other people wears the same dress in
 * January and in July, which is the researched answer and not an omission (see
 * `docs/peoples-1890.md` §7: across seven independent period observers, not one
 * describes a person putting ON a seasonal garment; the recorded answer to cold
 * is fire, shelter and architecture).
 *
 * Note how little of this is "an extra coat": two of the six are gated on RANK
 * (the cold is a class experience — Barth's schoolboys sat at a pre-dawn fire
 * "with scarcely a rag of a shirt on" while the wealthy man had his plaid), and
 * two are a garment already on the body being worn DIFFERENTLY.
 */
const SEASONAL_DRESS: Record<string, DressRule> = {
  // Mayr 1907, PERIOD, the one unambiguous case: the isipuku ox-hide cloak,
  // "greased and worn by day in cold weather as a cloak by males and females".
  zulu: { driver: 'coldness', cloaks: ZULU_COLD_CLOAKS, rankOnly: false, wear: 'shoulders' },
  // Barth, PERIOD. INFERRED that it is seasonal rather than merely occasional —
  // indicia: the bernus is THE anti-cold garment of these caravans, there is an
  // in-language idiom for an anti-cold remedy (magani-n-dari) whose referent is
  // a cloak, and the game's Tuareg village sits at 2110 m in the Ahaggar, where
  // winter nights freeze. Rank-gated because Barth's chief envied his.
  tuareg: { driver: 'coldness', cloaks: TUAREG_BERNUS, rankOnly: true, wear: 'shoulders' },
  // Barth, PERIOD, and explicitly wealth-gated: "Only the wealthier amongst them
  // can afford the 'zenne' or shawl, thrown over the shoulder like the plaid of
  // the Highlanders." Keyed to the harmattan, not to coldness: the annual swing
  // at 12N is small and coldnessAt correctly says so, while the January dawn is
  // genuinely cold — which is why harmattanAt exists as its own driver.
  hausa: { driver: 'harmattan', cloaks: HAUSA_ZENNE, rankOnly: true, wear: 'shoulders' },
  // Passarge, PERIOD, gives two configurations of the ‡nau — from the right
  // shoulder, or "über beiden Schultern… unter dem Kinn zusammengeknüpft".
  // INFERRED that the cold picks the closed one: he attributes the choice to
  // "Laune und Absicht", so the weather link comes from Andersson's identical
  // garment class 350 km north (below). Marked, and deliberately not upgraded.
  san: { driver: 'coldness', cloaks: SAN_NAU, rankOnly: false, wear: 'shoulders' },
  // Andersson 1856, PERIOD and VERBATIM — the only case needing no inference at
  // all: the light caross "which they accommodate to the body according to the
  // state of the weather".
  wayeyi: { driver: 'coldness', cloaks: WAYEYI_CAROSS, rankOnly: false, wear: 'shoulders' },
  // Swayne 1895, PERIOD, on this people in the game's own decade: "In cold
  // weather the head is muffled up in it after the fashion of an Algerian
  // 'burnouse.'" The karif, not coldness — see karifAt for why they disagree.
  somali: { driver: 'karif', cloaks: SOMALI_TOBE, rankOnly: false, wear: 'head' },
}

/** This frame's seasonal drivers at a place (from systems/season.ts). */
export interface DressDrivers {
  coldness: number
  harmattan: number
  karif: number
}

/**
 * The seasonal dress a people wears under these drivers, or null for "the
 * everyday dress, unchanged".
 *
 * Null is the answer for most of the roster, and it is a FINDING rather than a
 * gap — the peoples the research found no period evidence for stay bare however
 * cold their ground gets. The named traps: "Sahel harmattan: EVIDENCE ABSENT —
 * do not invent"; the Tuareg seasonal claims found were 20th-century tourism
 * copy; the Basotho blanket belongs to a people the game does not have ("Lesotho
 * is not Zululand"), so it never reaches the Pedi — whose village sits at 853 m
 * and has no frost to dress against anyway.
 */
export function seasonalDressFor(peopleId: string, d: DressDrivers): SeasonalDress | null {
  const rule = SEASONAL_DRESS[peopleId]
  if (!rule) return null
  const strength = rule.driver === 'coldness' ? d.coldness : rule.driver === 'harmattan' ? d.harmattan : d.karif
  if (strength < COLD_DRESS_THRESHOLD) return null
  return { cloaks: rule.cloaks, rankOnly: rule.rankOnly, wear: rule.wear }
}

/**
 * Whether THIS figure is one of the few who owns a rank-gated wrap.
 *
 * Keyed on the cloth's position in the settlement's palette, like the wrap's
 * colour: the FIRST cloth in the palette is the notable's. That keeps it
 * deterministic and stable per figure, and it keeps the proportion right — a
 * village dresses from three cloths, so roughly a third of the figures carry the
 * plaid and the rest stand bare at the fire, which is the class split Barth
 * describes rather than a uniform issue.
 */
export function wearsByRank(cloth: string, palette: readonly string[]): boolean {
  return palette.indexOf(cloth) === 0
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
