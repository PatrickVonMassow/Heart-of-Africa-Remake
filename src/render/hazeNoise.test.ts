import { describe, expect, it } from 'vitest'
import { bakeHazeNoise, getHazeNoiseTexture, HAZE_NOISE_SLICES, mxFractal3, MX_FRACTAL3_STD } from './hazeNoise'
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
  const { data, gain, mean } = bakeHazeNoise(size, period)

  it('matches the CPU port of the 3-octave MaterialX fractal texel by texel', () => {
    let worst = 0
    for (let j = 0; j < size; j += 7) {
      for (let i = 0; i < size; i += 5) {
        const ref = (mxFractal3((i / size) * period, (j / size) * period, 0.37, 3, period) - mean) * gain * 0.5 + 0.5
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

  it('is centred: the encoded tile mean sits at 0.5 within one byte step', () => {
    let b = 0
    for (const v of data) b += v / 255
    expect(Math.abs(b / data.length - 0.5)).toBeLessThan(1 / 255)
  })

  it('bakes the two channels as uncorrelated fields at every relative shift sampled', () => {
    const [r, g] = HAZE_NOISE_SLICES.map((z) => bakeHazeNoise(size, period, 3, z).data)
    for (const [dx, dy] of [[0, 0], [1, 0], [17, 5], [64, 64], [100, 31]]) {
      let sr = 0, sg = 0, srr = 0, sgg = 0, srg = 0
      for (let j = 0; j < size; j++) {
        for (let i = 0; i < size; i++) {
          const a = r[j * size + i]
          const c = g[((j + dy) % size) * size + ((i + dx) % size)]
          sr += a; sg += c; srr += a * a; sgg += c * c; srg += a * c
        }
      }
      const n = size * size
      const cov = srg / n - (sr / n) * (sg / n)
      const corr = cov / Math.sqrt((srr / n - (sr / n) ** 2) * (sgg / n - (sg / n) ** 2))
      expect(Math.abs(corr)).toBeLessThan(0.15)
    }
  })

  it('caches the texture per size and period, never a stale calibration', () => {
    const a = getHazeNoiseTexture(16, 2)
    expect(getHazeNoiseTexture(16, 2)).toBe(a)
    expect(getHazeNoiseTexture(16, 1)).not.toBe(a)
    expect(getHazeNoiseTexture(32, 2)).not.toBe(a)
  })

  it('is deterministic', () => {
    expect(bakeHazeNoise(32, 2).data).toEqual(bakeHazeNoise(32, 2).data)
  })

  it('balance resolves the finest octave with >= 4 texels per cycle', () => {
    const { noiseTextureSize, noiseTilePeriod } = balance.climateHaze
    expect(noiseTextureSize / (noiseTilePeriod * 4)).toBeGreaterThanOrEqual(4)
  })
})
