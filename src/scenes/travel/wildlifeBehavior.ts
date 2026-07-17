// Pure helpers for the travel-view wildlife simulation (design.md §19). Kept out
// of Wildlife.tsx so the direction/geometry maths can be unit-tested without a
// browser (the RAF-driven behaviour itself is covered by the Playwright suites).

import type { RegionId } from '../../world/geo'

/** Heading convention across the wildlife sim: a heading `h` points in the
 *  direction `(sin h, cos h)` in world (x, z), so `Math.atan2(dx, dz)` yields the
 *  heading toward an offset `(dx, dz)`. */

/**
 * Escape heading away from every threat within `radius`, distance-weighted and
 * summed (closer threats pull harder). Returns `null` when no threat is in
 * range.
 *
 * Summing over all nearby threats — rather than fleeing only the single nearest —
 * is what stops the facing from flip-flopping between two flanking herd members:
 * the nearest-threat pick is a discrete choice that swaps ~90° from frame to
 * frame when two elephants straddle the prey, whereas the summed field varies
 * continuously as the animal moves, so the heading stays stable (design.md §19).
 */
export function fleeHeading(
  x: number,
  z: number,
  threats: ReadonlyArray<readonly [number, number]>,
  radius: number,
): number | null {
  let rx = 0
  let rz = 0
  let inRange = false
  let nearHeading = 0
  let nearD = Infinity
  for (const [tx, tz] of threats) {
    const dx = x - tx
    const dz = z - tz
    const d = Math.hypot(dx, dz)
    if (d >= radius || d < 1e-4) continue
    inRange = true
    const w = (radius - d) / radius // stronger the closer the threat
    rx += (dx / d) * w
    rz += (dz / d) * w
    if (d < nearD) {
      nearD = d
      nearHeading = Math.atan2(dx, dz)
    }
  }
  if (!inRange) return null
  const m = Math.hypot(rx, rz)
  // Degenerate case (threats cancel out, e.g. one on each side exactly): fall
  // back to fleeing the single nearest so the animal still bolts rather than
  // freezing between them.
  if (m < 1e-3) return nearHeading
  return Math.atan2(rx, rz)
}

/**
 * Blocking station for a parent whose calf is being run down by a predator
 * (design.md §19): the parent keeps itself between the hunter and its young,
 * at a point `offset` from the calf toward the predator — a living shield on
 * the escape line, so a closing hunter reaches the parent first and takes it
 * in the calf's place. Returns the heading toward that station, or `null`
 * when already on it (the caller holds and faces the hunter down). Also
 * `null` in the degenerate case of the predator standing on the calf — the
 * catch resolution owns that contact.
 */
export function blockHeading(
  x: number,
  z: number,
  calfX: number,
  calfZ: number,
  predX: number,
  predZ: number,
  offset: number,
): number | null {
  const adx = predX - calfX
  const adz = predZ - calfZ
  const ad = Math.hypot(adx, adz)
  if (ad < 1e-4) return null
  const dx = calfX + (adx / ad) * offset - x
  const dz = calfZ + (adz / ad) * offset - z
  if (Math.hypot(dx, dz) < 0.3) return null
  return Math.atan2(dx, dz)
}

/**
 * Target for a parent whose calf was trampled (design.md §19): it throws itself
 * before the feet of the nearest LIVING elephant and lets itself be trampled
 * too. Returns that elephant's position, or `null` when none is left — the
 * caller then ends the grief instead of charging a target that can no longer
 * trample it (a drive with no resolution is a stuck animal).
 *
 * The nearest LIVE position is picked each frame rather than the calf's death spot:
 * the elephant walks on, and the parent means to reach its feet, not the patch
 * of ground where its calf fell.
 */
export function griefTarget(
  x: number,
  z: number,
  elephants: ReadonlyArray<{ x: number; z: number; dead?: boolean }>,
): { x: number; z: number } | null {
  let best: { x: number; z: number } | null = null
  let bestD = Infinity
  for (const e of elephants) {
    if (e.dead) continue
    const d = Math.hypot(e.x - x, e.z - z)
    if (d < bestD) {
      bestD = d
      best = { x: e.x, z: e.z }
    }
  }
  return best
}

