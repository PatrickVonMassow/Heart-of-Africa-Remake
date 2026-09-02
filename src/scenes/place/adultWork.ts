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
  /** Reached the goal named by `x`/`z`. */
  arrived: boolean
  /** Seconds of digging done, which is what drives the strike and the pose. */
  dug: number
  /** The task's own atom is still owed. */
  owes: boolean
  /** Where that atom falls, and what it is aimed at. */
  say: { at: ErrandPoint; aim: ErrandPoint } | null
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

/** How near a digger a neighbour joins in at — close enough to read as the same
 *  piece of work, far enough that the two do not stand in one body. */
export const JOIN_STAND_OFF = 1.6

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

/** The villager nearest a point among those free for new work, or -1. */
function nearestFree(view: AdultWorkView, to: ErrandPoint, within: number, avoid: number): number {
  let best = -1
  let bestD = within
  for (let i = 0; i < view.villagers.length; i++) {
    const v = view.villagers[i]
    if (!v.free || i === avoid) continue
    const d = Math.hypot(v.x - to.x, v.z - to.z)
    if (d <= bestD) {
      bestD = d
      best = i
    }
  }
  return best
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

/** Picks the dig site the digger of `which` staging uses, so the two digging
 *  situations happen at DIFFERENT sites — one word learnt at one hole would be
 *  a word for that hole. */
function digSiteFor(view: AdultWorkView, taken: number): DigSite | null {
  const sites = view.geography.digSites
  if (sites.length === 0) return null
  return sites[taken % sites.length]
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
      state.tasks[i] = null
      continue
    }
    if (!t.arrived && Math.hypot(me.x - t.x, me.z - t.z) <= WORK_ARRIVE_RADIUS) {
      t.arrived = true
      t.dug = 0
    }

    // The water carrier speaks at the HEAD of the path — the outbound one as he
    // sets off, the inbound one as he arrives — and never at the bank.
    if (t.owes && t.say && Math.hypot(me.x - t.say.at.x, me.z - t.say.at.z) <= WORK_ARRIVE_RADIUS && t.phase !== 'dig') {
      t.owes = false
      spoken = { id: t.situation, concept: 'RIVER', speaker: i, aim: { x: t.say.aim.x, y: 0.2, z: t.say.aim.z } }
    }

    if (t.arrived && t.phase === 'dig') {
      const before = t.dug
      t.dug += dt
      if (t.owes && digStrikeCrossed(before, t.dug, i * 0.37)) {
        t.owes = false
        spoken = { id: t.situation, concept: 'DIG', speaker: i, aim: { x: t.x, y: 0, z: t.z } }
      }
      if (t.dug >= cfg.digSeconds) state.tasks[i] = null
    } else if (t.arrived && t.phase === 'fetch') {
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
        // he came from.
        say: { at: g.waterHead, aim: g.waterFoot },
        age: 0,
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }

    if (id === 'dig-alone' || id === 'dig-joined') {
      const site = digSiteFor(view, (state.staged[id] ?? 0) + (id === 'dig-joined' ? 1 : 0))
      if (!site) continue
      const who = anyFree(view, avoid)
      if (who < 0) continue
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
        age: 0,
      }
      if (id === 'dig-joined') {
        // A NEIGHBOUR JOINS IN, UNBIDDEN — nobody calls him, and he says nothing.
        // He simply walks over and works the same ground, which is what makes the
        // digger's word about the digging rather than about the neighbour.
        const mate = anyFree(view, who)
        if (mate >= 0 && mate !== who) {
          const a = rand() * Math.PI * 2
          state.tasks[mate] = {
            situation: id,
            phase: 'dig',
            carry: 'none',
            x: site.x + Math.cos(a) * JOIN_STAND_OFF,
            z: site.z + Math.sin(a) * JOIN_STAND_OFF,
            arrived: false,
            dug: 0,
            owes: false,
            say: null,
            age: 0,
          }
        }
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }
  }
  return null
}
