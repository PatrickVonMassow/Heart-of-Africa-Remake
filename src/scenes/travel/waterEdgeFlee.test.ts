import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import {
  calfFollowAcrossWater,
  calfWaterCause,
  fleeHeading,
  fleeWaterStep,
  nearestBankTarget,
  resolveFleeTarget,
  safeBankTarget,
  swimBrakedPace,
  turnToward,
  waterBetween,
  FLIGHT_GRACE_SECONDS,
  type BankThreat,
  type FleeArbitrationState,
  type FleeThreatSource,
} from './wildlifeBehavior'

// The water-edge flee decision (user report 29.09.2026: animals jitter at the
// water instead of fleeing into it). Mirrors of the Wildlife.tsx flight
// constants (module-private there) so the tick loop below runs the same
// hysteresis rings, turn cap and paces.
const SHY = 6
const PANIC = 3.2
const EXIT = 1.5
const TURN = 8
const SHY_SPEED = 4.2
const SWIM = 1.6

// A straight river 20 units wide: water for 10 < z < 30, savanna either side.
const wideRiver = (_x: number, z: number) => (z > 10 && z < 30 ? 'water' : 'savanna')
const PLAYER = { x: 0, z: 8.5 }

type BankRule = (x: number, z: number) => { tx: number; tz: number } | null
/** The flee pick for one tick: the winning source and its heading, or null. */
type FleePick = (x: number, z: number, t: number, engaged: boolean) => { source: FleeThreatSource; heading: number } | null

const travellerOnly: FleePick = (x, z, _t, engaged) => {
  const h = fleeHeading(x, z, [[PLAYER.x, PLAYER.z]], engaged ? SHY * EXIT : SHY)
  return h === null ? null : { source: 'player', heading: h }
}

/** Ticks one animal pinned at the bank by the standing traveller through the
 *  flight → swim-out loop of Wildlife.tsx (shy flight with its hysteresis
 *  ring, flight grace, then a crossing to the bank the rule picks). */
function runFlight(
  bankRule: BankRule,
  seconds = 40,
  dt = 0.05,
  pickAt: FleePick = travellerOnly,
) {
  let x = 0
  let z = 9.6
  let dodge: number | undefined
  let crossing: { tx: number; tz: number } | undefined
  let fleeAt = -Infinity
  const headings: number[] = []
  let engagements = 0
  let waterEntries = 0
  let wasWet = false
  const sources: FleeThreatSource[] = []
  for (let t = 0; t < seconds; t += dt) {
    const x0 = x
    const z0 = z
    if (crossing) {
      const dx = crossing.tx - x
      const dz = crossing.tz - z
      const d = Math.hypot(dx, dz)
      if (d > 0.05) {
        x += (dx / d) * Math.min(d, SWIM * dt)
        z += (dz / d) * Math.min(d, SWIM * dt)
      }
      if (wideRiver(x, z) !== 'water' && d < 0.6) crossing = undefined
    } else {
      const pick = pickAt(x, z, t, dodge !== undefined)
      if (pick !== null) {
        if (dodge === undefined) engagements++
        if (sources[sources.length - 1] !== pick.source) sources.push(pick.source)
        dodge = dodge === undefined ? pick.heading : turnToward(dodge, pick.heading, TURN * dt)
        const pace = swimBrakedPace(SHY_SPEED, wideRiver(x, z), SWIM)
        const step = fleeWaterStep(x, z, dodge, pace * dt, wideRiver, 0.8)
        x = step.x
        z = step.z
        fleeAt = t
      } else {
        dodge = undefined
        if (wideRiver(x, z) === 'water' && t - fleeAt >= FLIGHT_GRACE_SECONDS) {
          const bank = bankRule(x, z)
          if (bank) crossing = bank
        }
      }
    }
    // The heading the animal actually moved on this tick (not the requested one).
    if (Math.hypot(x - x0, z - z0) > 1e-4) headings.push(Math.atan2(x - x0, z - z0))
    const wet = wideRiver(x, z) === 'water'
    if (wet && !wasWet) waterEntries++
    wasWet = wet
  }
  // maxTurn catches a reversal; zigzags counts consecutive turns of opposite
  // sign, each above 10° — the smaller alternating jitter a cap alone misses.
  let maxTurn = 0
  let zigzags = 0
  let lastTurn = 0
  const big = Math.PI / 18
  for (let i = 1; i < headings.length; i++) {
    let d = headings[i] - headings[i - 1]
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    maxTurn = Math.max(maxTurn, Math.abs(d))
    if (Math.abs(d) > big && Math.abs(lastTurn) > big && Math.sign(d) !== Math.sign(lastTurn)) zigzags++
    lastTurn = d
  }
  return { x, z, engagements, waterEntries, sources, maxTurn, zigzags, onLand: wideRiver(x, z) !== 'water', crossing }
}

