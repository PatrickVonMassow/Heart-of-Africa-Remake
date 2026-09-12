import { describe, expect, it, vi } from 'vitest'
import { Matrix4, NodeFrame, PerspectiveCamera, RenderPipeline, Scene, WebGPURenderer } from 'three/webgpu'
import { float, velocity } from 'three/tsl'
import { traa } from 'three/addons/tsl/display/TRAANode.js'
import { createScenePass } from './scenePass'
import { createSceneFrame } from './sceneFrame'

function fixture() {
  // Real renderer state/targets, PassNode, TRAA and RenderPipeline; only the
  // GPU draw boundary is replaced. No canvas context or browser is started.
  const renderer = new WebGPURenderer({ forceWebGL: true })
  renderer.setSize(640, 400)
  const camera = new PerspectiveCamera(50, 1.6, 0.1, 2000)
  const scene = new Scene()
  const pass = createScenePass(scene, camera)
  const owner = createSceneFrame(pass, renderer)
  const post = new RenderPipeline(renderer)
  post.outputNode = pass.getTextureNode()
  const makeTemporal = () => owner.bindTemporal(traa(
    pass.getTextureNode().mul(float(1)), pass.getTextureNode('depth'), pass.getTextureNode('velocity'), camera,
  ))
  const draw = vi.spyOn(renderer, 'render')
  return { renderer, camera, scene, pass, owner, post, makeTemporal, draw }
}

describe('scene frame ownership', () => {
  it('draws the scene once before post, even when nested consumers request the pass again', () => {
    const { renderer, camera, scene, pass, owner, post, makeTemporal, draw } = fixture()
    const deferred = new NodeFrame()
    deferred.renderer = renderer
    const order: string[] = []
    const sceneProjection: Matrix4[] = []
    draw.mockImplementation((object) => {
      if (object === scene) {
        order.push('scene')
        expect(renderer.getRenderTarget()).toBe(pass.renderTarget)
        expect(renderer.getMRT()).toBe(pass.getMRT())
        sceneProjection.push(velocity.projectionMatrix!)
      } else {
        order.push('post')
        // The real NodeFrame scheduler must ignore the pass from every lazy
        // consumer, not merely deduplicate repeated calls in the same frame.
        for (let i = 0; i < 3; i++) {
          deferred.frameId++
          deferred.renderId++
          deferred.updateBeforeNode(pass)
        }
      }
    })
    for (const enabled of [true, false, true, false]) {
      const temporal = enabled ? makeTemporal() : null
      // Exercise a changed projection between rebuilds. An old TRAA matrix
      // retained in a velocity uniform must not freeze the off/rebuilt camera.
      camera.fov += 5
      camera.updateProjectionMatrix()
      const unjittered = camera.projectionMatrix.clone()
      owner.render(post, temporal)
      expect(sceneProjection.at(-1)!.equals(unjittered)).toBe(true)
      expect(camera.projectionMatrix.equals(unjittered)).toBe(true)
      expect(camera.view?.enabled ?? false).toBe(false)
      expect(velocity.projectionMatrix).toBeNull()
      expect(renderer.getRenderTarget()).toBeNull()
      expect(renderer.getMRT()).toBeNull()
      temporal?.dispose()
    }
    expect(order).toEqual(['scene', 'post', 'scene', 'post', 'scene', 'post', 'scene', 'post'])
    expect(new Set(sceneProjection).size).toBe(1)
    post.dispose()
    pass.dispose()
  })

  it('applies real TRAA jitter before the first scene draw and advances it once per frame', () => {
    const { renderer, camera, scene, pass, owner, post, makeTemporal, draw } = fixture()
    const temporal = makeTemporal()
    const setJitter = vi.spyOn(temporal, 'setViewOffset')
    const clearJitter = vi.spyOn(temporal, 'clearViewOffset')
    const original = camera.projectionMatrix.clone()
    const offsets: number[] = []
    draw.mockImplementation((object) => {
      expect(camera.view?.enabled).toBe(true)
      expect(camera.projectionMatrix.equals(original)).toBe(false)
      expect(velocity.projectionMatrix!.equals(original)).toBe(true)
      if (object === scene) offsets.push(camera.view!.offsetX)
    })
    for (const [width, height] of [[640, 400], [800, 500]]) {
      renderer.setSize(width, height)
      owner.render(post, temporal)
      expect(setJitter).toHaveBeenLastCalledWith(width, height)
      expect(pass.renderTarget.width).toBe(width)
      expect(pass.renderTarget.height).toBe(height)
      expect(camera.projectionMatrix.equals(original)).toBe(true)
    }
    expect(offsets[0]).not.toBe(offsets[1])
    expect(setJitter).toHaveBeenCalledTimes(2)
    expect(clearJitter).toHaveBeenCalledTimes(2)
    temporal.dispose()
    post.dispose()
    pass.dispose()
  })

  it.each(['scene', 'post'] as const)('clears jitter and velocity if the %s draw throws', (failsAt) => {
    const { camera, scene, pass, owner, post, makeTemporal, draw } = fixture()
    const temporal = makeTemporal()
    const original = camera.projectionMatrix.clone()
    draw.mockImplementation((object) => {
      if ((object === scene) === (failsAt === 'scene')) throw new Error('draw failed')
    })
    expect(() => owner.render(post, temporal)).toThrow('draw failed')
    expect(camera.view?.enabled).toBe(false)
    expect(camera.projectionMatrix.equals(original)).toBe(true)
    expect(velocity.projectionMatrix).toBeNull()
    temporal.dispose()
    post.dispose()
    pass.dispose()
  })
})
