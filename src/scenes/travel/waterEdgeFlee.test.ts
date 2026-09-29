import { describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import {
  calfFollowAcrossWater,
  calfWaterCause,
  fleeHeading,
  fleeWaterStep,
  nearestBankTarget,
  safeBankTarget,
  swimBrakedPace,
  turnToward,
  FLIGHT_GRACE_SECONDS,
  type BankThreat,
} from './wildlifeBehavior'

// The water-edge flee decision (user report 29.09.2026: animals jitter at the
// water instead of fleeing into it). Mirrors of the Wildlife.tsx flight
// constants (module-private there) so the tick loop below runs the same
// hysteresis rings, turn cap and paces.
const SHY = 6
const EXIT = 1.5
const TURN = 8
const SHY_SPEED = 4.2
const SWIM = 1.6

// A straight river 20 units wide: water for 10 < z < 30, savanna either side.
const wideRiver = (_x: number, z: number) => (z > 10 && z < 30 ? 'water' : 'savanna')
const PLAYER = { x: 0, z: 8.5 }

type BankRule = (x: number, z: number) => { tx: number; tz: number } | null

/** Ticks one animal pinned at the bank by the standing traveller through the
 *  flight → swim-out loop of Wildlife.tsx (shy flight with its hysteresis
 *  ring, flight grace, then a crossing to the bank the rule picks). */
function runFlight(bankRule: BankRule, seconds = 40, dt = 0.05) {
  let x = 0
  let z = 9.6
  let dodge: number | undefined
  let crossing: { tx: number; tz: number } | undefined
  let fleeAt = -Infinity
  const headings: number[] = []
  let engagements = 0
  let waterEntries = 0
  let wasWet = false
  for (let t = 0; t < seconds; t += dt) {
    let heading: number | null = null
    if (crossing) {
      const dx = crossing.tx - x
      const dz = crossing.tz - z
      const d = Math.hypot(dx, dz)
      heading = Math.atan2(dx, dz)
      if (d > 0.05) {
        x += (dx / d) * Math.min(d, SWIM * dt)
        z += (dz / d) * Math.min(d, SWIM * dt)
      }
      if (wideRiver(x, z) !== 'water' && d < 0.6) crossing = undefined
    } else {
      const ring = dodge === undefined ? SHY : SHY * EXIT
      const pick = fleeHeading(x, z, [[PLAYER.x, PLAYER.z]], ring)
      if (pick !== null) {
        if (dodge === undefined) engagements++
        dodge = dodge === undefined ? pick : turnToward(dodge, pick, TURN * dt)
        const pace = swimBrakedPace(SHY_SPEED, wideRiver(x, z), SWIM)
        const step = fleeWaterStep(x, z, dodge, pace * dt, wideRiver, 0.8)
        x = step.x
        z = step.z
        fleeAt = t
        heading = dodge
      } else {
        dodge = undefined
        if (wideRiver(x, z) === 'water' && t - fleeAt >= FLIGHT_GRACE_SECONDS) {
          const bank = bankRule(x, z)
          if (bank) crossing = bank
        }
      }
    }
    if (heading !== null) headings.push(heading)
    const wet = wideRiver(x, z) === 'water'
    if (wet && !wasWet) waterEntries++
    wasWet = wet
  }
  let maxTurn = 0
  for (let i = 1; i < headings.length; i++) {
    let d = headings[i] - headings[i - 1]
    while (d > Math.PI) d -= Math.PI * 2
    while (d < -Math.PI) d += Math.PI * 2
    maxTurn = Math.max(maxTurn, Math.abs(d))
  }
  return { x, z, engagements, waterEntries, maxTurn, onLand: wideRiver(x, z) !== 'water', crossing }
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
    expect(run.onLand).toBe(true)
    expect(run.crossing).toBeUndefined()
    expect(Math.hypot(run.x - PLAYER.x, run.z - PLAYER.z)).toBeGreaterThanOrEqual(SHY)
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
})
