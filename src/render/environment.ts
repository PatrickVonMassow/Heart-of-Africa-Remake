// Procedural HDR environment for image-based lighting (design.md §2
// "Lighting and post-processing pipeline"): a small equirectangular float
// texture with sky gradient, sun hotspot and ground bounce, consistent with
// the scene's sun direction. Used as scene.environment (IBL) — the visible
// sky is the separate scattering dome (render/sky.tsx).

import * as THREE from 'three/webgpu'

const W = 128
const H = 64

/** A new environment texture baked for `sunDirection`. Create it ONCE per scene
 *  and re-bake it with `updateEnvironmentTexture`: a NEW texture object changes
 *  the environment node, and three.js then rebuilds the node program of every
 *  lit material in the scene — measured as the periodic walking hitch, one
 *  rebuild per 0.25° latitude step of the travel sun (docs/perf-1523-findings.md). */
export function createEnvironmentTexture(sunDirection: [number, number, number]): THREE.DataTexture {
  const data = new Float32Array(W * H * 4)
  writeEnvironmentData(data, sunDirection)
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.needsUpdate = true
  return tex
}

/** Re-bake `tex` for a new sun IN PLACE: same texture object (so no material
 *  program rebuild), a fresh upload and a fresh PMREM filter of the new data. */
export function updateEnvironmentTexture(tex: THREE.DataTexture, sunDirection: [number, number, number]): void {
  writeEnvironmentData(tex.image.data as Float32Array, sunDirection)
  tex.needsUpdate = true
  tex.needsPMREMUpdate = true
}

function writeEnvironmentData(data: Float32Array, sunDirection: [number, number, number]): void {
  const sun = new THREE.Vector3(...sunDirection).normalize()
  const dir = new THREE.Vector3()

  for (let y = 0; y < H; y++) {
    // v=0 is the top row (equirect: +90° latitude).
    const phi = ((y + 0.5) / H) * Math.PI // 0..π from zenith
    for (let x = 0; x < W; x++) {
      const theta = ((x + 0.5) / W) * Math.PI * 2 - Math.PI
      dir.set(Math.sin(phi) * Math.sin(theta), Math.cos(phi), Math.sin(phi) * Math.cos(theta))
      const up = Math.max(0, dir.y)
      // Sky gradient (linear-light values).
      let r = 0.28 + up * 0.1
      let g = 0.42 + up * 0.18
      let b = 0.62 + up * 0.38
      if (dir.y < 0) {
        // Warm ground bounce below the horizon.
        const t = Math.min(1, -dir.y * 3)
        r = 0.36 - t * 0.14
        g = 0.3 - t * 0.12
        b = 0.22 - t * 0.09
      }
      // Sun hotspot (HDR values drive reflections/highlights).
      const s = Math.max(0, dir.dot(sun))
      const disc = Math.pow(s, 400) * 40
      const halo = Math.pow(s, 8) * 0.8
      r += (disc + halo) * 1.0
      g += (disc + halo) * 0.92
      b += (disc + halo) * 0.78
      const i = (y * W + x) * 4
      data[i] = r
      data[i + 1] = g
      data[i + 2] = b
      data[i + 3] = 1
    }
  }
}
