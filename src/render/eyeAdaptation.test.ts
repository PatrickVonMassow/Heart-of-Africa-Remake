// Code generation of the GPU eye adaptation (design.md §2.7) on both backends,
// without a GPU: the composite reads the adapted texel without a sampler, and
// the feedback pass samples the luminance target's TOP mip (the mean) and
// carries both time constants. The math itself is pinned by
// exposureControl.test.ts; the rendered effect by the browser suite.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { texture, vec4 } from 'three/tsl'
import { EyeAdaptationNode, LUM_SIZE, LUM_TOP_LEVEL } from './eyeAdaptation'
import { balance } from '../config/balance'

type Builder = Record<string, unknown> & { build(): void; fragmentShader: string }

function fragmentShader(material: THREE.NodeMaterial, forceWebGL: boolean): string {
  const renderer = new THREE.WebGPURenderer({ forceWebGL }) as unknown as {
    hasFeature: () => boolean
    backend: { createNodeBuilder(o: THREE.Object3D, r: unknown): Builder }
  }
  renderer.hasFeature = () => false
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(), material)
  const builder = renderer.backend.createNodeBuilder(mesh, renderer)
  Object.assign(builder, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() })
  builder.build()
  return builder.fragmentShader
}

describe('eye adaptation shaders', () => {
  it('measures the mean at the 1-texel top of the luminance mip chain', () => {
    expect(2 ** LUM_TOP_LEVEL).toBe(LUM_SIZE)
  })

  for (const [name, forceWebGL] of [['WGSL', false], ['GLSL', true]] as const) {
    it(`builds the composite and the feedback pass (${name})`, () => {
      const node = new EyeAdaptationNode(texture(new THREE.Texture()) as never)
      const composite = new THREE.NodeMaterial()
      composite.fragmentNode = vec4(node as never, 0, 0, 1)
      const outer = fragmentShader(composite, forceWebGL)
      expect(outer).toMatch(forceWebGL ? /texelFetch/ : /textureLoad/)

      const feedback = (node as unknown as { material: THREE.NodeMaterial }).material
      expect(feedback.fragmentNode).toBeTruthy()
      const inner = fragmentShader(feedback, forceWebGL)
      // The mean is read at an explicit level of the luminance target...
      expect(inner).toMatch(forceWebGL ? /textureLod\(/ : /textureSampleLevel\(/)
      // ...the previous exposure without a sampler, and the step is exponential.
      expect(inner).toMatch(forceWebGL ? /texelFetch/ : /textureLoad/)
      expect(inner).toMatch(/exp\(/)
      expect(inner).toMatch(/log\(/)
      node.dispose()
    })
  }

  it('syncs the live balance values into its uniforms', () => {
    const node = new EyeAdaptationNode(texture(new THREE.Texture()) as never)
    node.sync({ ...balance.exposure, toDarkSeconds: 9 }, 0.016, 1.05)
    expect(node.params.toDark.value).toBe(9)
    expect(node.params.base.value).toBe(balance.exposure.base)
    expect(node.dt.value).toBeCloseTo(0.016)
    node.sync(balance.exposure, NaN, 1.05)
    expect(node.dt.value).toBe(0)
    node.dispose()
  })
})
