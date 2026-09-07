// The chief's way to his drummer and back (design.md §13.4,
// docs/communication-poc-spec.md).
//
// He does not speak at his own door any more. The use key at the hut sends him
// OUT and ACROSS: he walks to the drummer's side, faces the way the drummer
// faces, and from there the drums carry what he has to say. He stays a
// calibratable minute, then walks home — and a traveller who calls after him on
// that way home turns him round, with the message beaten again the moment he
// arrives.
//
// Pure logic and pure geometry: no scene, no store, no clock. The caller passes
// the wall-clock reading and the two ends of the path; this decides where he is
// and what follows. That is what lets every player-reachable state of the walk —
// including the two that only exist for a few seconds — be pinned in Vitest.

import { VILLAGE_SPOTS } from './lifeSpots'

/** Where the chief is in his round trip. `in-hut` is the state a visit starts in. */
export type ChiefPhase = 'in-hut' | 'walking-out' | 'at-drummer' | 'walking-back'

/** The whole of the chief's walk, as one value. */
export interface ChiefWalk {
  phase: ChiefPhase
  /** Where along the path he stood at `at`: 0 his own doorway, 1 the drummer's side. */
  progress: number
  /** Wall-clock SECONDS `progress` was written at — and, while he stands beside
   *  the drummer, the moment his stay is counted from. */
  at: number
  /** He was called back: the drums beat by themselves the moment he arrives. */
  drumOnArrival: boolean
}

/** What the walk needs to know about the world it happens in. */
export interface ChiefWalkTiming {
  /** Place units per second he covers on foot. */
  speed: number
  /** Seconds he stands beside the drummer before he turns for home. */
  staySeconds: number
  /** Length of his path, in place units. */
  pathLength: number
}

/** One advance of the walk: the state that follows, and whether it beats drums. */
export interface ChiefStep {
  walk: ChiefWalk
  /** The message goes out on this step, with no further press. */
  beatDrums: boolean
}

/** He is in his hut — the state every visit to a settlement begins in. */
export function chiefInHut(): ChiefWalk {
  return { phase: 'in-hut', progress: 0, at: 0, drumOnArrival: false }
}

/** Out in the open, on foot or standing: everything but the hut. */
export function chiefIsOutside(walk: ChiefWalk): boolean {
  return walk.phase !== 'in-hut'
}

/**
 * The use key at the hut. It works ONLY while he is inside it: pressed while he
 * is already out, it returns the walk unchanged, which is how "using the hut
 * while the chief is outside does nothing" is expressed rather than checked at
 * every call site.
 */
export function chiefStepsOut(walk: ChiefWalk, now: number): ChiefWalk {
  if (walk.phase !== 'in-hut') return walk
  return { phase: 'walking-out', progress: 0, at: now, drumOnArrival: false }
}

/**
 * The use key at the chief or at his drummer.
 *
 * Beside the drummer it sends the message — the first time and every repeat —
 * and the stay is counted afresh from that moment: a chief who walked off in
 * the middle of the message he was just asked for would read as broken, and the
 * minute is what he stays for, not what the arrival happens to have left.
 *
 * On his way home it CALLS HIM BACK: he turns round where he stands, and the
 * drums beat by themselves once he is back at the drummer's side.
 *
 * While he walks out he is already coming, and while he is in his hut this key
 * belongs to the drummer's own word — both leave the walk untouched here.
 */
export function chiefCalled(walk: ChiefWalk, now: number): ChiefStep {
  if (walk.phase === 'at-drummer') {
    return { walk: { ...walk, at: now, drumOnArrival: false }, beatDrums: true }
  }
  if (walk.phase === 'walking-back') {
    return {
      walk: { phase: 'walking-out', progress: walk.progress, at: now, drumOnArrival: true },
      beatDrums: false,
    }
  }
  return { walk, beatDrums: false }
}

/**
 * The walk, one frame on. `now` is the wall clock in seconds; the state carries
 * the reading its own progress was written at, so the step is exact whatever
 * the frame rate — and a single call spanning the whole walk lands him at the
 * drummer just as sixty small ones do.
 */
