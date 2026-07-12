// Ocean water material invariants (design.md §11.3). Guards the depth-buffer
// regression of the lower Nile: the sea plane spans the whole world at sea
// level, and if it writes depth it culls the river/lake surfaces lying in
// beds carved below sea level — pale shifting patches on the river.
import { describe, it, expect, beforeAll } from 'vitest'
import { setupGeodata } from '../test/geodata'
import { createWaterMaterial } from './water'

describe('ocean water material', () => {
  beforeAll(async () => {
    await setupGeodata()
  })

  it('is transparent and never writes depth', () => {
    const { material } = createWaterMaterial()
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
  })

  it('drives opacity and color through node graphs (land mask, depth tint)', () => {
    const { material } = createWaterMaterial()
    // The land-flag mask and bathymetry tint live in these node graphs; a
    // refactor that drops them would fall back to plain uniform values.
    expect(material.opacityNode).toBeTruthy()
    expect(material.colorNode).toBeTruthy()
  })
})
