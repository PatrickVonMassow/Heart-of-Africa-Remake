// Property fuzzing + distribution checks (point 207(iii)): random-sample the
// state space (positions, calendar days, herd sizes, headings) with the seeded
// PRNG and run the CHEAP PURE invariants on thousands of states — the edge
// cases the designed test grid misses — then collect distributions over long
// sampled runs and assert they are NOT degenerate (the 135/169 variety class).
// Every violation reports its seed + offending state, so it replays exactly.

import { describe, expect, it } from 'vitest'
import { createFuzzRng, hashCell01, type FuzzRng } from './fuzzRandom'
import {
  clampDay,
  climateZoneAt,
  coldnessAt,
  dayOfMonthJump,
  dayOfYear,
  dayOfYearJump,
  effectiveWetness,
  floraGreennessAt,
  hailAt,
  harmattanAt,
  harmattanSkyParams,
  karifAt,
  lastDay,
  nileFloodAt,
  okavangoFloodAt,
  rainAmount,
  SEASON_SLOTS,
  seasonFogParams,
  seasonSlotAt,
  slotGreenness,
  slotWetness,
  sunDimFactor,
  thunderDelaySeconds,
  thunderstormAt,
  wetnessAt,
  advanceGroundWetness,
  groundWetnessFactor,
  skyOvercastParams,
} from './season'
import {
  ambientSavannaSpecies,
  calfFleeStep,
  calvesForGroup,
  channelDriftStep,
  committedFleeHeading,
  crocodileGripExpired,
  crocodileIdleYaw,
  CROCODILE_IDLE_SWAY_AMP,
  crocodileLungeReady,
  defendChance,
  deflectAroundCircle,
  deflectedStep,
  edgeSeparationPush,
  escapeCorridorHeading,
  fleeHeading,
  gambolState,
  killChance,
  LANDED_BIRD_HOVER,
  landedBirdClearance,
  landedBirdClearancePosed,
  leashedGambolDir,
  mireFate,
  mireRoll,
  offscreenRingSpawn,
  parentAttackOutcome,
  pickOffscreenLandAnchor,
  PREDATOR_PREY,
  REGION_PREDATORS,
  REGION_PREY,
  segPointDist,
  separationPush,
  trampleKills,
  elephantWouldTrample,
  turnToward,
  vicinitySeedBounds,
  waterStruggleFate,
  FLEE_COMMIT_MARGIN,
} from '../scenes/travel/wildlifeBehavior'
import { balance } from '../config/balance'
import type { RegionId } from '../world/geo'

const REGIONS: RegionId[] = ['north', 'west', 'central', 'east', 'south']
const START_YEAR = 1890
const LAST = lastDay(START_YEAR)

// Continent bounds (the season field's generous trim, src/render/seasonField.ts).
const LAT_MIN = -36
const LAT_MAX = 38
const LON_MIN = -20
const LON_MAX = 55

/** Run `check` over `n` states drawn from a seeded rng; a violation rethrows
 *  with the seed, iteration and offending state so it reproduces exactly. */
function fuzz<T>(
  name: string,
  seed: number,
  n: number,
  gen: (rng: FuzzRng) => T,
  check: (state: T) => void,
): void {
  const rng = createFuzzRng(seed)
  for (let i = 0; i < n; i++) {
    const state = gen(rng)
    try {
      check(state)
    } catch (e) {
      throw new Error(
        `[fuzz ${name}] invariant violated at iteration ${i} (seed ${seed})\n` +
          `state=${JSON.stringify(state)}\n${String(e)}`,
      )
    }
  }
}

const finite = (v: number): boolean => Number.isFinite(v)
const in01 = (v: number): boolean => finite(v) && v >= 0 && v <= 1
/** Absolute angular distance across the ±π seam. */
function angDist(a: number, b: number): number {
  let d = a - b
  while (d > Math.PI) d -= Math.PI * 2
  while (d < -Math.PI) d += Math.PI * 2
  return Math.abs(d)
}
/** Mean resultant length of a heading sample: ~0 uniform, 1 degenerate. */
function meanResultantLength(headings: number[]): number {
  let sx = 0
  let sz = 0
  for (const h of headings) {
    sx += Math.sin(h)
    sz += Math.cos(h)
  }
  return Math.hypot(sx, sz) / headings.length
}

// ---------------------------------------------------------------------------
// (a) INVARIANT FUZZING
// ---------------------------------------------------------------------------

