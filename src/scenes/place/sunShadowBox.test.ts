// The sun shafts only exist inside the settlement sun's shadow box; the live
// check (enrichments --section=godrays) stands sunward at 0.85 of the boundary.
import { describe, expect, it } from 'vitest'
import { inSunShadowBox, SUN_SHADOW_BIAS, SUN_SHADOW_DISTANCE, SUN_SHADOW_NEAR } from './sunShadowBox'

const sunAt = (elevationDeg: number, azimuthDeg = 200): [number, number, number] => {
  const el = (elevationDeg * Math.PI) / 180
  const az = (azimuthDeg * Math.PI) / 180
  return [Math.cos(el) * Math.sin(az), Math.sin(el), Math.cos(el) * Math.cos(az)]
}

describe('settlement sun shadow box', () => {
  it('covers a player standing 70 m toward a low December sun, eye height', () => {
    const d = sunAt(11)
    const h = Math.hypot(d[0], d[2])
    const p: [number, number, number] = [(d[0] / h) * 70, 1.6, (d[2] / h) * 70]
    expect(inSunShadowBox(p, d)).toBe(true)
  })

  it('also leaves room for the air between that player and the sun', () => {
    const d = sunAt(11)
    const h = Math.hypot(d[0], d[2])
    const p: [number, number, number] = [(d[0] / h) * 70 + d[0] * 40, 1.6 + d[1] * 40, (d[2] / h) * 70 + d[2] * 40]
    expect(inSunShadowBox(p, d)).toBe(true)
  })

  it('covers the antisunward edge at the high June sun', () => {
    const d = sunAt(40)
    const h = Math.hypot(d[0], d[2])
    expect(inSunShadowBox([(-d[0] / h) * 80, 0, (-d[2] / h) * 80], d)).toBe(true)
  })

  it('regression: the old 60 m light left that sunward player outside', () => {
    const d = sunAt(11)
    const along = 70 * Math.cos((11 * Math.PI) / 180)
    expect(60 - along).toBeLessThan(SUN_SHADOW_NEAR)
    expect(SUN_SHADOW_DISTANCE - along).toBeGreaterThan(SUN_SHADOW_NEAR)
    expect(d[1]).toBeGreaterThan(0)
  })

  it('keeps the depth bias at its old metric size (~6 cm)', () => {
    expect(SUN_SHADOW_BIAS * 255).toBeCloseTo(-0.062, 3)
  })
})
