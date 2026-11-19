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

  it('keeps the two shipped channels uncorrelated over a full shift sweep', () => {
    // A finite tile of two independent fields still shows some sample
    // correlation at some shifts; at the shipped tile the worst stays near the
    // old noise's own slice-to-slice variance spread (~±7 %). Measured
    // 19.11.2026: max |r| 0.145, rms 0.046.
    const { noiseTextureSize: n, noiseTilePeriod: per } = balance.climateHaze
    const [r, g] = HAZE_NOISE_SLICES.map((z) => bakeHazeNoise(n, per, 3, z).data)
    let worst = 0
    let sum2 = 0
    let shifts = 0
    for (let dy = 0; dy < n; dy += 12) {
      for (let dx = 0; dx < n; dx += 12) {
        let sr = 0, sg = 0, srr = 0, sgg = 0, srg = 0, m = 0
        for (let j = 0; j < n; j += 4) {
          for (let i = 0; i < n; i += 4) {
            const a = r[j * n + i]
            const c = g[((j + dy) % n) * n + ((i + dx) % n)]
            sr += a; sg += c; srr += a * a; sgg += c * c; srg += a * c; m++
          }
        }
        const cov = srg / m - (sr / m) * (sg / m)
        const corr = cov / Math.sqrt((srr / m - (sr / m) ** 2) * (sgg / m - (sg / m) ** 2))
        worst = Math.max(worst, Math.abs(corr))
        sum2 += corr * corr
        shifts++
      }
    }
    expect(worst).toBeLessThan(0.17)
    expect(Math.sqrt(sum2 / shifts)).toBeLessThan(0.06)
  })

  it('packs both independent, centred slices into the shared texture', () => {
    const size = 24
    const per = 3
    const tex = getHazeNoiseTexture(size, per)
    const packed = tex.image.data as Uint8Array
    expect(packed.length).toBe(size * size * 2)
    HAZE_NOISE_SLICES.forEach((z, ch) => {
      const ref = bakeHazeNoise(size, per, 3, z).data
      let mean = 0
      for (let k = 0; k < size * size; k++) {
        expect(packed[k * 2 + ch]).toBe(ref[k])
        mean += packed[k * 2 + ch] / 255
      }
      expect(Math.abs(mean / (size * size) - 0.5)).toBeLessThan(1 / 255)
    })
    let same = 0
    for (let k = 0; k < size * size; k++) if (packed[k * 2] === packed[k * 2 + 1]) same++
    expect(same).toBeLessThan(size * size * 0.2)
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
