// Procedural HDR environment for image-based lighting (design.md §2
// "Licht- und Post-Processing-Pipeline"): a small equirectangular float
// texture with sky gradient, sun hotspot and ground bounce, consistent with
// the scene's sun direction. Used as scene.environment (IBL) — the visible
// sky is the separate scattering dome (render/sky.tsx).

import * as THREE from 'three/webgpu'

export function createEnvironmentTexture(sunDirection: [number, number, number]): THREE.DataTexture {
  const W = 128
  const H = 64
  const data = new Float32Array(W * H * 4)
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

  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat, THREE.FloatType)
  tex.mapping = THREE.EquirectangularReflectionMapping
  tex.needsUpdate = true
  return tex
}
