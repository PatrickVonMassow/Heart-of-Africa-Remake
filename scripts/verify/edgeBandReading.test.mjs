import { describe, expect, it } from 'vitest'
import sharp from 'sharp'
import { bandRatio, edgeShotReading, groundSamples } from './edgeBandReading.mjs'

const view = { width: 200, height: 100 }
const cropSize = [150, 46]
const reads = value => Array.from({ length: 6 }, () => Float64Array.of(value, value))
const ratioFrom = readings => bandRatio(async () => readings.shift())

describe('settlement edge reading diagnostics', () => {
  it('reports the off-frame rectangle against the viewport through the ratio', async () => {
    // Geometry rejection must happen before the image is decoded.
    const crop = await groundSamples(null, { x: 1, y: 0 }, view, ...cropSize)
    const ratio = await ratioFrom([{ value: 80 }, crop, { value: 80 }])
    expect(ratio.value).toBeNull()
    expect(ratio.detail).toBe('off: crop off-frame: rectangle {"left":125,"top":27,"width":150,"height":46} against viewport {"width":200,"height":100}')
    expect(ratio.detail).not.toContain('luminance')
  })

  it.each([{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 0, y: -1 }])('rejects each other viewport edge: %j', async ndc => {
    expect((await groundSamples(null, ndc, view, ...cropSize)).value).toBeNull()
  })

  it('reports a measured zero OFF reading separately from crop geometry', async () => {
    const ratio = await ratioFrom([{ value: 80 }, { value: 0 }, { value: 82 }])
    expect(ratio).toEqual({ value: null, detail: 'band-off luminance is not positive: off=0, on1=80, on2=82' })
  })

  it('carries an actual black in-frame image through the drift guard as an OFF zero', async () => {
    const buf = await sharp({ create: { ...view, channels: 3, background: '#000000' } }).png().toBuffer()
    const crop = await groundSamples(buf, { x: 0, y: 0 }, view, ...cropSize)
    expect(crop.value).toHaveLength(150 * 46)
    const off = edgeShotReading(Array.from({ length: 6 }, () => crop.value))
    const ratio = await ratioFrom([{ value: 80 }, off, { value: 80 }])
    expect(ratio).toEqual({ value: null, detail: 'off: zero-luminance shot: reading=0, drift=null' })
  })

  it('accepts a crop exactly on the viewport edges and measures its pixels', async () => {
    const buf = await sharp({ create: { ...view, channels: 3, background: '#646464' } }).png().toBuffer()
    const crop = await groundSamples(buf, { x: 0, y: 0 }, view, view.width, view.height)
    expect(crop.value).toHaveLength(view.width * view.height)
    expect(edgeShotReading(Array.from({ length: 6 }, () => crop.value)).value).toBeCloseTo(100)
  })

  it('retains the ON/OFF/ON order and symmetric ratio', async () => {
    const strengths = []
    const values = [80, 100, 82]
    const ratio = await bandRatio(async strength => {
      strengths.push(strength)
      return edgeShotReading(reads(values.shift()))
    })
    expect(strengths).toEqual([1, 0, 1])
    expect(ratio).toEqual({ value: 0.81 })
  })

  it('identifies drift and all failed shot phases without relabeling them off-frame', async () => {
    const drift = edgeShotReading([...reads(80).slice(0, 3), ...reads(100).slice(0, 3)])
    const ratio = await ratioFrom([drift, { value: 100 }, { value: null, detail: 'read gap starved before read 2' }])
    expect(ratio.value).toBeNull()
    expect(ratio.detail).toContain('on1: shot rejected: luminance=80, drift=')
    expect(ratio.detail).toContain('bar=0.01; on2: read gap starved before read 2')
    expect(ratio.detail).not.toContain('off-frame')
  })
})
