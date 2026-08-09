// What the ADULTS say at their errands, and what visibly happens next
// (design.md §13.4, docs/communication-poc-spec.md, work-order point 483).
//
// The children teach the six general concepts at their game of tag
// (`childSituations.ts`). The adults teach the five the chief's message needs on
// top — RIVER, UPSTREAM, DOWNSTREAM, BIG_ROCK, DIG — and they always speak them
// TOGETHER with a concept the children already taught. That mixing is the whole
// method: the player knows what GO_THERE does, so an errand spoken as
// "GO_THERE + RIVER" leaves exactly one unknown, and the place the villager
// walks to is what fills it.
//
// FOUR RULES THE CATALOGUE IS BUILT ON, each of them a thing the teaching fails
// without:
//  1. RIVER NEVER COLLAPSES INTO "FETCH WATER". It is spoken at three errands
//     that have nothing to do with carrying water — someone SENT to the bank,
//     someone CALLED BACK from it, and one that BEGINS there — so the utterance
//     can only mean the place.
//  2. UPSTREAM AND DOWNSTREAM ARE MIRRORED. Each pair of errands is the same
//     situation walked the other way along the same bank, so the only thing that
//     differs between the two pictures is the direction and the one syllable run
//     that names it (`MIRRORED_ERRANDS`, pinned in the tests).
//  3. THE ROCK IS TAUGHT AWAY FROM THE DIRECTION. The teaching stone lies
//     upstream of the village, so an errand to the rock and an errand upstream
//     can produce the identical picture. At least one BIG_ROCK errand therefore
//     carries no upstream walk at all (`involvesUpstream: false`), or neither
//     concept is learnable.
//  4. DIG IS SHOWN, NOT NAMED. Every DIG errand ends in visible ground work at a
//     dig site the settlement draws — a store pit, a post hole, a patch worked
//     over — in more than one situation.
//
// The scheduler is the same FAIR QUEUE the children use: of the errands the
// village can cast right now, the one staged LEAST often goes next. A random
// pick starves whole concepts for a visit, and a concept nobody ever sees is a
// concept that cannot be learned. The dice are kept for the timing spread alone.
//
// Everything here is PURE — no THREE object, no clock, no store. The scene
// (PlaceLife) hands in a view of its villagers and of the places they can be
// sent to, plays what comes back and walks them through `errandOf`, which is
// what lets the whole teaching be pinned in the fast test layer.

import { phraseOf, type ConceptId, type Phrase } from '../../communication/lexicon'
import { devAssert } from '../../systems/devAssert'
import type { GestureKind } from '../../render/gesture'

/** Every errand the adults stage, in the catalogue's own order. */
export type ErrandSituationId =
  // RIVER
  | 'sendToTheBank'
  | 'callBackFromTheBank'
  | 'gatherAtTheBank'
  // UPSTREAM / DOWNSTREAM (two mirrored pairs)
  | 'sendUpTheBank'
  | 'sendDownTheBank'
  | 'haulUpTheBank'
  | 'haulDownTheBank'
  // BIG_ROCK
  | 'sendToTheStone'
  | 'callInFromUpstream'
  // DIG
  | 'digWhereIStand'
  | 'sendToThePostHole'
  | 'joinTheDigging'

/** A named place in and around the settlement an errand can be about. */
export type ErrandPlaceKind = 'bank' | 'upstream' | 'downstream' | 'stone' | 'dig'

/** What visibly happens after the utterance — the whole teaching. */
export type ErrandActionKind =
  /** The addressee walks to the named place and stays there a while. */
  | 'walkToTarget'
  /** The addressee walks back to the speaker. */
  | 'walkToSpeaker'
  /** The speaker walks to the named place and the addressee walks after it. */
  | 'followToTarget'
  /** The speaker digs where it already stands. */
  | 'digWhereSpoken'
  /** The addressee walks to a dig site and digs there. */
  | 'digAtTarget'

/**
 * Aim heights in world units for a grown figure (`FIGURE_LIMBS.shoulderY` is
 * 0.62 of the body height, and a villager is drawn at scale 1). Calibratable
 * shape, not balance: what matters is that a hand aimed at another villager
 * reads level and one aimed at the ground reads down.
 */
export const ERRAND_AIM = {
  /** Another villager's chest — where a call or a point at a person aims. */
  person: 0.62,
  /** The ground at a named spot, or at the speaker's own feet. */
  ground: 0.05,
} as const

/** How near a villager must stand to count as being AT a named place. */
export const AT_PLACE_RADIUS = 2.6

