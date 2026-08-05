// What the children SAY at their game of tag, and what happens next
// (design.md §13.4, docs/communication-poc-spec.md, work-order point 481).
//
// The children teach the six general concepts — COME, GO_THERE, FOLLOW, HERE,
// THERE, NO. Nothing here translates anything: a situation is one atomic
// utterance, the gesture the speaker makes while it says it, and the ACTION
// that visibly follows. The meaning lives in that third part alone, which is
// why every entry of the catalogue carries one.
//
// THREE RULES THE CATALOGUE IS BUILT ON, each of them a thing the mechanic
// fails without:
//  1. ONE ATOM PER SITUATION. A situation never speaks a phrase — a player who
//     hears two atoms in one situation cannot tell which of them the action
//     belongs to.
//  2. EVERY CONCEPT IN MORE THAN ONE SITUATION. Heard in a single situation an
//     utterance reads as a rule of the game ("this is what you shout when you
//     are IT"), not as a word.
//  3. THE TWO LOOK-ALIKES ARE STAGED APART. COME and FOLLOW both end with
//     someone moving toward the speaker: COME is spoken at least once by a
//     child STANDING STILL, while FOLLOW's caller is always running away.
//     GO_THERE and THERE both point at a distant spot: GO_THERE is always
//     followed by the addressee walking there, THERE at least once by nobody
//     moving at all.
//
// The scheduler is a FAIR QUEUE, not a die roll: of the situations the live
// game can cast right now, the one staged LEAST often goes next. A random pick
// can starve a situation for a whole visit, and a situation nobody ever sees is
// a concept that cannot be learned. Two kinds are offered out of that turn — a
// REFUSAL, which only ever answers the call just spoken, and a MOMENT, whose
// state (a catch has just happened) is gone again within seconds. The dice are
// kept for the timing spread and for whether a call is refused.
//
// Everything here is PURE — no THREE object, no clock, no store. The scene
// (PlaceLife) hands in a view of the running game, plays what comes back and
// steers the children through `childSteer`, which is what lets the whole
// teaching be pinned in the fast test layer.

import { utteranceOf, type ConceptId, type UtteranceId } from '../../communication/lexicon'
import type { GestureKind } from '../../render/gesture'
import { headingToward } from '../../systems/pursuit'

/** Every situation the children stage, in the catalogue's own order. */
export type ChildSituationId =
  // COME
  | 'gatherBeforeTheRound'
  | 'callTheStrayIn'
  // GO_THERE
  | 'sendToTheFarSide'
  | 'sendClearOfTheChaser'
  // FOLLOW
  | 'fleeTogether'
  | 'breakAwayTogether'
  // HERE
  | 'claimTheSpot'
  | 'caughtHere'
  // THERE
  | 'pointAtTheFarThing'
  | 'pointOutTheChaser'
  // NO
  | 'refuseToFollow'
  | 'refuseToCome'

/**
 * What visibly happens AFTER the utterance. This is the whole teaching: the
 * gesture shows that something is meant, the action shows WHAT.
 * `noOneMoves` is an action too, and deliberately so — it is the staged
 * stillness that tells THERE apart from GO_THERE.
 */
export type SituationActionKind =
  | 'comeToSpeaker'
  | 'walkToSpot'
  | 'runAfterSpeaker'
  | 'holdTheSpot'
  | 'noOneMoves'
  | 'refuserStaysPut'

/** Whether the speaker stands still while it speaks, or is on the run. */
export type SpeakerMotion = 'still' | 'running'

/** When a situation can be staged: between rounds, during one, or either. */
export type SituationPhase = 'break' | 'chase' | 'any'

/**
 * Aim heights in world units for a child figure (KID_SCALE 0.55 of the shared
 * proportions). Calibratable shape, not balance: what matters is that a hand
 * aimed at a distant person reads level and one aimed at the ground reads down.
 */
export const AIM_HEIGHT = {
  /** Chest of another child — the height a call or a point at a person aims at. */
  person: 0.33,
  /** The ground at the speaker's own feet (HERE) or at a named spot. */
  ground: 0.05,
  /** Something well beyond the play ground: aimed level, out over the village. */
  far: 0.6,
} as const

