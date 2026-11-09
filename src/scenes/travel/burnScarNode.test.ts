// The burn scar's uniform packing (design.md §19.8/§19.13): what the terrain
// shader reads must be the shape grassFireFront.ts computes, and a switched-off
// fire must upload nothing that could tint or glow.

import { describe, it, expect } from 'vitest'
import { balance } from '../../config/balance'
import { burnScarUniforms, setBurnScar } from './burnScarNode'
import { fireHalfWidth, fireLead } from './grassFireFront'

const S = balance.grassFire
const LOOK = { scarStrength: 1, emberStrength: 1, edgeSoft: S.scarEdgeSoft, jag: S.scarJag, darkness: S.scarDarkness, emberDepth: S.emberDepth }

describe('burn-scar uniforms', () => {
  it('pack the fire placement and the front shape the pure module computes', () => {
    setBurnScar({ x: 3, z: -7, heading: 1.1, front: 20 }, S, LOOK)
    const { a, b, c, d } = burnScarUniforms()
    expect([a.x, a.y]).toEqual([3, -7])
    expect(a.z).toBeCloseTo(Math.sin(1.1), 12)
    expect(a.w).toBeCloseTo(Math.cos(1.1), 12)
    expect(b.x).toBe(20)
    expect(b.y).toBeCloseTo(fireHalfWidth(20, S), 12)
    expect(b.z).toBeCloseTo(fireLead(20, S), 12)
    expect(b.w).toBe(1)
    expect([c.x, c.y, c.z, c.w]).toEqual([S.startHalfWidth, S.spreadRate, S.maxHalfWidth, S.scarEdgeSoft])
    expect([d.x, d.y, d.z, d.w]).toEqual([S.scarJag, S.scarDarkness, S.emberDepth, 1])
  })

  it('zero strengths (idle or switched off) upload no scar and no glow', () => {
    setBurnScar({ x: 0, z: 0, heading: 0, front: 30 }, S, { ...LOOK, scarStrength: 0, emberStrength: 0 })
    const { b, d } = burnScarUniforms()
    expect(b.w).toBe(0)
    expect(d.w).toBe(0)
  })

  it('clamps strengths and darkness into 0..1', () => {
    setBurnScar({ x: 0, z: 0, heading: 0, front: 30 }, S, { ...LOOK, scarStrength: 4, emberStrength: -2, darkness: 3 })
    const { b, d } = burnScarUniforms()
    expect(b.w).toBe(1)
    expect(d.w).toBe(0)
    expect(d.y).toBe(1)
  })
})
