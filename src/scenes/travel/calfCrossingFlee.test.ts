import { beforeAll, describe, expect, it } from 'vitest'
import { balance } from '../../config/balance'
import { worldToLatLon } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { setupGeodata } from '../../test/geodata'
import {
  calfFollowAcrossWater,
  crossingStep,
  crossingYieldsToFlight,
  flightBlocked,
  isInDrama,
  resolveFleeTarget,
  type FleeArbitrationState,
} from './wildlifeBehavior'

// The user report of 29.09.2026 (»Kalb reagiert nicht auf mich«, archive
// JungtierReagiertNicht.zip): its "wildlife" section, seed and traveller
// position, copied here because local/ is not tracked.
const SEED = 2232886032
const TRAVELLER = { x: 316.02, z: -105.51 }
const CALF = { x: 317.18, z: -105.05, target: { x: 317.18, z: -105.09 }, parentAt: { x: 319.78, z: -94.97 } }
// Mirrors of Wildlife.tsx module constants (PLAYER_SHY_RADIUS, CROSS_SWIM_SPEED).
const SHY = 6
const SWIM = 2.6
const { resolveSeconds, arriveUnits, fleeBankClearance } = balance.waterCross

const typeAt = (x: number, z: number) => {
  const ll = worldToLatLon(x, z)
  return sampleTerrain(ll.lat, ll.lon, SEED).type
}
const onLandAt = (x: number, z: number) => {
  const t = typeAt(x, z)
  return t !== 'water' && t !== 'ocean'
}
const calfState = (drama: FleeArbitrationState['drama']): FleeArbitrationState => ({
  species: 'antelope',
  isJuvenile: true,
  preyWeapon: balance.parentDefense.preyWeapon,
  drama,
  drinking: false,
  stagedBankVictim: false,
})
const player: ReadonlyArray<readonly [number, number]> = [[TRAVELLER.x, TRAVELLER.z]]

/** Swims a crossing to its end; returns the frames it took and how it ended. */
function swim(x: number, z: number, tx: number, tz: number, land: (x: number, z: number) => boolean, dt = 1 / 60) {
  const c = { tx, tz, time: 0 }
  for (let f = 1; f < 10_000; f++) {
    const s = crossingStep(x, z, c, dt, SWIM, land, resolveSeconds, arriveUnits)
    c.time = s.time
    x = s.x
    z = s.z
    if (s.end !== null) return { frames: f, end: s.end, x, z }
  }
  return { frames: Infinity, end: null, x, z }
}

describe('the reported calf: a crossing whose target collapsed onto its position', () => {
  beforeAll(async () => {
    await setupGeodata()
  })

  it('stands on water a hair short of a land target, inside the traveller shy ring', () => {
    expect(typeAt(CALF.x, CALF.z)).toBe('water')
    expect(onLandAt(CALF.target.x, CALF.target.z)).toBe(true)
    expect(Math.hypot(CALF.x - CALF.target.x, CALF.z - CALF.target.z)).toBeLessThan(0.05)
    expect(Math.hypot(CALF.x - TRAVELLER.x, CALF.z - TRAVELLER.z)).toBeLessThan(SHY)
  })

  it('resolves that crossing on the first frame, onto the land target', () => {
    const r = swim(CALF.x, CALF.z, CALF.target.x, CALF.target.z, onLandAt)
    expect(r.frames).toBe(1)
    expect(r.end).toBe('arrived')
    expect(onLandAt(r.x, r.z)).toBe(true)
  })

  it('lets the traveller inside the ring end the crossing, and the calf then flees into the water', () => {
    const inCrossing = { crossing: { tx: CALF.target.x, tz: CALF.target.z, time: 3 } }
    // The crossing still counts as a drama for every other gate…
    expect(isInDrama(inCrossing)).toBe(true)
    expect(resolveFleeTarget(CALF.x, CALF.z, calfState(inCrossing), [], player, 0, SHY)).toBeNull()
    // …but it yields to the shy flight, and the flight picks the escape.
    expect(crossingYieldsToFlight(CALF.x, CALF.z, calfState(inCrossing), player, SHY)).toBe(true)
    const pick = resolveFleeTarget(CALF.x, CALF.z, calfState({}), [], player, 0, SHY)
    expect(pick?.source).toBe('player')
    // The escape leads away from the traveller, into the river (design.md §19.5 (c)).
    const h = pick?.heading ?? 0
    const ahead = typeAt(CALF.x + Math.sin(h) * 1.5, CALF.z + Math.cos(h) * 1.5)
    expect(ahead).toBe('water')
    expect(flightBlocked(ahead)).toBe(false)
  })

  it('holds the crossing when the traveller is outside the ring or another drama owns the calf', () => {
    const far: ReadonlyArray<readonly [number, number]> = [[CALF.x - 12, CALF.z]]
    const crossing = { tx: CALF.target.x, tz: CALF.target.z, time: 0 }
    expect(crossingYieldsToFlight(CALF.x, CALF.z, calfState({ crossing }), far, SHY)).toBe(false)
    expect(crossingYieldsToFlight(CALF.x, CALF.z, calfState({ crossing, inWater: 1 }), player, SHY)).toBe(false)
    expect(crossingYieldsToFlight(CALF.x, CALF.z, calfState({ crossing, isLionVictim: true }), player, SHY)).toBe(false)
  })

  it('a calf held on its bank across the water still flees a traveller inside the ring', () => {
    // The bank hold (a parent standing inside a threat ring across the water)
    // is no drama flag: it gates play only, so the shy flight still wins.
    const ring = [{ x: TRAVELLER.x, z: TRAVELLER.z, r: SHY * fleeBankClearance }]
    const heldParent = { x: TRAVELLER.x + 4, z: TRAVELLER.z + 2 }
    expect(calfFollowAcrossWater(heldParent.x, heldParent.z, ring)).toBe('hold')
    expect(resolveFleeTarget(CALF.x, CALF.z, calfState({}), [], player, 0, SHY)?.source).toBe('player')
    // The archive's parent stood outside that ring: no hold, the calf may swim to it.
    expect(calfFollowAcrossWater(CALF.parentAt.x, CALF.parentAt.z, ring)).toBe('swim')
  })
})

describe('crossingStep always resolves', () => {
  // A straight bank: water for z < 0, land for z >= 0.
  const bank = (_x: number, z: number) => z >= 0

  it('ends every swim whose target lies just past the waterline, long before the deadline', () => {
    for (let gap = 0; gap <= 0.3; gap += 0.005) {
      // Target `gap` onto the land; start 0.2-3 units out on the water.
      for (let start = 0.2; start <= 3; start += 0.07) {
        const r = swim(0, -start, 0, gap, bank)
        expect(r.end === 'landed' || r.end === 'arrived').toBe(true)
        expect(bank(r.x, r.z)).toBe(true)
        expect(r.frames / 60).toBeLessThan((start + gap) / SWIM + 0.5)
      }
    }
  })

  it('resolves a target at the animal own position at once, and a stalled swim at the deadline', () => {
    expect(swim(0, -1, 0, -1, bank).frames).toBe(1)
    // A target that can never be reached as land (all water) still ends (I4).
    const r = swim(0, -1, 0, -200, () => false)
    expect(r.end).toBe('deadline')
    expect(r.frames / 60).toBeLessThanOrEqual(resolveSeconds + 0.1)
  })

  it('never stalls at several frame rates', () => {
    for (const dt of [1 / 144, 1 / 60, 1 / 30, 0.1]) {
      const r = swim(0, -2.01, 0, 0.02, bank, dt)
      expect(r.end).not.toBe('deadline')
    }
  })
})
