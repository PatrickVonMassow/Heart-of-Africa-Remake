import type { Vocabulary } from '../../communication/lexicon'
// The adults teach by DOING THEIR OWN WORK (work-order 688). Two words, two
// situations each, and no translation among them.
//
// RIVER is shown once by an empty-jar carrier setting out and once by a full-
// jar carrier returning. DIG is different: it is an invitation, not a running
// commentary. An initiator walks to another free adult and says DIG to him;
// both walk to one of the village's work sites; the initiator says DIG again at
// the hole; only then do they work it together. Each of the two digging
// situations uses a different site, so neither the person nor one particular
// hole can become the word's accidental meaning.
//
// Both utterances yield while a child can hear, and an invitation is staged
// only beside a partner who stands clear of the children's fixed grounds. A
// bout that cannot cast two such adults is not staged at all and returns on a
// later catalogue pass. The module also records every worker-second and every
// completed stroke at the site, giving the scene one durable source for the
// deepening pit, growing spoil and thrown earth.
//
// The module is pure: no three, no scene. `PlaceLife` gives it the live village
// and carries out what comes back.

import { atDigStand, DIG_ARRIVE_RADIUS, digStandingPlaces } from './placeGround'
import { SpeechFloor } from '../../communication/speechFloor'
import { balance } from '../../config/balance'
import { instructionDelay } from '../../communication/speaking'
import type { ConceptId } from '../../communication/lexicon'
import { DIG_CYCLE_SECONDS } from '../../render/gesture'
import { devAssert } from '../../systems/devAssert'

export type AdultSituationId = 'water-out' | 'water-back' | 'dig-first' | 'dig-second'

export const ADULT_SITUATIONS: readonly AdultSituationId[] = [
  'water-out',
  'water-back',
  'dig-first',
  'dig-second',
] as const

export const ADULT_CONCEPTS: readonly ConceptId[] = ['RIVER', 'DIG']

export type AdultCarry = 'none' | 'emptyJar' | 'fullJar' | 'digTool'
export type AdultPhase = 'walk' | 'fetch' | 'fill' | 'send' | 'wait' | 'invite' | 'site' | 'dig'
export type DigUtterance = 'invitation' | 'site'

export interface ErrandPoint { x: number; z: number }

export interface DigSite extends ErrandPoint {
  kind: 'pit' | 'postHole' | 'patch'
  /** Layout-selected orientation gives the heap and purpose props free ground. */
  rotation?: number
}

export interface AdultWorkGeography {
  waterHead: ErrandPoint | null
  waterFoot: ErrandPoint | null
  /** Where the carrier stands IN the water to fill his jar (work-order 1087).
   *  The foot is the drawn track's landing and stays where it is; this is the
   *  last stretch down the shore, and it is where the act happens. */
  waterFill: ErrandPoint | null
  /** The village water stand (work-order 1087): where the errand is ordered,
   *  where the filled jar is set down, and where BOTH its words are spoken. */
  waterStand: ErrandPoint | null
  digSites: readonly DigSite[]
}

export interface AdultWorker extends ErrandPoint { free: boolean }

export interface AdultWorkView {
  vocabulary: Vocabulary
  floor?: SpeechFloor
  villagers: readonly AdultWorker[]
  geography: AdultWorkGeography
  standable: (x: number, z: number) => boolean
  /** Can an adult word safely fall beside this anchor without entering any of
   * the children's fixed teaching grounds? The caller includes arrival slack. */
  invitationClear: (x: number, z: number) => boolean
  childrenHear: (x: number, z: number) => boolean
}