/** One child as the situations see it — a subset of the chase's own state. */
export interface SituationChild {
  x: number
  z: number
  /** Travel heading, `atan2(dx, dz)`. */
  heading: number
}

/** The live game a situation is cast from. */
export interface SituationView {
  /** Whether a round is running; false during the break between rounds. */
  playing: boolean
  /** Index of IT, −1 during the break. */
  chaser: number
  /** The chaser's current quarry, −1 when it has none. */
  target: number
  /** The freshly tagged child under its immunity, −1 when there is none. */
  immune: number
  children: readonly SituationChild[]
  /** The play ground: where the children are, and where a named spot may lie. */
  ground: { x: number; z: number; radius: number }
  /** A fixed feature well outside the play ground — what THERE points at. */
  farMark: { x: number; z: number }
}

/** A world point a gesture is aimed at. */
export interface AimPoint {
  x: number
  y: number
  z: number
}

/** Who plays which part in a staged situation. */
export interface Casting {
  speaker: number
  /** Who the action falls on; empty when nobody moves. */
  addressees: number[]
  aim: AimPoint
  /** The named spot, for the situations that send someone to one. */
  spot?: { x: number; z: number }
}

/** One entry of the catalogue. */
export interface ChildSituation {
  id: ChildSituationId
  concept: ConceptId
  gesture: GestureKind
  action: SituationActionKind
  phase: SituationPhase
  speaker: SpeakerMotion
  /**
   * True only for a reply — a situation that answers the call just spoken.
   * A reply is offered out of turn, because an answer that arrives three
   * utterances later answers nothing.
   */
  repliesTo?: ConceptId[]
  /**
   * A MOMENT rather than a turn: a situation whose state is rare and short
   * (a catch has just happened) is offered ahead of the rotation while it
   * lasts, and leaves the rotation where it stood. Waiting for its turn to come
   * round would mean it was never staged at all — measured, the tag immunity
   * it hangs on lasts 1.4 s against an utterance every six.
   */
  moment?: boolean
  /**
   * Casts the parts from the live game, or null when it cannot be staged now.
   * A REPLY carries none: it is cast from the call it answers (`castReply`),
   * because its speaker is the child that call named.
   */
  cast?: (view: SituationView) => Casting | null
}

/** What the scene is handed when a situation is staged. */
export interface SpokenSituation {
  id: ChildSituationId
  concept: ConceptId
  /** The ONE atom spoken. Never a phrase (rule 1). */
  utterance: UtteranceId
  gesture: GestureKind
  action: SituationActionKind
  speaker: number
  addressees: number[]
  aim: AimPoint
  spot: { x: number; z: number } | null
  /** Whether the speaker stands still while it speaks (the COME/FOLLOW mark). */
  speakerMotion: SpeakerMotion
}

/** Everything the children's speech needs beyond the catalogue — all
 *  calibratable (`balance.villageLife.childSpeech`, debug-editable). */
export interface ChildSpeechConfig {
  /** Seconds between two staged situations. */
  intervalSeconds: number
  /** Random spread of that interval, 0..1 (0 = a metronome). */
  intervalSpread: number
  /** How long a following action steers the child it falls on. */
  actionSeconds: number
  /** The pace a child moves at while it carries out what it was told (m/s). */
  actionPace: number
  /** Chance that a call is answered with a refusal instead of obeyed. */
  refusalChance: number
  /** How long after a call a refusal still reads as its answer. */
  replySeconds: number
}

/** What one child is doing because of what was just said. */
export interface ChildIntent {
  kind: 'toSpeaker' | 'toSpot' | 'afterSpeaker' | 'stay'
  /** Seconds left of it. */
  seconds: number
  /** The child being walked or run to, for the two that follow someone. */
  follow?: number
  /** The named spot, for `toSpot`. */
  x?: number
  z?: number
}

/** The scheduler's own memory. Plain data — the scene holds one per visit. */
export interface ChildSpeechState {
  /** Seconds until the next situation may be staged. */
  cooldown: number
  /** A refusal owed to the call just spoken, or null. */
  pendingReply: ChildSituationId | null
  /** The situation last staged, and how long ago. */
  last: {
    id: ChildSituationId
    concept: ConceptId
    speaker: number
    addressees: number[]
    age: number
  } | null
  /** One slot per child; null when that child is doing nothing in particular. */
  intents: (ChildIntent | null)[]
  /** How often each situation has been staged this visit — the probe a live
   *  check and the dev hook read. */
  staged: Record<ChildSituationId, number>
}

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z)

