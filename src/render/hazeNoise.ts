// Pre-baked tiling noise for the climate ground haze (point 1556). The haze
// layers used to evaluate a 3-octave 3D MaterialX fractal noise per fragment,
// per layer — the desert's largest single GPU cost. This module bakes the SAME
// noise once on the CPU (an exact port of three's mx_perlin_noise_float for a
// vec3, with the lattice wrapped so the tile repeats seamlessly) into a small
// R8 texture; the shader reads it twice, scrolled in different directions, to
// keep the drift and the slow morphing the time-driven z axis gave.

import * as THREE from 'three/webgpu'

const u32 = (x: number) => x >>> 0
const rotl32 = (x: number, k: number) => u32((x << k) | (x >>> (32 - k)))

/** three's mx_hash_int(x, y, z): Jenkins lookup3 final mix, uint32. */
export function mxHash3(x: number, y: number, z: number): number {
  const seed = u32(0xdeadbeef + (3 << 2) + 13)
  let a = u32(seed + x)
  let b = u32(seed + y)
  let c = u32(seed + z)
  c = u32(c ^ b); c = u32(c - rotl32(b, 14))
  a = u32(a ^ c); a = u32(a - rotl32(c, 11))
  b = u32(b ^ a); b = u32(b - rotl32(a, 25))
  c = u32(c ^ b); c = u32(c - rotl32(b, 16))
  a = u32(a ^ c); a = u32(a - rotl32(c, 4))
  b = u32(b ^ a); b = u32(b - rotl32(a, 14))
  c = u32(c ^ b); c = u32(c - rotl32(b, 24))
  return c
}

function gradient(hash: number, x: number, y: number, z: number): number {
  const h = hash & 15
  const u = h < 8 ? x : y
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z
  return (h & 1 ? -u : u) + (h & 2 ? -v : v)
}

const fade = (t: number) => t * t * t * (t * (t * 6 - 15) + 10)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const wrap = (i: number, period: number) => (period > 0 ? ((i % period) + period) % period : i)

/** mx_perlin_noise_float(vec3); with a period > 0 the x/y lattice wraps (tiling). */
export function mxPerlin3(px: number, py: number, pz: number, periodX = 0, periodY = 0): number {
  const X = Math.floor(px), Y = Math.floor(py), Z = Math.floor(pz)
  const fx = px - X, fy = py - Y, fz = pz - Z
  const x0 = wrap(X, periodX), x1 = wrap(X + 1, periodX)
  const y0 = wrap(Y, periodY), y1 = wrap(Y + 1, periodY)
  const u = fade(fx), v = fade(fy), w = fade(fz)
  const g = (ix: number, iy: number, iz: number, dx: number, dy: number, dz: number) =>
    gradient(mxHash3(ix, iy, iz), dx, dy, dz)
  const z0 = lerp(
    lerp(g(x0, y0, Z, fx, fy, fz), g(x1, y0, Z, fx - 1, fy, fz), u),
    lerp(g(x0, y1, Z, fx, fy - 1, fz), g(x1, y1, Z, fx - 1, fy - 1, fz), u),
    v,
  )
  const z1 = lerp(
    lerp(g(x0, y0, Z + 1, fx, fy, fz - 1), g(x1, y0, Z + 1, fx - 1, fy, fz - 1), u),
    lerp(g(x0, y1, Z + 1, fx, fy - 1, fz - 1), g(x1, y1, Z + 1, fx - 1, fy - 1, fz - 1), u),
    v,
  )
  return 0.982 * lerp(z0, z1, w)
}

/** mx_fractal_noise_float(p, octaves, lacunarity 2, diminish 0.5), x/y tiling at `period` base cells. */
export function mxFractal3(px: number, py: number, pz: number, octaves: number, period = 0): number {
  let r = 0
  let amp = 1
  let f = 1
  for (let o = 0; o < octaves; o++) {
    const p = period * f
    r += amp * mxPerlin3(px * f, py * f, pz * f, p, p)
    amp *= 0.5
    f *= 2
  }
  return r
}