/**
 * How much nearer its target a villager must get for the step to call it
 * headway. Anything smaller is the wobble of a figure sliding along a wall or
 * walking a detour, not progress — and a detour that goes AROUND a hut may not
 * shorten the straight line for several seconds, which is why the stall window
 * itself (`stallSeconds`) is many times longer than one detour.
 */
const HEADWAY = 0.25

/** A point on the settlement ground. */
export interface ErrandPoint {
  x: number
  z: number
}

/** A patch of ground work the settlement draws, and villagers dig at. */
export interface DigSite extends ErrandPoint {
  kind: 'pit' | 'postHole' | 'patch'
}

/**
 * The places an errand can be about. Every one is nullable but `digSites`,
 * because a settlement need not have them: a village with no reachable bank
 * simply never stages the errands that need one, exactly as a child situation
 * that does not fit the phase is never staged. Nothing here is invented — the
 * scene passes what its layout actually draws.
 */
export interface ErrandGeography {
  /** The walkable river bank (work-order 482). */
  bank: ErrandPoint | null
  /** The far end of the walkable stretch AGAINST the current. */
  upstream: ErrandPoint | null
  /** The far end of the walkable stretch WITH the current. */
  downstream: ErrandPoint | null
  /** The village's teaching stone (work-order 482). */
  stone: ErrandPoint | null
  digSites: readonly DigSite[]
}

/** One villager as the errands see it. */
export interface ErrandVillager {
  x: number
  z: number
  /** Whether it can be given a new errand right now (outside, and not on one). */
  free: boolean
}

/** The live village an errand is cast from. */
export interface ErrandView {
  villagers: readonly ErrandVillager[]
  geography: ErrandGeography
}

/** A world point a gesture is aimed at. */
export interface AimPoint {
  x: number
  y: number
  z: number
}

/** Who plays which part in a staged errand, and where its walk ends. */
export interface ErrandCasting {
  speaker: number
  /** Who the action falls on; empty when the speaker acts alone. */
  addressees: number[]
  aim: AimPoint
  /** Where the errand's walk ends. */
  walkTo: ErrandPoint
  /** What that destination IS — `speaker` for a call back. */
  walkPlace: ErrandPlaceKind | 'speaker'
}

/** One entry of the catalogue. */
export interface ErrandSituation {
  id: ErrandSituationId
  /**
   * The PHRASE, in spoken order: the new concept and the known one it is
   * mixed with. Adults speak phrases where the children speak single atoms —
   * atoms separated by the constant pause and by nothing else
   * (docs/communication-poc-spec.md).
   */
  concepts: readonly ConceptId[]
  /** The one of the five landscape/action concepts this errand teaches. */
  teaches: ConceptId
  gesture: GestureKind
  action: ErrandActionKind
  /**
   * Whether the picture contains a walk along the UPSTREAM stretch. Rule 3
   * hangs on this: at least one BIG_ROCK errand must have it false.
   */
  involvesUpstream: boolean
  cast: (view: ErrandView) => ErrandCasting | null
}

/** What the scene is handed when an errand is staged. */
export interface SpokenErrand {
  id: ErrandSituationId
  concepts: readonly ConceptId[]
  /** The atoms actually spoken, in order. */
  utterances: Phrase
  gesture: GestureKind
  action: ErrandActionKind
  speaker: number
  addressees: number[]
  aim: AimPoint
  walkTo: ErrandPoint
  walkPlace: ErrandPlaceKind | 'speaker'
}

/** Everything the adults' errands need beyond the catalogue — all calibratable
 *  (`balance.villageLife.adultErrands`, debug-editable). */
export interface AdultErrandConfig {
  /** Seconds between two staged errands. */
  intervalSeconds: number
  /** Random spread of that interval, 0..1 (0 = a metronome). */
  intervalSpread: number
  /** How long a villager stays at the place it was sent to. */
  dwellSeconds: number
  /** How long a bout of visible digging lasts. */
  digSeconds: number
  /** Backstop: an errand never outlives this, however the walk goes. */
  errandSeconds: number
  /**
   * How long a villager may make NO headway toward what it was sent to before
   * the errand is given up and it is free to be spoken to again. The backstop
   * above is far too coarse for that on its own: it is twenty staged errands
   * long, so a village of four whose walks cannot complete stands silent for
   * minutes at a time (measured, work-order point 586).
   */
  stallSeconds: number
  /**
   * The dev-mode alarm window: no errand staged for this long while the village
   * could stage one is a defect, not a quiet spell, and says so (`devAssert`).
   */
  silenceSeconds: number
  /** The pace a villager walks at while carrying out an errand (m/s). */
  pace: number
}

