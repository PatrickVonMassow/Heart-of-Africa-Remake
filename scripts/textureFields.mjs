// Shared texture-baking core: periodic (tileable) noise fields, the material
// height/colorize definitions and the albedo+normal bake loop. Used by the
// generator scripts (generate-terrain-textures.mjs, generate-surface-textures.mjs)
// and imported by the Vitest coverage (src/render/surfaceTextures.test.ts), so
// the baked assets stay reproducible and the fields stay pinned by tests.

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

/** Value noise with lattice period `p` (tileable in [0,1)²). */
export function pnoise(u, v, p, seed) {
  return pnoise2(u, v, p, p, seed)
}

/** Anisotropic value noise with per-axis periods (tileable in [0,1)²). */
export function pnoise2(u, v, pu, pv, seed) {
  const x = u * pu
  const y = v * pv
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = smooth(x - ix)
  const fy = smooth(y - iy)
  const w = (gx, gy) => hash2(((gx % pu) + pu) % pu, ((gy % pv) + pv) % pv, seed)
  const a = w(ix, iy)
  const b = w(ix + 1, iy)
  const c = w(ix, iy + 1)
  const d = w(ix + 1, iy + 1)
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
}

export function fbm(u, v, p0, octaves, seed, gain = 0.5) {
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

/** Anisotropic fBm with per-axis start periods (e.g. smears, wood grain). */
export function fbm2(u, v, pu0, pv0, octaves, seed, gain = 0.5) {
  let sum = 0
  let amp = 0.5
  let pu = pu0
  let pv = pv0
  let norm = 0
  for (let o = 0; o < octaves; o++) {
    sum += amp * pnoise2(u, v, pu, pv, seed + o * 131)
    norm += amp
    amp *= gain
    pu *= 2
    pv *= 2
  }
  return sum / norm
}

/** Tileable Worley (cell) noise, distance to nearest feature point. */
export function worley(u, v, p, seed) {
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

const clamp01 = (x) => Math.max(0, Math.min(1, x))

/** Thin elongated bright dashes (embedded straw in mud daub). */
function strawFlecks(u, v, seed) {
  const n = pnoise2(u, v, 42, 6, seed)
  return smooth(clamp01((n - 0.78) / 0.1))
}

// --- Terrain materials (bird's-eye splatting, design.md §3) ---------------------
// Each material is a height function h(u,v) in [0,1] plus a colorize(h, u, v)
// returning [r,g,b] 0..255. Albedo stays mid-brightness: at runtime it is
// multiplied with the biome vertex tint.

export const TERRAIN_MATERIALS = {
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

// --- Surface materials (first-person settlements, design.md §2.6) ---------------
// Baked structure maps for the settlement walls and ground: albedo hovers
// around mid-gray (mean ≈ 128) and is multiplied with the region tint at
// runtime (materials.ts doubles the texel), so one texture serves every
// region palette. The normal maps carry the millimetre micro-relief; the
// GPU mip chain band-limits both with distance (near = sharp, far = calm).

export const SURFACE_MATERIALS = {
  // Lime plaster: broad trowel undulation, fine granular grain, sparse pits.
  plaster: {
    height(u, v) {
      const trowel = fbm(u, v, 5, 3, 101)
      const grain = fbm(u, v, 72, 3, 102)
      const pits = Math.pow(1 - worley(u, v, 26, 103), 8)
      return clamp01(trowel * 0.45 + grain * 0.42 - pits * 0.55 + 0.12)
    },
    colorize(h, u, v) {
      const speck = fbm(u, v, 120, 2, 104)
      const g = 96 + h * 76 + (speck - 0.5) * 14
      return [g * 1.03, g, g * 0.94]
    },
    normalStrength: 2.0,
  },
  // Mud daub: coarse daub lumps, horizontal hand-smear bands, embedded straw.
  mud: {
    height(u, v) {
      const daub = fbm(u, v, 9, 4, 111)
      const smear = fbm2(u, v, 3, 14, 3, 112)
      const straw = strawFlecks(u, v, 113)
      return clamp01(daub * 0.5 + smear * 0.3 + straw * 0.28 + 0.05)
    },
    colorize(h, u, v) {
      const straw = strawFlecks(u, v, 113)
      const g = 92 + h * 70 + straw * 46
      return [g * 1.04, g * 0.97, g * 0.88]
    },
    normalStrength: 2.8,
  },
  // Thatch: warped vertical strands under horizontal courses, clump variation.
  thatch: {
    height(u, v) {
      const warp = fbm(u, v, 6, 2, 121)
      const strands = 0.5 + 0.5 * Math.sin((u * 44 + warp * 0.9 + fbm2(u, v, 8, 2, 2, 122) * 0.4) * Math.PI * 2)
      const course = 0.5 + 0.5 * Math.sin((v * 12 + fbm(u, v, 5, 2, 123) * 0.5) * Math.PI * 2)
      const clump = fbm2(u, v, 22, 4, 3, 124)
      return clamp01(Math.pow(strands, 1.3) * 0.5 + Math.pow(course, 2) * 0.24 + clump * 0.3)
    },
    colorize(h, u, v) {
      const strandVar = pnoise2(u, v, 44, 3, 125)
      const g = 88 + h * 74 + (strandVar - 0.5) * 36
      return [g * 1.06, g * 0.98, g * 0.72]
    },
    normalStrength: 3.2,
  },
  // Raw wood: warped vertical grain lines with fine along-length fibre.
  wood: {
    height(u, v) {
      const rings = 0.5 + 0.5 * Math.sin((u * 18 + fbm2(u, v, 4, 2, 2, 131) * 1.8) * Math.PI * 2)
      const fibre = fbm2(u, v, 90, 8, 3, 132)
      return clamp01(Math.pow(rings, 1.6) * 0.45 + fibre * 0.4 + fbm(u, v, 7, 2, 133) * 0.2)
    },
    colorize(h, u, v) {
      const streak = fbm2(u, v, 30, 4, 3, 134)
      const g = 90 + h * 72 + (streak - 0.5) * 20
      return [g * 1.08, g * 0.92, g * 0.7]
    },
    normalStrength: 2.4,
  },
  // Trodden settlement earth: soft undulation, sandy grain, pebbles, patches.
  ground: {
    height(u, v) {
      const micro = fbm(u, v, 14, 3, 141)
      const grain = fbm(u, v, 110, 2, 142)
      const pebble = Math.pow(1 - worley(u, v, 16, 143), 5)
      return clamp01(micro * 0.35 + grain * 0.3 + pebble * 0.55)
    },
    colorize(h, u, v) {
      const patch = fbm(u, v, 5, 3, 144)
      const cells = worley(u, v, 7, 145)
      const pebble = Math.pow(1 - worley(u, v, 16, 143), 5)
      const g = 95 + h * 62 + (patch - 0.5) * 30 - Math.pow(1 - cells, 3) * 18 - pebble * 22
      return [g * 1.05, g * 0.98, g * 0.86]
    },
    normalStrength: 3.0,
  },
}

// --- Bake loop -------------------------------------------------------------------

/**
 * Bakes a material definition into albedo + tangent-space normal byte arrays
 * (RGB, row-major). The normal derives from wrapped height differences, so a
 * tileable height field yields a tileable normal map.
 */
export function bakeMaterial(mat, size) {
  const heights = new Float32Array(size * size)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      heights[y * size + x] = mat.height(x / size, y / size)
    }
  }
  const albedo = new Uint8Array(size * size * 3)
  const normal = new Uint8Array(size * size * 3)
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x
      const h = heights[i]
      const [r, g, b] = mat.colorize(h, x / size, y / size)
      albedo[i * 3] = Math.max(0, Math.min(255, r))
      albedo[i * 3 + 1] = Math.max(0, Math.min(255, g))
      albedo[i * 3 + 2] = Math.max(0, Math.min(255, b))
      // Tangent-space normal from height differences (wrapping).
      const hl = heights[y * size + ((x + size - 1) % size)]
      const hr = heights[y * size + ((x + 1) % size)]
      const hu = heights[((y + size - 1) % size) * size + x]
      const hd = heights[((y + 1) % size) * size + x]
      const nx = (hl - hr) * mat.normalStrength
      const ny = (hu - hd) * mat.normalStrength
      const inv = 1 / Math.hypot(nx, ny, 1)
      normal[i * 3] = Math.round((nx * inv * 0.5 + 0.5) * 255)
      normal[i * 3 + 1] = Math.round((ny * inv * 0.5 + 0.5) * 255)
      normal[i * 3 + 2] = Math.round((inv * 0.5 + 0.5) * 255)
    }
  }
  return { albedo, normal }
}
