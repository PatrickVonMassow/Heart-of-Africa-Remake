import { describe, expect, it } from 'vitest'
import {
  channelDriftStep,
  drinkCatchment,
  mireFate,
  mireRoll,
  vicinitySeedBounds,
  pickOffscreenLandAnchor,
  calvesForGroup,
  seasonFlowFactor,
  waterStruggleFate,
  blockHeading,
  fleeHeading,
  fleesFromPlayer,
  fleesPlayerNow,
  isInDrama,
  drinkExemptFromPlayerShy,
  resolveFleeTarget,
  fleeCrossing,
  type FleeArbitrationState,
  PLAYER_SHY_STRONG_WEAPON,
  FLIGHT_DESPAWN_OUT,
  FLIGHT_SPAWN_OUT,
  flightStep,
  segPointDist,
  gambolState,
  griefTarget,
  groundNormal,
  leashedGambolDir,
  separationPush,
  turnToward,
  type FlightState,
  killFlockMayDescend,
  killFlockActive,
  shouldMourn,
  mournDeadline,
  elephantStepAllowed,
  rescueSpeed,
  sheetAnchorY,
  wadeSpeed,
  waderStandY,
  PREY_WALK_SPEED,
  landedBirdY,
  landedBirdClearance,
  landedBirdLowestDepth,
  landedBirdYPosed,
  landedBirdClearancePosed,
  birdExtentOffsets,
  LANDED_BIRD_HOVER,
  CROCODILE_REGIONS,
  crocodileAllowedAt,
  crocodileLungeReady,
  crocodileGripExpired,
  crocodileHoldsCatch,
  grassFireEligible,
  ploverShouldLure,
  ploverLureHeading,
  ploverLureResolve,
  ploverTaken,
  vigilBlocksLanding,
  vigilDrawReady,
  ambientSavannaSpecies,
  claimedByAnotherDrama,
  offscreenRingSpawn,
  VULTURE_DESCEND_CLEAR_DIST,
  deflectedStep,
  escapeCorridorHeading,
  guardEngagement,
  crossingTarget,
  calfFleeStep,
  defendChance,
  killChance,
  parentAttackOutcome,
  parentDefends,
  PREDATOR_PREY,
  REGION_PREY,
} from './wildlifeBehavior'
import { balance } from '../../config/balance'

const dir = (h: number): [number, number] => [Math.sin(h), Math.cos(h)]

describe('fleeHeading (design.md §19 — stable prey escape)', () => {
  it('returns null when no threat is within range', () => {
    expect(fleeHeading(0, 0, [[10, 0]], 3)).toBeNull()
    expect(fleeHeading(0, 0, [], 3)).toBeNull()
  })

  it('the radius bound is exact: exactly at the radius is out of range, a hair inside is in (point 173)', () => {
    // Threat straight ahead at distance exactly 3 (== radius): `d >= radius`
    // excludes it, so no threat is in range.
    expect(fleeHeading(0, 0, [[0, 3]], 3)).toBeNull()
    // The same threat a hair closer must be in range.
    expect(fleeHeading(0, 0, [[0, 3 - 1e-6]], 3)).not.toBeNull()
  })

  it('a coincident threat (d < 1e-4) is skipped, while d === 1e-4 itself counts', () => {
    // Exactly on top of the animal: skipped (division by ~0 avoided) — with
    // no other threat in range, the result is null.
    expect(fleeHeading(0, 0, [[0, 0]], 3)).toBeNull()
    expect(fleeHeading(0, 0, [[0, 5e-5]], 3)).toBeNull()
    // At exactly the 1e-4 cutoff the threat is NOT skipped (`d < 1e-4` is
    // strict), so it must be picked up as a valid, in-range threat.
    expect(fleeHeading(0, 0, [[0, 1e-4]], 3)).not.toBeNull()
  })

  it('flees directly away from a single threat', () => {
    // Threat ahead at +z; the animal should flee toward -z (heading π).
    const h = fleeHeading(0, 0, [[0, 2]], 3)
    expect(h).not.toBeNull()
    const [sx, sz] = dir(h as number)
    expect(sx).toBeCloseTo(0, 5)
    expect(sz).toBeCloseTo(-1, 5)
  })

  it('flees the resultant of two flanking threats, moving away from both', () => {
    // Two elephants ~90° apart, both at +x (one at +z, one at -z): the escape
    // heading must point in -x (away from both), not toward either one.
    const threats: [number, number][] = [
      [2, 2],
      [2, -2],
    ]
    const h = fleeHeading(0, 0, threats, 5) as number
    const [sx, sz] = dir(h)
    expect(sx).toBeCloseTo(-1, 2) // moves in -x
    expect(sz).toBeCloseTo(0, 2)
    // A step along the heading increases the distance to BOTH threats.
    const step = 0.5
    for (const [tx, tz] of threats) {
      const before = Math.hypot(0 - tx, 0 - tz)
      const after = Math.hypot(sx * step - tx, sz * step - tz)
      expect(after).toBeGreaterThan(before)
    }
  })

  it('falls back to a single threat when the repulsion cancels out exactly', () => {
    // Two threats exactly opposite at equal distance: the summed vector is zero,
    // so it must still bolt (toward the first-seen one's away side), not freeze
    // on a NaN heading.
    const h = fleeHeading(0, 0, [[0, 1], [0, -1]], 5)
    expect(h).not.toBeNull()
    expect(Number.isNaN(h as number)).toBe(false)
    const [, sz] = dir(h as number)
    expect(sz).toBeLessThan(0) // away from the +z threat seen first
  })

  it('stays stable (no oscillation) as the animal moves away from flankers', () => {
    // Reproduces the reported symptom setup: a prey straddled by two elephants.
    // Walking along the escape heading and recomputing each step must yield a
    // heading that barely changes and never reverses — the old nearest-threat
    // pick would flip ~90° here.
    const threats: [number, number][] = [
      [3, 1.4],
      [3, -1.8],
    ]
    let x = 0
    let z = 0
    let prev = fleeHeading(x, z, threats, 5) as number
    let maxDelta = 0
    let reversals = 0
    let prevDelta = 0
    for (let i = 0; i < 40; i++) {
      const h = fleeHeading(x, z, threats, 5)
      if (h === null) break // fled out of range — fine
      let d = h - prev
      while (d > Math.PI) d -= Math.PI * 2
      while (d < -Math.PI) d += Math.PI * 2
      maxDelta = Math.max(maxDelta, Math.abs(d))
      if (i > 0 && d * prevDelta < -1e-6) reversals++
      prevDelta = d
      prev = h
      const [sx, sz] = dir(h)
      x += sx * 0.2
      z += sz * 0.2
    }
    expect(maxDelta).toBeLessThan(0.35) // no ~90° snap
    expect(reversals).toBeLessThanOrEqual(1)
  })
})

describe('fleesFromPlayer (design.md §19 — small/weak animals shy from the traveller)', () => {
  const W = balance.parentDefense.preyWeapon

  it('weak/prey adults flee the traveller', () => {
    for (const sp of ['antelope', 'zebra', 'wildebeest', 'warthog']) {
      expect(fleesFromPlayer(sp, false, W), sp).toBe(true)
    }
    // The one weak bird without a weapon entry flies off.
    expect(fleesFromPlayer('flamingo', false, W)).toBe(true)
  })

  it('apex/strong adults never flee the traveller', () => {
    // The §14.1 predators, the elephant and the armoured crocodile stand; the
    // giraffe's 1.5 weapon reaches the strong bar (a lion-killing kick is
    // nothing to flee a human over).
    for (const sp of ['lion', 'leopard', 'hyena', 'cheetah', 'elephant', 'crocodile', 'giraffe']) {
      expect(fleesFromPlayer(sp, false, W), sp).toBe(false)
    }
    // The adult plover keeps the broken-wing lure (point 145b) as its own
    // answer to the approaching traveller — it never simply bolts.
    expect(fleesFromPlayer('plover', false, W)).toBe(false)
    // The weak-tier bar itself sits at the giraffe's weapon strength.
    expect(W.giraffe).toBeGreaterThanOrEqual(PLAYER_SHY_STRONG_WEAPON)
    expect(W.zebra).toBeLessThan(PLAYER_SHY_STRONG_WEAPON)
  })

  it('ANY juvenile flees — including mid-/high-ranked species', () => {
    // A calf, foal, chick or cub is vulnerable whatever its adults' rank: the
    // giraffe calf (mid-rank), the lion cub and the plover chick all bolt.
    for (const sp of ['giraffe', 'lion', 'plover', 'zebra', 'elephant']) {
      expect(fleesFromPlayer(sp, true, W), sp).toBe(true)
    }
  })

  it('the flee heading is the steady summed escape — same machinery, no oscillation', () => {
    // The traveller as the single fleeHeading threat (exactly how the scene
    // feeds it): walking along the recomputed escape heading never reverses
    // it — the held-heading behaviour the elephant dodge already pins.
    const player: [number, number][] = [[0, 0]]
    let x = 0.6
    let z = 0.25
    let prev: number | null = null
    let maxDelta = 0
    let steps = 0
    for (let i = 0; i < 200; i++) {
      const h = fleeHeading(x, z, player, 9)
      if (h === null) break // fled out of the ring — done
      if (prev !== null) {
        let d = h - prev
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        maxDelta = Math.max(maxDelta, Math.abs(d))
      }
      prev = h
      const [sx, sz] = dir(h)
      x += sx * 0.07
      z += sz * 0.07
      steps++
    }
    expect(steps).toBeGreaterThan(20) // the flight genuinely ran
    expect(maxDelta).toBeLessThan(0.05) // a radial escape never wavers
    // And it ends AWAY from the traveller: further out than it started.
    expect(Math.hypot(x, z)).toBeGreaterThan(Math.hypot(0.6, 0.25) + 1)
  })
})

describe('isInDrama (point 252 — a hunt/drama state outranks the player-shy flee)', () => {
  it('is false for an idle/roaming animal (no drama flag set)', () => {
    expect(isInDrama({})).toBe(false)
  })

  it('is true for every scripted §19.8 drama / hunt state', () => {
    // caught/gripped (lion or crocodile), the grass fire, the water dramas, the
    // surrender/grief drives, the parent defence, and being hunted.
    expect(isInDrama({ caught: 0 })).toBe(true) // seized — a zero timer still counts
    expect(isInDrama({ fireTrapped: 3 })).toBe(true)
    expect(isInDrama({ inWater: 1.2 })).toBe(true)
    expect(isInDrama({ rescued: true })).toBe(true)
    expect(isInDrama({ mired: 0 })).toBe(true)
    expect(isInDrama({ crossing: { tx: 0, tz: 0, time: 0 } })).toBe(true)
    expect(isInDrama({ vigil: { x: 0, z: 0 } })).toBe(true)
    expect(isInDrama({ kick: 0.4 })).toBe(true)
    expect(isInDrama({ plungeTo: { x: 0, z: 0 } })).toBe(true)
    expect(isInDrama({ trampleTo: { x: 0, z: 0 } })).toBe(true)
    expect(isInDrama({ defending: true })).toBe(true)
    expect(isInDrama({ isLionVictim: true })).toBe(true)
    expect(isInDrama({ isHunted: true })).toBe(true)
  })
})

describe('fleesPlayerNow (point 252 — player-shy flee only in an idle state)', () => {
  const W = balance.parentDefense.preyWeapon

  it('a free weak/prey adult flees the traveller, and so does a free juvenile', () => {
    // No drama flag set: the point-238/239 shyness applies as before.
    expect(fleesPlayerNow('antelope', false, W, {})).toBe(true)
    expect(fleesPlayerNow('zebra', true, W, {})).toBe(true)
  })

  it('does NOT flee the traveller while in any drama / hunt state', () => {
    // A predator/drama state outranks the player-shy flee (predator > player-flee
    // > idle): the animal keeps its drama behaviour regardless of proximity.
    const states = [
      { caught: 0 },
      { fireTrapped: 2 },
      { inWater: 0.5 },
      { rescued: true },
      { mired: 0 },
      { crossing: { tx: 1, tz: 1, time: 0 } },
      { vigil: { x: 0, z: 0 } },
      { kick: 0.3 },
      { plungeTo: { x: 0, z: 0 } },
      { trampleTo: { x: 0, z: 0 } },
      { defending: true },
      { isLionVictim: true },
      { isHunted: true },
    ]
    for (const s of states) {
      expect(fleesPlayerNow('antelope', false, W, s), JSON.stringify(s)).toBe(false)
      expect(fleesPlayerNow('zebra', true, W, s), JSON.stringify(s)).toBe(false)
    }
  })

  it('a strong adult never flees regardless of state (unchanged from fleesFromPlayer)', () => {
    expect(fleesPlayerNow('lion', false, W, {})).toBe(false)
    expect(fleesPlayerNow('giraffe', false, W, {})).toBe(false)
  })

  it('a hunted prey within the player-shy radius keeps its predator-flee heading, not the player-flee', () => {
    // The scene layout the bug report hit: the lion behind the prey, the
    // traveller off to one side, both inside the shy radius. Because the prey is
    // hunted (isHunted / the designated victim), the player-flee is suppressed —
    // so the animal keeps the LION-flee heading (away from the predator) and the
    // hunt resolves instead of stalling next to the idle prey.
    const ax = 0
    const az = 0
    const lion: [number, number][] = [[0, -4]] // predator directly behind (−z)
    const player: [number, number][] = [[4, 0]] // traveller off to the +x side
    const radius = 9
    // The predator-flee heading (the 3411 block): straight away from the lion.
    const lionFlee = fleeHeading(ax, az, lion, radius)
    expect(lionFlee).not.toBeNull()
    // Gated player-flee (the site's pTarget decision): null while hunted.
    const hunted = { isHunted: true }
    const pTarget = fleesPlayerNow('antelope', false, W, hunted)
      ? fleeHeading(ax, az, player, radius)
      : null
    expect(pTarget).toBeNull()
    // So the heading the animal keeps is the lion-flee — pointing away from the
    // predator (+z), NOT away from the player (−x).
    const [lsx, lsz] = dir(lionFlee as number)
    expect(lsz).toBeGreaterThan(0.9) // away from the lion, up the +z axis
    expect(lsx).toBeCloseTo(0, 5) // and NOT deflected toward −x by the player
  })
})

