import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PerspectiveCamera, RenderPipeline, Scene, Texture, WebGPURenderer } from 'three/webgpu'
import { velocity } from 'three/tsl'
import { Effects } from './Effects'
import { createScenePass } from './scenePass'
import { useUi } from '../state/ui'

const fiber = vi.hoisted(() => ({ state: {} as Record<string, unknown>, frame: () => {} }))
vi.mock('@react-three/fiber', () => ({
  useThree: (selector: (state: Record<string, unknown>) => unknown) => selector(fiber.state),
  useFrame: (callback: () => void) => { fiber.frame = callback },
}))
vi.mock('./environment', () => ({ createEnvironmentTexture: () => new Texture() }))

const initialUi = useUi.getState()
const currentPass = () => (window as unknown as { __scenePass: ReturnType<typeof createScenePass> }).__scenePass

afterEach(() => { useUi.setState(initialUi, true) })

function mountEffects() {
  const gl = new WebGPURenderer({ forceWebGL: true })
  vi.spyOn(gl, 'render').mockImplementation(() => {})
  fiber.state = { gl, scene: new Scene(), camera: new PerspectiveCamera() }
  // All graph construction and disposal is real; jsdom cannot draw a frame.
  const renderPipeline = vi.spyOn(RenderPipeline.prototype, 'render').mockImplementation(() => {})
  const view = render(<Effects />)
  fiber.frame()
  const processing = () => {
    fiber.frame()
    return renderPipeline.mock.instances.at(-1)!
  }
  return { ...view, processing }
}

describe('post chain ownership', () => {
  it.each(['low', 'medium', 'high'] as const)('%s: toggles preserve the scene target and fragment outputs', (detailLevel) => {
    useUi.setState({ detailLevel, traaEnabled: true, ssaoEnabled: true })
    const view = mountEffects()
    const pass = currentPass()
    const target = pass.renderTarget
    const mrt = pass.getMRT()
    const textures = [...target.textures]
    const disposeScene = vi.spyOn(pass, 'dispose')
    for (const traaEnabled of [false, true, false, true, false]) {
      act(() => useUi.getState().setTraaEnabled(traaEnabled))
      expect(currentPass()).toBe(pass)
      expect(currentPass().renderTarget).toBe(target)
      expect(currentPass().getMRT()).toBe(mrt)
      expect(currentPass().renderTarget.textures).toEqual(textures)
      expect(textures.map((texture) => texture.name)).toEqual(['output', 'normal', 'velocity'])
      expect(disposeScene).not.toHaveBeenCalled()
    }
    view.unmount()
    expect(disposeScene).toHaveBeenCalledTimes(1)
    expect(currentPass()).toBeUndefined()
  })

  it('disposes each replaced post chain while preserving the scene through LOW and back', () => {
    useUi.setState({ detailLevel: 'high', traaEnabled: true, ssaoEnabled: true })
    const view = mountEffects()
    const pass = currentPass()
    const disposeScene = vi.spyOn(pass, 'dispose')
    const clearJitter = vi.spyOn(fiber.state.camera as PerspectiveCamera, 'clearViewOffset')
    const clearVelocity = vi.spyOn(velocity, 'setProjectionMatrix')
    const transitions = [
      { traaEnabled: false }, { traaEnabled: true }, { ssaoEnabled: false },
      { detailLevel: 'low' as const },
      { detailLevel: 'medium' as const }, { detailLevel: 'high' as const },
    ]
    for (const state of transitions) {
      const previous = view.processing()
      const disposePost = vi.spyOn(previous, 'dispose')
      act(() => useUi.setState(state))
      const next = view.processing()
      // Medium -> high with AO already off need not rebuild anything.
      expect(disposePost).toHaveBeenCalledTimes(next === previous ? 0 : 1)
      expect(currentPass()).toBe(pass)
      expect(disposeScene).not.toHaveBeenCalled()
    }
    expect(clearJitter).toHaveBeenCalled()
    expect(clearVelocity).toHaveBeenCalledWith(null)
    const finalPost = vi.spyOn(view.processing(), 'dispose')
    view.unmount()
    expect(finalPost).toHaveBeenCalledTimes(1)
    expect(disposeScene).toHaveBeenCalledTimes(1)
  })

  it('draws the scene before post on every frame across effect and graphics transitions', () => {
    const view = mountEffects()
    const gl = fiber.state.gl as WebGPURenderer
    const order: string[] = []
    vi.mocked(gl.render).mockImplementation((object) => {
      expect(object).toBe(fiber.state.scene)
      order.push('scene')
    })
    vi.mocked(RenderPipeline.prototype.render).mockImplementation(function (this: { outputNode: unknown }) {
      order.push('post')
      expect(order).toEqual(['scene', 'post'])
      // The real output ContextNode disables upstream automatic jitter: the
      // frame owner now brackets scene + post, including the first-ever frame.
      const output = this.outputNode as unknown as { getFlowContextData: () => Record<string, unknown> }
      expect(output.getFlowContextData().renderPipeline).toBeNull()
    })
    for (const state of [
      { traaEnabled: false }, { traaEnabled: true }, { detailLevel: 'high' as const },
      { ssaoEnabled: false }, { detailLevel: 'low' as const },
      { detailLevel: 'medium' as const }, { traaEnabled: false },
    ]) {
      act(() => useUi.setState(state))
      order.length = 0
      fiber.frame()
      expect(order).toEqual(['scene', 'post'])
    }
    view.unmount()
  })

  it('counts a committed pipeline rebuild, which is what the browser suite waits on', () => {
    const builds = () => (window as unknown as { __postBuilds?: number }).__postBuilds ?? 0
    const view = mountEffects()
    const afterMount = builds()
    expect(afterMount).toBeGreaterThan(0)
    act(() => useUi.setState({ traaEnabled: false }))
    expect(builds()).toBe(afterMount + 1)
    // A write that leaves the EFFECTIVE value alone rebuilds nothing, which is
    // why the suite only waits when the effective value changed.
    act(() => useUi.setState({ traaEnabled: false }))
    expect(builds()).toBe(afterMount + 1)
    view.unmount()
  })

  it.each(['scene', 'camera'] as const)('releases the scene pass when its %s changes', (field) => {
    const view = mountEffects()
    const previous = currentPass()
    const dispose = vi.spyOn(previous, 'dispose')
    fiber.state[field] = field === 'scene' ? new Scene() : new PerspectiveCamera()
    view.rerender(<Effects />)
    expect(currentPass()).not.toBe(previous)
    expect(dispose).toHaveBeenCalledTimes(1)
    const finalDispose = vi.spyOn(currentPass(), 'dispose')
    view.unmount()
    expect(finalDispose).toHaveBeenCalledTimes(1)
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
