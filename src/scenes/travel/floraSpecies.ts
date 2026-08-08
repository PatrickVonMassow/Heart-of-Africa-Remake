// The bird's-eye flora and dressing roster (design.md §19.9): what the travel
// scene scatters over the terrain in instanced meshes.
//
// It lives in its own module so a test can sweep the REAL list — the Ctrl label
// layer (§17.8) must name none of these, and a roster mirrored into a test
// would drift the moment a plant is added. TravelScene renders them.

export type FloraSpecies =
  | 'acacia'
  | 'jungle'
  | 'palm'
  | 'bush'
  | 'rock'
  | 'baobab'
  | 'termite'
  | 'deadtree'
  | 'papyrus'
  | 'kopje'

export const FLORA_SPECIES: FloraSpecies[] = [
  'acacia', 'jungle', 'palm', 'bush', 'rock',
  'baobab', 'termite', 'deadtree', 'papyrus', 'kopje',
]
