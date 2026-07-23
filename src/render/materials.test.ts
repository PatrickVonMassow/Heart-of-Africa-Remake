// Material construction (CLAUDE.md §7.1 pt. 11/15, design.md §2.6): the
// settlement surfaces carry COLOR structure and a real NORMAL perturbation
// from the baked tileable maps — the missing normal detail was exactly why
// first-person surfaces read soft and washed out. The visual result is
// covered by the Playwright detail checks; here the node wiring and the
// distance-stability sampler state (mips, anisotropy, repeat) are pinned.
import { describe, it, expect } from 'vitest'
import * as THREE from 'three/webgpu'
import {
  createGroundMaterial,
  createNoisyMaterial,
  createSurfaceMaterial,
  detailFade,
  loadSurfaceTexture,
  proceduralBump,
} from './materials'
import { float, mx_fractal_noise_float, positionWorld } from 'three/tsl'

describe('createSurfaceMaterial', () => {
  it('wires a color node AND a baked micro-relief normal node', () => {
    for (const kind of ['plaster', 'mud', 'thatch', 'wood'] as const) {
      const m = createSurfaceMaterial(kind, { base: '#aa8855', alt: '#886633' })
      expect(m.colorNode).toBeTruthy()
      expect(m.normalNode).toBeTruthy()
      expect(m.metalness).toBe(0)
    }
  })

  it('accepts roughness, bump scale and weathering', () => {
    const m = createSurfaceMaterial('mud', {
      base: '#aa8855',
      alt: '#886633',
      bump: 1.3,
      weathered: true,
      roughness: 0.8,
    })
    expect(m.normalNode).toBeTruthy()
    expect(m.roughness).toBe(0.8)
  })
})

describe('loadSurfaceTexture', () => {
  it('sets the distance-stability sampler state: repeat, mips, anisotropy', () => {
    const t = loadSurfaceTexture('plaster_a')
    expect(t.wrapS).toBe(THREE.RepeatWrapping)
    expect(t.wrapT).toBe(THREE.RepeatWrapping)
    expect(t.generateMipmaps).toBe(true)
    expect(t.anisotropy).toBeGreaterThan(1)
    expect(t.colorSpace).toBe(THREE.NoColorSpace)
  })

  it('caches by name (one texture per map)', () => {
    expect(loadSurfaceTexture('ground_n')).toBe(loadSurfaceTexture('ground_n'))
  })
})

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

  it('wires the wet-ground roughness node (point 225 — rain glosses the ground)', () => {
    // The wet factor darkens the albedo (colorNode wraps wetGroundColor) and
    // pulls the roughness toward a sheen via a node overriding the scalar 1.
    const m = createGroundMaterial('#dcc99c', '#c4ad7c', '#b59a6b')
    expect(m.roughnessNode).toBeTruthy()
    expect(m.colorNode).toBeTruthy()
  })
})

describe('proceduralBump', () => {
  it('builds a normal node from a procedural height field', () => {
    const height = mx_fractal_noise_float(positionWorld.mul(2), 3)
    const node = proceduralBump(height, float(2))
    expect(node).toBeTruthy()
  })
})

describe('detailFade', () => {
  it('builds a view-distance fade node usable as a detail amplitude', () => {
    const fade = detailFade(16, 48)
    expect(fade).toBeTruthy()
    // Composes with a bump strength (the anti-trembling wiring).
    expect(proceduralBump(mx_fractal_noise_float(positionWorld, 2), float(2).mul(fade))).toBeTruthy()
  })
})
