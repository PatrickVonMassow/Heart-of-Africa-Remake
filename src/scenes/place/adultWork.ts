// The adults teach by DOING THEIR OWN WORK (work-order 688). Two words, two
// situations each, and no translation among them.
//
// NO VILLAGER SPEAKS TO NOBODY (work-order 1065). Every utterance here has an
// ADDRESSEE who reacts and a consequence the player watches; the teaching comes
// from the act that follows the word, never from a word spoken beside an act.
//
// RIVER used to break that rule. It was cast twice — a man setting out with an
// empty jar, and, seconds later, whoever happened to be standing near the water
// arriving with a full one — so the same inhabitant narrated his own errand, the
// full jar came from nowhere, and the return's goal was open ground where the
// task was nulled and the jar vanished in the same frame. The user read it for
// what it was: staged for him rather than done for a reason.
//
// So RIVER is now a DISPATCH, one errand with two legs. At the village water
// stand an adult turns to a free neighbour, says RIVER and points at the water;
// the neighbour takes the empty jar, walks down to the waterline, DIPS the jar
// in the water where the player can see it fill, carries it back to the stand,
// sets it down and says RIVER again to the man who sent him. Both words fall in
// the village, at the stand; nothing is said at the water. The two old situation
// ids survive as LEG LABELS, so the lexicon bookkeeping and the staged counters
// are unchanged.
//
// DIG works the same way and always did: it is an invitation, not a running
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

/**
 * What the catalogue may START. `water-back` is no longer one of them: it is the
 * RETURN LEG of the errand `water-out` opens, not a second casting that finds
 * whoever is standing nearest the water and hands him a full jar (work-order
 * 1065). It keeps its id because that id labels the leg, is counted in `staged`
 * and is what the lexicon bookkeeping reads.
 */
export const CASTABLE_SITUATIONS: readonly AdultSituationId[] = [
  'water-out',
  'dig-first',
  'dig-second',
] as const

export const ADULT_CONCEPTS: readonly ConceptId[] = ['RIVER', 'DIG']

export type AdultCarry = 'none' | 'emptyJar' | 'fullJar' | 'digTool'
export type AdultPhase = 'walk' | 'fetch' | 'invite' | 'site' | 'dig' | 'fill' | 'wait'
export type DigUtterance = 'invitation' | 'site'
/** Which of the errand's two RIVER words this is: the order, or the delivery. */
export type WaterUtterance = 'order' | 'delivery'

export interface ErrandPoint { x: number; z: number }

export interface DigSite extends ErrandPoint {
  kind: 'pit' | 'postHole' | 'patch'
}

export interface AdultWorkGeography {
  waterHead: ErrandPoint | null
  waterFoot: ErrandPoint | null
  /** The village's water stand: where the errand is ordered, where the jar is
   *  set down, and where BOTH of its words fall (work-order 1065). */
  waterStand: ErrandPoint | null
  /** Where the jar goes into the water — ankle deep at the waterline. */
  waterFill: ErrandPoint | null
  digSites: readonly DigSite[]
}

export interface AdultWorker extends ErrandPoint { free: boolean }

export interface AdultWorkView {
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
  /** Which of the errand's two RIVER words this is; absent for DIG. */
  errand?: WaterUtterance
  /** WHO IT IS SAID TO. Every utterance has an addressee who reacts — the rule
   *  the old water commentary broke. Absent only where the moment genuinely has
   *  none, which today is nowhere. */
  to?: number
}

export interface AdultWorkConfig {
  intervalSeconds: number
  intervalSpread: number
  dwellSeconds: number
  digSeconds: number
  errandSeconds: number
  stallSeconds: number
  pace: number
  /** How long the jar stays under the water, in seconds — the act itself. */
  fillSeconds: number
  /** How many jars the village water stand holds before a delivery replaces the
   *  oldest one. */
  standCapacity: number
}

