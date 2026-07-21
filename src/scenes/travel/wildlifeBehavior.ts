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
 * Water-crossing target (point 192 — the user's water-rule revision: animals
 * may purposefully CROSS a river/lake and may FLEE INTO water, they just never
 * spawn or idle in it; the ocean stays absolute). Probes 1-unit steps along
 * `heading`: every wet step must be RIVER/LAKE water ('water', never 'ocean'),
 * and the first LAND cell within `maxUnits` becomes the crossing target. Ocean
 * anywhere on the line, or no land within reach, returns null — no crossing.
 */
export function crossingTarget(
  x: number,
  z: number,
  heading: number,
  maxUnits: number,
  terrainTypeAt: (x: number, z: number) => string,
  step = 1,
): { tx: number; tz: number } | null {
  const sx = Math.sin(heading) * step
  const sz = Math.cos(heading) * step
  for (let i = 1; i * step <= maxUnits; i++) {
    const px = x + sx * i
    const pz = z + sz * i
    const t = terrainTypeAt(px, pz)
    if (t === 'ocean') return null
    if (t !== 'water') return { tx: px, tz: pz } // the far bank
  }
  return null
}

/**
 * Guard engagement with release-on-recede (point 191). The passive gate
 * ("chasing lion within GUARD_RADIUS of my calf") kept a parent stationed on
 * the lion side of its calf while the hunter merely PASSED — and because the
 * calf follows its parent, the pair leapfrogged after the hunt to the kill
 * (the user's "foreign family chases the predator"). The guard now tracks the
 * closest approach seen (minSeen) and RELEASES once the lion has receded
 * `releaseSlack` past it — a passing hunter is guarded against only while it
 * closes in. Returns the updated minSeen (null = out of radius, reset).
 */
