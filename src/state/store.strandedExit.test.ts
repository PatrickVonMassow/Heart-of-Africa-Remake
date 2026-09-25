// A traveller standing in blocked water can always walk out (point 1212).
// Reproduces the user's bug report (local/GefangenerSpieler.zip): an antelope's
// collision push left him in the closed Mediterranean just off the delta
// beach, where every step's target was blocked and he could not move at all.
import { describe, it, expect, beforeEach } from 'vitest'
import { balance } from '../config/balance'
import { travelBlockedAt, useGame } from './store'
import { g, freshGame, withWorld } from '../test/store'

withWorld()

const REPORT_SEED = 804048534
const REPORT_POS = { x: 299.925882924154, z: -310.1447977921902 }

const blockedAt = (p: { x: number; z: number }) => travelBlockedAt(p.x, p.z, REPORT_SEED)
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

  it('no heading lets him creep along the closed sea — the way out is short in every direction', () => {
    // Held input in any of 32 directions: whatever he covers while still in
    // blocked water stays a short walk ashore, never a swim along the coast.
    let worst = 0
    for (let i = 0; i < 32; i++) {
      const a = (i / 32) * Math.PI * 2
      standAtReport()
      let inWater = 0
      for (let k = 0; k < 300; k++) {
        const from = { ...g().pos }
        const wet = blockedAt(from)
        g().moveTravel(Math.sin(a), Math.cos(a), 1 / 30)
        if (wet) inWater += Math.hypot(g().pos.x - from.x, g().pos.z - from.z)
      }
      worst = Math.max(worst, inWater)
    }
    expect(worst).toBeLessThan(6)
  })

  it('a step out to sea is still refused — the Mediterranean stays closed', () => {
    standAtReport()
    g().moveTravel(0, -1, 1 / 30) // world -z is north, away from the delta beach
    expect(g().pos).toEqual(REPORT_POS)
  })
})