/** What one villager is doing because of what was just said. */
export interface ErrandAssignment {
  situation: ErrandSituationId
  /** Walking somewhere, walking after someone, or digging where it stands. */
  kind: 'walk' | 'follow' | 'dig'
  /** Where it is headed (for `follow`, refreshed from the leader each step). */
  x: number
  z: number
  /** What that destination is. */
  place: ErrandPlaceKind | 'speaker'
  /** The villager being followed, for `follow`. */
  follow?: number
  /** Whether it has reached the destination (the scene reports this). */
  arrived: boolean
  /** Seconds it still stays once arrived — the dwell or the digging bout. */
  dwell: number
  /** Seconds before the errand is abandoned however the walk goes. */
  seconds: number
  /** The nearest this villager has yet come to its target — what headway is
   *  measured against. Infinity until the first step measures it. */
  best: number
  /** Seconds it has made no headway (for a follower: seconds with no leader
   *  left to walk after). Past `stallSeconds` the errand is let go. */
  stall: number
}

/** The scheduler's own memory. Plain data — the scene holds one per visit. */
export interface AdultErrandState {
  /** Seconds until the next errand may be staged. */
  cooldown: number
  /** The errand last staged, and how long ago. */
  last: {
    id: ErrandSituationId
    concepts: readonly ConceptId[]
    speaker: number
    addressees: number[]
    age: number
  } | null
  /** One slot per villager; null when it is doing nothing in particular. */
  assignments: (ErrandAssignment | null)[]
  /** How often each errand has been staged this visit — the probe a live check
   *  and the dev hook read. */
  staged: Record<ErrandSituationId, number>
  /** Seconds since the last errand was staged. The alarm below reads it, and so
   *  does the dev hook — a village that has gone quiet says how long ago. */
  silence: number
}

const dist = (a: ErrandPoint, b: ErrandPoint) => Math.hypot(a.x - b.x, a.z - b.z)

/** The named place a villager is standing at, or null when it is in the open. */
export function placeOf(view: ErrandView, index: number): ErrandPlaceKind | null {
  const v = view.villagers[index]
  if (!v) return null
  const g = view.geography
  for (const [kind, point] of [
    ['bank', g.bank],
    ['upstream', g.upstream],
    ['downstream', g.downstream],
    ['stone', g.stone],
  ] as const) {
    if (point && dist(v, point) <= AT_PLACE_RADIUS) return kind
  }
  for (const site of g.digSites) if (dist(v, site) <= AT_PLACE_RADIUS) return 'dig'
  return null
}

/** Every villager that can be given an errand, nearest a point first. */
function freeNear(view: ErrandView, near: ErrandPoint, ...exclude: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < view.villagers.length; i++) {
    if (exclude.includes(i) || !view.villagers[i].free) continue
    out.push(i)
  }
  // Ties keep the lower index, so a cast never flickers between two villagers
  // standing abreast.
  return out.sort((a, b) => dist(view.villagers[a], near) - dist(view.villagers[b], near))
}

/** The first free villager standing at a named place, or −1. */
function freeAt(view: ErrandView, kind: ErrandPlaceKind, ...exclude: number[]): number {
  for (let i = 0; i < view.villagers.length; i++) {
    if (exclude.includes(i) || !view.villagers[i].free) continue
    if (placeOf(view, i) === kind) return i
  }
  return -1
}

/** The first free villager NOT standing at a named place, or −1. */
function freeAwayFrom(view: ErrandView, kind: ErrandPlaceKind, ...exclude: number[]): number {
  for (let i = 0; i < view.villagers.length; i++) {
    if (exclude.includes(i) || !view.villagers[i].free) continue
    if (placeOf(view, i) !== kind) return i
  }
  return -1
}

/** A dig site of a kind, or the first of any kind; null when there is none. */
function digSite(view: ErrandView, kind?: DigSite['kind']): DigSite | null {
  const sites = view.geography.digSites
  if (sites.length === 0) return null
  if (kind) {
    const hit = sites.find((s) => s.kind === kind)
    if (hit) return hit
  }
  return sites[0]
}

const atPerson = (view: ErrandView, index: number): AimPoint => ({
  x: view.villagers[index].x,
  y: ERRAND_AIM.person,
  z: view.villagers[index].z,
})

