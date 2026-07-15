// Region-border ribbon (CLAUDE.md §7.1 pt. 13, point 101): the dashed ground
// marking must lie FLUSH on the terrain — a corner floating over a lower
// riverbank made the screen-space AO blacken the ribbon into a "black bar near
// the river". And its ink tone must be a legible mid-tone, never near-black.
import { describe, it, expect, beforeAll } from 'vitest'
import * as THREE from 'three/webgpu'
import { buildBorderGeometry, BORDER_INK, BORDER_LIFT } from './borderGeometry'
import { worldToLatLon } from '../../world/geo'
import { sampleTerrain } from '../../world/terrain'
import { setupGeodata } from '../../test/geodata'

const SEED = 42

// Land/ocean/biome classification needs the real DEM; load it into jsdom.
beforeAll(async () => {
  await setupGeodata()
})

describe('border ink tone (design.md §3.1)', () => {
  it('is a legible mid-tone — never near-black (the AO black-slab cause) nor near-white', () => {
    const c = new THREE.Color(BORDER_INK)
    // Relative luminance in the material's (linear) space.
    const lum = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b
    expect(lum).toBeGreaterThan(0.1)
    expect(lum).toBeLessThan(0.85)
  })
})

describe('buildBorderGeometry lies flush on the terrain (point 101)', () => {
  // Built lazily inside the tests — the DEM is only ready after beforeAll.
  let p: THREE.BufferAttribute
  beforeAll(() => {
    p = buildBorderGeometry(SEED).attributes.position as THREE.BufferAttribute
  })

  it('produces a non-empty ribbon', () => {
    expect(p.count).toBeGreaterThan(100)
  })

  it('sets every corner to its OWN terrain height + lift (no floating over banks)', () => {
    // Sample a spread of vertices; each must sit BORDER_LIFT above the terrain
    // sampled at its own (x, z) — the flush-corner invariant that removed the
    // floating gap the AO read as full occlusion.
    let checked = 0
    let maxErr = 0
    for (let i = 0; i < p.count; i += 7) {
      const x = p.getX(i)
      const y = p.getY(i)
      const z = p.getZ(i)
      const ll = worldToLatLon(x, z)
      const h = sampleTerrain(ll.lat, ll.lon, SEED).height
      maxErr = Math.max(maxErr, Math.abs(y - (h + BORDER_LIFT)))
      checked++
    }
    expect(checked).toBeGreaterThan(10)
    expect(maxErr).toBeLessThan(0.01)
  })

  it('keeps the whole ribbon on land (no vertex over water)', () => {
    for (let i = 0; i < p.count; i += 5) {
      const ll = worldToLatLon(p.getX(i), p.getZ(i))
      expect(sampleTerrain(ll.lat, ll.lon, SEED).height).toBeGreaterThan(0.05)
    }
  })
})
