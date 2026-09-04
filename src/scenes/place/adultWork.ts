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
// Both utterances yield while a child can hear. A bout that cannot cast two
// free adults is not staged at all and returns on a later catalogue pass. The
// module also records every worker-second and every completed stroke at the
// site, giving the scene one durable source for the deepening pit, growing
// spoil and thrown earth.
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

export const ADULT_CONCEPTS: readonly ConceptId[] = ['RIVER', 'DIG']

export type AdultCarry = 'none' | 'emptyJar' | 'fullJar' | 'digTool'
export type AdultPhase = 'walk' | 'fetch' | 'invite' | 'site' | 'dig'
export type DigUtterance = 'invitation' | 'site'

export interface ErrandPoint { x: number; z: number }

export interface DigSite extends ErrandPoint {
  kind: 'pit' | 'postHole' | 'patch'
}

export interface AdultWorkGeography {
  waterHead: ErrandPoint | null
  waterFoot: ErrandPoint | null
  digSites: readonly DigSite[]
}

export interface AdultWorker extends ErrandPoint { free: boolean }

export interface AdultWorkView {
  villagers: readonly AdultWorker[]
  geography: AdultWorkGeography
  standable: (x: number, z: number) => boolean
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
}

export const WORK_ARRIVE_RADIUS = 1.1
export const WATER_FOOT_REACH = 4
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
      if (d <= fallbackD) { fallbackD = d; fallback = i }
    } else if (d <= bestD) { bestD = d; best = i }
  }
  return best >= 0 ? best : fallback
}

function anyFree(view: AdultWorkView, avoid: number): number {
  for (let i = 0; i < view.villagers.length; i++) if (view.villagers[i].free && i !== avoid) return i
  for (let i = 0; i < view.villagers.length; i++) if (view.villagers[i].free) return i
  return -1
}

function anotherFree(view: AdultWorkView, first: number): number {
  for (let i = 0; i < view.villagers.length; i++) if (i !== first && view.villagers[i].free) return i
  return -1
}

function castable(id: AdultSituationId, view: AdultWorkView): boolean {
  const g = view.geography
  if (id === 'water-out' || id === 'water-back') return !!(g.waterHead && g.waterFoot)
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

    if (!spoken && t.owes && t.say && t.phase !== 'invite' && t.phase !== 'site' &&
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
      t.dug += dt
      if (t.dug >= cfg.dwellSeconds) state.tasks[i] = null
    } else if (t.arrived && t.phase === 'walk') state.tasks[i] = null
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

    if (id === 'water-out' && g.waterHead && g.waterFoot) {
      const who = anyFree(view, avoid)
      if (who < 0) continue
      state.tasks[who] = {
        situation: id, phase: 'fetch', carry: 'emptyJar', role: 'worker', partner: null, siteIndex: null,
        x: g.waterFoot.x, z: g.waterFoot.z, arrived: false, dug: 0, owes: true,
        say: { at: g.waterHead, aim: g.waterFoot }, via: { ...g.waterHead }, age: 0,
      }
      state.staged[id] = (state.staged[id] ?? 0) + 1
      return null
    }

    if (id === 'water-back' && g.waterHead && g.waterFoot) {
      const who = nearestFree(view, g.waterFoot, WATER_FOOT_REACH, avoid)
      if (who < 0) continue
      state.tasks[who] = {
        situation: id, phase: 'walk', carry: 'fullJar', role: 'worker', partner: null, siteIndex: null,
        x: g.waterHead.x, z: g.waterHead.z, arrived: false, dug: 0, owes: true,
        say: { at: g.waterHead, aim: g.waterFoot }, via: null, age: 0,
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
