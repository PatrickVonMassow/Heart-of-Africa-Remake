// Range-limited sun-shadow casters (point 1524, docs/perf-1524-findings.md).
import { describe, expect, it } from 'vitest'
import { BoxGeometry, Group, Mesh } from 'three'
import { balance } from '../config/balance'
import { castsAt, rangedCasterStats, registerRangedCaster, shadowCasterRadius, updateRangedCasters } from './shadowCasterRange'

const cfg = balance.shadowCasterRange

function marker(x: number, z: number): { root: Group; casting: Mesh; flat: Mesh } {
  const root = new Group()
  root.position.set(x, 0, z)
  const casting = new Mesh(new BoxGeometry())
  casting.castShadow = true
  const flat = new Mesh(new BoxGeometry())
  flat.castShadow = false
  root.add(casting, flat)
  return { root, casting, flat }
}

describe('shadow caster range', () => {
  it('reaches the visible ground at the zoom plus the shadow at the sun, capped at a low sun', () => {
    const high = shadowCasterRadius(0.5, 1) // 45° sun: shadow = caster height
    expect(high).toBeCloseTo(cfg.viewReach * 0.5 + cfg.casterHeight)
    expect(shadowCasterRadius(1, 1)).toBeGreaterThan(high)
    expect(shadowCasterRadius(0.5, 0.001)).toBeCloseTo(cfg.viewReach * 0.5 + cfg.maxShadowReach)
    expect(shadowCasterRadius(0.5, 0)).toBeCloseTo(cfg.viewReach * 0.5 + cfg.maxShadowReach)
  })

  it('switches with hysteresis, so a caster on the boundary cannot flicker', () => {
    expect(castsAt(100, false, 100, 10)).toBe(true)
    expect(castsAt(101, false, 100, 10)).toBe(false)
    expect(castsAt(105, true, 100, 10)).toBe(true)
    expect(castsAt(111, true, 100, 10)).toBe(false)
  })

  it('switches only the meshes that cast, and restores them on unregister', () => {
    const near = marker(10, 0)
    const far = marker(1000, 0)
    const offs = [registerRangedCaster(near.root), registerRangedCaster(far.root)]
    expect(rangedCasterStats()).toEqual({ registered: 2, casting: 2 })
    updateRangedCasters(0, 0, 0.5, 1)
    expect(near.casting.castShadow).toBe(true)
    expect(far.casting.castShadow).toBe(false)
    expect(far.flat.castShadow).toBe(false)
    expect(rangedCasterStats()).toEqual({ registered: 2, casting: 1 })
    // Travelling to the far marker brings its shadow back and drops the other.
    updateRangedCasters(1000, 0, 0.5, 1)
    expect(far.casting.castShadow).toBe(true)
    expect(far.flat.castShadow).toBe(false)
    expect(near.casting.castShadow).toBe(false)
    for (const off of offs) off()
    expect(near.casting.castShadow).toBe(true)
    expect(near.flat.castShadow).toBe(false)
    expect(rangedCasterStats().registered).toBe(0)
  })
})