describe('invariant fuzzing: season model over random (day, lat, lon, elevation)', () => {
  it('every climate reading is finite, bounded and cross-consistent (5000 states)', () => {
    fuzz(
      'season',
      0xa11ce,
      5000,
      (rng) => ({
        day: rng.range(0, LAST),
        lat: rng.range(LAT_MIN, LAT_MAX),
        lon: rng.range(LON_MIN, LON_MAX),
        elev: rng.range(-160, 4500),
        slot: rng.int(0, SEASON_SLOTS.length - 1),
        override: rng.range(-1, 2),
        seed: rng.int(-1e9, 1e9),
      }),
      (s) => {
        const wet = wetnessAt(s.day, s.lat, s.lon, START_YEAR, s.elev)
        expect(in01(wet)).toBe(true)
        expect(in01(floraGreennessAt(s.day, s.lat, s.lon, START_YEAR, s.elev))).toBe(true)
        expect(in01(coldnessAt(s.day, s.lat, s.lon, START_YEAR, s.elev))).toBe(true)
        expect(in01(harmattanAt(s.day, s.lat, s.lon, START_YEAR))).toBe(true)
        expect(in01(karifAt(s.day, s.lat, s.lon, START_YEAR, s.elev))).toBe(true)
        expect(in01(nileFloodAt(s.day, START_YEAR))).toBe(true)
        expect(in01(okavangoFloodAt(s.day, START_YEAR))).toBe(true)
        // The zone is always one of the season slots (slot 0 is hyper-arid).
        const zone = climateZoneAt(s.lat, s.lon, s.elev)
        expect((SEASON_SLOTS as readonly string[]).includes(zone)).toBe(true)
        const slot = seasonSlotAt(s.lat, s.lon, s.elev)
        expect(Number.isInteger(slot)).toBe(true)
        expect(slot).toBeGreaterThanOrEqual(0)
        expect(slot).toBeLessThan(SEASON_SLOTS.length)
        // Storm gates: hail/thunder fire ONLY inside genuinely heavy rain.
        const hail = hailAt(s.day, s.lat, s.lon, START_YEAR, s.elev)
        const thunder = thunderstormAt(s.day, s.lat, s.lon, START_YEAR, s.elev)
        expect(in01(hail)).toBe(true)
        expect(in01(thunder)).toBe(true)
        if (hail > 0 || thunder > 0) {
          expect(rainAmount(wet, 1)).toBeGreaterThanOrEqual(0.6)
        }
        // Slot curves bounded; hyper-arid slot 0 never greens without override.
        expect(in01(slotWetness(s.day, s.slot, START_YEAR, s.lat))).toBe(true)
        expect(in01(slotGreenness(s.day, s.slot, START_YEAR, null))).toBe(true)
        expect(slotGreenness(s.day, 0, START_YEAR, null)).toBe(0)
        // The §21 override is clamped into [0,1] wherever it applies.
        const ov = Math.min(1, Math.max(0, s.override))
        expect(effectiveWetness(s.day, s.lat, s.lon, START_YEAR, s.elev, s.override)).toBe(ov)
        expect(slotGreenness(s.day, s.slot, START_YEAR, s.override)).toBe(ov)
        // Calendar helpers stay inside the game's window.
        expect(clampDay(s.day, START_YEAR)).toBeLessThanOrEqual(LAST)
        const doy = dayOfYear(s.day, START_YEAR)
        expect(doy).toBeGreaterThanOrEqual(0)
        expect(doy).toBeLessThan(366.5)
        for (const delta of [-1, 1]) {
          const jumped = dayOfYearJump(s.day, delta, START_YEAR)
          expect(finite(jumped)).toBe(true)
          expect(jumped).toBeLessThanOrEqual(LAST)
        }
        const mj = dayOfMonthJump(s.day, 1 + (s.slot % 12), START_YEAR)
        expect(finite(mj)).toBe(true)
        // Display curves: bounded, never negative, never over-bright.
        const fog = seasonFogParams(s.override, s.override)
        expect(fog.rangeFactor).toBeGreaterThanOrEqual(0.6)
        expect(fog.rangeFactor).toBeLessThanOrEqual(1)
        expect(in01(fog.grayMix)).toBe(true)
        const dim = sunDimFactor(s.override, s.override)
        expect(dim).toBeGreaterThanOrEqual(0.6)
        expect(dim).toBeLessThanOrEqual(1)
        const hz = harmattanSkyParams(s.override, s.override)
        expect(in01(hz.paleMix)).toBe(true)
        expect(in01(hz.sunRedden)).toBe(true)
        expect(in01(hz.haloMute)).toBe(true)
        expect(hz.rangeFactor).toBeGreaterThanOrEqual(0.45 - 1e-9)
        expect(hz.rangeFactor).toBeLessThanOrEqual(1)
        const sky = skyOvercastParams(s.override, s.override)
        expect(in01(sky.grayMix)).toBe(true)
        expect(in01(sky.cloudBoost)).toBe(true)
        expect(in01(advanceGroundWetness(s.override, s.override, Math.abs(s.override)))).toBe(true)
        expect(in01(groundWetnessFactor(s.override, s.override, ov))).toBe(true)
        // The thunder lag is the distance-plausible 1..4 s for ANY strike seed.
        const delay = thunderDelaySeconds(s.seed)
        expect(delay).toBeGreaterThanOrEqual(1)
        expect(delay).toBeLessThanOrEqual(4)
      },
    )
  })
})

