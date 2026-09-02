// The adults teach by DOING THEIR OWN WORK (work-order 688). Two words, two
// kinds of work, two situations each, and not one errand among them.
//
// WHY THE ERRANDS WENT. The former catalogue taught by sending people places:
// one villager named a spot and another walked to it. Played on 13.08.2026 it
// taught nothing — "Selbst wenn ich diese Übersetzungen sehe, erkenne ich
// keinen Sinn hinter den Handlungen" — because a sending shows the LISTENER
// obeying, not the word's meaning, and a villager who ends an errand standing
// still shows nothing at all. What is left is work the player can watch:
//
//   RIVER  one man sets off toward the water with an EMPTY jar and says it as he
//          goes; another comes back up the same path with a FULL one and says it
//          on arriving. Once a destination, once an origin, and only the water
//          is common to the two — which is what fixes the word on the PLACE.
//   DIG    a man at a work site says it AS HE STRIKES the ground. Twice, at two
//          different sites, the second with a neighbour joining in unbidden.
//
// TWO RULES THE CROSS-VENDOR REVIEW OF THE SPEC (GPT-5.6 Sol, 13.08.2026) PUT
// HERE, because a player can learn the wrong thing and still solve the puzzle:
//
//  1. NO ADULT SPEAKS AT THE BANK. Both RIVER utterances fall in the village, at
//     the HEAD of the water path. An adult voice at the water would land inside
//     the children's earshot, and the two teachings would blur into one babble.
//  2. NOBODY IS CALLED OVER WITH `DIG`. A word spoken to summon somebody teaches
//     "come" or "help" at least as well as it teaches "dig", so the second
//     digger joins of his own accord and no utterance is aimed at him. The word
//     sits on the STROKE — not on the walk there, not on the standing about.
//
// The module is pure: no three, no scene. `PlaceLife` gives it the live village
// and carries out what comes back.

import type { ConceptId } from '../../communication/lexicon'
import { DIG_CYCLE_SECONDS } from '../../render/gesture'
import { devAssert } from '../../systems/devAssert'

/** The four situations. Two per word, one atom each. */
export type AdultSituationId = 'water-out' | 'water-back' | 'dig-alone' | 'dig-joined'

export const ADULT_SITUATIONS: readonly AdultSituationId[] = [
  'water-out',
  'water-back',
  'dig-alone',
  'dig-joined',
] as const

/** The two concepts the adults carry. The other three are the children's. */
export const ADULT_CONCEPTS: readonly ConceptId[] = ['RIVER', 'DIG']

/** What a villager is holding. The jar and the head-carry pose already exist. */
export type AdultCarry = 'none' | 'emptyJar' | 'fullJar'

/** What a villager on a task is doing right now. */
export type AdultPhase = 'walk' | 'fetch' | 'dig'

export interface ErrandPoint {
  x: number
  z: number
}

export interface DigSite extends ErrandPoint {
  kind: 'pit' | 'postHole' | 'patch'
}

/**
 * The places the adults work at, all of them the LAYOUT's own so a villager
 * works exactly where the scene draws the work (points 129/378).
 *
 * `waterHead` is where the water path leaves the built ground — the one spot
 * either carrier speaks at — and `waterFoot` is where that path meets the bank.
 * A settlement without a river carries neither, and its adults then keep only
 * their digging.
 */
export interface AdultWorkGeography {
  waterHead: ErrandPoint | null
  waterFoot: ErrandPoint | null
  digSites: readonly DigSite[]
}

export interface AdultWorker extends ErrandPoint {
  free: boolean
}

