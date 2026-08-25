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
  /**
   * This thing already carries a PERMANENT label of its own — one its scene
   * draws whether the key is held or not (a pitched camp says "Camp" at all
   * times). Naming it again stacks two identical boxes over one object, which
   * reads as a defect rather than as an aid. Stated once here as a rule about
   * permanent labels, so it holds whoever draws them: the village elder, whose
   * own standing name showed the same doubling first, is simply left unmarked;
   * this flag is for an object that must STAY in the roster for the layer's
   * other readers.
   */
  permanentLabel?: boolean
  /**
   * Part of the TRAVELLER'S OWN outfit — the canoe he rides, or drags behind
   * him over land. The layer's promise is "what am I looking at", and the
   * player's own vehicle is not that. The same canoe SET DOWN in the world
   * carries no such flag and keeps its name.
   */
  ownedByPlayer?: boolean
}

/**
 * Can this thing MOVE, or can the player DO something with it? That is the
 * whole test (§17.8) — and it is answered by the roster above rather than by a
 * guess, so a plant, a rock, a house wall or a horizon silhouette simply is not
 * on it. The flags then take out what the roster alone cannot see: a name
 * already standing in the picture, and the player's own gear.
 */
export function qualifiesAsActor(c: ActorCandidate): boolean {
  if (c.mapPoint === true) return false
  if (c.concealed === true) return false
  if (c.permanentLabel === true) return false
  if (c.ownedByPlayer === true) return false
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

/** One label box as it would stand in the picture, in CSS pixels: the centre it
 *  is drawn around, its measured size, and how far its subject is from the
 *  camera. */
export interface ScreenLabel {
  x: number
  y: number
  width: number
  height: number
  /** Camera distance — the NEARER label keeps its place. */
  depth: number
}

/** Clear space demanded between two boxes, in CSS pixels. */
const LABEL_GAP = 3
/** How many line-steps a box may rise before it is dropped instead. Three keeps
 *  the highest label still plainly over its own subject; beyond that the label
 *  starts to point at the wrong figure, which is worse than saying nothing. */
const MAX_LIFT_STEPS = 3

/**
 * Keep two labels from fusing into one unreadable box. Returns, per label, how
 * far UP it must be drawn (0 = where it sits), or null when it must be dropped.
 *
 * Nearest first, so the subject the player is closest to keeps its place and a
 * further one yields: first by rising a line — which keeps it over its own
 * figure — and only when even the top step is taken by dropping out entirely.
 * The measured picture is the reason (point 628): two villagers standing close
 * printed "Villager llager" and "Villa Villager", each label correct and the
 * pair unreadable, while every DOM check went on passing.
 */
export function declutterLabels(labels: readonly ScreenLabel[]): (number | null)[] {
  const lifts: (number | null)[] = labels.map(() => null)
  const placed: ScreenLabel[] = []
  const order = labels.map((_, i) => i).sort((a, b) => labels[a].depth - labels[b].depth)
  for (const i of order) {
    const label = labels[i]
    const step = label.height + LABEL_GAP
    for (let s = 0; s <= MAX_LIFT_STEPS; s++) {
      const y = label.y - s * step
      const clash = placed.some(
        (p) =>
          Math.abs(p.x - label.x) < (p.width + label.width) / 2 + LABEL_GAP &&
          Math.abs(p.y - y) < (p.height + label.height) / 2 + LABEL_GAP,
      )
      if (clash) continue
      placed.push({ ...label, y })
      lifts[i] = s * step
      break
    }
  }
  return lifts
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
