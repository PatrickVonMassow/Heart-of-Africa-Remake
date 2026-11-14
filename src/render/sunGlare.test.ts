// The sun glare's projection and its occlusion-gated shader (design.md §2.7).
// The rendered glare — present in the open, gone behind a building — is the
// browser suite's (enrichments --section=eye-adaptation-glare).
import { describe, expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { texture, vec4 } from 'three/tsl'
import { createSunGlare, sunScreenPosition, EDGE_FADE } from './sunGlare'
import { balance } from '../config/balance'

function camera() {
  const c = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 2000)
  c.position.set(3, 1.7, -2)
  c.lookAt(3, 1.7, -12) // looking down -Z
  return c
}

describe('sun screen position (top-left uv origin)', () => {
  it('centres a sun straight ahead at full strength', () => {
    const s = sunScreenPosition(camera(), [0, 0, -1])
    expect(s.u).toBeCloseTo(0.5, 6)
    expect(s.v).toBeCloseTo(0.5, 6)
    expect(s.fade).toBe(1)
  })

  it('puts a sun up and to the right into the upper right of the frame', () => {
    const s = sunScreenPosition(camera(), [0.15, 0.2, -1])
    expect(s.u).toBeGreaterThan(0.5)
    expect(s.v).toBeLessThan(0.5)
    expect(s.fade).toBe(1)
  })

  it('gives no glare for a sun behind the camera or outside the frame', () => {
    expect(sunScreenPosition(camera(), [0, 0, 1]).fade).toBe(0)
    expect(sunScreenPosition(camera(), [1, 0, -0.2]).fade).toBe(0)
  })

  it('fades toward the frame border', () => {
    const c = camera()
    // Just inside the top edge: half-fov 25° vertical.
    const tanTop = Math.tan(THREE.MathUtils.degToRad(25))
    const s = sunScreenPosition(c, [0, tanTop * (1 - EDGE_FADE), -1])
    expect(s.fade).toBeGreaterThan(0)
    expect(s.fade).toBeLessThan(1)
  })
})

type Builder = Record<string, unknown> & { build(): void; fragmentShader: string }

function fragmentShader(material: THREE.NodeMaterial, forceWebGL: boolean): string {
  const renderer = new THREE.WebGPURenderer({ forceWebGL }) as unknown as {
    hasFeature: () => boolean
    backend: { renderer: unknown; createNodeBuilder(o: THREE.Object3D, r: unknown): Builder }
  }
  renderer.hasFeature = () => false
  // A depth texture's WGSL sample asks the (uninitialised) backend for the
  // bound target's sample count.
  renderer.backend.renderer ??= renderer
  const builder = renderer.backend.createNodeBuilder(new THREE.Mesh(new THREE.PlaneGeometry(), material), renderer)
  Object.assign(builder, { scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() })
  builder.build()
  return builder.fragmentShader
}

describe('glare shader', () => {
  for (const [name, forceWebGL] of [['WGSL', false], ['GLSL', true]] as const) {
    it(`samples the depth at nine taps and multiplies the glare by them (${name})`, () => {
      const depthTex = new THREE.DepthTexture(4, 4)
      const glare = createSunGlare(texture(new THREE.Texture()), texture(depthTex))
      const m = new THREE.NodeMaterial()
      m.fragmentNode = vec4(glare.node, 1)
      const fs = fragmentShader(m, forceWebGL)
      // Nine sun-centred depth taps (WGSL reads depth with textureLoad), plus
      // the sun glow and the ghosts.
      const reads = fs.match(/\b(texture|textureSample|textureSampleLevel|textureLoad|texelFetch)\(\s*\w+/g) ?? []
      expect(reads.length).toBeGreaterThanOrEqual(9 + 2)
      expect(fs).toMatch(/atan/)
      glare.dispose()
    })
  }

  it('syncs the camera planes, the sun position and the balance values', () => {
    const glare = createSunGlare(texture(new THREE.Texture()), texture(new THREE.DepthTexture(4, 4)))
    const s = glare.sync(camera(), [0, 0, -1], { ...balance.sunGlare, starLength: 0.5 }, 2)
    expect(s.fade).toBe(1)
    glare.dispose()
  })
})