export interface AdultWorkView {
  villagers: readonly AdultWorker[]
  geography: AdultWorkGeography
  /**
   * May a body stand here? The same predicate the villagers' own step obeys —
   * the boundary and the collider set together.
   *
   * It is REQUIRED rather than optional because the one place that needs it is
   * the one place nothing else checks: the second digger's stand-off spot was
   * picked on a random bearing and never tested, so he could be sent into a hut
   * and never arrive, while the joined situation counted as shown (GPT-5.6 Sol,
   * first cross-vendor round, A3).
   */
  standable: (x: number, z: number) => boolean
  /**
   * Would a CHILD hear a word spoken here?
   *
   * The layout keeps the adults' work sites a hearing radius clear of the
   * children's own three places (`layout.ts`, `toChildren`), but the children
   * WALK between two of them — out of their roaming quarter, down to the bank —
   * and that walk crosses the village. Measured at the Bambara village, seed 42:
   * the store pit stands 11.2 m from the quarter's rim and 18.2 m from the
   * running lane, and a child on its way from the one to the other still passed
   * 9.1 m from the digger, who said DIG into its ear.
   *
   * Moving the site cannot answer that — the walk sweeps most of the village —
   * so the WORD gives way instead, exactly as it already does for a man crossing
   * the ground it points at: it stays owed and falls on a later stroke. It is a
   * predicate rather than a list because the caller owns the radius (the
   * settlement's hearing radius) and the live positions.
   */
  childrenHear: (x: number, z: number) => boolean
}

/** One atom, spoken by one villager, aimed at what he is doing. */
export interface SpokenWord {
  id: AdultSituationId
  concept: ConceptId
  speaker: number
  /** What the speaker turns to and points at while he says it. */
  aim: { x: number; y: number; z: number }
}

export interface AdultWorkConfig {
  intervalSeconds: number
  intervalSpread: number
  dwellSeconds: number
  digSeconds: number
  errandSeconds: number
  stallSeconds: number
  pace: number
}

/** A villager's current piece of work. */
export interface AdultTask extends ErrandPoint {
  situation: AdultSituationId
  phase: AdultPhase
  carry: AdultCarry
  /** The word was ready and was HELD because a child was in earshot (work-order
   *  688). A task that then runs out of time did not lose its atom to a defect —
   *  it gave it up to the rule — and the expiry assertion below says so. */
  hushed?: boolean
  /** Reached the goal named by `x`/`z`. */
  arrived: boolean
  /** Seconds of digging done, which is what drives the strike and the pose. */
  dug: number
  /** The task's own atom is still owed. */
  owes: boolean
  /** Where that atom falls, and what it is aimed at. */
  say: { at: ErrandPoint; aim: ErrandPoint } | null
  /**
   * A place to walk to FIRST, cleared once it is reached.
   *
   * The outbound water carrier says his word at the HEAD of the path and ends at
   * the foot, and the two are not on one line: routed round the buildings, or
   * simply setting off from the wrong side of the village, he could walk to the
   * water without ever passing within earshot-distance of the head — and the
   * situation was staged, counted and silent. The head is his first goal now,
   * and the water his second.
   */
  via: ErrandPoint | null
  age: number
}

export interface AdultWorkState {
  last: {
    id: AdultSituationId
    concept: ConceptId
    speaker: number
    age: number
  } | null
  tasks: (AdultTask | null)[]
  /** How often each situation has been staged, so the four take turns. */
  staged: Partial<Record<AdultSituationId, number>>
  /** Seconds until the next situation is staged. */
  next: number
  /** Where the round-robin over the catalogue stands. */
  cursor: number
}

/** How near a goal counts as reached. Mirrors the walkers' own arrival radius. */
export const WORK_ARRIVE_RADIUS = 1.1

/** How near the water's foot a villager must already be to be cast as the one
 *  coming BACK up with a full jar. He is meant to arrive FROM the water, so he
 *  has to have been there. */
export const WATER_FOOT_REACH = 4

/** Nearer than this to the ground a word points at, and a bystander IS what the
 *  word points at as far as the player can tell. */
export const AIM_CLEARANCE = 1.2

/**
 * Is a joined dig actually joined yet — has the second man arrived?
 *
 * For every other situation this is trivially true. For `dig-joined` it is the
 * whole of what the situation shows: the word must fall while TWO men work one
 * piece of ground, not while one of them is still walking over.
 */
function joinedIsJoined(state: AdultWorkState, primary: number, t: AdultTask): boolean {
  if (t.situation !== 'dig-joined') return true
  for (let k = 0; k < state.tasks.length; k++) {
    if (k === primary) continue
    const mate = state.tasks[k]
    if (mate && mate.situation === 'dig-joined' && !mate.owes && mate.arrived) return true
  }
  return false
}

