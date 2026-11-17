// The settlement rain materials generate on BOTH backends from one node graph
// (no backend branch), in the lit and the plain variant — code generation
// only, through three's own node builder (no GPU needed).
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { buildRainMaterials, createRainUniforms, RAIN_COUNT, RAIN_FALL_SPEED, RAIN_RADIUS } from './rainMaterials'
import { BASE_FALL_SPEED, BASE_LAYER_RADIUS_M, rainLayerSpecs, streakEndFade } from './rainLayers'
import { balance } from '../../config/balance'

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

  it('the single layer is the earlier curtain (rainLayers.ts mirrors these constants)', () => {
    expect(BASE_LAYER_RADIUS_M).toBe(RAIN_RADIUS)
    expect(BASE_FALL_SPEED).toBe(RAIN_FALL_SPEED)
  })

  // A reversed smoothstep (edge0 >= edge1) is undefined in GLSL: every call with
  // literal edges in the generated code must have them ordered, and the
  // streak's soft tail must be the ordered 1 − smoothstep(1 − tailSoft, 1, t)
  // that rainLayers.ts streakEndFade mirrors.
  for (const forceWebGL of [false, true]) {
    it(`every literal smoothstep pair is ordered on ${forceWebGL ? 'WebGL 2' : 'WebGPU'}`, () => {
      const D = balance.rainDepth
      const num = String.raw`(-?\d+(?:\.\d+)?(?:e-?\d+)?)`
      const re = new RegExp(String.raw`smoothstep\(\s*` + num + String.raw`\s*,\s*` + num + String.raw`\s*,`, 'g')
      const pairs: [number, number][] = []
      for (const layers of [1, 3]) {
        for (const lit of [false, true]) {
          const m = buildRainMaterials(createRainUniforms(), lit, RAIN_COUNT, rainLayerSpecs(layers))
          for (const sh of [shaders(m.dropGeometry, m.dropMaterial, forceWebGL), shaders(m.impactGeometry, m.impactMaterial, forceWebGL)]) {
            for (const src of [sh.vs, sh.fs]) for (const x of src.matchAll(re)) pairs.push([Number(x[1]), Number(x[2])])
          }
        }
      }
      expect(pairs.length).toBeGreaterThan(0)
      for (const [a, b] of pairs) expect(a).toBeLessThan(b)
      // The tail's ordered pair is in the code ...
      expect(pairs.some(([a, b]) => Math.abs(a - (1 - D.tailSoft)) < 1e-6 && b === 1)).toBe(true)
      // ... and the CPU mirror is that ordered form.
      const ss = (e0: number, e1: number, x: number) => {
        const c = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
        return c * c * (3 - 2 * c)
      }
      for (const t of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]) {
        expect(streakEndFade(t, D.headSoft, D.tailSoft)).toBeCloseTo(ss(0, D.headSoft, t) * (1 - ss(1 - D.tailSoft, 1, t)), 12)
      }
    })
  }

  for (const forceWebGL of [false, true]) {
    for (const layers of [2, 3]) {
      it(`the ${layers}-layer rain builds on ${forceWebGL ? 'WebGL 2' : 'WebGPU'} from the same node graph`, () => {
        const m = buildRainMaterials(createRainUniforms(), true, RAIN_COUNT, rainLayerSpecs(layers))
        const drop = shaders(m.dropGeometry, m.dropMaterial, forceWebGL)
        const impact = shaders(m.impactGeometry, m.impactMaterial, forceWebGL)
        for (const s of [drop, impact]) {
          expect(s.vs).toContain('rainSpot')
          expect(s.fs.length).toBeGreaterThan(0)
        }
      })
    }
  }
})

function pick(m: ReturnType<typeof buildRainMaterials>): [THREE.BufferGeometry, THREE.Material] {
  return [m.dropGeometry, m.dropMaterial]
}
