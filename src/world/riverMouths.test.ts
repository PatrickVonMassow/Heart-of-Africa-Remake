// Sea-mouth shaping and the escapability sweep (design.md §11.2/§11.3, point
// 316). The user found the swimmer softlocked in the Nile's Rosetta mouth: the
// current outran his swim speed inside a water pocket the impassable
// Mediterranean fenced in on every side. This suite pins the shaping that
// removed the funnel AND sweeps EVERY sea mouth on the real world for the same
// shape, so the next river cannot quietly grow one.
import { describe, it, expect, beforeAll } from 'vitest'
import { setupGeodata } from '../test/geodata'
import { RIVERS_DATA } from './data/rivers'
import { isSeaMouthCourse, mouthSlackFactor, seaMouths, MOUTH_SLACK_DEG, SEA_MOUTH_COAST_DEG } from './riverMouths'
import { coastSignedDistance } from './coastVector'
import { riverFlowExact } from './hydro'
import { isBlocked, sampleTerrain } from './terrain'
import { currentDriftDegPerSecond, swimSpeedDegPerSecond, waterfallBoostAt } from '../systems/current'
import { findSwimTraps, type SwimCell } from '../systems/swimEscape'
import { balance } from '../config/balance'

beforeAll(async () => {
  await setupGeodata()
})

describe('mouthSlackFactor (the slack-water ramp)', () => {
  it('is nothing at the mouth and full pace a slack length upstream', () => {
    expect(mouthSlackFactor(0)).toBe(0)
    expect(mouthSlackFactor(MOUTH_SLACK_DEG)).toBe(1)
    expect(mouthSlackFactor(MOUTH_SLACK_DEG * 3)).toBe(1)
  })

  it('rises monotonically in between and never leaves 0..1', () => {
    let prev = -1
    for (let d = 0; d <= MOUTH_SLACK_DEG * 1.5; d += MOUTH_SLACK_DEG / 20) {
      const f = mouthSlackFactor(d)
      expect(f).toBeGreaterThanOrEqual(0)
      expect(f).toBeLessThanOrEqual(1)
      expect(f).toBeGreaterThanOrEqual(prev)
      prev = f
    }
  })

  it('degenerates to no slack when the length is zero', () => {
    expect(mouthSlackFactor(0, 0)).toBe(1)
  })
})

describe('sea mouths vs confluences', () => {
  it('separates the two cleanly on the real courses', () => {
    for (const r of RIVERS_DATA) {
      const [lon, lat] = r.points[r.points.length - 1]
      const sd = coastSignedDistance(lat, lon)
      // Either right at the coast (a sea mouth) or far inland (a confluence) —
      // nothing sits in the ambiguous middle, which is why the threshold holds.
      expect(sd < 0.2 || sd > 2).toBe(true)
      expect(isSeaMouthCourse(r)).toBe(sd < SEA_MOUTH_COAST_DEG)
    }
  })

  it('lists exactly the rivers that empty into the sea', () => {
    expect(seaMouths().map((m) => m.id).sort()).toEqual(
      ['congo', 'jubba', 'limpopo', 'niger', 'nile', 'orange', 'ruvuma', 'senegal', 'volta', 'zambezi'].sort(),
    )
  })

  it('places every mouth at its river end', () => {
    for (const m of seaMouths()) {
      const river = RIVERS_DATA.find((r) => r.id === m.id)!
      const [lon, lat] = river.points[river.points.length - 1]
      expect(m.lat).toBe(lat)
      expect(m.lon).toBe(lon)
    }
  })
})

