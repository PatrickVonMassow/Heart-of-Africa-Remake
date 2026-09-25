// A traveller standing in blocked water can always walk out (point 1212).
// Reproduces the user's bug report (local/GefangenerSpieler.zip): an antelope's
// collision push left him in the closed Mediterranean 2.5 units off the delta
// beach, where every step's target was blocked and he could not move at all.
import { describe, it, expect, beforeEach } from 'vitest'
import { balance } from '../config/balance'
import { useGame } from './store'
import { g, freshGame, withWorld } from '../test/store'
import { isBlocked, sampleTerrain } from '../world/terrain'
import { worldToLatLon } from '../world/geo'

withWorld()

const REPORT_SEED = 804048534
const REPORT_POS = { x: 299.925882924154, z: -310.1447977921902 }

const blockedAt = (p: { x: number; z: number }) => {
  const ll = worldToLatLon(p.x, p.z)
  return isBlocked(sampleTerrain(ll.lat, ll.lon, REPORT_SEED).type, ll.lat, ll.lon)
}
const standAtReport = () => useGame.setState({ mode: 'travel', pos: { ...REPORT_POS }, toast: null })

beforeEach(() => {
  freshGame(REPORT_SEED)
  balance.randomEventsEnabled = false
})

describe('stranded in blocked water (point 1212)', () => {
  it('the report position is blocked water — the trap is reproduced, not assumed', () => {
    expect(blockedAt(REPORT_POS)).toBe(true)
  })

  it('from the report position he walks out onto open ground in at least one direction', () => {
    let escaped = 0
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2
      standAtReport()
      for (let k = 0; k < 120; k++) g().moveTravel(Math.sin(a), Math.cos(a), 1 / 30)
      if (!blockedAt(g().pos)) escaped++
    }
    expect(escaped).toBeGreaterThan(0)
  })

  it('a step out to sea is still refused — the Mediterranean stays closed', () => {
    standAtReport()
    g().moveTravel(0, -1, 1 / 30) // world -z is north, away from the delta beach
    expect(g().pos).toEqual(REPORT_POS)
  })
})