describe('invariant fuzzing: wildlife heading/geometry helpers', () => {
  it('flee/turn/deflect/separation hold their contracts (5000 states)', () => {
    fuzz(
      'geometry',
      0xbee5,
      5000,
      (rng) => {
        const threats: [number, number][] = []
        const nThreats = rng.int(0, 6)
        const x = rng.range(-400, 400)
        const z = rng.range(-400, 400)
        for (let i = 0; i < nThreats; i++) {
          threats.push([x + rng.range(-30, 30), z + rng.range(-30, 30)])
        }
        return {
          x,
          z,
          threats,
          radius: rng.range(1, 25),
          current: rng.range(-10 * Math.PI, 10 * Math.PI),
          target: rng.range(-10 * Math.PI, 10 * Math.PI),
          maxStep: rng.range(0, Math.PI),
          held: rng.bool(0.2) ? undefined : rng.angle(),
          pick: rng.angle(),
          from: [rng.range(-10, 10), rng.range(-10, 10)] as const,
          to: [rng.range(-10, 10), rng.range(-10, 10)] as const,
          obst: [rng.range(-10, 10), rng.range(-10, 10)] as const,
          obstR: rng.range(0.1, 5),
          neighbors: Array.from({ length: rng.int(0, 5) }, () => [
            rng.range(-5, 5),
            rng.range(-5, 5),
            rng.range(0.1, 2),
          ] as [number, number, number]),
          waterAngle: rng.angle(),
          seg: [rng.range(-10, 10), rng.range(-10, 10), rng.range(-10, 10), rng.range(-10, 10)] as const,
          p: [rng.range(-10, 10), rng.range(-10, 10)] as const,
          hop: rng.range(0, 1),
          baseY: rng.range(-5, 10),
          ground: rng.range(-5, 12),
          pitch: rng.range(0, 1.2),
          yaw: rng.angle(),
          scale: rng.range(0.5, 2),
          t: rng.range(0, 1000),
          phase: rng.range(0, 1),
        }
      },
      (s) => {
        // fleeHeading: bounded angle; a lone genuine threat is always fled AWAY.
        const h = fleeHeading(s.x, s.z, s.threats, s.radius)
        if (h !== null) {
          expect(finite(h)).toBe(true)
          expect(Math.abs(h)).toBeLessThanOrEqual(Math.PI + 1e-9)
        }
        const anyClearlyInRange = s.threats.some(([tx, tz]) => {
          const d = Math.hypot(s.x - tx, s.z - tz)
          return d > 0.01 && d < s.radius * 0.999
        })
        if (anyClearlyInRange) expect(h).not.toBeNull()
        if (s.threats.length === 1) {
          const d0 = Math.hypot(s.x - s.threats[0][0], s.z - s.threats[0][1])
          if (d0 > 0.05 && d0 < s.radius * 0.999 && h !== null) {
            // One small step along the flee heading strictly increases distance.
            const nd = Math.hypot(
              s.x + Math.sin(h) * 0.01 - s.threats[0][0],
              s.z + Math.cos(h) * 0.01 - s.threats[0][1],
            )
            expect(nd).toBeGreaterThan(d0)
          }
        }
        // turnToward: capped step, never overshoots past the cap, never turns away.
        const turned = turnToward(s.current, s.target, s.maxStep)
        expect(Math.abs(turned - s.current)).toBeLessThanOrEqual(s.maxStep + 1e-9)
        expect(angDist(turned, s.target)).toBeLessThanOrEqual(angDist(s.current, s.target) + 1e-9)
        // committedFleeHeading: held inside the margin, the fresh pick outside.
        const committed = committedFleeHeading(s.held, s.pick)
        if (s.held === undefined) expect(committed).toBe(s.pick)
        else if (angDist(s.pick, s.held) <= FLEE_COMMIT_MARGIN) expect(committed).toBe(s.held)
        else expect(committed).toBe(s.pick)
        // deflectAroundCircle: the result NEVER rests inside the body circle.
        const [ex, ez] = deflectAroundCircle(
          s.from[0], s.from[1], s.to[0], s.to[1], s.obst[0], s.obst[1], s.obstR,
        )
        expect(finite(ex) && finite(ez)).toBe(true)
        const toInside =
          Math.hypot(s.to[0] - s.obst[0], s.to[1] - s.obst[1]) < s.obstR ||
          Math.hypot(s.from[0] - s.obst[0], s.from[1] - s.obst[1]) < s.obstR
        if (toInside || (ex !== s.to[0] || ez !== s.to[1])) {
          // Whenever the deflection fired (or the endpoints sat inside), the
          // returned point is pushed out to the body edge.
          if (ex !== s.to[0] || ez !== s.to[1]) {
            expect(Math.hypot(ex - s.obst[0], ez - s.obst[1])).toBeGreaterThanOrEqual(s.obstR - 1e-6)
          }
        }
        // separationPush: zero without an overlap; finite always.
        const [px, pz] = separationPush(0, 0, s.neighbors)
        expect(finite(px) && finite(pz)).toBe(true)
        const anyOverlap = s.neighbors.some(([nx, nz, minD]) => Math.hypot(nx, nz) < minD)
        if (!anyOverlap) {
          expect(px).toBe(0)
          expect(pz).toBe(0)
        }
        // edgeSeparationPush: the resolved push NEVER leads into the water.
        const waterDir: [number, number] = [Math.sin(s.waterAngle), Math.cos(s.waterAngle)]
        const [wx, wz] = edgeSeparationPush(0, 0, s.neighbors, waterDir)
        expect(finite(wx) && finite(wz)).toBe(true)
        expect(wx * waterDir[0] + wz * waterDir[1]).toBeLessThanOrEqual(1e-9)
        // segPointDist: a true distance — never negative, never beyond either end.
        const sd = segPointDist(s.seg[0], s.seg[1], s.seg[2], s.seg[3], s.p[0], s.p[1])
        const dToA = Math.hypot(s.p[0] - s.seg[0], s.p[1] - s.seg[1])
        const dToB = Math.hypot(s.p[0] - s.seg[2], s.p[1] - s.seg[3])
        expect(sd).toBeGreaterThanOrEqual(0)
        expect(sd).toBeLessThanOrEqual(Math.min(dToA, dToB) + 1e-9)
        // trample: a standing elephant never kills; outside the reach never kills.
        expect(trampleKills(0, 0, s.obst[0], s.obst[1], s.p[0], s.p[1])).toBe(false)
        const victimDist = Math.hypot(s.p[0] - s.obst[0], s.p[1] - s.obst[1])
        expect(
          elephantWouldTrample(
            1, 0, s.obst[0], s.obst[1], s.p[0], s.p[1], Math.max(0, victimDist - 1e-6),
          ),
        ).toBe(false)
        // gambol/leash: bounded output, no NaN ever.
        const g = gambolState(s.t, s.phase)
        if (g !== null) {
          expect(finite(g.heading)).toBe(true)
          expect(in01(g.hop)).toBe(true)
        }
        const [gx, gz] = leashedGambolDir(s.waterAngle, s.from[0], s.from[1],
          Math.hypot(s.from[0], s.from[1]), s.obstR)
        expect(finite(gx) && finite(gz)).toBe(true)
        expect(Math.hypot(gx, gz)).toBeLessThanOrEqual(1 + 1e-9)
        // Crocodile: the idle sway is a BOUNDED oscillation about the rest yaw.
        expect(Math.abs(crocodileIdleYaw(s.yaw, s.t, s.phase) - s.yaw)).toBeLessThanOrEqual(
          CROCODILE_IDLE_SWAY_AMP + 1e-12,
        )
        // Landed birds: clearance above their own ground never below the hover.
        expect(landedBirdClearance(s.baseY, s.ground, s.hop)).toBeGreaterThanOrEqual(
          LANDED_BIRD_HOVER - 1e-12,
        )
        expect(
          landedBirdClearancePosed(s.baseY, s.ground, s.hop, s.pitch, s.yaw, s.scale),
        ).toBeGreaterThanOrEqual(0.06 - 1e-9)
      },
    )
  })

  it('drama resolution predicates hold their boundaries (5000 states)', () => {
    fuzz(
      'drama',
      0xd7a3a,
      5000,
      (rng) => ({
        flow: rng.range(0, 3),
        seconds: rng.range(0, 60),
        selfRescue: rng.range(1, 20),
        drown: rng.range(1, 30),
        threshold: rng.range(0.1, 2),
        bankDist: rng.range(0, 2),
        bankReach: rng.range(0, 1),
        wetness: rng.range(0, 1),
        dryThreshold: rng.range(0, 1),
        chance: rng.range(0, 1),
        roll: rng.range(0, 1),
        mired: rng.range(0, 40),
        mireSeconds: rng.range(1, 30),
        grip: rng.range(0, 30),
        gripLimit: rng.range(1, 20),
        dist: rng.range(0, 10),
        atBank: rng.bool(),
        strikeRadius: rng.range(0, 5),
        radius: rng.range(1, 50),
        clearance: rng.range(0, 10),
        spread: rng.range(0, 5),
        margin: rng.range(0, 20),
      }),
      (s) => {
        // Water struggle: calm water NEVER drowns, a swollen current NEVER self-rescues.
        const fate = waterStruggleFate(s.flow, s.seconds, s.selfRescue, s.drown, s.threshold)
        expect(['struggling', 'self-rescue', 'drowned']).toContain(fate)
        if (s.flow >= s.threshold) expect(fate).not.toBe('self-rescue')
        else expect(fate).not.toBe('drowned')
        // Mire: only at the bank, only under the dryness threshold.
        const mired = mireRoll(s.bankDist, s.bankReach, s.wetness, s.dryThreshold, s.chance, s.roll)
        if (s.bankDist > s.bankReach || s.wetness >= s.dryThreshold) expect(mired).toBe(false)
        // Every mire resolves at its window.
        expect(mireFate(s.mired, s.mireSeconds)).toBe(s.mired >= s.mireSeconds ? 'released' : 'mired')
        // The crocodile grip deadline is monotone: once expired, always expired.
        if (crocodileGripExpired(s.grip, s.gripLimit)) {
          expect(crocodileGripExpired(s.grip + s.seconds, s.gripLimit)).toBe(true)
        }
        // The lunge fires only on a bank-stander inside the strike radius.
        const lunge = crocodileLungeReady(s.dist, s.atBank, s.strikeRadius)
        if (!s.atBank || s.dist > s.strikeRadius) expect(lunge).toBe(false)
        else expect(lunge).toBe(true)
        // Vicinity seed bounds: a consistent annulus inside the count radius.
        const b = vicinitySeedBounds(s.radius, s.clearance, s.spread, s.margin)
        expect(b.distMin).toBeLessThanOrEqual(b.distMax + 1e-12)
        expect(b.distMax).toBeLessThanOrEqual(b.countRadius + 1e-12)
        expect(b.countRadius).toBeGreaterThanOrEqual(s.clearance + s.spread - 1e-12)
      },
    )
  })

  it('walk steps never land on blocked ground in a hashed water world (3000 states)', () => {
    fuzz(
      'walk',
      0xc0a57,
      3000,
      (rng) => ({
        x: rng.range(-200, 200),
        z: rng.range(-200, 200),
        heading: rng.angle(),
        dist: rng.range(0.1, 2),
        salt: rng.int(1, 1e6),
        hunterX: rng.range(-200, 200),
        hunterZ: rng.range(-200, 200),
        minR: rng.range(5, 30),
        extra: rng.range(0.1, 40),
        rand01: rng.next(),
        stepX: rng.range(-1, 1),
        stepZ: rng.range(-1, 1),
        candidates: Array.from({ length: rng.int(0, 8) }, () => [
          rng.range(-200, 200),
          rng.range(-200, 200),
        ] as const),
      }),
      (s) => {
        const blocked = (x: number, z: number): boolean =>
          hashCell01(Math.floor(x), Math.floor(z), s.salt) < 0.35
        // deflectedStep: a landed step is dry and exactly `dist` long; a refused
        // step stands still.
        const step = deflectedStep(s.x, s.z, s.heading, s.dist, blocked)
        if (step.moved) {
          expect(blocked(step.x, step.z)).toBe(false)
          expect(Math.hypot(step.x - s.x, step.z - s.z)).toBeCloseTo(s.dist, 6)
        } else {
          expect(step.x).toBe(s.x)
          expect(step.z).toBe(s.z)
        }
        // calfFleeStep: same contract under the full corridor fallback.
        const flee = calfFleeStep(s.x, s.z, s.hunterX, s.hunterZ, s.dist, blocked)
        expect(finite(flee.heading)).toBe(true)
        if (flee.moved) {
          expect(blocked(flee.x, flee.z)).toBe(false)
          expect(Math.hypot(flee.x - s.x, flee.z - s.z)).toBeCloseTo(s.dist, 6)
        } else {
          expect(flee.x).toBe(s.x)
          expect(flee.z).toBe(s.z)
          expect(flee.corridor).toBeUndefined()
        }
        // escapeCorridorHeading: finite everywhere; exactly radial in open country.
        expect(finite(escapeCorridorHeading(s.x, s.z, s.heading, blocked))).toBe(true)
        expect(escapeCorridorHeading(s.x, s.z, s.heading, () => false)).toBe(s.heading)
        // channelDriftStep: drifts only within water, else stays put.
        const isWater = (x: number, z: number): boolean =>
          hashCell01(Math.floor(x), Math.floor(z), s.salt + 1) < 0.5
        const drift = channelDriftStep(s.x, s.z, s.stepX, s.stepZ, isWater)
        if (drift.x !== s.x || drift.z !== s.z) expect(isWater(drift.x, drift.z)).toBe(true)
        // offscreenRingSpawn: always inside the [minR, maxR] annulus; exactly on
        // the minR ring without a camera predicate.
        const maxR = s.minR + s.extra
        const bare = offscreenRingSpawn(s.x, s.z, s.minR, maxR, s.rand01)
        expect(Math.hypot(bare.x - s.x, bare.z - s.z)).toBeCloseTo(s.minR, 6)
        const offScreen = (x: number, z: number): boolean =>
          hashCell01(Math.floor(x / 8), Math.floor(z / 8), s.salt + 2) < 0.7
        const probed = offscreenRingSpawn(s.x, s.z, s.minR, maxR, s.rand01, offScreen)
        const pd = Math.hypot(probed.x - s.x, probed.z - s.z)
        expect(pd).toBeGreaterThanOrEqual(s.minR - 1e-6)
        expect(pd).toBeLessThanOrEqual(maxR + 1e-6)
        // pickOffscreenLandAnchor: null or genuinely (land AND off-screen) —
        // never an on-screen pop.
        const isLand = (x: number, z: number): boolean => !blocked(x, z)
        const onScreen = (x: number, z: number): boolean => !offScreen(x, z)
        const anchor = pickOffscreenLandAnchor(s.candidates, isLand, onScreen)
        if (anchor !== null) {
          expect(isLand(anchor[0], anchor[1])).toBe(true)
          expect(onScreen(anchor[0], anchor[1])).toBe(false)
        } else {
          for (const c of s.candidates) {
            expect(isLand(c[0], c[1]) && !onScreen(c[0], c[1])).toBe(false)
          }
        }
      },
    )
  })
})