const threat: BankThreat[] = [{ ...PLAYER, r: SHY * balance.waterCross.fleeBankClearance }]

describe('water-edge flee: a fleeing animal commits instead of jittering at the bank', () => {
  it('reproduces the old loop: the plain nearest bank sends it back into the shy ring again and again', () => {
    const old = runFlight((x, z) => nearestBankTarget(x, z, wideRiver, 30))
    expect(old.engagements).toBeGreaterThan(2)
    expect(old.waterEntries).toBeGreaterThan(2)
  })

  it('the safe bank: one flight, one water entry, no reversal of the heading, and it lands clear of the traveller', () => {
    const run = runFlight((x, z) => safeBankTarget(x, z, wideRiver, 30, threat))
    expect(run.engagements).toBe(1)
    expect(run.waterEntries).toBe(1)
    // Consecutive ticks never flip the heading (the flight → swim hand-off
    // bends it, it never turns it round).
    expect(run.maxTurn).toBeLessThan(Math.PI / 2)
    expect(run.zigzags).toBe(0)
    expect(run.onLand).toBe(true)
    expect(run.crossing).toBeUndefined()
    expect(Math.hypot(run.x - PLAYER.x, run.z - PLAYER.z)).toBeGreaterThanOrEqual(SHY)
  })

  it('competing threats through the production arbitration: a hand-off between the elephant dart and the traveller still gives one committed escape', () => {
    // An elephant wades along the bank toward the animal. resolveFleeTarget
    // (the Wildlife.tsx arbitration point) ranks its dart above the
    // traveller's shy flee, so the winning source switches mid-flight — the
    // held heading must bend through that hand-off, never jitter.
    const elephant = (t: number): [number, number] => [-7 + Math.min(t, 3) * 2.5, 10.5]
    const state: FleeArbitrationState = {
      species: 'antelope',
      isJuvenile: false,
      preyWeapon: balance.parentDefense.preyWeapon,
      drama: {},
      drinking: false,
      stagedBankVictim: false,
    }
    const arbitrated: FleePick = (x, z, t, engaged) =>
      resolveFleeTarget(
        x,
        z,
        state,
        [elephant(t)],
        [[PLAYER.x, PLAYER.z]],
        engaged ? PANIC * EXIT : PANIC,
        engaged ? SHY * EXIT : SHY,
      )
    const run = runFlight(
      (x, z) => safeBankTarget(x, z, wideRiver, 30, [threat[0], { x: elephant(40)[0], z: elephant(40)[1], r: threat[0].r }]),
      40,
      0.05,
      arbitrated,
    )
    // The run really crossed sources (else it proves nothing about the hand-off).
    expect(run.sources).toContain('elephant')
    expect(run.sources).toContain('player')
    expect(run.sources.length).toBeGreaterThanOrEqual(2)
    // One flight, one water entry, no alternating turns. The swim-out may turn
    // once toward the nearest bank clear of both rings (the point-312 nearest
    // bank rule), a single held decision — it lands outside every shy ring.
    expect(run.engagements).toBe(1)
    expect(run.waterEntries).toBe(1)
    expect(run.zigzags).toBe(0)
    expect(run.onLand).toBe(true)
    for (const [tx, tz] of [[PLAYER.x, PLAYER.z], elephant(40)]) {
      expect(Math.hypot(run.x - tx, run.z - tz)).toBeGreaterThanOrEqual(SHY)
    }
  })

  it('with no threat in play the safe bank is exactly the nearest bank', () => {
    for (const [x, z] of [[0, 11], [0, 20], [3, 27], [-2, 14.5]]) {
      expect(safeBankTarget(x, z, wideRiver, 30, [])).toEqual(nearestBankTarget(x, z, wideRiver, 30))
    }
  })

  it('a threatened near bank is passed over for the nearest bank outside the ring', () => {
    const b = safeBankTarget(0, 17, wideRiver, 30, threat)!
    expect(Math.hypot(b.tx - PLAYER.x, b.tz - PLAYER.z)).toBeGreaterThanOrEqual(threat[0].r)
    // The nearest bank would have been the traveller's own, inside the ring.
    const n = nearestBankTarget(0, 17, wideRiver, 30)!
    expect(Math.hypot(n.tx - PLAYER.x, n.tz - PLAYER.z)).toBeLessThan(threat[0].r)
  })

  it('with every bank in reach threatened it takes the one farthest outside, and never the sea', () => {
    const pond = (x: number, z: number) => (Math.hypot(x, z) < 3 ? 'water' : 'savanna')
    const b = safeBankTarget(0, 0, pond, 10, [{ x: 0, z: -3, r: 20 }])!
    expect(b.tz).toBeGreaterThan(2) // the far side of the pond from the threat
    const seaThenLand = (_x: number, z: number) => (z < 0 ? 'ocean' : z <= 4 ? 'water' : 'savanna')
    expect(safeBankTarget(0, 0.5, seaThenLand, 30, [{ x: 0, z: 6, r: 3 }])!.tz).toBeGreaterThan(4)
  })
})

