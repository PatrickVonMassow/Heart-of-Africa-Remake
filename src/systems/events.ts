// Random events (design.md §14): hidden triggering per travelled time step,
// modulated by terrain, region and state. This module is pure — the store
// builds the context, rolls here, and applies the returned outcome to the
// game state and the journal (§16). Protection follows item *possession*
// (design.md §7/§14): a rifle protects more than a machete; in water the rifle
// only works from the canoe (otherwise it is wet), while the machete always
// helps.

import { balance } from '../config/balance'
import type { EquipmentId } from '../state/store'

export type EventKind =
  | 'lionAttack'
  | 'cheetahAttack'
  | 'leopardAttack'
  | 'hyenaAttack'
  | 'snakeBite'
  | 'robberAttack'
  | 'crocodileAttack'
  | 'fever'
  | 'sunblindness'
  | 'sandstorm'
  | 'waterfallSweep'
  | 'findRemains'

export const EVENT_KINDS: EventKind[] = [
  'lionAttack', 'cheetahAttack', 'leopardAttack', 'hyenaAttack', 'snakeBite',
  'robberAttack', 'crocodileAttack',
  'fever', 'sunblindness', 'sandstorm', 'waterfallSweep', 'findRemains',
]

export interface EventContext {
  terrain: string
  inWater: boolean
  nearWaterfall: boolean
  /** Jungle or close to a river/lake: fever country (design.md §14). */
  wetland: boolean
  /** Near a village of a region with "Honored Friend" status (§12): the
   * natives rush to help — at most a light injury results. */
  protectedByFriends: boolean
  /** The predators that roam the current region (point 208 A3): a predator
   * attack fires only where that species actually lives, so the journal never
   * reports a hyena in a region whose rendered world holds none. */
  regionPredators: readonly string[]
  equipment: Partial<Record<EquipmentId, number>>
}

export interface EventOutcome {
  kind: EventKind
  /** How it went; drives the journal sentence and the state change. */
  result: 'escaped' | 'defended' | 'light' | 'severe' | 'fatal' | 'deterred' | 'robbed' | 'afflicted' | 'weather' | 'swept' | 'find'
  /** Money stolen (robbers) or found (remains). */
  money?: number
  /** Days lost (sandstorm shelter). */
  daysLost?: number
  /** Natives of a friend region rushed to the rescue (design.md §12). */
  rescued?: boolean
}

/**
 * Risk multiplier from the carried weapons (design.md §7/§14): 1 = no
 * protection. A rifle in the pack cuts the risk considerably; in water it only
 * works from the canoe (otherwise it is wet); a machete is the lesser fallback.
 */
export function weaponProtection(ctx: EventContext): number {
  const hasRifle = (ctx.equipment.rifle ?? 0) > 0
  const hasMachete = (ctx.equipment.machete ?? 0) > 0
  const hasCanoe = (ctx.equipment.canoe ?? 0) > 0
  const rifleWorks = hasRifle && (!ctx.inWater || hasCanoe)
  if (rifleWorks) return 0.25
  if (hasMachete) return 0.6
  return 1
}

/** Per-day base chance of each event kind in the given context. */
export function eventChance(kind: EventKind, ctx: EventContext): number {
  const r = balance.events
  switch (kind) {
    case 'lionAttack':
      return ctx.terrain === 'savanna' && !ctx.inWater && ctx.regionPredators.includes('lion')
        ? r.animalAttack * 0.5 * weaponProtection(ctx)
        : 0
    case 'cheetahAttack':
      // Cheetahs of the open plains: timid toward people, so the rarest and
      // least dangerous of the cats (design.md §14/§19). Only where they roam
      // (point 208 A3).
      return ctx.terrain === 'savanna' && !ctx.inWater && ctx.regionPredators.includes('cheetah')
        ? r.animalAttack * 0.15 * weaponProtection(ctx)
        : 0
    case 'leopardAttack':
      return (ctx.terrain === 'savanna' || ctx.terrain === 'jungle') && !ctx.inWater && ctx.regionPredators.includes('leopard')
        ? r.animalAttack * 0.3 * weaponProtection(ctx)
        : 0
    case 'hyenaAttack':
      // Spotted hyenas of the plains: bolder than the cats, a real threat —
      // only in the regions whose rendered world holds them (point 208 A3).
      return ctx.terrain === 'savanna' && !ctx.inWater && ctx.regionPredators.includes('hyena')
        ? r.animalAttack * 0.35 * weaponProtection(ctx)
        : 0
    case 'snakeBite':
      return !ctx.inWater && (ctx.terrain === 'savanna' || ctx.terrain === 'jungle' || ctx.terrain === 'desert')
        ? r.animalAttack * 0.2
        : 0
    case 'robberAttack':
      return !ctx.inWater ? r.robberAttack * weaponProtection(ctx) : 0
    case 'crocodileAttack': {
      if (!ctx.inWater) return 0
      // Crocodiles strike swimmers; a canoe keeps the traveller out of reach.
      // The machete ALWAYS helps against a crocodile — including from the canoe
      // (point 208 A5, design.md §14.2): machete-in-canoe is strictly safer than
      // the canoe alone. The rifle only works from the canoe (otherwise wet).
      const hasCanoe = (ctx.equipment.canoe ?? 0) > 0
      const hasMachete = (ctx.equipment.machete ?? 0) > 0
      if (hasCanoe) {
        if ((ctx.equipment.rifle ?? 0) > 0) return r.crocodile * 0.2
        return r.crocodile * (hasMachete ? 0.3 : 0.4)
      }
      return r.crocodile * (hasMachete ? 0.6 : 1)
    }
    case 'fever':
      return ctx.wetland && !ctx.inWater ? r.fever : 0
    case 'sunblindness':
      return ctx.terrain === 'desert' ? r.sunblindness : 0
    case 'sandstorm':
      return ctx.terrain === 'desert' ? r.sandstorm : 0
    case 'waterfallSweep':
      return ctx.inWater && ctx.nearWaterfall ? r.waterfallSweep : 0
    case 'findRemains':
      return ctx.inWater ? 0 : r.findRemains
  }
}

