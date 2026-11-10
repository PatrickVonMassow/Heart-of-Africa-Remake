// Off-screen behaviour throttle for the ambient wildlife (point 310, the CPU
// lever for the phone): an animal OUTSIDE the rendered frame that is in no
// drama steps its behaviour only every `interval` frames and holds its last
// drawn pose in between. "Outside the frame" is the shared `isOnScreen`
// projection (frameVisibility.ts, the point-172 rule: the camera frustum,
// never an assumed radius). Every animal bound into a drama — §19.3-§19.19:
// a hunt, a fight, a crossing, a rescue, a mire, a grief or mourning, a
// crocodile's ambush, a dying elder, a bird's flight — is NEVER throttled, so
// its sim-time deadlines advance every frame exactly as before and no drama
// stalls.

/** The drama and transient-state fields of an animal: any of them set means the
 *  animal is spoken for and steps every frame. Structural, so the predicate is
 *  testable without the scene's full Animal type. */
export interface ThrottleCandidate {
  phase: number
  dead?: boolean
  dying?: unknown
  drink?: unknown
  young?: boolean
  child?: unknown
  separated?: number
  bathe?: boolean
  dodgeHeading?: number
  air?: unknown
  crouch?: boolean
  fleeCorridor?: number
  playLock?: boolean
  boutDetour?: number
  caught?: number
  inWater?: number
  mired?: number
  rescueEntry?: unknown
  rescued?: boolean
  plungeTo?: unknown
  trampleTo?: unknown
  grief?: number
  escape?: number
  vigil?: unknown
  bereaved?: number
  mourn?: number
  crossing?: unknown
  fleeAt?: number
  chaseSwim?: unknown
  waterHold?: boolean
  lunge?: unknown
  fireTrapped?: number
  lure?: unknown
  caughtBy?: unknown
  hop?: number
  kick?: number
  fight?: unknown
  dissolve?: number
  gone?: boolean
  remnant?: boolean
}

const DRAMA_FIELDS: ReadonlyArray<keyof ThrottleCandidate> = [
  'dead', 'dying', 'drink', 'young', 'child', 'separated', 'bathe', 'dodgeHeading', 'air', 'crouch',
  'fleeCorridor', 'playLock', 'boutDetour', 'caught', 'inWater', 'mired', 'rescueEntry', 'rescued',
  'plungeTo', 'trampleTo', 'grief', 'escape', 'vigil', 'bereaved', 'mourn', 'crossing', 'fleeAt',
  'chaseSwim', 'waterHold', 'lunge', 'fireTrapped', 'lure', 'caughtBy', 'hop', 'kick', 'fight',
  'dissolve', 'gone', 'remnant',
]

/** Species never throttled: the elephants walk as a herd from one shared step
 *  (and trample others), the crocodile is an ambush drama by nature, and the
 *  birds are the aerial hunts' prey with their own flight state. */
const NEVER_THROTTLED: ReadonlySet<string> = new Set(['elephant', 'crocodile', 'flamingo', 'plover'])

/** Is this animal plain ambient life (no drama, no transient state) that the
 *  throttle may slow down? `isLionVictim` is the scripted hunt's target. */
export function isAmbientForThrottle(species: string, a: ThrottleCandidate, isLionVictim: boolean): boolean {
  if (isLionVictim || NEVER_THROTTLED.has(species)) return false
  for (const k of DRAMA_FIELDS) {
    const v = a[k]
    if (v !== undefined && v !== false) return false
  }
  return true
}

/** Does this animal step its behaviour in frame `frame`? On-screen or in a drama:
 *  always. Off-screen ambient: once every `interval` frames, staggered by the
 *  animal's own phase so the herd's work spreads over the frames. `interval` 1
 *  (medium/high) steps everyone every frame. */
export function behaviourStepDue(
  onScreen: boolean,
  ambient: boolean,
  interval: number,
  frame: number,
  phase: number,
): boolean {
  if (onScreen || !ambient || interval <= 1) return true
  const slot = Math.floor(Math.abs(phase) * 997) % interval
  return (frame + slot) % interval === 0
}
