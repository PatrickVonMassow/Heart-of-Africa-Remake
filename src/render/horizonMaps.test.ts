// Horizon maps at runtime (design.md §2.7): the uniforms leave the terrain
// untouched until the maps are both wanted and loaded, the bake's extent
// matches the UV mapping, and the module issues no request at the low level.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { HORIZON_BOUNDS, horizonUniformValues, setHorizonMapsWanted, setHorizonSun } from './horizonMaps'
import { QUALITY_PRESETS } from '../config/quality'

describe('horizon map uniforms', () => {
  it('apply only when the level wants the maps AND they have arrived', () => {
    const sun = { azimuthDeg: 270, elevationDeg: 12 }
    expect(horizonUniformValues({ wanted: false, loaded: false, ...sun }).enabled).toBe(0)
    expect(horizonUniformValues({ wanted: true, loaded: false, ...sun }).enabled).toBe(0)
    expect(horizonUniformValues({ wanted: false, loaded: true, ...sun }).enabled).toBe(0)
    expect(horizonUniformValues({ wanted: true, loaded: true, ...sun }).enabled).toBe(1)
  })

  it('split the slice weights across both maps and convert the elevation', () => {
    const v = horizonUniformValues({ wanted: true, loaded: true, azimuthDeg: 300, elevationDeg: 9 })
    const sum = v.weightsA.reduce((a, w) => a + w, 0) + v.weightsB[0] + v.weightsB[1]
    expect(sum).toBeCloseTo(1, 12)
    expect(v.weightsB[0] + v.weightsB[1]).toBeCloseTo(1, 12) // 300° lies between slices 4 and 5
    expect(v.sunElevation).toBeCloseTo((9 * Math.PI) / 180, 12)
    expect(v.clamped).toBe(false)
  })

  it('match the extent of the committed bake', () => {
    const meta = JSON.parse(readFileSync(resolve(process.cwd(), 'public/geodata/horizon.json'), 'utf8'))
    expect(meta.lonMin).toBeCloseTo(HORIZON_BOUNDS.lonMin, 9)
    expect(meta.lonMax).toBeCloseTo(HORIZON_BOUNDS.lonMax, 9)
    expect(meta.latMin).toBeCloseTo(HORIZON_BOUNDS.latMin, 9)
    expect(meta.latMax).toBeCloseTo(HORIZON_BOUNDS.latMax, 9)
  })
})

describe('horizon map requests follow the effective level', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('no request at low; both maps once when the level rises; none on a second rise', () => {
    const fetchMock = vi.fn(() => new Promise<Response>(() => {})) // never settles: the frame is not blocked
    vi.stubGlobal('fetch', fetchMock)
    setHorizonSun(270, 12)
    setHorizonMapsWanted(QUALITY_PRESETS.low.horizonMaps)
    expect(fetchMock).not.toHaveBeenCalled()
    setHorizonMapsWanted(QUALITY_PRESETS.medium.horizonMaps)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    const urls = fetchMock.mock.calls.map((c) => String((c as unknown[])[0]))
    expect(urls.some((u) => u.endsWith('geodata/horizon-a.png'))).toBe(true)
    expect(urls.some((u) => u.endsWith('geodata/horizon-b.png'))).toBe(true)
    setHorizonMapsWanted(QUALITY_PRESETS.low.horizonMaps)
    setHorizonMapsWanted(QUALITY_PRESETS.high.horizonMaps)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