describe('drinkExemptFromPlayerShy (point 247 — the drinker exemption narrowed to the staged bank victims)', () => {
  it('a non-drinker is never exempt, whatever the other flags say', () => {
    expect(drinkExemptFromPlayerShy(true, false, false)).toBe(false)
    expect(drinkExemptFromPlayerShy(false, false, true)).toBe(false)
  })

  it('a staged §19.16 bank victim keeps its stand — juvenile or adult', () => {
    // The crocodile's lunge target / a drinker inside a lurking crocodile's
    // strike radius: fleeing there would starve the ambush drama the
    // exemption exists to protect.
    expect(drinkExemptFromPlayerShy(true, true, true)).toBe(true)
    expect(drinkExemptFromPlayerShy(false, true, true)).toBe(true)
  })

  it('a PLAIN drinking juvenile is NOT exempt — it flees the close traveller (the reported bug)', () => {
    expect(drinkExemptFromPlayerShy(true, true, false)).toBe(false)
  })

  it('an adult keeps its whole bank errand (and stays in the ambush pool)', () => {
    expect(drinkExemptFromPlayerShy(false, true, false)).toBe(true)
  })
})

describe('resolveFleeTarget (point 252 — ONE arbitration point for every co-active threat)', () => {
  const W = balance.parentDefense.preyWeapon
  // The rings/speeds mirror Wildlife.tsx: PREY_PANIC_RADIUS 3.2, PLAYER_SHY_
  // RADIUS 6, the PREY_PANIC_EXIT 1.5 hysteresis, PREY_DODGE_TURN 8 rad/s.
  const free = (over: Partial<FleeArbitrationState> = {}): FleeArbitrationState => ({
    species: 'antelope',
    isJuvenile: false,
    preyWeapon: W,
    drama: {},
    drinking: false,
    stagedBankVictim: false,
    ...over,
  })

  it('a free weak prey inside the shy ring flees the PLAYER — heading straight away', () => {
    const pick = resolveFleeTarget(0, 0, free(), [], [[0, -4]], 3.2, 6)
    expect(pick).not.toBeNull()
    expect(pick!.source).toBe('player')
    const [, sz] = dir(pick!.heading)
    expect(sz).toBeGreaterThan(0.9) // away from the traveller at −z
  })

  it('threatened by BOTH a predator and the player, the prey flees the PREDATOR — the resolver yields nothing', () => {
    // The predator flee runs its own urgency-scaled block and reaches the
    // resolver flagged isHunted: the player-shy flee must stay silent so the
    // hunt keeps its own heading and always resolves (the lion victim too).
    expect(resolveFleeTarget(0, 0, free({ drama: { isHunted: true } }), [], [[0, -2]], 3.2, 6)).toBeNull()
    expect(resolveFleeTarget(0, 0, free({ drama: { isLionVictim: true } }), [], [[0, -2]], 3.2, 6)).toBeNull()
  })

  it('EVERY drama state silences the player-shy flee — incl. the flags the old call sites omitted', () => {
    // The pre-252 hand-built DramaState objects left out vigil/kick/plunge/
    // trample/defending; the one dramaStateOf builder now feeds them all.
    const dramas = [
      { caught: 0 },
      { fireTrapped: 2 },
      { inWater: 0.5 },
      { rescued: true },
      { mired: 0 },
      { crossing: { tx: 1, tz: 1, time: 0 } },
      { vigil: { x: 0, z: 0 } },
      { kick: 0.3 },
      { plungeTo: { x: 0, z: 0 } },
      { trampleTo: { x: 0, z: 0 } },
      { defending: true },
    ]
    for (const drama of dramas) {
      expect(resolveFleeTarget(0, 0, free({ drama }), [], [[0, -2]], 3.2, 6), JSON.stringify(drama)).toBeNull()
    }
  })

  it('the elephant dart outranks the player-shy flee — one source, the pure elephant heading, no blend', () => {
    const elephants: [number, number][] = [[-2.5, 0]]
    const player: [number, number][] = [[0, -4]]
    const pick = resolveFleeTarget(0, 0, free(), elephants, player, 3.2, 6)
    expect(pick).not.toBeNull()
    expect(pick!.source).toBe('elephant')
    // The heading is EXACTLY the elephant escape — an equal-weight blend of two
    // opposing sources would have a cancellation point (the leash lesson).
    expect(pick!.heading).toBe(fleeHeading(0, 0, elephants, 3.2) as number)
  })

  it('the elephant dart stays live even for a hunted prey (boxed between lion and herd)', () => {
    const pick = resolveFleeTarget(0, 0, free({ drama: { isHunted: true } }), [[-2.5, 0]], [[0, -4]], 3.2, 6)
    expect(pick).not.toBeNull()
    expect(pick!.source).toBe('elephant')
  })

  it('the staged bank drinker stands its ground; a plain drinking juvenile flees (point 247)', () => {
    const juv = free({ species: 'zebra', isJuvenile: true, drinking: true })
    // Bound into the staged §19.16 drama: no player-shy target.
    expect(resolveFleeTarget(0, 0, { ...juv, stagedBankVictim: true }, [], [[0, -2]], 3.2, 6)).toBeNull()
    // A PLAIN drinking juvenile with the traveller close: it bolts.
    const pick = resolveFleeTarget(0, 0, juv, [], [[0, -2]], 3.2, 6)
    expect(pick).not.toBeNull()
    expect(pick!.source).toBe('player')
    // An adult drinker keeps its errand either way.
    expect(resolveFleeTarget(0, 0, free({ drinking: true }), [], [[0, -2]], 3.2, 6)).toBeNull()
  })

  it('a strong free adult yields no player target — but still darts from a close elephant', () => {
    expect(resolveFleeTarget(0, 0, free({ species: 'giraffe' }), [], [[0, -2]], 3.2, 6)).toBeNull()
    const pick = resolveFleeTarget(0, 0, free({ species: 'giraffe' }), [[-2.5, 0]], [[0, -2]], 3.2, 6)
    expect(pick).not.toBeNull()
    expect(pick!.source).toBe('elephant')
  })

  it('out of every ring the resolver is silent — idle', () => {
    expect(resolveFleeTarget(0, 0, free(), [[-10, 0]], [[0, -10]], 3.2, 6)).toBeNull()
  })

  it('the held heading turns smoothly across a source hand-over — no flip (the point-237 rule ACROSS the arbitration)', () => {
    // Drive the exact call-site loop: elephant to the west, traveller to the
    // south, the resolved target fed into the held dodgeHeading via the capped
    // turnToward under the hysteresis rings. The dart ends as the animal
    // outruns the elephant ring and HANDS OVER to the player flight — the
    // sources must switch exactly once (never alternate) and the held heading
    // must never jump more than the per-frame turn cap.
    const dt = 1 / 60
    const cap = 8 * dt // PREY_DODGE_TURN · dt
    const elephants: [number, number][] = [[-2.5, 0]]
    const player: [number, number][] = [[0, -5]]
    let x = 0
    let z = 0
    let held: number | undefined
    const sources: string[] = []
    let maxDelta = 0
    for (let i = 0; i < 600; i++) {
      const engaged = held !== undefined
      const ring = engaged ? 3.2 * 1.5 : 3.2
      const shyRing = engaged ? 6 * 1.5 : 6
      const pick = resolveFleeTarget(x, z, free(), elephants, player, ring, shyRing)
      if (pick === null) break // fled clear of both rings — the flight resolved
      if (sources[sources.length - 1] !== pick.source) sources.push(pick.source)
      const prev = held
      held = held === undefined ? pick.heading : turnToward(held, pick.heading, cap)
      if (prev !== undefined) {
        let d = held - prev
        while (d > Math.PI) d -= Math.PI * 2
        while (d < -Math.PI) d += Math.PI * 2
        maxDelta = Math.max(maxDelta, Math.abs(d))
      }
      x += Math.sin(held) * 4.2 * dt // PLAYER_SHY_SPEED-class step
      z += Math.cos(held) * 4.2 * dt
    }
    expect(sources).toEqual(['elephant', 'player']) // one hand-over, no flip-flop
    expect(maxDelta).toBeLessThanOrEqual(cap + 1e-9) // capped turn — never a snap
  })
})

describe('fleeCrossing (point 248 — a boxed flight takes to the water like the predator-flee)', () => {
  // Fake terrain along +z: water for z in (0, 3], land beyond — the
  // crossingTarget fixture shape.
  const riverThenLand = (_x: number, z: number) => (z > 0 && z <= 3 ? 'water' : 'savanna')

  it('a player-boxed shy flee (deflected step dead-ended) triggers a crossing to the far bank', () => {
    // The call-site pattern: the shy step fans against a water cove and cannot
    // move; fleeCrossing then finds the far bank along the held heading — the
    // animal crosses instead of pinning at the waterline.
    const cove = () => true // every probe wet — the dead-ended fan
    const step = deflectedStep(0, 0, 0, 0.07, cove, 0.8)
    expect(step.moved).toBe(false)
    const esc = fleeCrossing(step.moved, false, 0, 0, 0, 6, riverThenLand)
    expect(esc).not.toBeNull()
    expect(esc!.tz).toBeGreaterThan(3) // past the channel, on land
  })

  it('still refuses the ocean and an over-wide channel — the point-192 rules are unchanged', () => {
    const toSea = (_x: number, z: number) => (z > 0 && z <= 2 ? 'water' : 'ocean')
    expect(fleeCrossing(false, false, 0, 0, 0, 6, toSea)).toBeNull()
    const wide = (_x: number, z: number) => (z > 0 && z <= 9 ? 'water' : 'savanna')
    expect(fleeCrossing(false, false, 0, 0, 0, 6, wide)).toBeNull()
  })

  it('a step that MOVED, or an animal already mid-crossing, starts no crossing', () => {
    expect(fleeCrossing(true, false, 0, 0, 0, 6, riverThenLand)).toBeNull()
    expect(fleeCrossing(false, true, 0, 0, 0, 6, riverThenLand)).toBeNull()
  })
})

describe('blockHeading (design.md §19 — the parent shields its hunted calf)', () => {
  it('heads for the station between the calf and the predator', () => {
    // Parent at origin, calf at (-4,0), predator at (5,0): the station lies at
    // calf + 1.8·(1,0) = (-2.2, 0) — between the two, on the escape line.
    const h = blockHeading(0, 0, -4, 0, 5, 0, 1.8)
    expect(h).not.toBeNull()
    const [sx, sz] = dir(h as number)
    expect(sx).toBeLessThan(-0.9) // toward -x: back to the station
    expect(Math.abs(sz)).toBeLessThan(0.1)
  })

  it('holds (null) once on station', () => {
    // Station for calf (0,0), predator (6,0), offset 1.8 sits at (1.8, 0).
    expect(blockHeading(1.8, 0, 0, 0, 6, 0, 1.8)).toBeNull()
    expect(blockHeading(1.9, 0.1, 0, 0, 6, 0, 1.8)).toBeNull() // within the eps
    expect(blockHeading(4, 0, 0, 0, 6, 0, 1.8)).not.toBeNull() // off station
  })

  it('holds in the degenerate case of the predator on the calf', () => {
    expect(blockHeading(3, 3, 4, 3, 4, 3, 1.8)).toBeNull()
  })

  it('the shield stays between hunter and calf, and the hunter takes it first', () => {
    // Mini-simulation of the chase contract; the numbers mirror Wildlife.tsx
    // (HUNT_LION_SPEED 5.6, CALF_FLEE_SPEED 3.8, the burst-derived shield
    // speed rescueSpeed(balance.family.rescueBurst) — point 127,
    // PARENT_BLOCK_OFFSET 1.8, PARENT_TAKE_DIST 1.0, CALF_CATCH_DIST 0.9).
    // The parent holding its blocking station must be reached by the hunter
    // (taken in the calf's place) before the hunter ever reaches the calf.
    const shieldSpeed = rescueSpeed(balance.family.rescueBurst)
    expect(shieldSpeed).toBeGreaterThan(5.6) // the hunter must be able to meet the shield
    const calf = { x: 0, z: 0 }
    const parent = { x: 1.8, z: 0 }
    const pred = { x: 12, z: 0 }
    const dt = 1 / 60
    let taken = false
    let caught = false
    let betweenSamples = 0
    let samples = 0
    for (let i = 0; i < 60 * 30 && !taken && !caught; i++) {
      const toCalf = Math.atan2(calf.x - pred.x, calf.z - pred.z)
      pred.x += Math.sin(toCalf) * 5.6 * dt
      pred.z += Math.cos(toCalf) * 5.6 * dt
      if (Math.hypot(pred.x - calf.x, pred.z - calf.z) < 0.9) {
        caught = true
        break
      }
      const away = Math.atan2(calf.x - pred.x, calf.z - pred.z)
      calf.x += Math.sin(away) * 3.8 * dt
      calf.z += Math.cos(away) * 3.8 * dt
      const h = blockHeading(parent.x, parent.z, calf.x, calf.z, pred.x, pred.z, 1.8)
      if (h !== null) {
        parent.x += Math.sin(h) * shieldSpeed * dt
        parent.z += Math.cos(h) * shieldSpeed * dt
      }
      samples++
      const dPredParent = Math.hypot(pred.x - parent.x, pred.z - parent.z)
      const dPredCalf = Math.hypot(pred.x - calf.x, pred.z - calf.z)
      if (dPredParent < dPredCalf && Math.hypot(parent.x - calf.x, parent.z - calf.z) < 4) betweenSamples++
      if (dPredParent < 1.0) taken = true
    }
    expect(taken).toBe(true) // the hunter meets the shield…
    expect(caught).toBe(false) // …never the calf
    expect(betweenSamples / samples).toBeGreaterThan(0.8) // the shield held its line
  })
})

