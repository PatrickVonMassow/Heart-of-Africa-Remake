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

/** Player shyness (design.md §19): the weapon-strength bar above which an
 *  ADULT stands its ground against the traveller. The giraffe's 1.5 sits
 *  exactly on it — a lion-killing kick is nothing to flee a human over —
 *  and the lion's 2.0 is above it; everything weaker bolts. */
export const PLAYER_SHY_STRONG_WEAPON = 1.5

/**
 * Whether an animal flees the traveller's bird's-eye figure (design.md §19):
 * the weak/prey tier flees as adults — read from the §14.1-aligned weapon
 * table (balance.parentDefense.preyWeapon, the same ranking the defence
 * matrix uses) — and so does ANY juvenile (calf, foal, chick, cub),
 * vulnerable whatever its species' adult rank. Apex/strong adults never
 * flee: the §14.1 predators (cheetah/leopard/hyena/lion), the elephant and
 * the armoured crocodile have no weak-tier weapon entry, and the giraffe's
 * 1.5 reaches the strong bar. The adult plover keeps the broken-wing lure
 * (point 145b) as its own answer to the approaching traveller, and the
 * flamingo — the one weak bird with no weapon entry — flies off. The flee is
 * cosmetic shyness only: the player-collision resolution stays
 * consequence-free and §19.3's walk-into-a-predator attack is untouched.
 */
export function fleesFromPlayer(
  species: string,
  isJuvenile: boolean,
  preyWeapon: Record<string, number>,
): boolean {
  if (isJuvenile) return true
  if (species === 'flamingo') return true // the weak wader — it takes to the air
  const weapon = preyWeapon[species]
  if (weapon === undefined) return false // predators/elephant/crocodile/plover: no weak-tier entry
  return weapon < PLAYER_SHY_STRONG_WEAPON
}

/** The set of scripted §19.8 drama / hunt states an animal can be in. A truthy
 *  flag means the animal is CLAIMED by that drama and its movement is owned by
 *  the drama's own logic — not free to be redirected. */
export interface DramaState {
  caught?: number // seized by a predator (lion or crocodile grip) — thrashing
  fireTrapped?: number // pinned by the grass-fire line (point 145a)
  inWater?: number // struggling in open water (the drowning drama)
  rescued?: boolean // pulled out, walking back to the bank beside the parent
  mired?: number // stuck at the drying waterhole (point 123)
  crossing?: unknown // purposefully swimming a river/lake (point 192)
  vigil?: unknown // mourning over a fallen calf/herd-mate (point 121/126)
  kick?: number // the parent defence strike (points 124/125)
  plungeTo?: unknown // rushing after a swept-over calf (waterfall grief)
  trampleTo?: unknown // charging the elephant that trampled its calf
  defending?: boolean // parent shield / charge / guard / wade for its calf
  isLionVictim?: boolean // the designated victim of the running lion hunt
  isHunted?: boolean // actively fleeing a predator this frame
}

/** Is this animal currently OWNED by a scripted §19.8 drama or a hunt (point
 *  252 priority ordering)? A predator/drama state must OUTRANK the point-238/239
 *  player-shy flee: an animal in any of these states keeps its drama behaviour
 *  regardless of the traveller's proximity (a hunted prey keeps fleeing the
 *  predator, a caught victim keeps struggling, a defending parent holds its
 *  shield). Only an idle/roaming/grazing animal — none of these flags set — is
 *  free to shy from the player. Broader than `claimedByAnotherDrama` (which
 *  gates the fresh-victim scans): it also covers the surrender/grief drives
 *  (vigil, kick, plunge, trample), the rescue/defence drives and the
 *  being-hunted flee, exactly the states that must beat the player-shy flee. */
export function isInDrama(f: DramaState): boolean {
  return (
    f.caught !== undefined ||
    f.fireTrapped !== undefined ||
    f.inWater !== undefined ||
    f.rescued === true ||
    f.mired !== undefined ||
    f.crossing !== undefined ||
    f.vigil !== undefined ||
    f.kick !== undefined ||
    f.plungeTo !== undefined ||
    f.trampleTo !== undefined ||
    f.defending === true ||
    f.isLionVictim === true ||
    f.isHunted === true
  )
}

/** Whether an animal flees the traveller RIGHT NOW (point 252): the point-238/239
 *  player shyness (`fleesFromPlayer`) applies ONLY to an idle/roaming/grazing
 *  animal — an animal already in a hunt/drama state (`isInDrama`) IGNORES the
 *  player-shy flee for that drama's whole duration, so a running hunt or drama
 *  is never pre-empted by the player wandering near (predator > player-flee >
 *  idle). */
export function fleesPlayerNow(
  species: string,
  isJuvenile: boolean,
  preyWeapon: Record<string, number>,
  drama: DramaState,
): boolean {
  return fleesFromPlayer(species, isJuvenile, preyWeapon) && !isInDrama(drama)
}

/**
 * The drink-errand exemption from the player-shy flee, NARROWED (point 247).
 * The old blanket rule ("any animal with a drink target never shies") existed
 * to protect the staged §19.16 bank dramas — but it also made a PLAIN drinking
 * juvenile ignore the traveller standing over it (the reported bug). The
 * exemption now keeps exactly what it was for:
 * - a STAGED BANK VICTIM — a crocodile's current lunge target, or a drinker
 *   whose bank spot lies inside a lurking crocodile's strike radius (the
 *   imminent-ambush window; fleeing there would starve the drama) — never
 *   shies, juvenile or adult (the mired/caught calves are already covered by
 *   the isInDrama gate);
 * - an ADULT keeps its whole bank errand (the walk-to-water/drink/walk-back
 *   cycle is its own deliberate behaviour, and the ambush needs standing
 *   adult drinkers as its pool);
 * - a plain drinking JUVENILE is NOT exempt — it bolts from the close
 *   traveller like any calf.
 */