/**
 * How near a digger a neighbour joins in at — close enough to read as the same
 * piece of work, far enough that the two do not stand in one body.
 *
 * THE NUMBER IS ARITHMETIC, NOT TASTE. A walker stops as much as
 * `WORK_ARRIVE_RADIUS` short of the spot he was sent to, so a joiner sent to
 * `JOIN_STAND_OFF` can settle `JOIN_STAND_OFF - WORK_ARRIVE_RADIUS` from the
 * site. At the old 1.6 that was half a metre: he stood ON the ground the digger
 * then pointed at, and the word read as aimed at him. It must stay clear of
 * `AIM_CLEARANCE`, which is what 2.4 buys (2.4 - 1.1 = 1.3 > 1.2).
 */
export const JOIN_STAND_OFF = 2.4

/** How many bearings round a dig site the joining digger's spot is tried on. */
const JOIN_BEARINGS = 12

/**
 * Where the second digger stands, or null when the site has no room for him.
 *
 * The bearing starts at random so the pair does not always face the same way,
 * and every bearing is TESTED: an untested one sent him into a hut or over the
 * settlement boundary, where he never arrived — while the joined situation had
 * already been counted as shown.
 */
function joinSpot(view: AdultWorkView, site: ErrandPoint, rand: () => number): ErrandPoint | null {
  const start = rand() * Math.PI * 2
  for (let k = 0; k < JOIN_BEARINGS; k++) {
    const a = start + (k / JOIN_BEARINGS) * Math.PI * 2
    const x = site.x + Math.cos(a) * JOIN_STAND_OFF
    const z = site.z + Math.sin(a) * JOIN_STAND_OFF
    if (view.standable(x, z)) return { x, z }
  }
  return null
}

export function createAdultWork(count: number, cfg: AdultWorkConfig): AdultWorkState {
  return {
    last: null,
    tasks: Array.from({ length: Math.max(0, count) }, () => null),
    staged: {},
    next: cfg.intervalSeconds,
    cursor: 0,
  }
}

export function taskOf(state: AdultWorkState, index: number): AdultTask | null {
  return state.tasks[index] ?? null
}

/** Where this task is sending its villager RIGHT NOW: its waypoint while it has
 *  one, its own place afterwards. The scene walks to this, not to `x`/`z`. */
export function goalOf(task: AdultTask): ErrandPoint {
  return task.via ?? { x: task.x, z: task.z }
}

/** Whether this villager is visibly digging — what the dig pose is driven by. */
export function isDigging(state: AdultWorkState, index: number): boolean {
  const t = state.tasks[index]
  return !!t && t.phase === 'dig' && t.arrived
}

/** What this villager is carrying, which is what the scene draws in his hands. */
export function carryOf(state: AdultWorkState, index: number): AdultCarry {
  return state.tasks[index]?.carry ?? 'none'
}

export function clearTask(state: AdultWorkState, index: number): void {
  if (index >= 0 && index < state.tasks.length) state.tasks[index] = null
}

/**
 * Did a digging bout cross a STRIKE between `before` and `after` seconds?
 *
 * `digPose` raises the hoe over the longer part of its cycle and brings it down
 * over the shorter one, so the blow lands where the cycle wraps. The word is
 * spoken exactly there — putting it on the walk, or on the arrival, is what
 * would let a player learn "work", "here" or "come".
 */
export function digStrikeCrossed(before: number, after: number, phase = 0): boolean {
  return Math.floor((after + phase) / DIG_CYCLE_SECONDS) > Math.floor((before + phase) / DIG_CYCLE_SECONDS)
}

/**
 * The villager nearest a point among those free for new work, or -1.
 *
 * `avoid` is a PREFERENCE, not an exclusion. Keeping the word off one man is
 * worth doing where the village can afford it; where it cannot — nobody else is
 * standing down at the water — the carrier who just walked down comes back up
 * himself, which is the picture the situation wanted in the first place.
 * Skipping him outright is what let the required full-jar return be dropped
 * altogether whenever he was the only man near the foot (GPT-5.6 Sol, first
 * cross-vendor round, A1).
 */