export function guardEngagement(
  d: number,
  minSeen: number | null,
  radius: number,
  releaseSlack = 0.8,
): { engaged: boolean; minSeen: number | null } {
  if (d >= radius) return { engaged: false, minSeen: null }
  const min = minSeen === null ? d : Math.min(minSeen, d)
  return { engaged: d <= min + releaseSlack, minSeen: min }
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
/** Distance from point (px,pz) to the segment (ax,az)-(bx,bz). The SWEPT
 *  predator catch (point 179): a big clamped-dt step or a tangential pass must
 *  not carry a hunter THROUGH its target without registering the catch — the
 *  point distance at the frame's pre-move position misses it, the segment does
 *  not (the user report: the lion ran through parent AND calf, eating nobody). */
export function segPointDist(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): number {
  const dx = bx - ax
  const dz = bz - az
  const len2 = dx * dx + dz * dz
  let tt = len2 === 0 ? 0 : ((px - ax) * dx + (pz - az) * dz) / len2
  tt = tt < 0 ? 0 : tt > 1 ? 1 : tt
  return Math.hypot(px - (ax + tt * dx), pz - (az + tt * dz))
}

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
  isOffscreen?: (x: number, z: number) => boolean,
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
    // Spawn beyond the view and fly IN — never pop into frame (point 178). The
    // assumed ring (viewR) underestimates the tilted bird's-eye frustum's ground
    // reach (the point-165/172/183 lesson), so with a frustum predicate push the
    // spawn outward in ring steps until the point is genuinely OFF the rendered
    // frame. Without one (no travel camera mounted) the ring alone is used.
    let out = viewR + FLIGHT_SPAWN_OUT
    s.x = px + dx * out
    s.z = pz + dz * out
    if (isOffscreen) {
      for (let k = 0; k < 12 && !isOffscreen(s.x, s.z); k++) {
        out += FLIGHT_SPAWN_OUT
        s.x = px + dx * out
        s.z = pz + dz * out
      }
    }
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
    // Despawn only once the bird has genuinely left the frame (point 195): the
    // raw viewR+margin underestimates the tilted frustum at a wide zoom, so with
    // a projection predicate it must be BOTH off-screen and past the view ring
    // (the ring floor avoids an edge flicker); without one, the radius stands in.
    const gone = isOffscreen ? isOffscreen(s.x, s.z) && d > viewR : d > viewR + FLIGHT_DESPAWN_OUT
    if (gone) s.mode = 'idle'
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


/**
 * Whether the kill flock is present at all (design.md §19.6, point 162): it
 * circles while the predator FEEDS, and it stays on afterwards only if a real
 * kill left a scrap to finish (a remnant). It must NOT persist through the
 * predator's walk-off on its own: a DRIVE-OFF (the parent saves its calf, no
 * kill) sends the hunt to 'leave' with no remnant, and keying the flock on
 * 'leave' flew it in over a kill that never happened (user report). So the
 * walk-off keeps the flock only when `hasRemnant`.
 */
export function killFlockActive(predatorMode: string, hasRemnant: boolean): boolean {
  return predatorMode === 'feed' || hasRemnant
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
 * The elephants' mourning vigil (design.md §19.8, point 126): a herd whose
 * centre comes within `radius` of a mourn target — the graveyard's bones or a
 * dead herd-mate — walks in and holds there. `mourned` is the herd's per-visit
 * latch: once its vigil has run, the herd is not drawn again until it has LEFT
 * the radius (the caller clears the latch out of range), so a herd lingering
 * at the site never loops the vigil forever (point-118 lesson: every drama
 * resolves). A vigil, not a sacrifice — nothing dies of it.
 */
export function shouldMourn(distToTarget: number, radius: number, mourned: boolean): boolean {
  return !mourned && distToTarget < radius
}

/** The broken-wing lure (design.md §19.8, point 145b): a ground-nesting
 *  plover, threatened at its nest, does not flee — it LIES. It drags itself
 *  conspicuously away in front of the threat, wing trailed as if broken,
 *  luring it from the nest; past a safe distance (or when the act has run
 *  its time) it "recovers" and flies back. The one sacrifice that is a lie
 *  rather than a leap — and it can genuinely fail: a predator close at the
 *  moment of recovery sometimes takes the actor. */
export const PLOVER_LURE_TRIGGER = 10
export const PLOVER_LURE_SAFE = 18
export const PLOVER_LURE_SECONDS = 12
export const PLOVER_TAKEN_CHANCE = 0.15

/** Whether a threat this close to the nest starts the act. */
export function ploverShouldLure(threatDistToNest: number, trigger: number = PLOVER_LURE_TRIGGER): boolean {
  return threatDistToNest < trigger
}

/** The drag heading: away from the nest, on the side of the threat-nest axis
 *  the bird chose (deterministic per bird) — conspicuously ACROSS the
 *  threat's view, never straight away from it. */
export function ploverLureHeading(nestX: number, nestZ: number, threatX: number, threatZ: number, side: 1 | -1): number {
  const ax = nestX - threatX
  const az = nestZ - threatZ
  const base = Math.atan2(ax, az) // from the threat over the nest
  return base + (side * Math.PI) / 3 // and off to the chosen side
}

/** Whether the act ends this frame: the threat has been drawn far enough
 *  from the nest, or the act has run its time. The drama always resolves
 *  (the point-118 lesson) — 'return' flies the bird home. */
export function ploverLureResolve(
  elapsed: number,
  threatDistToNest: number,
  maxSeconds: number = PLOVER_LURE_SECONDS,
  safeDist: number = PLOVER_LURE_SAFE,
): 'keep' | 'return' {
  return elapsed >= maxSeconds || threatDistToNest >= safeDist ? 'return' : 'keep'
}

/** Sometimes the lie fails: only a PREDATOR near the actor at the recovery
 *  moment can take it — the traveller never harms a bird. */
export function ploverTaken(roll: number, predatorNear: boolean, chance: number = PLOVER_TAKEN_CHANCE): boolean {
  return predatorNear && roll < chance
}

/** Zones whose cured dry-season grass carries the burning of the steppe
 *  (design.md §19.8/§19.13, point 145a): Dybowski watched the inhabitants
 *  fire it at the congo-north latitude, Park saw the same lines of fire from
 *  the Gambia (Sahel). The Congo proper never cures (rain every month) and a
 *  rainless zone grows no grass to burn — both stay out by construction. */
export const GRASS_FIRE_ZONES = ['sahel', 'congo-north']

/**
 * Whether the grass fire may burn here and now (point 145a): a cured-grass
 * zone in the DRY season only — never the Congo, never a rainless desert,
 * never the rains. Pure over zone and local wetness.
 */
export function grassFireEligible(zone: string, wetness: number): boolean {
  return GRASS_FIRE_ZONES.includes(zone) && wetness < 0.15
}

/**
 * The crocodile's home water (design.md §19.16, point 130): ~1890 the Nile
 * crocodile (with its western kin) lived in every major African river system
 * and lake — the Nile through Egypt and Sudan, the Niger and Senegal, the
 * Congo basin, the eastern lakes and the Zambezi south. Every region carries
 * such water, so the region list is complete; the REAL restriction is the
 * water itself — a crocodile exists only IN river/lake water, never on land
 * ground and never in the waterless desert (which has no water cells).
 */
export const CROCODILE_REGIONS = ['north', 'west', 'central', 'east', 'south'] as const

/** Where a crocodile may exist (point 130): river/lake water only — its home
 *  (the §19.5 no-standing-in-water rule exempts it like the flamingos), and
 *  never the open ocean. */
export function crocodileAllowedAt(terrain: string): boolean {
  return terrain === 'water'
}

/**
 * The ambush trigger (point 130): a hidden crocodile bursts out only when a
 * shore visitor stands at the bank inside the strike radius — it waits, it
 * never roams or chases across open land.
 */
export function crocodileLungeReady(distToPrey: number, preyAtBank: boolean, strikeRadius: number): boolean {
  return preyAtBank && distToPrey <= strikeRadius
}

/**
 * The gripped lunge's hard deadline (point 186): the grip normally ends when the
 * victim's caught-countdown runs out, but a victim REMOVED mid-grip (streamed out
 * in a chunk despawn, taken by another system) freezes that countdown and would pin
 * the crocodile forever. So the grip also expires after gripSeconds of held time,
 * releasing the crocodile no matter what — the §19.8 "every started drama resolves"
 * rule (invariant I4). Pure over the accumulated grip time so it is unit-testable.
 */
export function crocodileGripExpired(gripHeldSeconds: number, gripSeconds: number): boolean {
  return gripHeldSeconds > gripSeconds
}

/** A landed vulture's hover above its own ground (point 128): clears the
 *  body sphere's ~0.096 reach below the group origin (buildVulture,
 *  src/render/fauna.ts) with margin, so the pecking body never clips. */
export const LANDED_BIRD_HOVER = 0.15

/**
 * Local y of a landed bird over its flock's base point so it stands ON ITS
 * OWN ground (point 128): the terrain under the bird lifts it — positive
 * only, falling ground never pulls a bird down — the hover keeps the pecking
 * body clear, the hop is the feeding bounce. ONE rule shared by the kill
 * flock and the ground scavenger, so the two systems cannot drift apart
 * again (the scavenger's old inline copy hovered at 0.05, below the body's
 * own reach — the user's sunken bird on rising ground).
 */
export function landedBirdY(groupBaseY: number, groundUnderBird: number, hop: number): number {
  const lift = Math.max(0, Math.max(0, groundUnderBird) - groupBaseY)
  return lift + LANDED_BIRD_HOVER + hop
}

/**
 * Standing height anchored to the rendered water sheet (point 196): every
 * water occupant (a struggling calf, a wading parent, a bathing drinker)
 * measures its body from the SURFACE, dipped by its own depth — never from
 * the carved bed, which sits far below the sheet mid-channel. `surface` is
 * the resolved waterSurfaceY sample; a missed edge texel falls back to the
 * bed plus the ribbon's nominal lift.
 */
export function sheetAnchorY(surface: number | null, bedHeight: number, dip: number): number {
  return (surface ?? bedHeight + 0.3) - dip
}

/**
 * A shoreline wader's standing height (point 196): legs in the shallow sheet
 * (a fixed wade depth below the surface), but never below its own bed — on
 * the shallow edge it simply stands on the bottom. The flat 0.02 this
 * replaces buried whole flocks on elevated lakes and floated them over low
 * banks.
 */
export function waderStandY(bedHeight: number, surface: number | null): number {
  const bed = Math.max(0.02, bedHeight)
  return Math.max(bed, sheetAnchorY(surface, bedHeight, 0.25))
}

/** That bird's clearance above its own ground — the verify hook's metric,
 *  by construction never below LANDED_BIRD_HOVER. */
export function landedBirdClearance(groupBaseY: number, groundUnderBird: number, hop: number): number {
  return groupBaseY + landedBirdY(groupBaseY, groundUnderBird, hop) - Math.max(0, groundUnderBird)
}

/**
 * The LOWEST point of a landed bird's POSED geometry below its origin (point
 * 202): the peck/bob feed animation pitches the bird forward, dipping the HEAD
 * (local y 0.03, z 0.24 in fauna.ts) below the origin — at a full peck it
 * reaches deeper than the body sphere's bottom (0.096) that the flat
 * LANDED_BIRD_HOVER was sized for, so a feeding vulture clipped through the
 * ground (the user report; the wing tips ride high, the head is the deep end).
 * Scales with the render scale.
 */
export function landedBirdLowestDepth(pitch: number, scale: number): number {
  const head = 0.24 * Math.sin(pitch) - 0.03 * Math.cos(pitch)
  return Math.max(0.096, head) * scale
}

/** Ground-sample offsets under a landed bird's EXTENTS — centre, both wing tips
 *  (local x ±1.15·scale) and the pecking head (local z 0.24·scale) — rotated by
 *  the bird's yaw, so a slope rising under a spread wing or under the head is
 *  seen by the lift (point 202). */
export function birdExtentOffsets(yaw: number, scale: number): [number, number][] {
  const local: [number, number][] = [
    [0, 0],
    [1.15 * scale, 0],
    [-1.15 * scale, 0],
    [0, 0.24 * scale],
  ]
  const c = Math.cos(yaw)
  const s = Math.sin(yaw)
  return local.map(([x, z]) => [x * c + z * s, -x * s + z * c])
}

/** Pose-aware landed-bird y (point 202): the point-128 positive-only lift onto
 *  the HIGHEST ground under the bird's extents, plus a clearance derived from
 *  the posed geometry's lowest point (never the flat hover), plus the hop. */
export function landedBirdYPosed(
  groupBaseY: number,
  maxGroundUnder: number,
  hop: number,
  pitch: number,
  scale: number,
): number {
  const lift = Math.max(0, Math.max(0, maxGroundUnder) - groupBaseY)
  return lift + landedBirdLowestDepth(pitch, scale) + 0.06 + hop
}

/** The posed bird's LOWEST-POINT clearance above its own highest ground — the
 *  verify metric; by construction never below the 0.06 margin, and a group
 *  pre-lift bug (the point-185 double lift) still blows past any upper cap. */
export function landedBirdClearancePosed(
  groupBaseY: number,
  maxGroundUnder: number,
  hop: number,
  pitch: number,
  scale: number,
): number {
  return (
    groupBaseY +
    landedBirdYPosed(groupBaseY, maxGroundUnder, hop, pitch, scale) -
    landedBirdLowestDepth(pitch, scale) -
    Math.max(0, maxGroundUnder)
  )
}

/** Ordinary prey walk speed (units/s) — the unhurried gait (e.g. the walk back
 *  after a water rescue). The rescue burst is measured against this. */
export const PREY_WALK_SPEED = 3

/**
 * The rescue burst (design.md §19.8, point 127): a parent racing to save its
 * young moves at its ordinary walk times ONE calibratable adrenaline factor
 * (balance.family.rescueBurst) — the single rule behind all four rescue
 * drives (charge, shield, guard, wade to a struggling calf), replacing four
 * hand-set constants. Floored at the walk itself so a debug edit can tune the
 * burst down but never turn a rescue into a stroll slower than walking.
 * GRIEF drives are NOT rescues (nobody can be saved) and keep their own
 * speeds: the trample charge (point 119), the vigil walk (point 121) and the
 * waterfall plunge — do not "unify" them onto this rule.
 */
export function rescueSpeed(burst: number, walk: number = PREY_WALK_SPEED): number {
  return walk * Math.max(1, burst)
}

/**
 * Wading speed in the water (points 122/127): the swollen current that can
 * drown the calf brakes its rescuer too — in the water the burst speed is
 * divided by the season flow factor (wet ~1.8), so the rains' drowning drama
 * stays reachable however hard the parent sprints. A tame or dry-season flow
 * (factor <= 1) never speeds the wader up beyond the burst.
 */
export function wadeSpeed(rescue: number, flowFactor: number): number {
  return rescue / Math.max(1, flowFactor)
}

/**
 * Where an elephant may step (point 126): roaming herds keep to their spawn
 * biomes (savanna/jungle), but a MOURNING herd walks to the bones across any
 * land — the graveyard sits in dry country, and a herd frozen at a desert or
 * mountain texel on the way would never reach the site (the observed failure:
 * relocated mourners standing eternally still one biome border short of the
 * bones). Water stays refused either way — the water dramas own that ground.
 * An elephant STANDING on foreign land (e.g. the graveyard's dry ground after
 * its vigil ended) may always step onto land: the biome rule only stops a
 * roamer from ENTERING foreign ground, never from walking free of it — a
 * herd must not end pinned where its mourning walk took it.
 */
export function elephantStepAllowed(terrain: string, mourning: boolean, standingOn?: string): boolean {
  if (terrain === 'water' || terrain === 'ocean') return false
  if (mourning) return true
  if (standingOn !== undefined && standingOn !== 'savanna' && standingOn !== 'jungle') return true
  return terrain === 'savanna' || terrain === 'jungle'
}

/**
 * The vigil's hard deadline (point 126): the hold window plus a walk-in grant
 * of TWICE the straight-line time — the gentle turn cap arcs the herd in, so
 * a herd drawn at the radius edge would otherwise spend its whole hold window
 * still approaching (or turn away before reaching the bones). The deadline
 * still guarantees the vigil always resolves — never a pinned herd.
 */
export function mournDeadline(now: number, distToTarget: number, holdSeconds: number, speed: number): number {
  return now + holdSeconds + (distToTarget / speed) * 2
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
export function offscreenRingSpawn(
  cx: number,
  cz: number,
  minR: number,
  maxR: number,
  rand01: number,
  offScreen?: (x: number, z: number) => boolean,
): { x: number; z: number } {
  // A scripted predator (the hunt lion, the vigil-drawn predator) must never
  // POP into the rendered frame beside its prey (point 195, the 165/172/183
  // class). Probe angles at increasing radii from minR to maxR and return the
  // FIRST point that is off the rendered frame — nearest-first, so the run-in
  // is as short as the frustum allows. `offScreen` projects a world point
  // through the LIVE camera (the true frustum, not an assumed radius — the
  // point-172 lesson). With no camera mounted (predicate omitted) the minR ring
  // is used, as the old radius annulus did.
  const ringPoint = (r: number, k: number, probes: number) => {
    const ang = rand01 * Math.PI * 2 + (k * Math.PI * 2) / probes
    return { x: cx + Math.cos(ang) * r, z: cz + Math.sin(ang) * r }
  }
  if (!offScreen) return ringPoint(minR, 0, 1)
  const PROBES = 16
  const RINGS = 6
  for (let ring = 0; ring <= RINGS; ring++) {
    const r = minR + ((maxR - minR) * ring) / RINGS
    for (let k = 0; k < PROBES; k++) {
      const p = ringPoint(r, k, PROBES)
      if (offScreen(p.x, p.z)) return p
    }
  }
  // Every probe on-screen (a very wide zoom past the abort ring): start as far
  // out as allowed so the run-in is at least maximal.
  return ringPoint(maxR, 0, 1)
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
 * Escape-corridor heading for the predator walk-off (point 188). The old leave
 * course re-aimed at the pure RADIAL (away from the traveller) every frame; at a
 * coast pocket the radial points seaward, the per-step coast deflection points
 * along the beach, and the turn cap dragged the course back each frame — the
 * predator shuttled on the shoreline forever (the user's Cairo report). Instead
 * the leave phase PICKS its heading by corridor: sample `candidates` directions,
 * probe each in `stepLen` strides until `blocked` (ocean) or `maxSteps`, and
 * score = clear land distance + outwardWeight·cos(delta to the radial). The
 * longest clear LAND corridor wins, ties broken toward outward — so an inland
 * detour beats a short seaward stub, while open country still leaves radially.
 * The caller STICKS to the returned heading until its corridor closes (re-pick
 * on blocked-ahead only), so the choice cannot flip-flop between two flanking
 * corridors.
 */
export function escapeCorridorHeading(
  x: number,
  z: number,
  radial: number,
  blocked: (x: number, z: number) => boolean,
  stepLen = 2,
  maxSteps = 12,
  candidates = 16,
  outwardWeight = 8,
): number {
  let best = radial
  let bestScore = -Infinity
  for (let k = 0; k < candidates; k++) {
    const h = radial + (k / candidates) * Math.PI * 2
    let clear = 0
    for (let sIdx = 1; sIdx <= maxSteps; sIdx++) {
      if (blocked(x + Math.sin(h) * stepLen * sIdx, z + Math.cos(h) * stepLen * sIdx)) break
      clear += stepLen
    }
    const score = clear + Math.cos(h - radial) * outwardWeight
    if (score > bestScore) {
      bestScore = score
      best = h
    }
  }
  return best
}

/**
 * The flee step for a calf being run down by a land hunt (design.md §19.8,
 * point 157). It heads directly away from the hunter, then routes through
 * deflectedStep so a coast or river bank turns it aside instead of pinning it
 * (the old raw step ran straight into the water and stuck). A dead-end
 * (moved:false) leaves the calf in place for the catch to resolve — the "always
 * resolves" rule. `dist` stays CALF_FLEE_SPEED*dt (slower than the hunter, so
 * the chase still ends); the caller passes the water/ocean `blocked` predicate.
 */
export function calfFleeStep(
  cx: number,
  cz: number,
  hunterX: number,
  hunterZ: number,
  dist: number,
  blocked: (x: number, z: number) => boolean,
  lookahead = 0.8,
): { x: number; z: number; heading: number; moved: boolean } {
  const away = Math.atan2(cx - hunterX, cz - hunterZ)
  return deflectedStep(cx, cz, away, dist, blocked, lookahead)
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
 * Pick a placement anchor from deterministic candidates that is OUTSIDE the
 * rendered frame (design.md §19.5/§19.6, points 165/183 — a guarantee-seeded
 * group must never pop into view; the user report: "sie sollen nur außerhalb des
 * Sichtfeldes spawnen"). Returns the first off-screen LAND candidate, else null.
 * There is deliberately NO on-screen fallback: near water the off-screen
 * candidates can all be river/lake, and the old on-screen-land fallback POPPED a
 * herd into view mid-drive (point 183 — the user's Nile report). On null the
 * caller DEFERS (skips this frame and retries next frame, when the moving camera
 * exposes off-screen land) instead of placing on-screen. The caller supplies the
 * land and on-screen predicates, so this stays pure.
 */
export function pickOffscreenLandAnchor(
  candidates: ReadonlyArray<readonly [number, number]>,
  isLand: (x: number, z: number) => boolean,
  onScreen: (x: number, z: number) => boolean,
): readonly [number, number] | null {
  for (const c of candidates) {
    if (isLand(c[0], c[1]) && !onScreen(c[0], c[1])) return c // off-screen land — the only spot
  }
  return null // no off-screen land — the caller defers (point 183), never pops on-screen
}

/**
 * How many calves a herd group of `n` raises (design.md §19, point 169): a
 * calibratable fraction of the group size, but at least 1 (a herd of three or
 * more always raises a juvenile) and at most floor(n/2) so every calf can be
 * linked to its OWN distinct parent (the .child relation is 1:1). A group below
 * the family-life threshold of 3 raises none.
 */
export function calvesForGroup(n: number, fraction: number): number {
  if (n < 3) return 0
  return Math.max(1, Math.min(Math.floor(n / 2), Math.round(fraction * n)))
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
 *  intersected with what the region holds, AND the ambient savanna herds are
 *  drawn from this SAME pool (point 208 A2: the visible herds must match the
 *  researched ranges, not appear anywhere savanna). Zebra and wildebeest are
 *  East/South plains species — absent from the West African/Congo savanna in
 *  1890 — and giraffes keep to the eastern and southern plains, so only there
 *  may a hunt take one (point 124). */
export const REGION_PREY: Record<RegionId, PreyKind[]> = {
  east: ['wildebeest', 'zebra', 'antelope', 'warthog', 'giraffe'],
  south: ['wildebeest', 'zebra', 'antelope', 'warthog', 'giraffe'],
  central: ['antelope', 'warthog'],
  west: ['antelope', 'warthog'],
  north: ['antelope', 'warthog'],
}

/** Is this animal already OWNED by another emergent drama (point 197, the 194
 *  seam pattern)? A fresh-victim scan — the crocodile lunge, the grass fire —
 *  must never claim an animal a different system already holds, or two dramas
 *  fight over one actor. Shared so both scans exclude the same set: a caught /
 *  in-water / mired / crossing / fire-trapped animal, or the lion's chase
 *  victim. (The scan then adds its own extra gates: the croc needs an animal
 *  actually drinking at the bank; the fire needs a calf.) */
export function claimedByAnotherDrama(f: {
  caught?: number
  inWater?: number
  mired?: number
  crossing?: unknown
  fireTrapped?: number
  isLionVictim: boolean
}): boolean {
  return (
    f.caught !== undefined ||
    f.inWater !== undefined ||
    f.mired !== undefined ||
    f.crossing !== undefined ||
    f.fireTrapped !== undefined ||
    f.isLionVictim
  )
}

/** Which predators roam each region (~1890 range, design.md §19). Lions
 *  everywhere; cheetahs and hyenas favour the open eastern/southern plains;
 *  leopards the wooded west/centre; the arid north holds lion, cheetah and
 *  leopard. Shared (point 208 A3) so the random-event system gates a predator
 *  attack by the SAME roster the rendered world uses — a hyena never attacks in
 *  a region that holds no hyenas. */
export const REGION_PREDATORS: Record<RegionId, PredatorKind[]> = {
  east: ['lion', 'cheetah', 'hyena', 'leopard'],
  south: ['lion', 'cheetah', 'hyena', 'leopard'],
  central: ['lion', 'leopard'],
  west: ['lion', 'leopard'],
  north: ['lion', 'cheetah', 'leopard'],
}

/** The ambient savanna herd a chunk seeds (point 208 A2): elephants roam every
 *  savanna broadly, but grazer herds are drawn from the region's own
 *  `REGION_PREY` pool so the visible world matches the hunt/vicinity/food-web
 *  rules (a giraffe or zebra never stands as "scenery" in a region that every
 *  other rule calls foreign). Returns null outside the herd-roll band. The roll
 *  bands preserve the prior herd density; only the SPECIES pick is region-gated. */
export function ambientSavannaSpecies(region: RegionId, roll: number): 'elephant' | PreyKind | null {
  if (roll < 0.12) return 'elephant'
  if (roll < 0.62) {
    const pool = REGION_PREY[region] ?? REGION_PREY.east
    const t = (roll - 0.12) / (0.62 - 0.12)
    return pool[Math.min(pool.length - 1, Math.floor(t * pool.length))]
  }
  return null
}

/** The two halves of the defence matrix (design.md §19.8, point 125): the
 *  prey's weapon strength and the predator's readiness to abandon a contested
 *  kill. The predator side runs INVERSELY along §14.1's tested danger order
 *  cheetah < leopard < hyena < lion (src/systems/events.ts — one ordering,
 *  two consumers). */
export interface DefenseWeights {
  preyWeapon: Record<string, number>
  predatorFlight: Record<string, number>
  /** Per-predator fragility under a strong parent's strike (point 146):
   *  scales the KILL outcome of parentAttackOutcome. The lion ships 0 —
   *  nothing kills a lion. */
  killFlight: Record<string, number>
  /** TEST-ONLY (point 177): when set, parentAttackOutcome returns this outcome
   *  regardless of the roll. The roll is hashed on the attacker's phase/position
   *  at resolution time, which drifts with the frame count (variable under load),
   *  so the 146/145c verifications used to RETRY until the roll landed a kill/
   *  drive-off; forcing the outcome makes that single attempt deterministic.
   *  Never set in normal play. */
  forceOutcome?: ParentAttackOutcome
}

/**
 * The parent's defence chance (design.md §19.8, points 124/125): how likely a
 * parent that reaches the predator over its calf drives the hunt off (both
 * live) instead of being taken in the calf's place. Not one number per prey —
 * a factor model over (prey, predator), legible as a RULE rather than dice:
 * weapon × flight, capped at 0.95 (no defence is a certainty). A species
 * missing on either side never defends — the sacrifice stays the norm.
 *
 * THE LINE (point 125): only a parent that ATTACKS ever consults this — the
 * charge and shield rescues (and point 146's future revenge). A parent that
 * SURRENDERS never rolls: the vigil-keeper (121d), the trample-throw (119),
 * the waterfall plunge and the mired-calf charge (123) are chance-zero by
 * construction — they never call this helper.
 */
export function defendChance(prey: string, predator: string, weights: DefenseWeights): number {
  const weapon = weights.preyWeapon[prey]
  const flight = weights.predatorFlight[predator]
  if (weapon === undefined || flight === undefined) return 0
  return Math.min(Math.max(weapon * flight, 0), 0.95)
}

/** Resolves one attack: true — the parent drives this predator off (the calf
 *  is freed, the parent lives, the hunt leaves); false — the sacrifice.
 *  Deterministic — the caller passes its own hashed roll, never Math.random. */
export function parentDefends(
  prey: string,
  predator: string,
  roll: number,
  weights: DefenseWeights,
): boolean {
  return roll < defendChance(prey, predator, weights)
}

/**
 * The revenge chance (design.md §19.8, point 146): how likely a parent's
 * strike KILLS the predator outright instead of merely driving it off. Same
 * factor model as defendChance, at a higher bar: the (weapon − 0.5) gate
 * encodes "a RELATIVELY STRONG parent" — the antelope (0.25) kills nothing,
 * by construction — and killFlight the predator's fragility (the lion ships
 * 0: nothing kills a lion). Structurally killChance ≤ defendChance for every
 * pair: (w − 0.5)⁺ ≤ w, and the shipped killFlight never exceeds
 * predatorFlight (swept in the pure test).
 */
export function killChance(prey: string, predator: string, weights: DefenseWeights): number {
  const weapon = weights.preyWeapon[prey]
  const fragility = weights.killFlight[predator]
  if (weapon === undefined || fragility === undefined) return 0
  return Math.min(Math.max(Math.max(0, weapon - 0.5) * fragility, 0), 0.95)
}

/** Three-way resolution of one parent attack (design.md §19.8, points
 *  124/125/146). ONE roll decides, bands nested low to high: below killChance
 *  the predator dies where it stands ('kill'), below defendChance it is
 *  driven off ('driveOff'), else the parent is taken in the calf's place
 *  ('taken'). killChance ≤ defendChance holds for every pair, so the bands
 *  never invert. Only a parent that ATTACKS ever calls this — the surrender
 *  branches (vigil-keeper, trample-throw, waterfall plunge, mired calf)
 *  remain chance-zero by construction and never roll. */
export type ParentAttackOutcome = 'taken' | 'driveOff' | 'kill'
export function parentAttackOutcome(
  prey: string,
  predator: string,
  roll: number,
  weights: DefenseWeights,
): ParentAttackOutcome {
  if (weights.forceOutcome) return weights.forceOutcome // test-only determinism (point 177)
  if (roll < killChance(prey, predator, weights)) return 'kill'
  if (roll < defendChance(prey, predator, weights)) return 'driveOff'
  return 'taken'
}