export function drinkExemptFromPlayerShy(
  isJuvenile: boolean,
  drinking: boolean,
  stagedBankVictim: boolean,
): boolean {
  if (!drinking) return false
  if (stagedBankVictim) return true
  return !isJuvenile
}

/** Which threat source won the flee arbitration (point 252). The DRAMA and
 *  PREDATOR-flee cases yield no source here: a drama owns its animal's whole
 *  movement, and the predator flee runs its own urgency-scaled block — the
 *  resolver's job for those is to return null so the player-shy flee can
 *  never pre-empt them. */
export type FleeThreatSource = 'elephant' | 'player'

/** The animal-side state the flee arbitration reads (point 252). */
export interface FleeArbitrationState {
  species: string
  isJuvenile: boolean
  /** The §14.1-aligned weapon table (balance.parentDefense.preyWeapon). */
  preyWeapon: Record<string, number>
  /** The FULL co-active drama/hunt state — every flag, so no drama can slip
   *  past the gate through an incomplete hand-built object. */
  drama: DramaState
  /** Mid drink/bathe bank errand (a.drink set). */
  drinking: boolean
  /** Bound into a staged §19.16 bank drama (see drinkExemptFromPlayerShy). */
  stagedBankVictim: boolean
}

/**
 * THE arbitration point for a free animal's flee target (point 252): ONE
 * resolver ranks every co-active threat instead of scattered checks, so the
 * held dodge heading is chosen consistently. Priority, high to low:
 * 1. Any scripted §19.8 drama — handled BEFORE this resolver (familyHeld owns
 *    the movement); the drama gate inside fleesPlayerNow is the structural
 *    backstop should a drama flag ever reach here.
 * 2. The predator flee — its own block moves the animal; it reaches this
 *    resolver flagged `isHunted`, which silences the player-shy flee while
 *    the elephant dart below stays live (a prey boxed between lion and herd
 *    still darts).
 * 3. The last-moment elephant dart (`elephants` in `elephantRing`).
 * 4. The player-shy flee (`player` in `playerRing`) — only from an idle/
 *    graze/drink state per fleesPlayerNow and the narrowed drink exemption.
 * 5. Nothing (null): idle.
 * The winner's heading feeds the SAME held `dodgeHeading` (turnToward under
 * the caller's turn cap and hysteresis rings), so a hand-over between
 * sources — elephant dart ending into a player flight — turns smoothly and
 * can never flip-flop (the point-237 steady-escape rule ACROSS sources).
 */