function nearestFree(view: AdultWorkView, to: ErrandPoint, within: number, avoid: number): number {
  let best = -1
  let bestD = within
  let fallback = -1
  let fallbackD = within
  for (let i = 0; i < view.villagers.length; i++) {
    const v = view.villagers[i]
    if (!v.free) continue
    const d = Math.hypot(v.x - to.x, v.z - to.z)
    if (i === avoid) {
      if (d <= fallbackD) {
        fallbackD = d
        fallback = i
      }
      continue
    }
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best >= 0 ? best : fallback
}

/** Any free villager, the one furthest from `to` last, so the cast rotates. */
function anyFree(view: AdultWorkView, avoid: number): number {
  for (let i = 0; i < view.villagers.length; i++) {
    if (view.villagers[i].free && i !== avoid) return i
  }
  for (let i = 0; i < view.villagers.length; i++) {
    if (view.villagers[i].free) return i
  }
  return -1
}

/** Whether this settlement can show the situation at all. */
function castable(id: AdultSituationId, view: AdultWorkView): boolean {
  const g = view.geography
  if (id === 'water-out' || id === 'water-back') return !!(g.waterHead && g.waterFoot)
  if (id === 'dig-joined') return g.digSites.length >= 2
  return g.digSites.length >= 1
}

/**
 * Is this ground free of everybody but the man who is about to work it?
 *
 * A word points at the ground its speaker is working. If another villager
 * happens to be STANDING on that ground, the pointing reads as pointing at HIM,
 * and the player learns "come here" from a word that means "dig" — the one
 * mis-reading the spec's own cross-vendor review put a rule in this file about.
 * A dig site is therefore only handed out while it is clear.
 */
function siteClear(view: AdultWorkView, site: ErrandPoint, digger: number): boolean {
  for (let i = 0; i < view.villagers.length; i++) {
    if (i === digger) continue
    const v = view.villagers[i]
    if (Math.hypot(v.x - site.x, v.z - site.z) <= AIM_CLEARANCE) return false
  }
  return true
}

/** Picks the dig site the digger of `which` staging uses, so the two digging
 *  situations happen at DIFFERENT sites — one word learnt at one hole would be
 *  a word for that hole — and skips a site somebody else is standing on. */
function digSiteFor(view: AdultWorkView, taken: number, digger: number): DigSite | null {
  const sites = view.geography.digSites
  if (sites.length === 0) return null
  for (let k = 0; k < sites.length; k++) {
    const site = sites[(taken + k) % sites.length]
    if (siteClear(view, site, digger)) return site
  }
  return null
}

/**
 * Steps the adults' work by `dt` and returns the atom spoken this frame, if any.
 *
 * Two things happen here: a new situation is staged when the interval is up and
 * the cast is free for it, and every running task is advanced — a task speaks
 * when its own moment arrives, which for the water is the head of the path and
 * for the digging is the stroke.
 */
export function stepAdultWork(
  state: AdultWorkState,
  view: AdultWorkView,
  dt: number,
  cfg: AdultWorkConfig,
  rand: () => number,
): SpokenWord | null {
  if (state.last) state.last.age += dt
  let spoken: SpokenWord | null = null

  // --- the running work ---------------------------------------------------
  for (let i = 0; i < state.tasks.length; i++) {
    const t = state.tasks[i]
    if (!t) continue
    t.age += dt
    const me = view.villagers[i]
    if (!me || t.age > cfg.errandSeconds) {
      // THE BACKSTOP, AND IT IS NOT FREE. A task that ran out of time is let go
      // so its man is not held for the rest of the visit — but if it still owed
      // its word, a teaching atom was lost, and that is a defect rather than
      // housekeeping. The `digSeconds` guard below keeps a FINISHED bout from
      // eating one; only a task that never got there reaches this, and it says
      // so (GPT-5.6 Sol, confirming round, task expiry).
      devAssert(
        !t.owes || t.hushed === true,
        'adult-atom-lost',
        () => `${t.situation}: villager ${i} ran out of time with his ${t.phase} word unspoken`,
      )
      state.tasks[i] = null
      continue
    }
    const goal = goalOf(t)
    if (!t.arrived && Math.hypot(me.x - goal.x, me.z - goal.z) <= WORK_ARRIVE_RADIUS) {
      t.arrived = true
      t.dug = 0
    }

    // The water carrier speaks at the HEAD of the path — the outbound one as he
    // sets off, the inbound one as he arrives — and never at the bank.
    //
    // No occupancy test guards THIS aim: it points at the water, twenty metres
    // off, and the foot is the one named place the adults never stroll to — only
    // a carrier on a task goes down. Holding the word here would drop it instead
    // of delaying it, because he is walking away from the head as he says it.
    // `adultWork.test.ts` asserts the emptiness rather than assuming it.
    //
    // ONE WORD A FRAME, AND NO ATOM SPENT ON A FRAME THAT CANNOT CARRY IT. Only
    // one utterance leaves this step, so a second task that reaches its own
    // moment in the same step keeps `owes` and speaks at the next one. Clearing
    // it regardless is what silently swallowed a teaching atom whenever two
    // pieces of work came due together (GPT-5.6 Sol, first cross-vendor round,
    // A5).
    if (
      !spoken &&
      t.owes &&
      t.say &&
      Math.hypot(me.x - t.say.at.x, me.z - t.say.at.z) <= WORK_ARRIVE_RADIUS &&
      t.phase !== 'dig'
    ) {
      t.owes = false
      spoken = { id: t.situation, concept: 'RIVER', speaker: i, aim: { x: t.say.aim.x, y: 0.2, z: t.say.aim.z } }
      // The word was the whole point of the waypoint: he goes on to the water.
      if (t.via) {
        t.via = null
        t.arrived = false
      }
    }

    if (t.arrived && t.phase === 'dig') {
      const before = t.dug
      t.dug += dt
      // A strike missed because another man spoke this frame is not lost: the
      // word stays owed and falls on the NEXT stroke, still on a stroke. The
      // same holds when somebody is CROSSING the ground he points at — the
      // joiner walks over it on his way round — because a word pointed at
      // occupied ground reads as pointing at the man standing on it.
      //
      // AND THE JOINED SITUATION IS ONLY JOINED ONCE THE SECOND MAN IS THERE.
      // Casting him was not enough: the primary could dig, speak and finish
      // while his neighbour was still walking, and the player would have seen
      // one man at a hole and another arriving at an empty one (GPT-5.6 Sol,
      // confirming round, joined staging).
      // AND NO CHILD IS IN EARSHOT. See `childrenHear`: a passing child would
      // learn DIG from the adults instead of its own four words, and the whole
      // point of the three separate teaching places is that it does not. The
      // hold is recorded, because a man held to his time limit by a child that
      // would not walk on has not LOST his atom — see `hushed`.
      const hush = t.owes && view.childrenHear(me.x, me.z)
      if (hush) t.hushed = true
      if (
        !spoken &&
        t.owes &&
        !hush &&
        joinedIsJoined(state, i, t) &&
        digStrikeCrossed(before, t.dug, i * 0.37) &&
        siteClear(view, t, i)
      ) {
        t.owes = false
        spoken = { id: t.situation, concept: 'DIG', speaker: i, aim: { x: t.x, y: 0, z: t.z } }
      }
      // He digs on while his word is still owed, so a bout can never end having
      // eaten the atom it existed for; `errandSeconds` still bounds the task.
      if (t.dug >= cfg.digSeconds && !t.owes) state.tasks[i] = null
    } else if (t.arrived && t.phase === 'fetch' && !t.via) {
      t.dug += dt
      // He fills the jar and is free again — the man the NEXT situation casts as
      // the one coming back up with it.
      if (t.dug >= cfg.dwellSeconds) state.tasks[i] = null
    } else if (t.arrived && t.phase === 'walk') {
      state.tasks[i] = null
    }
  }
  if (spoken) {
    state.last = { id: spoken.id, concept: spoken.concept, speaker: spoken.speaker, age: 0 }
    return spoken
  }

  // --- staging the next situation ----------------------------------------
  state.next -= dt
  if (state.next > 0) return null
  state.next = cfg.intervalSeconds * (1 + (rand() - 0.5) * 2 * cfg.intervalSpread)

  const g = view.geography
  for (let tried = 0; tried < ADULT_SITUATIONS.length; tried++) {
    const id = ADULT_SITUATIONS[state.cursor % ADULT_SITUATIONS.length]
    state.cursor++
    if (!castable(id, view)) continue
    const avoid = state.last?.speaker ?? -1

    if (id === 'water-out' && g.waterHead && g.waterFoot) {
      const who = anyFree(view, avoid)
      if (who < 0) continue
      // He walks down to the water with an EMPTY jar and says RIVER at the head
      // of the path, pointing the way he is going.
      state.tasks[who] = {
        situation: id,
        phase: 'fetch',
        carry: 'emptyJar',
        x: g.waterFoot.x,
        z: g.waterFoot.z,
        arrived: false,
        dug: 0,
        owes: true,
        say: { at: g.waterHead, aim: g.waterFoot },
        via: { x: g.waterHead.x, z: g.waterHead.z },
        age: 0,
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }

    if (id === 'water-back' && g.waterHead && g.waterFoot) {
      // Cast from whoever is already AT the water: he has to arrive FROM it, so
      // he must have been there. Preferring another man than the last speaker is
      // what keeps the word off one person; when nobody else is down there the
      // carrier who just walked down comes back up, which is the same picture.
      const who = nearestFree(view, g.waterFoot, WATER_FOOT_REACH, avoid)
      if (who < 0) continue
      state.tasks[who] = {
        situation: id,
        phase: 'walk',
        carry: 'fullJar',
        x: g.waterHead.x,
        z: g.waterHead.z,
        arrived: false,
        dug: 0,
        owes: true,
        // He says it ON ARRIVING, at the head, pointing back down at the water
        // he came from — the head IS his goal, so he needs no waypoint.
        say: { at: g.waterHead, aim: g.waterFoot },
        via: null,
        age: 0,
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }

    if (id === 'dig-alone' || id === 'dig-joined') {
      // The digger is cast FIRST: which sites are usable depends on who else is
      // standing about, and he must not disqualify his own.
      const who = anyFree(view, avoid)
      if (who < 0) continue
      const site = digSiteFor(view, (state.staged[id] ?? 0) + (id === 'dig-joined' ? 1 : 0), who)
      if (!site) continue
      state.tasks[who] = {
        situation: id,
        phase: 'dig',
        carry: 'none',
        x: site.x,
        z: site.z,
        arrived: false,
        dug: 0,
        owes: true,
        say: null,
        via: null,
        age: 0,
      }
      if (id === 'dig-joined') {
        // A NEIGHBOUR JOINS IN, UNBIDDEN — nobody calls him, and he says nothing.
        // He simply walks over and works the same ground, which is what makes the
        // digger's word about the digging rather than about the neighbour.
        //
        // THE SITUATION IS EITHER SHOWN OR NOT STAGED. There is no second digger
        // to spare, or no room beside the site for him to stand: then this is
        // not the joined situation at all, and counting it as staged would let
        // the catalogue move on having shown a man digging alone (GPT-5.6 Sol,
        // first cross-vendor round, A2/A3). The primary's task is taken back and
        // the next entry in the catalogue is tried instead.
        const mate = anyFree(view, who)
        const spot = mate >= 0 && mate !== who ? joinSpot(view, site, rand) : null
        if (!spot || mate < 0) {
          state.tasks[who] = null
          continue
        }
        state.tasks[mate] = {
          situation: id,
          phase: 'dig',
          carry: 'none',
          x: spot.x,
          z: spot.z,
          arrived: false,
          dug: 0,
          owes: false,
          say: null,
          via: null,
          age: 0,
        }
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }
  }
  return null
}
