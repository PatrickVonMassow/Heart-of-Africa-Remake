// The horizon slices cover every sun the game can produce, and a sun outside
// the baked arc clamps and says so (design.md §2.7).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HORIZON_AZIMUTHS, horizonSliceBlend } from './horizonSlices'
import { SUN_AZIMUTHS } from '../../scripts/horizonSweep.mjs'
import { sunAngles } from '../systems/sunPosition'
import { balance } from '../config/balance'

describe('horizon slices', () => {
  it('mirror the bake script and the committed horizon.json', () => {
    SUN_AZIMUTHS.forEach((az, i) => expect(HORIZON_AZIMUTHS[i]).toBeCloseTo(az, 3))
    const meta = JSON.parse(readFileSync(resolve(process.cwd(), 'public/geodata/horizon.json'), 'utf8'))
    expect(meta.sunAzimuths).toEqual([...HORIZON_AZIMUTHS])
  })

  it('the baked arc covers every (latitude, day) the game can produce at the configured hour', () => {
    // The DEM spans latitudes -37..38; the sun is derived per day of the year.
    for (let lat = -37; lat <= 38; lat += 0.5) {
      for (let day = 0; day < 366; day++) {
        const { azimuth } = sunAngles(lat, day, balance.sun.hour)
        const blend = horizonSliceBlend(azimuth)
        expect(blend.clamped, `lat ${lat} day ${day} azimuth ${azimuth}`).toBe(false)
      }
    }
  })

  it('interpolates between the two bracketing slices', () => {
    const mid = (HORIZON_AZIMUTHS[2] + HORIZON_AZIMUTHS[3]) / 2
    const b = horizonSliceBlend(mid)
    expect(b.weights[2]).toBeCloseTo(0.5, 9)
    expect(b.weights[3]).toBeCloseTo(0.5, 9)
    expect(b.weights.reduce((a, w) => a + w, 0)).toBeCloseTo(1, 12)
    expect(horizonSliceBlend(HORIZON_AZIMUTHS[0]).weights[0]).toBe(1)
    expect(horizonSliceBlend(HORIZON_AZIMUTHS[5]).weights[5]).toBe(1)
  })

  it('a sun just outside the arc clamps to the nearest slice and reports it', () => {
    const before = horizonSliceBlend(HORIZON_AZIMUTHS[0] - 0.5)
    expect(before.clamped).toBe(true)
    expect(before.weights).toEqual([1, 0, 0, 0, 0, 0])
    expect(before.shadedAzimuth).toBe(HORIZON_AZIMUTHS[0])
    const after = horizonSliceBlend(HORIZON_AZIMUTHS[5] + 0.5)
    expect(after.clamped).toBe(true)
    expect(after.weights).toEqual([0, 0, 0, 0, 0, 1])
    // A debug hour that leaves the arc: 12:30 at 30° N in June stands at ~227°.
    const early = sunAngles(30, 172, 12.5)
    expect(horizonSliceBlend(early.azimuth).clamped).toBe(true)
    expect(horizonSliceBlend(early.azimuth).weights[0]).toBe(1)
    // A morning sun (east) clamps to whichever end is nearer, never blends.
    const east = horizonSliceBlend(90)
    expect(east.clamped).toBe(true)
    expect(east.weights.filter((w) => w > 0)).toEqual([1])
  })
})