/**
 * Playful gambolling of a herd calf (design.md §19): on a per-calf cycle the
 * calf breaks into a short bout of scampering hops around its parent. Returns
 * the bout's current heading and hop height (0..1), or `null` outside a bout.
 * Deterministic in (t, phase), so a calf's bouts are steady and phase-shifted
 * against its herd-mates'.
 */
export function gambolState(
  t: number,
  phase: number,
  period = 16,
  activeShare = 0.25,
): { heading: number; hop: number } | null {
  const cycle = (((t + phase * 40) % period) + period) % period / period
  if (cycle >= activeShare) return null
  // A curving scamper: the base direction is per-calf, bent side to side over
  // the bout, with quick bouncy hops on top.
  const heading = phase * Math.PI * 2 + Math.sin((t + phase * 40) * 0.9) * 1.2
  const hop = Math.abs(Math.sin(t * 7 + phase * 3))
  return { heading, hop }
}

/**
 * Body-separation push (design.md §19): given neighbours as `[x, z, minDist]`,
 * returns the `[dx, dz]` that moves the subject half-way out of every overlap
 * (each of an overlapping pair resolves its own half, so the pair parts
 * symmetrically). Coincident points get a small fixed +x nudge so two animals
 * on the same spot still part instead of dividing by zero.
 */
export function separationPush(
  x: number,
  z: number,
  neighbors: ReadonlyArray<readonly [number, number, number]>,
): [number, number] {
  let px = 0
  let pz = 0
  for (const [nx, nz, minD] of neighbors) {
    const dx = x - nx
    const dz = z - nz
    const d = Math.hypot(dx, dz)
    if (d >= minD) continue
    if (d < 1e-5) {
      px += minD * 0.5
      continue
    }
    const need = (minD - d) * 0.5
    px += (dx / d) * need
    pz += (dz / d) * need
  }
  return [px, pz]
}

/** Vulture flight (design.md §19): where a flight spawns beyond the view ring
 *  and how far out it must be before it may despawn ("well outside" the view). */
export const FLIGHT_SPAWN_OUT = 20
export const FLIGHT_DESPAWN_OUT = 40

export interface FlightState {
  /** idle = despawned (hidden); in = flying in; active = arrived (circling or
   *  landed — the caller poses it); out = flying off to despawn. */
  mode: 'idle' | 'in' | 'active' | 'out'
  x: number
  z: number
}

/**
 * Advance a vulture flight one step (design.md §19): vultures never pop in or
 * out of the picture — they spawn beyond the view ring (zoom-aware `viewR`),
 * fly in to their target, and when done fly off and only despawn well outside
 * the view again.
 * - idle + want → spawn at the ring on the target's far side, turn inbound
 * - in → fly toward the target; on reach → active (want dropped → out)
 * - active + want → hold (the caller circles/lands it); want dropped → out
 * - out → fly straight away from the player; past the ring + margin → idle;
 *   a new want while still out turns it back inbound (retarget, no respawn)
 * Mutates and returns `s`.
 */
export function flightStep(
  s: FlightState,
  want: boolean,
  tx: number,
  tz: number,
  px: number,
  pz: number,
  viewR: number,
  speed: number,
  dt: number,
  reach = 0.6,
): FlightState {
  if (s.mode === 'idle') {
    if (!want) return s
    let dx = tx - px
    let dz = tz - pz
    const d = Math.hypot(dx, dz)
    if (d < 1e-3) {
      dx = 1
      dz = 0
    } else {
      dx /= d
      dz /= d
    }
    s.x = px + dx * (viewR + FLIGHT_SPAWN_OUT)
    s.z = pz + dz * (viewR + FLIGHT_SPAWN_OUT)
    s.mode = 'in'
    return s
  }
  if (!want && s.mode !== 'out') s.mode = 'out'
  if (want && s.mode === 'out') s.mode = 'in' // retarget while still airborne
  if (s.mode === 'in') {
    const dx = tx - s.x
    const dz = tz - s.z
    const d = Math.hypot(dx, dz)
    if (d <= Math.max(reach, speed * dt)) {
      s.x = tx
      s.z = tz
      s.mode = 'active'
    } else {
      s.x += (dx / d) * speed * dt
      s.z += (dz / d) * speed * dt
    }
  } else if (s.mode === 'out') {
    let dx = s.x - px
    let dz = s.z - pz
    const d = Math.hypot(dx, dz)
    if (d < 1e-3) {
      dx = 1
      dz = 0
    } else {
      dx /= d
      dz /= d
    }
    s.x += dx * speed * dt
    s.z += dz * speed * dt
    if (d > viewR + FLIGHT_DESPAWN_OUT) s.mode = 'idle'
  }
  return s
}

