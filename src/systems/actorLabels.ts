// Naming what ACTS on screen (design.md §17.8): while Ctrl is held, every
// animal, person and usable object on screen carries a small floating label
// saying WHAT it is — and only those. Scenery answers nothing.
//
// The decision and the wording live here, pure, because the layer runs over
// three unrelated rosters — the streamed bird's-eye fauna, the settlement's
// inhabitants and their animals, the usable objects — and a "should this be
// named?" check written at each of those call sites would drift apart. One
// predicate, one composer, both testable without a scene.

import type { Gender, Strings } from '../i18n/types'
import { SPECIES, type Species } from '../scenes/travel/animalBodies'

/** The bird's-eye fauna: the herd species plus the scavenging vultures. */
export type ActorFaunaKind = Species | 'vulture'
/** Settlement people, read by their ROLE — never by a name (§17.8). The last
 *  four are the Giza site's own ~1890 crowd (design.md §4.4). `elder` is the
 *  role's word for the vocabulary and the language files; the village elder
 *  himself is not marked, because he already carries a standing label of his
 *  own and the layer would only repeat it. */
export type ActorRoleKind =
  | 'elder'
  | 'trader'
  | 'porter'
  | 'villager'
  | 'child'
  | 'guide'
  | 'cameleer'
  | 'donkeyboy'
  | 'tourist'
/** Animals kept by people: the village stock and the Giza mounts. */
export type ActorTameKind = 'goat' | 'camel' | 'donkey'
/** Objects the player can use where they stand. */
export type ActorObjectKind = 'camp' | 'canoe'

export type ActorKind = ActorFaunaKind | ActorRoleKind | ActorTameKind | ActorObjectKind

/** Whether a thing is drawn as an adult or as a juvenile, where the game
 *  distinguishes the two at all. */
export type ActorAge = 'adult' | 'young'

/** Every kind this layer may name. Anything not listed is backdrop. */
export const ACTOR_KINDS: readonly ActorKind[] = [
  ...SPECIES,
  'vulture',
  'elder',
  'trader',
  'porter',
  'villager',
  'child',
  'guide',
  'cameleer',
  'donkeyboy',
  'tourist',
  'goat',
  'camel',
  'donkey',
  'camp',
  'canoe',
]

const ACTOR_KIND_SET = new Set<string>(ACTOR_KINDS)

/** What the scenes ask about — a species, a role, an object kind, or anything
 *  else they draw (a flora species, a map point, a wall). */
export interface ActorCandidate {
  kind: string
  /**
   * Deliberately hidden right now: the submerged crocodile of §19.16 waiting to
   * lunge. Naming it would end the ambush before it began, so a concealed
   * animal stays silent until it breaks cover.
   */
  concealed?: boolean
  /**
   * This candidate is a MAP POINT (a settlement or a landmark). Those carry
   * their own labels under the §17.2 discovery gate, so this layer never names
   * one — that is the rule which keeps it from leaking an undiscovered name.
   */
  mapPoint?: boolean
}

/**
 * Can this thing MOVE, or can the player DO something with it? That is the
 * whole test (§17.8) — and it is answered by the roster above rather than by a
 * guess, so a plant, a rock, a house wall or a horizon silhouette simply is not
 * on it.
 */
export function qualifiesAsActor(c: ActorCandidate): boolean {
  if (c.mapPoint === true) return false
  if (c.concealed === true) return false
  return ACTOR_KIND_SET.has(c.kind)
}

/** What one label is about: its kind, its age where the game has one, and its
 *  state where that state changes what is being looked at. */
export interface ActorDescriptor {
  kind: ActorKind
  age?: ActorAge
  /** A carcass — named as dead, since that is what the player sees. */
  dead?: boolean
}

function capitalizeFirst(s: string): string {
  return s.length === 0 ? s : s[0].toUpperCase() + s.slice(1)
}

/**
 * The label text, in the given language (§17.8): kind, then age where the game
 * distinguishes one, then state where it changes the picture.
 *
 * Never a concatenation of translated fragments: each language supplies the
 * noun WITH what it needs to inflect — for German the gender, and the young's
 * own word rather than a pasted-on prefix — so "Totes Giraffen-Jungtier" and
 * "Tote Giraffe" come out right instead of reading as machine translation.
 * The adult qualifier appears only where the kind HAS a young form: a villager
 * is a villager, not an "adult villager".
 */
export function actorLabelText(strings: Strings, d: ActorDescriptor): string {
  const entry = strings.actors.kinds[d.kind]
  const asYoung = d.age === 'young' && entry.young !== undefined
  const noun = asYoung ? (entry.young as string) : entry.noun
  const gender: Gender = asYoung ? strings.actors.youngGender : entry.gender
  const qualifier =
    d.dead === true
      ? strings.actors.dead[gender]
      : d.age === 'adult' && entry.young !== undefined
        ? strings.actors.adult[gender]
        : null
  return capitalizeFirst(qualifier === null ? noun : `${qualifier} ${noun}`)
}

/** Anything carrying a world position — the labels are ordered by distance. */
export interface Positioned {
  x: number
  y: number
  z: number
}

/**
 * The `max` labels NEAREST the viewer, the rest dropped (§17.8: "a reading aid,
 * not a radar"). A crowded savanna otherwise turns into a wall of text and the
 * frame pays for every one of them.
 */
export function nearestActors<T extends Positioned>(items: readonly T[], from: Positioned, max: number): T[] {
  if (max <= 0) return []
  if (items.length <= max) return [...items]
  const scored = items.map((it) => ({
    it,
    d: (it.x - from.x) ** 2 + (it.y - from.y) ** 2 + (it.z - from.z) ** 2,
  }))
  scored.sort((a, b) => a.d - b.d)
  return scored.slice(0, max).map((s) => s.it)
}