describe('the flow field at a sea mouth (design.md §11.3)', () => {
  const nile = RIVERS_DATA.find((r) => r.id === 'nile')!
  const [mouthLon, mouthLat] = nile.points[nile.points.length - 1]

  it('runs out of push at the mouth itself', () => {
    const atMouth = riverFlowExact(mouthLat, mouthLon).strength
    const unslacked = riverFlowExact(mouthLat, mouthLon, undefined, false).strength
    expect(unslacked).toBeGreaterThan(0.5) // the channel IS there — only the push is gone
    expect(atMouth).toBeLessThan(unslacked * 0.15)
  })

  it('still carries the traveller at full pace well upstream', () => {
    // Aswan, far above the delta: untouched by the mouth's slack water.
    const up = riverFlowExact(24.09, 32.9)
    expect(up.strength).toBeCloseTo(riverFlowExact(24.09, 32.9, undefined, false).strength, 6)
    expect(up.strength).toBeGreaterThan(0.8)
  })

  it('keeps the downstream direction where it slackens', () => {
    const f = riverFlowExact(mouthLat - 0.3, mouthLon + 0.2)
    expect(Math.hypot(f.dirLat, f.dirLon)).toBeCloseTo(1, 6)
    expect(f.dirLat).toBeGreaterThan(0) // the lower Nile runs north
  })

  it('slackens EVERY sea mouth and no confluence — the per-segment ramp lines up with its own course', () => {
    // A misaligned slack table would show here first: each river is measured
    // at its OWN end against the same point without the slack.
    for (const r of RIVERS_DATA) {
      const [lon, lat] = r.points[r.points.length - 1]
      const raw = riverFlowExact(lat, lon, undefined, false).strength
      if (raw <= 0) continue // the end lies outside the flow band (mouth in the sea)
      const slacked = riverFlowExact(lat, lon).strength
      if (isSeaMouthCourse(r)) expect(`${r.id} ${slacked < raw * 0.2}`).toBe(`${r.id} true`)
      else expect(`${r.id} ${slacked}`).toBe(`${r.id} ${raw}`)
    }
  })

  it('leaves a tributary that ends at a CONFLUENCE running at full pace', () => {
    // The White Nile joins the Nile at Khartoum: it flows into a river, not
    // into the sea, so nothing about its mouth is slack.
    const wn = RIVERS_DATA.find((r) => r.id === 'white-nile')!
    const [lon, lat] = wn.points[wn.points.length - 1]
    const slacked = riverFlowExact(lat, lon).strength
    expect(slacked).toBeCloseTo(riverFlowExact(lat, lon, undefined, false).strength, 6)
    expect(slacked).toBeGreaterThan(0.5)
  })
})

// The sweep proper. Each mouth is walked cell by cell: every swimmable cell
// must have an exit path on which the current never exceeds the swim speed.
// Sampled with NO canoe — the swimmer is the worst case, and the reported
// softlock was his.
const SWEEP_STEP_DEG = 0.03
const SWEEP_RADIUS_DEG = 1.0

function sampleSwim(seed: number) {
  return (lat: number, lon: number): SwimCell => {
    const t = sampleTerrain(lat, lon, seed).type
    const drift = currentDriftDegPerSecond(lat, lon, false)
    return {
      blocked: isBlocked(t, lat, lon),
      water: t === 'water' || t === 'ocean',
      driftLat: drift.lat,
      driftLon: drift.lon,
    }
  }
}

describe('every sea mouth is escapable (point 316)', () => {
  const swim = swimSpeedDegPerSecond(false)

  it('measures the swim speed from the same balance the traveller moves by', () => {
    expect(swim).toBeCloseTo(balance.travelSpeed / balance.terrainCost.water / 10, 6)
    expect(waterfallBoostAt(0, 0)).toBe(1) // no fall out at sea
  })

  for (const mouth of seaMouths()) {
    it(`leaves no trap at the ${mouth.id} mouth`, () => {
      const result = findSwimTraps({ lat: mouth.lat, lon: mouth.lon }, sampleSwim(1), {
        stepDeg: SWEEP_STEP_DEG,
        radiusDeg: SWEEP_RADIUS_DEG,
        swimSpeedDeg: swim,
      })
      expect(result.swimCells).toBeGreaterThan(50) // the mouth's water really was sampled
      const worst = result.trapped
        .slice(0, 5)
        .map((c) => `${c.lat.toFixed(2)}/${c.lon.toFixed(2)}`)
        .join(' ')
      expect(`${mouth.id}: ${result.trapped.length} trapped ${worst}`).toBe(`${mouth.id}: 0 trapped `)
    })
  }

  it('reproduces the reported Nile softlock once the mouth slack is removed', () => {
    // The regression witness: with the pre-316 funnel restored (full current
    // right up to the coast contour) the very pocket the user was stuck in
    // reads as trapped, so the sweep is proven able to see this failure.
    const nile = seaMouths().find((m) => m.id === 'nile')!
    const funnel = (lat: number, lon: number): SwimCell => {
      const cell = sampleSwim(1)(lat, lon)
      const raw = riverFlowExact(lat, lon, undefined, false)
      const speed = raw.strength * balance.currentDrift * 1.6
      return { ...cell, driftLat: raw.dirLat * speed, driftLon: raw.dirLon * speed }
    }
    const result = findSwimTraps({ lat: nile.lat, lon: nile.lon }, funnel, {
      stepDeg: SWEEP_STEP_DEG,
      radiusDeg: SWEEP_RADIUS_DEG,
      swimSpeedDeg: swim,
    })
    expect(result.trapped.length).toBeGreaterThan(0)
  })
})