const atGround = (point: ErrandPoint): AimPoint => ({
  x: point.x,
  y: ERRAND_AIM.ground,
  z: point.z,
})

/**
 * ONE villager is sent to a named place while the speaker stays put — the shape
 * both direction errands and the rock errand share, so the two directions can
 * differ in NOTHING but the point walked to (rule 2).
 */
function castSendTo(
  view: ErrandView,
  point: ErrandPoint | null,
  place: ErrandPlaceKind,
): ErrandCasting | null {
  if (!point) return null
  const speaker = freeAwayFrom(view, place)
  if (speaker < 0) return null
  const candidates = freeNear(view, point, speaker)
  if (candidates.length === 0) return null
  return {
    speaker,
    addressees: [candidates[0]],
    aim: atGround(point),
    walkTo: { x: point.x, z: point.z },
    walkPlace: place,
  }
}

/**
 * The speaker walks the stretch itself and takes another villager along — the
 * second shape of the direction pair, and again identical for both directions.
 */
function castHaulTo(
  view: ErrandView,
  point: ErrandPoint | null,
  place: ErrandPlaceKind,
): ErrandCasting | null {
  if (!point) return null
  const speaker = freeAwayFrom(view, place)
  if (speaker < 0) return null
  const asked = freeNear(view, view.villagers[speaker], speaker)
  if (asked.length === 0) return null
  return {
    speaker,
    addressees: [asked[0]],
    aim: atPerson(view, asked[0]),
    walkTo: { x: point.x, z: point.z },
    walkPlace: place,
  }
}

/**
 * THE CATALOGUE. Twelve errands: three that name the RIVER, two mirrored pairs
 * for the two directions, two for the stone and three that end in ground work.
 * Every phrase mixes one of the five new concepts with one the children already
 * taught, and every entry ends in something the player can watch happen.
 */