/** Every child index except the ones named. */
function othersThan(view: SituationView, ...exclude: number[]): number[] {
  const out: number[] = []
  for (let i = 0; i < view.children.length; i++) if (!exclude.includes(i)) out.push(i)
  return out
}

/** The children neither chasing nor being chased — the ones with a free moment. */
function freeRunners(view: SituationView): number[] {
  return othersThan(view, view.chaser, view.target)
}

/** The index of `pool` nearest a point; −1 for an empty pool. Ties keep the
 *  lower index, so a cast never flickers between two children abreast. */
function nearestOf(view: SituationView, pool: readonly number[], x: number, z: number): number {
  let best = -1
  let bestD = Infinity
  for (const i of pool) {
    const d = dist(view.children[i], { x, z })
    if (d < bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** The index of `pool` furthest from a point; −1 for an empty pool. */
function furthestOf(view: SituationView, pool: readonly number[], x: number, z: number): number {
  let best = -1
  let bestD = -1
  for (const i of pool) {
    const d = dist(view.children[i], { x, z })
    if (d > bestD) {
      bestD = d
      best = i
    }
  }
  return best
}

/** A world aim at another child's chest. */
function atPerson(view: SituationView, index: number): AimPoint {
  const c = view.children[index]
  return { x: c.x, y: AIM_HEIGHT.person, z: c.z }
}

/**
 * A spot on the play ground away from `from`: the ground's own rim on the far
 * side, pulled in a little so a child sent there is not sent onto the edge.
 * Deterministic — the same game always names the same spot.
 */
function spotAwayFrom(view: SituationView, from: { x: number; z: number }): { x: number; z: number } {
  const dx = view.ground.x - from.x
  const dz = view.ground.z - from.z
  const len = Math.hypot(dx, dz)
  const r = view.ground.radius * 0.75
  if (len < 1e-6) return { x: view.ground.x + r, z: view.ground.z }
  return { x: view.ground.x + (dx / len) * r, z: view.ground.z + (dz / len) * r }
}

/**
 * THE CATALOGUE. Twelve situations, two per concept (rule 2), each with its
 * gesture and its following action (rule 3 is carried by `gatherBeforeTheRound`
 * — a still speaker — and by `pointAtTheFarThing` — nobody moves afterwards).
 *
 * GO_THERE and THERE deliberately share the `indicate` gesture, and COME and
 * FOLLOW deliberately share `beckon`: the look-alikes are SUPPOSED to look
 * alike, or there would be nothing for the player to work out. What tells each
 * pair apart is the third column — what happens next.
 */
export const CHILD_SITUATIONS: readonly ChildSituation[] = [
  {
    // A child in the middle of the ground calls the others in before a round
    // starts. THE STANDING CALLER — the anchor of the COME/FOLLOW contrast.
    id: 'gatherBeforeTheRound',
    concept: 'COME',
    gesture: 'beckon',
    action: 'comeToSpeaker',
    phase: 'break',
    speaker: 'still',
    cast: (view) => {
      if (view.children.length < 2) return null
      const all = othersThan(view)
      const speaker = nearestOf(view, all, view.ground.x, view.ground.z)
      if (speaker < 0) return null
      const called = othersThan(view, speaker)
      if (called.length === 0) return null
      const furthest = furthestOf(view, called, view.children[speaker].x, view.children[speaker].z)
      return { speaker, addressees: called, aim: atPerson(view, furthest) }
    },
  },
  {
    // Mid-round, a child with a free moment calls another over to it.
    id: 'callTheStrayIn',
    concept: 'COME',
    gesture: 'beckon',
    action: 'comeToSpeaker',
    phase: 'chase',
    speaker: 'running',
    cast: (view) => {
      const free = freeRunners(view)
      if (free.length < 2) return null
      const speaker = nearestOf(view, free, view.ground.x, view.ground.z)
      const called = furthestOf(
        view,
        free.filter((i) => i !== speaker),
        view.children[speaker].x,
        view.children[speaker].z,
      )
      if (called < 0) return null
      return { speaker, addressees: [called], aim: atPerson(view, called) }
    },
  },
  {
    // One child sends another to a spot across the ground, and it walks there.
    id: 'sendToTheFarSide',
    concept: 'GO_THERE',
    gesture: 'indicate',
    action: 'walkToSpot',
    phase: 'break',
    speaker: 'still',
    cast: (view) => {
      if (view.children.length < 2) return null
      const all = othersThan(view)
      const speaker = furthestOf(view, all, view.ground.x, view.ground.z)
      if (speaker < 0) return null
      const sent = nearestOf(
        view,
        all.filter((i) => i !== speaker),
        view.children[speaker].x,
        view.children[speaker].z,
      )
      if (sent < 0) return null
      const spot = spotAwayFrom(view, view.children[sent])
      return {
        speaker,
        addressees: [sent],
        aim: { x: spot.x, y: AIM_HEIGHT.ground, z: spot.z },
        spot,
      }
    },
  },
  {
    // Mid-round: one runner sends another out of the chaser's line, and it goes.
    id: 'sendClearOfTheChaser',
    concept: 'GO_THERE',
    gesture: 'indicate',
    action: 'walkToSpot',
    phase: 'chase',
    speaker: 'running',
    cast: (view) => {
      if (view.chaser < 0) return null
      const free = freeRunners(view)
      if (free.length < 2) return null
      const chaser = view.children[view.chaser]
      const speaker = nearestOf(view, free, chaser.x, chaser.z)
      const sent = furthestOf(
        view,
        free.filter((i) => i !== speaker),
        chaser.x,
        chaser.z,
      )
      if (sent < 0) return null
      const spot = spotAwayFrom(view, chaser)
      return {
        speaker,
        addressees: [sent],
        aim: { x: spot.x, y: AIM_HEIGHT.ground, z: spot.z },
        spot,
      }
    },
  },
  {
    // The hunted child asks another along as it runs — the caller is running
    // AWAY, which is what tells FOLLOW from COME.
    id: 'fleeTogether',
    concept: 'FOLLOW',
    gesture: 'beckon',
    action: 'runAfterSpeaker',
    phase: 'chase',
    speaker: 'running',
    cast: (view) => {
      if (view.target < 0 || view.chaser < 0) return null
      const free = freeRunners(view)
      if (free.length === 0) return null
      const speaker = view.target
      const asked = nearestOf(view, free, view.children[speaker].x, view.children[speaker].z)
      if (asked < 0) return null
      return { speaker, addressees: [asked], aim: atPerson(view, asked) }
    },
  },
  {
    // A child breaking away from the chase takes another with it.
    id: 'breakAwayTogether',
    concept: 'FOLLOW',
    gesture: 'beckon',
    action: 'runAfterSpeaker',
    phase: 'chase',
    speaker: 'running',
    cast: (view) => {
      if (view.chaser < 0) return null
      const free = freeRunners(view)
      if (free.length < 2) return null
      const chaser = view.children[view.chaser]
      const speaker = furthestOf(view, free, chaser.x, chaser.z)
      const asked = nearestOf(
        view,
        free.filter((i) => i !== speaker),
        view.children[speaker].x,
        view.children[speaker].z,
      )
      if (asked < 0) return null
      return { speaker, addressees: [asked], aim: atPerson(view, asked) }
    },
  },
  {
    // A child plants itself somewhere, points at its own feet and names the
    // spot — and stays standing on it.
    id: 'claimTheSpot',
    concept: 'HERE',
    gesture: 'point',
    action: 'holdTheSpot',
    phase: 'break',
    speaker: 'still',
    cast: (view) => {
      const all = othersThan(view)
      const speaker = furthestOf(view, all, view.ground.x, view.ground.z)
      if (speaker < 0) return null
      const c = view.children[speaker]
      return { speaker, addressees: [], aim: { x: c.x, y: AIM_HEIGHT.ground, z: c.z } }
    },
  },
  {
    // The child that has just tagged someone stands where it happened and names
    // that spot.
    id: 'caughtHere',
    concept: 'HERE',
    gesture: 'point',
    action: 'holdTheSpot',
    phase: 'chase',
    speaker: 'running',
    moment: true,
    cast: (view) => {
      const speaker = view.immune
      if (speaker < 0 || speaker >= view.children.length || speaker === view.chaser) return null
      const c = view.children[speaker]
      return { speaker, addressees: [], aim: { x: c.x, y: AIM_HEIGHT.ground, z: c.z } }
    },
  },
  {
    // A child points at something well beyond the play ground and names it.
    // NOBODY MOVES afterwards — the anchor of the GO_THERE/THERE contrast.
    id: 'pointAtTheFarThing',
    concept: 'THERE',
    gesture: 'indicate',
    action: 'noOneMoves',
    phase: 'break',
    speaker: 'still',
    cast: (view) => {
      const all = othersThan(view)
      const speaker = nearestOf(view, all, view.farMark.x, view.farMark.z)
      if (speaker < 0) return null
      return {
        speaker,
        addressees: [],
        aim: { x: view.farMark.x, y: AIM_HEIGHT.far, z: view.farMark.z },
      }
    },
  },
  {
    // Mid-round a child points out the chaser, far off across the ground.
    // Nobody is sent anywhere by it.
    id: 'pointOutTheChaser',
    concept: 'THERE',
    gesture: 'indicate',
    action: 'noOneMoves',
    phase: 'chase',
    speaker: 'running',
    cast: (view) => {
      if (view.chaser < 0) return null
      const free = freeRunners(view)
      if (free.length === 0) return null
      const chaser = view.children[view.chaser]
      const speaker = furthestOf(view, free, chaser.x, chaser.z)
      if (speaker < 0) return null
      return { speaker, addressees: [], aim: atPerson(view, view.chaser) }
    },
  },
  {
    // Asked along, and refusing: the child shakes its arms out and stays where
    // it is while the one that asked runs on alone.
    id: 'refuseToFollow',
    concept: 'NO',
    gesture: 'refuse',
    action: 'refuserStaysPut',
    phase: 'any',
    speaker: 'still',
    repliesTo: ['FOLLOW'],
  },
  {
    // Called in, and refusing: the same answer to the other call.
    id: 'refuseToCome',
    concept: 'NO',
    gesture: 'refuse',
    action: 'refuserStaysPut',
    phase: 'any',
    speaker: 'still',
    repliesTo: ['COME'],
  },
]

/** The catalogue by id — consumers look a situation up rather than search. */
export const CHILD_SITUATION_BY_ID: Readonly<Record<ChildSituationId, ChildSituation>> =
  Object.fromEntries(CHILD_SITUATIONS.map((s) => [s.id, s])) as Record<
    ChildSituationId,
    ChildSituation
  >

/** The six concepts the children teach, in the catalogue's order. */
export const CHILD_CONCEPTS: readonly ConceptId[] = [...new Set(CHILD_SITUATIONS.map((s) => s.concept))]

/** A fresh scheduler for a group of `count` children. */
export function createChildSpeech(count: number, cfg: ChildSpeechConfig): ChildSpeechState {
  const staged = {} as Record<ChildSituationId, number>
  for (const s of CHILD_SITUATIONS) staged[s.id] = 0
  return {
    // The first utterance waits one interval: a group that speaks on the frame
    // the settlement mounts speaks before the player has seen it.
    cooldown: Math.max(0, cfg.intervalSeconds),
    pendingReply: null,
    last: null,
    intents: Array.from({ length: Math.max(0, count) }, () => null),
    staged,
  }
}

/** Casts a refusal from the call it answers: the child that was told to move
 *  is the one that refuses, and it aims its refusal at whoever asked. */
function castReply(state: ChildSpeechState, view: SituationView): Casting | null {
  const last = state.last
  if (!last || last.addressees.length === 0) return null
  const n = view.children.length
  // The refuser is the LAST-named addressee: with a whole group called in, the
  // one furthest out is the one whose refusal is seen.
  const speaker = last.addressees[last.addressees.length - 1]
  if (speaker < 0 || speaker >= n) return null
  if (last.speaker < 0 || last.speaker >= n) return null
  // A child that has meanwhile become IT has other things to do.
  if (speaker === view.chaser) return null
  return { speaker, addressees: [], aim: atPerson(view, last.speaker) }
}

/** Whether a situation may be staged in the phase the game is in. */
function phaseFits(situation: ChildSituation, view: SituationView): boolean {
  if (situation.phase === 'any') return true
  return situation.phase === 'chase' ? view.playing : !view.playing
}

/** Sets the intents a staged situation's action calls for. */
function applyAction(
  state: ChildSpeechState,
  event: SpokenSituation,
  cfg: ChildSpeechConfig,
): void {
  const seconds = Math.max(0, cfg.actionSeconds)
  switch (event.action) {
    case 'comeToSpeaker':
      for (const i of event.addressees) {
        state.intents[i] = { kind: 'toSpeaker', seconds, follow: event.speaker }
      }
      break
    case 'walkToSpot':
      for (const i of event.addressees) {
        if (!event.spot) break
        state.intents[i] = { kind: 'toSpot', seconds, x: event.spot.x, z: event.spot.z }
      }
      break
    case 'runAfterSpeaker':
      for (const i of event.addressees) {
        state.intents[i] = { kind: 'afterSpeaker', seconds, follow: event.speaker }
      }
      break
    case 'holdTheSpot':
      state.intents[event.speaker] = { kind: 'stay', seconds }
      break
    case 'refuserStaysPut':
      // The refusal CANCELS what the child was told to do, which is the whole
      // reading of it: it had started toward the caller and now stands.
      state.intents[event.speaker] = { kind: 'stay', seconds }
      break
    case 'noOneMoves':
      // Deliberately nothing: the stillness is the action.
      break
  }
}

/** Stages one situation and books it. */
function stage(
  state: ChildSpeechState,
  situation: ChildSituation,
  casting: Casting,
  cfg: ChildSpeechConfig,
  rand: () => number,
): SpokenSituation {
  const event: SpokenSituation = {
    id: situation.id,
    concept: situation.concept,
    utterance: utteranceOf(situation.concept),
    gesture: situation.gesture,
    action: situation.action,
    speaker: casting.speaker,
    addressees: [...casting.addressees],
    aim: casting.aim,
    spot: casting.spot ?? null,
    speakerMotion: situation.speaker,
  }
  applyAction(state, event, cfg)
  const spread = Math.max(0, Math.min(1, cfg.intervalSpread))
  state.cooldown = Math.max(0.1, cfg.intervalSeconds * (1 + (rand() * 2 - 1) * spread))
  state.last = {
    id: event.id,
    concept: event.concept,
    speaker: event.speaker,
    addressees: event.addressees,
    age: 0,
  }
  state.staged[event.id]++
  // A call may be answered with a refusal — which is how NO gets its two
  // situations, and why it is always heard as an ANSWER to something.
  const answerable = event.addressees.length > 0 && !situation.repliesTo
  state.pendingReply =
    answerable && rand() < cfg.refusalChance
      ? event.concept === 'FOLLOW'
        ? 'refuseToFollow'
        : event.concept === 'COME'
          ? 'refuseToCome'
          : null
      : null
  return event
}

/**
 * One step of the children's speech. Ages the intents and the cooldown, and
 * stages at most ONE situation — never two in a frame, so an utterance is
 * always alone with the action that explains it.
 *
 * Returns the staged situation, or null when nothing was said this step.
 */
export function stepChildSpeech(
  state: ChildSpeechState,
  view: SituationView,
  dt: number,
  cfg: ChildSpeechConfig,
  rand: () => number,
): SpokenSituation | null {
  const step = Number.isFinite(dt) && dt > 0 ? dt : 0
  // The roster is fixed for a visit, but a group that changed size keeps its
  // slots in step rather than steering a child that is no longer there.
  if (state.intents.length !== view.children.length) {
    state.intents = Array.from({ length: view.children.length }, (_, i) => state.intents[i] ?? null)
  }
  for (let i = 0; i < state.intents.length; i++) {
    const intent = state.intents[i]
    if (!intent) continue
    intent.seconds -= step
    if (intent.seconds <= 0) state.intents[i] = null
  }
  if (state.last) state.last.age += step
  if (state.last && state.last.age > Math.max(0, cfg.replySeconds)) state.pendingReply = null
  state.cooldown -= step
  if (state.cooldown > 0) return null
  if (view.children.length === 0) {
    state.cooldown = Math.max(0.1, cfg.intervalSeconds)
    return null
  }

  // A refusal owed to the call just spoken goes first: an answer that arrives
  // three utterances later answers nothing.
  if (state.pendingReply) {
    const reply = CHILD_SITUATION_BY_ID[state.pendingReply]
    const casting = castReply(state, view)
    if (casting) return stage(state, reply, casting, cfg, rand)
    state.pendingReply = null
  }

  // A MOMENT beats the rotation while it lasts: a catch has just happened, and
  // the state that situation reads is gone again within seconds.
  for (const situation of CHILD_SITUATIONS) {
    if (!situation.moment || !situation.cast) continue
    if (!phaseFits(situation, view)) continue
    const casting = situation.cast(view)
    if (!casting || casting.speaker < 0 || casting.speaker >= view.children.length) continue
    return stage(state, situation, casting, cfg, rand)
  }

  // THE ROTATION IS A FAIR QUEUE, not a cursor walking the catalogue: the
  // LEAST-staged situation the live game can cast right now goes next, ties in
  // the catalogue's own order. A cursor looked tidier and starved exactly the
  // situations that need a particular phase — its turn came round during a
  // break, the chase situation could not be cast, the cursor moved past it, and
  // `breakAwayTogether` was never once staged in fifteen minutes of measured
  // play. Counting is what makes the coverage a property rather than a hope.
  let next: ChildSituation | null = null
  let nextCasting: Casting | null = null
  let fewest = Infinity
  for (const situation of CHILD_SITUATIONS) {
    if (situation.repliesTo || situation.moment || !situation.cast) continue // out of turn
    if (!phaseFits(situation, view)) continue
    if (state.staged[situation.id] >= fewest) continue
    const casting = situation.cast(view)
    if (!casting) continue
    if (casting.speaker < 0 || casting.speaker >= view.children.length) continue
    next = situation
    nextCasting = casting
    fewest = state.staged[situation.id]
  }
  if (next && nextCasting) return stage(state, next, nextCasting, cfg, rand)
  // Nothing castable in this state — ask again shortly rather than every frame.
  state.cooldown = Math.max(0.1, cfg.intervalSeconds * 0.25)
  return null
}

/**
 * How a child moves because of what was just said — the heading and the pace
 * the chase should give it this frame, or null when it is simply playing.
 *
 * The scene hands this to `stepTagGame` as its steer: the situation decides the
 * DIRECTION, the chase keeps the collisions, the stamina and the floor pace, so
 * a child carrying out an errand is still a child in a game of tag.
 */
export function childSteer(
  state: ChildSpeechState,
  view: SituationView,
  index: number,
  cfg: ChildSpeechConfig,
): { heading: number; pace: number } | null {
  const intent = state.intents[index]
  if (!intent) return null
  const me = view.children[index]
  if (!me) return null
  const pace = Math.max(0, cfg.actionPace)
  switch (intent.kind) {
    case 'stay':
      return { heading: me.heading, pace: 0 }
    case 'toSpeaker':
    case 'afterSpeaker': {
      const lead = intent.follow ?? -1
      const other = view.children[lead]
      if (!other || lead === index) return null
      // Arrived: standing on the caller's toes is not the picture — the child
      // stops a body's width short and the intent is spent.
      if (dist(me, other) <= 1.0) {
        state.intents[index] = null
        return { heading: me.heading, pace: 0 }
      }
      return {
        heading: headingToward(me.x, me.z, other.x, other.z, me.heading),
        pace: intent.kind === 'afterSpeaker' ? pace * 1.4 : pace,
      }
    }
    case 'toSpot': {
      const x = intent.x ?? me.x
      const z = intent.z ?? me.z
      if (Math.hypot(me.x - x, me.z - z) <= 0.8) {
        state.intents[index] = null
        return { heading: me.heading, pace: 0 }
      }
      return { heading: headingToward(me.x, me.z, x, z, me.heading), pace }
    }
  }
}

/** Whether this child is carrying out something it was told — the scene asks
 *  before it lets the chase steer it. */
export function hasIntent(state: ChildSpeechState, index: number): boolean {
  return !!state.intents[index]
}
