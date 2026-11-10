// Every death has a VISIBLE cause (design.md §19.8): a predator that reaches
// the body, a crocodile that holds it, an elephant's feet, the water, the fire,
// a rival's blow. A death with no actor reads as an animal simply falling over
// (user report 25.07.2026: a parent at its crocodile-taken calf's spot dropped
// dead with nothing there). Every death path records its cause on the body, and
// the dev-assert below checks, at the moment of death, that the cause's actor is
// genuinely there. Pure, so the rule is unit-testable.

import { devAssert } from '../../systems/devAssert'

/** Every way an animal in the travel world dies, or lies dead. */
export const DEATH_CAUSES = [
  'predator', // the scripted hunt's kill, sacrifice, shield take, too-late take, vigil keeper
  'crocodile', // the crocodile's catch, sacrifice and alongside take
  'trample', // an elephant's moving feet, the grief-trample included
  'drowning', // a swollen current held it under (point 122)
  'waterfall', // swept over the falls, or the parent's plunge after its calf
  'fire', // the burning grass and the parent that goes in after its calf
  'fight', // a lethal rival fight between herd males
  'revenge', // a predator slain by a defending parent (point 146)
  'plague', // the rinderpest toll, spawned dead (point 133)
  'remnant', // the scrap a predator leaves, spawned dead
  'staged', // a debug-menu carcass (design.md §21.3)
] as const

export type DeathCause = (typeof DEATH_CAUSES)[number]

/** Bodies that are SPAWNED dead (or staged by the debug menu): no death event
 *  happens in view, so no actor is owed. */
const SPAWNED: ReadonlySet<DeathCause> = new Set<DeathCause>(['plague', 'remnant', 'staged'])

/** Causes whose actor is the place itself (the river, the falls, the flame
 *  line) — the caller reports distance 0 when the body is in it. */
export const ENVIRONMENT_CAUSES: ReadonlySet<DeathCause> = new Set<DeathCause>(['drowning', 'waterfall', 'fire'])

/**
 * How far the cause's actor may stand from the body at the moment of death.
 * The widest legitimate case is the land too-late take: the parent up to the
 * too-late distance (3.2) from its calf, the predator feeding at the calf's
 * flank (~0.75) — plus a margin for one frame's movement. Dev-assert tolerance,
 * not a gameplay value.
 */
export const DEATH_ACTOR_REACH = 5

/** Record a death's cause on the body. */
export function recordDeathCause(a: { deathCause?: DeathCause }, cause: DeathCause): void {
  a.deathCause = cause
}

/**
 * Is this death's cause visible? `actorDist` is the distance from the body to
 * the actor that killed it (0 for an environment cause the body is in), or
 * null when no such actor exists. A death without a cause is never visible.
 */
export function deathCauseVisible(
  cause: DeathCause | undefined,
  actorDist: number | null,
  reach: number = DEATH_ACTOR_REACH,
): boolean {
  if (cause === undefined) return false
  if (SPAWNED.has(cause)) return true
  if (actorDist === null || !Number.isFinite(actorDist)) return false
  return actorDist <= reach
}

/** The dev-assert "death without a visible cause", raised at the death itself. */
export function assertVisibleDeath(
  a: { x: number; z: number; deathCause?: DeathCause },
  actorDist: number | null,
  label = 'animal',
): void {
  devAssert(
    deathCauseVisible(a.deathCause, actorDist),
    'death-without-visible-cause',
    () =>
      `${label} at ${a.x.toFixed(1)},${a.z.toFixed(1)} cause ${a.deathCause ?? 'none'} actor ${
        actorDist === null ? 'none' : actorDist.toFixed(2)
      }`,
  )
}

/**
 * Does the scripted hunt still hold a land-predator catch? It does while the
 * hunt runs and the animal is its victim — or lies within the predator's reach
 * (the mired calf whose charging parent the hunter took in its place, point
 * 123: both are taken at the waterhole). A seized animal whose hunter has gone
 * (the hunt reset to idle, or walked off) can never be killed by it — it is
 * released ALIVE instead of dying with no predator at it (the land twin of the
 * crocodile's point-319 release).
 */
export function huntHoldsCatch(
  huntActive: boolean,
  isVictim: boolean,
  predatorDist: number,
  reach: number = DEATH_ACTOR_REACH,
): boolean {
  return huntActive && (isVictim || predatorDist <= reach)
}

/**
 * The too-late distance for a kill's parent (points 121/326). On land the
 * predator feeds right at the calf, so a parent that got close is dragged down
 * by it. A crocodile holds its catch in the water with its jaws full: it can
 * only take a parent its jaws actually reach (the contact distance), never one
 * standing back on the bank — that parent survives into the vigil instead.
 */
export function tooLateDistFor(croc: boolean, landTooLate: number, contact: number): number {
  return croc ? contact : landTooLate
}
