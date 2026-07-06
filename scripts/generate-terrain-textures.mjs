// Generates the tileable PBR ground textures (albedo + normal map) used by
// the terrain splatting (design.md §3). Procedural and deterministic, so the
// assets are reproducible from the repository without downloads:
//   node scripts/generate-terrain-textures.mjs
// Writes public/geodata/tex/{sand,grass,rock,forest}_{a,n}.png (256², RGB).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePngRgb } from './png.mjs'

const OUT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'geodata', 'tex')
const SIZE = 256

// --- Periodic (tileable) value noise -------------------------------------------

function hash2(ix, iy, seed) {
  let h = seed >>> 0
  h = Math.imul(h ^ ix, 0x85ebca6b)
  h = Math.imul(h ^ iy, 0xc2b2ae35)
  h ^= h >>> 13
  h = Math.imul(h, 0x27d4eb2f)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

function smooth(t) {
  return t * t * (3 - 2 * t)
}

/** Value noise with lattice period `p` (tileable in [0,1)². */
function pnoise(u, v, p, seed) {
  const x = u * p
  const y = v * p
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  const w = (gx, gy) => hash2(((gx % p) + p) % p, ((gy % p) + p) % p, seed)
  const a = w(ix, iy)
  const b = w(ix + 1, iy)
  const c = w(ix, iy + 1)
  const d = w(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

function fbm(u, v, p0, octaves, seed, gain = 0.5) {
  let sum = 0
  let amp = 0.5
  let p = p0
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * pnoise(u, v, p, seed + o * 131)
    norm += amp
    amp *= gain
    p *= 2
  }
  return sum / norm
}

/** Tileable Worley (cell) noise, distance to nearest feature point. */
function worley(u, v, p, seed) {
  const x = u * p
  const y = v * p
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  let min = 10
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const cx = ix + dx
      const cy = iy + dy
      const fx = cx + hash2(((cx % p) + p) % p, ((cy % p) + p) % p, seed)
      const fy = cy + hash2(((cx % p) + p) % p, ((cy % p) + p) % p, seed + 77)
      const d = Math.hypot(x - fx, y - fy)
      if (d < min) min = d
    }
  }
  return Math.min(1, min)
}

// --- Material definitions -------------------------------------------------------
// Each material is a height function h(u,v) in [0,1] plus a colorize(h, u, v)
// returning [r,g,b] 0..255. Albedo stays mid-brightness: at runtime it is
// multiplied with the biome vertex tint.

const MATERIALS = {
  // Fine grain with soft wind ripples.
  sand: {
    height(u, v) {
      const ripple = 0.5 + 0.5 * Math.sin((u * 18 + fbm(u, v, 6, 2, 11) * 2.2) * Math.PI * 2)
      return fbm(u, v, 24, 4, 12) * 0.55 + ripple * 0.3 + fbm(u, v, 96, 2, 13) * 0.15
    },
    colorize(h, u, v) {
      const g = 165 + h * 70 + (fbm(u, v, 48, 2, 14) - 0.5) * 18
      return [g * 1.06, g * 0.94, g * 0.72]
    },
    normalStrength: 1.6,
  },
  // Clumpy dry grassland seen from above.
  grass: {
    height(u, v) {
      const clumps = fbm(u, v, 16, 4, 21)
      const blades = fbm(u, v, 128, 2, 22)
      return clumps * 0.6 + blades * 0.4
    },
    colorize(h, u, v) {
      const patch = fbm(u, v, 8, 3, 23)
      const g = 130 + h * 80
      return [g * (0.82 + patch * 0.25), g * (0.86 + h * 0.1), g * 0.5]
    },
    normalStrength: 2.2,
  },
  // Cracked rock: inverted Worley ridges over fbm.
  rock: {
    height(u, v) {
      const cracks = Math.pow(worley(u, v, 10, 31), 0.7)
      return cracks * 0.65 + fbm(u, v, 32, 4, 32) * 0.35
    },
    colorize(h, u, v) {
      const vein = fbm(u, v, 20, 3, 33)
      const g = 120 + h * 90
      return [g * (0.95 + vein * 0.1), g * 0.92, g * 0.88]
    },
    normalStrength: 3.2,
  },
  // Dense canopy blobs from above.
  forest: {
    height(u, v) {
      const crowns = 1 - worley(u, v, 14, 41)
      return Math.pow(crowns, 1.4) * 0.7 + fbm(u, v, 48, 3, 42) * 0.3
    },
    colorize(h, u, v) {
      const varia = fbm(u, v, 12, 3, 43)
      const g = 95 + h * 105
      return [g * (0.45 + varia * 0.2), g * (0.82 + h * 0.1), g * 0.38]
    },
    normalStrength: 2.8,
  },
}

// --- Generation ------------------------------------------------------------------

fs.mkdirSync(OUT, { recursive: true })
for (const [name, mat] of Object.entries(MATERIALS)) {
  const heights = new Float32Array(SIZE * SIZE)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      heights[y * SIZE + x] = mat.height(x / SIZE, y / SIZE)
    }
  }
  const albedo = new Uint8Array(SIZE * SIZE * 3)
  const normal = new Uint8Array(SIZE * SIZE * 3)
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const i = y * SIZE + x
      const h = heights[i]
      const [r, g, b] = mat.colorize(h, x / SIZE, y / SIZE)
      albedo[i * 3] = Math.max(0, Math.min(255, r))
      albedo[i * 3 + 1] = Math.max(0, Math.min(255, g))
      albedo[i * 3 + 2] = Math.max(0, Math.min(255, b))
      // Tangent-space normal from height differences (wrapping).
      const hl = heights[y * SIZE + ((x + SIZE - 1) % SIZE)]
      const hr = heights[y * SIZE + ((x + 1) % SIZE)]
      const hu = heights[((y + SIZE - 1) % SIZE) * SIZE + x]
      const hd = heights[((y + 1) % SIZE) * SIZE + x]
      const nx = (hl - hr) * mat.normalStrength
      const ny = (hu - hd) * mat.normalStrength
      const inv = 1 / Math.hypot(nx, ny, 1)
      normal[i * 3] = Math.round((nx * inv * 0.5 + 0.5) * 255)
      normal[i * 3 + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255)
      normal[i * 3 + 2] = Math.round((inv * 0.5 + 0.5) * 255)
    }
  }
  fs.writeFileSync(path.join(OUT, `${name}_a.png`), encodePngRgb(SIZE, SIZE, albedo))
  fs.writeFileSync(path.join(OUT, `${name}_n.png`), encodePngRgb(SIZE, SIZE, normal))
  console.log(`wrote ${name}_a.png / ${name}_n.png`)
}
