import { describe, expect, it } from 'vitest'
import { bakeHazeNoise, mxFractal3, MX_FRACTAL3_STD } from './hazeNoise'
import { balance } from '../config/balance'

// Point 1556: the climate haze reads a baked tile of the former per-fragment
// MaterialX fractal noise. These checks hold the bake to that noise.

const rand = (() => {
  let s = 12345
  return () => {
    s = (Math.imul(s, 1103515245) + 12345) >>> 0
    return s / 2 ** 32
  }
})()

describe('haze noise bake', () => {
  const size = 128
  const period = 4
  const { data, gain } = bakeHazeNoise(size, period)

  it('matches the CPU port of the 3-octave MaterialX fractal texel by texel', () => {
    let worst = 0
    for (let j = 0; j < size; j += 7) {
      for (let i = 0; i < size; i += 5) {
        const ref = mxFractal3((i / size) * period, (j / size) * period, 0.37, 3, period) * gain * 0.5 + 0.5
        worst = Math.max(worst, Math.abs(data[j * size + i] / 255 - Math.min(1, Math.max(0, ref))))
      }
    }
    expect(worst).toBeLessThan(1 / 255 + 1e-6)
  })

  it('tiles seamlessly: the noise at the far edge continues into texel 0', () => {
    for (let j = 0; j < size; j += 9) {
      const edge = mxFractal3(period, (j / size) * period, 0.37, 3, period)
      const start = mxFractal3(0, (j / size) * period, 0.37, 3, period)
      expect(edge).toBeCloseTo(start, 9)
    }
  })

  it('keeps the original noise variance (MX_FRACTAL3_STD re-measured over 3D space)', () => {
    let s = 0
    let s2 = 0
    const n = 40000
    for (let k = 0; k < n; k++) {
      const v = mxFractal3(rand() * 400 - 200, rand() * 400 - 200, rand() * 400, 3)
      s += v
      s2 += v * v
    }
    const std3d = Math.sqrt(s2 / n - (s / n) ** 2)
    expect(std3d).toBeGreaterThan(MX_FRACTAL3_STD * 0.95)
    expect(std3d).toBeLessThan(MX_FRACTAL3_STD * 1.05)
    // The stored tile carries that std in its 0.5-centred byte encoding.
    let b = 0
    let b2 = 0
    for (const v of data) {
      const t = (v / 255 - 0.5) * 2
      b += t
      b2 += t * t
    }
    const stdTile = Math.sqrt(b2 / data.length - (b / data.length) ** 2)
    expect(stdTile).toBeGreaterThan(MX_FRACTAL3_STD * 0.95)
    expect(stdTile).toBeLessThan(MX_FRACTAL3_STD * 1.05)
  })

  it('is deterministic', () => {
    expect(bakeHazeNoise(32, 2).data).toEqual(bakeHazeNoise(32, 2).data)
  })

  it('balance resolves the finest octave with >= 4 texels per cycle', () => {
    const { noiseTextureSize, noiseTilePeriod } = balance.climateHaze
    expect(noiseTextureSize / (noiseTilePeriod * 4)).toBeGreaterThanOrEqual(4)
  })
})