export interface SpokenWord {
  id: AdultSituationId
  concept: ConceptId
  speaker: number
  aim: { x: number; y: number; z: number }
  /** Which of the two DIG utterances this is; absent for RIVER. */
  purpose?: DigUtterance
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

export interface AdultTask extends ErrandPoint {
  situation: AdultSituationId
  phase: AdultPhase
  carry: AdultCarry
  role: 'worker' | 'initiator' | 'partner'
  partner: number | null
  siteIndex: number | null
  hushed?: boolean
  /** Whether the CURRENTLY owed word has ever been refused a turn. `hushed` is
   *  only this frame's answer and is cleared the moment the word stops being
   *  sayable, so it cannot testify to what happened earlier; this survives
   *  until the word is paid. Without it a word withheld by a child's ear, whose
   *  speaker then steps out of range for a single frame before his task
   *  expires, reports as a pair that never met — the blanket excuse this point
   *  removed, let back in through the side door. */
  withheld?: boolean
  speechOwner?: object
  /** Seconds still to run between the word just SPOKEN and the act it orders
   *  (work-order 1184). Its own state, deliberately not `owes`: a task inside
   *  the hold owes nothing — the word has been said — so neither
   *  `assertNoOwedWord` bound may read it as a lost or unpaid word. */
  holdFor?: number
  pendingWord?: SpokenWord
  /** The villager who ORDERED this errand and who its words are addressed to
   *  (work-order 1087). He stands at the water stand for the whole round trip,
   *  because the point's own rule is that no villager speaks to nobody: the
   *  first word is his order to the carrier, the second is the carrier's report
   *  back to him. He is NOT an escort — he walks nowhere. */
  orderedBy: number | null
  /** The spot BESIDE the water stand this errand's carrier works from
   *  (work-order 1087). He is never sent to the stand's own centre: it is a
   *  solid body, so a man sent there stalls a walker's width off it and is never
   *  counted as arrived. He stands next to it, as one does at a table. */
  standSpot: ErrandPoint | null
  arrived: boolean
  /** Seconds this worker has dug in the current bout. */
  dug: number
  /** The utterance belonging to the current phase is still owed. */
  owes: boolean
  say: { at: ErrandPoint; aim: ErrandPoint } | null
  via: ErrandPoint | null
  age: number
  /** Best distance on this leg, not distance walked: circling a blocked goal
   *  must not keep an errand alive. Arrived partners share the walker's fate. */
  progress?: { goal: ErrandPoint; phase: AdultPhase; best: number; stalled: number }
}

export interface DigSiteProgress {
  /** Worker-seconds accumulated at this site across visits. */
  dug: number
  /** Completed tool strikes accumulated at this site across visits. */
  strikes: number
  /** At least one pair has finished its bout here. */
  completed?: boolean
}

export interface AdultWorkState {
  clock: number
  floor?: SpeechFloor
  /** Normally one word; deadline forcing may discharge several before a kill. */
  emitted: SpokenWord[]
  last: { id: AdultSituationId; concept: ConceptId; speaker: number; age: number; purpose?: DigUtterance } | null
  tasks: (AdultTask | null)[]
  staged: Partial<Record<AdultSituationId, number>>
  next: number
  cursor: number
  siteProgress: Record<number, DigSiteProgress>
  /** How many filled jars stand at the village water stand (work-order 1087).
   *  It is capped at `balance.waterStandCapacity`: a delivery past the cap
   *  replaces the oldest jar, which is what lets the stand need no consumer. */
  standJars: number
}

export const WORK_ARRIVE_RADIUS = 1.1
export const AIM_CLEARANCE = 1.2
export const JOIN_STAND_OFF = 2.4
const JOIN_BEARINGS = 12

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

export function createAdultWork(count: number, cfg: AdultWorkConfig, progress: readonly DigSiteProgress[] = []): AdultWorkState {
  return {
    clock: 0,
    emitted: [],
    last: null,
    tasks: Array.from({ length: Math.max(0, count) }, () => null),
    staged: {},
    next: cfg.intervalSeconds,
    cursor: 0,
    siteProgress: Object.fromEntries(progress.map((p, i) => [i, { ...p }])),
    standJars: 0,
  }
}

export function taskOf(state: AdultWorkState, index: number): AdultTask | null {
  return state.tasks[index] ?? null
}

export function workArrivalRadius(task: AdultTask): number {
  // Both men must reach their own spot before waiting at the stand. Stopping
  // a metre early can block the other man's route around its solid body.
  if (task.standSpot && (task.phase === 'send' || task.phase === 'wait' || task.situation === 'water-back')) {
    return balance.waterStandArrivalRadius
  }
  return task.siteIndex !== null && (task.phase === 'site' || task.phase === 'dig')
    ? DIG_ARRIVE_RADIUS : WORK_ARRIVE_RADIUS
}

export function goalOf(task: AdultTask): ErrandPoint {
  return task.via ?? { x: task.x, z: task.z }
}

/** THE STROKE BELONGS TO THE RIM (work-order 1125). Phase and arrival say the
 *  bout has begun; the body's own place says whether its blade can reach the
 *  hole. A figure that ended up away from its site stands idle, so a future
 *  regression reads as a villager doing nothing rather than as one hoeing
 *  untouched ground. */
export function isDigging(state: AdultWorkState, index: number, view: AdultWorkView): boolean {
  const t = state.tasks[index]
  if (!t || t.phase !== 'dig' || !t.arrived || t.siteIndex === null) return false
  const site = view.geography.digSites[t.siteIndex]
  const me = view.villagers[index]
  return !!site && !!me && atDigStand(site, me.x, me.z)
}

export function carryOf(state: AdultWorkState, index: number): AdultCarry {
  return state.tasks[index]?.carry ?? 'none'
}

/** A copy suitable for React state and diagnostics; callers cannot mutate work. */
export function digProgressOf(state: AdultWorkState, siteCount: number): DigSiteProgress[] {
  return Array.from({ length: siteCount }, (_, i) => ({
    dug: state.siteProgress[i]?.dug ?? 0,
    strikes: state.siteProgress[i]?.strikes ?? 0,
    ...(state.siteProgress[i]?.completed ? { completed: true } : {}),
  }))
}

type ReleaseReason = 'ordinary' | 'stall'

function clearPair(state: AdultWorkState, index: number, reason: ReleaseReason = 'ordinary'): void {
  const task = state.tasks[index]
  if (task) {
    assertNoOwedWord(task, index, reason)
    if (task.partner !== null && state.tasks[task.partner]) assertNoOwedWord(state.tasks[task.partner]!, task.partner, reason)
    // THE PAIR HOLDS THE FLOOR THROUGH ITS OWN HOLD (work-order 1184), and this
    // release is what ends that. The alternative — letting go at the last
    // syllable — leaves the gap between an order and the first step of the man
    // obeying it open to any other exchange in the village, so the player hears
    // a second word land between the two halves of the one he is meant to pair.
    // The request names the hold as `actAfter`, so the floor's reservation
    // covers it at any calibration, not only at shipped balance.
    state.floor?.release(task.speechOwner ?? task)
  }
  state.tasks[index] = null
  if (task?.partner !== null && task?.partner !== undefined) state.tasks[task.partner] = null
}

export function assertNoOwedWord(task: AdultTask, index: number, reason: ReleaseReason = 'ordinary'): void {
  // TWO DIFFERENT FAILURES, REPORTED APART (work-order 1073). Nothing is
  // conflated here — the old blanket `hushed` exemption hid both. A deliberate
  // stall release handles a pair that never met; it NEVER excuses dropping a
  // word that was already withheld. Ordinary expiry still reports both cases.
  //  · The word's moment HAD come and it was WITHHELD — by the floor, by a
  //    child's ear, or by the one-word-a-frame limit. Somebody owes it and let
  //    the owning task die with it unsaid. That is the loss this point catches.
  //  · The word never became sayable at all: the pair never assembled, so no
  //    floor decision touched it and there was nobody to say it to. That is a
  //    WALKING failure, and naming it as a lost word sends every reader to the
  //    wrong subsystem.
  devAssert(
    !task.owes || !task.withheld,
    'adult-atom-lost',
    () => `${task.situation}: villager ${index} ran out of time with his ${task.phase} word withheld`,
  )
  devAssert(
    !task.owes || task.withheld === true || reason === 'stall',
    'adult-pair-never-met',
    () => `${task.situation}: villager ${index} expired still on his way to the ${task.phase} word; the pair never assembled`,
  )
}

export function clearTask(state: AdultWorkState, index: number): void {
  if (index >= 0 && index < state.tasks.length) clearPair(state, index)
}

export function digStrikeCrossed(before: number, after: number, phase = 0): boolean {
  return Math.floor((after + phase) / DIG_CYCLE_SECONDS) > Math.floor((before + phase) / DIG_CYCLE_SECONDS)
}


function anyFree(view: AdultWorkView, avoid: number): number {
  for (let i = 0; i < view.villagers.length; i++) if (view.villagers[i].free && i !== avoid) return i
  for (let i = 0; i < view.villagers.length; i++) if (view.villagers[i].free) return i
  return -1
}

function anotherFree(view: AdultWorkView, first: number): number {
  for (let i = 0; i < view.villagers.length; i++) {
    const v = view.villagers[i]
    if (i !== first && v.free && view.invitationClear(v.x, v.z)) return i
  }
  return -1
}

/**
 * A standable spot beside `site`, as far round from `taken` as the ground
 * allows: straight opposite it first, then stepping alternately to each side
 * (work-order 1087). Two men at one place block each other, and neither is then
 * counted as arrived.
 */
function facingSpot(view: AdultWorkView, site: ErrandPoint, taken: ErrandPoint): ErrandPoint | null {
  const away = Math.atan2(site.z - taken.z, site.x - taken.x)
  for (let k = 0; k < JOIN_BEARINGS; k++) {
    const step = Math.ceil(k / 2) * ((k % 2 === 0 ? 1 : -1) * (Math.PI * 2) / JOIN_BEARINGS)
    const a = away + step
    const x = site.x + Math.cos(a) * JOIN_STAND_OFF
    const z = site.z + Math.sin(a) * JOIN_STAND_OFF
    if (Math.hypot(x - taken.x, z - taken.z) <= WORK_ARRIVE_RADIUS * 2) continue
    if (view.standable(x, z)) return { x, z }
  }
  return null
}

/** Another free adult, with none of DIG's invitation clearance: the water
 *  errand's second man STAYS at the stand and walks nowhere, so the ground he is
 *  standing on has nothing to clear (work-order 1087). */
function anotherFreeAdult(view: AdultWorkView, first: number): number {
  for (let i = 0; i < view.villagers.length; i++) if (i !== first && view.villagers[i].free) return i
  return -1
}

function castable(id: AdultSituationId, view: AdultWorkView): boolean {
  const g = view.geography
  // 'water-back' is never CAST: it is the return leg of the one water errand
  // (work-order 1087), reached from the fill rather than from a second casting.
  if (id === 'water-back') return false
  if (id === 'water-out') return !!(g.waterFoot && g.waterFill && g.waterStand)
  if (id === 'dig-second') return g.digSites.length >= 2
  return g.digSites.length >= 1
}

/** The partner and every bystander must be clear of the future hole. The
 * initiator may already be there: he still has to go away to make the invite. */
function siteClear(view: AdultWorkView, site: ErrandPoint, initiator: number, partner = -1): boolean {
  for (let i = 0; i < view.villagers.length; i++) {
    if (i === initiator || i === partner) continue
    const v = view.villagers[i]
    if (Math.hypot(v.x - site.x, v.z - site.z) <= AIM_CLEARANCE) return false
  }
  return true
}

function digSiteFor(state: AdultWorkState, view: AdultWorkView, start: number, initiator: number): { site: DigSite; index: number } | null {
  const sites = view.geography.digSites
  for (let k = 0; k < sites.length; k++) {
    const index = (start + k) % sites.length
    // An invited pair already has a destination even while it is still walking.
    // Sending another pair there makes both initiators block each other's DIG.
    if (state.tasks.some((t) => t?.siteIndex === index)) continue
    if (siteClear(view, sites[index], initiator)) return { site: sites[index], index }
  }
  return null
}

function pairReady(state: AdultWorkState, task: AdultTask): boolean {
  if (task.partner === null) return false
  const partner = state.tasks[task.partner]
  return !!partner && partner.arrived && task.arrived && partner.phase === 'site'
}

function startJointWalk(state: AdultWorkState, initiator: AdultTask, geography: AdultWorkGeography): void {
  if (initiator.partner === null || initiator.siteIndex === null) return
  const partner = state.tasks[initiator.partner]
  const site = geography.digSites[initiator.siteIndex]
  if (!partner || !site || !initiator.standSpot) return
  initiator.phase = 'site'
  initiator.x = initiator.standSpot.x
  initiator.z = initiator.standSpot.z
  initiator.arrived = false
  initiator.owes = true
  initiator.pendingWord = {
    id: initiator.situation, concept: 'DIG', speaker: partner.partner!, purpose: 'site',
    aim: { x: site.x, y: 0, z: site.z },
  }
  delete initiator.hushed
  delete initiator.withheld
  partner.phase = 'site'
  partner.arrived = false
}

function startDigging(state: AdultWorkState, initiator: AdultTask): void {
  if (initiator.partner === null) return
  const partner = state.tasks[initiator.partner]
  if (!partner) return
  initiator.phase = 'dig'
  initiator.arrived = true
  initiator.owes = false
  initiator.dug = 0
  partner.phase = 'dig'
  partner.arrived = true
  partner.dug = 0
}

function rememberWord(state: AdultWorkState, spoken: SpokenWord): SpokenWord {
  state.last = {
    id: spoken.id,
    concept: spoken.concept,
    speaker: spoken.speaker,
    age: 0,
    ...(spoken.purpose ? { purpose: spoken.purpose } : {}),
  }
  return spoken
}

/** A word becomes queued only at its teaching moment. Its debt then survives
 * a passing child, a competing exchange, or a bystander's late obstruction. */
function readyWord(state: AdultWorkState, view: AdultWorkView, t: AdultTask, i: number): SpokenWord | null {
  const me = view.villagers[i]
  if (!t.owes || !me) return null
  const mate = t.partner === null ? null : view.villagers[t.partner]
  if (t.phase === 'send' && t.role === 'initiator' && t.arrived && t.say && mate && state.tasks[t.partner!]?.arrived) {
    return { id: t.situation, concept: 'RIVER', speaker: i, aim: { ...t.say.aim, y: 0.2 } }
  }
  if (t.situation === 'water-back' && t.say && Math.hypot(me.x - t.say.at.x, me.z - t.say.at.z) <= workArrivalRadius(t)) {
    // Delivery is physical work, independent of permission to make the report.
    if (t.carry === 'fullJar') {
      t.carry = 'none'
      state.standJars = Math.min(balance.waterStandCapacity, state.standJars + 1)
    }
    const sender = t.orderedBy === null ? null : view.villagers[t.orderedBy]
    return sender ? { id: t.situation, concept: 'RIVER', speaker: i, aim: { x: sender.x, y: 1, z: sender.z } } : null
  }
  if (t.role === 'initiator' && t.phase === 'invite' && t.arrived && mate) {
    return { id: t.situation, concept: 'DIG', speaker: i, purpose: 'invitation', aim: { x: mate.x, y: 1, z: mate.z } }
  }
  if (t.role === 'initiator' && t.phase === 'site' && pairReady(state, t) && t.siteIndex !== null) {
    const site = view.geography.digSites[t.siteIndex]
    return site ? { id: t.situation, concept: 'DIG', speaker: i, purpose: 'site', aim: { x: site.x, y: 0, z: site.z } } : null
  }
  return null
}

/**
 * The word has just been granted the floor. The DEBT ends here — it has been
 * said — but the act it orders waits out `instructionDelay` first (work-order
 * 1184): the instructed body must not move before the word has been heard.
 * The wait sits INSIDE the errand's own budget, because `age` keeps running.
 */
function wordSpoken(state: AdultWorkState, view: AdultWorkView, t: AdultTask, i: number, word: SpokenWord): void {
  t.owes = false
  t.hushed = false
  // The word is paid, so its withholding history ends here and the next word
  // this task owes starts with a clean slate.
  delete t.withheld
  delete t.pendingWord
  const hold = instructionDelay(word.concept, view.vocabulary)
  if (hold > 0) {
    t.holdFor = hold
    return
  }
  wordConsequence(state, view, t, i)
}

function wordConsequence(state: AdultWorkState, view: AdultWorkView, t: AdultTask, i: number): void {
  if (t.phase === 'invite') startJointWalk(state, t, view.geography)
  else if (t.phase === 'site') startDigging(state, t)
  else if (t.situation === 'water-back') clearPair(state, i)
  else if (t.phase === 'send' && t.partner !== null) {
    const carrier = state.tasks[t.partner]
    const fill = view.geography.waterFill
    if (carrier && fill) {
      carrier.phase = 'fetch'
      carrier.carry = 'emptyJar'
      carrier.x = fill.x
      carrier.z = fill.z
      carrier.arrived = false
    }
  }
}

function measureProgress(t: AdultTask, me: AdultWorker, dt: number): void {
  const goal = goalOf(t)
  const distance = Math.hypot(me.x - goal.x, me.z - goal.z)
  // Speech holds, filling and digging are legitimate stationary work. A man
  // waiting for his partner is released by THAT partner's stalled walk, not by
  // a clock on his own stationary feet (including the sender's whole round trip).
  if (t.arrived || distance <= workArrivalRadius(t)) {
    delete t.progress
    return
  }
  const p = t.progress
  if (!p || p.phase !== t.phase || p.goal.x !== goal.x || p.goal.z !== goal.z) {
    t.progress = { goal: { ...goal }, phase: t.phase, best: distance, stalled: dt }
  } else if (distance < p.best - 1e-6) {
    p.best = distance
    p.stalled = 0
  } else p.stalled += dt
}

function stallRemaining(t: AdultTask | null, cfg: AdultWorkConfig): number {
  if (!t?.progress || t.arrived) return Infinity
  const goal = goalOf(t), p = t.progress
  // A word can start a new leg within this frame; its old clock cannot kill it.
  if (p.phase !== t.phase || p.goal.x !== goal.x || p.goal.z !== goal.z) return Infinity
  return cfg.stallSeconds - p.stalled
}

export function stepAdultWork(
  state: AdultWorkState,
  view: AdultWorkView,
  dt: number,
  cfg: AdultWorkConfig,
  rand: () => number,
): SpokenWord | null {
  if (dt <= 0) return null
  state.clock += dt
  state.emitted = []
  state.floor = view.floor ?? state.floor ?? new SpeechFloor(() => ({ x: 0, z: 0, active: false }), () => state.clock)
  if (state.last) state.last.age += dt
  let spoken: SpokenWord | null = null

  // Sample BOTH men before either asks for speech or releases the pair. This
  // keeps assembly and its deadline independent of villager iteration order.
  state.tasks.forEach((t, i) => {
    const me = view.villagers[i]
    if (t && me) measureProgress(t, me, dt)
  })
  state.tasks.forEach((t, i) => {
    if (t && stallRemaining(t, cfg) <= 0) clearPair(state, i, 'stall')
  })

  for (let i = 0; i < state.tasks.length; i++) {
    const t = state.tasks[i]
    if (!t) continue
    const me = view.villagers[i]
    if (!me || t.age >= cfg.errandSeconds) {
      // Neither hush nor a floor reservation excuses an unpaid word.
      assertNoOwedWord(t, i)
      if (t.partner !== null) {
        const partner = state.tasks[t.partner]
        if (partner) assertNoOwedWord(partner, t.partner)
      }
      clearPair(state, i)
      continue
    }

    // THE WORD IS SPOKEN, THE BODY HAS NOT MOVED YET (work-order 1184). The
    // hold runs down on the errand's own clock — `age` below keeps counting —
    // so it lengthens no deadline; it only delays the act the word ordered.
    if (t.holdFor !== undefined) {
      t.holdFor -= dt
      if (t.holdFor <= 0) {
        delete t.holdFor
        wordConsequence(state, view, t, i)
        // A consequence may dissolve the pair (the report back ends the
        // errand); the rest of this body belongs to a task that is gone.
        if (!state.tasks[i]) continue
      }
    }

    const goal = goalOf(t)
    if (!t.arrived && Math.hypot(me.x - goal.x, me.z - goal.z) <= workArrivalRadius(t)) {
      t.arrived = true
      t.dug = 0
    }

    for (let attempt = 0; attempt < 2; attempt++) {
      const ready = readyWord(state, view, t, i)
      if (ready) t.pendingWord = ready
      const partnerTask = t.partner === null ? null : state.tasks[t.partner]
      // A previously withheld word keeps its debt. The floor remembers its
      // earliest deadline, so only pass a walking deadline when release is
      // imminent: renewed headway can reset a stall clock on any earlier frame.
      const walkingLife = Math.min(stallRemaining(t, cfg), stallRemaining(partnerTask, cfg))
      const remaining = Math.min(
        cfg.errandSeconds - Math.max(t.age, partnerTask?.age ?? 0),
        walkingLife <= dt * 2 ? walkingLife : Infinity,
      )
      const urgent = remaining <= dt * 2
      // A word whose moment has NOT come claims no turn on the floor. The pair
      // walking to its site owes its DIG, but cannot say it yet, so queuing it
      // here would make the floor measure travel instead of speech: the hold
      // then ran the pair's whole task length and the bound fired on healthy
      // work. A word ALREADY withheld still asks, marked blocked: it yields
      // precedence but must reach its deadline even if its partner steps away.
      if (!ready && !t.withheld) {
        t.hushed = false
        continue
      }
      // DEFERRED BY THE FRAME, NOT BY THE FLOOR — and still deferred. The
      // village says at most one word a frame, so a task whose moment HAS come
      // can be passed over because somebody else spoke first. That never
      // reaches the floor, so without this the word carries no record of having
      // been held back, and a speaker who then steps out of his own radius
      // before his task runs out is filed as a pair that never met.
      if (t.pendingWord && spoken && !urgent) { t.hushed = !!ready; t.withheld = true }
      if (t.pendingWord && (!spoken || urgent)) {
        const owner = t.speechOwner ?? partnerTask?.speechOwner ?? {}
        t.speechOwner = owner
        if (partnerTask) partnerTask.speechOwner = owner
        const site = t.siteIndex === null ? null : view.geography.digSites[t.siteIndex]
        const blocked = !ready || view.childrenHear(me.x, me.z) ||
          (t.phase === 'site' && !!site && !siteClear(view, site, i, t.partner ?? -1))
        const ends = t.phase === 'site' || t.situation === 'water-back'
        const allowed = state.floor.request({
          situation: owner, name: `${t.situation} pair ${i}/${t.partner}`, word: t.phase,
          source: { x: me.x, z: me.z, register: 'talk' },
          sources: () => [view.villagers[i], ...(t.partner === null ? [] : [view.villagers[t.partner]])]
            .filter((p) => !!p).map((p) => ({ x: p.x, z: p.z, register: 'talk' as const })),
          blocked, remaining, step: dt, ends,
          actAfter: instructionDelay(t.pendingWord.concept, view.vocabulary),
        })
        t.hushed = !!ready && !allowed
        if (!allowed) t.withheld = true
        if (allowed) {
          const word = t.pendingWord
          state.emitted.push(word)
          spoken ??= word
          wordSpoken(state, view, t, i, word)
        }
      }
    }
    t.age += dt

    // THE HOLE DEEPENS ONLY UNDER A STROKE THAT IS REALLY PLAYED (work-order
    // 1125, GPT-6 Astra cross-vendor round). Gating the pose on the working rim
    // and the accounting on phase alone would have let a displaced body stand
    // idle while its excavation filled up and completed underneath him.
    if (isDigging(state, i, view) && t.siteIndex !== null) {
      const before = t.dug
      t.dug += dt
      const progress = (state.siteProgress[t.siteIndex] ??= { dug: 0, strikes: 0 })
      progress.dug += dt
      if (digStrikeCrossed(before, t.dug, i * 0.37)) progress.strikes++
      if (t.dug >= cfg.digSeconds) {
        progress.completed = true
        clearPair(state, i)
      }
    } else if (t.arrived && t.phase === 'fetch' && !t.via) {
      // ARRIVING AT THE WATER OPENS THE FILL, IT DOES NOT END THE ERRAND. The
      // jar used to flip to 'fullJar' at the next casting, with nothing shown in
      // between, and the user (06.09.2026) could not tell that water was being
      // fetched. The dip is its own phase now, and 'fullJar' begins only when it
      // has run its configured hold.
      t.phase = 'fill'
      t.dug = 0
    } else if (t.arrived && t.phase === 'fill') {
      t.dug += dt
      const geo = view.geography
      if (t.dug >= balance.bankFillSeconds && geo.waterStand && t.standSpot) {
        // ONE ROUND TRIP, NOT TWO CASTINGS. The full jar used to appear on a
        // SECOND villager cast at the water, so it came from nowhere; the same
        // carrier turns round here instead. Both situation ids survive as LEG
        // LABELS, which is what keeps the lexicon bookkeeping and the staged
        // counters unchanged.
        t.carry = 'fullJar'
        t.situation = 'water-back'
        t.phase = 'walk'
        t.x = t.standSpot.x
        t.z = t.standSpot.z
        // The aim is replaced by the SENDER's own position when the word falls:
        // the report is addressed to the man, not to the ground he stands on.
        t.say = { at: { ...t.standSpot }, aim: { ...t.standSpot } }
        t.owes = true
        const sender = t.orderedBy === null ? null : view.villagers[t.orderedBy]
        if (sender) t.pendingWord = { id: 'water-back', concept: 'RIVER', speaker: i, aim: { x: sender.x, y: 1, z: sender.z } }
        t.arrived = false
        t.dug = 0
        state.staged['water-back'] = (state.staged['water-back'] ?? 0) + 1
      }
      // A carrier who has just made his report still stands there through his
      // hold: the errand ends when the hold does, not on the last syllable.
    } else if (t.arrived && t.phase === 'walk' && !t.owes && t.holdFor === undefined) state.tasks[i] = null
  }

  if (spoken) return rememberWord(state, spoken)

  state.next -= dt
  if (state.next > 0) return null
  state.next = cfg.intervalSeconds * (1 + (rand() - 0.5) * 2 * cfg.intervalSpread)

  const g = view.geography
  for (let tried = 0; tried < ADULT_SITUATIONS.length; tried++) {
    const id = ADULT_SITUATIONS[state.cursor % ADULT_SITUATIONS.length]
    state.cursor++
    if (!castable(id, view)) continue
    const avoid = state.last?.speaker ?? -1

    if (id === 'water-out' && g.waterFoot && g.waterFill && g.waterStand) {
      // THE WORD IS THE ORDER (user 07.09.2026). The inhabitant used to narrate
      // his own act, which reads as staged for the player; DIG works because one
      // man's word sends another. So the errand is cast as two men at the stand:
      // the SENDER, who says RIVER and points at the water, and the CARRIER, who
      // takes the jar and goes. Neither walks with the other.
      // ONE WATER ERRAND AT A TIME. The village has ONE stand and one fill spot,
      // and a second carrier sent while the first is out stands inside him at
      // both — measured in the picture check, where every one of sixteen
      // bearings on the filling man was blocked by another villager. The errand
      // is a round trip held by one carrier, so the next one waits for it.
      if (state.tasks.some((t) => t?.situation === 'water-out' || t?.situation === 'water-back')) continue
      const sender = anyFree(view, avoid)
      if (sender < 0) continue
      const carrier = anotherFreeAdult(view, sender)
      // NO VILLAGER SPEAKS TO NOBODY: with nobody to send, the order is not
      // given at all, and the errand simply does not cast this round.
      if (carrier < 0) continue
      const stand = { ...g.waterStand }
      // TWO MEN, TWO PLACES. The stand itself is the CARRIER's spot: it is where
      // he is handed the errand and where he sets the jar down again. The sender
      // waits a body's width off it — sent to the same point, the two of them
      // simply blocked each other, neither ever counted as arrived, and the word
      // was never spoken.
      // TWO MEN, TWO SPOTS, AND NEITHER OF THEM IS THE STAND ITSELF. The stand
      // is a solid body: a man sent to its centre stalls a walker's width off it
      // and never counts as arrived. Both stand BESIDE it, far enough apart not
      // to block each other.
      const senderSpot = joinSpot(view, stand, rand)
      if (!senderSpot) continue
      // The carrier takes the FAR side, swept from straight opposite the sender:
      // drawing a second spot at random gave the same one wherever the caller's
      // rand is steady, and two men on one spot block each other.
      const carrierSpot = facingSpot(view, stand, senderSpot)
      if (!carrierSpot) continue
      state.tasks[sender] = {
        situation: id, phase: 'send', carry: 'none', role: 'initiator', partner: carrier,
        siteIndex: null, orderedBy: null, standSpot: senderSpot,
        x: senderSpot.x, z: senderSpot.z, arrived: false, dug: 0, owes: true,
        say: { at: senderSpot, aim: g.waterFoot }, via: null, age: 0,
      }
      state.tasks[carrier] = {
        situation: id, phase: 'wait', carry: 'none', role: 'partner', partner: sender,
        siteIndex: null, orderedBy: sender, standSpot: carrierSpot,
        x: carrierSpot.x, z: carrierSpot.z, arrived: false, dug: 0, owes: false,
        say: null, via: null, age: 0,
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }

    if (id === 'dig-first' || id === 'dig-second') {
      const who = anyFree(view, avoid)
      if (who < 0) continue
      const mate = anotherFree(view, who)
      if (mate < 0) continue
      const start = (state.staged[id] ?? 0) + (id === 'dig-second' ? 1 : 0)
      const selected = digSiteFor(state, view, start, who)
      if (!selected) continue
      const spots = digStandingPlaces(selected.site, view.standable)
      if (!spots) continue
      const [initiatorSpot, spot] = spots

      const partnerAt = view.villagers[mate]
      state.tasks[who] = {
        situation: id, phase: 'invite', carry: 'digTool', role: 'initiator', partner: mate, orderedBy: null, standSpot: initiatorSpot,
        siteIndex: selected.index, x: partnerAt.x, z: partnerAt.z, arrived: false, dug: 0,
        owes: true, say: null, via: null, age: 0,
      }
      state.tasks[mate] = {
        situation: id, phase: 'invite', carry: 'digTool', role: 'partner', partner: who, orderedBy: null, standSpot: null,
        siteIndex: selected.index, x: spot.x, z: spot.z, arrived: true, dug: 0,
        owes: false, say: null, via: null, age: 0,
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }
  }
  return null
}
