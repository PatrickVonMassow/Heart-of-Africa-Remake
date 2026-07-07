// Random events (design.md §14): hidden triggering per travelled time step,
// modulated by terrain, region and state. This module is pure — the store
// builds the context, rolls here, and applies the returned outcome to the
// game state and the journal (§16). Protection follows the hand-item rules
// of design.md §7/§14: a rifle protects more than a machete, an item held
// in hand more than one merely carried; in water the rifle only works from
// the canoe (otherwise it is wet), while the machete always helps.

import { balance } from '../config/balance'
import type { EquipmentId, HandId } from '../state/store'

export type EventKind =
  | 'lionAttack'
  | 'leopardAttack'
  | 'snakeBite'
  | 'robberAttack'
  | 'crocodileAttack'
  | 'fever'
  | 'sunblindness'
  | 'sandstorm'
  | 'waterfallSweep'
  | 'findRemains'

export const EVENT_KINDS: EventKind[] = [
  'lionAttack', 'leopardAttack', 'snakeBite', 'robberAttack', 'crocodileAttack',
  'fever', 'sunblindness', 'sandstorm', 'waterfallSweep', 'findRemains',
]

export interface EventContext {
  terrain: string
  inWater: boolean
  nearWaterfall: boolean
  /** Jungle or close to a river/lake: fever country (design.md §14). */
  wetland: boolean
  hand: HandId | null
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
}

/**
 * Risk multiplier from the carried/held weapon (design.md §7/§14): 1 = no
 * protection. In water the rifle counts only when travelling by canoe.
 */
export function weaponProtection(ctx: EventContext): number {
  const hasRifle = (ctx.equipment.rifle ?? 0) > 0
  const hasMachete = (ctx.equipment.machete ?? 0) > 0
  const rifleWorks = hasRifle && (!ctx.inWater || ctx.hand === 'canoe')
  if (rifleWorks) return ctx.hand === 'rifle' ? 0.3 : 0.5
  if (hasMachete) return ctx.hand === 'machete' ? 0.55 : 0.75
  return 1
}

/** Per-day base chance of each event kind in the given context. */
export function eventChance(kind: EventKind, ctx: EventContext): number {
  const r = balance.events
  switch (kind) {
    case 'lionAttack':
      return ctx.terrain === 'savanna' && !ctx.inWater ? r.animalAttack * 0.5 * weaponProtection(ctx) : 0
    case 'leopardAttack':
      return (ctx.terrain === 'savanna' || ctx.terrain === 'jungle') && !ctx.inWater
        ? r.animalAttack * 0.3 * weaponProtection(ctx)
        : 0
    case 'snakeBite':
      return !ctx.inWater && (ctx.terrain === 'savanna' || ctx.terrain === 'jungle' || ctx.terrain === 'desert')
        ? r.animalAttack * 0.2
        : 0
    case 'robberAttack':
      return !ctx.inWater ? r.robberAttack * weaponProtection(ctx) : 0
    case 'crocodileAttack': {
      if (!ctx.inWater) return 0
      // The machete always helps in the water; the rifle only from the canoe.
      const hasMachete = (ctx.equipment.machete ?? 0) > 0
      const rifleWorks = (ctx.equipment.rifle ?? 0) > 0 && ctx.hand === 'canoe'
      const factor = rifleWorks ? 0.35 : hasMachete ? 0.6 : 1
      return r.crocodile * factor
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

/**
 * Resolve an event of the given kind (used by the per-day roll and by the
 * debug trigger, design.md §21). Pure: state changes happen in the store.
 */
export function resolveEvent(kind: EventKind, ctx: EventContext, rand: () => number): EventOutcome {
  switch (kind) {
    case 'lionAttack':
      return { kind, result: attackSeverity(ctx, rand, 0.08) }
    case 'leopardAttack':
      // Lower risk of being eaten than with lions (design.md §14).
      return { kind, result: attackSeverity(ctx, rand, 0.03) }
    case 'snakeBite': {
      const roll = rand()
      return { kind, result: roll < 0.4 ? 'escaped' : roll < 0.85 ? 'light' : 'severe' }
    }
    case 'robberAttack': {
      // The rifle deters thieves (design.md §14), in hand almost always.
      const deterred = ctx.hand === 'rifle' ? rand() < 0.9 : (ctx.equipment.rifle ?? 0) > 0 && rand() < 0.5
      if (deterred) return { kind, result: 'deterred' }
      return { kind, result: 'robbed', money: 10 + Math.floor(rand() * 41) }
    }
    case 'crocodileAttack':
      return { kind, result: attackSeverity(ctx, rand, 0.1) }
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