export const ERRAND_SITUATIONS: readonly ErrandSituation[] = [
  {
    // "That way — the river." Someone is sent down to the bank and walks there.
    id: 'sendToTheBank',
    concepts: ['GO_THERE', 'RIVER'],
    teaches: 'RIVER',
    gesture: 'indicate',
    action: 'walkToTarget',
    involvesUpstream: false,
    cast: (view) => castSendTo(view, view.geography.bank, 'bank'),
  },
  {
    // "The river — come." The one standing at the water is called back up, so
    // the utterance is heard with a walk AWAY from the river as well as toward
    // it: it can only be naming the place.
    id: 'callBackFromTheBank',
    concepts: ['RIVER', 'COME'],
    teaches: 'RIVER',
    gesture: 'beckon',
    action: 'walkToSpeaker',
    involvesUpstream: false,
    cast: (view) => {
      if (!view.geography.bank) return null
      const called = freeAt(view, 'bank')
      if (called < 0) return null
      const speaker = freeAwayFrom(view, 'bank', called)
      if (speaker < 0) return null
      return {
        speaker,
        addressees: [called],
        aim: atPerson(view, called),
        walkTo: { x: view.villagers[speaker].x, z: view.villagers[speaker].z },
        walkPlace: 'speaker',
      }
    },
  },
  {
    // "The river — here." The errand BEGINS at the bank: the speaker stands in
    // the water's edge, names the ground under its own feet and another
    // villager comes down to it.
    id: 'gatherAtTheBank',
    concepts: ['RIVER', 'HERE'],
    teaches: 'RIVER',
    gesture: 'point',
    action: 'walkToTarget',
    involvesUpstream: false,
    cast: (view) => {
      if (!view.geography.bank) return null
      const speaker = freeAt(view, 'bank')
      if (speaker < 0) return null
      const bank = view.villagers[speaker]
      const candidates = freeNear(view, bank, speaker).filter((i) => placeOf(view, i) !== 'bank')
      if (candidates.length === 0) return null
      return {
        speaker,
        addressees: [candidates[0]],
        aim: atGround(bank),
        walkTo: { x: bank.x, z: bank.z },
        walkPlace: 'bank',
      }
    },
  },
  {
    // "That way — upstream." The walk runs against the visible current.
    id: 'sendUpTheBank',
    concepts: ['GO_THERE', 'UPSTREAM'],
    teaches: 'UPSTREAM',
    gesture: 'indicate',
    action: 'walkToTarget',
    involvesUpstream: true,
    cast: (view) => castSendTo(view, view.geography.upstream, 'upstream'),
  },
  {
    // Its MIRROR, and nothing else about it differs: the same words but one,
    // the same gesture, the same walk — down the bank with the current.
    id: 'sendDownTheBank',
    concepts: ['GO_THERE', 'DOWNSTREAM'],
    teaches: 'DOWNSTREAM',
    gesture: 'indicate',
    action: 'walkToTarget',
    involvesUpstream: false,
    cast: (view) => castSendTo(view, view.geography.downstream, 'downstream'),
  },
  {
    // "Upstream — follow." Two villagers walk the stretch together.
    id: 'haulUpTheBank',
    concepts: ['UPSTREAM', 'FOLLOW'],
    teaches: 'UPSTREAM',
    gesture: 'beckon',
    action: 'followToTarget',
    involvesUpstream: true,
    cast: (view) => castHaulTo(view, view.geography.upstream, 'upstream'),
  },
  {
    // Its mirror, down the bank.
    id: 'haulDownTheBank',
    concepts: ['DOWNSTREAM', 'FOLLOW'],
    teaches: 'DOWNSTREAM',
    gesture: 'beckon',
    action: 'followToTarget',
    involvesUpstream: false,
    cast: (view) => castHaulTo(view, view.geography.downstream, 'downstream'),
  },
  {
    // "That way — the big rock." THE ERRAND WITH NO UPSTREAM WALK: the stone
    // stands in the village and the walk to it leaves the river out of the
    // picture entirely, which is the only way the rock and the direction can be
    // told apart (rule 3).
    id: 'sendToTheStone',
    concepts: ['GO_THERE', 'BIG_ROCK'],
    teaches: 'BIG_ROCK',
    gesture: 'indicate',
    action: 'walkToTarget',
    involvesUpstream: false,
    cast: (view) => castSendTo(view, view.geography.stone, 'stone'),
  },
  {
    // "The big rock — come." Spoken FROM the stone to a villager out on the
    // upstream stretch, so the rock is named while a walk along the river is in
    // the picture — the confusable case rule 3 is contrasted against.
    id: 'callInFromUpstream',
    concepts: ['BIG_ROCK', 'COME'],
    teaches: 'BIG_ROCK',
    gesture: 'beckon',
    action: 'walkToSpeaker',
    involvesUpstream: true,
    cast: (view) => {
      if (!view.geography.stone || !view.geography.upstream) return null
      const speaker = freeAt(view, 'stone')
      if (speaker < 0) return null
      const called = freeAt(view, 'upstream', speaker)
      if (called < 0) return null
      return {
        speaker,
        addressees: [called],
        aim: atPerson(view, called),
        walkTo: { x: view.villagers[speaker].x, z: view.villagers[speaker].z },
        walkPlace: 'speaker',
      }
    },
  },
  {
    // "Dig — here." The speaker is already standing on the patch and starts
    // working it the moment it has said so: utterance and ground work with
    // nothing in between.
    id: 'digWhereIStand',
    concepts: ['DIG', 'HERE'],
    teaches: 'DIG',
    gesture: 'point',
    action: 'digWhereSpoken',
    involvesUpstream: false,
    cast: (view) => {
      const speaker = freeAt(view, 'dig')
      if (speaker < 0) return null
      const me = view.villagers[speaker]
      return {
        speaker,
        addressees: [],
        aim: atGround(me),
        walkTo: { x: me.x, z: me.z },
        walkPlace: 'dig',
      }
    },
  },
  {
    // "That way — dig." Someone is sent to the post hole and digs it out there.
    id: 'sendToThePostHole',
    concepts: ['GO_THERE', 'DIG'],
    teaches: 'DIG',
    gesture: 'indicate',
    action: 'digAtTarget',
    involvesUpstream: false,
    cast: (view) => {
      const site = digSite(view, 'postHole')
      if (!site) return null
      const speaker = freeAwayFrom(view, 'dig')
      if (speaker < 0) return null
      const candidates = freeNear(view, site, speaker)
      if (candidates.length === 0) return null
      return {
        speaker,
        addressees: [candidates[0]],
        aim: atGround(site),
        walkTo: { x: site.x, z: site.z },
        walkPlace: 'dig',
      }
    },
  },
  {
    // "Dig — come." A villager at work calls another over to the same patch,
    // and the second one digs beside it.
    id: 'joinTheDigging',
    concepts: ['DIG', 'COME'],
    teaches: 'DIG',
    gesture: 'beckon',
    action: 'digAtTarget',
    involvesUpstream: false,
    cast: (view) => {
      const speaker = freeAt(view, 'dig')
      if (speaker < 0) return null
      const me = view.villagers[speaker]
      const candidates = freeNear(view, me, speaker).filter((i) => placeOf(view, i) !== 'dig')
      if (candidates.length === 0) return null
      return {
        speaker,
        addressees: [candidates[0]],
        aim: atPerson(view, candidates[0]),
        // Beside the speaker, not on its toes: two figures work the one patch.
        walkTo: { x: me.x + 1.2, z: me.z },
        walkPlace: 'dig',
      }
    },
  },
]

