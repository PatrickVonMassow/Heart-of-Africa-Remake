import { describe, it, expect } from 'vitest'
import * as THREE from 'three/webgpu'
import { buildSpringGeometry, domeProfile, rimRadius, springShape } from './springGeometry'
import { balance } from '../../config/balance'
import { QUALITY_PRESETS, DETAIL_LEVELS } from '../../config/quality'

// The open-land spring is a 3D water feature, not a stack of flat discs
// (design.md §11.3): a welling dome over a wet pool, an apron laid on the
// ground with an outflow lobe toward the river.

const SHAPE = springShape(balance.spring.radius, balance.spring.domeHeight)

const sloped = (dx: number, dz: number) => 1.0 + dx * 0.12 - dz * 0.05
const build = (groundAt = sloped, segments = 24) =>
  buildSpringGeometry({ shape: SHAPE, waterY: 1.02, outflowAngle: 0.4, segments, rings: segments / 2, groundAt })

describe('spring body geometry', () => {
  it('is 3D: the bounding box has a real height, not a flat disc', () => {
    const { geometry } = build(() => 1.0)
    const box = geometry.boundingBox!
    const size = new THREE.Vector3()
    box.getSize(size)
    expect(size.y).toBeGreaterThanOrEqual(SHAPE.domeHeight * 0.9)
    expect(size.x).toBeGreaterThan(SHAPE.radius * 1.5)
    expect(size.z).toBeGreaterThan(SHAPE.radius * 1.5)
  })

  it('wells up at the centre: the peak stands a dome height above the pool', () => {
    const b = build(() => 1.0)
    expect(b.peakY - b.poolY).toBeCloseTo(SHAPE.domeHeight, 6)
  })

  it('meets the terrain at the rim on sloped ground — no gap, no clip', () => {
    const b = build()
    expect(b.rim.length).toBe(24)
    for (const r of b.rim) {
      expect(Math.abs(r.y - (sloped(r.dx, r.dz) + SHAPE.rimLift))).toBeLessThan(1e-9)
    }
  })

  it('never dips under the ground anywhere, even when the water level lies below it', () => {
    const groundAbove = (dx: number) => 1.2 + dx * 0.2
    const b = buildSpringGeometry({ shape: SHAPE, waterY: 1.0, outflowAngle: 0, segments: 16, rings: 8, groundAt: groundAbove })
    const p = b.geometry.getAttribute('position')
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) + 1.0
      expect(y).toBeGreaterThanOrEqual(groundAbove(p.getX(i)) + SHAPE.rimLift - 1e-5) // float32 positions
    }
  })

  it('stretches an outflow lobe downstream', () => {
    expect(rimRadius(SHAPE, 0.4, 0.4)).toBeCloseTo(SHAPE.radius * (1 + SHAPE.outflow), 9)
    expect(rimRadius(SHAPE, 0.4 + Math.PI, 0.4)).toBeCloseTo(SHAPE.radius, 9)
  })

  it('faces up, carries the zone/wet attributes and a smooth dome profile', () => {
    const { geometry } = build()
    const n = geometry.getAttribute('normal')
    expect(n.getY(0)).toBeGreaterThan(0.9)
    const zone = geometry.getAttribute('springZone')
    const wet = geometry.getAttribute('springWet')
    expect(zone.count).toBe(geometry.getAttribute('position').count)
    expect(wet.getX(0)).toBe(1)
    let minWet = 1
    for (let i = 0; i < wet.count; i++) minWet = Math.min(minWet, wet.getX(i))
    expect(minWet).toBeCloseTo(0, 6)
    expect(domeProfile(0)).toBe(1)
    expect(domeProfile(1)).toBe(0)
    expect(domeProfile(0.5)).toBeGreaterThan(0)
  })

  it('stays a 3D dome on every quality level', () => {
    for (const level of DETAIL_LEVELS) {
      const segs = QUALITY_PRESETS[level].springSegments
      const { geometry } = build(() => 1.0, segs)
      const size = new THREE.Vector3()
      geometry.boundingBox!.getSize(size)
      expect(size.y, level).toBeGreaterThanOrEqual(SHAPE.domeHeight * 0.9)
    }
  })
})

describe('spring balance and quality entries', () => {
  it('balance holds positive, small calibratable values', () => {
    const s = balance.spring
    expect(s.radius).toBeGreaterThan(0.3)
    expect(s.radius).toBeLessThan(2) // reads at zoom 0.5 without dominating
    expect(s.domeHeight).toBeGreaterThan(0)
    expect(s.bubbleAmplitude).toBeGreaterThan(0)
    expect(s.bubbleAmplitude).toBeLessThan(s.domeHeight)
    expect(s.glow).toBeGreaterThanOrEqual(0)
  })

  it('every preset declares the spring levers, climbing low → high', () => {
    const { low, medium, high } = QUALITY_PRESETS
    expect(low.springSegments).toBeGreaterThanOrEqual(8)
    expect(low.springSegments).toBeLessThan(medium.springSegments)
    expect(medium.springSegments).toBeLessThan(high.springSegments)
    expect(low.springBubbles).toBeGreaterThanOrEqual(0)
    expect(low.springBubbles).toBeLessThanOrEqual(medium.springBubbles)
    expect(medium.springBubbles).toBeLessThanOrEqual(high.springBubbles)
  })
})