/**
 * Ground normal at a point from central height differences (design.md §19):
 * decals like the blood stain are tilted into the local slope with it — a
 * horizontal disc on a hillside gets wedges swallowed by the ground and reads
 * as a Pac-Man. `heightAt` samples the terrain height at world (x, z).
 * Returns a unit vector `[nx, ny, nz]` with ny > 0.
 */
export function groundNormal(
  x: number,
  z: number,
  heightAt: (x: number, z: number) => number,
  e = 0.9, // sample across the decal's footprint, so the plane averages curvature
): [number, number, number] {
  const nx = heightAt(x - e, z) - heightAt(x + e, z)
  const nz = heightAt(x, z - e) - heightAt(x, z + e)
  const ny = 2 * e
  const inv = 1 / Math.hypot(nx, ny, nz)
  return [nx * inv, ny * inv, nz * inv]
}

/** Turn `current` toward `target` (both radians) by at most `maxStep`, taking the
 *  shorter way around. Used to cap per-frame turns so a facing never snaps. */
export function turnToward(current: number, target: number, maxStep: number): number {
  let dh = target - current
  while (dh > Math.PI) dh -= Math.PI * 2
  while (dh < -Math.PI) dh += Math.PI * 2
  return current + Math.max(-maxStep, Math.min(maxStep, dh))
}

/**
 * Leashed gambol direction (design.md §19.8): damp the OUTWARD component of
 * the bout heading toward zero at the play range's edge — the tangential
 * component always survives, so a scamper ORBITS its parent instead of
 * crossing the range boundary. Crossing it used to switch play off and the
 * (faster) follow yank on — a per-frame sawtooth that visibly trembled the
 * calf. Damping (rather than blending an opposing home pull) has no
 * cancellation point, so the direction can never alternate between frames.
 * Returns the step direction, length 0..1 (a radially-pinned calf briefly
 * stands rather than jittering).
 */
export function leashedGambolDir(
  heading: number,
  toParentX: number,
  toParentZ: number,
  dist: number,
  range: number,
): [number, number] {
  let dx = Math.sin(heading)
  let dz = Math.cos(heading)
  if (dist > 1e-6 && range > 0) {
    const ox = -toParentX / dist // outward unit (away from the parent)
    const oz = -toParentZ / dist
    const rad = dx * ox + dz * oz // outward component of the bout direction
    if (rad > 0) {
      // Free play near the parent; outward motion dies smoothly at the edge.
      const keep = 1 - Math.min(1, (dist / range) ** 3)
      dx -= ox * rad * (1 - keep)
      dz -= oz * rad * (1 - keep)
    }
  }
  const l = Math.hypot(dx, dz)
  if (l < 1e-4) return [0, 0]
  return l > 1 ? [dx / l, dz / l] : [dx, dz]
}


/** The circling kill flock may land once the predator no longer guards the
 *  site: never during the feed, and during the walk-off only after it has
 *  moved this far from the remnant — not only once it despawned beyond the
 *  view ring, which made the flock wait far too long (user report). */
export const VULTURE_DESCEND_CLEAR_DIST = 12

export function killFlockMayDescend(
  predatorMode: string,
  predatorX: number,
  predatorZ: number,
  remnantX: number,
  remnantZ: number,
): boolean {
  if (predatorMode === 'feed') return false
  if (predatorMode === 'leave')
    return Math.hypot(predatorX - remnantX, predatorZ - remnantZ) > VULTURE_DESCEND_CLEAR_DIST
  return true
}

