// Material construction (CLAUDE.md §7.1 pt. 11/15, design.md §2.6): the
// settlement surfaces carry procedural COLOR structure and a real NORMAL
// perturbation — the missing normal detail was exactly why first-person
// surfaces read soft and washed out. The visual result is covered by the
// Playwright detail checks; here the node wiring itself is pinned.
import { describe, it, expect } from 'vitest'
import { createGroundMaterial, createNoisyMaterial, proceduralBump } from './materials'
import { float, mx_fractal_noise_float, positionWorld } from 'three/tsl'

describe('createNoisyMaterial', () => {
  it('wires a color node AND a micro-relief normal node', () => {
    const m = createNoisyMaterial({ base: '#aa8855', alt: '#886633', scale: 0.8 })
    expect(m.colorNode).toBeTruthy()
    expect(m.normalNode).toBeTruthy()
    expect(m.metalness).toBe(0)
  })

  it('accepts anisotropic scale, bump strength and weathering', () => {
    const m = createNoisyMaterial({
      base: '#aa8855',
      alt: '#886633',
      scale: [2, 7, 2],
      bump: 3,
      weathered: true,
      roughness: 0.8,
    })
    expect(m.normalNode).toBeTruthy()
    expect(m.roughness).toBe(0.8)
  })
})

describe('createGroundMaterial', () => {
  it('wires color and normal nodes without a path mask', () => {
    const m = createGroundMaterial('#dcc99c', '#c4ad7c', '#b59a6b')
    expect(m.colorNode).toBeTruthy()
    expect(m.normalNode).toBeTruthy()
    expect(m.roughness).toBe(1)
  })
})

describe('proceduralBump', () => {
  it('builds a normal node from a procedural height field', () => {
    const height = mx_fractal_noise_float(positionWorld.mul(2), 3)
    const node = proceduralBump(height, float(2))
    expect(node).toBeTruthy()
  })
})