describe('the broken-wing lure (design.md §19.8, point 145b — the sacrifice that is a lie)', () => {
  it('the act starts only when a threat is close to the NEST', () => {
    expect(ploverShouldLure(9.9)).toBe(true)
    expect(ploverShouldLure(10)).toBe(false)
    expect(ploverShouldLure(50)).toBe(false)
  })

  it('the drag heading leads away from the nest, off to the chosen side of the threat axis', () => {
    // Threat south of the nest: the base axis points north; the sides split it.
    const left = ploverLureHeading(0, 0, 0, -10, 1)
    const right = ploverLureHeading(0, 0, 0, -10, -1)
    expect(left).not.toBeCloseTo(right, 5)
    // Both headings move AWAY from the threat (positive z component).
    expect(Math.cos(left)).toBeGreaterThan(0)
    expect(Math.cos(right)).toBeGreaterThan(0)
  })

  it('the act always resolves: past the safe distance or past its time it returns home', () => {
    expect(ploverLureResolve(0, 5)).toBe('keep')
    expect(ploverLureResolve(11.9, 5)).toBe('keep')
    expect(ploverLureResolve(12, 5)).toBe('return') // the act ran its time
    expect(ploverLureResolve(0, 18)).toBe('return') // the threat is drawn far enough
    expect(ploverLureResolve(0, 17.9)).toBe('keep')
  })

  it('the lie sometimes fails — but only a predator can take the actor, never the traveller', () => {
    expect(ploverTaken(0.1, true)).toBe(true) // inside the chance band, predator near
    expect(ploverTaken(0.15, true)).toBe(false) // boundary: at the chance it escapes
    expect(ploverTaken(0.99, true)).toBe(false)
    expect(ploverTaken(0.0, false)).toBe(false) // no predator: it always escapes
  })
})

describe('grassFireEligible (design.md §19.8/§19.13, point 145a — the burning of the steppe)', () => {
  it('burns only in the cured-grass zones, dry season only', () => {
    expect(grassFireEligible('sahel', 0.0)).toBe(true)
    expect(grassFireEligible('congo-north', 0.1)).toBe(true)
    expect(grassFireEligible('sahel', 0.15)).toBe(false) // the rains wet the grass
    expect(grassFireEligible('sahel', 0.8)).toBe(false)
  })

  it('never in the Congo (no cured grass), never in a rainless desert (no grass at all)', () => {
    expect(grassFireEligible('congo', 0.0)).toBe(false)
    expect(grassFireEligible('atlantic-equatorial', 0.0)).toBe(false)
    expect(grassFireEligible('sahara-north', 0.0)).toBe(false)
    expect(grassFireEligible('sahara-south', 0.0)).toBe(false)
    expect(grassFireEligible('mediterranean', 0.0)).toBe(false)
  })
})

describe('crocodile placement and ambush trigger (design.md §19.16, point 130)', () => {
  it('a crocodile exists only in river/lake water — never on any land type or the ocean', () => {
    expect(crocodileAllowedAt('water')).toBe(true)
    for (const t of ['ocean', 'coast', 'desert', 'savanna', 'jungle', 'mountain']) {
      expect(crocodileAllowedAt(t)).toBe(false)
    }
  })

  it('every region carries crocodile water ~1890 — the region list is complete', () => {
    // The Nile (north/east), Niger and Senegal (west), Congo (central), the
    // eastern lakes and the Zambezi south: all five regions hold home rivers.
    expect([...CROCODILE_REGIONS].sort()).toEqual(['central', 'east', 'north', 'south', 'west'])
  })

  it('the lunge fires only on a bank visitor inside the strike radius', () => {
    expect(crocodileLungeReady(4, true, 5)).toBe(true)
    expect(crocodileLungeReady(5, true, 5)).toBe(true) // boundary inclusive
    expect(crocodileLungeReady(5.01, true, 5)).toBe(false)
    expect(crocodileLungeReady(2, false, 5)).toBe(false) // nobody at the bank — it waits
  })

  it('the gripped lunge expires after gripSeconds so a vanished victim never pins it (point 186)', () => {
    expect(crocodileGripExpired(4, 8)).toBe(false) // mid-grip, well within the window
    expect(crocodileGripExpired(8, 8)).toBe(false) // boundary: not yet expired
    expect(crocodileGripExpired(8.01, 8)).toBe(true) // past the window — release the crocodile
    // Above the ~5 s caught window, so a normal kill (which ends via the victim's
    // caught-countdown) is never cut short by the deadline.
    expect(crocodileGripExpired(5, 8)).toBe(false)
  })

  it('nothing ever kills a crocodile: killChance is structurally zero for every prey (like the lion)', () => {
    for (const prey of Object.keys(balance.parentDefense.preyWeapon)) {
      for (const roll of [0, 0.001, 0.5, 0.999]) {
        expect(parentAttackOutcome(prey, 'crocodile', roll, balance.parentDefense)).not.toBe('kill')
      }
    }
  })

  it('a strong parent can still drive a crocodile off its victim — kill <= driveOff holds', () => {
    const pd = balance.parentDefense
    expect(pd.predatorFlight.crocodile).toBeGreaterThan(0)
    expect(defendChance('giraffe', 'crocodile', pd)).toBeGreaterThan(defendChance('antelope', 'crocodile', pd))
    expect(killChance('giraffe', 'crocodile', pd)).toBe(0)
  })
})

// The crocodile stays COUPLED to its catch (design.md §19.16, point 250): the
// reported bug was a snapped catch after which the croc swam away while the prey
// still dissolved on its own — the removal was decoupled from the croc. A
// gripping crocodile must hold its victim through the whole struggle window AND
// the sink that follows the kill (the river keeps the body), so the prey's
// dissolve is DRIVEN BY the croc's feed. It may only slink home / idle once the
// catch is fully resolved.
describe('crocodileHoldsCatch — the croc holds its catch until resolved (point 250)', () => {
  it('an ungripped croc (mid-burst, no catch) holds nothing', () => {
    // The burst run toward a live victim is governed elsewhere; this predicate
    // only gates the grip, so without a grip there is nothing to hold.
    expect(crocodileHoldsCatch(false, 5, false, undefined)).toBe(false)
    expect(crocodileHoldsCatch(false, undefined, true, 9)).toBe(false)
  })

  it('holds through the STRUGGLE window while the victim is still caught', () => {
    expect(crocodileHoldsCatch(true, 5, false, undefined)).toBe(true) // just seized
    expect(crocodileHoldsCatch(true, 0.1, false, undefined)).toBe(true) // window nearly out
  })

  it('holds through the SINK: a killed body dissolving in the water keeps the croc coupled', () => {
    // caught cleared, the body is dead and dissolving — the croc drags it under
    // (no bank carcass); it must NOT swim off and leave the prey to dissolve alone.
    expect(crocodileHoldsCatch(true, undefined, true, 9)).toBe(true)
    expect(crocodileHoldsCatch(true, undefined, true, 0.01)).toBe(true) // still sinking
  })

  it('releases only once the catch is fully resolved — body gone, or the victim freed', () => {
    expect(crocodileHoldsCatch(true, undefined, true, 0)).toBe(false) // body fully dissolved
    expect(crocodileHoldsCatch(true, undefined, true, undefined)).toBe(false) // body removed (gone)
    // Driven off (point 130): the parent freed the victim — caught cleared, not
    // dead. The grip's own retreat flag then sends the croc home; the hold is
    // over here too.
    expect(crocodileHoldsCatch(true, undefined, false, undefined)).toBe(false)
  })

  it('the struggle-to-sink-to-done timeline stays continuously coupled, never a gap', () => {
    // Walk the victim state as a real kill runs: seized -> struggling -> killed &
    // sinking -> gone. The croc is held at every step until the body is gone, so
    // there is no frame where it is released while the prey still exists.
    const timeline: Array<[number | undefined, boolean, number | undefined, boolean]> = [
      [5, false, undefined, true], // seized, struggling
      [1, false, undefined, true], // still struggling
      [undefined, true, 9, true], // killed, body begins to sink
      [undefined, true, 3, true], // sinking
      [undefined, true, 0, false], // fully dissolved — released
    ]
    for (const [caught, dead, dissolve, held] of timeline) {
      expect(crocodileHoldsCatch(true, caught, dead, dissolve), `${caught}/${dead}/${dissolve}`).toBe(held)
    }
  })
})

describe('landedBirdY / landedBirdClearance (point 128 — a landed vulture stands on its own ground)', () => {
  it('flat ground lifts nothing: the bird rests at hover + hop over the base', () => {
    expect(landedBirdY(2, 2, 0)).toBe(LANDED_BIRD_HOVER)
    expect(landedBirdY(2, 2, 0.1)).toBeCloseTo(LANDED_BIRD_HOVER + 0.1, 9)
  })

  it('rising ground lifts by exactly the rise', () => {
    expect(landedBirdY(2, 2.7, 0)).toBeCloseTo(0.7 + LANDED_BIRD_HOVER, 9)
    expect(landedBirdY(0, 1.5, 0)).toBeCloseTo(1.5 + LANDED_BIRD_HOVER, 9)
  })

  it('falling ground never pulls a bird DOWN (positive-only)', () => {
    expect(landedBirdY(2, 1.2, 0)).toBe(LANDED_BIRD_HOVER)
    expect(landedBirdY(2, -5, 0)).toBe(LANDED_BIRD_HOVER)
  })

  it('the hover clears the vulture body sphere reach (~0.096 below origin, buildVulture)', () => {
    expect(LANDED_BIRD_HOVER).toBeGreaterThan(0.096)
  })

  it('the clearance above the bird OWN ground is never below the hover — on any slope', () => {
    for (const base of [0, 0.5, 2, 7]) {
      for (const ground of [0, 0.2, base - 0.4, base, base + 0.3, base + 1.8]) {
        expect(landedBirdClearance(base, ground, 0)).toBeGreaterThanOrEqual(LANDED_BIRD_HOVER - 1e-9)
      }
    }
  })
})

describe('crossingTarget (point 192 — animals may cross rivers/lakes, never the ocean)', () => {
  // Fake terrain along +z: water for z in (0, 3], land beyond.
  const riverThenLand = (_x: number, z: number) => (z > 0 && z <= 3 ? 'water' : 'savanna')

  it('finds the far bank across a swimmable channel', () => {
    const t = crossingTarget(0, 0, 0, 6, riverThenLand) // heading 0 = +z
    expect(t).not.toBeNull()
    expect(t!.tz).toBeGreaterThan(3) // past the water, on land
  })

  it('refuses when the channel is wider than the swim reach', () => {
    const wide = (_x: number, z: number) => (z > 0 && z <= 9 ? 'water' : 'savanna')
    expect(crossingTarget(0, 0, 0, 6, wide)).toBeNull()
  })

  it('refuses the OCEAN anywhere on the line — the sea stays absolute', () => {
    const toSea = (_x: number, z: number) => (z > 0 && z <= 2 ? 'water' : 'ocean')
    expect(crossingTarget(0, 0, 0, 6, toSea)).toBeNull()
  })

  it('a heading over dry land crosses nothing (first step is the bank already)', () => {
    const t = crossingTarget(0, 0, Math.PI, 6, riverThenLand) // heading away from the water
    expect(t).not.toBeNull()
    expect(Math.hypot(t!.tx, t!.tz)).toBeLessThanOrEqual(1.01) // immediate land
  })
})

describe('guardEngagement (point 191 — a passing hunt is guarded only while it closes in)', () => {
  it('engages while the lion closes on the calf inside the radius', () => {
    let min: number | null = null
    for (const d of [11, 9, 7, 5]) {
      const r = guardEngagement(d, min, 12)
      expect(r.engaged).toBe(true)
      min = r.minSeen
    }
  })

  it('releases once the lion has receded past the slack — the pair never follows the hunt', () => {
    let min: number | null = null
    // Approach to closest 5, then recede: engaged until 5 + 0.8 is exceeded.
    for (const d of [9, 6, 5]) min = guardEngagement(d, min, 12).minSeen
    expect(guardEngagement(5.6, min, 12).engaged).toBe(true) // within slack
    min = guardEngagement(5.6, min, 12).minSeen
    const receded = guardEngagement(6.2, min, 12)
    expect(receded.engaged).toBe(false) // past minSeen + 0.8 — released
    // And it STAYS released as the lion runs off (no re-engage on recede).
    expect(guardEngagement(9, receded.minSeen, 12).engaged).toBe(false)
  })

  it('resets outside the radius, so the NEXT approach engages fresh', () => {
    let min: number | null = null
    for (const d of [9, 4]) min = guardEngagement(d, min, 12).minSeen
    const out = guardEngagement(13, min, 12)
    expect(out.engaged).toBe(false)
    expect(out.minSeen).toBeNull()
    expect(guardEngagement(10, out.minSeen, 12).engaged).toBe(true) // fresh hunt closes in
  })
})

describe('posed landed-bird clearance (point 202 — the wing span and the feeding motion count)', () => {
  it('the lowest point is the body bottom at rest and the dipped HEAD at a full peck', () => {
    // Pitch 0: no head dip — the body sphere bottom (0.096·scale) is lowest.
    expect(landedBirdLowestDepth(0, 1)).toBeCloseTo(0.096, 9)
    // Full flock peck (0.9 rad) at the 1.6 render scale: the head reaches ~0.27
    // below the origin — far past the flat 0.15 hover that caused the clipping.
    const full = landedBirdLowestDepth(0.9, 1.6)
    expect(full).toBeGreaterThan(0.25)
    expect(full).toBeGreaterThan(landedBirdLowestDepth(0.45, 1.6))
  })

  it('the posed y keeps the LOWEST point a margin above flat ground through the whole peck', () => {
    for (const pitch of [0, 0.45, 0.75, 0.9]) {
      for (const scale of [1.5, 1.6]) {
        const y = landedBirdYPosed(2, 2, 0, pitch, scale)
        const lowestWorld = 2 + y - landedBirdLowestDepth(pitch, scale)
        expect(lowestWorld - 2).toBeCloseTo(0.06, 9) // exactly the margin above ground
      }
    }
  })

  it('ground rising under a WING lifts the whole bird (extent max, never below the margin)', () => {
    for (const ground of [2, 2.4, 3.1]) {
      expect(landedBirdClearancePosed(2, ground, 0, 0.9, 1.6)).toBeGreaterThanOrEqual(0.06 - 1e-9)
    }
    // A point-185-style +0.5 group pre-lift bug still reads as a blown cap.
    expect(landedBirdClearancePosed(2.5, 2, 0, 0.45, 1.5)).toBeGreaterThan(0.5)
  })

  it('birdExtentOffsets rotates the wing tips and head with the yaw', () => {
    const at0 = birdExtentOffsets(0, 1)
    expect(at0[1][0]).toBeCloseTo(1.15, 9) // +x wing tip
    expect(at0[3][1]).toBeCloseTo(0.24, 9) // head forward on z
    const at90 = birdExtentOffsets(Math.PI / 2, 1)
    expect(Math.abs(at90[1][0])).toBeLessThan(1e-9) // tip swung onto the z axis
    expect(Math.abs(at90[1][1])).toBeCloseTo(1.15, 9)
  })
})

