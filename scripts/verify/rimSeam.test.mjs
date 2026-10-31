import { describe, expect, it } from 'vitest'
import { FROTH_REACH_M, RIM_ZONE_M, WATER_Y, rimSeamPoints } from './rimSeam.mjs'

// The bambara-village reading of 31.10.2026: normal along +x, current along +z.
const river = { normal: { x: 1, z: 0 }, downstream: { x: 0, z: 1 }, distance: 41.2, reach: 10 }
const camera = { x: 37.1, z: -28 }

describe('rimSeamPoints', () => {
  it('puts the lines on the camera’s own forward line, not the place centre’s', () => {
    const p = rimSeamPoints(river, camera)
    for (const pt of [p.top, p.bottom, p.froth]) expect(pt.z).toBeCloseTo(-28)
  })

  it('aims the bottom line at the drawn surface’s far edge, the top past the rim zone', () => {
    const p = rimSeamPoints(river, camera)
    expect(p.bottom.x).toBeCloseTo(51.2)
    expect(p.top.x).toBeCloseTo(51.2 + RIM_ZONE_M)
    expect(p.froth.x).toBeCloseTo(41.2 + FROTH_REACH_M)
    expect(p.bottom.y).toBe(WATER_Y)
  })

  it('keeps the near band between froth and edge, nearer than the far band', () => {
    const p = rimSeamPoints(river, camera)
    expect(p.froth.x).toBeLessThan(p.bottom.x)
    expect(p.bottom.x).toBeLessThan(p.top.x)
  })

  it('follows an oblique bank frame', () => {
    const s = Math.SQRT1_2
    const r = { normal: { x: s, z: s }, downstream: { x: -s, z: s }, distance: 40, reach: 10 }
    const p = rimSeamPoints(r, { x: 0, z: 10 })
    const out = (pt) => pt.x * s + pt.z * s
    const along = (pt) => -pt.x * s + pt.z * s
    expect(out(p.bottom)).toBeCloseTo(50)
    expect(along(p.bottom)).toBeCloseTo(10 * s)
  })

  it('refuses a river that reports no drawn reach rather than guessing one', () => {
    expect(() => rimSeamPoints({ ...river, reach: undefined }, camera)).toThrow(/reach/)
  })
})