export function resolveFleeTarget(
  x: number,
  z: number,
  s: FleeArbitrationState,
  elephants: ReadonlyArray<readonly [number, number]>,
  player: ReadonlyArray<readonly [number, number]>,
  elephantRing: number,
  playerRing: number,
): { source: FleeThreatSource; heading: number } | null {
  // The elephant dart: the top flee reflex — live even for a predator-fleeing
  // prey (the caller passes [] for species that never dart, and no drama-held
  // animal reaches this resolver at all).
  if (elephants.length > 0) {
    const e = fleeHeading(x, z, elephants, elephantRing)
    if (e !== null) return { source: 'elephant', heading: e }
  }
  // The player-shy flee: only from an idle state — a hunt/drama outranks it
  // (fleesPlayerNow), and the staged bank victims / adult drinkers keep
  // their errand (point 247).
  if (drinkExemptFromPlayerShy(s.isJuvenile, s.drinking, s.stagedBankVictim)) return null
  if (!fleesPlayerNow(s.species, s.isJuvenile, s.preyWeapon, s.drama)) return null
  const p = fleeHeading(x, z, player, playerRing)
  return p === null ? null : { source: 'player', heading: p }
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
 * The boxed-flight crossing decision (points 192/248): when a flee/dodge step
 * dead-ends against the water (`moved` false), the animal takes to it and
 * swims for the far bank rather than balking at the waterline — the SAME rule
 * for every flight source (predator flee, elephant dart AND the player-shy
 * flee; point 248 closed the player-shy gap that pinned a player-boxed animal
 * at the bank). crossingTarget still refuses the ocean and over-wide channels,
 * and an animal already mid-crossing starts no second one.
 */
export function fleeCrossing(
  moved: boolean,
  alreadyCrossing: boolean,
  x: number,
  z: number,
  heading: number,
  maxUnits: number,
  terrainTypeAt: (x: number, z: number) => string,
): { tx: number; tz: number } | null {
  if (moved || alreadyCrossing) return null
  return crossingTarget(x, z, heading, maxUnits, terrainTypeAt)
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
 * too. Returns that elephant's position AND its heading of travel (point 259 —
 * the caller aims at the elephant's FRONT), or `null` when none is left — the
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
  elephants: ReadonlyArray<{ x: number; z: number; dead?: boolean; heading?: number }>,
): { x: number; z: number; heading: number } | null {
  let best: { x: number; z: number; heading: number } | null = null
  let bestD = Infinity
  for (const e of elephants) {
    if (e.dead) continue
    const d = Math.hypot(e.x - x, e.z - z)
    if (d < bestD) {
      bestD = d
      best = { x: e.x, z: e.z, heading: e.heading ?? 0 }
    }
  }
  return best
}

/**
 * A point `reach` ahead of an elephant along its heading (design.md §19.8,
 * point 259). A grieving parent must reach the elephant's FRONT to be crushed:
 * with the parent standing ahead along the heading `(sin h, cos h)`, an elephant
 * that keeps walking forward is travelling TOWARD the parent, so the direction
 * condition (`trampleKills`) holds and it goes under the feet. A parent that only
 * reaches the flank or rear is NOT trampled and keeps re-aiming at the front.
 */
export function frontInterceptTarget(
  elephantX: number,
  elephantZ: number,
  heading: number,
  reach: number,
): { x: number; z: number } {
  return { x: elephantX + Math.sin(heading) * reach, z: elephantZ + Math.cos(heading) * reach }
}

/**
 * Deflect one animal's per-frame step so it SLIDES AROUND an elephant's body
 * instead of walking through it (design.md §19.5, point 261). An elephant is a
 * solid obstacle to every other animal's LOCOMOTION: a step from `(fromX,fromZ)`
 * to `(toX,toZ)` whose straight path would enter the body circle
 * `(obstX,obstZ,radius)` is redirected to the circle's tangent — the returned
 * end point is never inside the circle and always keeps moving forward along the
 * surface (never a dead stop, even for a shot aimed straight at the centre), so
 * the mover rounds the body toward its goal. A step that never touches the
 * circle is returned unchanged.
 *
 * The collider guards only the mover's OWN step (radius = the elephant body
 * radius, no self-radius added) so a deflected animal rests AT the body edge —
 * still inside the wider §19.5 trample reach. It therefore never blocks the
 * designed contacts: the elephant may still step over a pinned animal to
 * trample it, and a grief parent rounds the body to the front and is crushed
 * there (points 259/261). It is not applied to the elephant itself.
 */
export function deflectAroundCircle(
  fromX: number,
  fromZ: number,
  toX: number,
  toZ: number,
  obstX: number,
  obstZ: number,
  radius: number,
): [number, number] {
  const mx = toX - fromX
  const mz = toZ - fromZ
  const segLen = Math.hypot(mx, mz)
  const fdx = fromX - obstX
  const fdz = fromZ - obstZ
  const fromDist = Math.hypot(fdx, fdz)
  // Closest approach of the step segment to the body centre. If it stays outside
  // the circle the straight step is free — the common case (no elephant in the
  // way) returns untouched.
  let closest2: number
  if (segLen < 1e-9) {
    closest2 = fromDist * fromDist
  } else {
    let tc = -(fdx * mx + fdz * mz) / (segLen * segLen)
    tc = Math.max(0, Math.min(1, tc))
    const px = fromX + mx * tc - obstX
    const pz = fromZ + mz * tc - obstZ
    closest2 = px * px + pz * pz
  }
  if (closest2 >= radius * radius) return [toX, toZ]
  // The step enters the body: slide along the surface instead. Anchor on the
  // boundary at the side the mover approaches FROM, then advance tangentially by
  // the intended step length toward `to`. A centre-aimed shot (no radial side)
  // falls back to the reverse of the motion, then a fixed axis, so it still
  // picks a tangent and slides rather than stalling.
  let rx: number
  let rz: number
  if (fromDist > 1e-6) {
    rx = fdx / fromDist
    rz = fdz / fromDist
  } else if (segLen > 1e-6) {
    rx = -mx / segLen
    rz = -mz / segLen
  } else {
    rx = 1
    rz = 0
  }
  // The two surface tangents; take the one that carries the mover toward `to`.
  const t1x = -rz
  const t1z = rx
  const dirx = segLen > 1e-6 ? mx / segLen : t1x
  const dirz = segLen > 1e-6 ? mz / segLen : t1z
  const useFirst = t1x * dirx + t1z * dirz >= 0
  const tx = useFirst ? t1x : -t1x
  const tz = useFirst ? t1z : -t1z
  let ex = obstX + rx * radius + tx * segLen
  let ez = obstZ + rz * radius + tz * segLen
  // Guarantee the result rests outside the body (round-off / a long step's
  // chord could dip in): push it back out to the edge radially if needed.
  const edx = ex - obstX
  const edz = ez - obstZ
  const ed = Math.hypot(edx, edz)
  if (ed < radius) {
    if (ed < 1e-6) {
      ex = obstX + rx * radius
      ez = obstZ + rz * radius
    } else {
      ex = obstX + (edx / ed) * radius
      ez = obstZ + (edz / ed) * radius
    }
  }
  return [ex, ez]
}

/**
 * The trample direction condition (design.md §19.5, point 259): an animal caught
 * in the §19.5 elephant-overlap exception is killed ONLY when the elephant is
 * actively moving with a positive component TOWARD it — its per-frame movement
 * vector `(velX, velZ)` has `dot(vel, victim − elephant) > 0` and a magnitude
 * above `speedEps`. Consequences: a STANDING elephant (near-zero velocity) that
 * another animal walks into does NOT kill it, and an animal that runs into an
 * elephant FROM BEHIND (behind its heading of travel, dot < 0) is NOT killed.
 * Only an elephant driving into/over the animal tramples it; the §19.5
 * body-separation parts a harmless overlap otherwise. Boundary: dot = 0 (a
 * purely lateral pass) does not kill.
 */
export function trampleKills(
  velX: number,
  velZ: number,
  elephantX: number,
  elephantZ: number,
  victimX: number,
  victimZ: number,
  speedEps = 1e-4,
): boolean {
  if (Math.hypot(velX, velZ) <= speedEps) return false
  return velX * (victimX - elephantX) + velZ * (victimZ - elephantZ) > 0
}

/**
 * Whether an elephant would trample an animal THIS step (design.md §19.5,
 * points 259/261/263): the animal is within `trampleRadius` of the elephant AND
 * the `trampleKills` direction condition holds (the elephant is moving toward
 * it). This is the SINGLE predicate shared by the trample-kill site and the
 * body-collider exemption: the point-261 body collider must NOT slide a free
 * animal AROUND the body when the elephant is bearing down on it, because that
 * lateral deflection turns the elephant→victim vector perpendicular to the
 * elephant's velocity (dot → 0) and the point-259 directional trample can never
 * fire — the elephant would trample nothing, no stain is laid and the §19.8
 * calf-trample grief chain never starts. The collider therefore EXEMPTS an
 * animal this predicate flags for that elephant (the step lands, the trample
 * catches it); an animal near a NON-trampling elephant (stationary, or not
 * moving toward it) still slides around the body (no walk-through).
 */
export function elephantWouldTrample(
  velX: number,
  velZ: number,
  elephantX: number,
  elephantZ: number,
  victimX: number,
  victimZ: number,
  trampleRadius: number,
  speedEps = 1e-4,
): boolean {
  if (Math.hypot(victimX - elephantX, victimZ - elephantZ) >= trampleRadius) return false
  return trampleKills(velX, velZ, elephantX, elephantZ, victimX, victimZ, speedEps)
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
 * Grounded standing height for a body on land (design.md §19, points
 * 203(A)/283): a small floor keeps the lowest ground from clipping the body
 * origin under the surface. The renderer draws the body at this height, so
 * EVERY drive that moves an animal must re-derive `a.y` through this exact
 * clamp at the animal's new position — the single shared derivation that makes
 * a moved body stand on precisely the ground drawn under it (the source clamp
 * the buried-warthog assert is armed for).
 */
export const GROUND_BODY_MIN_Y = 0.02
export function groundedBodyY(terrainHeight: number): number {
  return Math.max(GROUND_BODY_MIN_Y, terrainHeight)
}

/**
 * Ground-follow for a mover (point 283): sample the terrain at the animal's
 * CURRENT position and return the grounded body height it should stand at, or
 * `null` on a water cell — water occupants ride their own drama/sheet rules and
 * keep their maintained height. This is the ONE derivation a moving drive and
 * the renderer share (both feed the same terrain sample through `groundedBodyY`),
 * so a body that just moved can never sink under the fresh ground beneath it.
 */
export function groundFollowY(
  x: number,
  z: number,
  sampleTerrainAt: (x: number, z: number) => { type: string; height: number },
): number | null {
  const t = sampleTerrainAt(x, z)
  if (t.type === 'water' || t.type === 'ocean') return null
  return groundedBodyY(t.height)
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

/**
 * Body separation at a water/coast edge (design.md §19.5, point 222): a pair
 * pinned against impassable water cannot part along the straight centre-line,
 * because the water setback reverts the component pointing INTO the water every
 * frame — the two animals stay interpenetrating (the reported waterline bug).
 * Given the inward water normal `waterDir` (unit, pointing into the forbidden
 * water), the push is resolved along the SHORE TANGENT instead: the into-water
 * component is removed, and when the raw push is (almost) purely into the water
 * — so simply removing it would leave nothing and stall — the whole magnitude is
 * redirected along the shore tangent so the animals still slide apart. With
 * `waterDir` null (no water nearby) it is exactly separationPush.
 */
export function edgeSeparationPush(
  x: number,
  z: number,
  neighbors: ReadonlyArray<readonly [number, number, number]>,
  waterDir: readonly [number, number] | null,
): [number, number] {
  const [px, pz] = separationPush(x, z, neighbors)
  if (!waterDir) return [px, pz]
  const [nx, nz] = waterDir
  const into = px * nx + pz * nz
  if (into <= 0) return [px, pz] // already leads away from the water
  let tx = px - nx * into
  let tz = pz - nz * into
  const mag = Math.hypot(px, pz)
  if (Math.hypot(tx, tz) < 0.05 * mag) {
    // Push is (almost) purely into the water: redirect the full magnitude along
    // the shore tangent (the water normal turned 90°) so the pair still parts.
    tx = -nz * mag
    tz = nx * mag
  }
  return [tx, tz]
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

/** Turn `current` toward `target` (both radians) by at most `maxStep`, taking the
 *  shorter way around. Used to cap per-frame turns so a facing never snaps. */
export function turnToward(current: number, target: number, maxStep: number): number {
  let dh = target - current
  while (dh > Math.PI) dh -= Math.PI * 2
  while (dh < -Math.PI) dh += Math.PI * 2
  return current + Math.max(-maxStep, Math.min(maxStep, dh))
}

/** Angular margin (radians) a fresh flee pick must beat the held heading by
 *  before the commit-and-hold releases (design.md §19.8, point 237). */
export const FLEE_COMMIT_MARGIN = 0.9

/**
 * Commit-and-hold for a fleeing animal's escape heading (design.md §19.8,
 * point 237). A calf ringed by a herd sees `fleeHeading`'s summed-repulsion
 * resultant go near-zero, and its ANGLE then flips ~180° between two
 * comparably-good escapes frame to frame; feeding that jitter straight into the
 * capped `turnToward` trembled the calf's facing between two directions (the
 * user's oscillating-calf report). This keeps the committed heading and accepts
 * a fresh pick only once it diverges past `switchMargin` — the same "commit to
 * one corridor, re-pick only when it closes" discipline `escapeCorridorHeading`/
 * `calfFleeStep` use for the coast flight — so a transient flip can never flap
 * the escape. The caller still `turnToward`s the returned target under its own
 * turn cap, which smooths a genuine switch. Divergence is measured across the
 * ±π seam.
 */
export function committedFleeHeading(
  held: number | undefined,
  pick: number,
  switchMargin: number = FLEE_COMMIT_MARGIN,
): number {
  if (held === undefined) return pick
  let d = pick - held
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d) <= switchMargin ? held : pick
}

/**
 * Crocodile ambush target preference (design.md §19.16/§19.8, point 245): a
 * drinking JUVENILE at the bank is the strongly-preferred lunge target so the
 * §19.8 sacrifice/rescue drama fires more often — its weight is `bias` (≫ 1),
 * an adult's is 1. The crocodile only ever lunges at a drinker genuinely
 * standing at the bank, so the sole discriminator here is young-vs-adult.
 */
export function crocodileTargetWeight(isJuvenile: boolean, bias: number): number {
  return isJuvenile ? bias : 1
}

/**
 * Whether a fresh hunt seeks a nearby JUVENILE over a generic grazer (design.md
 * §19.8, point 245): juveniles are the preferred prey of every predator, so the
 * calibratable `bias` (balance.family.juvenilePreyBias) is raised well above
 * half — a 0..1 `roll` below it picks the calf hunt.
 */
export function prefersJuvenilePrey(roll: number, bias: number): boolean {
  return roll < bias
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
 * Per-carcass vulture-flock ownership (design.md §19.6, point 251). Each
 * eligible carcass draws and OWNS its own scavenger flock, so N carcasses draw
 * N INDEPENDENT concurrent flocks — never the old single GLOBAL draw that
 * finished one carcass and then HOPPED straight to the next (the user report:
 * one set of vultures migrating between carcasses instead of one flock per
 * carcass). Rules:
 *  - A slot bound to a carcass KEEPS it while the carcass is still eligible.
 *  - When its carcass is gone (no longer in `carcasses`) the slot is RELEASED
 *    (target → null); it then flies off and despawns on its own — it does NOT
 *    hop to another carcass. Only once its flight has fully left (a slot marked
 *    `available`, i.e. idle again) may it take a NEW carcass.
 *  - A free, available slot is assigned the nearest still-UNOWNED carcass; two
 *    slots never share one carcass.
 * The point-162 rule is orthogonal and untouched: only real carcasses/remnants
 * are ever passed in, so a drive-off (no carcass) draws no flock here.
 *
 * Pure over the per-slot view (current target + availability) and the live
 * carcass list; returns the next per-slot target. Carcass identity is by
 * reference (`===`), matching the herd-array Animal objects.
 */
export interface ScavengerSlotView<T> {
  /** The carcass this slot currently owns, or null when free. */
  target: T | null
  /** The slot's flight has fully despawned (idle) — free to take a new carcass.
   *  A slot still flying in/out is NOT available, so it can't hop mid-flight. */
  available: boolean
}

export function assignPerCarcassFlocks<T>(
  slots: ReadonlyArray<ScavengerSlotView<T>>,
  carcasses: ReadonlyArray<T>,
  distanceTo: (carcass: T) => number,
): (T | null)[] {
  const live = new Set(carcasses)
  // Keep each slot's carcass while it is still eligible; else release it.
  const next: (T | null)[] = slots.map((s) => (s.target !== null && live.has(s.target) ? s.target : null))
  const owned = new Set<T>()
  for (const t of next) if (t !== null) owned.add(t)
  // Hand out the still-unowned carcasses nearest-first to free available slots.
  const unowned = carcasses.filter((c) => !owned.has(c)).sort((a, b) => distanceTo(a) - distanceTo(b))
  let ui = 0
  for (let i = 0; i < slots.length && ui < unowned.length; i++) {
    if (next[i] !== null || !slots[i].available) continue
    next[i] = unowned[ui++]
    owned.add(next[i] as T)
  }
  return next
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
 * The BROADENED ambush trigger (design.md §19.16, point 275): the original
 * trigger only fired at a formal bank DRINKER standing in the drink pose, so a
 * lurking crocodile with no drinker in its narrow window read as inert even
 * while grazers stepped to the water beside it. Now ANY prey that has come to
 * the WATERLINE — its rendered feet on land (not on the water itself, so it is
 * standing at the bank rather than crossing) close to a hidden crocodile — is a
 * legal ambush target within the strike radius, whether or not it is drinking.
 *
 * `distToCroc` is the prey's distance to the lurking crocodile (which sits on
 * water), `preyOnLand` is true when the prey stands on a land cell (the bank,
 * not mid-channel), and `bankBand` is the calibratable reach past the water
 * edge that still counts as "at the waterline": a prey up to `bankBand` from
 * the croc is close enough to seize. The ambush stays OCCASIONAL because the
 * croc still only lunges when a prey happens into this shallow band — it never
 * chases across open land, and `crocodileTargetWeight` keeps young preferred.
 */
export function crocodileWaterlinePrey(
  distToCroc: number,
  preyOnLand: boolean,
  strikeRadius: number,
  bankBand: number,
): boolean {
  // The croc lies ON water; a prey on LAND within reach stands at the bank. The
  // effective reach is the smaller of the strike radius and the bank band, so a
  // large strike radius never lets the croc snatch a grazer far up the shore.
  return preyOnLand && distToCroc <= Math.min(strikeRadius, bankBand)
}

/**
 * Whether a crocodile just DRIVEN OFF a seized victim is still resting, and so
 * may not take a new ambush target (design.md §19.16, point 130 read against the
 * broadened waterline trigger). Under the drinker-only trigger a repelled croc
 * rarely found a fresh target, because the freed calf had to enter a drink pose
 * again; now that any bank-stander is catchable, the SAME calf standing where it
 * was rescued is legal the very next frame — the croc would re-seize it at once
 * and never actually retreat, so the parent's defence would read as failed. A
 * repelled crocodile therefore keeps to its water for a calibratable rest.
 * `restUntil` is the elapsed time the rest expires at (undefined = never
 * repelled); pure over (now, restUntil) so it is unit-testable.
 */
export function crocodileAmbushResting(now: number, restUntil: number | undefined): boolean {
  return restUntil !== undefined && now < restUntil
}

/**
 * The crocodile's mouth anchor in world space (design.md §19.16, point 268): a
 * seized victim lies at the crocodile's JAWS, not on its back. The jaw tip sits
 * a fixed distance AHEAD of the body origin along the local +z axis in the
 * crocodile mesh (the snout reaches well past the skull, `snoutBaseZ` ~0.87 with
 * the jaw tubes and nostril out near local z ~1.5); scaling by the instance
 * `scale` and rotating by the croc's facing `rot` places the mouth in world
 * space. `mouthOffsetLocal` is that local forward reach (a shade behind the very
 * snout tip so the victim sits IN the jaws, gripped, not floating off the nose).
 * Returns the world `[x, z]` at which the caught victim (and its thrash) render.
 */
export function crocodileMouthAnchor(
  cx: number,
  cz: number,
  rot: number,
  scale: number,
  mouthOffsetLocal: number,
): [number, number] {
  const reach = mouthOffsetLocal * scale
  return [cx + Math.sin(rot) * reach, cz + Math.cos(rot) * reach]
}

/**
 * The feeding motion of a crocodile that has seized a victim (design.md §19.16,
 * point 268): while it grips and consumes, the croc animates as EATING — the
 * classic death-roll / head thrash paired with a gulp bob — so the meal reads as
 * eating rather than a body resting on the croc. Returns the pose deltas to add
 * to the gripping croc's render this frame, driven purely by the elapsed feed
 * time `t` and the per-croc `phase` (desynchronising neighbours):
 *  - `rollYaw`  — a side-to-side wrench of the head/jaws (the thrash), a bounded
 *                 oscillation added to the facing.
 *  - `pitch`    — a periodic gulp: the snout tips up as the croc throws its head
 *                 back to swallow, then drops (always ≥ 0, a nose-up bob).
 *  - `bobY`     — a small vertical heave of the whole body with each gulp.
 * All amplitudes are small and bounded, so stripping the motion leaves the plain
 * gripping pose. Pure over (t, phase) so it is unit-testable.
 */
export const CROCODILE_FEED_THRASH_AMP = 0.35
export const CROCODILE_FEED_GULP_PITCH = 0.22
export const CROCODILE_FEED_BOB_AMP = 0.05
export function crocodileFeedPose(t: number, phase: number): { rollYaw: number; pitch: number; bobY: number } {
  const ph = phase * Math.PI * 2
  // The thrash: a brisk side-to-side wrench of the jaws (a fast sine).
  const rollYaw = Math.sin(t * 8 + ph) * CROCODILE_FEED_THRASH_AMP
  // The gulp: a slower nose-up heave to work the prey down — rectified so the
  // snout only ever tips UP (a swallow), never buries into the water.
  const gulp = Math.max(0, Math.sin(t * 2.4 + ph))
  return {
    rollYaw,
    pitch: gulp * CROCODILE_FEED_GULP_PITCH,
    bobY: gulp * CROCODILE_FEED_BOB_AMP,
  }
}

/**
 * The resting crocodile's subtle idle yaw (design.md §19.16, points 242/257): a
 * hidden crocodile WAITS — it lies submerged, it does not roam. Its faint life is
 * a BOUNDED oscillation about a FIXED rest heading, an ABSOLUTE value that always
 * returns to centre. It must NEVER be an increment added to the live heading each
 * frame (point 257 regression): steering the persistent facing toward a heading
 * that was itself `heading + sway` fed the sway back in every frame, summing a
 * running integral of the sine that grew into a full-circle rotation. Anchoring
 * the sway to a FIXED restYaw breaks that feedback loop. The amplitude is a few
 * degrees; the per-crocodile phase desynchronises neighbours on the same water.
 */
export const CROCODILE_IDLE_SWAY_AMP = 0.03
export function crocodileIdleYaw(restYaw: number, t: number, phase: number): number {
  return restYaw + Math.sin(t * 0.3 + phase * Math.PI * 2) * CROCODILE_IDLE_SWAY_AMP
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

/**
 * Whether a gripping crocodile still holds an UNRESOLVED catch and must keep
 * holding — it may NOT slink home, idle or roam while this is true (design.md
 * §19.16, point 250). A crocodile owns its victim through the whole §19.8
 * struggle window AND the sink that follows the kill (the river keeps the body,
 * no bank carcass): the prey's dissolve/removal is DRIVEN BY the croc's feed,
 * never a decoupled carcass the croc swam away from while it dissolved on its
 * own (the reported bug — a snapped catch, the croc gone, the prey still
 * consuming itself). Resolved (returns false) only once the victim is freed (a
 * drive-off clears the grip via the retreat flag) or its sinking body has fully
 * gone.
 *
 *   struggle: caught still counting down            -> held
 *   sink:     killed, body dissolving in the water  -> held (the croc drags it under)
 *   done:     freed, or the body fully dissolved    -> released
 *
 * Pure over the victim's state fields so the coupling is unit-testable.
 */
export function crocodileHoldsCatch(
  gripped: boolean,
  caught: number | undefined,
  dead: boolean,
  dissolve: number | undefined,
): boolean {
  if (!gripped) return false
  if (caught !== undefined) return true
  if (dead && dissolve !== undefined && dissolve > 0) return true
  return false
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
 * The vulture's deep local extents (buildVulture, src/render/fauna.ts), as the
 * bounding-box corners of every part in unit (scale-1) local space: the body
 * ellipsoid and head bboxes plus the two SPREAD WINGS (inner plate + outer tip,
 * both sides). The corners bound the actual rounded/tapered geometry from
 * outside, so a min taken over them can never sit ABOVE a real vertex — the
 * lift it drives always clears the true mesh. Mirrors the fauna.ts numbers; if
 * buildVulture's proportions change, update both (fauna.test.ts pins the wing
 * span these are derived from).
 */
function vultureLowExtents(): [number, number, number][] {
  const rotZ = (x: number, y: number, a: number): [number, number] => {
    const c = Math.cos(a)
    const s = Math.sin(a)
    return [x * c - y * s, x * s + y * c]
  }
  const box = (
    hx: number,
    hy: number,
    hz: number,
    tx: number,
    ty: number,
    tz: number,
    rz: number,
  ): [number, number, number][] => {
    const out: [number, number, number][] = []
    for (const sx of [-1, 1])
      for (const sy of [-1, 1])
        for (const sz of [-1, 1]) {
          const [x, y] = rotZ(tx + sx * hx, ty + sy * hy, rz)
          out.push([x, y, tz + sz * hz])
        }
    return out
  }
  const pts: [number, number, number][] = []
  pts.push(...box(0.128, 0.096, 0.224, 0, 0, 0, 0)) // body ellipsoid bbox (0.16·(0.8,0.6,1.4))
  pts.push(...box(0.06, 0.06, 0.06, 0, 0.03, 0.24, 0)) // head sphere bbox
  for (const side of [-1, 1]) {
    pts.push(...box(0.425, 0.0125, 0.14, side * 0.5, 0.04, -0.02, side * 0.12)) // wing plate
    pts.push(...box(0.15, 0.01, 0.1, side * 1.0, 0.12, -0.04, side * 0.3)) // wing tip
  }
  return pts
}

const VULTURE_LOW_EXTENTS: readonly (readonly [number, number, number])[] = vultureLowExtents()

/**
 * The LOWEST point of a landed bird's POSED geometry below its origin (points
 * 202 + 217). The peck/bob feed animation applies TWO rotations to the bird:
 * a forward pitch AND its heading yaw (`bird.rotation.set(pitch, yaw, 0)` in
 * Wildlife.tsx). Point 202 modelled only the pitched HEAD as the deep end, but
 * the SPREAD WINGS reach far out in ±x, and under the pose a wing tip on the
 * descending side of the yaw swings well BELOW the head — the reported
 * wing-through-ground clip (point 217). So the depth is the min y of the whole
 * posed extent set (body, head, both wing tips), not the head alone. The y of a
 * local point under Euler XYZ (z = 0) is
 *   y' = sin(pitch)·sin(yaw)·x + cos(pitch)·y − sin(pitch)·cos(yaw)·z
 * — the `sin(pitch)·sin(yaw)·x` term is the wing-tip dip point 202 missed.
 * Floored at the body reach so a flat pose still clears the pecking body, and
 * scaled with the render scale. ONE shared rule for the kill flock and the
 * ground scavenger (point 128) — do not fork a second clearance path.
 */
export function landedBirdLowestDepth(pitch: number, yaw: number, scale: number): number {
  const s1 = Math.sin(pitch)
  const c1 = Math.cos(pitch)
  const s2 = Math.sin(yaw)
  const c2 = Math.cos(yaw)
  let minY = Infinity
  for (const [x, y, z] of VULTURE_LOW_EXTENTS) {
    const yp = s1 * s2 * x + c1 * y - s1 * c2 * z
    if (yp < minY) minY = yp
  }
  return Math.max(0.096, -minY) * scale
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

/** Pose-aware landed-bird y (points 202 + 217): the point-128 positive-only
 *  lift onto the HIGHEST ground under the bird's extents, plus a clearance
 *  derived from the posed geometry's lowest point — head AND spread wing tips
 *  under the pitch/yaw pose (never the flat hover) — plus the hop. */
export function landedBirdYPosed(
  groupBaseY: number,
  maxGroundUnder: number,
  hop: number,
  pitch: number,
  yaw: number,
  scale: number,
): number {
  const lift = Math.max(0, Math.max(0, maxGroundUnder) - groupBaseY)
  return lift + landedBirdLowestDepth(pitch, yaw, scale) + 0.06 + hop
}

/** The posed bird's LOWEST-POINT clearance above its own highest ground — the
 *  verify metric; by construction never below the 0.06 margin, and a group
 *  pre-lift bug (the point-185 double lift) still blows past any upper cap. The
 *  lowest point now includes the wing tips (point 217), so this is the wing-tip
 *  clearance, not merely the head's. */
export function landedBirdClearancePosed(
  groupBaseY: number,
  maxGroundUnder: number,
  hop: number,
  pitch: number,
  yaw: number,
  scale: number,
): number {
  return (
    groupBaseY +
    landedBirdYPosed(groupBaseY, maxGroundUnder, hop, pitch, yaw, scale) -
    landedBirdLowestDepth(pitch, yaw, scale) -
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
 * Streaming despawn verdict for one ground animal (design.md §19.4): judge
 * the animal by where it STANDS, never only by its birth chunk. Roamers and
 * fleers drift chunks away from where they spawned (elephant roam, flight,
 * water crossings), and a zoom-in collapses the despawn ring in one frame —
 * culling by birth-chunk membership deleted animals still in sight beside the
 * player (the sporadic mid-view vanish; its TRAA ghost read as scattered
 * body parts). Verdict:
 *  1. dead carcasses (they dissolve on screen) and untagged animals (e.g.
 *     injected by the verification) are always kept — unchanged;
 *  2. birth chunk still live — kept, no re-home;
 *  3. birth chunk gone but the chunk under its feet is live — kept AND
 *     re-homed there, so future culls judge it where it stands;
 *  4. outside every live chunk — kept while within the despawn ring of the
 *     player OR while the LIVE frustum shows it (`onScreen` projects through
 *     the real camera, never an assumed radius — the point-172 doctrine; this
 *     backstop covers the debug wide-zoom corner where the ring lies inside
 *     the frame);
 *  5. otherwise dropped.
 */
export function keepStreamedAnimal(
  a: { dead?: boolean; chunk?: string; x: number; z: number },
  liveChunkHas: (key: string) => boolean,
  chunkSize: number,
  playerX: number,
  playerZ: number,
  despawnR: number,
  onScreen: (x: number, z: number) => boolean,
): { keep: boolean; rehomeTo?: string } {
  if (a.dead || a.chunk === undefined) return { keep: true }
  if (liveChunkHas(a.chunk)) return { keep: true }
  const cur = `${Math.floor(a.x / chunkSize)},${Math.floor(a.z / chunkSize)}`
  if (liveChunkHas(cur)) return { keep: true, rehomeTo: cur }
  if (Math.hypot(a.x - playerX, a.z - playerZ) <= despawnR) return { keep: true }
  if (onScreen(a.x, a.z)) return { keep: true }
  return { keep: false }
}

/**
 * Which chunk keys must stay in the spawned-chunks set after a despawn pass
 * (design.md §19.4, point 278 — the dressing must NOT grow over a session).
 *
 * The streaming despawn frees a chunk key by DISTANCE alone, and `spawnChunk`
 * re-seeds a chunk deterministically whenever it re-enters the spawn ring. But
 * `keepStreamedAnimal` re-homes a roamer whose birth chunk despawned into the
 * live cell under its feet, so the roamer OUTLIVES its birth chunk's key. When
 * the player returns, that birth chunk re-seeds — a SECOND copy of the same
 * deterministic animals — while the re-homed original still lives. Over a
 * session of back-and-forth that duplicates ~one animal per re-home per round
 * trip: the instanced wildlife count (and its triangles) climbs without bound
 * at a fixed anchor, the point-276/278 regression.
 *
 * Root fix: a birth chunk's key is retained as long as ANY living animal still
 * originates there, so `spawnChunk` never re-seeds a chunk whose animals are
 * already alive. Distance still frees a chunk once its animals have genuinely
 * despawned. Returning to a fixed anchor therefore converges to a constant
 * count. Animals carry an immutable `origin` (their birth chunk); a legacy or
 * untagged animal falls back to its current `chunk`.
 */
export function retainedSpawnChunks(
  spawned: Iterable<string>,
  animals: Iterable<{ dead?: boolean; origin?: string; chunk?: string }>,
  despawned: (key: string) => boolean,
): Set<string> {
  const alive = new Set<string>()
  for (const a of animals) {
    const key = a.origin ?? a.chunk
    if (key !== undefined) alive.add(key)
  }
  const out = new Set<string>()
  for (const key of spawned) {
    // Keep a chunk in range as before; keep an out-of-range chunk only while it
    // still owns a living (re-homed) animal, so its respawn cannot duplicate.
    if (!despawned(key) || alive.has(key)) out.add(key)
  }
  return out
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
 * (the old raw step ran straight into the water and stuck). At a CONCAVE sea
 * pocket the whole ±90° deflection fan lands in water and the direct step
 * dead-ends — the calf froze at the waterline while its parent was eaten
 * (point 226, the user's Cairo coast). That is not a genuine dead-end: land
 * runs along the shore beyond the fan, so the flight falls back to the
 * point-188 escape corridor — the longest clear-LAND heading over the full
 * circle, biased away from the hunter, STICKY across frames (`corridor` in →
 * `corridor` out; re-picked only when its way ahead closes) so the choice
 * cannot flip-flop between the two along-shore corridors. Only when even the
 * corridor step dead-ends (water on every side) does the calf stand
 * (moved:false) for the catch to resolve — the "always resolves" rule. `dist`
 * stays CALF_FLEE_SPEED*dt (slower than the hunter, so the chase still ends);
 * the caller passes the water/ocean `blocked` predicate.
 */
export function calfFleeStep(
  cx: number,
  cz: number,
  hunterX: number,
  hunterZ: number,
  dist: number,
  blocked: (x: number, z: number) => boolean,
  lookahead = 0.8,
  corridor?: number,
): { x: number; z: number; heading: number; moved: boolean; corridor?: number } {
  const away = Math.atan2(cx - hunterX, cz - hunterZ)
  const direct = deflectedStep(cx, cz, away, dist, blocked, lookahead)
  if (direct.moved) return direct // open flight — the sticky corridor clears
  const probe = Math.max(dist, lookahead)
  let h = corridor
  if (h === undefined || blocked(cx + Math.sin(h) * probe, cz + Math.cos(h) * probe)) {
    // The outward weight scales with the probe stride so a short seaward stub
    // can never outscore a full-length along-shore corridor (with the default
    // stepLen 2 the predator walk-off's weight 8 keeps that margin; at the
    // calf's ~0.8 stride a fixed 8 would tie against 12·0.8 of clear land).
    h = escapeCorridorHeading(cx, cz, away, blocked, probe, 12, 16, probe * 4)
  }
  const step = deflectedStep(cx, cz, h, dist, blocked, lookahead)
  return { ...step, corridor: step.moved ? h : undefined }
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
 * The vicinity top-up's per-ATTEMPT rand seed (design.md §2.5, point 102): each
 * seeding attempt for a place draws a FRESH candidate set. The old frozen seed
 * `(worldSeed ^ placeHash) + 0x102` was rebuilt identically every frame, so the
 * seeder re-tested the SAME 14 bearings forever — and with a STATIC camera (an
 * idle player right after leaving a settlement: the travel camera mounts
 * already settled and nothing moves it) a frame whose candidates all landed
 * on-screen or on water deferred identically on every later frame, and the
 * vicinity guarantee stalled below its minimum (the point-249 WebGPU flake:
 * count pinned one short across a full 25 sim-second poll). Striding the
 * attempt index by a golden-ratio constant decorrelates consecutive attempts'
 * whole candidate sets, so the seeder EXPLORES the ring over successive frames;
 * every attempt stays reproducible, and attempt 0 is the historical seed.
 */
export function vicinityAttemptSeed(
  worldSeed: number,
  placeHash: number,
  attempt: number,
): number {
  return (((worldSeed ^ placeHash) + 0x102 + Math.imul(attempt, 0x9e3779b1)) >>> 0)
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