export interface AdultTask extends ErrandPoint {
  situation: AdultSituationId
  phase: AdultPhase
  carry: AdultCarry
  role: 'worker' | 'initiator' | 'partner'
  partner: number | null
  siteIndex: number | null
  hushed?: boolean
  arrived: boolean
  /** Seconds this worker has dug in the current bout, or held the jar under
   *  the water in the current fill. */
  dug: number
  /** The utterance belonging to the current phase is still owed. */
  owes: boolean
  say: { at: ErrandPoint; aim: ErrandPoint } | null
  via: ErrandPoint | null
  age: number
}

export interface DigSiteProgress {
  /** Worker-seconds accumulated at this site during the visit. */
  dug: number
  /** Completed tool strikes accumulated at this site during the visit. */
  strikes: number
}

export interface AdultWorkState {
  last: { id: AdultSituationId; concept: ConceptId; speaker: number; age: number; purpose?: DigUtterance } | null
  tasks: (AdultTask | null)[]
  staged: Partial<Record<AdultSituationId, number>>
  next: number
  cursor: number
  siteProgress: Record<number, DigSiteProgress>
  /** Jars delivered to the village water stand this visit. What the scene draws
   *  is this capped at the stand's capacity, so a further delivery replaces the
   *  oldest jar and no consumer logic is owed (work-order 1065). */
  delivered: number
}

export const WORK_ARRIVE_RADIUS = 1.1
/**
 * How near the FILL leg must come to the waterline before the jar goes down.
 *
 * The shared radius is 1.1 m, which on the bank's own slope is some 18 cm of
 * height: the carrier stopped short, on ground still 8 cm ABOVE the drawn water
 * surface, and dipped the jar into air (measured 08.09.2026, work-order 1065).
 * The fill is the one leg whose arrival is judged against a drawn surface, so it
 * arrives tightly — and the shore under it is a slope, never a step
 * (`BANK_MAX_STEP`), so the last third of a metre costs a walker nothing.
 */
export const FILL_ARRIVE_RADIUS = 0.35
export const AIM_CLEARANCE = 1.2
export const JOIN_STAND_OFF = 2.4
const JOIN_BEARINGS = 12
/** How far apart two men joining the same thing are placed. */
const JOIN_APART = 1.2

function joinSpot(
  view: AdultWorkView,
  site: ErrandPoint,
  rand: () => number,
  avoid: ErrandPoint | null = null,
): ErrandPoint | null {
  const start = rand() * Math.PI * 2
  for (let k = 0; k < JOIN_BEARINGS; k++) {
    const a = start + (k / JOIN_BEARINGS) * Math.PI * 2
    const x = site.x + Math.cos(a) * JOIN_STAND_OFF
    const z = site.z + Math.sin(a) * JOIN_STAND_OFF
    if (!view.standable(x, z)) continue
    if (avoid && Math.hypot(x - avoid.x, z - avoid.z) < JOIN_APART) continue
    return { x, z }
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
    siteProgress: {},
    delivered: 0,
  }
}

/** How many jars are standing on the village water stand right now. */
export function jarsOnStand(state: AdultWorkState, capacity: number): number {
  return Math.min(Math.max(0, Math.floor(capacity)), state.delivered)
}

export function taskOf(state: AdultWorkState, index: number): AdultTask | null {
  return state.tasks[index] ?? null
}

export function goalOf(task: AdultTask): ErrandPoint {
  return task.via ?? { x: task.x, z: task.z }
}

/** How near this task's goal counts as ARRIVED. One answer for the scheduler and
 *  for the walk that feeds it, so a leg can never stop outside the radius that
 *  would have let it begin. */
export function arriveRadiusOf(task: AdultTask): number {
  return isWater(task) && task.phase === 'fetch' && !task.via ? FILL_ARRIVE_RADIUS : WORK_ARRIVE_RADIUS
}

export function isDigging(state: AdultWorkState, index: number): boolean {
  const t = state.tasks[index]
  return !!t && t.phase === 'dig' && t.arrived
}

export function carryOf(state: AdultWorkState, index: number): AdultCarry {
  return state.tasks[index]?.carry ?? 'none'
}