describe('rescueSpeed (design.md §19.8, point 127 — the parental adrenaline burst)', () => {
  it('derives the rescue speed as ordinary walk x burst', () => {
    expect(rescueSpeed(2, 3)).toBe(6)
    expect(rescueSpeed(1.5, 3)).toBe(4.5)
  })

  it('the shipped burst reads as a burst: clearly faster than the ordinary walk', () => {
    expect(balance.family.rescueBurst).toBeGreaterThan(1)
    expect(rescueSpeed(balance.family.rescueBurst)).toBeGreaterThan(PREY_WALK_SPEED)
  })

  it('the shipped burst keeps the drama contracts (the point-127 balance guard)', () => {
    const v = rescueSpeed(balance.family.rescueBurst)
    expect(v).toBeGreaterThan(5.6) // the hunter (5.6) still meets the shield it chases
    expect(v).toBeGreaterThan(3.8) // the shield holds its station against the fleeing calf
  })

  it('floors at the walk itself: a debug edit can never make a rescue slower than walking', () => {
    expect(rescueSpeed(0.5, 3)).toBe(3)
    expect(rescueSpeed(-2, 3)).toBe(3)
  })

  it('the swollen current brakes the wader: burst / flow factor in the water (point 122 guard)', () => {
    expect(wadeSpeed(6, 1.8)).toBeCloseTo(6 / 1.8, 6)
    // The braked wade must stay below the pre-burst 4.2 that let the rains
    // drown the calf — the drama the burst must not delete.
    expect(wadeSpeed(rescueSpeed(balance.family.rescueBurst), balance.waterDrama.wetFlowFactor)).toBeLessThan(4.2)
  })

  it('a tame or dry-season flow never speeds the wader beyond the burst', () => {
    expect(wadeSpeed(6, 0.6)).toBe(6)
    expect(wadeSpeed(6, 1)).toBe(6)
  })
})

describe('griefTarget (design.md §19 — the parent charges the elephant that trampled its calf)', () => {
  it('picks the nearest living elephant', () => {
    const near = griefTarget(0, 0, [
      { x: 20, z: 0 },
      { x: 4, z: 3 }, // distance 5 — the nearest
      { x: 0, z: 12 },
    ])
    expect(near).toEqual({ x: 4, z: 3 })
  })

  it('ignores a dead elephant and takes the next living one', () => {
    const t = griefTarget(0, 0, [
      { x: 1, z: 0, dead: true },
      { x: 9, z: 0 },
    ])
    expect(t).toEqual({ x: 9, z: 0 })
  })

  it('returns null with no elephants at all — the grief must end, not chase nothing', () => {
    expect(griefTarget(0, 0, [])).toBeNull()
  })

  it('returns null when every elephant is dead', () => {
    expect(griefTarget(0, 0, [{ x: 1, z: 1, dead: true }, { x: 5, z: 5, dead: true }])).toBeNull()
  })

  it('breaks an exact distance tie by taking the first element (point 173 hardening)', () => {
    // Both at distance 5 from the origin — a strict "<" comparison means the
    // FIRST one encountered keeps the pick, never the later tied one.
    const first = { x: 3, z: 4 }
    const second = { x: 4, z: 3 }
    expect(griefTarget(0, 0, [first, second])).toEqual(first)
    // Reversed order: the (now-first) second element wins instead — proving
    // the result really tracks list order, not some other tiebreak.
    expect(griefTarget(0, 0, [second, first])).toEqual(second)
  })

  it('the charge reaches the trampling feet well inside the grief window', () => {
    // Mini-simulation of the contract; the numbers mirror Wildlife.tsx
    // (TRAMPLE_GRIEF_SPEED 6.5, ELEPHANT_SPEED 1.5, TRAMPLE_GRIEF_SECONDS 12,
    // TRAMPLE_RADIUS 1.5). The parent must catch an elephant WALKING AWAY from
    // it — otherwise the window would expire and the sacrifice would silently
    // never happen.
    const dt = 1 / 60
    let px = 0
    let pz = 0
    const eleph = { x: 10, z: 0 }
    let grief = 12
    let trampled = false
    while (grief > 0) {
      eleph.x += 1.5 * dt // roaming straight away from the parent
      const t = griefTarget(px, pz, [eleph])
      expect(t).not.toBeNull()
      const dx = t!.x - px
      const dz = t!.z - pz
      const d = Math.hypot(dx, dz) || 1
      px += (dx / d) * 6.5 * dt
      pz += (dz / d) * 6.5 * dt
      if (Math.hypot(eleph.x - px, eleph.z - pz) < 1.5) {
        trampled = true
        break
      }
      grief -= dt
    }
    expect(trampled).toBe(true)
    expect(grief).toBeGreaterThan(6) // reached with the window barely touched
  })
})

describe('gambolState (design.md §19 — playful calf hop-bouts)', () => {
  it('is idle outside the bout window and active inside it', () => {
    // phase 0: the bout is the first quarter of the 16 s cycle.
    expect(gambolState(8, 0)).toBeNull() // cycle 0.5 — idle
    expect(gambolState(15, 0)).toBeNull() // cycle ~0.94 — idle
    const bout = gambolState(1, 0) // cycle ~0.06 — playing
    expect(bout).not.toBeNull()
    expect(bout!.hop).toBeGreaterThanOrEqual(0)
    expect(bout!.hop).toBeLessThanOrEqual(1)
  })

  it('phase-shifts the bouts so herd-mates do not all play at once', () => {
    expect(gambolState(8, 0)).toBeNull()
    expect(gambolState(8, 0.2)).not.toBeNull() // 8 + 0.2*40 = 16 → cycle 0
  })

  it('is deterministic and curves over the bout (heading varies)', () => {
    const a1 = gambolState(0.2, 0)
    const a2 = gambolState(0.2, 0)
    expect(a1).toEqual(a2)
    const b = gambolState(1.75, 0) // near the bend's peak of the same bout
    expect(a1).not.toBeNull()
    expect(b).not.toBeNull()
    expect(Math.abs(a1!.heading - b!.heading)).toBeGreaterThan(0.3)
  })
})

describe('separationPush (design.md §19 — animal body separation)', () => {
  it('returns zero when nothing overlaps', () => {
    expect(separationPush(0, 0, [[3, 0, 2]])).toEqual([0, 0])
    expect(separationPush(0, 0, [])).toEqual([0, 0])
  })

  it('pushes half-way out of a single overlap, directly apart', () => {
    const [dx, dz] = separationPush(0, 0, [[1, 0, 2]])
    expect(dx).toBeCloseTo(-0.5, 6) // overlap 1, own half 0.5, away from neighbour
    expect(dz).toBeCloseTo(0, 6)
  })

  it('parts coincident animals instead of dividing by zero', () => {
    const [dx, dz] = separationPush(2, 2, [[2, 2, 1.5]])
    expect(dx).toBeCloseTo(0.75, 6)
    expect(dz).toBeCloseTo(0, 6)
  })

  it('sums the pushes of several overlapping neighbours', () => {
    // Symmetric flankers cancel; two on the same side add up.
    const [cx] = separationPush(0, 0, [[1, 0, 2], [-1, 0, 2]])
    expect(cx).toBeCloseTo(0, 6)
    const [sx] = separationPush(0, 0, [[1, 0, 2], [0.5, 0, 2]])
    expect(sx).toBeCloseTo(-1.25, 6) // -0.5 and -0.75
  })

  it('mutual application separates a pair to the full distance', () => {
    // Both members resolve their own half per frame — iterating parts them.
    let ax = 0
    let bx = 0.4
    for (let i = 0; i < 8; i++) {
      const [pa] = separationPush(ax, 0, [[bx, 0, 1.4]])
      const [pb] = separationPush(bx, 0, [[ax, 0, 1.4]])
      ax += pa
      bx += pb
      if (Math.abs(bx - ax) >= 1.4) break
    }
    expect(Math.abs(bx - ax)).toBeGreaterThanOrEqual(1.4 - 1e-6)
  })
})

describe('segPointDist (point 179 — the swept predator catch)', () => {
  it('is ~0 for a point on the segment and clamps beyond the endpoints', () => {
    expect(segPointDist(0, 0, 10, 0, 5, 0)).toBeCloseTo(0, 6)
    expect(segPointDist(0, 0, 10, 0, 12, 0)).toBeCloseTo(2, 6)
    expect(segPointDist(0, 0, 10, 0, -3, 0)).toBeCloseTo(3, 6)
  })

  it('catches a target the hunter SWEEPS through when both endpoints are far (tunnelling)', () => {
    // Hunter moves (-2,0) -> (2,0) past a calf at (0, 0.5): the move segment
    // passes 0.5 from it (a catch within radius 0.9), while the point distance at
    // EITHER endpoint is ~2.06 — the old per-frame point check tunnelled through.
    expect(segPointDist(-2, 0, 2, 0, 0, 0.5)).toBeCloseTo(0.5, 6)
    expect(Math.hypot(2, 0.5)).toBeGreaterThan(0.9) // the endpoint point-check misses
    expect(Math.hypot(-2, 0.5)).toBeGreaterThan(0.9)
  })
})

describe('flightStep (design.md §19 — vultures fly in and off, never pop)', () => {
  const mk = (): FlightState => ({ mode: 'idle', x: 0, z: 0 })

  it('spawns beyond the view ring on the far side of the target', () => {
    const s = mk()
    flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('in')
    expect(s.x).toBeCloseTo(100 + FLIGHT_SPAWN_OUT, 6)
    expect(s.z).toBeCloseTo(0, 6)
  })

  it('spawns at a fixed ring point when the target sits on the player', () => {
    const s = mk()
    flightStep(s, true, 0, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('in')
    expect(Math.hypot(s.x, s.z)).toBeCloseTo(100 + FLIGHT_SPAWN_OUT, 6)
  })

  it('pushes the spawn OFF the rendered frame when a frustum predicate is given (point 178)', () => {
    // The assumed ring underestimates the tilted bird's-eye frustum's ground
    // reach; with an on-screen predicate the spawn is pushed out in ring steps
    // until it clears the frame, so the bird flies in instead of popping in.
    // Here the frame reaches 200 units while the ring is only 100 (viewR).
    const s = mk()
    const isOff = (x: number, z: number) => Math.hypot(x, z) > 200
    flightStep(s, true, 30, 0, 0, 0, 100, 16, 1 / 60, 0.6, isOff)
    expect(s.mode).toBe('in')
    expect(isOff(s.x, s.z)).toBe(true) // spawned beyond the frame
  })

  it('keeps the ring spawn when the predicate already reports off-screen (no camera)', () => {
    // isOnScreen defaults to "everything off-screen" with no travel camera, so
    // the ring point is already clear and the spawn is not pushed further.
    const s = mk()
    flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60, 0.6, () => true)
    expect(s.x).toBeCloseTo(100 + FLIGHT_SPAWN_OUT, 6)
  })

  it('flies in, arrives (active), and stays while wanted', () => {
    const s = mk()
    flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    const d0 = Math.hypot(s.x - 10, s.z)
    for (let i = 0; i < 60 * 20 && s.mode === 'in'; i++) flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('active')
    expect(Math.hypot(s.x - 10, s.z)).toBeLessThan(d0)
    flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('active')
  })

  it('flies off when no longer wanted and despawns only well outside the view', () => {
    const s: FlightState = { mode: 'active', x: 10, z: 0 }
    let lastOutDist = 0
    for (let i = 0; i < 60 * 30 && s.mode !== 'idle'; i++) {
      flightStep(s, false, 10, 0, 0, 0, 100, 16, 1 / 60)
      if (s.mode === 'out') lastOutDist = Math.hypot(s.x, s.z)
    }
    expect(s.mode).toBe('idle')
    expect(lastOutDist).toBeGreaterThan(100 + FLIGHT_DESPAWN_OUT - 1)
  })

  it('retargets while still airborne instead of respawning', () => {
    const s: FlightState = { mode: 'out', x: 50, z: 0 }
    flightStep(s, true, 10, 0, 0, 0, 100, 16, 1 / 60)
    expect(s.mode).toBe('in')
    expect(Math.hypot(s.x - 50, s.z)).toBeLessThan(1) // kept its position
  })
})

describe('groundNormal (design.md §19 — slope-conforming decals)', () => {
  it('returns straight up on flat ground', () => {
    const [nx, ny, nz] = groundNormal(0, 0, () => 1)
    expect(nx).toBeCloseTo(0, 6)
    expect(ny).toBeCloseTo(1, 6)
    expect(nz).toBeCloseTo(0, 6)
  })

  it('tilts against a slope rising toward +x', () => {
    // height = x → surface normal leans toward -x; unit length; ny > 0.
    const [nx, ny, nz] = groundNormal(0, 0, (x) => x)
    expect(nx).toBeLessThan(0)
    expect(nz).toBeCloseTo(0, 6)
    expect(ny).toBeGreaterThan(0)
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6)
    // Exact: slope 1 → normal (-1, 1, 0)/√2.
    expect(nx).toBeCloseTo(-Math.SQRT1_2, 6)
    expect(ny).toBeCloseTo(Math.SQRT1_2, 6)
  })

  it('tilts against a slope rising toward -z', () => {
    const [nx, ny, nz] = groundNormal(0, 0, (_x, z) => -z)
    expect(nx).toBeCloseTo(0, 6)
    expect(nz).toBeGreaterThan(0)
    expect(ny).toBeGreaterThan(0)
    expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 6)
  })
})

describe('turnToward', () => {
  it('caps the step and takes the shorter way around the circle', () => {
    expect(turnToward(0, 1, 0.1)).toBeCloseTo(0.1, 6)
    expect(turnToward(0, -1, 0.1)).toBeCloseTo(-0.1, 6)
    // Wrap: from just below +π toward just above -π goes forward, not all the way back.
    const r = turnToward(3.0, -3.0, 0.2)
    expect(r).toBeCloseTo(3.2, 6)
  })

  it('reaches the target when within one step', () => {
    expect(turnToward(0, 0.05, 0.2)).toBeCloseTo(0.05, 6)
  })
})

