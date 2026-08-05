import { describe, it, expect } from 'vitest'
import { isSnowPixel, snowFraction, SNOW_MIN_CHANNEL, SNOW_MAX_CHROMA } from './snowMetric.mjs'

// Colours lifted from the real frames the check judges (point 503).
const SUNLIT_SNOW = [215, 212, 205]
const SHADED_SNOW = [196, 195, 191]
const SUNLIT_SAND = [230, 209, 142]
const PALE_SAND = [241, 225, 171] // the brightest pixel in the bare July crop
const ROCK = [122, 108, 92]
const PARCHMENT = [243, 231, 201] // the journal panel, the brightest DOM surface

const buf = (pixels) => Buffer.from(pixels.flat())

describe('isSnowPixel', () => {
  it('accepts the snow the scene actually renders — sunlit and shaded', () => {
    expect(isSnowPixel(...SUNLIT_SNOW)).toBe(true)
    expect(isSnowPixel(...SHADED_SNOW)).toBe(true)
  })

  it('rejects sand, however bright — it is warm, and that is the separation', () => {
    expect(isSnowPixel(...SUNLIT_SAND)).toBe(false)
    expect(isSnowPixel(...PALE_SAND)).toBe(false)
    expect(isSnowPixel(...PARCHMENT)).toBe(false)
  })

  it('rejects rock and anything else too dark to read as snow', () => {
    expect(isSnowPixel(...ROCK)).toBe(false)
    expect(isSnowPixel(170, 170, 170)).toBe(false)
  })

  it('does NOT depend on a near-white exposure the tone mapping never delivers', () => {
    // The old measure demanded min > 205; this is exactly the band it lost.
    expect(SNOW_MIN_CHANNEL).toBeLessThan(205)
    expect(isSnowPixel(200, 198, 194)).toBe(true)
  })

  it('takes its thresholds from the caller when asked', () => {
    expect(isSnowPixel(180, 178, 174, 185)).toBe(false)
    expect(isSnowPixel(200, 190, 178, SNOW_MIN_CHANNEL, 10)).toBe(false)
    expect(isSnowPixel(200, 190, 178, SNOW_MIN_CHANNEL, 30)).toBe(true)
  })
})

describe('snowFraction', () => {
  it('is the share of snow pixels in the buffer', () => {
    const data = buf([SUNLIT_SNOW, SUNLIT_SAND, SHADED_SNOW, ROCK])
    expect(snowFraction(data, { width: 2, height: 2, channels: 3 })).toBeCloseTo(0.5)
  })

  it('reads 0 for a bare summer crest and 1 for a buried one', () => {
    expect(snowFraction(buf([SUNLIT_SAND, PALE_SAND, ROCK]), { width: 3, height: 1, channels: 3 })).toBe(0)
    expect(snowFraction(buf([SUNLIT_SNOW, SHADED_SNOW]), { width: 2, height: 1, channels: 3 })).toBe(1)
  })

  it('skips the alpha byte of an RGBA buffer', () => {
    const rgba = Buffer.from([...SUNLIT_SNOW, 255, ...SUNLIT_SAND, 255])
    expect(snowFraction(rgba, { width: 2, height: 1, channels: 4 })).toBeCloseTo(0.5)
  })

  it('is total on an empty or missing buffer', () => {
    expect(snowFraction(null, { width: 4, height: 4, channels: 3 })).toBe(0)
    expect(snowFraction(buf([SUNLIT_SNOW]), { width: 0, height: 0, channels: 3 })).toBe(0)
    expect(snowFraction(buf([SUNLIT_SNOW]), undefined)).toBe(0)
  })

  it('honours overridden thresholds', () => {
    const data = buf([SHADED_SNOW, SUNLIT_SNOW])
    expect(snowFraction(data, { width: 2, height: 1, channels: 3 }, { minChannel: 205 })).toBe(0)
    expect(SNOW_MAX_CHROMA).toBeGreaterThan(0)
  })
})