/**
 * The vigil at a calf's carcass (design.md §19.8, point 121): while a LIVE
 * vigil-keeper stands within this radius of a carcass, no vulture may LAND on
 * it — the kill flock keeps circling and the ground scavenger does not commit
 * to that carcass. Callers pass only LIVE keepers' distances (a dead keeper
 * guards nothing); with no live keeper they pass Infinity, which never blocks.
 */
export function vigilBlocksLanding(keeperDistToCarcass: number, radius = 4): boolean {
  return keeperDistToCarcass < radius
}

/**
 * The vigil summons its ending (design.md §19.8, point 121 (f)): the calf's
 * carcass draws a predator to the standing keeper once the vigil has stood
 * for the calibratable delay — before that the keeper mourns undisturbed,
 * after it the next idle hunt window claims it as the scripted target.
 */
export function vigilDrawReady(vigilSeconds: number, predatorDelay: number): boolean {
  return vigilSeconds >= predatorDelay
}

/**
 * Where the drawn predator of the vigil enters the stage (point 121 (f)).
 * The vulture standard applies: it spawns BEYOND the zoom-aware view ring and
 * WALKS in, never popping into sight — and it must also land INSIDE the
 * hunt's offstage abort ring around the player, or the chase would abort on
 * its very first frame. Both rings are player-centred while the spawn circle
 * (radius viewR + margin) is keeper-centred and the keeper may stand well off
 * the player, so the bearing is probed: from a random start angle, the first
 * probe whose player distance clears the view ring and stays inside the
 * offstage ring wins. The keeper-centred circle always cuts that annulus for
 * every keeper the draw can pick (seek range < both ring radii), so a valid
 * probe exists; the probe closest to the annulus middle backstops the
 * discrete sweep.
 */
export function vigilDrawSpawn(
  keeperX: number,
  keeperZ: number,
  playerX: number,
  playerZ: number,
  viewR: number,
  offstageR: number,
  rand01: number,
  margin = 8,
): { x: number; z: number } {
  const r = viewR + margin
  const lo = viewR + 2 // clear of the view ring — the arrival is walked, not popped
  const hi = offstageR - 2 // clear of the abort ring — the chase must survive frame one
  const mid = (lo + hi) / 2
  let best = { x: keeperX + r, z: keeperZ }
  let bestScore = Infinity
  const PROBES = 24
  for (let k = 0; k < PROBES; k++) {
    const ang = rand01 * Math.PI * 2 + (k * Math.PI * 2) / PROBES
    const x = keeperX + Math.cos(ang) * r
    const z = keeperZ + Math.sin(ang) * r
    const d = Math.hypot(x - playerX, z - playerZ)
    if (d > lo && d < hi) return { x, z }
    const score = Math.abs(d - mid)
    if (score < bestScore) {
      bestScore = score
      best = { x, z }
    }
  }
  return best
}

/**
 * One step of a scripted walk under the land constraint (design.md §19.5,
 * point 83): the predator's walk-off must never enter the open ocean — like
 * every streamed animal, it deflects along the coast instead. Tries the
 * intended heading first, then swings alternately outward up to ±90°; if
 * every probe is blocked (a dead-end spit), it stands rather than swims.
 */
export function deflectedStep(
  x: number,
  z: number,
  heading: number,
  dist: number,
  blocked: (x: number, z: number) => boolean,
  lookahead = dist,
): { x: number; z: number; heading: number; moved: boolean } {
  // The PROBE reaches `lookahead` ahead while the STEP stays `dist`: a
  // single land cell poking into the water reads as blocked from outside,
  // so the walker never enters a one-cell dead end it must bounce out of.
  const probe = Math.max(dist, lookahead)
  for (let step = 0; step <= 6; step++) {
    for (const sgn of step === 0 ? [1] : [1, -1]) {
      const h = heading + sgn * step * (Math.PI / 12) // 15° steps
      const sx = x + Math.sin(h) * dist
      const sz = z + Math.cos(h) * dist
      // Both the STEP TARGET and the far probe must be dry: the lookahead
      // alone let a walker step into a narrow channel with land beyond it.
      if (blocked(sx, sz) || blocked(x + Math.sin(h) * probe, z + Math.cos(h) * probe)) continue
      return { x: sx, z: sz, heading: h, moved: true }
    }
  }
  return { x, z, heading, moved: false }
}