/** The catalogue by id — consumers look an errand up rather than search. */
export const ERRAND_BY_ID: Readonly<Record<ErrandSituationId, ErrandSituation>> =
  Object.fromEntries(ERRAND_SITUATIONS.map((s) => [s.id, s])) as Record<
    ErrandSituationId,
    ErrandSituation
  >

/** The five concepts the adults teach, in the catalogue's order. */
export const ADULT_CONCEPTS: readonly ConceptId[] = [
  ...new Set(ERRAND_SITUATIONS.map((s) => s.teaches)),
]

/**
 * The mirrored errand pairs (rule 2): the same situation walked the other way
 * along the same bank. Pinned in the tests against the catalogue AND against the
 * lexicon's own mirror pair, so a later edit cannot quietly break the symmetry
 * the whole direction teaching rests on.
 */
export const MIRRORED_ERRANDS: readonly (readonly [ErrandSituationId, ErrandSituationId])[] = [
  ['sendUpTheBank', 'sendDownTheBank'],
  ['haulUpTheBank', 'haulDownTheBank'],
]

/** A fresh scheduler for a group of `count` villagers. */
export function createAdultErrands(count: number, cfg: AdultErrandConfig): AdultErrandState {
  const staged = {} as Record<ErrandSituationId, number>
  for (const s of ERRAND_SITUATIONS) staged[s.id] = 0
  return {
    // The first errand waits one interval: a village that speaks on the frame it
    // mounts speaks before the player has seen it.
    cooldown: Math.max(0, cfg.intervalSeconds),
    last: null,
    assignments: Array.from({ length: Math.max(0, count) }, () => null),
    staged,
    silence: 0,
  }
}

/** The assignment a villager is carrying out, or null. */
export function errandOf(state: AdultErrandState, index: number): ErrandAssignment | null {
  return state.assignments[index] ?? null
}

/** Whether a villager is visibly digging right now (the scene's dig pose). */
export function isDigging(state: AdultErrandState, index: number): boolean {
  const a = state.assignments[index]
  return !!a && a.kind === 'dig' && a.arrived && a.dwell > 0
}

/** The scene reports that a villager reached where it was sent; the dwell (or
 *  the digging bout) starts here rather than on a clock the module cannot see. */
export function noteErrandArrival(
  state: AdultErrandState,
  index: number,
  cfg: AdultErrandConfig,
): void {
  const a = state.assignments[index]
  if (!a || a.arrived) return
  // A FOLLOWER is not there until the one it follows is. Without this it would
  // "arrive" the moment it caught up — a step from its own doorway — and stand
  // watching the leader walk the stretch alone, which is the opposite of the
  // picture the two direction errands are supposed to teach.
  if (a.kind === 'follow' && a.follow !== undefined) {
    const lead = state.assignments[a.follow]
    if (lead && !lead.arrived) return
  }
  a.arrived = true
  a.dwell = Math.max(0, a.kind === 'dig' ? cfg.digSeconds : cfg.dwellSeconds)
}

/** Drops a villager's errand — the scene does this when it takes the figure out
 *  of play (streamed out, unmounted, or nudged free of a wedge). */
export function clearErrand(state: AdultErrandState, index: number): void {
  if (index >= 0 && index < state.assignments.length) state.assignments[index] = null
}

/** Gives a villager its part of a staged errand. */
function assign(
  state: AdultErrandState,
  view: ErrandView,
  index: number,
  assignment: Omit<ErrandAssignment, 'arrived' | 'dwell' | 'seconds' | 'best' | 'stall'>,
  cfg: AdultErrandConfig,
): void {
  if (index < 0 || index >= state.assignments.length) return
  const me = view.villagers[index]
  // Already standing there (the speaker that digs where it spoke): the dwell
  // starts at once rather than waiting for an arrival that never comes.
  const there = !!me && Math.hypot(me.x - assignment.x, me.z - assignment.z) <= AT_PLACE_RADIUS
  state.assignments[index] = {
    ...assignment,
    arrived: assignment.kind === 'follow' ? false : there,
    dwell: there && assignment.kind !== 'follow'
      ? Math.max(0, assignment.kind === 'dig' ? cfg.digSeconds : cfg.dwellSeconds)
      : 0,
    seconds: Math.max(0.1, cfg.errandSeconds),
    best: me ? Math.hypot(me.x - assignment.x, me.z - assignment.z) : Infinity,
    stall: 0,
  }
}

