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

import { balance } from '../../config/balance'
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
  /** The villager who ORDERED this errand and who its words are addressed to
   *  (work-order 1087). He stands at the water stand for the whole round trip,
   *  because the point's own rule is that no villager speaks to nobody: the
   *  first word is his order to the carrier, the second is the carrier's report
   *  back to him. He is NOT an escort — he walks nowhere. */
  orderedBy: number | null
  arrived: boolean
  /** Seconds this worker has dug in the current bout. */
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

export function createAdultWork(count: number, cfg: AdultWorkConfig): AdultWorkState {
  return {
    last: null,
    tasks: Array.from({ length: Math.max(0, count) }, () => null),
    staged: {},
    next: cfg.intervalSeconds,
    cursor: 0,
    siteProgress: {},
    standJars: 0,
  }
}

export function taskOf(state: AdultWorkState, index: number): AdultTask | null {
  return state.tasks[index] ?? null
}

export function goalOf(task: AdultTask): ErrandPoint {
  return task.via ?? { x: task.x, z: task.z }
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
    if (!t.arrived && Math.hypot(me.x - goal.x, me.z - goal.z) <= WORK_ARRIVE_RADIUS) {
      t.arrived = true
      t.dug = 0
    }

    // THE ORDER AT THE STAND. The sender says RIVER pointing at the water, and
    // what follows it is the carrier setting off — the teaching comes from the
    // act after the word, never from a word spoken beside an act. It is GATED BY
    // A HEARING CHILD exactly as the two DIG utterances are: a word the children
    // are inside the earshot of is held, not spent.
    if (!spoken && t.owes && t.say && t.role === 'initiator' && t.phase === 'send' && t.arrived) {
      const carrier = t.partner === null ? null : state.tasks[t.partner]
      if (!carrier || !view.villagers[t.partner ?? -1]) clearPair(state, i)
      else if (!carrier.arrived) {
        // The carrier is still on his way to the stand: nothing is owed yet.
      } else if (view.childrenHear(me.x, me.z)) t.hushed = true
      else {
        t.owes = false
        t.hushed = false
        spoken = { id: t.situation, concept: 'RIVER', speaker: i, aim: { x: t.say.aim.x, y: 0.2, z: t.say.aim.z } }
        // ... and the carrier takes the empty jar and goes.
        const fill = view.geography.waterFill
        if (fill) {
          carrier.phase = 'fetch'
          carrier.carry = 'emptyJar'
          carrier.x = fill.x
          carrier.z = fill.z
          carrier.arrived = false
        }
      }
    } else if (!spoken && t.owes && t.say && t.situation === 'water-back' &&
               Math.hypot(me.x - t.say.at.x, me.z - t.say.at.z) <= WORK_ARRIVE_RADIUS) {
      // THE RETURN HAS A DESTINATION. He is back at the stand: the jar goes down
      // and he reports to the man who sent him. Same hearing gate.
      const sender = typeof t.orderedBy === 'number' ? view.villagers[t.orderedBy] : null
      if (!sender) clearPair(state, i)
      else if (view.childrenHear(me.x, me.z)) t.hushed = true
      else {
        t.owes = false
        t.hushed = false
        t.carry = 'none'
        state.standJars = Math.min(balance.waterStandCapacity, state.standJars + 1)
        spoken = { id: t.situation, concept: 'RIVER', speaker: i, aim: { x: sender.x, y: 1, z: sender.z } }
        clearPair(state, i)
      }
    } else if (!spoken && t.owes && t.say && t.phase !== 'invite' && t.phase !== 'site' && t.phase !== 'send' &&
        Math.hypot(me.x - t.say.at.x, me.z - t.say.at.z) <= WORK_ARRIVE_RADIUS) {
      t.owes = false
      spoken = { id: t.situation, concept: 'RIVER', speaker: i, aim: { x: t.say.aim.x, y: 0.2, z: t.say.aim.z } }
      if (t.via) { t.via = null; t.arrived = false }
    }

    if (!spoken && t.role === 'initiator' && t.phase === 'invite' && t.arrived && t.owes) {
      const partner = t.partner === null ? null : view.villagers[t.partner]
      if (!partner) clearPair(state, i)
      else if (view.childrenHear(me.x, me.z)) t.hushed = true
      else {
        t.owes = false
        spoken = {
          id: t.situation, concept: 'DIG', speaker: i, purpose: 'invitation',
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

    if (t.phase === 'dig' && t.arrived && t.siteIndex !== null) {
      const before = t.dug
      t.dug += dt
      const progress = (state.siteProgress[t.siteIndex] ??= { dug: 0, strikes: 0 })
      progress.dug += dt
      if (digStrikeCrossed(before, t.dug, i * 0.37)) progress.strikes++
      if (t.dug >= cfg.digSeconds) clearPair(state, i)
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
      if (t.dug >= balance.bankFillSeconds && geo.waterStand) {
        // ONE ROUND TRIP, NOT TWO CASTINGS. The full jar used to appear on a
        // SECOND villager cast at the water, so it came from nowhere; the same
        // carrier turns round here instead. Both situation ids survive as LEG
        // LABELS, which is what keeps the lexicon bookkeeping and the staged
        // counters unchanged.
        t.carry = 'fullJar'
        t.situation = 'water-back'
        t.phase = 'walk'
        t.x = geo.waterStand.x
        t.z = geo.waterStand.z
        // The aim is replaced by the SENDER's own position when the word falls:
        // the report is addressed to the man, not to the ground he stands on.
        t.say = { at: { ...geo.waterStand }, aim: { ...geo.waterStand } }
        t.owes = true
        t.arrived = false
        t.dug = 0
        state.staged['water-back'] = (state.staged['water-back'] ?? 0) + 1
      }
    } else if (t.arrived && t.phase === 'walk' && !t.owes) state.tasks[i] = null
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
      const sender = anyFree(view, avoid)
      if (sender < 0) continue
      const carrier = anotherFreeAdult(view, sender)
      // NO VILLAGER SPEAKS TO NOBODY: with nobody to send, the order is not
      // given at all, and the errand simply does not cast this round.
      if (carrier < 0) continue
      const stand = { ...g.waterStand }
      state.tasks[sender] = {
        situation: id, phase: 'send', carry: 'none', role: 'initiator', partner: carrier,
        siteIndex: null, orderedBy: null,
        x: stand.x, z: stand.z, arrived: false, dug: 0, owes: true,
        say: { at: stand, aim: g.waterFoot }, via: null, age: 0,
      }
      state.tasks[carrier] = {
        situation: id, phase: 'wait', carry: 'none', role: 'partner', partner: sender,
        siteIndex: null, orderedBy: sender,
        x: stand.x, z: stand.z, arrived: false, dug: 0, owes: false,
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
      const selected = digSiteFor(view, start, who)
      if (!selected) continue
      const spot = joinSpot(view, selected.site, rand)
      if (!spot) continue

      const partnerAt = view.villagers[mate]
      state.tasks[who] = {
        situation: id, phase: 'invite', carry: 'digTool', role: 'initiator', partner: mate, orderedBy: null,
        siteIndex: selected.index, x: partnerAt.x, z: partnerAt.z, arrived: false, dug: 0,
        owes: true, say: null, via: null, age: 0,
      }
      state.tasks[mate] = {
        situation: id, phase: 'invite', carry: 'digTool', role: 'partner', partner: who, orderedBy: null,
        siteIndex: selected.index, x: spot.x, z: spot.z, arrived: true, dug: 0,
        owes: false, say: null, via: null, age: 0,
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }
  }
  return null
}
