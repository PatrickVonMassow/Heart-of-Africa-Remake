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
//  * NOT SHOWN — the dome-dwellers (Zulu, Maasai, Mbuti, San): a cook-canopy is
//    NOT attested for them; their accurate answer is the fire kept INDOORS
//    (invisible from outside). The Fang likewise keep an indoor hearth in a
//    closed bark-walled house. So their open fire is left UNSHELTERED — and the
//    period record says exactly that an unprotected flame is beaten down by
//    rain (peoples-1890 §9.3), which the rain-damping (`fireRainFactor`) shows.
//  * NOT SHOWN — the GAP peoples where the research says "do not assume" (Mongo,
//    Banda, Bambundu, Wayeyi, Somali, Sidama): no canopy invented for them.
//  * MOOT — the effectively rainless desert points (Tuareg, Nubian, Berber):
//    the rain-vs-fire question never arises (`climate-1890.md`), so whether a
//    canopy stands is immaterial; they are left without one.

/** Peoples whose village fire stands under a cook-shelter canopy (peoples-1890 §9.4/§9.5). */
const COOK_SHELTER_PEOPLES = new Set<string>([
  'baganda',
  'hausa',
  'bambara',
  'mandinka',
  'bemba',
  'lunda',
  'swahili',
])

/**
 * Whether this people's village fire is roofed by an open-sided cook-shelter
 * canopy (design.md §19.10, point 256). Attested/inferable compound peoples get
 * it; the dome-dwellers, the closed-house Fang, the GAP peoples and the rainless
 * desert points do not (peoples-1890 §9.5). Unknown/absent ids get no canopy.
 */
export function fireHasCookShelter(peopleId?: string): boolean {
  return peopleId ? COOK_SHELTER_PEOPLES.has(peopleId) : false
}
