// In-world language lore (design.md §13.2): the regional direction systems
// and the glossary of landmark names in the local tongues. The words are
// in-world constants and identical in every UI language; only the prose
// around them is localized. Words not fixed by design.md (e.g. the North's
// remaining wind names) are invented in the same spirit and marked so.

import type { RegionId } from './geo'

/** Direction words per region (design.md §13.2). */
export const DIRECTION_WORDS: Record<RegionId, { north: string; south: string; east: string; west: string }> = {
  // Directions named after the origin of the wind; "Nivera" = north is fixed
  // by design.md, the other three wind names are invented placeholders.
  north: { north: 'Nivera', south: 'Chamsina', east: 'Levantra', west: 'Gharbia' },
  // Fixed by design.md.
  west: { north: 'koko', south: 'Phuthswama', east: 'Katula', west: 'Mimbumi' },
  // Relative to "Utomba", the great river (Mongdamara/Congo); the prefixes
  // are invented placeholders.
  central: { north: 'wa-Utomba', south: 'ka-Utomba', east: 'lem-Utomba', west: 'mos-Utomba' },
  // Relative to "Odabi" (the holy mountain Unumpara); Relolo/Dethamee are
  // fixed by design.md, the other two are invented placeholders.
  east: { north: 'Relolo', south: 'Dethamee', east: 'Salewa', west: 'Munjori' },
  // Seasons as directions (design.md §13.2); the season words themselves are
  // localized in the templates: summer = north, winter = south,
  // spring = east, autumn = west.
  south: { north: 'summer', south: 'winter', east: 'spring', west: 'autumn' },
}

/** Landmarks in the local tongue (design.md §13.2 glossary). */
export const GLOSSARY = {
  congo: 'Mongdamara',
  congoAlt: 'El Mora Levimara',
  zambezi: 'Lastwana',
  victoriaFalls: 'Gumba lu Untoba',
  kilimanjaro: 'Unumpara',
  elephants: 'Galumba',
  elephantsAlt: 'Ut-hu Manbwama',
} as const

/** Unspecific knowledge (design.md §13.2/§13.3). */
export const UNSPECIFIC_WORDS = ['Oz Oz', 'Oink Oink', 'Auke Auke'] as const