/** Sets the assignments a staged errand's action calls for. */
function applyAction(
  state: AdultErrandState,
  view: ErrandView,
  event: SpokenErrand,
  cfg: AdultErrandConfig,
): void {
  const to = { x: event.walkTo.x, z: event.walkTo.z, place: event.walkPlace }
  switch (event.action) {
    case 'walkToTarget':
    case 'walkToSpeaker':
      for (const i of event.addressees) {
        assign(state, view, i, { situation: event.id, kind: 'walk', ...to }, cfg)
      }
      break
    case 'followToTarget':
      // The SPEAKER makes the walk and the addressee goes after it — the shape
      // that tells FOLLOW apart from COME, and here it carries the direction.
      assign(state, view, event.speaker, { situation: event.id, kind: 'walk', ...to }, cfg)
      for (const i of event.addressees) {
        assign(
          state,
          view,
          i,
          { situation: event.id, kind: 'follow', ...to, follow: event.speaker },
          cfg,
        )
      }
      break
    case 'digWhereSpoken':
      assign(state, view, event.speaker, { situation: event.id, kind: 'dig', ...to }, cfg)
      break
    case 'digAtTarget':
      for (const i of event.addressees) {
        assign(state, view, i, { situation: event.id, kind: 'dig', ...to }, cfg)
      }
      break
  }
}

/** Stages one errand and books it. */
function stage(
  state: AdultErrandState,
  view: ErrandView,
  situation: ErrandSituation,
  casting: ErrandCasting,
  cfg: AdultErrandConfig,
  rand: () => number,
): SpokenErrand {
  const event: SpokenErrand = {
    id: situation.id,
    concepts: situation.concepts,
    utterances: phraseOf(situation.concepts),
    gesture: situation.gesture,
    action: situation.action,
    speaker: casting.speaker,
    addressees: [...casting.addressees],
    aim: casting.aim,
    walkTo: casting.walkTo,
    walkPlace: casting.walkPlace,
  }
  applyAction(state, view, event, cfg)
  const spread = Math.max(0, Math.min(1, cfg.intervalSpread))
  state.cooldown = Math.max(0.1, cfg.intervalSeconds * (1 + (rand() * 2 - 1) * spread))
  state.last = {
    id: event.id,
    concepts: event.concepts,
    speaker: event.speaker,
    addressees: event.addressees,
    age: 0,
  }
  state.staged[event.id]++
  state.silence = 0
  return event
}

/** Whether this settlement draws anything an errand could be about at all. A
 *  village with no bank, no stone and no dig site legitimately says nothing. */
function hasErrandPlaces(view: ErrandView): boolean {
  const g = view.geography
  return !!(g.bank || g.upstream || g.downstream || g.stone) || g.digSites.length > 0
}

/**
 * THE ARMED INVARIANT (point 207(i), work-order point 586): a village that CAN
 * stage errands and has not staged one for the stated window is broken, and says
 * so — in every headless suite, whose console-error gates fail on it, and in
 * every manual session.
 *
 * This defect class is invisible in a screenshot and invisible in a test that
 * simulates seconds: the adults went quiet after MINUTES of play, and no suite
 * ran that long. What a picture cannot show, the running game reports itself.
 *
 * The guards are what a healthy village legitimately needs to speak at all: two
 * villagers (all but one errand casts a speaker AND an addressee) and somewhere
 * to send them. Measured on a healthy village, the longest quiet spell is ~25 s,
 * so the default window sits well clear of it.
 */
function assertStillSpeaking(
  state: AdultErrandState,
  view: ErrandView,
  cfg: AdultErrandConfig,
): void {
  const window = Math.max(1, cfg.silenceSeconds)
  devAssert(
    view.villagers.length < 2 || !hasErrandPlaces(view) || state.silence <= window,
    'errands-silent',
    () =>
      `no adult has spoken for ${state.silence.toFixed(0)}s of ${window}s — ` +
      `${view.villagers.length} villagers, ${view.villagers.filter((v) => !v.free).length} of them on an errand`,
  )
}