export function chiefTick(walk: ChiefWalk, now: number, timing: ChiefWalkTiming): ChiefStep {
  const span = Math.max(0, now - walk.at)
  const length = timing.pathLength > 0 ? timing.pathLength : 1
  const covered = (timing.speed * span) / length
  // A step that CROSSES a boundary is stamped with the moment it was crossed,
  // never with the end of the step: stamping `now` would throw the leftover
  // seconds away, and a chief who arrived early in one long step would then
  // stand his whole minute from the end of that step instead of from his
  // arrival. One transition per call, but no time lost between them.
  const secondsFor = (fraction: number) => (timing.speed > 0 ? (fraction * length) / timing.speed : 0)
  switch (walk.phase) {
    case 'walking-out': {
      const progress = walk.progress + covered
      if (progress < 1) return { walk: { ...walk, progress, at: now }, beatDrums: false }
      return {
        walk: {
          phase: 'at-drummer',
          progress: 1,
          at: walk.at + secondsFor(1 - walk.progress),
          drumOnArrival: false,
        },
        beatDrums: walk.drumOnArrival,
      }
    }
    case 'at-drummer': {
      if (span < timing.staySeconds) return { walk, beatDrums: false }
      return {
        walk: { phase: 'walking-back', progress: 1, at: walk.at + timing.staySeconds, drumOnArrival: false },
        beatDrums: false,
      }
    }
    case 'walking-back': {
      const progress = walk.progress - covered
      if (progress > 0) return { walk: { ...walk, progress, at: now }, beatDrums: false }
      return { walk: chiefInHut(), beatDrums: false }
    }
    default:
      return { walk, beatDrums: false }
  }
}

/**
 * Where he stands right now, between the two ends of his path.
 *
 * A STRAIGHT line, deliberately: the ground between the chief's hut and the
 * drummer is the settlement's own open middle, and it is measured clear in the
 * village the mechanic plays in (chiefMeeting.test.ts).
 * // OPEN: swept 07.09.2026 over all 22 villages — only `maasai-village` has a
 * // scattered 0.78 m collider on the line (0.24 m into his footprint, at about
 * // a fifth of the way over). He has no collider and does not resolve one, so
 * // there he brushes through it. Not routed around: routing him would need the
 * // nav grid and a path length that changes per frame, which the minute and
 * // the call-back are counted against.
 */
export function chiefWalkPosition(
  walk: ChiefWalk,
  door: readonly [number, number],
  beside: readonly [number, number],
): [number, number] {
  const t = walk.progress < 0 ? 0 : walk.progress > 1 ? 1 : walk.progress
  return [door[0] + (beside[0] - door[0]) * t, door[1] + (beside[1] - door[1]) * t]
}

/**
 * Which way he looks. Standing beside the drummer he faces exactly where the
 * drummer faces, so a traveller in front of the pair sees both men from the
 * front; on foot he looks the way he is going, and back at his own door he
 * faces the open ground again rather than his own wall.
 */
export function chiefWalkFacing(
  walk: ChiefWalk,
  door: readonly [number, number],
  beside: readonly [number, number],
  standingFacing: number,
): number {
  if (walk.phase === 'at-drummer' || walk.phase === 'in-hut') return standingFacing
  const sign = walk.phase === 'walking-back' ? -1 : 1
  const dx = (beside[0] - door[0]) * sign
  const dz = (beside[1] - door[1]) * sign
  if (dx === 0 && dz === 0) return standingFacing
  return Math.atan2(dx, dz)
}

/**
 * The point the drummer's figure is turned toward (PlaceLife draws him with
 * exactly this yaw). Stated ONCE here so the man who beats the message and the
 * man who sends it cannot end up facing two different ways.
 */
export const DRUMMER_LOOKS_AT: readonly [number, number] = [3.5, 2.5]

/** The yaw the drummer is drawn at, in the scene's own convention. */
export function drummerFacing(
  spot: readonly [number, number] = VILLAGE_SPOTS.drummer,
): number {
  return Math.atan2(DRUMMER_LOOKS_AT[0] - spot[0], DRUMMER_LOOKS_AT[1] - spot[1])
}

/**
 * Where the chief takes his stand: beside the drummer, on the drummer's own
 * LEFT (local +X, the small drum's side), abreast of him rather than behind or
 * in front. Abreast is the whole point — it is what lets the player stand in
 * front of the pair and see chief and drummer from the front at once — and the
 * offset clears both drum shells, which reach no further than 0.5 m out.
 */
export function chiefBesideDrummerSpot(
  offset: number,
  spot: readonly [number, number] = VILLAGE_SPOTS.drummer,
): [number, number] {
  const yaw = drummerFacing(spot)
  return [spot[0] + Math.cos(yaw) * offset, spot[1] - Math.sin(yaw) * offset]
}