/** Severity of a resolved attack; better weapons shift it toward escape. */
function attackSeverity(
  ctx: EventContext,
  rand: () => number,
  fatalChance: number,
): EventOutcome['result'] {
  const p = weaponProtection(ctx)
  const roll = rand()
  if (roll < 0.45) return p < 1 ? 'defended' : 'escaped'
  if (roll < 0.45 + fatalChance * p) return 'fatal'
  if (roll < 0.8) return 'light'
  return 'severe'
}

/** Resolve an animal attack, honoring the friend protection (§12). */
function resolveAttack(kind: EventKind, ctx: EventContext, rand: () => number, fatalChance: number): EventOutcome {
  const severity = attackSeverity(ctx, rand, fatalChance)
  if (ctx.protectedByFriends) {
    // Rescue by the natives: at most lightly injured (design.md §12/§14).
    const capped = severity === 'fatal' || severity === 'severe' || severity === 'light' ? 'light' : 'escaped'
    return { kind, result: capped, rescued: true }
  }
  return { kind, result: severity }
}

/**
 * Resolve an event of the given kind (used by the per-day roll and by the
 * debug trigger, design.md §21). Pure: state changes happen in the store.
 */
export function resolveEvent(kind: EventKind, ctx: EventContext, rand: () => number): EventOutcome {
  switch (kind) {
    case 'lionAttack':
      return resolveAttack(kind, ctx, rand, 0.08)
    case 'cheetahAttack':
      // Cheetahs rarely press an attack home — the lowest fatal risk.
      return resolveAttack(kind, ctx, rand, 0.01)
    case 'leopardAttack':
      // Lower risk of being eaten than with lions (design.md §14).
      return resolveAttack(kind, ctx, rand, 0.03)
    case 'hyenaAttack':
      // More dangerous than the leopard, still below the apex lion.
      return resolveAttack(kind, ctx, rand, 0.05)
    case 'snakeBite': {
      const roll = rand()
      const result = roll < 0.4 ? 'escaped' : roll < 0.85 ? 'light' : 'severe'
      if (ctx.protectedByFriends && result === 'severe') return { kind, result: 'light', rescued: true }
      return { kind, result }
    }
    case 'robberAttack': {
      // Near friend villages the natives drive robbers off (design.md §12).
      if (ctx.protectedByFriends) return { kind, result: 'deterred', rescued: true }
      // A rifle in the pack deters thieves most of the time (design.md §14).
      const deterred = (ctx.equipment.rifle ?? 0) > 0 && rand() < 0.85
      if (deterred) return { kind, result: 'deterred' }
      return { kind, result: 'robbed', money: 10 + Math.floor(rand() * 41) }
    }
    case 'crocodileAttack':
      return resolveAttack(kind, ctx, rand, 0.1)
    case 'fever':
      return { kind, result: 'afflicted' }
    case 'sunblindness':
      return { kind, result: 'afflicted' }
    case 'sandstorm':
      return { kind, result: 'weather', daysLost: 0.5 + rand() }
    case 'waterfallSweep':
      return { kind, result: 'swept' }
    case 'findRemains':
      return { kind, result: 'find', money: 5 + Math.floor(rand() * 21) }
  }
}

/** Roll whether any event fires for the travelled day fraction. */
export function rollEvent(ctx: EventContext, dayDelta: number, rand: () => number): EventOutcome | null {
  for (const kind of EVENT_KINDS) {
    if (rand() < eventChance(kind, ctx) * dayDelta) return resolveEvent(kind, ctx, rand)
  }
  return null
}

// Dev hook for the headless verification (CLAUDE.md §7.2).
if (import.meta.env.DEV && typeof window !== 'undefined') {
  ;(window as unknown as Record<string, unknown>).__events = { weaponProtection, eventChance, resolveEvent }
}