describe('leashedGambolDir (design.md §19 — the scamper orbits its parent)', () => {
  // The shipped, calibratable leash values (design.md §19.8): 3× the original
  // 1.8 leash / 4 play range, so the family dramas read spatially. The bout
  // derivation mirrors Wildlife.tsx (calibratable bout + fixed 12 s idle gap).
  const GAMBOL_RANGE = balance.family.gambolRange
  const GAMBOL_SPEED = 2.2
  const YOUNG_FOLLOW_SPEED = 4.5
  const YOUNG_FOLLOW_RADIUS = balance.family.followRadius
  const GAMBOL_IDLE_SECONDS = 12
  const PERIOD = balance.family.gambolBoutSeconds + GAMBOL_IDLE_SECONDS
  const ACTIVE = balance.family.gambolBoutSeconds / PERIOD

  it('ships the widened leash: 3× the original follow radius and play range', () => {
    expect(balance.family.followRadius).toBeCloseTo(3 * 1.8, 10)
    expect(balance.family.gambolRange).toBeCloseTo(3 * 4, 10)
  })

  it('a hop-bout runs the full calibratable length — longer than the old 4 s bout', () => {
    expect(balance.family.gambolBoutSeconds).toBeGreaterThan(4)
    // Play is continuous through the whole widened bout window (phase 0 puts
    // the bout at the cycle start) …
    for (let t = 0.1; t < balance.family.gambolBoutSeconds - 0.05; t += 0.5) {
      expect(gambolState(t, 0, PERIOD, ACTIVE), `t=${t}`).not.toBeNull()
    }
    // … while the OLD default bout (16 s × 0.25 = 4 s) was already over at 6 s,
    // and the widened bout still ends (idle follows).
    expect(gambolState(6, 0)).toBeNull()
    expect(gambolState(balance.family.gambolBoutSeconds + 0.2, 0, PERIOD, ACTIVE)).toBeNull()
  })

  it('the rescue burst still closes the widened leash within the caught window', () => {
    // Worst case: the calf is caught at the far edge of the play range with the
    // parent on the opposite side. The charge must cover that gap — plus the
    // too-late band as slack — well inside the 5 s struggle window
    // (CAUGHT_DURATION / PARENT_TOO_LATE_DIST in Wildlife.tsx), so the
    // sacrifice/shield/too-late outcomes all stay reachable at 3× spacing.
    const CAUGHT_DURATION = 5
    const PARENT_TOO_LATE_DIST = 3.2
    const worstGap = balance.family.gambolRange + PARENT_TOO_LATE_DIST
    expect(rescueSpeed(balance.family.rescueBurst) * CAUGHT_DURATION).toBeGreaterThan(worstGap * 1.5)
  })

  it('plays freely near the parent (the leash barely bends the heading)', () => {
    for (const h of [0, 1.2, Math.PI, -2]) {
      const [dx, dz] = leashedGambolDir(h, 0.5, 0.5, 0.7, GAMBOL_RANGE)
      const dot = dx * Math.sin(h) + dz * Math.cos(h)
      expect(dot, `heading ${h}`).toBeGreaterThan(0.9) // nearly the bout direction
    }
  })

  it('never steps outward at the range edge, for EVERY bout heading', () => {
    for (let i = 0; i < 16; i++) {
      const h = (i / 16) * Math.PI * 2
      // Parent sits at the origin, calf at range distance east: outward is
      // +x, and the damped step must carry none of it at the edge.
      const [dx] = leashedGambolDir(h, -GAMBOL_RANGE, 0, GAMBOL_RANGE, GAMBOL_RANGE)
      expect(dx, `heading ${h}`).toBeLessThanOrEqual(1e-9)
    }
  })

  it('returns a finite unit direction in the degenerate cases', () => {
    for (const [tx, tz, d] of [
      [0, 0, 0],
      [1e-9, 0, 1e-9],
    ] as const) {
      const [dx, dz] = leashedGambolDir(1, tx, tz, d, GAMBOL_RANGE)
      expect(Number.isFinite(dx) && Number.isFinite(dz)).toBe(true)
      expect(Math.hypot(dx, dz)).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  // Frame-loop simulation in the shape of the real integrator: the calf must
  // never leave the play range mid-bout (so the follow yank never alternates
  // with play), and its step direction must not saw back and forth. At the
  // widened leash it must also genuinely USE the room — reaching clearly
  // beyond the old 1.8 leash — while the anti-jitter damping holds unchanged
  // (it has no cancellation point at any range).
  it('a full simulated bout stays leashed with no direction sawtooth', () => {
    const dt = 1 / 60
    let x = 0.5
    let z = 0
    const parent = { x: 0, z: 0 }
    let prevStepX: number | null = null
    let prevStepZ: number | null = null
    let flips = 0
    let steps = 0
    let maxDist = 0
    for (let f = 0; f < 3600; f++) {
      const t = f * dt
      const bout = gambolState(t, 0.37, PERIOD, ACTIVE)
      const toX = parent.x - x
      const toZ = parent.z - z
      const d = Math.hypot(toX, toZ)
      if (bout) {
        const [sx, sz] = leashedGambolDir(bout.heading, toX, toZ, d, GAMBOL_RANGE)
        x += sx * GAMBOL_SPEED * dt
        z += sz * GAMBOL_SPEED * dt
        if (prevStepX !== null && prevStepZ !== null && sx * prevStepX + sz * prevStepZ < 0) flips++
        prevStepX = sx
        prevStepZ = sz
        steps++
      } else {
        prevStepX = null
        prevStepZ = null
        if (d > YOUNG_FOLLOW_RADIUS) {
          x += (toX / d) * YOUNG_FOLLOW_SPEED * dt
          z += (toZ / d) * YOUNG_FOLLOW_SPEED * dt
        }
      }
      maxDist = Math.max(maxDist, Math.hypot(x - parent.x, z - parent.z))
    }
    expect(steps).toBeGreaterThan(400) // the bout actually ran
    expect(maxDist).toBeLessThanOrEqual(GAMBOL_RANGE + 0.05) // leashed — never past the edge
    expect(maxDist).toBeGreaterThan(YOUNG_FOLLOW_RADIUS) // the widened room is really used (≫ the old 1.8)
    expect(flips / Math.max(1, steps)).toBeLessThan(0.02) // no per-frame sawtooth
  })

  it('the OLD unleashed range-switch genuinely sawtoothed (regression witness)', () => {
    // Pinned to the ORIGINAL constants (range 4, leash 1.8, 4 s default bout):
    // this documents the historical bug the leash damping fixed.
    const OLD_RANGE = 4
    const OLD_FOLLOW_RADIUS = 1.8
    const dt = 1 / 60
    let x = 0.5
    let z = 0
    let prevStepX: number | null = null
    let prevStepZ: number | null = null
    let flips = 0
    let steps = 0
    for (let f = 0; f < 3600; f++) {
      const t = f * dt
      const d = Math.hypot(x, z)
      const bout = d <= OLD_RANGE ? gambolState(t, 0.37) : null
      if (bout) {
        const sx = Math.sin(bout.heading)
        const sz = Math.cos(bout.heading)
        x += sx * GAMBOL_SPEED * dt
        z += sz * GAMBOL_SPEED * dt
        if (prevStepX !== null && prevStepZ !== null && sx * prevStepX + sz * prevStepZ < 0) flips++
        prevStepX = sx
        prevStepZ = sz
        steps++
      } else {
        if (d > OLD_FOLLOW_RADIUS) {
          const sx = -x / d
          const sz = -z / d
          x += sx * YOUNG_FOLLOW_SPEED * dt
          z += sz * YOUNG_FOLLOW_SPEED * dt
          if (prevStepX !== null && prevStepZ !== null && sx * prevStepX + sz * prevStepZ < 0) flips++
          prevStepX = sx
          prevStepZ = sz
          steps++
        } else {
          prevStepX = null
          prevStepZ = null
        }
      }
    }
    expect(flips / Math.max(1, steps)).toBeGreaterThan(0.05) // the boundary buzz the fix removes
  })
})

describe('clamped separation (design.md §19 — a force, not a teleport)', () => {
  const SEPARATION_MAX_SPEED = 2.2

  it('parts an overlapping pair smoothly and monotonically', () => {
    const dt = 1 / 60
    let ax = 0
    let bx = 0.4 // deep overlap, minDist 1.4
    let prevGap = bx - ax
    for (let f = 0; f < 240; f++) {
      const [pa] = separationPush(ax, 0, [[bx, 0, 1.4]])
      const [pb] = separationPush(bx, 0, [[ax, 0, 1.4]])
      const cap = SEPARATION_MAX_SPEED * dt
      ax += Math.max(-cap, Math.min(cap, pa))
      bx += Math.max(-cap, Math.min(cap, pb))
      const gap = bx - ax
      expect(gap).toBeGreaterThanOrEqual(prevGap - 1e-9) // monotone, no overshoot back
      prevGap = gap
    }
    expect(prevGap).toBeGreaterThanOrEqual(1.4 - 1e-6) // fully parted…
    expect(prevGap).toBeLessThan(1.5) // …but not flung apart
  })

  it('a clamped push never exceeds the walking pace in one frame', () => {
    const dt = 1 / 60
    const [dx, dz] = separationPush(0, 0, [[0.01, 0, 2.0]])
    const m = Math.hypot(dx, dz)
    const cap = SEPARATION_MAX_SPEED * dt
    const k = m > cap ? cap / m : 1
    expect(Math.hypot(dx * k, dz * k)).toBeLessThanOrEqual(cap + 1e-9)
  })
})

describe('killFlockMayDescend (design.md §19.6 — land once the site is clear)', () => {
  it('never lands while the predator feeds', () => {
    expect(killFlockMayDescend('feed', 0, 0, 0, 0)).toBe(false)
    expect(killFlockMayDescend('feed', 100, 100, 0, 0)).toBe(false)
  })

  it('during the walk-off it lands as soon as the predator cleared the site', () => {
    expect(killFlockMayDescend('leave', 5, 0, 0, 0)).toBe(false) // still close
    expect(killFlockMayDescend('leave', VULTURE_DESCEND_CLEAR_DIST + 1, 0, 0, 0)).toBe(true)
  })

  it('a gone predator frees the site immediately', () => {
    expect(killFlockMayDescend('idle', 0, 0, 0, 0)).toBe(true)
  })
})

describe('killFlockActive (design.md §19.6, point 162 — no flock over a drive-off)', () => {
  it('circles while the predator feeds, remnant or not', () => {
    expect(killFlockActive('feed', false)).toBe(true)
    expect(killFlockActive('feed', true)).toBe(true)
  })

  it('during the walk-off it stays only for a real kill (a remnant)', () => {
    expect(killFlockActive('leave', true)).toBe(true) // feed->leave: a scrap to finish
    expect(killFlockActive('leave', false)).toBe(false) // DRIVE-OFF: no kill, no flock
  })

  it('a drive-off / no-kill idle draws no flock, but a leftover scrap does', () => {
    expect(killFlockActive('idle', false)).toBe(false)
    expect(killFlockActive('idle', true)).toBe(true)
  })
})

describe('vigilBlocksLanding (design.md §19.8, point 121 — the keeper drives the vultures off)', () => {
  it('blocks a landing while the live keeper stands inside the radius', () => {
    expect(vigilBlocksLanding(0)).toBe(true) // standing right on the carcass
    expect(vigilBlocksLanding(3.999)).toBe(true) // just inside the default radius
  })

  it('is boundary-exact: exactly at the radius the landing is free', () => {
    expect(vigilBlocksLanding(4)).toBe(false)
    expect(vigilBlocksLanding(4.001)).toBe(false)
    expect(vigilBlocksLanding(100)).toBe(false)
  })

  it('honors a custom radius', () => {
    expect(vigilBlocksLanding(5, 6)).toBe(true)
    expect(vigilBlocksLanding(6, 6)).toBe(false)
    expect(vigilBlocksLanding(1, 0.5)).toBe(false)
  })

  it('a dead keeper never blocks: callers filter dead keepers and pass Infinity with none alive', () => {
    // The contract (documented on the helper): only LIVE keepers' distances are
    // passed in; with no live keeper the caller passes Infinity — never a block.
    expect(vigilBlocksLanding(Infinity)).toBe(false)
  })
})

describe('vigilDrawReady (point 121 (f) — the carcass draws a predator after the delay)', () => {
  it('is not ready before the calibratable delay', () => {
    expect(vigilDrawReady(0, 12)).toBe(false)
    expect(vigilDrawReady(11.99, 12)).toBe(false)
  })

  it('becomes ready exactly at the delay and stays ready after it', () => {
    expect(vigilDrawReady(12, 12)).toBe(true)
    expect(vigilDrawReady(59, 12)).toBe(true)
  })

  it('a zero delay draws immediately (the debug menu may set it)', () => {
    expect(vigilDrawReady(0, 0)).toBe(true)
  })
})

describe('shouldMourn (design.md §19.8, point 126 — the herd vigil at the bones)', () => {
  it('draws an unmourned herd whose centre stands inside the radius', () => {
    expect(shouldMourn(0, 25, false)).toBe(true) // right on the bones
    expect(shouldMourn(24.999, 25, false)).toBe(true) // just inside the draw radius
  })

  it('is boundary-exact: at and beyond the radius it never mourns', () => {
    expect(shouldMourn(25, 25, false)).toBe(false)
    expect(shouldMourn(25.001, 25, false)).toBe(false)
    expect(shouldMourn(1000, 25, false)).toBe(false)
  })

  it('honors a custom (debug-edited) radius', () => {
    expect(shouldMourn(5, 6, false)).toBe(true)
    expect(shouldMourn(6, 6, false)).toBe(false)
    expect(shouldMourn(1, 0.5, false)).toBe(false)
  })

  it('an already-mourned herd is never drawn again until the latch resets', () => {
    expect(shouldMourn(0, 25, true)).toBe(false) // even right on the bones
    expect(shouldMourn(24, 25, true)).toBe(false)
    // The caller clears the latch once the herd has LEFT the radius — a later
    // visit mourns again.
    expect(shouldMourn(24, 25, false)).toBe(true)
  })
})

describe('elephantStepAllowed (point 126 — mourners cross any land, roamers keep their biomes)', () => {
  const ALL = ['ocean', 'coast', 'desert', 'savanna', 'jungle', 'mountain', 'water']

  it('a roaming elephant steps only onto savanna and jungle', () => {
    for (const t of ALL) {
      expect(elephantStepAllowed(t, false)).toBe(t === 'savanna' || t === 'jungle')
    }
  })

  it('a mourning elephant crosses every LAND type — the graveyard sits in dry country', () => {
    for (const t of ['coast', 'desert', 'savanna', 'jungle', 'mountain']) {
      expect(elephantStepAllowed(t, true)).toBe(true)
    }
  })

  it('water and ocean stay refused even for a mourner (the water dramas own that ground)', () => {
    expect(elephantStepAllowed('water', true)).toBe(false)
    expect(elephantStepAllowed('ocean', true)).toBe(false)
  })

  it('standing on foreign land unlocks any land step — a herd is never pinned where its vigil ended', () => {
    // Post-vigil on the graveyard's dry ground: no longer mourning, yet free to walk out.
    expect(elephantStepAllowed('desert', false, 'desert')).toBe(true)
    expect(elephantStepAllowed('savanna', false, 'desert')).toBe(true)
    expect(elephantStepAllowed('mountain', false, 'coast')).toBe(true)
  })

  it('the escape rule never lets a roamer ENTER foreign ground or any water', () => {
    expect(elephantStepAllowed('desert', false, 'savanna')).toBe(false) // biome rule intact
    expect(elephantStepAllowed('water', false, 'desert')).toBe(false) // even escaping, never into water
    expect(elephantStepAllowed('ocean', false, 'coast')).toBe(false)
  })
})

describe('mournDeadline (point 126 — the vigil hard deadline with the arc walk-in grant)', () => {
  it('grants the hold window plus TWICE the straight-line walk time', () => {
    // Herd drawn 20 m out at speed 1.5: 30 s hold + 2 * 20/1.5 s walk-in.
    expect(mournDeadline(100, 20, 30, 1.5)).toBeCloseTo(100 + 30 + (20 / 1.5) * 2, 6)
  })

  it('a herd already at the bones gets exactly the hold window', () => {
    expect(mournDeadline(50, 0, 30, 1.5)).toBe(80)
  })

  it('the radius-edge draw still holds after the arc approach (the point of the doubling)', () => {
    // At the default radius 25 the single-time grant (old formula) left an
    // arc-y approach eating into or past the hold; the doubled grant covers a
    // detour factor of 2 so the hold window survives in full.
    const single = 25 / 1.5
    const deadline = mournDeadline(0, 25, 30, 1.5)
    expect(deadline).toBeGreaterThan(single * 2) // walk grant alone exceeds any 2x-detour arc
    expect(deadline - single * 2).toBe(30) // and the full hold window remains on top
  })

  it('is a hard deadline: finite for every draw distance (no herd ever pinned)', () => {
    expect(Number.isFinite(mournDeadline(0, 1000, 30, 1.5))).toBe(true)
  })
})

describe('offscreenRingSpawn (point 195 — the scripted predator never pops into frame)', () => {
  // A frustum stub: on-screen = a disc of radius R around the origin (the
  // camera centre for the test). The spawn must land OUTSIDE it.
  const onScreenDisc = (R: number) => (x: number, z: number) => Math.hypot(x, z) <= R
  const offScreen = (R: number) => (x: number, z: number) => !onScreenDisc(R)(x, z)

  it.each([
    { name: 'spot at the camera centre', cx: 0, cz: 0 },
    { name: 'spot 20 m out', cx: 20, cz: 0 },
    { name: 'spot at the seek edge', cx: 27, cz: -36 },
  ])('returns an off-screen point within [minR, maxR] of the spot ($name)', ({ cx, cz }) => {
    for (const rand of [0, 0.17, 0.5, 0.83, 0.999]) {
      const p = offscreenRingSpawn(cx, cz, 15, 110, rand, offScreen(50))
      expect(onScreenDisc(50)(p.x, p.z)).toBe(false) // never pops into sight
      const fromSpot = Math.hypot(p.x - cx, p.z - cz)
      expect(fromSpot).toBeGreaterThanOrEqual(15 - 1e-6) // never inside minR
      expect(fromSpot).toBeLessThanOrEqual(110 + 1e-6) // never past the abort ring
    }
  })

  it('is nearest-first: an already-clear minR ring returns exactly minR', () => {
    // Spot far from the camera: the whole minR ring is already off-screen, so
    // the run-in is as short as allowed (the first ring wins).
    const p = offscreenRingSpawn(200, 0, 15, 110, 0, offScreen(50))
    expect(Math.hypot(p.x - 200, p.z)).toBeCloseTo(15, 6)
  })

  it('pushes outward when the near rings are on-screen', () => {
    // Spot at the camera centre under a wide on-screen disc (radius 60): minR=15
    // is inside it, so the spawn must sit on a ring beyond 60.
    const p = offscreenRingSpawn(0, 0, 15, 200, 0.3, offScreen(60))
    expect(Math.hypot(p.x, p.z)).toBeGreaterThan(60)
    expect(Math.hypot(p.x, p.z)).toBeLessThanOrEqual(200 + 1e-6)
  })

  it('with no predicate (no camera mounted) falls back to the minR ring, finite and deterministic', () => {
    const p1 = offscreenRingSpawn(10, -5, 58, 90, 0.42)
    const p2 = offscreenRingSpawn(10, -5, 58, 90, 0.42)
    expect(Number.isFinite(p1.x)).toBe(true)
    expect(Number.isFinite(p1.z)).toBe(true)
    expect(Math.hypot(p1.x - 10, p1.z - (-5))).toBeCloseTo(58, 6)
    expect(p1).toEqual(p2)
  })

  it('every probe on-screen (a very wide zoom) falls back to the far ring — finite, never NaN', () => {
    // The on-screen disc (radius 500) swallows the whole [minR, maxR] band, so
    // no probe is ever off-screen; the fallback sits at maxR, still finite.
    const p = offscreenRingSpawn(0, 0, 15, 110, 0.42, offScreen(500))
    expect(Number.isFinite(p.x)).toBe(true)
    expect(Number.isFinite(p.z)).toBe(true)
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(110, 6)
  })
})

describe('deflectedStep (scripted walks obey the land constraint, point 83)', () => {
  it('walks straight while the way is clear', () => {
    const r = deflectedStep(0, 0, 0, 1, () => false)
    expect(r.moved).toBe(true)
    expect(r.x).toBeCloseTo(0)
    expect(r.z).toBeCloseTo(1)
    expect(r.heading).toBeCloseTo(0)
  })

  it('deflects along a coast instead of entering the ocean', () => {
    // Ocean everywhere north of z = 0.5; heading north (0).
    const blocked = (_x: number, z: number) => z > 0.5
    const r = deflectedStep(0, 0, 0, 1, blocked)
    expect(r.moved).toBe(true)
    expect(blocked(r.x, r.z)).toBe(false)
    expect(Math.abs(r.heading)).toBeLessThanOrEqual(Math.PI / 2 + 1e-9) // swings at most to the flank
  })

  it('prefers the smallest swing that clears the water', () => {
    // A diagonal coast: the first 15° probe to one side already clears it.
    const blocked = (x: number, z: number) => z > 0.5 && x > -0.2
    const r = deflectedStep(0, 0, 0, 1, blocked)
    expect(r.moved).toBe(true)
    expect(r.heading).toBeLessThan(0) // swung west, away from the blocked side
  })

  it('stands rather than swims when every forward probe is water', () => {
    const r = deflectedStep(0, 0, 0, 1, () => true)
    expect(r.moved).toBe(false)
    expect(r.x).toBe(0)
    expect(r.z).toBe(0)
  })

  it('never steps into a narrow channel even when land lies beyond it', () => {
    // Water only in z ∈ (1.0, 1.1) — a thin channel; the far probe (0.6)
    // lands on dry ground beyond it, but the step itself must not get wet.
    const blocked = (_x: number, z: number) => z > 1.0 && z < 1.1
    const r = deflectedStep(0, 0.98, 0, 0.05, blocked, 0.6)
    expect(r.moved).toBe(true)
    expect(blocked(r.x, r.z)).toBe(false)
  })

  it('the lookahead keeps the walker out of a one-cell dead end', () => {
    // A single land cell at z ∈ [1, 1.2] pokes into water (z > 1.2 wet,
    // z in (1, 1.2] dry pocket). With a probe reaching past the pocket the
    // walker treats the pocket as blocked and swings aside instead.
    const blocked = (x: number, z: number) => z > 1.2 || (z > 1 && Math.abs(x) < 0.05)
    const r = deflectedStep(0, 0.95, 0, 0.1, blocked, 0.6)
    expect(r.moved).toBe(true)
    // It did NOT step straight into the pocket column.
    expect(Math.abs(r.heading)).toBeGreaterThan(0.01)
  })
})

describe('escapeCorridorHeading (point 188 — the walk-off picks a land corridor, not the seaward radial)', () => {
  const wrap = (d: number) => Math.atan2(Math.sin(d), Math.cos(d))

  it('open country leaves along the radial (the outward bias decides ties)', () => {
    const h = escapeCorridorHeading(0, 0, 0.7, () => false)
    expect(Math.abs(wrap(h - 0.7))).toBeLessThan(1e-9)
  })

  it('a seaward radial loses to a long land corridor (the Cairo coast pocket)', () => {
    // Ocean fills x > 4 (a short seaward stub); the radial points +x (east,
    // heading pi/2 in the sin/cos convention). Land runs forever elsewhere.
    const blocked = (x: number) => x > 4
    const h = escapeCorridorHeading(0, 0, Math.PI / 2, blocked)
    // The pick is NOT the seaward radial: its corridor is a 2-4 unit stub.
    expect(Math.abs(wrap(h - Math.PI / 2))).toBeGreaterThan(Math.PI / 5)
    // And the picked corridor is actually clear for the full probe reach.
    for (let sIdx = 1; sIdx <= 12; sIdx++) {
      expect(blocked(Math.sin(h) * 2 * sIdx)).toBe(false)
    }
  })

  it('of two clear corridors the more outward one wins', () => {
    // Ocean blocks the radial (+z) beyond 2; both +x and -x are clear, but the
    // radial tilts slightly toward +x — the outward weight breaks the tie.
    const blocked = (x: number, z: number) => z > 2 && Math.abs(x) < 6
    const radial = 0.15 // ~+z, tilted a whisker toward +x
    const h = escapeCorridorHeading(0, 0, radial, blocked)
    expect(Math.sin(h)).toBeGreaterThan(0) // picked the +x side, matching the tilt
  })
})

describe('calfFleeStep (design.md §19.8, point 157 — a run-down calf steers around the water)', () => {
  it('runs directly away from the hunter while the way is clear', () => {
    // Hunter at the origin, calf due east: it should keep fleeing straight east.
    const r = calfFleeStep(3, 0, 0, 0, 1, () => false)
    expect(r.moved).toBe(true)
    expect(r.heading).toBeCloseTo(Math.PI / 2) // atan2(cx-hx, cz-hz) = east
    expect(r.x).toBeCloseTo(4)
    expect(r.z).toBeCloseTo(0)
  })

  it('flees on the diagonal away from a corner hunter', () => {
    const r = calfFleeStep(2, 2, 0, 0, 1, () => false)
    expect(r.moved).toBe(true)
    expect(r.heading).toBeCloseTo(Math.PI / 4) // away from the SW hunter
  })

  it('deflects around water on the escape line instead of pinning', () => {
    // Water east of x = 3.5; the straight-away flight (east) runs into it.
    const blocked = (x: number, _z: number) => x > 3.5
    const r = calfFleeStep(3, 0, 0, 0, 1, blocked)
    expect(r.moved).toBe(true)
    expect(blocked(r.x, r.z)).toBe(false) // it landed on dry ground
    expect(Math.abs(r.heading - Math.PI / 2)).toBeGreaterThan(0.01) // it turned off straight-east
  })

  it('stands (moved:false) when cornered against water, leaving the catch to resolve it', () => {
    const r = calfFleeStep(3, 0, 0, 0, 1, () => true)
    expect(r.moved).toBe(false)
    expect(r.x).toBe(3)
    expect(r.z).toBe(0)
    expect(r.corridor).toBeUndefined() // a genuine dead-end holds no corridor
  })
})

describe('calfFleeStep at a concave coast pocket (point 226 — the calf never freezes at the waterline)', () => {
  // The user's Cairo geometry: the calf stands at the tip of a narrow land
  // tongue poking north into the sea — water fills the bight ahead AND wraps
  // around both flanks, so EVERY probe within the ±90° deflection fan of the
  // straight-away flight (north, hunter to the south) is wet. Land: the
  // tongue itself (|x| <= 0.6, z <= 0.01) and the open country south of
  // z = -0.9.
  const pocket = (x: number, z: number) => z > 0.01 || (z > -0.9 && Math.abs(x) > 0.6)

  it('the direct deflection fan alone dead-ends here (the reproduced bug)', () => {
    // This is what pinned the calf: deflectedStep on the away heading finds
    // no dry probe within its ±90° fan and stands.
    const r = deflectedStep(0, 0, 0, 0.5, pocket, 0.8)
    expect(r.moved).toBe(false)
  })

  it('gets a deflected step onto LAND — never a water cell — via the escape corridor', () => {
    const r = calfFleeStep(0, 0, 0, -5, 0.5, pocket, 0.8)
    expect(r.moved).toBe(true) // visibly moving, not frozen at the water
    expect(pocket(r.x, r.z)).toBe(false) // the step landed on dry ground
    expect(r.corridor).toBeDefined() // the point-188 corridor is engaged (and sticky)
  })

  it('keeps a non-zero land-ward step every frame until the catch', () => {
    // Chase loop: the hunter closes from the south faster than the calf flees
    // (the slower-than-hunter property), so the catch is guaranteed — and up
    // to that catch the calf must MOVE on land every single frame.
    let cx = 0
    let cz = 0
    let hx = 0
    let hz = -5
    let corridor: number | undefined
    let corridorUsed = false
    let caught = false
    for (let i = 0; i < 60; i++) {
      const r = calfFleeStep(cx, cz, hx, hz, 0.5, pocket, 0.8, corridor)
      expect(r.moved).toBe(true) // never frozen at the waterline
      expect(pocket(r.x, r.z)).toBe(false) // never rests on a water cell
      expect(Math.hypot(r.x - cx, r.z - cz)).toBeGreaterThan(0.4) // a real step
      cx = r.x
      cz = r.z
      corridor = r.corridor
      if (corridor !== undefined) corridorUsed = true
      const d = Math.hypot(cx - hx, cz - hz)
      if (d < 0.6) {
        caught = true // the hunter has run the calf down — the drama resolves
        break
      }
      hx += ((cx - hx) / d) * 0.7
      hz += ((cz - hz) / d) * 0.7
    }
    expect(caught).toBe(true) // the chase still ends in the catch
    expect(corridorUsed).toBe(true) // the pocket actually exercised the fallback
  })

  it('reuses the sticky corridor while its way ahead stays clear (no flip-flop)', () => {
    // At the tongue tip the direct fan is dead — a held corridor due south
    // (down the tongue, clear) is carried unchanged, never re-picked to the
    // opposite flank mid-run.
    const r = calfFleeStep(0, 0, 0, -5, 0.5, pocket, 0.8, Math.PI)
    expect(r.moved).toBe(true)
    expect(r.corridor).toBe(Math.PI)
    expect(r.heading).toBeCloseTo(Math.PI)
    expect(r.z).toBeCloseTo(-0.5)
  })

  it('re-picks the corridor only once its way ahead closes', () => {
    // A held corridor pointing straight INTO the bay (north) probes wet — it
    // is dropped and a fresh clear-land corridor picked instead.
    const r = calfFleeStep(0, 0, 0, -5, 0.5, pocket, 0.8, 0)
    expect(r.moved).toBe(true)
    expect(pocket(r.x, r.z)).toBe(false)
    expect(r.corridor).toBeDefined()
    expect(r.corridor).not.toBe(0)
  })
})

describe('waterStruggleFate (design.md §19.8, point 122 — calm water rescues, a swollen current drowns)', () => {
  const SELF_RESCUE = 25
  const DROWN = 30
  const THRESHOLD = 0.8

  const fate = (flow: number, seconds: number) =>
    waterStruggleFate(flow, seconds, SELF_RESCUE, DROWN, THRESHOLD)

  it('calm water self-rescues after the exhaustion window and never drowns', () => {
    expect(fate(0, 10)).toBe('struggling')
    expect(fate(0, 25.1)).toBe('self-rescue')
    expect(fate(0.5, 26)).toBe('self-rescue')
    // Even absurdly long in calm water: exhaustion wins, the river never does.
    expect(fate(0.79, 10_000)).toBe('self-rescue')
  })

  it('a strong current drowns exactly at the threshold second — and never self-rescues', () => {
    expect(fate(1, 29.99)).toBe('struggling')
    expect(fate(1, 30)).toBe('drowned')
    // The self-rescue must NOT fire in a strong current, or nothing ever
    // drowns: past the 25 s window it keeps struggling until the river takes it.
    expect(fate(1, 26)).toBe('struggling')
  })

  it('the flow boundary is exact: just below clambers out, at it drowns', () => {
    expect(fate(THRESHOLD - 1e-9, 40)).toBe('self-rescue')
    expect(fate(THRESHOLD, 40)).toBe('drowned')
  })

  it('an Infinity self-rescue window (the wading parent) still drowns in a strong current', () => {
    expect(waterStruggleFate(1, 30, Infinity, DROWN, THRESHOLD)).toBe('drowned')
    expect(waterStruggleFate(0.5, 10_000, Infinity, DROWN, THRESHOLD)).toBe('struggling')
  })
})

describe('seasonFlowFactor (point 122 — the rains swell the drama current)', () => {
  it('interpolates dry -> wet over the wetness and clamps outside 0..1', () => {
    expect(seasonFlowFactor(0, 0.6, 1.8)).toBeCloseTo(0.6, 9)
    expect(seasonFlowFactor(1, 0.6, 1.8)).toBeCloseTo(1.8, 9)
    expect(seasonFlowFactor(0.5, 0.6, 1.8)).toBeCloseTo(1.2, 9)
    expect(seasonFlowFactor(-1, 0.6, 1.8)).toBeCloseTo(0.6, 9)
    expect(seasonFlowFactor(2, 0.6, 1.8)).toBeCloseTo(1.8, 9)
  })

  it('with the shipped balance values, a mid-channel flow drowns only in the rains', () => {
    // flow 1.0 (centerline): dry 0.6 < 0.8 (clambers out), rains 1.8 >= 0.8.
    expect(1.0 * seasonFlowFactor(0.05, 0.6, 1.8)).toBeLessThan(0.8)
    expect(1.0 * seasonFlowFactor(0.9, 0.6, 1.8)).toBeGreaterThanOrEqual(0.8)
  })
})

describe('channelDriftStep (point 122 — the current follows the channel, never beaches)', () => {
  it('takes the full step while it stays on water', () => {
    const all = () => true
    expect(channelDriftStep(0, 0, 1, 2, all)).toEqual({ x: 1, z: 2 })
  })

  it('falls back to the in-channel component when the full step would beach', () => {
    // Water is the half-plane x <= 0.5: the x-component beaches, z flows.
    const water = (x: number) => x <= 0.5
    expect(channelDriftStep(0, 0, 1, 2, water)).toEqual({ x: 0, z: 2 })
    // Water is z <= 0.5: the z-component beaches, x flows.
    const waterZ = (_x: number, z: number) => z <= 0.5
    expect(channelDriftStep(0, 0, 1, 2, waterZ)).toEqual({ x: 1, z: 0 })
  })

  it('stays put when every candidate is dry (still in the water at its old spot)', () => {
    const none = () => false
    expect(channelDriftStep(3, 4, 1, 1, none)).toEqual({ x: 3, z: 4 })
  })
})

describe('mireRoll / mireFate (design.md §19.8, point 123 — the drying waterhole)', () => {
  it('mires only AT a dry-season bank, and only on the roll', () => {
    // At the bank, dry, roll under the chance: mired.
    expect(mireRoll(0.02, 0.05, 0.1, 0.25, 0.35, 0.2)).toBe(true)
    // Away from the bank: never.
    expect(mireRoll(0.2, 0.05, 0.1, 0.25, 0.35, 0.0)).toBe(false)
    // In the rains the bank is firm: never.
    expect(mireRoll(0.02, 0.05, 0.8, 0.25, 0.35, 0.0)).toBe(false)
    // Roll over the chance: not this time.
    expect(mireRoll(0.02, 0.05, 0.1, 0.25, 0.35, 0.9)).toBe(false)
    // The wetness boundary is exact: AT the threshold the bank is firm.
    expect(mireRoll(0.02, 0.05, 0.25, 0.25, 0.35, 0.0)).toBe(false)
  })

  it('the bank-reach boundary is inclusive: bankDistDeg === bankReachDeg still counts as AT the bank', () => {
    // The guard is `bankDistDeg > bankReachDeg` (strict), so equality is NOT
    // excluded — a bout landing exactly on the reach edge still may mire.
    expect(mireRoll(0.05, 0.05, 0.1, 0.25, 0.35, 0.2)).toBe(true)
    // A hair beyond the reach IS excluded.
    expect(mireRoll(0.05 + 1e-9, 0.05, 0.1, 0.25, 0.35, 0.2)).toBe(false)
  })

  it('the mire always resolves: released exactly at the window', () => {
    expect(mireFate(0, 45)).toBe('mired')
    expect(mireFate(44.99, 45)).toBe('mired')
    expect(mireFate(45, 45)).toBe('released')
  })
})

describe('vicinitySeedBounds (point 135a — the guarantee holds from the leave point, over time)', () => {
  it('counts and places against the margin-shrunk ring', () => {
    const b = vicinitySeedBounds(75, 14, 6, 10)
    expect(b.countRadius).toBe(65)
    expect(b.distMin).toBe(20)
    // Placement + group spread (6) stays inside the count radius.
    expect(b.distMax + 6).toBeLessThanOrEqual(b.countRadius)
    // And the count radius + a few units of observer offset stays inside
    // the promised radius.
    expect(b.countRadius + 8).toBeLessThanOrEqual(75 + 0.0001)
  })

  it('degenerates safely when the margin eats the ring', () => {
    const b = vicinitySeedBounds(22, 14, 6, 10)
    expect(b.countRadius).toBeGreaterThanOrEqual(20)
    expect(b.distMax).toBeGreaterThanOrEqual(b.distMin)
  })
})

describe('pickOffscreenLandAnchor (points 165/183 — a seeded guarantee never pops into view; defers when it cannot place off-screen)', () => {
  const anyLand = () => true
  it('prefers an off-screen land candidate over on-screen ones', () => {
    const cands = [[0, 0], [10, 0], [20, 0]] as const
    // The first two project inside the frame; the third is off-screen.
    const onScreen = (x: number) => x < 15
    expect(pickOffscreenLandAnchor(cands, anyLand, (x) => onScreen(x))).toEqual([20, 0])
  })

  it('returns null when only on-screen land exists, so the seeder defers instead of popping (point 183)', () => {
    const cands = [[0, 0], [10, 0]] as const
    expect(pickOffscreenLandAnchor(cands, anyLand, () => true)).toBeNull()
  })

  it('skips water candidates and takes the off-screen LAND one', () => {
    const cands = [[0, 0], [10, 0], [20, 0]] as const
    const isLand = (x: number) => x !== 10 // 10 is water
    const onScreen = (x: number) => x < 15 // 0 on-screen, 20 off-screen
    expect(pickOffscreenLandAnchor(cands, (x) => isLand(x), (x) => onScreen(x))).toEqual([20, 0])
  })

  it('returns null when no candidate is land', () => {
    const cands = [[0, 0], [10, 0]] as const
    expect(pickOffscreenLandAnchor(cands, () => false, () => false)).toBeNull()
  })
})

describe('calvesForGroup (point 169 — a calibratable fraction of the herd, distinct parents)', () => {
  it('raises none below the family-life threshold of three', () => {
    expect(calvesForGroup(0, 0.25)).toBe(0)
    expect(calvesForGroup(2, 0.9)).toBe(0)
  })

  it('scales with the fraction and the group size', () => {
    expect(calvesForGroup(8, 0.25)).toBe(2) // round(2) = 2
    expect(calvesForGroup(12, 0.25)).toBe(3) // round(3) = 3
    expect(calvesForGroup(20, 0.25)).toBe(5)
  })

  it('never exceeds floor(n/2), so every calf keeps its own distinct parent', () => {
    // floor(n/2) parents are available; the count may never outrun them.
    for (const n of [3, 4, 5, 6, 7, 8, 20, 40]) {
      expect(calvesForGroup(n, 1)).toBe(Math.floor(n / 2)) // fraction 1 → capped at floor(n/2)
    }
  })

  it('always raises at least one juvenile for a group of three or more', () => {
    expect(calvesForGroup(3, 0)).toBe(1) // fraction 0 still floors at 1 (herds raise young)
    expect(calvesForGroup(10, 0.01)).toBe(1)
  })
})

describe('drinkCatchment (point 135c — the drinking belt survives the widened rivers)', () => {
  it('nearly closes in the rains, opens wide in the dry — width-independent belt', () => {
    // The belt (catchment minus half-width) is width-independent.
    expect(drinkCatchment(0.17, 0) - 0.17).toBeCloseTo(0.06, 9)
    expect(drinkCatchment(0.272, 0) - 0.272).toBeCloseTo(0.06, 9)
    // The dry season opens it to 0.43 past the waterline — a strict
    // superset of the wet belt, so dry drinkers >= wet drinkers by geometry.
    expect(drinkCatchment(0.272, 1) - 0.272).toBeCloseTo(0.43, 9)
    expect(drinkCatchment(0.272, 1)).toBeGreaterThan(drinkCatchment(0.272, 0))
    // Clamped dryness.
    expect(drinkCatchment(0.272, 2)).toBeCloseTo(drinkCatchment(0.272, 1), 9)
  })
})

describe('the food web (design.md §19.3 — the giraffe joins as LION-ONLY prey, point 124)', () => {
  it('only the lion takes giraffe; cheetah, leopard and hyena never do', () => {
    expect(PREDATOR_PREY.lion).toContain('giraffe')
    expect(PREDATOR_PREY.cheetah).not.toContain('giraffe')
    expect(PREDATOR_PREY.leopard).not.toContain('giraffe')
    expect(PREDATOR_PREY.hyena).not.toContain('giraffe')
  })

  it('giraffe is huntable exactly in the regions its ambient savanna herds live: east and south', () => {
    const withGiraffe = (Object.keys(REGION_PREY) as Array<keyof typeof REGION_PREY>).filter((r) =>
      REGION_PREY[r].includes('giraffe'),
    )
    expect(withGiraffe.sort()).toEqual(['east', 'south'])
  })

  it('every region prey pool stays inside some resident predator food web (a victim hunt always finds a fit predator)', () => {
    // The lion takes every prey kind, so no pool member is unhuntable.
    for (const pool of Object.values(REGION_PREY)) {
      for (const p of pool) expect(PREDATOR_PREY.lion).toContain(p)
    }
  })
})

describe('defendChance / parentDefends (design.md §19.8, points 124/125 — the defence matrix)', () => {
  // The shipped balance weights (src/config/balance.ts) — asserted here so a
  // recalibration that breaks the LEGIBLE RULE (ordered both ways) fails fast.
  const weights = {
    preyWeapon: { giraffe: 1.5, zebra: 1.0, wildebeest: 0.7, warthog: 0.7, antelope: 0.25 },
    predatorFlight: { cheetah: 1.0, leopard: 0.85, hyena: 0.7, lion: 0.5 },
    killFlight: { cheetah: 0.5, leopard: 0.25, hyena: 0.15, lion: 0 },
  }
  const CAP = 0.95
  // Ascending defence chance: predators along the INVERSE of §14.1's danger
  // order (src/systems/events.ts), prey along their weapon strength.
  const PREDATORS_ASC = ['lion', 'hyena', 'leopard', 'cheetah'] as const
  const PREY_ASC = ['antelope', 'wildebeest', 'warthog', 'zebra', 'giraffe'] as const
  /** Strictly rising, except where both sides already sit at the 0.95 cap
   *  (the giraffe/zebra top pairings) or the equality is explicitly allowed
   *  (wildebeest == warthog: horns vs tusks, both mid-tier). */
  const expectRise = (lo: number, hi: number, equalOk = false) => {
    if (lo === CAP && hi === CAP) return
    if (equalOk) expect(hi).toBeGreaterThanOrEqual(lo)
    else expect(hi).toBeGreaterThan(lo)
  }

  it('for each prey the chance rises as the predator gets lighter (inverse §14.1 danger order)', () => {
    for (const prey of PREY_ASC) {
      for (let i = 1; i < PREDATORS_ASC.length; i++) {
        expectRise(
          defendChance(prey, PREDATORS_ASC[i - 1], weights),
          defendChance(prey, PREDATORS_ASC[i], weights),
        )
      }
    }
  })

  it('for each predator the chance rises with the prey defence (wildebeest == warthog allowed)', () => {
    for (const predator of PREDATORS_ASC) {
      for (let i = 1; i < PREY_ASC.length; i++) {
        const equalOk = PREY_ASC[i - 1] === 'wildebeest' && PREY_ASC[i] === 'warthog'
        expectRise(
          defendChance(PREY_ASC[i - 1], predator, weights),
          defendChance(PREY_ASC[i], predator, weights),
          equalOk,
        )
      }
    }
  })

  it('every pairing stays a probability within [0, 0.95]', () => {
    for (const prey of PREY_ASC) {
      for (const predator of PREDATORS_ASC) {
        const c = defendChance(prey, predator, weights)
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(CAP)
      }
    }
  })

  it('giraffe-vs-lion keeps the shipped point-124 value and reads clearly better than antelope-vs-lion', () => {
    expect(defendChance('giraffe', 'lion', weights)).toBeCloseTo(0.75, 10)
    expect(defendChance('antelope', 'lion', weights)).toBeCloseTo(0.125, 10)
    // Legible as a rule: the giraffe's kick is several times the antelope's luck.
    expect(defendChance('giraffe', 'lion', weights)).toBeGreaterThan(4 * defendChance('antelope', 'lion', weights))
  })

  it('the product caps at 0.95 — no defence is a certainty (giraffe-vs-cheetah)', () => {
    expect(defendChance('giraffe', 'cheetah', weights)).toBe(0.95) // raw 1.5 × 1.0
    expect(parentDefends('giraffe', 'cheetah', 0.9499, weights)).toBe(true)
    expect(parentDefends('giraffe', 'cheetah', 0.95, weights)).toBe(false)
  })

  it('a species missing on either side has chance 0 and never defends', () => {
    expect(defendChance('elephant', 'lion', weights)).toBe(0)
    expect(defendChance('giraffe', 'crocodile', weights)).toBe(0)
    expect(parentDefends('elephant', 'lion', 0, weights)).toBe(false)
    expect(parentDefends('giraffe', 'crocodile', 0, weights)).toBe(false)
  })

  it('is boundary-exact at forced roll extremes: roll < chance defends, roll >= chance is taken', () => {
    expect(parentDefends('giraffe', 'lion', 0, weights)).toBe(true)
    expect(parentDefends('giraffe', 'lion', 0.7499, weights)).toBe(true)
    expect(parentDefends('giraffe', 'lion', 0.75, weights)).toBe(false)
    expect(parentDefends('giraffe', 'lion', 1, weights)).toBe(false)
    expect(parentDefends('antelope', 'lion', 0.1249, weights)).toBe(true)
    expect(parentDefends('antelope', 'lion', 0.125, weights)).toBe(false)
  })
})

describe('killChance / parentAttackOutcome (design.md §19.8, point 146 — revenge)', () => {
  // Swept against the SHIPPED balance, not a local mirror: a recalibration
  // that lets revenge outgrow the drive-off — or touch the lion — fails here.
  const shipped = balance.parentDefense
  const PREYS = Object.keys(shipped.preyWeapon)
  const PREDATORS = Object.keys(shipped.predatorFlight)

  it('maps deterministically with boundary-exact rolls (one roll, nested bands)', () => {
    // giraffe vs cheetah: killChance = (1.5 − 0.5) × 0.5 = 0.5,
    // defendChance = 0.95 (capped raw 1.5 × 1.0).
    expect(killChance('giraffe', 'cheetah', shipped)).toBeCloseTo(0.5, 10)
    expect(parentAttackOutcome('giraffe', 'cheetah', 0, shipped)).toBe('kill')
    expect(parentAttackOutcome('giraffe', 'cheetah', 0.4999, shipped)).toBe('kill')
    expect(parentAttackOutcome('giraffe', 'cheetah', 0.5, shipped)).toBe('driveOff')
    expect(parentAttackOutcome('giraffe', 'cheetah', 0.9499, shipped)).toBe('driveOff')
    expect(parentAttackOutcome('giraffe', 'cheetah', 0.95, shipped)).toBe('taken')
    expect(parentAttackOutcome('giraffe', 'cheetah', 1, shipped)).toBe('taken')
    // giraffe vs lion: killChance 0 — a roll of 0 is a drive-off, never a kill.
    expect(parentAttackOutcome('giraffe', 'lion', 0, shipped)).toBe('driveOff')
    expect(parentAttackOutcome('giraffe', 'lion', 0.7499, shipped)).toBe('driveOff')
    expect(parentAttackOutcome('giraffe', 'lion', 0.75, shipped)).toBe('taken')
  })

  it('forceOutcome (test-only) short-circuits the roll (point 177 determinism)', () => {
    // The 146/145c verifications set this so a single attempt lands the outcome
    // under test regardless of the resolution-position-hashed roll — replacing a
    // retry-until-success loop. It never overrides in normal play (undefined).
    for (const roll of [0, 0.5, 0.96, 1]) {
      expect(parentAttackOutcome('antelope', 'hyena', roll, { ...shipped, forceOutcome: 'kill' })).toBe('kill')
      expect(parentAttackOutcome('giraffe', 'lion', roll, { ...shipped, forceOutcome: 'driveOff' })).toBe('driveOff')
    }
    // Absent (shipped) it never forces: a roll of 1 is still 'taken'. The shipped
    // balance's type has no forceOutcome (it is a test-only extension of the weights
    // param), so read it through a cast to assert it never leaked into the config.
    expect((shipped as { forceOutcome?: unknown }).forceOutcome).toBeUndefined()
    expect(parentAttackOutcome('giraffe', 'cheetah', 1, shipped)).toBe('taken')
  })

  it('killing is harder than driving off: killChance <= defendChance for EVERY pair (swept)', () => {
    for (const prey of PREYS) {
      for (const predator of PREDATORS) {
        expect(killChance(prey, predator, shipped)).toBeLessThanOrEqual(
          defendChance(prey, predator, shipped),
        )
      }
    }
  })

  it('nothing kills a lion — killChance 0 for every prey (swept)', () => {
    for (const prey of PREYS) {
      expect(killChance(prey, 'lion', shipped)).toBe(0)
      expect(parentAttackOutcome(prey, 'lion', 0, shipped)).not.toBe('kill')
    }
  })

  it('the antelope kills nothing — the (weapon − 0.5) gate, swept over every predator', () => {
    for (const predator of PREDATORS) {
      expect(killChance('antelope', predator, shipped)).toBe(0)
      expect(parentAttackOutcome('antelope', predator, 0, shipped)).not.toBe('kill')
    }
  })

  it('a giraffe and a zebra CAN kill a cheetah (chance > 0), and a missing species cannot', () => {
    expect(killChance('giraffe', 'cheetah', shipped)).toBeGreaterThan(0)
    expect(killChance('zebra', 'cheetah', shipped)).toBeGreaterThan(0)
    expect(killChance('elephant', 'cheetah', shipped)).toBe(0)
    expect(killChance('giraffe', 'crocodile', shipped)).toBe(0)
  })
})

describe('the lioness defends her cub against a hyena (design.md §19.8, point 145c)', () => {
  const shipped = balance.parentDefense

  it('the lioness routs a lone hyena: defendChance caps at 0.95', () => {
    // preyWeapon.lion 2.0 × predatorFlight.hyena 0.7 = 1.4, capped at 0.95 —
    // the strongest defence in the game: a mother lion dominates a hyena.
    expect(defendChance('lion', 'hyena', shipped)).toBe(0.95)
  })

  it('she can kill it, but driving off is far more common (register: sometimes, not often)', () => {
    // killChance = (2.0 − 0.5) × killFlight.hyena 0.15 = 0.225 — real, but well
    // below the 0.95 drive-off, so the hyena usually just flees.
    expect(killChance('lion', 'hyena', shipped)).toBeCloseTo(0.225, 10)
    expect(killChance('lion', 'hyena', shipped)).toBeLessThan(defendChance('lion', 'hyena', shipped))
  })

  it('the three-way outcome is boundary-exact: kill < 0.225 <= driveOff < 0.95 <= taken', () => {
    expect(parentAttackOutcome('lion', 'hyena', 0, shipped)).toBe('kill')
    expect(parentAttackOutcome('lion', 'hyena', 0.2249, shipped)).toBe('kill')
    expect(parentAttackOutcome('lion', 'hyena', 0.225, shipped)).toBe('driveOff')
    expect(parentAttackOutcome('lion', 'hyena', 0.9499, shipped)).toBe('driveOff')
    expect(parentAttackOutcome('lion', 'hyena', 0.95, shipped)).toBe('taken')
    expect(parentAttackOutcome('lion', 'hyena', 1, shipped)).toBe('taken')
  })

  it('the cub is rarely lost: the taken band is only the top 5%', () => {
    // 1 − defendChance = 0.05 — a poignant but uncommon ending (the lioness
    // stands vigil), consistent with the mother routing the threat.
    expect(1 - defendChance('lion', 'hyena', shipped)).toBeCloseTo(0.05, 10)
  })
})

describe('water-sheet standing anchors (point 196)', () => {
  it('sheetAnchorY measures from the rendered surface, dipped by the body depth', () => {
    // Bed 1.0 far below a 2.0 sheet: a chest-deep wader stands at 1.68 —
    // anchoring to the bed instead read it a full channel depth too low.
    expect(sheetAnchorY(2.0, 1.0, 0.32)).toBeCloseTo(1.68, 10)
    // The struggling calf's shallow dip.
    expect(sheetAnchorY(2.0, 1.0, 0.05)).toBeCloseTo(1.95, 10)
  })

  it('a missed edge texel falls back to the bed plus the nominal ribbon lift', () => {
    expect(sheetAnchorY(null, 1.0, 0.05)).toBeCloseTo(1.25, 10)
  })

  it('a wader stands legs-in-the-sheet over deep water but on the bottom at the shallow edge', () => {
    // Deep spot on an elevated lake: surface 2.0, bed 1.0 -> wade depth 0.25.
    expect(waderStandY(1.0, 2.0)).toBeCloseTo(1.75, 10)
    // Shallow edge: the bed is above the wade depth -> stand on the bottom.
    expect(waderStandY(1.9, 2.0)).toBeCloseTo(1.9, 10)
  })

  it('the wader never sinks below the world floor', () => {
    expect(waderStandY(-0.5, null)).toBeCloseTo(0.02, 10)
  })
})

describe('ambientSavannaSpecies (point 208 A2 — visible herds match the region pool)', () => {
  const regions = ['east', 'south', 'central', 'west', 'north'] as const

  it('never seeds a grazer a region does not hold (swept over the roll range)', () => {
    for (const region of regions) {
      const pool = REGION_PREY[region]
      for (let r = 0; r < 1; r += 0.001) {
        const s = ambientSavannaSpecies(region, r)
        if (s === null || s === 'elephant') continue
        expect(pool).toContain(s) // the grazer is always in the region's own pool
      }
    }
  })

  it('keeps zebra, wildebeest and giraffe out of the west, central and north', () => {
    for (const region of ['west', 'central', 'north'] as const) {
      for (let r = 0; r < 1; r += 0.001) {
        const s = ambientSavannaSpecies(region, r)
        expect(s).not.toBe('zebra')
        expect(s).not.toBe('wildebeest')
        expect(s).not.toBe('giraffe')
      }
    }
  })

  it('roams elephants on every savanna and leaves the high band empty', () => {
    for (const region of regions) {
      expect(ambientSavannaSpecies(region, 0.05)).toBe('elephant')
      expect(ambientSavannaSpecies(region, 0.9)).toBeNull()
    }
  })

  it('still offers the east its full plains variety', () => {
    const seen = new Set<string>()
    for (let r = 0.12; r < 0.62; r += 0.005) {
      const s = ambientSavannaSpecies('east', r)
      if (s && s !== 'elephant') seen.add(s)
    }
    // Every east grazer appears across the band (no collapse to one species).
    for (const g of REGION_PREY.east) expect(seen.has(g)).toBe(true)
  })
})

describe('claimedByAnotherDrama (point 197 — one actor per emergent drama)', () => {
  const base = { isLionVictim: false }

  it('is false for a free animal', () => {
    expect(claimedByAnotherDrama(base)).toBe(false)
  })

  it('is true for every already-owned state', () => {
    expect(claimedByAnotherDrama({ ...base, caught: 0 })).toBe(true)
    expect(claimedByAnotherDrama({ ...base, inWater: 1.2 })).toBe(true)
    expect(claimedByAnotherDrama({ ...base, mired: 0 })).toBe(true)
    expect(claimedByAnotherDrama({ ...base, crossing: { tx: 0, tz: 0, time: 0 } })).toBe(true)
    expect(claimedByAnotherDrama({ ...base, fireTrapped: 3 })).toBe(true)
    expect(claimedByAnotherDrama({ ...base, isLionVictim: true })).toBe(true)
  })

  it('treats a zero timer as owned (the drama just started)', () => {
    // caught/mired/fireTrapped use `!== undefined`, so a 0 counter still counts.
    expect(claimedByAnotherDrama({ ...base, caught: 0 })).toBe(true)
    expect(claimedByAnotherDrama({ ...base, fireTrapped: 0 })).toBe(true)
  })
})