/**
 * Seasonal multiplier on the river current for the §19.8 water drama
 * (point 122): the rains swell the rivers, the dry season tames them. Linear
 * between the two calibratable factors over the local wetness (0..1).
 */
export function seasonFlowFactor(wetness: number, dryFactor: number, wetFactor: number): number {
  const w = Math.min(1, Math.max(0, wetness))
  return dryFactor + (wetFactor - dryFactor) * w
}

export type StruggleFate = 'struggling' | 'self-rescue' | 'drowned'

/**
 * The drown/self-rescue decision for an animal carried by the current
 * (design.md §19.8, point 122). Calm water is what the self-rescue was
 * always about: below the flow threshold an unaided animal clambers out
 * exhausted after `selfRescueSeconds` and NEVER drowns. At or above the
 * threshold the current is too strong to leave — the self-rescue must not
 * fire (otherwise nothing ever drowns), and after `drownSeconds` the river
 * takes the animal.
 */
export function waterStruggleFate(
  effectiveFlow: number,
  secondsInWater: number,
  selfRescueSeconds: number,
  drownSeconds: number,
  drownFlowThreshold: number,
): StruggleFate {
  if (effectiveFlow >= drownFlowThreshold) {
    return secondsInWater >= drownSeconds ? 'drowned' : 'struggling'
  }
  return secondsInWater > selfRescueSeconds ? 'self-rescue' : 'struggling'
}

/**
 * One downstream drift step that FOLLOWS the channel (point 122): the raw
 * tangent of the nearest river segment cuts every bend, and the swollen
 * wet-season drift slid the struggling animal ashore within seconds — where
 * the current dies and the drama fizzled. A step that would beach the animal
 * falls back to its lon-only then lat-only component, and if every candidate
 * is dry it stays put (still in the water at its old spot).
 */
export function channelDriftStep(
  x: number,
  z: number,
  stepX: number,
  stepZ: number,
  isWater: (x: number, z: number) => boolean,
): { x: number; z: number } {
  for (const [nx, nz] of [
    [x + stepX, z + stepZ],
    [x + stepX, z],
    [x, z + stepZ],
  ] as const) {
    if (isWater(nx, nz)) return { x: nx, z: nz }
  }
  return { x, z }
}

/**
 * The dry-season mire roll (design.md §19.8, point 123): a gambol bout that
 * ENDS at a lake bank whose season has dried to mud may stick the calf.
 * Deterministic over its inputs — the caller passes its own hash roll.
 */
export function mireRoll(
  bankDistDeg: number,
  bankReachDeg: number,
  wetness: number,
  drynessThreshold: number,
  chance: number,
  roll: number,
): boolean {
  if (bankDistDeg > bankReachDeg) return false // not at the water's edge
  if (wetness >= drynessThreshold) return false // the bank is firm outside the dry season
  return roll < chance
}

/**
 * The mire always resolves (the point-118 lesson): either a predator ends it
 * at the waterhole, or after `mireSeconds` the mud releases the calf.
 */
export function mireFate(secondsMired: number, mireSeconds: number): 'mired' | 'released' {
  return secondsMired >= mireSeconds ? 'released' : 'mired'
}

/**
 * The vicinity-seeding bounds (point 102 hardened by point 135a): the seeder
 * counts and places against a radius SHRUNK by `margin`, so the guarantee
 * "at least N region-typical animals within `radius`" keeps holding when
 * (1) the observer stands a few units off the settlement anchor (the player
 * measures from the leave point, the seeder from the anchor) and (2) the
 * seeded animals wander for a while before anyone counts. Animals loitering
 * at the outer edge no longer satisfy the count, and fresh seeds land well
 * inside — the per-frame top-up then keeps the pool full against drift.
 */
export function vicinitySeedBounds(
  radius: number,
  clearance: number,
  spread: number,
  margin: number,
): { countRadius: number; distMin: number; distMax: number } {
  const countRadius = Math.max(clearance + spread, radius - margin)
  return {
    countRadius,
    distMin: clearance + spread,
    // Placement + group spread must stay inside the SHRUNK radius.
    distMax: Math.max(clearance + spread, countRadius - 2 * spread),
  }
}

