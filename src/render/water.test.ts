// Ocean water material invariants (design.md §11.3). Guards the depth-buffer
// regression of the lower Nile: the sea plane spans the whole world at sea
// level, and if it writes depth it culls the river/lake surfaces lying in
// beds carved below sea level — pale shifting patches on the river.
import { describe, it, expect, beforeAll } from 'vitest'
import { setupGeodata } from '../test/geodata'
import { createWaterMaterial } from './water'

describe('ocean water material', () => {
  // Built ONCE for both cases. Constructing the node material costs well over a
  // second, and paying it inside a case put the first one within reach of
  // vitest's 5 s default: on 28.07.2026 it timed out there inside the full run
  // on a QUIET machine while passing in 1.5 s alone. The invariants are
  // read-only, so one material answers both.
  let material: ReturnType<typeof createWaterMaterial>['material']
  beforeAll(async () => {
    await setupGeodata()
    material = createWaterMaterial().material
  })

  it('is transparent and never writes depth', () => {
    expect(material.transparent).toBe(true)
    expect(material.depthWrite).toBe(false)
  })

  it('drives opacity and color through node graphs (land mask, depth tint)', () => {
    // The land-flag mask and bathymetry tint live in these node graphs; a
    // refactor that drops them would fall back to plain uniform values.
    expect(material.opacityNode).toBeTruthy()
    expect(material.colorNode).toBeTruthy()
  })
})