describe('invariant fuzzing: herd sizes and the food web', () => {
  it('calf counts, species pools and defence bands hold (5000 states)', () => {
    const weights = balance.parentDefense
    const junkSpecies = ['flamingo', 'plover', 'crocodile', 'elephant', 'unknown-beast', '']
    const preySide = [...Object.keys(weights.preyWeapon), ...junkSpecies]
    const predatorSide = [...Object.keys(weights.predatorFlight), ...junkSpecies]
    fuzz(
      'foodweb',
      0xf00d,
      5000,
      (rng) => ({
        n: rng.int(0, 80),
        fraction: rng.next(),
        region: rng.pick(REGIONS),
        roll: rng.next(),
        prey: rng.pick(preySide),
        predator: rng.pick(predatorSide),
        outcomeRoll: rng.next(),
      }),
      (s) => {
        // calvesForGroup: exactly clamp(round(f·n), 1, floor(n/2)), 0 below 3.
        const calves = calvesForGroup(s.n, s.fraction)
        if (s.n < 3) expect(calves).toBe(0)
        else {
          expect(calves).toBe(
            Math.max(1, Math.min(Math.floor(s.n / 2), Math.round(s.fraction * s.n))),
          )
          expect(calves).toBeGreaterThanOrEqual(1)
          expect(calves).toBeLessThanOrEqual(Math.floor(s.n / 2))
        }
        // ambientSavannaSpecies: only the region's own pool, band edges exact.
        const species = ambientSavannaSpecies(s.region, s.roll)
        if (s.roll < 0.12) expect(species).toBe('elephant')
        else if (s.roll >= 0.62) expect(species).toBeNull()
        else expect(REGION_PREY[s.region]).toContain(species)
        // Defence matrix: probabilities bounded, kill band nested inside the
        // drive-off band, apex predators structurally unkillable.
        const dc = defendChance(s.prey, s.predator, weights)
        const kc = killChance(s.prey, s.predator, weights)
        expect(dc).toBeGreaterThanOrEqual(0)
        expect(dc).toBeLessThanOrEqual(0.95)
        expect(kc).toBeGreaterThanOrEqual(0)
        expect(kc).toBeLessThanOrEqual(dc + 1e-12)
        const outcome = parentAttackOutcome(s.prey, s.predator, s.outcomeRoll, weights)
        if (s.outcomeRoll < kc) expect(outcome).toBe('kill')
        else if (s.outcomeRoll < dc) expect(outcome).toBe('driveOff')
        else expect(outcome).toBe('taken')
        if (s.predator === 'lion' || s.predator === 'crocodile') expect(outcome).not.toBe('kill')
      },
    )
  })

  it('every regional predator finds regional prey (hunt viability sweep)', () => {
    for (const region of REGIONS) {
      for (const predator of REGION_PREDATORS[region]) {
        const huntable = PREDATOR_PREY[predator].filter((p) => REGION_PREY[region].includes(p))
        expect(huntable.length, `${predator} in ${region}`).toBeGreaterThan(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// (b) DISTRIBUTION NON-DEGENERACY (the 135/169 variety class)
// ---------------------------------------------------------------------------

describe('distribution non-degeneracy', () => {
  it('flee headings from uniformly-placed threats span the circle (point-135 class)', () => {
    const rng = createFuzzRng(0x135)
    const headings: number[] = []
    const octants = new Set<number>()
    for (let i = 0; i < 2000; i++) {
      const x = rng.range(-100, 100)
      const z = rng.range(-100, 100)
      const bearing = rng.angle()
      const d = rng.range(0.5, 9)
      const h = fleeHeading(x, z, [[x + Math.sin(bearing) * d, z + Math.cos(bearing) * d]], 10)
      expect(h).not.toBeNull()
      headings.push(h as number)
      octants.add(Math.floor((((h as number) + Math.PI) / (Math.PI * 2)) * 8) % 8)
    }
    // Uniform threats must yield near-uniform escapes: low mean resultant
    // length and every octant hit — an all-one-way flee is the 135 bug.
    expect(meanResultantLength(headings)).toBeLessThan(0.15)
    expect(octants.size).toBe(8)
  })

  it('calvesForGroup yields a real spread over herd sizes and fractions (point-169 class)', () => {
    const rng = createFuzzRng(0x169)
    const counts = new Set<number>()
    let max = 0
    for (let i = 0; i < 2000; i++) {
      const n = rng.int(3, 40)
      const f = rng.range(0.05, 0.5)
      const c = calvesForGroup(n, f)
      counts.add(c)
      max = Math.max(max, c)
    }
    expect(counts.size).toBeGreaterThanOrEqual(8) // not a constant
    expect(counts.has(1)).toBe(true) // small herds raise their single calf
    expect(max).toBeGreaterThanOrEqual(10) // big wet-fraction herds raise many
    // And at a FIXED fraction the count still scales with the herd size.
    const fixed = new Set<number>()
    for (let n = 3; n <= 40; n++) fixed.add(calvesForGroup(n, 0.25))
    expect(fixed.size).toBeGreaterThanOrEqual(4)
  })

  it('ambient savanna species cover each region pool at sane frequencies (208 A2 class)', () => {
    const allPrey = new Set<string>()
    for (const region of REGIONS) {
      const rng = createFuzzRng(0x208a2 + REGIONS.indexOf(region))
      const seen = new Map<string, number>()
      const N = 2000
      for (let i = 0; i < N; i++) {
        const s = ambientSavannaSpecies(region, rng.next())
        const key = s === null ? 'null' : s
        seen.set(key, (seen.get(key) ?? 0) + 1)
        if (s !== null && s !== 'elephant') allPrey.add(s)
      }
      // Every member of the region's pool actually appears, plus elephants and
      // empty rolls — the seeding is never a single-species monoculture.
      for (const prey of REGION_PREY[region]) {
        expect(seen.get(prey) ?? 0, `${prey} in ${region}`).toBeGreaterThan(0)
      }
      const elephantShare = (seen.get('elephant') ?? 0) / N
      const nullShare = (seen.get('null') ?? 0) / N
      expect(elephantShare).toBeGreaterThan(0.09)
      expect(elephantShare).toBeLessThan(0.15)
      expect(nullShare).toBeGreaterThan(0.34)
      expect(nullShare).toBeLessThan(0.42)
    }
    // Across the continent the visible herds span all five grazer species.
    expect(allPrey.size).toBe(5)
  })

  it('parentAttackOutcome resolves three ways at the designed rates (zebra vs cheetah)', () => {
    // Shipped weights: defend = min(1.0·1.0, .95) = 0.95, kill = 0.5·0.5 = 0.25
    // → kill 25%, driveOff 70%, taken 5%.
    const weights = balance.parentDefense
    const rng = createFuzzRng(0x146)
    const tally = { kill: 0, driveOff: 0, taken: 0 }
    const N = 4000
    for (let i = 0; i < N; i++) tally[parentAttackOutcome('zebra', 'cheetah', rng.next(), weights)]++
    expect(tally.kill / N).toBeGreaterThan(0.21)
    expect(tally.kill / N).toBeLessThan(0.29)
    expect(tally.driveOff / N).toBeGreaterThan(0.66)
    expect(tally.driveOff / N).toBeLessThan(0.74)
    expect(tally.taken / N).toBeGreaterThan(0.02)
    expect(tally.taken / N).toBeLessThan(0.09)
  })

  it('seasonal greenness swings on the savanna, stays flat in the Congo, Cairo stays rainless (115/116 class)', () => {
    const monthDays = Array.from({ length: 12 }, (_, m) => dayOfMonthJump(0, m + 1, START_YEAR))
    const sample = (lat: number, lon: number, elev: number): number[] =>
      monthDays.map((d) => floraGreennessAt(d, lat, lon, START_YEAR, elev))
    // East-rift savanna (Serengeti latitude): a real dry-wet swing that
    // bleaches all the way to straw in its dry season.
    const savanna = sample(-2.5, 34.8, 1100)
    expect(Math.max(...savanna) - Math.min(...savanna)).toBeGreaterThan(0.5)
    expect(Math.min(...savanna)).toBeLessThan(0.15)
    // Congo basin: NO dry season (the design bound: rain in every month) — the
    // flora never bleaches to straw, however its bimodal peaks move.
    const congo = sample(0.5, 20, 350)
    expect(Math.min(...congo)).toBeGreaterThan(0.3)
    for (const d of monthDays) {
      expect(wetnessAt(d, 0.5, 20, START_YEAR, 350)).toBeGreaterThan(0.3)
    }
    // Cairo: functionally Saharan, rainless in every month.
    for (const d of monthDays) {
      expect(wetnessAt(d, 30.05, 31.25, START_YEAR, 20)).toBeLessThanOrEqual(0.02)
    }
  })

  it('the remote-fed floods keep their researched cycles (138/139 class)', () => {
    const monthDays = Array.from({ length: 12 }, (_, m) => dayOfMonthJump(0, m + 1, START_YEAR))
    const nile = monthDays.map((d) => nileFloodAt(d, START_YEAR))
    const nileRange = Math.max(...nile) - Math.min(...nile)
    expect(nileRange).toBeGreaterThan(0.7)
    const nileCrestMonth = nile.indexOf(Math.max(...nile)) + 1
    expect([9, 10, 11]).toContain(nileCrestMonth) // crest arrives Sep-Nov (October at Cairo)
    expect(nile[3]).toBeLessThan(0.2) // April low water
    // Okavango inversion: full in July (the LOCAL dry season), low in December.
    const okavango = monthDays.map((d) => okavangoFloodAt(d, START_YEAR))
    expect(okavango[6]).toBeGreaterThan(0.8)
    expect(okavango[11]).toBeLessThan(0.3)
    expect(okavango[6] - okavango[11]).toBeGreaterThan(0.5)
  })

  it('thunder delays spread over the full 1-4 s band', () => {
    const delays = new Set<number>()
    let min = Infinity
    let max = -Infinity
    for (let seed = 0; seed < 1000; seed++) {
      const d = thunderDelaySeconds(seed)
      delays.add(d)
      min = Math.min(min, d)
      max = Math.max(max, d)
    }
    expect(delays.size).toBeGreaterThan(100) // not a handful of quantised values
    expect(min).toBeGreaterThanOrEqual(1)
    expect(max).toBeLessThanOrEqual(4)
    expect(max - min).toBeGreaterThan(2.4) // spans most of the band
  })

  it('thunderstorms strike a real but strict minority of heavy-storm days (Congo sweep)', () => {
    // Every integer day of the whole 1890-1895 window at a Congo point.
    const lat = 0.5
    const lon = 20
    const elev = 350
    let stormDays = 0
    let thunderDays = 0
    for (let day = 0; day <= LAST; day++) {
      const storm = rainAmount(wetnessAt(day, lat, lon, START_YEAR, elev), 1)
      if (storm < 0.6) continue
      stormDays++
      if (thunderstormAt(day, lat, lon, START_YEAR, elev) > 0) thunderDays++
    }
    expect(stormDays).toBeGreaterThan(50) // the basin genuinely storms
    expect(thunderDays).toBeGreaterThan(0) // thunder exists...
    expect(thunderDays).toBeLessThan(stormDays) // ...but never on every storm day
    const share = thunderDays / stormDays
    expect(share).toBeGreaterThan(0.15) // near the designed 0.35 gate
    expect(share).toBeLessThan(0.55)
  })

  it('coldness swings with latitude and stays flat at the equator', () => {
    const monthDays = Array.from({ length: 12 }, (_, m) => dayOfMonthJump(0, m + 1, START_YEAR))
    const swing = (lat: number, lon: number, elev: number): number => {
      const v = monthDays.map((d) => coldnessAt(d, lat, lon, START_YEAR, elev))
      return Math.max(...v) - Math.min(...v)
    }
    expect(swing(31.2, -7.9, 2500)).toBeGreaterThan(0.3) // High Atlas: real winters
    expect(swing(-29.5, 29.3, 2200)).toBeGreaterThan(0.3) // Drakensberg: real winters
    expect(swing(0.3, 32.5, 1100)).toBeLessThan(0.1) // equatorial: no cold season
  })
})