/**
 * The drinker catchment (design.md §19.13, point 120e, hardened by 135c):
 * how far from the water's AXIS a spawn may lie and still be given a shore
 * walk. Derived from the calibratable river half-width — the fixed 0.35 was
 * a hidden 0.17+0.18 of the scale-true width, and the point-136 widening
 * swallowed the whole drinking belt (the band between waterline and
 * catchment shrank toward zero, starving the dry-season gathering).
 */
export function drinkCatchment(riverWidthDeg: number, dryness: number): number {
  const d = Math.min(1, Math.max(0, dryness))
  // In the rains the belt nearly closes — water stands everywhere, so few
  // walk to the river (0.06 past the waterline); the dry season opens it
  // wide (0.43). The strict dry>wet ordering of point 120e follows from the
  // geometry instead of hanging on spawn-hash luck at one test site.
  return riverWidthDeg + 0.06 + 0.37 * d
}

// --- The food web (design.md §19.3) ------------------------------------------
// The predator/prey/region tables live in this pure module so the fit rules
// are unit-testable without a browser; Wildlife.tsx consumes them for the
// live hunts.

/** Decorative predators of ~1890 Africa (design.md §19). The lion is the apex
 *  (and the only one that attacks on contact, §14); the others are scenery. */
export type PredatorKind = 'lion' | 'cheetah' | 'leopard' | 'hyena'
/** Prey a predator hunts (design.md §19): grazers fitting its prey scheme. */
export type PreyKind = 'zebra' | 'wildebeest' | 'antelope' | 'warthog' | 'giraffe'

/** Food web (design.md §19): each predator's prey scheme. The grazers in turn
 *  feed on the grassland (they graze on open land), so predator → grazer →
 *  plants forms the chain. Lions and hyenas take the big grazers; the cheetah
 *  and leopard take smaller, faster game. The giraffe is LION-ONLY prey
 *  (point 124): cheetah, leopard and hyena do not take giraffe. */
export const PREDATOR_PREY: Record<PredatorKind, PreyKind[]> = {
  lion: ['wildebeest', 'zebra', 'antelope', 'warthog', 'giraffe'],
  hyena: ['wildebeest', 'zebra', 'warthog'],
  cheetah: ['antelope', 'warthog'],
  leopard: ['antelope', 'warthog'],
}
/** Region-appropriate grazers for ~1890 Africa (design.md §19). The eastern and
 *  southern plains hold the great herds; the wooded west/centre and the arid
 *  north offer a narrower range. A hunt's prey is the predator's scheme
 *  intersected with what the region holds. Giraffes live on the eastern and
 *  southern plains — matching their ambient savanna herds — so only there may
 *  a hunt take one (point 124). */
export const REGION_PREY: Record<RegionId, PreyKind[]> = {
  east: ['wildebeest', 'zebra', 'antelope', 'warthog', 'giraffe'],
  south: ['wildebeest', 'zebra', 'antelope', 'warthog', 'giraffe'],
  central: ['antelope', 'warthog', 'zebra'],
  west: ['antelope', 'warthog', 'zebra'],
  north: ['antelope', 'warthog'],
}

/**
 * The parent's defence (design.md §19.8, point 124): does a parent that
 * reaches the predator over its calf drive the hunt off (true — the calf is
 * freed, the parent lives, the predator leaves) or is it taken in the calf's
 * place (false — the sacrifice)? The chance is looked up per species — the
 * shape point 125 needs to raise the other species later; a species without
 * an entry uses `fallback` (default 0: never defends, so the sacrifice stays
 * the norm). Deterministic — the caller passes its own hashed roll, never
 * Math.random. The roll applies ONLY to the live chase/charge resolutions:
 * the mire and vigil deaths are deliberate surrenders and never roll.
 */
export function parentDefends(
  species: string,
  roll: number,
  chances: Record<string, number>,
  fallback = 0,
): boolean {
  return roll < (chances[species] ?? fallback)
}