describe('water-edge flee: a calf that swims on purpose is not a fall-in', () => {
  it('a wading calf fleeing into the river enters the water as a swim, not the drowning drama', () => {
    // The calf at the bank bolts from the traveller: its first step lands in the water…
    const h = fleeHeading(0, 9.8, [[PLAYER.x, PLAYER.z]], SHY)!
    const step = fleeWaterStep(0, 9.8, h, SHY_SPEED * 0.1, wideRiver, 0.8)
    expect(wideRiver(step.x, step.z)).toBe('water')
    // …and while in flight (or its grace) that is a swim, as is a crossing or a chase swim.
    expect(calfWaterCause({ inFlight: true, crossing: false, chaseSwim: false })).toBe('swim')
    expect(calfWaterCause({ inFlight: false, crossing: true, chaseSwim: false })).toBe('swim')
    expect(calfWaterCause({ inFlight: false, crossing: false, chaseSwim: true })).toBe('swim')
    // Only an unintended step in (the gambol off the bank) is the fall-in.
    expect(calfWaterCause({ inFlight: false, crossing: false, chaseSwim: false })).toBe('fall-in')
  })

  it('a calf across the water from a threatened parent holds its bank; it swims back once the threat is gone', () => {
    expect(calfFollowAcrossWater(0.5, 9.5, threat)).toBe('hold')
    expect(calfFollowAcrossWater(0.5, 9.5, [])).toBe('swim')
    expect(calfFollowAcrossWater(20, 9.5, threat)).toBe('swim')
  })

  it('the bank hold sees water between calf and parent at any distance, even within the follow radius', () => {
    // A narrow channel (2 units) the calf crossed: parent 4 units away, well
    // inside the follow radius, still has water between them.
    const narrow = (_x: number, z: number) => (z > 10 && z < 12 ? 'water' : 'savanna')
    expect(waterBetween(0, 13, 0, 9, narrow)).toBe(true)
    expect(waterBetween(0, 13, 3, 14, narrow)).toBe(false)
    // A step coarser than the channel still finds it (the endpoints and n samples).
    expect(waterBetween(0, 12.5, 0, 9.5, narrow, 1)).toBe(true)
  })
})