/** A copy suitable for React state and diagnostics; callers cannot mutate work. */
export function digProgressOf(state: AdultWorkState, siteCount: number): DigSiteProgress[] {
  return Array.from({ length: siteCount }, (_, i) => ({
    dug: state.siteProgress[i]?.dug ?? 0,
    strikes: state.siteProgress[i]?.strikes ?? 0,
  }))
}

function clearPair(state: AdultWorkState, index: number): void {
  const task = state.tasks[index]
  state.tasks[index] = null
  if (task?.partner !== null && task?.partner !== undefined) state.tasks[task.partner] = null
}

function assertNoOwedWord(task: AdultTask, index: number): void {
  devAssert(
    !task.owes || task.hushed === true,
    'adult-atom-lost',
    () => `${task.situation}: villager ${index} ran out of time with his ${task.phase} word unspoken`,
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

function castable(id: AdultSituationId, view: AdultWorkView): boolean {
  const g = view.geography
  if (id === 'water-out' || id === 'water-back') return !!(g.waterStand && g.waterFill)
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

function digSiteFor(view: AdultWorkView, start: number, initiator: number): { site: DigSite; index: number } | null {
  const sites = view.geography.digSites
  for (let k = 0; k < sites.length; k++) {
    const index = (start + k) % sites.length
    if (siteClear(view, sites[index], initiator)) return { site: sites[index], index }
  }
  return null
}

function pairReady(state: AdultWorkState, task: AdultTask): boolean {
  if (task.partner === null) return false
  const partner = state.tasks[task.partner]
  return !!partner && partner.arrived && task.arrived && partner.phase === 'site'
}

/** Is this task a leg of the water errand? Both ids name one round trip. */
function isWater(task: AdultTask): boolean {
  return task.situation === 'water-out' || task.situation === 'water-back'
}

/**
 * The word has fallen: the sender stays at the stand and waits for his water,
 * the neighbour takes the empty jar and sets off for the waterline.
 */
function sendForWater(state: AdultWorkState, initiator: AdultTask, geography: AdultWorkGeography): void {
  if (initiator.partner === null) return
  const carrier = state.tasks[initiator.partner]
  const fill = geography.waterFill
  if (!carrier || !fill) return
  initiator.phase = 'wait'
  initiator.owes = false
  delete initiator.hushed
  carrier.phase = 'fetch'
  carrier.carry = 'emptyJar'
  carrier.x = fill.x
  carrier.z = fill.z
  carrier.arrived = false
  carrier.dug = 0
  // The delivery word is his, and it is owed from the moment he is sent: an
  // errand that expires with it unspoken is the defect `assertNoOwedWord` names.
  carrier.owes = true
}

/** The jar comes up full and goes onto his head; he walks back to the stand. */
function carryBack(carrier: AdultTask, geography: AdultWorkGeography): void {
  const stand = geography.waterStand
  if (!stand) return
  carrier.situation = 'water-back'
  carrier.phase = 'walk'
  carrier.carry = 'fullJar'
  carrier.x = stand.x
  carrier.z = stand.z
  carrier.arrived = false
  carrier.dug = 0
}

function startJointWalk(state: AdultWorkState, initiator: AdultTask, geography: AdultWorkGeography): void {
  if (initiator.partner === null || initiator.siteIndex === null) return
  const partner = state.tasks[initiator.partner]
  const site = geography.digSites[initiator.siteIndex]
  if (!partner || !site) return
  initiator.phase = 'site'
  initiator.x = site.x
  initiator.z = site.z
  initiator.arrived = false
  initiator.owes = true
  delete initiator.hushed
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

export function stepAdultWork(
  state: AdultWorkState,
  view: AdultWorkView,
  dt: number,
  cfg: AdultWorkConfig,
  rand: () => number,
): SpokenWord | null {
  if (state.last) state.last.age += dt
  let spoken: SpokenWord | null = null

  for (let i = 0; i < state.tasks.length; i++) {
    const t = state.tasks[i]
    if (!t) continue
    t.age += dt
    const me = view.villagers[i]
    if (!me || t.age > cfg.errandSeconds) {
      // Expiry releases the whole pair, but it may not silently spend either
      // member's word. A word deliberately held for a child is the one valid
      // exception; beginning the site phase clears an earlier invitation hush.
      assertNoOwedWord(t, i)
      if (t.partner !== null) {
        const partner = state.tasks[t.partner]
        if (partner) assertNoOwedWord(partner, t.partner)
      }
      clearPair(state, i)
      continue
    }

    const goal = goalOf(t)
    if (!t.arrived && Math.hypot(me.x - goal.x, me.z - goal.z) <= arriveRadiusOf(t)) {
      t.arrived = true
      t.dug = 0
    }

    // THE ORDER. An adult at the stand turns to the neighbour standing there and
    // sends him for water: the word, the point at the river, and the jar going
    // into his hands (work-order 1065).
    if (!spoken && isWater(t) && t.role === 'initiator' && t.phase === 'invite' && t.arrived && t.owes) {
      const partner = t.partner === null ? null : view.villagers[t.partner]
      const fill = view.geography.waterFill
      if (!partner || !fill) clearPair(state, i)
      else if (view.childrenHear(me.x, me.z)) t.hushed = true
      else {
        t.owes = false
        spoken = {
          id: 'water-out', concept: 'RIVER', speaker: i, errand: 'order', to: t.partner ?? undefined,
          aim: { x: fill.x, y: 0.2, z: fill.z },
        }
        sendForWater(state, t, view.geography)
      }
    } else if (!spoken && isWater(t) && t.role === 'partner' && t.phase === 'walk' && t.arrived && t.owes) {
      // THE DELIVERY. He is back at the stand with a full jar; he sets it down
      // and reports to the man who sent him, who is still standing there.
      const sender = t.partner === null ? null : view.villagers[t.partner]
      if (!sender) clearPair(state, i)
      else if (view.childrenHear(me.x, me.z)) t.hushed = true
      else {
        t.owes = false
        t.carry = 'none'
        state.delivered++
        state.staged['water-back'] = (state.staged['water-back'] ?? 0) + 1
        spoken = {
          id: 'water-back', concept: 'RIVER', speaker: i, errand: 'delivery', to: t.partner ?? undefined,
          aim: { x: sender.x, y: 1, z: sender.z },
        }
        clearPair(state, i)
      }
    }

    if (!spoken && t.owes && t.say && t.phase !== 'invite' && t.phase !== 'site' &&
        Math.hypot(me.x - t.say.at.x, me.z - t.say.at.z) <= WORK_ARRIVE_RADIUS) {
      t.owes = false
      spoken = { id: t.situation, concept: 'RIVER', speaker: i, aim: { x: t.say.aim.x, y: 0.2, z: t.say.aim.z } }
      if (t.via) { t.via = null; t.arrived = false }
    }

    if (!spoken && !isWater(t) && t.role === 'initiator' && t.phase === 'invite' && t.arrived && t.owes) {
      const partner = t.partner === null ? null : view.villagers[t.partner]
      if (!partner) clearPair(state, i)
      else if (view.childrenHear(me.x, me.z)) t.hushed = true
      else {
        t.owes = false
        spoken = {
          id: t.situation, concept: 'DIG', speaker: i, purpose: 'invitation', to: t.partner ?? undefined,
          aim: { x: partner.x, y: 1, z: partner.z },
        }
        startJointWalk(state, t, view.geography)
      }
    } else if (!spoken && t.role === 'initiator' && t.phase === 'site' && pairReady(state, t) && t.owes) {
      if (view.childrenHear(me.x, me.z)) t.hushed = true
      else if (t.siteIndex !== null) {
        const site = view.geography.digSites[t.siteIndex]
        if (site && !siteClear(view, site, i, t.partner ?? -1)) t.hushed = true
        else if (site) {
          t.owes = false
          spoken = {
            id: t.situation, concept: 'DIG', speaker: i, purpose: 'site',
            aim: { x: site.x, y: 0, z: site.z },
          }
          startDigging(state, t)
        }
      }
    }

    // THE FILL. He is at the waterline with the jar in his hand; he bends, the
    // jar goes under the drawn surface and stays there a readable moment. Only
    // when it comes up is it FULL — the carry never flips without the act.
    if (isWater(t) && t.phase === 'fetch' && t.arrived) {
      t.dug += dt
      if (t.dug < cfg.fillSeconds) t.phase = 'fill'
    }
    if (isWater(t) && t.phase === 'fill') {
      t.dug += dt
      if (t.dug >= cfg.fillSeconds) carryBack(t, view.geography)
    }

    if (t.phase === 'dig' && t.arrived && t.siteIndex !== null) {
      const before = t.dug
      t.dug += dt
      const progress = (state.siteProgress[t.siteIndex] ??= { dug: 0, strikes: 0 })
      progress.dug += dt
      if (digStrikeCrossed(before, t.dug, i * 0.37)) progress.strikes++
      if (t.dug >= cfg.digSeconds) clearPair(state, i)
    } else if (!isWater(t) && t.arrived && t.phase === 'fetch' && !t.via) {
      t.dug += dt
      if (t.dug >= cfg.dwellSeconds) state.tasks[i] = null
    } else if (!isWater(t) && t.arrived && t.phase === 'walk') state.tasks[i] = null
  }

  if (spoken) return rememberWord(state, spoken)

  state.next -= dt
  if (state.next > 0) return null
  state.next = cfg.intervalSeconds * (1 + (rand() - 0.5) * 2 * cfg.intervalSpread)

  const g = view.geography
  for (let tried = 0; tried < CASTABLE_SITUATIONS.length; tried++) {
    const id = CASTABLE_SITUATIONS[state.cursor % CASTABLE_SITUATIONS.length]
    state.cursor++
    if (!castable(id, view)) continue
    const avoid = state.last?.speaker ?? -1

    // THE WATER ERRAND IS ORDERED, not narrated (work-order 1065). One adult
    // walks to the stand to send another; the other is already standing beside
    // it. Nothing is carried and nothing is said until they are both there and
    // no child is within earshot — the same yield the two DIG words keep.
    if (id === 'water-out' && g.waterStand && g.waterFill) {
      const who = anyFree(view, avoid)
      if (who < 0) continue
      const mate = anotherFree(view, who)
      if (mate < 0) continue
      // THE SENDER WALKS TO A PLACE HE CAN STAND IN. He used to be sent to the
      // stand's own spot — which is a collider, so the walk resolved him to a
      // ring 18 cm wide inside the arrival radius and the avoidance normally
      // steered him round it instead. Measured 08.09.2026: five of six runs on a
      // quiet machine saw the errand stand in `invite` for its whole life, the
      // word never falling and no water ever fetched. Both men now take a join
      // stand-off beside the stand, the same free ground a dig pair joins on.
      const spot = joinSpot(view, g.waterStand, rand)
      if (!spot) continue
      const mateSpot = joinSpot(view, g.waterStand, rand, spot)
      if (!mateSpot) continue
      state.tasks[who] = {
        situation: id, phase: 'invite', carry: 'none', role: 'initiator', partner: mate,
        siteIndex: null, x: spot.x, z: spot.z, arrived: false, dug: 0,
        owes: true, say: null, via: null, age: 0,
      }
      state.tasks[mate] = {
        situation: id, phase: 'invite', carry: 'none', role: 'partner', partner: who,
        siteIndex: null, x: mateSpot.x, z: mateSpot.z, arrived: true, dug: 0,
        owes: false, say: null, via: null, age: 0,
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
      const selected = digSiteFor(view, start, who)
      if (!selected) continue
      const spot = joinSpot(view, selected.site, rand)
      if (!spot) continue

      const partnerAt = view.villagers[mate]
      state.tasks[who] = {
        situation: id, phase: 'invite', carry: 'digTool', role: 'initiator', partner: mate,
        siteIndex: selected.index, x: partnerAt.x, z: partnerAt.z, arrived: false, dug: 0,
        owes: true, say: null, via: null, age: 0,
      }
      state.tasks[mate] = {
        situation: id, phase: 'invite', carry: 'digTool', role: 'partner', partner: who,
        siteIndex: selected.index, x: spot.x, z: spot.z, arrived: true, dug: 0,
        owes: false, say: null, via: null, age: 0,
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }
  }
  return null
}