/** Std of the shader's original 3-octave fractal over 3D space (measured,
 *  hazeNoise.test.ts re-measures it). The baked slice is scaled to it. */
export const MX_FRACTAL3_STD = 0.304

/** Bake an N x N tile of the fractal at a fixed z slice, `period` base cells
 *  across. Stored as byte = (noise * gain) * 0.5 + 0.5, where `gain` brings the
 *  slice's std to MX_FRACTAL3_STD (a single slice has a different std than the
 *  time-averaged z sweep the shader saw). Returns the bytes and that gain. */
export function bakeHazeNoise(size: number, period: number, octaves = 3, zSlice = 0.37): { data: Uint8Array; gain: number } {
  const raw = new Float32Array(size * size)
  // Per octave the wrapped lattice is tiny (period * 2^o cells square), so the
  // corner hashes are tabulated once instead of 8 Jenkins mixes per texel.
  let amp = 1
  for (let o = 0; o < octaves; o++) {
    const p = period * 2 ** o
    const pz = zSlice * 2 ** o
    const Z = Math.floor(pz)
    const fz = pz - Z
    const w = fade(fz)
    const h0 = new Uint8Array(p * p)
    const h1 = new Uint8Array(p * p)
    for (let y = 0; y < p; y++) {
      for (let x = 0; x < p; x++) {
        h0[y * p + x] = mxHash3(x, y, Z) & 15
        h1[y * p + x] = mxHash3(x, y, Z + 1) & 15
      }
    }
    for (let j = 0; j < size; j++) {
      const py = (j / size) * p
      const Y = Math.floor(py)
      const fy = py - Y
      const v = fade(fy)
      const y0 = Y % p, y1 = (Y + 1) % p
      for (let i = 0; i < size; i++) {
        const px = (i / size) * p
        const X = Math.floor(px)
        const fx = px - X
        const u = fade(fx)
        const x0 = X % p, x1 = (X + 1) % p
        const a = lerp(
          lerp(gradient(h0[y0 * p + x0], fx, fy, fz), gradient(h0[y0 * p + x1], fx - 1, fy, fz), u),
          lerp(gradient(h0[y1 * p + x0], fx, fy - 1, fz), gradient(h0[y1 * p + x1], fx - 1, fy - 1, fz), u),
          v,
        )
        const b = lerp(
          lerp(gradient(h1[y0 * p + x0], fx, fy, fz - 1), gradient(h1[y0 * p + x1], fx - 1, fy, fz - 1), u),
          lerp(gradient(h1[y1 * p + x0], fx, fy - 1, fz - 1), gradient(h1[y1 * p + x1], fx - 1, fy - 1, fz - 1), u),
          v,
        )
        raw[j * size + i] += amp * 0.982 * lerp(a, b, w)
      }
    }
    amp *= 0.5
  }
  let sum = 0
  let sum2 = 0
  for (const v of raw) {
    sum += v
    sum2 += v * v
  }
  const n = size * size
  const mean = sum / n
  const std = Math.sqrt(Math.max(1e-12, sum2 / n - mean * mean))
  const gain = MX_FRACTAL3_STD / std
  const data = new Uint8Array(n)
  for (let k = 0; k < n; k++) {
    const t = raw[k] * gain * 0.5 + 0.5
    data[k] = Math.max(0, Math.min(255, Math.round(t * 255)))
  }
  return { data, gain }
}

let cached: THREE.DataTexture | null = null

/** The shared, lazily baked haze noise texture (R8, repeat, mipmapped). */
export function getHazeNoiseTexture(size: number, period: number): THREE.DataTexture {
  if (cached) return cached
  const { data } = bakeHazeNoise(size, period)
  const tex = new THREE.DataTexture(data, size, size, THREE.RedFormat, THREE.UnsignedByteType)
  tex.wrapS = THREE.RepeatWrapping
  tex.wrapT = THREE.RepeatWrapping
  tex.magFilter = THREE.LinearFilter
  tex.minFilter = THREE.LinearMipmapLinearFilter
  tex.generateMipmaps = true
  tex.colorSpace = THREE.NoColorSpace
  tex.needsUpdate = true
  cached = tex
  return tex
}