/**
 * Ages one unfinished assignment's STALL counter — the measure of whether the
 * errand is still going anywhere.
 *
 * A walker is judged by the ground it covers toward its target: every step that
 * brings it nearer than it has ever been resets the counter, and everything else
 * — pressed against a fence, sent to a spot inside a collider, sent somewhere
 * the route cannot reach — adds to it.
 *
 * A FOLLOWER cannot be judged that way: it walks at its leader's pace and so
 * never closes the gap, and measuring it would abandon exactly the two errands
 * whose picture IS the pair walking the stretch together. It is bounded by the
 * leader instead — once nobody is on that errand ahead of it any more, there is
 * nothing left to walk after.
 */
function ageStall(
  state: AdultErrandState,
  view: ErrandView,
  index: number,
  a: ErrandAssignment,
  step: number,
): void {
  if (a.kind === 'follow' && a.follow !== undefined) {
    const lead = state.assignments[a.follow]
    if (lead && lead.situation === a.situation) a.stall = 0
    else a.stall += step
    return
  }
  const me = view.villagers[index]
  const d = me ? Math.hypot(me.x - a.x, me.z - a.z) : Infinity
  if (d < a.best - HEADWAY) {
    a.best = d
    a.stall = 0
  } else a.stall += step
}

/**
 * One step of the adults' errands. Ages the running assignments and the
 * cooldown, and stages at most ONE errand — never two in a frame, so an
 * utterance is always alone with the walk that explains it.
 *
 * Returns the staged errand, or null when nothing was said this step.
 */
export function stepAdultErrands(
  state: AdultErrandState,
  view: ErrandView,
  dt: number,
  cfg: AdultErrandConfig,
  rand: () => number,
): SpokenErrand | null {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0
  // The roster is fixed for a visit, but a group that changed size keeps its
  // slots in step rather than steering a villager that is no longer there.
  if (state.assignments.length !== view.villagers.length) {
    state.assignments = Array.from(
      { length: view.villagers.length },
      (_, i) => state.assignments[i] ?? null,
    )
  }
  for (let i = 0; i < state.assignments.length; i++) {
    const a = state.assignments[i]
    if (!a) continue
    a.seconds -= step
    if (a.arrived) a.dwell -= step
    else ageStall(state, view, i, a, step)
    // Done, given up on, or getting nowhere: either way the villager goes back
    // to its routine — and is free to be spoken to again, which is the whole
    // point. A village whose walkers all hang on an errand they cannot finish
    // has nobody left to stage one for, and falls silent for good (point 586).
    const stalled = !a.arrived && a.stall > Math.max(0.1, cfg.stallSeconds)
    if ((a.arrived && a.dwell <= 0) || a.seconds <= 0 || stalled) state.assignments[i] = null
    else if (a.kind === 'follow' && a.follow !== undefined) {
      // The leader is the target, so the destination travels with it.
      const lead = view.villagers[a.follow]
      if (lead) {
        a.x = lead.x
        a.z = lead.z
      }
    }
  }
  if (state.last) state.last.age += step
  state.silence += step
  assertStillSpeaking(state, view, cfg)
  state.cooldown -= step
  if (state.cooldown > 0) return null
  if (view.villagers.length === 0) {
    state.cooldown = Math.max(0.1, cfg.intervalSeconds)
    return null
  }

  // THE ROTATION IS A FAIR QUEUE, not a cursor walking the catalogue: the
  // LEAST-staged errand the village can cast right now goes next, ties in the
  // catalogue's own order. A cursor starves exactly the errands that need
  // someone already standing somewhere — and an errand nobody ever sees is a
  // concept that cannot be learned.
  let next: ErrandSituation | null = null
  let nextCasting: ErrandCasting | null = null
  let fewest = Infinity
  for (const situation of ERRAND_SITUATIONS) {
    if (state.staged[situation.id] >= fewest) continue
    const casting = situation.cast(view)
    if (!casting) continue
    if (casting.speaker < 0 || casting.speaker >= view.villagers.length) continue
    if (casting.addressees.some((i) => i < 0 || i >= view.villagers.length || i === casting.speaker))
      continue
    next = situation
    nextCasting = casting
    fewest = state.staged[situation.id]
  }
  if (next && nextCasting) return stage(state, view, next, nextCasting, cfg, rand)
  // Nothing castable in this state — ask again shortly rather than every frame.
  state.cooldown = Math.max(0.1, cfg.intervalSeconds * 0.25)
  return null
}
