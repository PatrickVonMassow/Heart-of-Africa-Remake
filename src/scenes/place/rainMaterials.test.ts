// The settlement rain materials generate on BOTH backends from one node graph
// (no backend branch), in the lit and the plain variant — code generation
// only, through three's own node builder (no GPU needed).
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { buildRainMaterials, createRainUniforms, RAIN_COUNT } from './rainMaterials'

function shaders(geometry: THREE.BufferGeometry, material: THREE.Material, forceWebGL: boolean) {
  const mesh = new THREE.InstancedMesh(geometry, material, RAIN_COUNT)
  const renderer = new THREE.WebGPURenderer({ forceWebGL }) as unknown as {
    hasFeature: () => boolean
    lighting: { getNode(s: THREE.Scene): { setLights(l: THREE.Light[]): void } }
    backend: {
      capabilities: unknown
      createNodeBuilder(o: THREE.Object3D, r: unknown): Record<string, unknown> & { build(): void }
    }
  }
  renderer.hasFeature = () => false
  // The backend is never initialised here; the instancing node asks its limit.
  renderer.backend.capabilities = { getUniformBufferLimit: () => 16384 }
  const scene = new THREE.Scene()
  const lights = renderer.lighting.getNode(scene)
  lights.setLights([])
  const builder = renderer.backend.createNodeBuilder(mesh, renderer)
  Object.assign(builder, { scene, camera: new THREE.PerspectiveCamera(), lightsNode: lights })
  builder.build()
  return { vs: builder.vertexShader as string, fs: builder.fragmentShader as string }
}

describe('settlement rain materials (design.md §19.13)', () => {
  for (const forceWebGL of [false, true]) {
    for (const lit of [false, true]) {
      it(`build on ${forceWebGL ? 'WebGL 2' : 'WebGPU'}, ${lit ? 'lit' : 'plain'} drops`, () => {
        const m = buildRainMaterials(createRainUniforms(), lit)
        const spots = m.spots
        const drop = shaders(m.dropGeometry, m.dropMaterial, forceWebGL)
        const impact = shaders(m.impactGeometry, m.impactMaterial, forceWebGL)
        for (const s of [drop, impact]) {
          expect(s.vs).toContain('rainSpot')
          expect(s.fs.length).toBeGreaterThan(0)
        }
        // drops and impacts read the SAME per-drop spot buffer
        expect(m.dropGeometry.getAttribute('rainSpot')).toBe(spots)
        expect(m.impactGeometry.getAttribute('rainSpot')).toBe(spots)
      })
    }
  }

  it('the lit variant shades more than the plain LOW streak', () => {
    const u = createRainUniforms()
    const plain = shaders(...pick(buildRainMaterials(u, false)), true)
    const lit = shaders(...pick(buildRainMaterials(u, true)), true)
    expect(lit.fs.length).toBeGreaterThan(plain.fs.length)
  })
})

function pick(m: ReturnType<typeof buildRainMaterials>): [THREE.BufferGeometry, THREE.Material] {
  return [m.dropGeometry, m.dropMaterial]
}
